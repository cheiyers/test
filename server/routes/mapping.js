'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireRoles } = require('../auth');

function mappingRoutes(db) {
  const router = express.Router();
  const canImport = requireRoles('importer', 'admin');

  router.get('/', (req, res) => {
    const { file_type } = req.query;
    let rows;
    if (file_type) {
      rows = db.prepare(`
        SELECT * FROM mapping_rules WHERE file_type = ? ORDER BY is_default DESC, updated_at DESC
      `).all(file_type);
    } else {
      rows = db.prepare('SELECT * FROM mapping_rules ORDER BY file_type, is_default DESC, updated_at DESC').all();
    }
    res.json({
      items: rows.map((r) => ({
        ...r,
        mapping: JSON.parse(r.mapping_json),
        match_fields: JSON.parse(r.match_fields_json || '[]')
      }))
    });
  });

  router.post('/', canImport, (req, res) => {
    const { name, file_type, mapping, match_fields, is_default } = req.body || {};
    if (!name || !file_type || !mapping) {
      return res.status(400).json({ error: '名称、类型、映射不能为空' });
    }
    if (!['bom', 'master_order', 'accessory_order'].includes(file_type)) {
      return res.status(400).json({ error: 'file_type 无效' });
    }
    const id = uuidv4();
    const tx = db.transaction(() => {
      if (is_default) {
        db.prepare('UPDATE mapping_rules SET is_default = 0 WHERE file_type = ?').run(file_type);
      }
      db.prepare(`
        INSERT INTO mapping_rules (id, name, file_type, mapping_json, match_fields_json, is_default)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, name, file_type, JSON.stringify(mapping), JSON.stringify(match_fields || []), is_default ? 1 : 0);
    });
    tx();
    res.json({ id });
  });

  router.put('/:id', canImport, (req, res) => {
    const existing = db.prepare('SELECT * FROM mapping_rules WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: '映射规则不存在' });
    const { name, mapping, match_fields, is_default } = req.body || {};
    const tx = db.transaction(() => {
      if (is_default) {
        db.prepare('UPDATE mapping_rules SET is_default = 0 WHERE file_type = ?').run(existing.file_type);
      }
      db.prepare(`
        UPDATE mapping_rules
        SET name = ?, mapping_json = ?, match_fields_json = ?, is_default = ?, updated_at = datetime('now','localtime')
        WHERE id = ?
      `).run(
        name || existing.name,
        JSON.stringify(mapping || JSON.parse(existing.mapping_json)),
        JSON.stringify(match_fields || JSON.parse(existing.match_fields_json || '[]')),
        is_default ? 1 : (is_default === false ? 0 : existing.is_default),
        req.params.id
      );
    });
    tx();
    res.json({ ok: true });
  });

  router.delete('/:id', canImport, (req, res) => {
    db.prepare('DELETE FROM mapping_rules WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  return router;
}

module.exports = { mappingRoutes };
