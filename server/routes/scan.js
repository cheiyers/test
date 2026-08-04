'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { exportRowsToBuffer } = require('../excel');
const { requireRoles } = require('../auth');

function scanRoutes(db) {
  const router = express.Router();
  const canScan = requireRoles('scanner', 'admin', 'importer');

  function addLog({ packageId, user, scanType, code, success, message }) {
    db.prepare(`
      INSERT INTO scan_logs (id, package_id, user_id, username, scan_type, code_content, success, message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(),
      packageId || null,
      user?.id || null,
      user?.display_name || user?.username || null,
      scanType,
      code,
      success ? 1 : 0,
      message || null
    );
  }

  function markShortageIfLeaving(currentPackageId, user) {
    if (!currentPackageId) return null;
    const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(currentPackageId);
    if (!pkg) return null;
    if (pkg.status === 'complete' || pkg.status === 'shortage') return pkg;

    const stats = db.prepare(`
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN scanned = 1 THEN 1 ELSE 0 END) AS scanned
      FROM package_children WHERE package_id = ?
    `).get(pkg.id);

    if (stats.total > 0 && stats.scanned < stats.total) {
      db.prepare(`UPDATE packages SET status = 'shortage', last_scan_at = datetime('now','localtime') WHERE id = ?`).run(pkg.id);
      addLog({
        packageId: pkg.id,
        user,
        scanType: 'error',
        code: pkg.package_code,
        success: false,
        message: '切换总包时子件未齐，自动标记为有缺漏'
      });
      return db.prepare('SELECT * FROM packages WHERE id = ?').get(pkg.id);
    }
    return pkg;
  }

  function packageDetail(pkgId) {
    const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(pkgId);
    if (!pkg) return null;
    const children = db.prepare(`
      SELECT pc.*, a.part_no, a.qty, a.order_no, a.raw_json
      FROM package_children pc
      JOIN accessory_order_lines a ON a.id = pc.accessory_line_id
      WHERE pc.package_id = ?
      ORDER BY a.line_no
    `).all(pkgId);
    const scanned = children.filter((c) => c.scanned).length;
    return {
      ...pkg,
      children: children.map((c) => ({
        ...c,
        raw: JSON.parse(c.raw_json)
      })),
      total_children: children.length,
      scanned_children: scanned,
      remaining: children.length - scanned
    };
  }

  router.get('/packages', canScan, (req, res) => {
    const { order_no, status, date_from, date_to, q } = req.query;
    let sql = `
      SELECT p.*, b.name AS batch_name,
        (SELECT COUNT(*) FROM package_children c WHERE c.package_id = p.id) AS total_children,
        (SELECT COUNT(*) FROM package_children c WHERE c.package_id = p.id AND c.scanned = 1) AS scanned_children
      FROM packages p
      JOIN import_batches b ON b.id = p.batch_id
      WHERE 1=1
    `;
    const params = [];
    if (order_no) {
      sql += ' AND p.order_no LIKE ?';
      params.push(`%${order_no}%`);
    }
    if (status) {
      sql += ' AND p.status = ?';
      params.push(status);
    }
    if (date_from) {
      sql += ' AND date(p.last_scan_at) >= date(?)';
      params.push(date_from);
    }
    if (date_to) {
      sql += ' AND date(COALESCE(p.last_scan_at, p.started_at, datetime("now","localtime"))) <= date(?)';
      params.push(date_to);
    }
    if (q) {
      sql += ' AND (p.package_code LIKE ? OR p.order_no LIKE ?)';
      params.push(`%${q}%`, `%${q}%`);
    }
    sql += ' ORDER BY COALESCE(p.last_scan_at, p.started_at, p.id) DESC LIMIT 500';
    const items = db.prepare(sql).all(...params);
    res.json({ items });
  });

  router.get('/packages/:id', canScan, (req, res) => {
    const detail = packageDetail(req.params.id);
    if (!detail) return res.status(404).json({ error: '总包不存在' });
    res.json(detail);
  });

  router.post('/scan', canScan, (req, res) => {
    const code = String(req.body?.code || '').trim();
    const currentPackageId = req.body?.current_package_id || null;
    if (!code) return res.status(400).json({ error: '请扫描条码内容' });

    // Try master first
    const masterPkg = db.prepare('SELECT * FROM packages WHERE package_code = ?').get(code);
    if (masterPkg) {
      let leftShortage = null;
      if (currentPackageId && currentPackageId !== masterPkg.id) {
        leftShortage = markShortageIfLeaving(currentPackageId, req.user);
      }

      if (masterPkg.status === 'unscanned') {
        db.prepare(`
          UPDATE packages SET status = 'scanning', started_at = datetime('now','localtime'), last_scan_at = datetime('now','localtime')
          WHERE id = ?
        `).run(masterPkg.id);
      } else {
        db.prepare(`UPDATE packages SET last_scan_at = datetime('now','localtime') WHERE id = ?`).run(masterPkg.id);
      }

      addLog({
        packageId: masterPkg.id,
        user: req.user,
        scanType: 'master',
        code,
        success: true,
        message: '总包扫描成功'
      });

      return res.json({
        ok: true,
        scan_type: 'master',
        message: '总包扫描成功，请继续扫描子件',
        package: packageDetail(masterPkg.id),
        previous_shortage: leftShortage ? packageDetail(leftShortage.id) : null
      });
    }

    // Child scan
    const child = db.prepare(`
      SELECT pc.*, p.id AS pkg_id, p.package_code, p.status AS pkg_status
      FROM package_children pc
      JOIN packages p ON p.id = pc.package_id
      WHERE pc.child_code = ?
    `).get(code);

    if (!child) {
      addLog({
        packageId: currentPackageId,
        user: req.user,
        scanType: 'error',
        code,
        success: false,
        message: '未识别的条码'
      });
      return res.status(400).json({ ok: false, error: '未识别的条码，请确认标签是否已生成' });
    }

    if (!currentPackageId) {
      addLog({
        packageId: child.pkg_id,
        user: req.user,
        scanType: 'error',
        code,
        success: false,
        message: '请先扫描总包标签'
      });
      return res.status(400).json({ ok: false, error: '请先扫描总包标签' });
    }

    if (child.pkg_id !== currentPackageId) {
      addLog({
        packageId: currentPackageId,
        user: req.user,
        scanType: 'error',
        code,
        success: false,
        message: '子件不属于当前总包'
      });
      return res.status(400).json({
        ok: false,
        error: '该子件不属于当前总包',
        expected_package_code: db.prepare('SELECT package_code FROM packages WHERE id = ?').get(currentPackageId)?.package_code,
        actual_package_code: child.package_code
      });
    }

    if (child.scanned) {
      addLog({
        packageId: currentPackageId,
        user: req.user,
        scanType: 'error',
        code,
        success: false,
        message: '子件重复扫描'
      });
      return res.status(400).json({ ok: false, error: '该子件已扫描，不能重复扫' });
    }

    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE package_children
        SET scanned = 1, scanned_at = datetime('now','localtime'), scanned_by = ?
        WHERE id = ?
      `).run(req.user.display_name || req.user.username, child.id);

      db.prepare(`
        UPDATE packages SET status = 'scanning', last_scan_at = datetime('now','localtime'),
          started_at = COALESCE(started_at, datetime('now','localtime'))
        WHERE id = ?
      `).run(currentPackageId);

      const stats = db.prepare(`
        SELECT COUNT(*) AS total,
          SUM(CASE WHEN scanned = 1 THEN 1 ELSE 0 END) AS scanned
        FROM package_children WHERE package_id = ?
      `).get(currentPackageId);

      let completed = false;
      if (stats.scanned >= stats.total && stats.total > 0) {
        db.prepare(`
          UPDATE packages SET status = 'complete', completed_at = datetime('now','localtime') WHERE id = ?
        `).run(currentPackageId);
        completed = true;
      }

      addLog({
        packageId: currentPackageId,
        user: req.user,
        scanType: 'child',
        code,
        success: true,
        message: completed ? '子件扫描成功，总包已齐套' : '子件扫描成功'
      });

      return completed;
    });
    const completed = tx();

    res.json({
      ok: true,
      scan_type: 'child',
      message: completed ? '子件扫描成功，该总包已齐套' : '子件扫描成功',
      completed,
      package: packageDetail(currentPackageId)
    });
  });

  router.get('/logs', canScan, (req, res) => {
    const { order_no, date_from, date_to, success } = req.query;
    let sql = `
      SELECT l.*, p.order_no, p.package_code, p.status AS package_status
      FROM scan_logs l
      LEFT JOIN packages p ON p.id = l.package_id
      WHERE 1=1
    `;
    const params = [];
    if (order_no) {
      sql += ' AND p.order_no LIKE ?';
      params.push(`%${order_no}%`);
    }
    if (date_from) {
      sql += ' AND date(l.created_at) >= date(?)';
      params.push(date_from);
    }
    if (date_to) {
      sql += ' AND date(l.created_at) <= date(?)';
      params.push(date_to);
    }
    if (success === '1' || success === '0') {
      sql += ' AND l.success = ?';
      params.push(Number(success));
    }
    sql += ' ORDER BY l.created_at DESC LIMIT 1000';
    res.json({ items: db.prepare(sql).all(...params) });
  });

  router.get('/export', canScan, (req, res) => {
    const { order_no, date_from, date_to } = req.query;
    let sql = `
      SELECT
        l.created_at AS 扫描时间,
        l.username AS 操作人,
        l.scan_type AS 扫描类型,
        l.code_content AS 码内容,
        CASE l.success WHEN 1 THEN '成功' ELSE '失败' END AS 结果,
        l.message AS 说明,
        p.order_no AS 订单号,
        p.package_code AS 总包码,
        CASE p.status
          WHEN 'unscanned' THEN '未扫'
          WHEN 'scanning' THEN '扫码中'
          WHEN 'complete' THEN '已齐套'
          WHEN 'shortage' THEN '有缺漏'
          ELSE p.status
        END AS 总包状态
      FROM scan_logs l
      LEFT JOIN packages p ON p.id = l.package_id
      WHERE 1=1
    `;
    const params = [];
    if (order_no) {
      sql += ' AND p.order_no LIKE ?';
      params.push(`%${order_no}%`);
    }
    if (date_from) {
      sql += ' AND date(l.created_at) >= date(?)';
      params.push(date_from);
    }
    if (date_to) {
      sql += ' AND date(l.created_at) <= date(?)';
      params.push(date_to);
    }
    sql += ' ORDER BY l.created_at DESC';
    const rows = db.prepare(sql).all(...params);
    const buf = exportRowsToBuffer(rows, '扫码记录');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="scan-logs.xlsx"');
    res.send(buf);
  });

  router.get('/status-map', (_req, res) => {
    res.json({
      unscanned: '未扫',
      scanning: '扫码中',
      complete: '已齐套',
      shortage: '有缺漏'
    });
  });

  return router;
}

module.exports = { scanRoutes };
