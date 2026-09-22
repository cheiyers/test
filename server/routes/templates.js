'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireRoles } = require('../auth');
const {
  FORMULA_CATALOG,
  scanIdField,
  templateIncludesScanId
} = require('../expr');

function templateRoutes(db) {
  const router = express.Router();
  const canImport = requireRoles('importer', 'admin');

  // Must be before /:id
  router.get('/meta/field-options', (req, res) => {
    const labelType = req.query.label_type === 'child' ? 'child' : 'master';
    const builtins = labelType === 'master'
      ? ['order_no', 'mother_part_no', 'package_code', '__today__']
      : ['order_no', 'part_no', 'qty', 'child_code', 'package_code', '__today__'];

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
    res.json({
      label_type: labelType,
      fields,
      formulas: FORMULA_CATALOG,
      scan_id_field: scanIdField(labelType),
      formula_help: [
        '写法接近 Excel：函数可嵌套，如 IF(LEFT(TRIM(),2)="SO","订单","其他")、UPPER(LEFT(TRIM(),4))',
        '今日日期：选字段「__today__」或公式 TODAY() / FORMAT(TODAY(),"yyyy-mm-dd")',
        '当前字段值：参数留空，或用 VALUE() / . ；其他列：FIELD("列名") 或 field:列名',
        'FORMAT / TEXT：日期与数字格式化。日期例 FORMAT(,"yyyy-mm-dd")，可识别 2024/1/5、20240105、2024年1月5日 等；数字例 FORMAT(,"0000")、FORMAT(,"0.00")',
        'IF(条件,是,否) 条件支持 = <> > >= < <= 与嵌套函数；也可用 IF(FIELD("qty")>5,"多","少")',
        '仍兼容旧写法：left:4、format:yyyy-mm-dd、以及链式 trim|upper|left:4',
        '条码/二维码唯一码可选；若用于「订单批次打印」，模板中需包含系统唯一码字段（总包 package_code / 子件 child_code）'
      ],
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

  function sanitizeTemplateBody(body) {
    const labelType = body.label_type === 'child' ? 'child' : 'master';
    const next = { ...body, label_type: labelType };
    // 唯一码非必须：不再强制补全 scan id 片段
    if (next.code_mode === 'fields') {
      next.code_fields = (next.code_segments || [])
        .filter((s) => s && s.type === 'field')
        .map((s) => s.field)
        .filter(Boolean);
    }
    next.copies_per_label = clampCopies(next.copies_per_label);
    next.elements = (next.elements || []).map((el) => ({ ...el }));
    return next;
  }

  router.post('/', canImport, (req, res) => {
    const body = sanitizeTemplateBody(req.body || {});
    if (!body.name || !body.label_type) {
      return res.status(400).json({ error: '名称与标签类型必填' });
    }
    const id = uuidv4();
    db.prepare(`
      INSERT INTO label_templates
        (id, name, label_type, width_mm, height_mm, code_mode, code_fields_json, code_segments_json, code_type, elements_json, copies_per_label)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      JSON.stringify(body.elements || []),
      body.copies_per_label || 1
    );
    const row = db.prepare('SELECT * FROM label_templates WHERE id = ?').get(id);
    res.json(formatTemplate(row));
  });

  router.put('/:id', canImport, (req, res) => {
    const existing = db.prepare('SELECT * FROM label_templates WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: '模板不存在' });
    const body = sanitizeTemplateBody({ ...req.body, label_type: req.body.label_type || existing.label_type });
    db.prepare(`
      UPDATE label_templates SET
        name = ?, width_mm = ?, height_mm = ?, code_mode = ?, code_fields_json = ?,
        code_segments_json = ?, code_type = ?, elements_json = ?, copies_per_label = ?,
        updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(
      body.name || existing.name,
      body.width_mm || existing.width_mm,
      body.height_mm || existing.height_mm,
      body.code_mode || existing.code_mode,
      JSON.stringify(body.code_fields || JSON.parse(existing.code_fields_json || '[]')),
      JSON.stringify(body.code_segments || JSON.parse(existing.code_segments_json || '[]')),
      body.code_type || existing.code_type,
      JSON.stringify(body.elements || JSON.parse(existing.elements_json || '[]')),
      body.copies_per_label != null ? body.copies_per_label : (existing.copies_per_label || 1),
      req.params.id
    );
    const row = db.prepare('SELECT * FROM label_templates WHERE id = ?').get(req.params.id);
    res.json(formatTemplate(row));
  });

  router.delete('/:id', canImport, (req, res) => {
    db.prepare('DELETE FROM label_templates WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  return router;
}

function clampCopies(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 1) return 1;
  return Math.min(200, Math.floor(v));
}

function formatTemplate(row) {
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
    copies_per_label: clampCopies(row.copies_per_label == null ? 1 : row.copies_per_label),
    elements: JSON.parse(row.elements_json || '[]'),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
  tpl.includes_scan_id = templateIncludesScanId(tpl);
  return tpl;
}

module.exports = { templateRoutes };
