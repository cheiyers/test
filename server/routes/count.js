'use strict';

const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { readExcelBuffer } = require('../excel');
const { requireRoles } = require('../auth');
const {
  applyDerivedRules,
  resolveFieldValue,
  resolveTargetQty,
  matchScanCode,
  allColumnNames
} = require('../count-engine');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function parseJson(text, fallback) {
  try { return JSON.parse(text || ''); } catch { return fallback; }
}

function countRoutes(db) {
  const router = express.Router();
  const canImport = requireRoles('importer', 'admin');
  const canScan = requireRoles('scanner', 'admin', 'importer');

  function addLog({ batchId, rowId, user, code, success, message }) {
    db.prepare(`
      INSERT INTO count_scan_logs (id, batch_id, row_id, user_id, username, code_content, success, message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(),
      batchId,
      rowId || null,
      user?.id || null,
      user?.display_name || user?.username || null,
      code || null,
      success ? 1 : 0,
      message || null
    );
  }

  function getBatch(id) {
    return db.prepare('SELECT * FROM count_batches WHERE id = ?').get(id);
  }

  function serializeBatch(batch) {
    if (!batch) return null;
    const stats = db.prepare(`
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) AS complete,
        SUM(CASE WHEN status IN ('pending','counting') THEN 1 ELSE 0 END) AS remaining,
        SUM(scanned_count) AS scanned_sum,
        SUM(target_qty) AS target_sum
      FROM count_rows WHERE batch_id = ?
    `).get(batch.id);
    return {
      ...batch,
      headers: parseJson(batch.headers_json, []),
      config: parseJson(batch.config_json, {}),
      stats: {
        total: Number(stats.total) || 0,
        complete: Number(stats.complete) || 0,
        remaining: Number(stats.remaining) || 0,
        scanned_sum: Number(stats.scanned_sum) || 0,
        target_sum: Number(stats.target_sum) || 0
      }
    };
  }

  function serializeRow(row) {
    if (!row) return null;
    return {
      ...row,
      raw: parseJson(row.raw_json, {}),
      computed: parseJson(row.computed_json, {})
    };
  }

  function recomputeBatch(batchId, config) {
    const batch = getBatch(batchId);
    if (!batch) return;
    const headers = parseJson(batch.headers_json, []);
    const rules = config.derived || [];
    const scanField = config.scan_code_field || '';
    const qtyField = config.qty_field || '';

    const rows = db.prepare('SELECT * FROM count_rows WHERE batch_id = ? ORDER BY line_no').all(batchId);
    const update = db.prepare(`
      UPDATE count_rows
      SET computed_json = ?, scan_code = ?, target_qty = ?,
          status = CASE
            WHEN ? <= 0 THEN 'skipped'
            WHEN scanned_count >= ? AND ? > 0 THEN 'complete'
            WHEN scanned_count > 0 THEN 'counting'
            ELSE 'pending'
          END,
          completed_at = CASE
            WHEN ? <= 0 THEN NULL
            WHEN scanned_count >= ? AND ? > 0 THEN COALESCE(completed_at, datetime('now','localtime'))
            ELSE NULL
          END
      WHERE id = ?
    `);

    const tx = db.transaction(() => {
      for (const row of rows) {
        const raw = parseJson(row.raw_json, {});
        const computed = applyDerivedRules(raw, rules);
        const scanCode = resolveFieldValue(computed, scanField);
        const targetQty = resolveTargetQty(computed, qtyField);
        update.run(
          JSON.stringify(computed),
          scanCode,
          targetQty,
          targetQty,
          targetQty,
          targetQty,
          targetQty,
          targetQty,
          targetQty,
          row.id
        );
      }

      const ready = !!(scanField && qtyField);
      db.prepare(`
        UPDATE count_batches
        SET config_json = ?, status = ?, updated_at = datetime('now','localtime')
        WHERE id = ?
      `).run(JSON.stringify({
        ...config,
        derived: rules,
        scan_code_field: scanField,
        qty_field: qtyField,
        column_names: allColumnNames(headers, rules)
      }), ready ? 'ready' : 'draft', batchId);
    });
    tx();
  }

  function currentRow(batchId) {
    return db.prepare(`
      SELECT * FROM count_rows
      WHERE batch_id = ? AND status IN ('pending', 'counting')
      ORDER BY
        CASE status WHEN 'counting' THEN 0 ELSE 1 END,
        line_no ASC
      LIMIT 1
    `).get(batchId);
  }

  router.get('/batches', canScan, (req, res) => {
    const items = db.prepare('SELECT * FROM count_batches ORDER BY created_at DESC LIMIT 200').all()
      .map(serializeBatch);
    res.json({ items });
  });

  router.get('/batches/:id', canScan, (req, res) => {
    const batch = getBatch(req.params.id);
    if (!batch) return res.status(404).json({ error: '计数批次不存在' });
    const rows = db.prepare('SELECT * FROM count_rows WHERE batch_id = ? ORDER BY line_no').all(batch.id)
      .map(serializeRow);
    res.json({
      batch: serializeBatch(batch),
      rows,
      current: serializeRow(currentRow(batch.id))
    });
  });

  router.post('/preview', canImport, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: '请上传 Excel 文件' });
    const parsed = readExcelBuffer(req.file.buffer);
    if (!parsed.headers.length) return res.status(400).json({ error: 'Excel 无有效表头' });
    res.json({
      headers: parsed.headers,
      row_count: parsed.rows.length,
      sample: parsed.rows.slice(0, 8).map((r) => r.data)
    });
  });

  router.post('/create', canImport, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: '请上传 Excel 文件' });
    const name = String(req.body?.name || '').trim() || `计数订单-${new Date().toISOString().slice(0, 10)}`;
    const parsed = readExcelBuffer(req.file.buffer);
    if (!parsed.headers.length || !parsed.rows.length) {
      return res.status(400).json({ error: 'Excel 无有效数据行' });
    }

    const batchId = uuidv4();
    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO count_batches (id, name, status, headers_json, config_json, created_by)
        VALUES (?, ?, 'draft', ?, '{}', ?)
      `).run(
        batchId,
        name,
        JSON.stringify(parsed.headers),
        req.user.display_name || req.user.username
      );

      const insert = db.prepare(`
        INSERT INTO count_rows
          (id, batch_id, line_no, raw_json, computed_json, scan_code, target_qty, scanned_count, status)
        VALUES (?, ?, ?, ?, ?, '', 0, 0, 'pending')
      `);
      for (const row of parsed.rows) {
        insert.run(uuidv4(), batchId, row.lineNo, JSON.stringify(row.data), JSON.stringify(row.data));
      }
    });
    tx();

    res.json({ ok: true, id: batchId, batch: serializeBatch(getBatch(batchId)) });
  });

  router.put('/batches/:id/config', canImport, (req, res) => {
    const batch = getBatch(req.params.id);
    if (!batch) return res.status(404).json({ error: '计数批次不存在' });

    const body = req.body || {};
    const derived = Array.isArray(body.derived) ? body.derived : [];
    for (const rule of derived) {
      if (rule.type === 'div_mod') {
        if (!rule.source_field) return res.status(400).json({ error: '整除规则需要选择源列' });
        if (!rule.divisor && rule.divisor !== 0) return res.status(400).json({ error: '整除规则需要除数' });
        if (!rule.quotient_name && !rule.remainder_name) {
          return res.status(400).json({ error: '请至少填写商列名或余数列名' });
        }
      }
      if (rule.type === 'expr') {
        if (!rule.name) return res.status(400).json({ error: '表达式列需要列名' });
        if (!rule.formula) return res.status(400).json({ error: '表达式列需要公式' });
      }
    }

    const config = {
      derived,
      scan_code_field: String(body.scan_code_field || '').trim(),
      qty_field: String(body.qty_field || '').trim()
    };

    recomputeBatch(batch.id, config);
    const detail = {
      batch: serializeBatch(getBatch(batch.id)),
      rows: db.prepare('SELECT * FROM count_rows WHERE batch_id = ? ORDER BY line_no LIMIT 50').all(batch.id).map(serializeRow),
      current: serializeRow(currentRow(batch.id))
    };
    res.json({ ok: true, ...detail });
  });

  router.post('/batches/:id/reset-progress', canImport, (req, res) => {
    const batch = getBatch(req.params.id);
    if (!batch) return res.status(404).json({ error: '计数批次不存在' });
    db.prepare(`
      UPDATE count_rows
      SET scanned_count = 0, status = CASE WHEN target_qty > 0 THEN 'pending' ELSE 'pending' END,
          completed_at = NULL, last_scan_at = NULL
      WHERE batch_id = ?
    `).run(batch.id);
    db.prepare(`UPDATE count_batches SET status = CASE WHEN json_extract(config_json,'$.scan_code_field') != '' AND json_extract(config_json,'$.qty_field') != '' THEN 'ready' ELSE 'draft' END, updated_at = datetime('now','localtime') WHERE id = ?`).run(batch.id);
    // simpler status update
    const cfg = parseJson(getBatch(batch.id).config_json, {});
    db.prepare(`UPDATE count_batches SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
      .run(cfg.scan_code_field && cfg.qty_field ? 'ready' : 'draft', batch.id);
    res.json({ ok: true, batch: serializeBatch(getBatch(batch.id)) });
  });

  router.delete('/batches/:id', canImport, (req, res) => {
    const batch = getBatch(req.params.id);
    if (!batch) return res.status(404).json({ error: '计数批次不存在' });
    db.prepare('DELETE FROM count_batches WHERE id = ?').run(batch.id);
    res.json({ ok: true });
  });

  router.get('/batches/:id/current', canScan, (req, res) => {
    const batch = getBatch(req.params.id);
    if (!batch) return res.status(404).json({ error: '计数批次不存在' });
    res.json({
      batch: serializeBatch(batch),
      current: serializeRow(currentRow(batch.id))
    });
  });

  /** 计数扫码：按当前行的识别码累计，达到目标数量后自动进入下一行 */
  router.post('/scan', canScan, (req, res) => {
    const code = String(req.body?.code || '').trim();
    const batchId = req.body?.batch_id;
    if (!code) return res.status(400).json({ error: '请扫描条码内容' });
    if (!batchId) return res.status(400).json({ error: '请选择计数批次' });

    const batch = getBatch(batchId);
    if (!batch) return res.status(404).json({ error: '计数批次不存在' });
    const config = parseJson(batch.config_json, {});
    if (!config.scan_code_field || !config.qty_field) {
      return res.status(400).json({ error: '请先在计数订单中配置识别列与数量列，并保存公式' });
    }

    let row = null;
    if (req.body?.row_id) {
      row = db.prepare('SELECT * FROM count_rows WHERE id = ? AND batch_id = ?').get(req.body.row_id, batchId);
    }
    if (!row) row = currentRow(batchId);

    if (!row) {
      addLog({ batchId, user: req.user, code, success: true, message: '批次已全部完成' });
      return res.json({
        ok: true,
        completed_batch: true,
        message: '本批次订单已全部计数完成',
        batch: serializeBatch(batch),
        current: null
      });
    }

    if (!row.scan_code) {
      return res.status(400).json({
        ok: false,
        error: `第 ${row.line_no} 行识别码为空，请检查公式/识别列配置`,
        current: serializeRow(row)
      });
    }

    if (!matchScanCode(code, row.scan_code)) {
      addLog({
        batchId,
        rowId: row.id,
        user: req.user,
        code,
        success: false,
        message: `与当前行识别码不匹配（期望含 ${row.scan_code}）`
      });
      return res.status(400).json({
        ok: false,
        error: `条码与当前行不匹配，当前应扫：${row.scan_code}`,
        current: serializeRow(row),
        batch: serializeBatch(batch)
      });
    }

    if (row.target_qty <= 0) {
      return res.status(400).json({
        ok: false,
        error: `第 ${row.line_no} 行目标数量为 0，请检查数量列配置`,
        current: serializeRow(row)
      });
    }

    const nextCount = Number(row.scanned_count) + 1;
    const done = nextCount >= Number(row.target_qty);
    db.prepare(`
      UPDATE count_rows
      SET scanned_count = ?,
          status = ?,
          last_scan_at = datetime('now','localtime'),
          completed_at = CASE WHEN ? = 1 THEN datetime('now','localtime') ELSE completed_at END
      WHERE id = ?
    `).run(nextCount, done ? 'complete' : 'counting', done ? 1 : 0, row.id);

    addLog({
      batchId,
      rowId: row.id,
      user: req.user,
      code,
      success: true,
      message: done
        ? `第 ${row.line_no} 行已满足 ${nextCount}/${row.target_qty}`
        : `计数 ${nextCount}/${row.target_qty}`
    });

    const updated = db.prepare('SELECT * FROM count_rows WHERE id = ?').get(row.id);
    const next = currentRow(batchId);
    if (!next) {
      db.prepare(`UPDATE count_batches SET status = 'done', updated_at = datetime('now','localtime') WHERE id = ?`).run(batchId);
    } else if (getBatch(batchId).status === 'done') {
      db.prepare(`UPDATE count_batches SET status = 'ready', updated_at = datetime('now','localtime') WHERE id = ?`).run(batchId);
    }

    res.json({
      ok: true,
      message: done
        ? `已满足！第 ${row.line_no} 行完成（${nextCount}/${row.target_qty}）${next ? '，请扫下一行' : '，本批次全部完成'}`
        : `计数成功 ${nextCount}/${row.target_qty}`,
      row_completed: done,
      completed_batch: !next,
      row: serializeRow(updated),
      current: serializeRow(next),
      batch: serializeBatch(getBatch(batchId))
    });
  });

  return router;
}

module.exports = { countRoutes };
