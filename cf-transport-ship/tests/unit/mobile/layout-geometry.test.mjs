// 触屏布局几何测试（任务 3/8 的基础部分）。纯函数，不依赖 DOM/浏览器/GPU。
// 契约：.ultra/mobile-adaptation/dispatch/contract.md
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeLayout, ACTS, MIN_TARGET, SLOT_COUNT, padZoneWidth } from '../../../src/mobile/layout.js';

const NOTCH = { top: 0, right: 47, bottom: 21, left: 47 }; // iPhone 横屏典型安全区

const rectsOverlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// 矩形到圆心的最近距离（圆心在矩形内为 0）
function distToCircle(r, c) {
  const dx = Math.max(r.x - c.cx, 0, c.cx - (r.x + r.w));
  const dy = Math.max(r.y - c.cy, 0, c.cy - (r.y + r.h));
  return Math.hypot(dx, dy);
}

function assertInside(layout, label) {
  for (const act of ACTS) {
    const it = layout.items[act];
    assert.ok(it.x >= 0 && it.y >= 0 && it.x + it.w <= layout.w && it.y + it.h <= layout.h,
      `${label}: ${act} 超出视口 (x=${it.x}, y=${it.y}, size=${it.size})`);
  }
}

function assertLandscapeContract(w, h, safe, label) {
  const layout = computeLayout(w, h, safe);
  assertInside(layout, label);
  for (const act of ACTS) {
    if (act === 'pad') continue;
    assert.ok(layout.items[act].size >= MIN_TARGET, `${label}: ${act} 边长 ${layout.items[act].size} < ${MIN_TARGET}`);
  }
  for (let i = 0; i < ACTS.length; i++) {
    for (let j = i + 1; j < ACTS.length; j++) {
      assert.ok(!rectsOverlap(layout.items[ACTS[i]], layout.items[ACTS[j]]),
        `${label}: ${ACTS[i]} 与 ${ACTS[j]} 重叠`);
    }
  }
  for (const act of ACTS) {
    assert.ok(distToCircle(layout.items[act], layout.center) >= layout.center.r,
      `${label}: ${act} 进入准星视野区 (r=${layout.center.r})`);
  }
}

test('横屏（无安全区）：视口内、≥44px、互不重叠、避开准星区', () => {
  for (const [w, h] of [[844, 390], [932, 430], [667, 375], [800, 360]]) {
    assertLandscapeContract(w, h, undefined, `${w}x${h}`);
  }
});

test('横屏（含刘海/横条安全区）：同样满足契约', () => {
  for (const [w, h] of [[844, 390], [812, 375]]) {
    assertLandscapeContract(w, h, NOTCH, `${w}x${h}+safe`);
  }
});

test('竖屏 390×844：只要求都在视口内且不抛错（竖屏对局由任务 7 强制暂停）', () => {
  const layout = computeLayout(390, 844);
  assert.equal(layout.portrait, true);
  assertInside(layout, '390x844');
});

test('844×390 下既有按钮与旧 touch.js 的硬编码坐标完全一致（已工作的横屏体验不变）', () => {
  const { items } = computeLayout(844, 390);
  const old = {
    pad: { left: 28, bottom: 40, size: 140 },
    fire: { right: 40, bottom: 150, size: 84 },
    fire2: { left: 186, bottom: 250, size: 64 }, // 旧实现 right = W-250，等价于 left = 186
    jump: { right: 140, bottom: 60, size: 60 },
    crouch: { right: 210, bottom: 40, size: 54 },
    reload: { right: 40, bottom: 250, size: 50 },
    swap: { right: 100, bottom: 250, size: 50 },
    scope: { right: 40, bottom: 60, size: 60 },
    c4: { right: 160, bottom: 150, size: 54 },
    e: { right: 160, bottom: 212, size: 54 },
    g: { right: 222, bottom: 155, size: 50 },
  };
  for (const [act, spec] of Object.entries(old)) {
    for (const [k, v] of Object.entries(spec)) assert.equal(items[act][k], v, `${act}.${k}`);
  }
});

test('每个控件在水平/垂直方向各只有一个锚点，避免旋转后残留旧锚点', () => {
  for (const [w, h] of [[844, 390], [390, 844]]) {
    const { items } = computeLayout(w, h);
    for (const act of ACTS) {
      const it = items[act];
      assert.equal((it.left != null) + (it.right != null), 1, `${act} 水平锚点`);
      assert.equal((it.top != null) + (it.bottom != null), 1, `${act} 垂直锚点`);
    }
  }
});

test('安全区叠加到对应锚点上，不改变边长', () => {
  const a = computeLayout(844, 390);
  const b = computeLayout(844, 390, NOTCH);
  assert.equal(b.items.fire.right, a.items.fire.right + NOTCH.right);
  assert.equal(b.items.fire.bottom, a.items.fire.bottom + NOTCH.bottom);
  assert.equal(b.items.pad.left, a.items.pad.left + NOTCH.left);
  assert.equal(b.items.fire.size, a.items.fire.size);
});

test('新增控件齐全：顶部栏 5 个 + 槽位 4 个', () => {
  for (const act of ['menu', 'board', 'loadout', 'inspect', 'fullscreen']) assert.ok(ACTS.includes(act), act);
  for (let i = 1; i <= SLOT_COUNT; i++) assert.ok(ACTS.includes('slot' + i), 'slot' + i);
});

test('非法安全区输入按 0 处理，不产生 NaN', () => {
  const l = computeLayout(844, 390, { top: NaN, right: undefined, bottom: 'x', left: null });
  for (const act of ACTS) {
    const it = l.items[act];
    assert.ok(Number.isFinite(it.x) && Number.isFinite(it.y), act);
  }
});

test('摇杆有效起始区为屏幕左侧 40%', () => {
  assert.equal(padZoneWidth(1000), 400);
});

test.todo('紧凑高度（h < 360，如带地址栏的 Android，约 320–340）的布局：装弹/切枪键与顶部栏冲突，见任务 8');
