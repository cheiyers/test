'use strict';

const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { readExcelBuffer, pickField, toNumber } = require('../excel');
const { requireRoles } = require('../auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function bomRoutes(db) {
  const router = express.Router();
  const canImport = requireRoles('importer', 'admin');

  router.get('/', (req, res) => {
    const { mother_part_no } = req.query;
    let rows;
    if (mother_part_no) {
      rows = db.prepare(`
        SELECT b.*, 
          (SELECT COUNT(*) FROM bom_lines l WHERE l.bom_id = b.id) AS line_count
        FROM bom_files b
        WHERE b.mother_part_no = ?
        ORDER BY b.created_at DESC
      `).all(String(mother_part_no));
    } else {
      rows = db.prepare(`
        SELECT b.*,
          (SELECT COUNT(*) FROM bom_lines l WHERE l.bom_id = b.id) AS line_count
        FROM bom_files b
        ORDER BY b.created_at DESC
      `).all();
    }
    res.json({ items: rows });
  });

  router.get('/:id', (req, res) => {
    const bom = db.prepare('SELECT * FROM bom_files WHERE id = ?').get(req.params.id);
    if (!bom) return res.status(404).json({ error: 'BOM 不存在' });
    const lines = db.prepare('SELECT * FROM bom_lines WHERE bom_id = ? ORDER BY line_no').all(bom.id);
    res.json({
      ...bom,
      columns: JSON.parse(bom.columns_json || '[]'),
      match_fields: JSON.parse(bom.match_fields_json || '[]'),
      lines: lines.map((l) => ({ ...l, raw: JSON.parse(l.raw_json) }))
    });
  });

  router.post('/preview', canImport, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: '请上传 Excel 文件' });
    try {
      const parsed = readExcelBuffer(req.file.buffer);
      const distinct_by_column = {};
      for (const h of parsed.headers) {
        const set = new Set();
        for (const row of parsed.rows) {
          const v = pickField(row.data, h);
          if (v) set.add(v);
        }
        distinct_by_column[h] = [...set].slice(0, 200);
      }
      res.json({
        filename: req.file.originalname,
        headers: parsed.headers,
        preview_rows: parsed.rows.slice(0, 30).map((r) => r.data),
        total_rows: parsed.rows.length,
        distinct_by_column
      });
    } catch (e) {
      res.status(400).json({ error: 'Excel 解析失败：' + e.message });
    }
  });

  router.post('/import', canImport, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: '请上传 Excel 文件' });
    let mapping;
    try {
      mapping = typeof req.body.mapping === 'string' ? JSON.parse(req.body.mapping) : req.body.mapping;
    } catch {
      return res.status(400).json({ error: '映射配置无效' });
    }
    if (!mapping || !mapping.mother_part_no || !mapping.part_no) {
      return res.status(400).json({ error: '请选择母件列与子件料号列' });
    }
    if (!mapping.mother_value) {
      return res.status(400).json({ error: '请选择本 BOM 对应的母件值' });
    }

    const matchFields = Array.isArray(mapping.match_fields) && mapping.match_fields.length
      ? mapping.match_fields
      : [mapping.part_no];

    const versionLabel = (req.body.version_label || '').trim() || new Date().toISOString().slice(0, 19).replace('T', ' ');
    const name = (req.body.name || '').trim() || req.file.originalname;
    const motherPartNo = String(mapping.mother_value).trim();

    try {
      const parsed = readExcelBuffer(req.file.buffer);
      if (!parsed.rows.length) return res.status(400).json({ error: 'Excel 无有效数据行' });

      const filtered = parsed.rows.filter((r) => pickField(r.data, mapping.mother_part_no) === motherPartNo);
      if (!filtered.length) {
        return res.status(400).json({ error: `未找到母件值为「${motherPartNo}」的数据行` });
      }

      const bomId = uuidv4();

      const tx = db.transaction(() => {
        db.prepare(`
          INSERT INTO bom_files
            (id, name, mother_part_no, version_label, source_filename, columns_json, match_fields_json, uploaded_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          bomId,
          name,
          motherPartNo,
          versionLabel,
          req.file.originalname,
          JSON.stringify(parsed.headers),
          JSON.stringify(matchFields),
          req.user.id
        );

        const insertLine = db.prepare(`
          INSERT INTO bom_lines (id, bom_id, line_no, part_no, qty, raw_json)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        for (const row of filtered) {
          const partNo = pickField(row.data, mapping.part_no);
          if (!partNo) continue;
          const qty = toNumber(pickField(row.data, mapping.qty), 1);
          insertLine.run(uuidv4(), bomId, row.lineNo, partNo, qty, JSON.stringify(row.data));
        }

        if (mapping.save_rule) {
          saveMappingRule(db, {
            name: mapping.rule_name || `BOM映射-${name}`,
            file_type: 'bom',
            mapping,
            match_fields: matchFields,
            is_default: !!mapping.set_default
          });
        }
      });
      tx();

      const lineCount = db.prepare('SELECT COUNT(*) AS c FROM bom_lines WHERE bom_id = ?').get(bomId).c;
      if (!lineCount) return res.status(400).json({ error: '导入后没有有效子件行，请检查子件料号列' });
      res.json({
        id: bomId,
        name,
        mother_part_no: motherPartNo,
        version_label: versionLabel,
        line_count: lineCount
      });
    } catch (e) {
      res.status(400).json({ error: '导入失败：' + e.message });
    }
  });

  router.delete('/:id', canImport, (req, res) => {
    const bom = db.prepare('SELECT id FROM bom_files WHERE id = ?').get(req.params.id);
    if (!bom) return res.status(404).json({ error: 'BOM 不存在' });
    db.prepare('DELETE FROM bom_files WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  return router;
}

function saveMappingRule(db, { name, file_type, mapping, match_fields, is_default }) {
  const id = uuidv4();
  if (is_default) {
    db.prepare('UPDATE mapping_rules SET is_default = 0 WHERE file_type = ?').run(file_type);
  }
  db.prepare(`
    INSERT INTO mapping_rules (id, name, file_type, mapping_json, match_fields_json, is_default)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, name, file_type, JSON.stringify(mapping), JSON.stringify(match_fields || []), is_default ? 1 : 0);
  return id;
}

module.exports = { bomRoutes, saveMappingRule };
