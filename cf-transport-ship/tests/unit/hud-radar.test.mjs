// HUD.drawRadar 雷达画布尺寸/渐变缓存单元测试（node --test）
// 契约：首帧按 CSS 尺寸（×1.5）设定画布后备存储；CSS 尺寸不变时不重设 width/height、
// 不重建径向渐变；CSS 尺寸变化时恰好重设一次并按新后备尺寸重建渐变（视野扇形颜色/位置不变）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { HUD } from '../../src/hud.js';

// 假画布：clientWidth/Height 为 CSS 输入；width/height 用 setter 记录赋值次数
//（真实 canvas 赋 width/height 会重置后备存储，这正是要避免的重复赋值）
function fakeCanvas(w, h) {
  const cv = { clientWidth: w, clientHeight: h, _w: 0, _h: 0, widthWrites: 0, heightWrites: 0 };
  Object.defineProperty(cv, 'width', { get: () => cv._w, set: (v) => { cv.widthWrites++; cv._w = v; } });
  Object.defineProperty(cv, 'height', { get: () => cv._h, set: (v) => { cv.heightWrites++; cv._h = v; } });
  return cv;
}

// 假 2D 上下文：所有绘制调用记入 calls，createRadialGradient 计数并返回带 spy 的渐变
function fakeCtx() {
  const calls = [];
  const grad = { addColorStop: (...a) => calls.push(['addColorStop', ...a]) };
  const ctx = { calls, gradCreations: 0, fillStyle: null, strokeStyle: null, lineWidth: 0, globalAlpha: 1 };
  for (const m of ['clearRect', 'save', 'restore', 'translate', 'rotate', 'scale', 'drawImage',
    'beginPath', 'moveTo', 'lineTo', 'arc', 'fill', 'stroke', 'closePath']) {
    ctx[m] = (...a) => { calls.push([m, ...a]); };
  }
  ctx.createRadialGradient = (...a) => { ctx.gradCreations++; calls.push(['createRadialGradient', ...a]); return grad; };
  return ctx;
}

// 不走构造器（其依赖完整 DOM），仅搭 drawRadar 所需的最小状态
function makeHud(cssW, cssH) {
  const hud = Object.create(HUD.prototype);
  hud.el = { radar: fakeCanvas(cssW, cssH) };
  hud.radarCtx = fakeCtx();
  hud.radarImg = {}; // 非空即走完整绘制分支
  hud.radarOff = { x: 0, z: 0 };
  hud.radarS = 8;
  return hud;
}

const ME = { pos: { x: 5, z: 6 }, yaw: 0, team: 'BL' };

test('drawRadar：首帧按 CSS 尺寸设定后备存储并创建视野渐变', () => {
  const hud = makeHud(100, 100);
  hud.drawRadar(ME, [], null);
  const cv = hud.el.radar;
  assert.equal(cv.width, 150); // 100 * 1.5 | 0
  assert.equal(cv.height, 150);
  assert.equal(cv.widthWrites, 1);
  assert.equal(cv.heightWrites, 1);
  assert.equal(hud.radarCtx.gradCreations, 1);
  assert.ok(hud.radarCtx.calls.some((c) => c[0] === 'clearRect'));
  // 渐变锚定画布中心、半径 W*0.45（视野扇形位置/形状锁定）
  const g = hud.radarCtx.calls.find((c) => c[0] === 'createRadialGradient');
  assert.deepEqual(g.slice(1), [75, 75, 0, 75, 75, 67.5]);
});

test('drawRadar：CSS 尺寸不变时不重设 width/height、不重建渐变', () => {
  const hud = makeHud(100, 100);
  hud.drawRadar(ME, [], null);
  hud.drawRadar(ME, [], null);
  const cv = hud.el.radar;
  assert.equal(cv.widthWrites, 1); // 第二帧不再触碰后备存储
  assert.equal(cv.heightWrites, 1);
  assert.equal(hud.radarCtx.gradCreations, 1); // 渐变复用
  assert.equal(hud.radarCtx.calls.filter((c) => c[0] === 'clearRect').length, 2); // 逐帧清屏仍在
});

test('drawRadar：CSS 宽度变化时仅重设 width、按新后备尺寸重建渐变', () => {
  const hud = makeHud(100, 100);
  hud.drawRadar(ME, [], null);
  hud.el.radar.clientWidth = 120;
  hud.drawRadar(ME, [], null);
  const cv = hud.el.radar;
  assert.equal(cv.width, 180); // 120 * 1.5 | 0
  assert.equal(cv.widthWrites, 2); // 变化帧恰好一次赋值
  assert.equal(cv.heightWrites, 1); // 高度未变，不得重复赋值（重赋会清空画布）
  assert.equal(hud.radarCtx.gradCreations, 2);
  const g = hud.radarCtx.calls.filter((c) => c[0] === 'createRadialGradient')[1];
  assert.deepEqual(g.slice(1), [90, 75, 0, 90, 75, 81]); // 中心/半径随新后备宽（高度未变仍为 75）
});

test('drawRadar：CSS 高度变化时仅重设 height、渐变按后备尺寸重建', () => {
  const hud = makeHud(100, 100);
  hud.drawRadar(ME, [], null);
  hud.el.radar.clientHeight = 120;
  hud.drawRadar(ME, [], null);
  const cv = hud.el.radar;
  assert.equal(cv.height, 180); // 120 * 1.5 | 0
  assert.equal(cv.heightWrites, 2); // 仅高度维重设
  assert.equal(cv.widthWrites, 1); // 宽度未变，不得重复赋值
  assert.equal(hud.radarCtx.gradCreations, 2); // 渐变按新后备尺寸重建
});
