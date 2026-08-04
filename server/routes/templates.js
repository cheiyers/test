'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireRoles } = require('../auth');

function templateRoutes(db) {
  const router = express.Router();
  const canImport = requireRoles('importer', 'admin');

  // Must be before /:id
  router.get('/meta/field-options', (req, res) => {
    const labelType = req.query.label_type === 'child' ? 'child' : 'master';
    const builtins = labelType === 'master'
      ? ['order_no', 'mother_part_no', 'package_code']
      : ['order_no', 'part_no', 'qty', 'child_code', 'package_code'];

    let sampleRaw = {};
    if (labelType === 'master') {
      const row = db.prepare(`
        SELECT raw_json FROM master_order_lines ORDER BY rowid DESC LIMIT 1
      `).get();
      if (row) sampleRaw = JSON.parse(row.raw_json || '{}');
    } else {
      const row = db.prepare(`
        SELECT raw_json FROM accessory_order_lines ORDER BY rowid DESC LIMIT 1
      `).get();
      if (row) sampleRaw = JSON.parse(row.raw_json || '{}');
    }

    const fromOrders = Object.keys(sampleRaw || {});
    const fields = [...new Set([...builtins, ...fromOrders])];
    const formulas = [
      { value: '', label: '无（原值）' },
      { value: 'trim', label: '去空格 trim' },
      { value: 'upper', label: '转大写 upper' },
      { value: 'lower', label: '转小写 lower' },
      { value: 'left:4', label: '左取N位 left:4' },
      { value: 'right:3', label: '右取N位 right:3' },
      { value: 'mid:2:3', label: '截取 mid:起始:长度' },
      { value: 'padleft:6:0', label: '左补齐 padleft:6:0' },
      { value: 'num+1', label: '数字加减乘除 num+1' },
      { value: 'replace:mm:', label: '替换 replace:旧:新' }
    ];
    res.json({
      label_type: labelType,
      fields,
      formulas,
      has_order_data: fromOrders.length > 0,
      sample: sampleRaw
    });
  });

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
        (id, name, label_type, width_mm, height_mm, code_mode, code_fields_json, code_segments_json, code_type, elements_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      body.name,
      body.label_type,
      body.width_mm || 100,
      body.height_mm || 50,
      body.code_mode || 'unique',
      JSON.stringify(body.code_fields || []),
      JSON.stringify(body.code_segments || []),
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
        code_segments_json = ?, code_type = ?, elements_json = ?, updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(
      body.name || existing.name,
      body.width_mm ?? existing.width_mm,
      body.height_mm ?? existing.height_mm,
      body.code_mode || existing.code_mode,
      JSON.stringify(body.code_fields || JSON.parse(existing.code_fields_json || '[]')),
      JSON.stringify(body.code_segments || JSON.parse(existing.code_segments_json || '[]')),
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
    code_segments: JSON.parse(row.code_segments_json || '[]'),
    code_type: row.code_type,
    elements: JSON.parse(row.elements_json || '[]'),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

module.exports = { templateRoutes };
