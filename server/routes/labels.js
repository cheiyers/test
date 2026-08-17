'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireRoles } = require('../auth');
const { buildPrintCode, templateIncludesScanId } = require('../expr');

function assertBatchPrintTemplate(row, kind) {
  if (!row) return null;
  const tpl = formatTpl(row);
  if (!templateIncludesScanId(tpl)) {
    const err = new Error(
      `${kind}模板「${tpl.name}」的条码/二维码未包含系统唯一码，不能用于订单批次打印。请改选含唯一码的模板，或在模板中加入唯一码字段。`
    );
    err.status = 400;
    throw err;
  }
  return tpl;
}

function shortCode(prefix) {
  return `${prefix}${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function labelRoutes(db) {
  const router = express.Router();
  const canImport = requireRoles('importer', 'admin');

  router.post('/generate', canImport, (req, res) => {
    const { batch_id, master_template_id, child_template_id, only_success = true } = req.body || {};
    if (!batch_id) return res.status(400).json({ error: '缺少 batch_id' });

    const batch = db.prepare('SELECT * FROM import_batches WHERE id = ?').get(batch_id);
    if (!batch) return res.status(404).json({ error: '批次不存在' });
    if (batch.status === 'draft') {
      return res.status(400).json({ error: '请先完成 BOM 关联' });
    }

    const masterTpl = master_template_id
      ? db.prepare('SELECT * FROM label_templates WHERE id = ? AND label_type = ?').get(master_template_id, 'master')
      : db.prepare('SELECT * FROM label_templates WHERE label_type = ? ORDER BY updated_at DESC LIMIT 1').get('master');
    const childTpl = child_template_id
      ? db.prepare('SELECT * FROM label_templates WHERE id = ? AND label_type = ?').get(child_template_id, 'child')
      : db.prepare('SELECT * FROM label_templates WHERE label_type = ? ORDER BY updated_at DESC LIMIT 1').get('child');

    if (!masterTpl || !childTpl) {
      return res.status(400).json({ error: '请先创建总包与子件标签模板' });
    }
    try {
      assertBatchPrintTemplate(masterTpl, '总包');
      assertBatchPrintTemplate(childTpl, '配件');
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }

    const masters = db.prepare(`
      SELECT * FROM master_order_lines WHERE batch_id = ?
      ${only_success ? "AND match_status = 'success'" : ''}
      ORDER BY line_no
    `).all(batch_id);

    let masterCreated = 0;
    let childCreated = 0;
    let skipped = 0;

    const tx = db.transaction(() => {
      const updateMaster = db.prepare(`
        UPDATE master_order_lines SET package_code = ?, label_generated = 1 WHERE id = ?
      `);
      const updateAcc = db.prepare(`
        UPDATE accessory_order_lines SET child_code = ?, label_generated = 1 WHERE id = ?
      `);
      const insertPkg = db.prepare(`
        INSERT INTO packages (id, batch_id, master_line_id, order_no, package_code, status)
        VALUES (?, ?, ?, ?, ?, 'unscanned')
      `);
      const insertChild = db.prepare(`
        INSERT INTO package_children (id, package_id, accessory_line_id, child_code)
        VALUES (?, ?, ?, ?)
      `);

      for (const master of masters) {
        if (master.match_status !== 'success') {
          skipped += 1;
          continue;
        }

        // remove old package if regenerating
        const oldPkg = db.prepare('SELECT id FROM packages WHERE master_line_id = ?').get(master.id);
        if (oldPkg) {
          db.prepare('DELETE FROM packages WHERE id = ?').run(oldPkg.id);
        }

        // 扫码主键永远是系统唯一码；打印载荷按模板拼接（可含唯一码）
        let packageCode = master.package_code || shortCode('M');
        let tryCode = packageCode;
        let n = 1;
        while (db.prepare('SELECT id FROM packages WHERE package_code = ?').get(tryCode) ||
               db.prepare('SELECT id FROM master_order_lines WHERE package_code = ? AND id != ?').get(tryCode, master.id)) {
          tryCode = `${packageCode}-${n++}`;
        }
        packageCode = tryCode;

        const pkgId = uuidv4();
        updateMaster.run(packageCode, master.id);
        insertPkg.run(pkgId, batch_id, master.id, master.order_no, packageCode);
        masterCreated += 1;

        const children = db.prepare(`
          SELECT * FROM accessory_order_lines
          WHERE master_line_id = ? AND match_status = 'success'
          ORDER BY line_no
        `).all(master.id);

        for (const child of children) {
          let childCode = child.child_code || shortCode('C');
          let cTry = childCode;
          let cn = 1;
          while (db.prepare('SELECT id FROM package_children WHERE child_code = ?').get(cTry) ||
                 db.prepare('SELECT id FROM accessory_order_lines WHERE child_code = ? AND id != ?').get(cTry, child.id)) {
            cTry = `${childCode}-${cn++}`;
          }
          childCode = cTry;
          updateAcc.run(childCode, child.id);
          insertChild.run(uuidv4(), pkgId, child.id, childCode);
          childCreated += 1;
        }
      }

      db.prepare(`UPDATE import_batches SET status = 'labelled' WHERE id = ?`).run(batch_id);
    });
    tx();

    res.json({
      ok: true,
      master_created: masterCreated,
      child_created: childCreated,
      skipped,
      master_template_id: masterTpl.id,
      child_template_id: childTpl.id
    });
  });

  router.get('/print-data', canImport, (req, res) => {
    const { batch_id, master_template_id, child_template_id, label_type } = req.query;
    if (!batch_id) return res.status(400).json({ error: '缺少 batch_id' });
    const want = String(label_type || 'all').toLowerCase(); // all | master | child

    const masterTpl = master_template_id
      ? db.prepare('SELECT * FROM label_templates WHERE id = ?').get(master_template_id)
      : db.prepare('SELECT * FROM label_templates WHERE label_type = ? ORDER BY updated_at DESC LIMIT 1').get('master');
    const childTpl = child_template_id
      ? db.prepare('SELECT * FROM label_templates WHERE id = ?').get(child_template_id)
      : db.prepare('SELECT * FROM label_templates WHERE label_type = ? ORDER BY updated_at DESC LIMIT 1').get('child');

    if ((want === 'all' || want === 'master') && !masterTpl) {
      return res.status(400).json({ error: '未找到总包标签模板' });
    }
    if ((want === 'all' || want === 'master') && masterTpl) {
      try { assertBatchPrintTemplate(masterTpl, '总包'); }
      catch (err) { return res.status(err.status || 400).json({ error: err.message }); }
    }
    if ((want === 'all' || want === 'child') && !childTpl) {
      return res.status(400).json({ error: '未找到配件标签模板' });
    }
    if ((want === 'all' || want === 'child') && childTpl) {
      try { assertBatchPrintTemplate(childTpl, '配件'); }
      catch (err) { return res.status(err.status || 400).json({ error: err.message }); }
    }

    const packages = db.prepare(`
      SELECT p.*, m.raw_json AS master_raw, m.mother_part_no, m.line_no AS master_line_no
      FROM packages p
      JOIN master_order_lines m ON m.id = p.master_line_id
      WHERE p.batch_id = ?
      ORDER BY m.line_no
    `).all(batch_id);

    const labels = [];
    let serialIndex = 0;
    for (const pkg of packages) {
      const masterRaw = JSON.parse(pkg.master_raw);
      const masterData = {
        ...masterRaw,
        order_no: pkg.order_no,
        mother_part_no: pkg.mother_part_no,
        package_code: pkg.package_code
      };

      if (want === 'all' || want === 'master') {
        const masterTplFmt = formatTpl(masterTpl);
        const dataWithSerial = { ...masterData, __serial_index: serialIndex };
        const masterPrintCode = buildPrintCode(masterTplFmt, dataWithSerial, pkg.package_code, 'master');
        labels.push({
          type: 'master',
          code: masterPrintCode,
          scan_id: pkg.package_code,
          order_no: pkg.order_no,
          data: dataWithSerial,
          template: masterTplFmt
        });
        serialIndex += 1;
      }

      if (want === 'all' || want === 'child') {
        const children = db.prepare(`
          SELECT pc.*, a.raw_json, a.part_no, a.qty, a.line_no
          FROM package_children pc
          JOIN accessory_order_lines a ON a.id = pc.accessory_line_id
          WHERE pc.package_id = ?
          ORDER BY a.line_no
        `).all(pkg.id);

        for (const ch of children) {
          const raw = JSON.parse(ch.raw_json);
          const childData = {
            ...raw,
            order_no: pkg.order_no,
            part_no: ch.part_no,
            qty: ch.qty,
            child_code: ch.child_code,
            package_code: pkg.package_code,
            __serial_index: serialIndex
          };
          const childTplFmt = formatTpl(childTpl);
          const childPrintCode = buildPrintCode(childTplFmt, childData, ch.child_code, 'child');
          labels.push({
            type: 'child',
            code: childPrintCode,
            scan_id: ch.child_code,
            order_no: pkg.order_no,
            data: childData,
            template: childTplFmt
          });
          serialIndex += 1;
        }
      }
    }

    res.json({ labels, count: labels.length, label_type: want });
  });

  /** 无订单/BOM 时：按模板 + 人工填写字段生成可打印标签 */
  router.post('/manual-preview', canImport, (req, res) => {
    const body = req.body || {};
    const templateId = body.template_id;
    if (!templateId) return res.status(400).json({ error: '请选择标签模板' });
    const row = db.prepare('SELECT * FROM label_templates WHERE id = ?').get(templateId);
    if (!row) return res.status(404).json({ error: '模板不存在' });

    const tpl = formatTpl(row);
    const data = { ...(body.data && typeof body.data === 'object' ? body.data : {}) };
    const copies = Math.max(1, Math.min(200, Number(body.copies) || 1));
    const scanId = String(body.scan_id || body.code || '').trim() || shortCode(tpl.label_type === 'child' ? 'C' : 'M');

    if (tpl.label_type === 'child') {
      if (!data.child_code) data.child_code = scanId;
    } else if (!data.package_code) {
      data.package_code = scanId;
    }

    const labels = [];
    for (let i = 0; i < copies; i++) {
      const dataWithSerial = { ...data, __serial_index: i };
      let copyCode = String(body.code || '').trim();
      if (!copyCode) {
        try {
          copyCode = buildPrintCode(tpl, dataWithSerial, scanId, tpl.label_type);
        } catch {
          copyCode = scanId;
        }
      }
      labels.push({
        type: tpl.label_type,
        code: copyCode,
        scan_id: scanId,
        order_no: data.order_no || '',
        data: dataWithSerial,
        template: tpl,
        manual: true
      });
    }

    res.json({
      labels,
      count: labels.length,
      fields: collectTemplateFields(tpl)
    });
  });

  router.get('/templates/:id/fields', canImport, (req, res) => {
    const row = db.prepare('SELECT * FROM label_templates WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: '模板不存在' });
    const tpl = formatTpl(row);
    res.json({ template: tpl, fields: collectTemplateFields(tpl) });
  });

  return router;
}

function collectTemplateFields(tpl) {
  const set = new Set();
  const add = (f) => {
    const name = String(f || '').trim();
    if (name) set.add(name);
  };
  const scanText = (text) => {
    String(text || '').replace(/\{([^}]+)\}/g, (_, n) => add(n));
  };
  const scanSegments = (segments) => {
    (segments || []).forEach((seg) => {
      if (seg && seg.type === 'field') add(seg.field);
      if (seg && seg.type === 'text') scanText(seg.value);
    });
  };

  (tpl.elements || []).forEach((el) => {
    if (!el) return;
    add(el.bind);
    scanText(el.text);
    scanSegments(el.segments);
    if (el.type === 'table') {
      (el.cells || []).forEach((cell) => {
        if (!cell) return;
        add(cell.bind);
        scanText(cell.text);
        scanSegments(cell.segments);
      });
    }
  });
  scanSegments(tpl.code_segments);
  (tpl.code_fields || []).forEach(add);

  // 常用兜底字段，方便手工填写
  ['order_no', 'mother_part_no', 'part_no', 'qty', 'package_code', 'child_code'].forEach(add);
  return [...set];
}

function formatTpl(row) {
  if (!row) return null;
  const tpl = {
    id: row.id,
    name: row.name,
    label_type: row.label_type,
    width_mm: row.width_mm,
    height_mm: row.height_mm,
    code_mode: row.code_mode,
    code_fields: JSON.parse(row.code_fields_json || '[]'),
    code_segments: JSON.parse(row.code_segments_json || '[]'),
    code_type: row.code_type,
    elements: JSON.parse(row.elements_json || '[]')
  };
  tpl.includes_scan_id = templateIncludesScanId(tpl);
  return tpl;
}

module.exports = { labelRoutes };
