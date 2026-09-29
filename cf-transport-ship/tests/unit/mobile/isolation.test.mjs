// scripts/check-mobile-isolation.mjs 的测试（任务 1）：纯函数 + 临时 git 仓库的端到端场景。不联网、不依赖浏览器。
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classify, parseNameStatus, parseHunks, sectionRanges, checkStyle, checkCatalog, checkIndexHtml, run,
} from '../../../scripts/check-mobile-isolation.mjs';

const SCRIPT = fileURLToPath(new URL('../../../scripts/check-mobile-isolation.mjs', import.meta.url));
const CF = 'cf-transport-ship/';

// ---------------- classify ----------------

test('classify：白名单内的路径通过', () => {
  for (const p of [`${CF}src/touch.js`, `${CF}src/mobile/menu.js`, `${CF}src/i18n/catalogs.js`, `${CF}src/style.css`,
    `${CF}src/index.html`, `${CF}tests/unit/mobile/x.test.mjs`, `${CF}scripts/accept-mobile.mjs`, `${CF}README.md`,
    '.ultra/mobile-adaptation/contexts/task-1.md', '.ultra/specs/mobile-adaptation-20260930.md']) {
    assert.equal(classify(p, { status: 'A' }).verdict, 'ok', p);
  }
});

test('classify：性能任务的禁区文件一律 forbidden', () => {
  for (const n of ['hud', 'effects', 'physics', 'game', 'render', 'env', 'player', 'actor', 'weapons', 'bots', 'audio']) {
    assert.equal(classify(`${CF}src/${n}.js`).verdict, 'forbidden', n);
  }
  for (const p of [`${CF}src/ai/x.js`, `${CF}src/combat/x.js`, '.ultra/tasks/tasks.json', '.ultra/tasks/contexts/task-1.md',
    '.ultra/specs/performance-20260929.md', 'pelican-bike/src/main.js', 'qq-speed/src/main.js']) {
    assert.equal(classify(p).verdict, 'forbidden', p);
  }
});

test('classify：白名单之外为 foreign（如 package.json、build.mjs、其它源码）', () => {
  for (const p of [`${CF}package.json`, `${CF}build.mjs`, `${CF}src/map.js`, 'README.md', '.gitignore']) {
    assert.equal(classify(p).verdict, 'foreign', p);
  }
});

test('classify：现有测试是兼容契约，只能新增不能改删；tests/unit/mobile/ 不受限', () => {
  assert.equal(classify(`${CF}tests/unit/touch-i18n.test.mjs`, { status: 'M' }).verdict, 'contract');
  assert.equal(classify(`${CF}tests/unit/touch-i18n.test.mjs`, { status: 'D' }).verdict, 'contract');
  assert.equal(classify(`${CF}tests/unit/new.test.mjs`, { status: 'A' }).verdict, 'ok');
  assert.equal(classify(`${CF}tests/unit/mobile/touch-input.test.mjs`, { status: 'M' }).verdict, 'ok');
});

test('classify：--lane 按所有权判定，且每个 lane 可写自己的报告', () => {
  assert.equal(classify(`${CF}src/mobile/menu.js`, { lane: 'L4' }).verdict, 'ok');
  assert.equal(classify(`${CF}src/mobile/lifecycle.js`, { lane: 'L4' }).verdict, 'lane');
  assert.equal(classify(`${CF}src/touch.js`, { lane: 'L4' }).verdict, 'lane');
  assert.equal(classify(`${CF}src/touch.js`, { lane: 'L3b' }).verdict, 'ok');
  assert.equal(classify('.ultra/mobile-adaptation/reports/L4-report.md', { lane: 'L4' }).verdict, 'ok');
  assert.equal(classify('.ultra/mobile-adaptation/reports/L5-report.md', { lane: 'L4' }).verdict, 'lane');
  assert.equal(classify(`${CF}tests/unit/mobile/touch-menu.test.mjs`, { lane: 'L2b' }).verdict, 'ok', 'L2a/L2b 归 L2');
  assert.equal(classify(`${CF}src/touch.js`, { lane: 'LX' }).verdict, 'lane');
  // 禁区优先于 lane：即使某个 lane 想改 hud.js 也是 forbidden
  assert.equal(classify(`${CF}src/hud.js`, { lane: 'L8' }).verdict, 'forbidden');
});

