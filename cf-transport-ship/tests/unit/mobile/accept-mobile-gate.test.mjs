// scripts/accept-mobile.mjs 的测试（任务 9）。脚本**主体不能运行**（会占用浏览器/GPU，性能任务在独占它们）；
// 这里只测：拒绝路径（唯一允许运行的部分，CPU 极轻）、可脱离浏览器的纯函数、以及脚本与真实实现之间的静态耦合。
//
// 绝对不要在这里以 MOBILE_E2E_GPU_FREE=1 启动脚本：如果 dist/ 恰好存在，它会真的拉起浏览器。
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLayout, rectsOverlap, distToCircle, parseArgs, VIEWPORTS, PORTRAIT, UNCOVERED, GATE_ENV } from '../../../scripts/accept-mobile.mjs';
import { ACTS } from '../../../src/mobile/layout.js';

const CF = fileURLToPath(new URL('../../../', import.meta.url));
const SCRIPT = path.join(CF, 'scripts', 'accept-mobile.mjs');
const src = fs.readFileSync(SCRIPT, 'utf8');

// ---------------- 门（拒绝路径）----------------

test('没有 MOBILE_E2E_GPU_FREE：退出码 3、给出三个前置条件、很快返回、不创建任何产物', () => {
  const outDir = path.join(CF, 'artifacts', 'mobile');
  const existedBefore = fs.existsSync(outDir);
  const env = { ...process.env };
  delete env[GATE_ENV];
  const t0 = Date.now();
  const r = spawnSync('node', [SCRIPT], { cwd: CF, encoding: 'utf8', env, timeout: 15000 });
  const elapsed = Date.now() - t0;
  assert.equal(r.status, 3, `应以退出码 3 拒绝，实际 ${r.status}；stderr=${r.stderr}`);
  assert.match(r.stderr, /MOBILE_E2E_GPU_FREE=1/);
  assert.match(r.stderr, /用户同意/);
  assert.match(r.stderr, /释放浏览器\/GPU/);
  assert.ok(elapsed < 5000, `拒绝路径应很快返回，实际 ${elapsed}ms（说明可能加载了 playwright 或起了服务）`);
  assert.equal(fs.existsSync(outDir), existedBefore, '拒绝路径不应创建产物目录');
});

test('环境变量不是恰好 "1"（如 "true"、"0"、空）同样拒绝', () => {
  for (const value of ['true', '0', '', 'yes']) {
    const r = spawnSync('node', [SCRIPT], { cwd: CF, encoding: 'utf8', env: { ...process.env, [GATE_ENV]: value }, timeout: 15000 });
    assert.equal(r.status, 3, `${JSON.stringify(value)} 应被拒绝`);
  }
});

test('拒绝发生在其它一切之前：即使带了未知参数也先按门拒绝（退出码 3 而不是 2）', () => {
  const env = { ...process.env }; delete env[GATE_ENV];
  const r = spawnSync('node', [SCRIPT, '--bogus'], { cwd: CF, encoding: 'utf8', env, timeout: 15000 });
  assert.equal(r.status, 3);
});

test('静态：playwright 只能动态导入，且门检查在导入之前', () => {
  assert.doesNotMatch(src, /^import[^\n]*playwright-core/m, 'playwright-core 不能静态导入：否则拒绝路径也会加载它');
  assert.doesNotMatch(src, /^import[^\n]*serve\.mjs/m, 'serve.mjs 不能静态导入：拒绝路径不应起服务');
  const gate = src.indexOf("process.env[GATE_ENV] !== '1'");
  const importPlaywright = src.indexOf("await import('playwright-core')");
  const importServe = src.indexOf("await import('./serve.mjs')");
  assert.ok(gate > 0 && importPlaywright > gate && importServe > gate, '门检查必须先于 playwright 与 serve 的导入');
  assert.ok(src.indexOf('startServer(') > gate, '起服务必须在门之后');
});

// ---------------- 纯函数 ----------------

const goodData = () => ({
  innerWidth: 844, innerHeight: 390, scrollWidth: 844,
  touch: [
    { id: 'btn:fire', button: true, x: 720, y: 156, w: 84, h: 84 },
    { id: 'btn:jump', button: true, x: 644, y: 270, w: 60, h: 60 },
    { id: 'pad', button: false, x: 28, y: 210, w: 140, h: 140 },
  ],
  hud: [
    { id: 'radarWrap', x: 12, y: 8, w: 100, h: 100 },
    { id: 'vitals', x: 184, y: 294, w: 140, h: 36 },
  ],
});

test('checkLayout：合规数据通过', () => {
  assert.deepEqual(checkLayout(goodData()), []);
});

