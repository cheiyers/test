'use strict';

const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { readExcelBuffer, pickField, toNumber } = require('../excel');
const { requireRoles } = require('../auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function findHeader(headers, candidates) {
  for (const c of candidates) {
    const hit = headers.find((h) => h === c || h.toLowerCase() === String(c).toLowerCase());
    if (hit) return hit;
  }
  return '';
}

function isMotherType(val) {
  const s = String(val || '').trim();
  return s === '母件' || s === '母项' || /母/.test(s) && !/子/.test(s);
}

function isChildType(val) {
  const s = String(val || '').trim();
  if (!s) return true;
  return s === '子件' || s === '子项' || /子/.test(s) || (!isMotherType(s));
}

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
      mother_info: JSON.parse(bom.mother_info_json || 'null'),
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

      const suggested = {
        bom_no: findHeader(parsed.headers, ['BOM单号', 'BOM编号', '单据编号', 'bom_no']),
        seq: findHeader(parsed.headers, ['顺序号', '序号', '行号']),
        part_no: findHeader(parsed.headers, ['物料代码', '子件料号', '料号', '物料编码', 'part_no']),
        part_name: findHeader(parsed.headers, ['物料名称', '名称']),
        spec: findHeader(parsed.headers, ['规格型号', '规格', '型号']),
        material_type: findHeader(parsed.headers, ['物料类型', '类型', '项次类型']),
        aux: findHeader(parsed.headers, ['辅助属性', '属性']),
        qty: findHeader(parsed.headers, ['用量', '基本用量', '数量', 'qty']),
        unit: findHeader(parsed.headers, ['单位', '基本单位']),
        warehouse: findHeader(parsed.headers, ['发料仓库', '仓库']),
        remark: findHeader(parsed.headers, ['备注']),
        mother_part_no: findHeader(parsed.headers, ['母件料号', '母件编码', '母件代码'])
      };

      // Build BOM单号 -> mother candidates from 物料类型=母件
      const bomGroups = [];
      if (suggested.bom_no && suggested.material_type && suggested.part_no) {
        const byBom = new Map();
        for (const row of parsed.rows) {
          const bomNo = pickField(row.data, suggested.bom_no);
          if (!bomNo) continue;
          if (!byBom.has(bomNo)) byBom.set(bomNo, []);
          byBom.get(bomNo).push(row.data);
        }
        for (const [bomNo, list] of byBom.entries()) {
          const motherRow = list.find((r) => isMotherType(pickField(r, suggested.material_type)));
          const childCount = list.filter((r) => {
            const t = pickField(r, suggested.material_type);
            return !isMotherType(t);
          }).length;
          bomGroups.push({
            bom_no: bomNo,
            mother_part_no: motherRow ? pickField(motherRow, suggested.part_no) : '',
            mother_name: motherRow ? pickField(motherRow, suggested.part_name) : '',
            mother_spec: motherRow ? pickField(motherRow, suggested.spec) : '',
            child_count: childCount,
            mother_info: motherRow || null
          });
        }
      }

      res.json({
        filename: req.file.originalname,
        headers: parsed.headers,
        preview_rows: parsed.rows.slice(0, 30).map((r) => r.data),
        total_rows: parsed.rows.length,
        distinct_by_column,
        suggested,
        bom_groups: bomGroups,
        import_mode: bomGroups.length ? 'erp' : 'simple'
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

    const versionLabel = (req.body.version_label || '').trim() || new Date().toISOString().slice(0, 19).replace('T', ' ');
    const name = (req.body.name || '').trim() || req.file.originalname;
    const mode = mapping.mode || 'simple';

    try {
      const parsed = readExcelBuffer(req.file.buffer);
      if (!parsed.rows.length) return res.status(400).json({ error: 'Excel 无有效数据行' });

      let motherPartNo = '';
      let motherInfo = null;
      let bomNo = null;
      let childRows = [];
      let matchFields = [];

      if (mode === 'erp') {
        if (!mapping.bom_no || !mapping.bom_no_value || !mapping.material_type || !mapping.part_no) {
          return res.status(400).json({ error: '请选择 BOM单号、物料类型列、物料代码列，并指定要导入的 BOM单号' });
        }
        const groupRows = parsed.rows.filter((r) => pickField(r.data, mapping.bom_no) === String(mapping.bom_no_value).trim());
        if (!groupRows.length) {
          return res.status(400).json({ error: `未找到 BOM单号「${mapping.bom_no_value}」的数据` });
        }
        const motherRow = groupRows.find((r) => isMotherType(pickField(r.data, mapping.material_type)));
        if (!motherRow) {
          return res.status(400).json({ error: '该 BOM 下未找到物料类型为「母件」的行，请检查模板' });
        }
        motherPartNo = pickField(motherRow.data, mapping.part_no);
        if (!motherPartNo) return res.status(400).json({ error: '母件行缺少物料代码' });
        motherInfo = motherRow.data;
        bomNo = String(mapping.bom_no_value).trim();
        childRows = groupRows.filter((r) => !isMotherType(pickField(r.data, mapping.material_type)));
        matchFields = Array.isArray(mapping.match_fields) && mapping.match_fields.length
          ? mapping.match_fields
          : [mapping.part_no, mapping.spec, mapping.aux].filter(Boolean);
      } else {
        if (!mapping.mother_part_no || !mapping.part_no) {
          return res.status(400).json({ error: '请选择母件列与子件料号列' });
        }
        if (!mapping.mother_value) {
          return res.status(400).json({ error: '请选择本 BOM 对应的母件值' });
        }
        motherPartNo = String(mapping.mother_value).trim();
        const filtered = parsed.rows.filter((r) => pickField(r.data, mapping.mother_part_no) === motherPartNo);
        if (!filtered.length) {
          return res.status(400).json({ error: `未找到母件值为「${motherPartNo}」的数据行` });
        }
        // if material type exists, prefer excluding mother rows from children
        const typeCol = mapping.material_type || findHeader(parsed.headers, ['物料类型', '类型']);
        if (typeCol) {
          const mRow = filtered.find((r) => isMotherType(pickField(r.data, typeCol)));
          if (mRow) motherInfo = mRow.data;
          childRows = filtered.filter((r) => !isMotherType(pickField(r.data, typeCol)));
          if (!childRows.length) childRows = filtered;
        } else {
          childRows = filtered;
        }
        matchFields = Array.isArray(mapping.match_fields) && mapping.match_fields.length
          ? mapping.match_fields
          : [mapping.part_no];
      }

      const bomId = uuidv4();
      const qtyCol = mapping.qty || '';

      const tx = db.transaction(() => {
        db.prepare(`
          INSERT INTO bom_files
            (id, name, mother_part_no, version_label, source_filename, columns_json, match_fields_json, uploaded_by, mother_info_json, bom_no)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          bomId,
          name,
          motherPartNo,
          versionLabel,
          req.file.originalname,
          JSON.stringify(parsed.headers),
          JSON.stringify(matchFields),
          req.user.id,
          motherInfo ? JSON.stringify(motherInfo) : null,
          bomNo
        );

        const insertLine = db.prepare(`
          INSERT INTO bom_lines (id, bom_id, line_no, part_no, qty, raw_json)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        for (const row of childRows) {
          const partNo = pickField(row.data, mapping.part_no);
          if (!partNo) continue;
          // skip accidental duplicate of mother code if still present
          if (partNo === motherPartNo && mode === 'erp') continue;
          const qty = toNumber(pickField(row.data, qtyCol), 1);
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
      if (!lineCount) return res.status(400).json({ error: '导入后没有有效子件行，请检查物料代码/子件行' });
      res.json({
        id: bomId,
        name,
        mother_part_no: motherPartNo,
        bom_no: bomNo,
        version_label: versionLabel,
        line_count: lineCount,
        mother_info: motherInfo
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