// ---------------- 解析 ----------------

test('parseNameStatus：A/M/D 与重命名（拆成 D+A）', () => {
  const out = parseNameStatus('A\ta.js\nM\tb.js\nD\tc.js\nR087\told.js\tnew.js\n');
  assert.deepEqual(out, [
    { status: 'A', path: 'a.js' }, { status: 'M', path: 'b.js' }, { status: 'D', path: 'c.js' },
    { status: 'D', path: 'old.js' }, { status: 'A', path: 'new.js' },
  ]);
});

test('parseHunks：省略的计数按 1，0 计数保留', () => {
  const h = parseHunks('@@ -5 +5 @@\n@@ -10,2 +12,0 @@\n@@ -0,0 +30,4 @@\n');
  assert.deepEqual(h, [
    { oldStart: 5, oldCount: 1, newStart: 5, newCount: 1 },
    { oldStart: 10, oldCount: 2, newStart: 12, newCount: 0 },
    { oldStart: 0, oldCount: 0, newStart: 30, newCount: 4 },
  ]);
});

const CSS = [
  '.a{color:red}', '.b{color:blue}', '',
  '/* mobile:begin */', '',
  '/* mobile:shell:begin */', '/* mobile:shell:end */', '',
  '/* mobile:menu:begin */', '/* mobile:menu:end */', '',
  '/* mobile:end */',
];

test('sectionRanges：识别块与各分区（1 起、含哨兵行）', () => {
  const r = sectionRanges(CSS);
  assert.deepEqual(r.block, { begin: 4, end: 12 });
  assert.deepEqual(r.sections.shell, { begin: 6, end: 7 });
  assert.deepEqual(r.sections.menu, { begin: 9, end: 10 });
});

// ---------------- checkStyle ----------------

const withMenuRule = [...CSS.slice(0, 9), 'html.is-touch .x{}', ...CSS.slice(9)]; // 在 menu 分区内新增一行（第 10 行）

test('checkStyle：分区内的新增通过；全局模式只要求在块内', () => {
  const hunks = [{ oldStart: 9, oldCount: 0, newStart: 10, newCount: 1 }];
  assert.deepEqual(checkStyle({ hunks, headLines: withMenuRule, lane: 'L4' }), []);
  assert.deepEqual(checkStyle({ hunks, headLines: withMenuRule, lane: null }), []);
});

test('checkStyle：lane 改了别人的分区 / 块外 / 哨兵行 → 违规', () => {
  const inShell = [{ oldStart: 6, oldCount: 0, newStart: 7, newCount: 1 }];
  const lines = [...CSS.slice(0, 6), 'html.is-touch .y{}', ...CSS.slice(6)];
  assert.equal(checkStyle({ hunks: inShell, headLines: lines, lane: 'L4' }).length, 1, 'L4 改了 shell 分区');
  assert.deepEqual(checkStyle({ hunks: inShell, headLines: lines, lane: 'L6' }), []);
  const outside = [{ oldStart: 1, oldCount: 1, newStart: 1, newCount: 1 }];
  assert.equal(checkStyle({ hunks: outside, headLines: CSS, lane: 'L4' }).length, 1, '块外');
  const sentinel = [{ oldStart: 9, oldCount: 1, newStart: 9, newCount: 1 }];
  assert.equal(checkStyle({ hunks: sentinel, headLines: CSS, lane: 'L4' }).length, 1, '哨兵行不得被改');
});

