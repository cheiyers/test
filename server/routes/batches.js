'use strict';

const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { readExcelBuffer, pickField, buildMatchKey, toNumber } = require('../excel');
const { requireRoles } = require('../auth');
const { saveMappingRule } = require('./bom');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function batchRoutes(db) {
  const router = express.Router();
  const canImport = requireRoles('importer', 'admin');

  router.get('/', (req, res) => {
    const items = db.prepare(`
      SELECT b.*,
        (SELECT COUNT(*) FROM master_order_lines m WHERE m.batch_id = b.id) AS master_count,
        (SELECT COUNT(*) FROM accessory_order_lines a WHERE a.batch_id = b.id) AS accessory_count,
        (SELECT COUNT(*) FROM master_order_lines m WHERE m.batch_id = b.id AND m.match_status = 'success') AS master_ok,
        (SELECT COUNT(*) FROM master_order_lines m WHERE m.batch_id = b.id AND m.match_status = 'failed') AS master_fail,
        bf.name AS bom_name,
        bf.version_label AS bom_version
      FROM import_batches b
      LEFT JOIN bom_files bf ON bf.id = b.selected_bom_id
      ORDER BY b.created_at DESC
    `).all();
    res.json({ items });
  });

  router.get('/:id', (req, res) => {
    const batch = db.prepare(`
      SELECT b.*, bf.name AS bom_name, bf.version_label AS bom_version, bf.mother_part_no AS bom_mother
      FROM import_batches b
      LEFT JOIN bom_files bf ON bf.id = b.selected_bom_id
      WHERE b.id = ?
    `).get(req.params.id);
    if (!batch) return res.status(404).json({ error: '批次不存在' });

    const masters = db.prepare(`
      SELECT * FROM master_order_lines WHERE batch_id = ? ORDER BY line_no
    `).all(batch.id);
    const accessories = db.prepare(`
      SELECT * FROM accessory_order_lines WHERE batch_id = ? ORDER BY line_no
    `).all(batch.id);

    res.json({
      ...batch,
      match_fields: JSON.parse(batch.match_fields_json || '[]'),
      masters: masters.map((m) => ({ ...m, raw: JSON.parse(m.raw_json) })),
      accessories: accessories.map((a) => ({ ...a, raw: JSON.parse(a.raw_json) }))
    });
  });

  router.post('/preview', canImport, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: '请上传 Excel 文件' });
    try {
      const parsed = readExcelBuffer(req.file.buffer);
      res.json({
        filename: req.file.originalname,
        headers: parsed.headers,
        preview_rows: parsed.rows.slice(0, 20).map((r) => r.data),
        total_rows: parsed.rows.length
      });
    } catch (e) {
      res.status(400).json({ error: 'Excel 解析失败：' + e.message });
    }
  });

  router.post('/create', canImport, upload.fields([
    { name: 'master_file', maxCount: 1 },
    { name: 'accessory_file', maxCount: 1 }
  ]), (req, res) => {
    const masterFile = req.files?.master_file?.[0];
    const accessoryFile = req.files?.accessory_file?.[0];
    if (!masterFile || !accessoryFile) {
      return res.status(400).json({ error: '请同时上传总包订单与配件订单' });
    }

    let masterMapping;
    let accessoryMapping;
    try {
      masterMapping = JSON.parse(req.body.master_mapping || '{}');
      accessoryMapping = JSON.parse(req.body.accessory_mapping || '{}');
    } catch {
      return res.status(400).json({ error: '映射配置无效' });
    }

    if (!masterMapping.order_no || !masterMapping.mother_part_no) {
      return res.status(400).json({ error: '总包订单需映射订单号与母件料号列' });
    }
    if (!accessoryMapping.order_no || !accessoryMapping.part_no) {
      return res.status(400).json({ error: '配件订单需映射订单号与子件料号列' });
    }

    const name = (req.body.name || '').trim() || `订单批次-${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;

    try {
      const masterParsed = readExcelBuffer(masterFile.buffer);
      const accessoryParsed = readExcelBuffer(accessoryFile.buffer);
      if (!masterParsed.rows.length) return res.status(400).json({ error: '总包订单无有效数据' });
      if (!accessoryParsed.rows.length) return res.status(400).json({ error: '配件订单无有效数据' });

      const mothers = [...new Set(masterParsed.rows.map((r) => pickField(r.data, masterMapping.mother_part_no)).filter(Boolean))];
      const batchId = uuidv4();

      const tx = db.transaction(() => {
        db.prepare(`
          INSERT INTO import_batches
            (id, name, status, master_filename, accessory_filename, mother_part_no, created_by)
          VALUES (?, ?, 'draft', ?, ?, ?, ?)
        `).run(
          batchId,
          name,
          masterFile.originalname,
          accessoryFile.originalname,
          mothers.length === 1 ? mothers[0] : mothers.join(','),
          req.user.id
        );

        const insertMaster = db.prepare(`
          INSERT INTO master_order_lines
            (id, batch_id, line_no, order_no, mother_part_no, raw_json)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const row of masterParsed.rows) {
          const orderNo = pickField(row.data, masterMapping.order_no);
          const mother = pickField(row.data, masterMapping.mother_part_no);
          if (!orderNo) continue;
          insertMaster.run(uuidv4(), batchId, row.lineNo, orderNo, mother, JSON.stringify(row.data));
        }

        const insertAcc = db.prepare(`
          INSERT INTO accessory_order_lines
            (id, batch_id, line_no, order_no, part_no, qty, raw_json)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        for (const row of accessoryParsed.rows) {
          const orderNo = pickField(row.data, accessoryMapping.order_no);
          const partNo = pickField(row.data, accessoryMapping.part_no);
          if (!orderNo) continue;
          const qty = toNumber(pickField(row.data, accessoryMapping.qty), 1);
          insertAcc.run(uuidv4(), batchId, row.lineNo, orderNo, partNo || '', qty, JSON.stringify(row.data));
        }

        // stash mappings on batch via temporary approach: store in match_fields later; save rules now
        db.prepare(`
          UPDATE import_batches SET master_mapping_id = ?, accessory_mapping_id = ? WHERE id = ?
        `).run(
          masterMapping.save_rule ? saveMappingRule(db, {
            name: masterMapping.rule_name || `总包映射-${name}`,
            file_type: 'master_order',
            mapping: masterMapping,
            match_fields: [],
            is_default: !!masterMapping.set_default
          }) : null,
          accessoryMapping.save_rule ? saveMappingRule(db, {
            name: accessoryMapping.rule_name || `配件映射-${name}`,
            file_type: 'accessory_order',
            mapping: accessoryMapping,
            match_fields: accessoryMapping.match_fields || [accessoryMapping.part_no],
            is_default: !!accessoryMapping.set_default
          }) : null,
          batchId
        );

        // store mapping field names for associate step
        db.prepare(`
          UPDATE import_batches SET match_fields_json = ? WHERE id = ?
        `).run(JSON.stringify({
          master: masterMapping,
          accessory: accessoryMapping
        }), batchId);
      });
      tx();

      const masterCount = db.prepare('SELECT COUNT(*) AS c FROM master_order_lines WHERE batch_id = ?').get(batchId).c;
      const accCount = db.prepare('SELECT COUNT(*) AS c FROM accessory_order_lines WHERE batch_id = ?').get(batchId).c;

      // candidate BOMs by mother parts
      const candidates = [];
      for (const m of mothers) {
        const boms = db.prepare(`
          SELECT id, name, mother_part_no, version_label, created_at,
            (SELECT COUNT(*) FROM bom_lines l WHERE l.bom_id = bom_files.id) AS line_count
          FROM bom_files
          WHERE mother_part_no = ?
          ORDER BY created_at DESC
        `).all(m);
        candidates.push({ mother_part_no: m, boms });
      }

      res.json({
        id: batchId,
        name,
        master_count: masterCount,
        accessory_count: accCount,
        mother_part_nos: mothers,
        bom_candidates: candidates
      });
    } catch (e) {
      res.status(400).json({ error: '创建批次失败：' + e.message });
    }
  });

  router.post('/:id/associate', canImport, (req, res) => {
    const batch = db.prepare('SELECT * FROM import_batches WHERE id = ?').get(req.params.id);
    if (!batch) return res.status(404).json({ error: '批次不存在' });

    const { bom_id, match_fields } = req.body || {};
    if (!bom_id) return res.status(400).json({ error: '请选择 BOM 版本' });

    const bom = db.prepare('SELECT * FROM bom_files WHERE id = ?').get(bom_id);
    if (!bom) return res.status(404).json({ error: 'BOM 不存在' });

    const mappingBag = JSON.parse(batch.match_fields_json || '{}');
    const accessoryMapping = mappingBag.accessory || {};
    const fields = Array.isArray(match_fields) && match_fields.length
      ? match_fields
      : (JSON.parse(bom.match_fields_json || '[]').length
        ? JSON.parse(bom.match_fields_json)
        : [accessoryMapping.part_no || '料号'].filter(Boolean));

    const bomLines = db.prepare('SELECT * FROM bom_lines WHERE bom_id = ?').all(bom.id);
    const masters = db.prepare('SELECT * FROM master_order_lines WHERE batch_id = ?').all(batch.id);
    const accessories = db.prepare('SELECT * FROM accessory_order_lines WHERE batch_id = ?').all(batch.id);

    // Build BOM key -> { qty sum, lines[] }
    const bomMap = new Map();
    for (const bl of bomLines) {
      const raw = JSON.parse(bl.raw_json);
      const key = buildMatchKey(raw, fields);
      if (!bomMap.has(key)) bomMap.set(key, { qty: 0, lines: [] });
      const entry = bomMap.get(key);
      entry.qty += Number(bl.qty) || 0;
      entry.lines.push(bl);
    }

    const result = {
      master_success: 0,
      master_failed: 0,
      accessory_success: 0,
      accessory_failed: 0,
      details: []
    };

    const tx = db.transaction(() => {
      // reset
      db.prepare(`
        UPDATE accessory_order_lines
        SET master_line_id = NULL, bom_line_id = NULL, match_status = 'pending', match_message = NULL
        WHERE batch_id = ?
      `).run(batch.id);
      db.prepare(`
        UPDATE master_order_lines
        SET match_status = 'pending', match_message = NULL
        WHERE batch_id = ?
      `).run(batch.id);

      const updateMaster = db.prepare(`
        UPDATE master_order_lines SET match_status = ?, match_message = ? WHERE id = ?
      `);
      const updateAcc = db.prepare(`
        UPDATE accessory_order_lines
        SET master_line_id = ?, bom_line_id = ?, match_status = ?, match_message = ?
        WHERE id = ?
      `);

      for (const master of masters) {
        if (master.mother_part_no !== bom.mother_part_no) {
          updateMaster.run('failed', `母件料号 ${master.mother_part_no} 与所选 BOM(${bom.mother_part_no}) 不一致`, master.id);
          result.master_failed += 1;
          continue;
        }

        const relatedAcc = accessories.filter((a) => a.order_no === master.order_no);
        if (!relatedAcc.length) {
          updateMaster.run('failed', '未找到同订单号的配件订单行', master.id);
          result.master_failed += 1;
          continue;
        }

        // Group accessories by match key for this order
        const accGroups = new Map();
        for (const a of relatedAcc) {
          const raw = JSON.parse(a.raw_json);
          const key = buildMatchKey(raw, fields);
          if (!accGroups.has(key)) accGroups.set(key, []);
          accGroups.get(key).push(a);
        }

        let masterOk = true;
        const messages = [];

        // Every BOM key must be matched by accessory qty equality
        for (const [key, bomEntry] of bomMap.entries()) {
          const group = accGroups.get(key) || [];
          const sumQty = group.reduce((s, x) => s + (Number(x.qty) || 0), 0);
          if (!group.length) {
            masterOk = false;
            messages.push(`缺少子件匹配键[${key}]`);
            continue;
          }
          if (sumQty !== bomEntry.qty) {
            masterOk = false;
            messages.push(`子件[${key}]数量不符：订单${sumQty} ≠ BOM${bomEntry.qty}`);
            for (const a of group) {
              updateAcc.run(master.id, bomEntry.lines[0].id, 'failed', `数量不符：订单行数量合计需等于 BOM ${bomEntry.qty}`, a.id);
              result.accessory_failed += 1;
            }
          } else {
            for (const a of group) {
              updateAcc.run(master.id, bomEntry.lines[0].id, 'success', '匹配成功', a.id);
              result.accessory_success += 1;
            }
          }
        }

        // Accessory lines whose key not in BOM
        for (const [key, group] of accGroups.entries()) {
          if (!bomMap.has(key)) {
            masterOk = false;
            messages.push(`配件多余或不匹配：[${key}]`);
            for (const a of group) {
              updateAcc.run(master.id, null, 'failed', '在 BOM 中找不到对应匹配键', a.id);
              result.accessory_failed += 1;
            }
          }
        }

        // Also mark accessories that weren't in relatedAcc - already handled per master

        if (masterOk) {
          updateMaster.run('success', '关联成功', master.id);
          result.master_success += 1;
        } else {
          updateMaster.run('failed', messages.join('；'), master.id);
          result.master_failed += 1;
          const demoted = db.prepare(`
            UPDATE accessory_order_lines
            SET match_status = 'failed',
                match_message = TRIM(COALESCE(match_message, '') || '；总包整体未通过', '；')
            WHERE master_line_id = ? AND match_status = 'success'
          `).run(master.id);
          result.accessory_success -= demoted.changes;
          result.accessory_failed += demoted.changes;
        }
        result.details.push({
          master_id: master.id,
          order_no: master.order_no,
          ok: masterOk,
          message: messages.join('；') || 'OK'
        });
      }

      // Accessories with order_no not in any master
      const masterOrderNos = new Set(masters.map((m) => m.order_no));
      for (const a of accessories) {
        if (!masterOrderNos.has(a.order_no)) {
          db.prepare(`
            UPDATE accessory_order_lines
            SET match_status = 'unmatched', match_message = '订单号在总包订单中不存在'
            WHERE id = ?
          `).run(a.id);
          result.accessory_failed += 1;
        }
      }

      db.prepare(`
        UPDATE import_batches
        SET status = 'associated', selected_bom_id = ?, mother_part_no = ?, match_fields_json = ?, associated_at = datetime('now','localtime')
        WHERE id = ?
      `).run(
        bom.id,
        bom.mother_part_no,
        JSON.stringify({
          ...mappingBag,
          associate_match_fields: fields
        }),
        batch.id
      );
    });
    tx();

    res.json({ ok: true, result });
  });

  router.delete('/:id', canImport, (req, res) => {
    const batch = db.prepare('SELECT id FROM import_batches WHERE id = ?').get(req.params.id);
    if (!batch) return res.status(404).json({ error: '批次不存在' });
    db.prepare('DELETE FROM import_batches WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  return router;
}

module.exports = { batchRoutes };
