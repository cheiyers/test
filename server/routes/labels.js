'use strict';

const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { requireRoles } = require('../auth');
const { buildPrintCode, templateIncludesScanId, applyFormula, FORMULA_CATALOG } = require('../expr');
const { readExcelBuffer, pickField } = require('../excel');

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

/** 一般订单：把 Excel 行 + 字段绑定（列/公式）合成标签 data */
function buildGeneralRowData(rowObj, bindings, scanId, labelType) {
  const raw = { ...(rowObj || {}) };
  const data = { ...raw };
  (bindings || []).forEach((b) => {
    const field = String(b?.field || '').trim();
    if (!field) return;
    const column = String(b.column || '').trim() || field;
    const formula = String(b.formula || '').trim();
    const src = pickField(raw, column);
    try {
      data[field] = applyFormula(src, formula, { ...data, ...raw });
    } catch {
      data[field] = src;
    }
  });
  if (labelType === 'child') {
    if (!String(data.child_code || '').trim()) data.child_code = scanId;
  } else if (!String(data.package_code || '').trim()) {
    data.package_code = scanId;
  }
  if (!String(data.order_no || '').trim()) {
    const guess = pickField(raw, 'order_no') || pickField(raw, '订单号') || pickField(raw, '订单');
    if (guess) data.order_no = guess;
  }
  return data;
}