test('checkStyle：全局模式下删除/修改基线 CSS 违规；新增块前的空行不算', () => {
  assert.equal(checkStyle({ hunks: [{ oldStart: 1, oldCount: 1, newStart: 1, newCount: 1 }], headLines: CSS, lane: null }).length, 1);
  // 追加整个块：hunk 从块前空行（第 3 行）开始
  assert.deepEqual(checkStyle({ hunks: [{ oldStart: 2, oldCount: 0, newStart: 3, newCount: 10 }], headLines: CSS, lane: null }), []);
});

test('checkStyle：没有哨兵块却改了 style.css → 违规；lane 不拥有 style 分区 → 违规', () => {
  assert.equal(checkStyle({ hunks: [{ oldStart: 1, oldCount: 0, newStart: 2, newCount: 1 }], headLines: ['.a{}', '.b{}'], lane: null }).length, 1);
  assert.equal(checkStyle({ hunks: [{ oldStart: 9, oldCount: 0, newStart: 10, newCount: 1 }], headLines: withMenuRule, lane: 'L5' }).length, 1);
});

// ---------------- checkCatalog / checkIndexHtml ----------------

test('checkCatalog：只允许新增 touch.* 键与注释，不允许删除', () => {
  const ok = "@@ -1,0 +2,3 @@\n+    // 手机端适配\n+    'touch.menu': '菜单',\n+\n";
  assert.deepEqual(checkCatalog(ok), []);
  assert.equal(checkCatalog("@@ -3 +3 @@\n-    'hud.x': 'a',\n+    'hud.x': 'b',\n").length, 2, '删除与非 touch 新增各一条');
  assert.equal(checkCatalog("@@ -0,0 +5 @@\n+    'weapon.ak.name': 'AK',\n").length, 1);
});

test('checkIndexHtml：改动行必须全是 <meta>', () => {
  assert.deepEqual(checkIndexHtml('@@ -5 +5,2 @@\n-<meta name="viewport" content="a">\n+<meta name="viewport" content="a,viewport-fit=cover">\n+<meta name="theme-color" content="#05070a">\n'), []);
  assert.equal(checkIndexHtml('@@ -9 +9 @@\n+<script>alert(1)</script>\n').length, 1);
});

// ---------------- 临时 git 仓库的端到端场景 ----------------

const tmpDirs = [];
afterEach(() => { for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

const g = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' });
const put = (cwd, rel, text) => { const f = path.join(cwd, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };

function makeRepo() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'mobile-iso-'));
  tmpDirs.push(cwd);
  g(cwd, 'init', '-q', '-b', 'main');
  put(cwd, `${CF}src/hud.js`, 'export const hud = 1;\n');
  put(cwd, `${CF}src/touch.js`, 'export const t = 1;\n');
  put(cwd, `${CF}src/style.css`, CSS.join('\n') + '\n');
  put(cwd, `${CF}src/i18n/catalogs.js`, "export const C = {\n    'touch.fire': '开火',\n};\n");
  put(cwd, `${CF}src/index.html`, '<meta name="viewport" content="a">\n<title>x</title>\n');
  put(cwd, `${CF}tests/unit/existing.test.mjs`, '// existing\n');
  put(cwd, `${CF}package.json`, '{}\n');
  g(cwd, 'add', '-A'); g(cwd, 'commit', '-q', '-m', 'base');
  g(cwd, 'checkout', '-q', '-b', 'feature');
  return cwd;
}
const commit = (cwd) => { g(cwd, 'add', '-A'); g(cwd, 'commit', '-q', '-m', 'change'); };

test('端到端：只新增白名单内文件 → 通过', () => {
  const cwd = makeRepo();
  put(cwd, `${CF}src/mobile/x.js`, 'export {};\n');
  put(cwd, `${CF}tests/unit/mobile/x.test.mjs`, '// t\n');
  commit(cwd);
  const r = run({ base: 'main', head: 'feature', cwd });
  assert.deepEqual(r.violations, []);
});

