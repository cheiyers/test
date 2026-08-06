'use strict';

/**
 * 启动前环境检查：给出中文可读错误，避免新装 Node 后直接 npm start 不知所措。
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const nodeModules = path.join(root, 'node_modules');
const sqlitePkg = path.join(nodeModules, 'better-sqlite3');

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
if (!Number.isFinite(major) || major < 18) {
  fail([
    `当前 Node.js 版本为 ${process.version}，需要 18 或更高。`,
    '请到 https://nodejs.org 下载安装 LTS 版本后重开终端再试。'
  ]);
}

if (!fs.existsSync(nodeModules) || !fs.existsSync(sqlitePkg)) {
  fail([
    '尚未安装依赖（缺少 node_modules）。',
    '请在项目根目录依次执行：',
    '  1) npm install',
    '  2) npm start',
    'Windows 也可双击 start.bat（会自动安装依赖）。'
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
    '常见原因与处理：',
    '1) 从别的电脑直接拷贝了 node_modules → 请删除本机 node_modules 后重新 npm install',
    '2) npm install 未成功完成 → 在项目根目录重新执行 npm install',
    '3) Windows 缺少编译环境且无匹配预编译包 → 安装「Visual Studio Build Tools」',
    '   （勾选“使用 C++ 的桌面开发”），或改用官方 Node.js LTS x64 安装包后再 npm install',
    '4) Node 版本刚升级 → 删除 node_modules 后重新 npm install'
  ]);
}

if (!fs.existsSync(path.join(nodeModules, 'express'))) {
  fail([
    '依赖不完整（缺少 express 等包）。',
    '请删除 node_modules 后重新执行：npm install'
  ]);
}

console.log(`[env] Node ${process.version}，依赖检查通过`);