function parseBindingsInput(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function labelRoutes(db) {
  const router = express.Router();
  const canImport = requireRoles('importer', 'admin');
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

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

    const masterTplFmt = masterTpl ? formatTpl(masterTpl) : null;
    const childTplFmt = childTpl ? formatTpl(childTpl) : null;
    const qCopies = Number(req.query.copies);
    const qMasterCopies = Number(req.query.copies_master);
    const qChildCopies = Number(req.query.copies_child);
    const masterCopies = Math.max(1, Math.min(200, Math.floor(
      Number.isFinite(qMasterCopies) && qMasterCopies >= 1
        ? qMasterCopies
        : (Number.isFinite(qCopies) && qCopies >= 1 ? qCopies : (masterTplFmt?.copies_per_label || 1))
    )));
    const childCopies = Math.max(1, Math.min(200, Math.floor(
      Number.isFinite(qChildCopies) && qChildCopies >= 1
        ? qChildCopies
        : (Number.isFinite(qCopies) && qCopies >= 1 ? qCopies : (childTplFmt?.copies_per_label || 1))
    )));
    // serial_per_copy=1（默认）：每份都递增序列号；=0：同一条码的多份共用同一序列号
    const serialPerCopy = String(req.query.serial_per_copy == null ? '1' : req.query.serial_per_copy) !== '0';

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

      if ((want === 'all' || want === 'master') && masterTplFmt) {
        const baseSerial = serialIndex;
        for (let c = 0; c < masterCopies; c++) {
          const si = serialPerCopy ? serialIndex : baseSerial;
          const dataWithSerial = {
            ...masterData,
            __serial_index: si,
            __copy_index: c,
            __copies: masterCopies
          };
          const masterPrintCode = buildPrintCode(masterTplFmt, dataWithSerial, pkg.package_code, 'master');
          labels.push({
            type: 'master',
            code: masterPrintCode,
            scan_id: pkg.package_code,
            order_no: pkg.order_no,
            data: dataWithSerial,
            template: masterTplFmt,
            copy_index: c,
            copies: masterCopies
          });
          if (serialPerCopy) serialIndex += 1;
        }
        if (!serialPerCopy) serialIndex += 1;
      }

      if ((want === 'all' || want === 'child') && childTplFmt) {
        const children = db.prepare(`
          SELECT pc.*, a.raw_json, a.part_no, a.qty, a.line_no
          FROM package_children pc
          JOIN accessory_order_lines a ON a.id = pc.accessory_line_id
          WHERE pc.package_id = ?
          ORDER BY a.line_no
        `).all(pkg.id);

        for (const ch of children) {
          const raw = JSON.parse(ch.raw_json);
          const baseSerial = serialIndex;
          for (let c = 0; c < childCopies; c++) {
            const si = serialPerCopy ? serialIndex : baseSerial;
            const childData = {
              ...raw,
              order_no: pkg.order_no,
              part_no: ch.part_no,
              qty: ch.qty,
              child_code: ch.child_code,
              package_code: pkg.package_code,
              __serial_index: si,
              __copy_index: c,
              __copies: childCopies
            };
            const childPrintCode = buildPrintCode(childTplFmt, childData, ch.child_code, 'child');
            labels.push({
              type: 'child',
              code: childPrintCode,
              scan_id: ch.child_code,
              order_no: pkg.order_no,
              data: childData,
              template: childTplFmt,
              copy_index: c,
              copies: childCopies
            });
            if (serialPerCopy) serialIndex += 1;
          }
          if (!serialPerCopy) serialIndex += 1;
        }
      }
    }

    res.json({
      labels,
      count: labels.length,
      label_type: want,
      copies_master: masterCopies,
      copies_child: childCopies,
      serial_per_copy: serialPerCopy
    });
  });

  /** 无订单/BOM 时：按模板 + 人工填写字段生成可打印标签（支持序列号从…到…） */
  router.post('/manual-preview', canImport, (req, res) => {
    const body = req.body || {};
    const templateId = body.template_id;
    if (!templateId) return res.status(400).json({ error: '请选择标签模板' });
    const row = db.prepare('SELECT * FROM label_templates WHERE id = ?').get(templateId);
    if (!row) return res.status(404).json({ error: '模板不存在' });

    const tpl = formatTpl(row);
    const data = { ...(body.data && typeof body.data === 'object' ? body.data : {}) };
    const scanId = String(body.scan_id || body.code || '').trim() || shortCode(tpl.label_type === 'child' ? 'C' : 'M');
    const serialMode = String(body.serial_mode || 'count') === 'range' ? 'range' : 'count';
    const per = Math.max(1, Math.min(200, Number(body.copies) || tpl.copies_per_label || 1));
    const serialPerCopy = body.serial_per_copy === false || body.serial_per_copy === 0 || body.serial_per_copy === '0'
      ? false
      : true;

    if (tpl.label_type === 'child') {
      if (!data.child_code) data.child_code = scanId;
    } else if (!data.package_code) {
      data.package_code = scanId;
    }

    /** @type {{ abs: number|null, index: number }[]} */
    const plan = [];
    if (serialMode === 'range') {
      const from = Number(body.serial_from);
      const to = Number(body.serial_to);
      if (!Number.isFinite(from) || !Number.isFinite(to)) {
        return res.status(400).json({ error: '请填写有效的序列号起止（从 / 到）' });
      }
      const fromN = Math.floor(from);
      const toN = Math.floor(to);
      const count = Math.abs(toN - fromN) + 1;
      if (count > 2000) return res.status(400).json({ error: '序列号范围过大（最多 2000 个序号）' });
      if (count * per > 5000) return res.status(400).json({ error: '生成标签过多（最多 5000 张）' });
      const step = fromN <= toN ? 1 : -1;
      for (let v = fromN, i = 0; i < count; i++, v += step) {
        for (let c = 0; c < per; c++) {
          plan.push({ abs: v, index: i });
        }
      }
    } else {
      // 指定张数：可选「序列号从」，有则用绝对序号，否则按模板起始+index
      const fromRaw = body.serial_from;
      const hasFrom = fromRaw != null && String(fromRaw).trim() !== '' && Number.isFinite(Number(fromRaw));
      const fromN = hasFrom ? Math.floor(Number(fromRaw)) : null;
      if (per > 2000) return res.status(400).json({ error: '打印张数过多（最多 2000 张）' });
      for (let i = 0; i < per; i++) {
        const idx = serialPerCopy ? i : 0;
        const abs = hasFrom ? (serialPerCopy ? fromN + i : fromN) : null;
        plan.push({ abs, index: idx });
      }
    }

    const labels = [];
    const total = plan.length;
    plan.forEach((slot, i) => {
      const dataWithSerial = {
        ...data,
        __serial_index: slot.index,
        __serial_abs: slot.abs,
        __copy_index: i,
        __copies: total
      };
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
        manual: true,
        copy_index: i,
        copies: total
      });
    });

    res.json({
      labels,
      count: labels.length,
      fields: collectTemplateFields(tpl),
      copies: per,
      serial_mode: serialMode,
      serial_from: body.serial_from != null ? body.serial_from : null,
      serial_to: body.serial_to != null ? body.serial_to : null,
      serial_per_copy: serialPerCopy
    });
  });

  /** 一般订单：解析 Excel 表头与样例行 */
  router.post('/general/parse', canImport, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: '请上传订单 Excel' });
    try {
      const parsed = readExcelBuffer(req.file.buffer);
      if (!parsed.headers.length) return res.status(400).json({ error: 'Excel 无表头' });
      const sample = (parsed.rows || []).slice(0, 5).map((r) => r.data);
      res.json({
        headers: parsed.headers,
        row_count: parsed.rows.length,
        sample,
        sheet_name: parsed.sheetName,
        formulas: FORMULA_CATALOG
      });
    } catch (err) {
      res.status(400).json({ error: err.message || '解析失败' });
    }
  });

  /**
   * 一般订单打印预览：
   * 选用已有标签模板，将模板中的字段位置绑定到订单 Excel 列（可加公式），按行出标签。
   */
  router.post('/general-preview', canImport, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: '请上传订单 Excel' });
    const templateId = req.body?.template_id;
    if (!templateId) return res.status(400).json({ error: '请选择标签模板' });
    const row = db.prepare('SELECT * FROM label_templates WHERE id = ?').get(templateId);
    if (!row) return res.status(404).json({ error: '模板不存在' });

    let parsed;
    try {
      parsed = readExcelBuffer(req.file.buffer);
    } catch (err) {
      return res.status(400).json({ error: err.message || '解析 Excel 失败' });
    }
    if (!parsed.rows.length) return res.status(400).json({ error: '订单表无数据行' });

    const tpl = formatTpl(row);
    const bindings = parseBindingsInput(req.body?.bindings_json || req.body?.bindings);
    const copies = Math.max(1, Math.min(200, Number(req.body?.copies) || tpl.copies_per_label || 1));
    const serialPerCopy = !(req.body?.serial_per_copy === false
      || req.body?.serial_per_copy === 0
      || req.body?.serial_per_copy === '0');
    const maxRows = Math.max(1, Math.min(2000, Number(req.body?.max_rows) || 2000));
    const rows = parsed.rows.slice(0, maxRows);

    const labels = [];
    let serialIndex = 0;
    rows.forEach((r, rowIdx) => {
      const scanId = shortCode(tpl.label_type === 'child' ? 'G' : 'G');
      const baseData = buildGeneralRowData(r.data, bindings, scanId, tpl.label_type);
      const rowScanId = String(
        tpl.label_type === 'child'
          ? (baseData.child_code || scanId)
          : (baseData.package_code || scanId)
      );
      for (let i = 0; i < copies; i++) {
        const si = serialPerCopy ? serialIndex : rowIdx;
        const dataWithSerial = {
          ...baseData,
          __serial_index: si,
          __copy_index: i,
          __copies: copies,
          __row_index: rowIdx,
          __line_no: r.lineNo
        };
        let copyCode = '';
        try {
          copyCode = buildPrintCode(tpl, dataWithSerial, rowScanId, tpl.label_type);
        } catch {
          copyCode = rowScanId;
        }
        labels.push({
          type: tpl.label_type,
          code: copyCode,
          scan_id: rowScanId,
          order_no: dataWithSerial.order_no || '',
          data: dataWithSerial,
          template: tpl,
          general: true,
          copy_index: i,
          copies,
          row_index: rowIdx
        });
        if (serialPerCopy) serialIndex += 1;
      }
      if (!serialPerCopy) serialIndex += 1;
    });

    res.json({
      labels,
      count: labels.length,
      row_count: rows.length,
      headers: parsed.headers,
      fields: collectTemplateFields(tpl),
      bindings,
      copies,
      serial_per_copy: serialPerCopy
    });
  });

  router.get('/templates/:id/fields', canImport, (req, res) => {
    const row = db.prepare('SELECT * FROM label_templates WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: '模板不存在' });
    const tpl = formatTpl(row);
    res.json({ template: tpl, fields: collectTemplateFields(tpl), formulas: FORMULA_CATALOG });
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
  const copies = Number(row.copies_per_label);
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
    copies_per_label: Number.isFinite(copies) && copies >= 1 ? Math.min(200, Math.floor(copies)) : 1,
    elements: JSON.parse(row.elements_json || '[]')
  };
  tpl.includes_scan_id = templateIncludesScanId(tpl);
  return tpl;
}

module.exports = { labelRoutes };
