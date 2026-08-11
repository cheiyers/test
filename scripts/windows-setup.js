'use strict';

/**
 * Windows 一键配置（用 Node 调 npm，避免 npm.cmd 把 CMD 窗口直接关掉）
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
process.chdir(root);

function log(msg) {
  console.log(msg);
}

function fail(msg, code = 1) {
  console.error('');
  console.error('[ERROR]', msg);
  console.error('');
  process.exit(code);
}

function runNpm(args) {
  log('> npm ' + args.join(' '));
  // shell:true on Windows resolves npm.cmd; running as Node child cannot kill the parent .bat console
  const r = spawnSync('npm', args, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: process.env,
    windowsHide: true
  });
  if (r.error) {
    fail('无法启动 npm: ' + r.error.message);
  }
  return r.status == null ? 1 : r.status;
}

function runNode(scriptArgs) {
  const r = spawnSync(process.execPath, scriptArgs, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    windowsHide: true
  });
  if (r.error) {
    fail('无法启动 node: ' + r.error.message);
  }
  return r.status == null ? 1 : r.status;
}

log('========================================');
log('  BOM QC - Setup (via Node)');
log('========================================');
log('');
log('Work dir: ' + root);
log('Node:     ' + process.version);
log('');

const parts = process.versions.node.split('.').map(Number);
const major = parts[0];
const minor = parts[1] || 0;
if (!Number.isFinite(major) || major < 22 || (major === 22 && minor < 5)) {
  fail('需要 Node.js 22.5+，当前是 ' + process.version);
}

log('[1/3] Set npm mirror (npmmirror.com) ...');
let code = runNpm(['config', 'set', 'registry', 'https://registry.npmmirror.com']);
if (code !== 0) {
  log('[WARN] mirror set failed, continue with default registry');
} else {
  log('[OK] npm registry set');
}
log('');

log('[2/3] npm install ...');
const nm = path.join(root, 'node_modules');
if (fs.existsSync(nm)) {
  log('Removing old node_modules ...');
  try {
    fs.rmSync(nm, { recursive: true, force: true });
  } catch (err) {
    fail(
      '无法删除 node_modules，请关闭占用程序后手动删除:\n  ' +
        nm +
        '\n详情: ' +
        err.message
    );
  }
  if (fs.existsSync(nm)) {
    fail('无法删除 node_modules，请手动删除:\n  ' + nm);
  }
}

code = runNpm(['install', '--no-fund', '--no-audit']);
if (code !== 0) {
  fail('npm install 失败，请检查网络后重试（退出码 ' + code + '）', code);
}
log('[OK] npm install finished');
log('');

log('[3/3] Verify ...');
code = runNode([path.join('scripts', 'ensure-deps.js')]);
if (code !== 0) {
  fail('环境验证失败', code);
}

log('');
log('========================================');
log('  SETUP OK');
log('  Next: double-click start.bat');
log('  URL:  http://127.0.0.1:3789');
log('========================================');
process.exit(0);