test('端到端：改了禁区/白名单外/现有测试 → 各自违规', () => {
  const cwd = makeRepo();
  put(cwd, `${CF}src/hud.js`, 'export const hud = 2;\n');
  put(cwd, `${CF}package.json`, '{"a":1}\n');
  put(cwd, `${CF}tests/unit/existing.test.mjs`, '// changed\n');
  commit(cwd);
  const v = run({ base: 'main', head: 'feature', cwd }).violations.join('\n');
  assert.match(v, /src\/hud\.js：性能任务的禁区/);
  assert.match(v, /package\.json：不在白名单/);
  assert.match(v, /existing\.test\.mjs：现有测试是兼容契约/);
});

test('端到端：不带 --head 时检查工作区，含未提交与未跟踪的改动', () => {
  const cwd = makeRepo();
  put(cwd, `${CF}src/hud.js`, 'export const hud = 3;\n'); // 未提交的修改
  put(cwd, `${CF}src/game.js`, 'export {};\n'); // 未跟踪
  const v = run({ base: 'main', cwd }).violations.join('\n');
  assert.match(v, /src\/hud\.js/);
  assert.match(v, /src\/game\.js/);
});

test('端到端：lane 越权与 style.css 分区', () => {
  const cwd = makeRepo();
  put(cwd, `${CF}src/mobile/menu.js`, 'export {};\n');
  put(cwd, `${CF}src/mobile/lifecycle.js`, 'export {};\n');
  const css = CSS.slice(); css.splice(9, 0, 'html.is-touch .x{}');
  put(cwd, `${CF}src/style.css`, css.join('\n') + '\n');
  commit(cwd);
  const v = run({ base: 'main', head: 'feature', lane: 'L4', cwd }).violations.join('\n');
  assert.match(v, /lifecycle\.js：不属于 L4/);
  assert.doesNotMatch(v, /menu\.js/);
  assert.doesNotMatch(v, /style\.css/, 'menu 分区内的新增应通过');
});

test('端到端：catalogs/index.html 的形态检查', () => {
  const cwd = makeRepo();
  put(cwd, `${CF}src/i18n/catalogs.js`, "export const C = {\n    'touch.fire': '开火',\n    'touch.menu': '菜单',\n    'hud.bad': 'x',\n};\n");
  put(cwd, `${CF}src/index.html`, '<meta name="viewport" content="b">\n<title>y</title>\n');
  commit(cwd);
  const v = run({ base: 'main', head: 'feature', cwd }).violations.join('\n');
  assert.match(v, /catalogs\.js 新增了 touch\.\* 键与注释以外的内容/);
  assert.match(v, /index\.html 的改动不是 <meta> 行：<title>y<\/title>/);
});

test('端到端：ref 不存在抛出可读错误', () => {
  const cwd = makeRepo();
  assert.throws(() => run({ base: 'nope', cwd }), /ref 不存在：nope/);
  assert.throws(() => run({ base: 'main', head: 'nope', cwd }), /ref 不存在：nope/);
});

test('CLI：退出码 0 / 1 / 2', () => {
  const cwd = makeRepo();
  put(cwd, `${CF}src/mobile/x.js`, 'export {};\n');
  commit(cwd);
  const cli = (...args) => spawnSync('node', [SCRIPT, ...args], { cwd, encoding: 'utf8' });
  assert.equal(cli('--base', 'main').status, 0);
  put(cwd, `${CF}src/hud.js`, 'export const hud = 9;\n');
  commit(cwd);
  const bad = cli('--base', 'main');
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /✖ cf-transport-ship\/src\/hud\.js/);
  assert.equal(cli('--base', 'nope').status, 2);
  assert.equal(cli('--bogus').status, 2);
  assert.equal(cli('--lane').status, 2, '缺少参数值');
});

test('真实仓库：当前分支相对性能基线没有越界改动（守卫的实际用例）', () => {
  // 仓库外运行（如源码包）时没有该基线，跳过而不是假装通过
  const here = path.dirname(SCRIPT);
  let r;
  try { r = run({ cwd: here }); } catch (e) { return; }
  assert.deepEqual(r.violations, [], `相对性能基线有越界改动：\n${r.violations.join('\n')}`);
});