test('checkLayout：横向溢出 / 出屏 / 触控目标过小 / 触控件与 HUD 重叠 / 进入准星区 都能报出', () => {
  const overflow = goodData(); overflow.scrollWidth = 900;
  assert.match(checkLayout(overflow).join('|'), /横向溢出/);
  const off = goodData(); off.touch[0].x = 800;
  assert.match(checkLayout(off).join('|'), /btn:fire 出屏/);
  const small = goodData(); small.touch[1].w = 30; small.touch[1].h = 30;
  assert.match(checkLayout(small).join('|'), /btn:jump 触控目标过小/);
  const overlap = goodData(); overlap.hud[1] = { id: 'ammo', x: 700, y: 160, w: 100, h: 60 };
  assert.match(checkLayout(overlap).join('|'), /触控件 btn:fire 与 HUD ammo 重叠|HUD ammo 与 触控件 btn:fire 重叠/);
  const centre = goodData(); centre.hud.push({ id: 'feed', x: 380, y: 180, w: 80, h: 30 });
  assert.match(checkLayout(centre).join('|'), /HUD feed 进入准星视野区/);
});

test('checkLayout：HUD 块之间的重叠不在这里报（由 hud-geometry 保证）；pad 不受 44px 限制', () => {
  const d = goodData(); d.hud.push({ id: 'score', x: 190, y: 296, w: 100, h: 30 }); // 与 vitals 重叠，但都是 HUD
  assert.deepEqual(checkLayout(d), []);
});

test('rectsOverlap / distToCircle', () => {
  assert.equal(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }), true);
  assert.equal(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 }), false, '相接不算重叠');
  assert.equal(distToCircle({ x: 0, y: 0, w: 10, h: 10 }, { cx: 5, cy: 5, r: 3 }), 0);
  assert.equal(distToCircle({ x: 20, y: 0, w: 10, h: 10 }, { cx: 0, cy: 5, r: 3 }), 20);
});

test('parseArgs：--out 与错误参数', () => {
  assert.equal(parseArgs(['--out', '/tmp/x']).out, '/tmp/x');
  assert.match(parseArgs([]).out, /artifacts[\\/]mobile$/);
  assert.throws(() => parseArgs(['--out']), /需要一个目录参数/);
  assert.throws(() => parseArgs(['--bogus']), /未知参数/);
});

// ---------------- 静态耦合：脚本用到的东西必须真实存在 ----------------

test('视口矩阵与静态几何测试一致，并含一个竖屏', () => {
  const dims = VIEWPORTS.map((v) => `${v.w}x${v.h}`);
  for (const d of ['844x390', '932x430', '667x375', '800x360']) assert.ok(dims.includes(d), d);
  assert.ok(PORTRAIT.h > PORTRAIT.w);
});

test('脚本引用的 data-act 都属于 layout.js 的 ACTS（防止选择器与实现漂移）', () => {
  const used = new Set([...src.matchAll(/data-act="([a-z0-9]+)"/g)].map((m) => m[1]));
  assert.ok(used.size >= 3, '脚本应至少引用 menu/board/fire');
  for (const act of used) assert.ok(ACTS.includes(act), `脚本引用了不存在的 data-act：${act}`);
});

test('脚本引用的元素 id 在真实实现里存在', () => {
  const hud = fs.readFileSync(path.join(CF, 'src', 'hud.js'), 'utf8');
  for (const id of ['pause', 'btnResume', 'board', 'btnStart', 'menu', 'radarWrap', 'score', 'feed', 'vitals', 'ammo', 'nadeInfo', 'slotC4']) {
    assert.match(hud, new RegExp(`id="${id}"`), `hud.js 模板里没有 id="${id}"`);
  }
  const orientation = fs.readFileSync(path.join(CF, 'src', 'mobile', 'orientation.js'), 'utf8');
  assert.match(orientation, /guard\.id = 'rotateGuard'/);
  const game = fs.readFileSync(path.join(CF, 'src', 'game.js'), 'utf8');
  assert.match(game, /window\.__game = this/, '脚本依赖 window.__game');
  assert.match(fs.readFileSync(path.join(CF, 'src', 'actor.js'), 'utf8'), /this\.stats = \{[^}]*shots/, '脚本依赖 player.stats.shots');
});

test('未覆盖清单齐全（iOS 缩放/下拉刷新、刘海、音频 interrupted、全屏与方向锁定、紧凑屏）', () => {
  const text = UNCOVERED.join('\n');
  for (const k of ['双击/捏合缩放', '刘海', 'interrupted', 'requestFullscreen', '高度 < 360']) assert.match(text, new RegExp(k.replace(/[/.<]/g, '\\$&')));
});
