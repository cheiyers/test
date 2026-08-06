'use strict';

/**
 * 启动前环境检查：给出中文可读错误，避免新装 Node 后直接 npm start 不知所措。
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const nodeModules = path.join(root, 'node_modules');
const sqlitePkg = path.join(nodeModules, 'better-sqlite3');
const MIN_NODE = 22;

function fail(lines) {
  console.error('');
  console.error('========================================');
  console.error('  启动失败：环境未就绪');
  console.error('========================================');
  for (const line of lines) console.error('  ' + line);
  console.error('========================================');
  console.error('');
  process.exit(1);
}

const major = Number(process.versions.node.split('.')[0]);
if (!Number.isFinite(major) || major < MIN_NODE) {
  fail([
    `当前 Node.js 版本为 ${process.version}，需要 ${MIN_NODE} 或更高。`,
    '请双击「一键配置环境.bat」，或到 https://nodejs.org 安装 LTS / 当前版本后重开终端。'
  ]);
}

if (!fs.existsSync(nodeModules) || !fs.existsSync(sqlitePkg)) {
  fail([
    '尚未安装依赖（缺少 node_modules）。',
    '请双击「一键配置环境.bat」，或在项目根目录执行 npm install。'
  ]);
}

try {
  // eslint-disable-next-line global-require, import/no-dynamic-require
  require('better-sqlite3');
} catch (err) {
  const msg = String(err && err.message ? err.message : err);
  fail([
    '依赖 better-sqlite3（SQLite）加载失败。',
    `详情: ${msg}`,
    '',
    '请关闭所有相关窗口后：',
    '1) 删除项目里的 node_modules 文件夹',
    '2) 再双击「一键配置环境.bat」重新安装',
    '（不要从别的电脑直接拷贝 node_modules）'
  ]);
}

if (!fs.existsSync(path.join(nodeModules, 'express'))) {
  fail([
    '依赖不完整（缺少 express 等包）。',
    '请删除 node_modules 后重新双击「一键配置环境.bat」。'
  ]);
}

console.log(`[env] Node ${process.version}，依赖检查通过`);
