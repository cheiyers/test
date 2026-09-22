'use strict';

/**
 * 输出环境诊断到 diagnose-log.txt，方便“版本 OK 仍配置失败”时排查。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const outFile = path.join(root, 'diagnose-log.txt');
const lines = [];

function L(s) {
  const t = String(s);
  console.log(t);
  lines.push(t);
}

function run(cmd, args) {
  try {
    const r = spawnSync(cmd, args, {
      cwd: root,
      encoding: 'utf8',
      shell: true,
      windowsHide: true,
      timeout: 15000
    });
    const out = ((r.stdout || '') + (r.stderr || '')).trim();
    return { code: r.status, out: out.slice(0, 2000), error: r.error && r.error.message };
  } catch (err) {
    return { code: -1, out: '', error: err.message };
  }
}

L('========================================');
L('  BOM QC - Diagnose');
L('========================================');
L('Time: ' + new Date().toISOString());
L('Dir:  ' + root);
L('');

L('[Node]');
L('  process.version = ' + process.version);
L('  process.execPath = ' + process.execPath);
L('  platform = ' + process.platform + ' ' + os.arch());
L('');

const whereNode = run('where', ['node']);
L('[where node] exit=' + whereNode.code);
L(whereNode.out || whereNode.error || '(empty)');
L('');

const whereNpm = run('where', ['npm']);
L('[where npm] exit=' + whereNpm.code);
L(whereNpm.out || whereNpm.error || '(empty)');
L('');

const nodeDir = path.dirname(process.execPath);
const npmCli = path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js');
L('[npm-cli.js beside node]');
L('  ' + npmCli);
L('  exists = ' + fs.existsSync(npmCli));
L('');

const npmV = run('node', [npmCli, '-v']);
if (fs.existsSync(npmCli)) {
  L('[node npm-cli.js -v] exit=' + npmV.code);
  L(npmV.out || npmV.error || '(empty)');
} else {
  const npmV2 = run('npm', ['-v']);
  L('[npm -v] exit=' + npmV2.code);
  L(npmV2.out || npmV2.error || '(empty)');
}
L('');

L('[project files]');
for (const rel of ['package.json', 'node_modules', 'node_modules/express', 'setup-log.txt']) {
  const p = path.join(root, rel);
  L('  ' + rel + ' => ' + (fs.existsSync(p) ? 'YES' : 'NO'));
}
L('');

L('[write test]');
try {
  const probe = path.join(root, '.diagnose-write-test');
  fs.writeFileSync(probe, 'ok');
  fs.unlinkSync(probe);
  L('  writable = YES');
} catch (err) {
  L('  writable = NO (' + err.message + ')');
}
L('');

L('[npm config get registry]');
const reg = run('npm', ['config', 'get', 'registry']);
L('  exit=' + reg.code + ' ' + (reg.out || reg.error || ''));
L('');

L('Saved to: ' + outFile);
L('请把 diagnose-log.txt 发给技术支持。');

try {
  fs.writeFileSync(outFile, lines.join('\n') + '\n', 'utf8');
} catch (err) {
  console.error('无法写入 diagnose-log.txt:', err.message);
  process.exit(1);
}
