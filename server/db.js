'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'qc.db');

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const uploadDir = path.join(DATA_DIR, 'uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
}

function openDb() {
  ensureDirs();
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('importer', 'scanner', 'admin')),
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mapping_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      file_type TEXT NOT NULL CHECK(file_type IN ('bom', 'master_order', 'accessory_order')),
      mapping_json TEXT NOT NULL,
      match_fields_json TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS bom_files (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      mother_part_no TEXT NOT NULL,
      version_label TEXT NOT NULL,
      source_filename TEXT,
      columns_json TEXT,
      match_fields_json TEXT,
      uploaded_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS bom_lines (
      id TEXT PRIMARY KEY,
      bom_id TEXT NOT NULL REFERENCES bom_files(id) ON DELETE CASCADE,
      line_no INTEGER NOT NULL,
      part_no TEXT NOT NULL,
      qty REAL NOT NULL DEFAULT 1,
      raw_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS import_batches (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK(status IN ('draft', 'associated', 'labelled', 'archived')),
      master_filename TEXT,
      accessory_filename TEXT,
      master_mapping_id TEXT,
      accessory_mapping_id TEXT,
      selected_bom_id TEXT REFERENCES bom_files(id),
      mother_part_no TEXT,
      match_fields_json TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      associated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS master_order_lines (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
      line_no INTEGER NOT NULL,
      order_no TEXT NOT NULL,
      mother_part_no TEXT NOT NULL,
      raw_json TEXT NOT NULL,
      match_status TEXT NOT NULL DEFAULT 'pending'
        CHECK(match_status IN ('pending', 'success', 'failed')),
      match_message TEXT,
      package_code TEXT UNIQUE,
      label_generated INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS accessory_order_lines (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
      line_no INTEGER NOT NULL,
      order_no TEXT NOT NULL,
      part_no TEXT NOT NULL,
      qty REAL NOT NULL DEFAULT 1,
      raw_json TEXT NOT NULL,
      master_line_id TEXT REFERENCES master_order_lines(id) ON DELETE SET NULL,
      bom_line_id TEXT,
      match_status TEXT NOT NULL DEFAULT 'pending'
        CHECK(match_status IN ('pending', 'success', 'failed', 'unmatched')),
      match_message TEXT,
      child_code TEXT UNIQUE,
      label_generated INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS label_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      label_type TEXT NOT NULL CHECK(label_type IN ('master', 'child')),
      width_mm REAL NOT NULL DEFAULT 100,
      height_mm REAL NOT NULL DEFAULT 50,
      code_mode TEXT NOT NULL DEFAULT 'unique'
        CHECK(code_mode IN ('unique', 'fields')),
      code_fields_json TEXT,
      code_type TEXT NOT NULL DEFAULT 'qr'
        CHECK(code_type IN ('qr', 'barcode')),
      elements_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS packages (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
      master_line_id TEXT NOT NULL UNIQUE REFERENCES master_order_lines(id) ON DELETE CASCADE,
      order_no TEXT NOT NULL,
      package_code TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'unscanned'
        CHECK(status IN ('unscanned', 'scanning', 'complete', 'shortage')),
      started_at TEXT,
      completed_at TEXT,
      last_scan_at TEXT
    );

    CREATE TABLE IF NOT EXISTS package_children (
      id TEXT PRIMARY KEY,
      package_id TEXT NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
      accessory_line_id TEXT NOT NULL UNIQUE REFERENCES accessory_order_lines(id) ON DELETE CASCADE,
      child_code TEXT NOT NULL UNIQUE,
      scanned INTEGER NOT NULL DEFAULT 0,
      scanned_at TEXT,
      scanned_by TEXT
    );

    CREATE TABLE IF NOT EXISTS scan_logs (
      id TEXT PRIMARY KEY,
      package_id TEXT REFERENCES packages(id) ON DELETE SET NULL,
      user_id TEXT,
      username TEXT,
      scan_type TEXT NOT NULL CHECK(scan_type IN ('master', 'child', 'error')),
      code_content TEXT NOT NULL,
      success INTEGER NOT NULL DEFAULT 0,
      message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_bom_mother ON bom_files(mother_part_no);
    CREATE INDEX IF NOT EXISTS idx_master_order_no ON master_order_lines(order_no);
    CREATE INDEX IF NOT EXISTS idx_accessory_order_no ON accessory_order_lines(order_no);
    CREATE INDEX IF NOT EXISTS idx_packages_order ON packages(order_no);
    CREATE INDEX IF NOT EXISTS idx_scan_logs_created ON scan_logs(created_at);
  `);

  const tplCols = db.prepare('PRAGMA table_info(label_templates)').all().map((c) => c.name);
  if (!tplCols.includes('code_segments_json')) {
    db.exec('ALTER TABLE label_templates ADD COLUMN code_segments_json TEXT');
  }
}

function seedUsers(db) {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) return;

  const insert = db.prepare(`
    INSERT INTO users (id, username, password_hash, display_name, role)
    VALUES (@id, @username, @password_hash, @display_name, @role)
  `);

  const users = [
    { username: 'admin', password: 'admin123', display_name: '管理员', role: 'admin' },
    { username: 'import', password: 'import123', display_name: '导入打印员', role: 'importer' },
    { username: 'scan', password: 'scan123', display_name: '扫码员', role: 'scanner' }
  ];

  for (const u of users) {
    insert.run({
      id: uuidv4(),
      username: u.username,
      password_hash: bcrypt.hashSync(u.password, 10),
      display_name: u.display_name,
      role: u.role
    });
  }
}

function seedTemplates(db) {
  const count = db.prepare('SELECT COUNT(*) AS c FROM label_templates').get().c;
  if (count > 0) return;

  const insert = db.prepare(`
    INSERT INTO label_templates
      (id, name, label_type, width_mm, height_mm, code_mode, code_fields_json, code_type, elements_json)
    VALUES
      (@id, @name, @label_type, @width_mm, @height_mm, @code_mode, @code_fields_json, @code_type, @elements_json)
  `);

  insert.run({
    id: uuidv4(),
    name: '默认总包标签',
    label_type: 'master',
    width_mm: 100,
    height_mm: 60,
    code_mode: 'unique',
    code_fields_json: JSON.stringify(['order_no', 'mother_part_no']),
    code_type: 'qr',
    elements_json: JSON.stringify([
      { id: 't1', type: 'text', x: 4, y: 4, w: 55, h: 8, text: '总包标签', fontSize: 14, align: 'left', bold: true, bind: null },
      { id: 't2', type: 'field', x: 4, y: 16, w: 55, h: 8, text: '订单号：{order_no}', fontSize: 11, align: 'left', bold: false, bind: 'order_no' },
      { id: 't3', type: 'field', x: 4, y: 28, w: 55, h: 8, text: '母件：{mother_part_no}', fontSize: 11, align: 'left', bold: false, bind: 'mother_part_no' },
      { id: 'c1', type: 'code', x: 62, y: 8, w: 34, h: 34, text: '', fontSize: 10, align: 'center', bold: false, bind: null }
    ])
  });

  insert.run({
    id: uuidv4(),
    name: '默认子件标签',
    label_type: 'child',
    width_mm: 80,
    height_mm: 50,
    code_mode: 'unique',
    code_fields_json: JSON.stringify(['order_no', 'part_no']),
    code_type: 'qr',
    elements_json: JSON.stringify([
      { id: 't1', type: 'text', x: 3, y: 3, w: 45, h: 7, text: '子件标签', fontSize: 13, align: 'left', bold: true, bind: null },
      { id: 't2', type: 'field', x: 3, y: 13, w: 45, h: 7, text: '订单：{order_no}', fontSize: 10, align: 'left', bold: false, bind: 'order_no' },
      { id: 't3', type: 'field', x: 3, y: 23, w: 45, h: 7, text: '料号：{part_no}', fontSize: 10, align: 'left', bold: false, bind: 'part_no' },
      { id: 't4', type: 'field', x: 3, y: 33, w: 45, h: 7, text: '数量：{qty}', fontSize: 10, align: 'left', bold: false, bind: 'qty' },
      { id: 'c1', type: 'code', x: 48, y: 6, w: 28, h: 28, text: '', fontSize: 10, align: 'center', bold: false, bind: null }
    ])
  });
}

function initDb() {
  const db = openDb();
  initSchema(db);
  seedUsers(db);
  seedTemplates(db);
  return db;
}

module.exports = {
  DATA_DIR,
  DB_PATH,
  openDb,
  initDb,
  ensureDirs
};
