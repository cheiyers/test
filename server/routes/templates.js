'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireRoles } = require('../auth');

function templateRoutes(db) {
  const router = express.Router();
  const canImport = requireRoles('importer', 'admin');

  router.get('/', (req, res) => {
    const { label_type } = req.query;
    let items;
    if (label_type) {
      items = db.prepare('SELECT * FROM label_templates WHERE label_type = ? ORDER BY updated_at DESC').all(label_type);
    } else {
      items = db.prepare('SELECT * FROM label_templates ORDER BY label_type, updated_at DESC').all();
    }
    res.json({
      items: items.map(formatTemplate)
    });
  });

  router.get('/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM label_templates WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: '模板不存在' });
    res.json(formatTemplate(row));
  });

  router.post('/', canImport, (req, res) => {
    const body = req.body || {};
    if (!body.name || !body.label_type) {
      return res.status(400).json({ error: '名称与标签类型必填' });
    }
    const id = uuidv4();
    db.prepare(`
      INSERT INTO label_templates
        (id, name, label_type, width_mm, height_mm, code_mode, code_fields_json, code_type, elements_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      body.name,
      body.label_type,
      body.width_mm || 100,
      body.height_mm || 50,
      body.code_mode || 'unique',
      JSON.stringify(body.code_fields || []),
      body.code_type || 'qr',
      JSON.stringify(body.elements || [])
    );
    res.json({ id });
  });

  router.put('/:id', canImport, (req, res) => {
    const existing = db.prepare('SELECT * FROM label_templates WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: '模板不存在' });
    const body = req.body || {};
    db.prepare(`
      UPDATE label_templates SET
        name = ?, width_mm = ?, height_mm = ?, code_mode = ?, code_fields_json = ?,
        code_type = ?, elements_json = ?, updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(
      body.name || existing.name,
      body.width_mm ?? existing.width_mm,
      body.height_mm ?? existing.height_mm,
      body.code_mode || existing.code_mode,
      JSON.stringify(body.code_fields || JSON.parse(existing.code_fields_json || '[]')),
      body.code_type || existing.code_type,
      JSON.stringify(body.elements || JSON.parse(existing.elements_json || '[]')),
      req.params.id
    );
    res.json({ ok: true });
  });

  router.delete('/:id', canImport, (req, res) => {
    db.prepare('DELETE FROM label_templates WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  return router;
}

function formatTemplate(row) {
  return {
    id: row.id,
    name: row.name,
    label_type: row.label_type,
    width_mm: row.width_mm,
    height_mm: row.height_mm,
    code_mode: row.code_mode,
    code_fields: JSON.parse(row.code_fields_json || '[]'),
    code_type: row.code_type,
    elements: JSON.parse(row.elements_json || '[]'),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

module.exports = { templateRoutes };
