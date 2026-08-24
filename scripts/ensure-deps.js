'use strict';

/**
 * 启动前环境检查：纯 JS 依赖 + Node 内置 SQLite，无需原生编译。
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const nodeModules = path.join(root, 'node_modules');
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

const parts = process.versions.node.split('.').map(Number);
const major = parts[0];
const minor = parts[1] || 0;
if (!Number.isFinite(major) || major < MIN_NODE || (major === 22 && minor < 5)) {
  fail([
    `当前 Node.js 版本为 ${process.version}，需要 22.5 或更高。`,
    '说明：装了 Node 但版本太旧（16/18/20）也会失败。',
    '请双击「一键配置环境.bat」，或到 https://nodejs.org 安装 22+ 后重开终端。'
  ]);
}

if (!fs.existsSync(nodeModules) || !fs.existsSync(path.join(nodeModules, 'express'))) {
  fail([
    '项目依赖尚未安装（缺少 node_modules / express）。',
    '说明：CMD 里能 node -v 只表示 Node 已安装；',
    '      还需要在本项目目录执行一次「一键配置环境」。',
    '请双击「一键配置环境.bat」，或在项目根目录执行：',
    '  npm install'
  ]);
}

try {
  require('../server/sqlite').openDatabase(':memory:').close();
} catch (err) {
  fail([
    '当前 Node.js 不支持内置 SQLite（node:sqlite）。',
    `详情: ${err.message}`,
    '请升级到 Node.js 22.5+（推荐官网 Windows x64 安装包）。'
  ]);
}

console.log(`[env] Node ${process.version}，依赖检查通过（通用版：内置 SQLite，无需原生编译）`);
