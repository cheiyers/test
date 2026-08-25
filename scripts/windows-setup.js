'use strict';

/**
 * Windows 一键配置（不依赖 PATH 里的 npm.cmd，避免窗口闪退 / 找不到 npm）
 * 失败时写入 setup-log.txt，方便对照排查。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const logFile = path.join(root, 'setup-log.txt');
process.chdir(root);

const lines = [];

function stamp() {
  return new Date().toISOString();
}

function log(msg) {
  const s = String(msg);
  console.log(s);
  lines.push(s);
}

function logErr(msg) {
  const s = String(msg);
  console.error(s);
  lines.push(s);
}

function flushLog() {
  try {
    fs.writeFileSync(logFile, lines.join('\n') + '\n', 'utf8');
  } catch (_) {
    /* ignore */
  }
}

function fail(msg, code = 1) {
  logErr('');
  logErr('[ERROR] ' + msg);
  logErr('');
  logErr('已写入日志: ' + logFile);
  logErr('请把该文件内容发给管理员，或把窗口里红色/最后 30 行发过来。');
  logErr('');
  flushLog();
  process.exit(code);
}

function whichNpmCli() {
  const nodeDir = path.dirname(process.execPath);
  const candidates = [
    path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'npm', 'bin', 'npm-cli.js')
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

function runNpm(args, envExtra = {}) {
  const npmCli = whichNpmCli();
  const env = { ...process.env, ...envExtra };
  log('> npm ' + args.join(' '));

  let r;
  if (npmCli) {
    log('  (via npm-cli.js: ' + npmCli + ')');
    r = spawnSync(process.execPath, [npmCli, ...args], {
      cwd: root,
      stdio: 'inherit',
      env,
      windowsHide: true
    });
  } else {
    log('  (fallback: npm.cmd on PATH)');
    r = spawnSync('npm', args, {
      cwd: root,
      stdio: 'inherit',
      shell: true,
      env,
      windowsHide: true
    });
  }

  if (r.error) {
    fail('无法启动 npm: ' + r.error.message + '\n请确认 Node 安装完整（应带 npm）。可重装 https://nodejs.org');
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

function assertWritable() {
  const probe = path.join(root, '.setup-write-test');
  try {
    fs.writeFileSync(probe, 'ok', 'utf8');
    fs.unlinkSync(probe);
  } catch (err) {
    fail(
      '当前目录没有写入权限，无法安装依赖。\n' +
        '目录: ' + root + '\n' +
        '详情: ' + err.message + '\n' +
        '请把项目拷到本地磁盘（如 D:\\bom-qc），不要放在只读 U 盘 / 未授权网络盘。'
    );
  }
}

function safeRemoveNodeModules() {
  const nm = path.join(root, 'node_modules');
  if (!fs.existsSync(nm)) return true;
  log('Removing old node_modules ...');
  try {
    fs.rmSync(nm, { recursive: true, force: true });
  } catch (err) {
    logErr('[WARN] 无法完全删除 node_modules: ' + err.message);
    logErr('将改为在原目录上继续 npm install（请先关闭杀毒/占用程序）');
    return false;
  }
  if (fs.existsSync(nm)) {
    logErr('[WARN] node_modules 仍在，继续覆盖安装');
    return false;
  }
  return true;
}

function tryInstall(registry) {
  const envExtra = {};
  if (registry) {
    envExtra.npm_config_registry = registry;
    log('Using registry: ' + registry);
  }
  return runNpm(['install', '--no-fund', '--no-audit', '--prefer-offline=false'], envExtra);
}

// ---- main ----
try {
  fs.writeFileSync(logFile, '', 'utf8');
} catch (_) {
  /* ignore */
}

log('========================================');
log('  BOM QC - Setup (via Node)');
log('========================================');
log('Time:     ' + stamp());
log('Work dir: ' + root);
log('Node:     ' + process.version + ' @ ' + process.execPath);
log('Platform: ' + process.platform + ' ' + os.arch() + ' / ' + os.release());
log('npm-cli:  ' + (whichNpmCli() || '(not found beside node)'));
log('');

const parts = process.versions.node.split('.').map(Number);
const major = parts[0];
const minor = parts[1] || 0;
if (!Number.isFinite(major) || major < 22 || (major === 22 && minor < 5)) {
  fail(
    '需要 Node.js 22.5+，当前是 ' +
      process.version +
      '\n请到 https://nodejs.org 安装 22+，勾选 Add to PATH，重开 CMD 后再运行一键配置。'
  );
}

assertWritable();

if (!whichNpmCli()) {
  // still try PATH npm, but warn early
  log('[WARN] 未在 Node 目录找到 npm-cli.js，将尝试 PATH 中的 npm');
}

log('[1/3] Set preferred npm mirror ...');
let code = runNpm(['config', 'set', 'registry', 'https://registry.npmmirror.com']);
if (code !== 0) {
  log('[WARN] 无法写入 npm 全局配置，将在安装时用环境变量指定镜像');
} else {
  log('[OK] registry = https://registry.npmmirror.com');
}
log('');

log('[2/3] npm install ...');
safeRemoveNodeModules();

const registries = [
  'https://registry.npmmirror.com',
  'https://registry.npmjs.org'
];

code = 1;
let lastReg = '';
for (const reg of registries) {
  lastReg = reg;
  log('');
  log('--- try install via ' + reg + ' ---');
  code = tryInstall(reg);
  if (code === 0) break;
  logErr('[WARN] install failed with ' + reg + ' (exit ' + code + ')');
}

if (code !== 0) {
  fail(
    'npm install 失败（最后镜像: ' +
      lastReg +
      '，退出码 ' +
      code +
      '）。\n' +
      '常见原因：\n' +
      '  1) 公司网络/防火墙拦截 npm（换手机热点再试）\n' +
      '  2) 杀毒软件锁定 node_modules（临时退出杀毒）\n' +
      '  3) 项目在 OneDrive/网盘同步目录（拷到 D:\\本地文件夹）\n' +
      '  4) Node 安装不完整，没有 npm（重装 Node 22+ 官网包）\n' +
      '也可手动在本目录打开 CMD 执行：\n' +
      '  node scripts\\windows-setup.js',
    code
  );
}
log('[OK] npm install finished');
log('');

log('[3/3] Verify ...');
code = runNode([path.join('scripts', 'ensure-deps.js')]);
if (code !== 0) {
  fail('环境验证失败（ensure-deps）。请看上方报错。', code);
}

if (!fs.existsSync(path.join(root, 'node_modules', 'express'))) {
  fail('验证失败：仍缺少 node_modules/express');
}

log('');
log('========================================');
log('  SETUP OK');
log('  Next: double-click start.bat / 开始运行.bat');
log('  URL:  http://127.0.0.1:3789');
log('  Log:  ' + logFile);
log('========================================');
flushLog();
process.exit(0);
