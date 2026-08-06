'use strict';

/**
 * 通用 SQLite 封装：使用 Node.js 内置 node:sqlite（无需 better-sqlite3 原生编译）。
 * API 对齐本项目对 better-sqlite3 的用法：prepare/run/get/all、exec、pragma、transaction。
 */

function suppressSqliteExperimentalWarning() {
  const original = process.emitWarning;
  process.emitWarning = function patchedEmitWarning(warning, ...args) {
    const msg = typeof warning === 'string' ? warning : (warning && warning.message) || '';
    const name = (typeof warning === 'object' && warning && warning.name) || args[0] || '';
    if (/SQLite/i.test(String(msg)) || (name === 'ExperimentalWarning' && /SQLite/i.test(String(msg)))) {
      return;
    }
    return original.call(process, warning, ...args);
  };
}

function loadDatabaseSync() {
  suppressSqliteExperimentalWarning();
  try {
    return require('node:sqlite').DatabaseSync;
  } catch (err) {
    console.error('');
    console.error('[错误] 无法加载 Node.js 内置 SQLite（node:sqlite）。');
    console.error('请安装 Node.js 22.5 或更高版本（官网 https://nodejs.org ，选 Windows x64）。');
    console.error('原始错误:', err.message);
    console.error('');
    process.exit(1);
  }
}

function wrapStatement(stmt) {
  return {
    run(...args) {
      return stmt.run(...args);
    },
    get(...args) {
      const row = stmt.get(...args);
      return row == null ? undefined : { ...row };
    },
    all(...args) {
      return stmt.all(...args).map((row) => ({ ...row }));
    }
  };
}

function openDatabase(filePath) {
  const DatabaseSync = loadDatabaseSync();
  const raw = new DatabaseSync(filePath);

  const db = {
    prepare(sql) {
      return wrapStatement(raw.prepare(sql));
    },
    exec(sql) {
      return raw.exec(sql);
    },
    pragma(source) {
      const body = String(source || '').trim();
      if (!body) return;
      if (/=/.test(body)) {
        raw.exec(`PRAGMA ${body}`);
        return;
      }
      return wrapStatement(raw.prepare(`PRAGMA ${body}`)).all();
    },
    transaction(fn) {
      return (...args) => {
        raw.exec('BEGIN');
        try {
          const result = fn(...args);
          raw.exec('COMMIT');
          return result;
        } catch (err) {
          try { raw.exec('ROLLBACK'); } catch { /* ignore */ }
          throw err;
        }
      };
    },
    close() {
      return raw.close();
    }
  };

  return db;
}

module.exports = { openDatabase };
