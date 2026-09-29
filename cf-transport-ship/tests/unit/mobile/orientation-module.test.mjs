// src/mobile/orientation.js 模块测试（任务 7）：installEnv + 假 game/touch。
import test, { mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { attach } from '../../../src/mobile/orientation.js';
import { installEnv, makeFakeGame, makeFakeTouch } from './helpers/fake-env.mjs';

let env = null;
let savedNavigator = null;
afterEach(() => {
  mock.timers.reset();
  if (savedNavigator) { Object.defineProperty(globalThis, 'navigator', savedNavigator); savedNavigator = null; }
  if (env) { env.restore(); env = null; }
});

function setup({ width = 844, height = 390, over = {} } = {}) {
  mock.timers.enable({ apis: ['setInterval'] });
  env = installEnv({ width, height });
  const game = makeFakeGame(over);
  const touch = makeFakeTouch(game);
  const detach = attach(game, touch);
  const guard = () => env.doc.body.children.find((c) => c.id === 'rotateGuard');
  return { game, touch, detach, guard, pauses: () => game.calls.filter((c) => c === 'pause').length };
}

function withUserAgent(ua) {
  savedNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator') || { value: undefined, configurable: true, writable: true };
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: ua }, configurable: true, writable: true });
}

test('对局中变为竖屏：显示遮罩并暂停一次，原因为 orientation', () => {
  const { touch, guard, pauses } = setup();
  assert.equal(guard().style.display, 'none', '初始（横屏）不显示');
  env.setViewport(390, 844);
  assert.equal(guard().style.display, 'flex');
  assert.equal(pauses(), 1);
  assert.deepEqual(touch.pauseReasons, ['orientation']);
  assert.equal(guard().children[0].textContent, 'touch.rotate');
});

test('回到横屏：遮罩隐藏，且不自动继续', () => {
  const { game, guard, pauses } = setup();
  env.setViewport(390, 844);
  env.setViewport(844, 390);
  assert.equal(guard().style.display, 'none');
  assert.equal(game.paused, true, '应停留在暂停界面，由玩家点“继续”');
  assert.equal(game.calls.includes('resume'), false);
  assert.equal(pauses(), 1);
});

test('大厅/结算（playing=false）竖屏：不显示遮罩，不暂停', () => {
  for (const over of [{ playing: false }, { playing: false, ended: true }]) {
    const { guard, pauses } = setup({ over });
    env.setViewport(390, 844);
    assert.equal(guard().style.display, 'none', JSON.stringify(over));
    assert.equal(pauses(), 0);
    mock.timers.reset(); env.restore(); env = null;
  }
});

test('竖屏的大厅里直接开始对局（方向没变、没有 change 事件）：轮询发现并拦下', () => {
  const { game, guard, pauses } = setup({ width: 390, height: 844, over: { playing: false } });
  mock.timers.tick(600);
  assert.equal(guard().style.display, 'none', '还在大厅');
  game.playing = true; // 玩家点了“开始”
  mock.timers.tick(600);
  assert.equal(guard().style.display, 'flex', '竖屏开局未显示遮罩：只靠 change 事件会漏掉这种情况');
  assert.equal(pauses(), 1);
});

test('竖屏时玩家试图继续：遮罩仍在，会被再次暂停；回到横屏后才停止轮询', () => {
  const { game, guard, pauses } = setup();
  env.setViewport(390, 844);
  game.paused = false; // 假设从遮罩后面继续了
  mock.timers.tick(600);
  assert.equal(game.paused, true);
  assert.equal(pauses(), 2);
  env.setViewport(844, 390);
  game.paused = false;
  mock.timers.tick(2000);
  assert.equal(game.paused, false, '横屏后轮询应已停止，不应再暂停');
  assert.equal(guard().style.display, 'none');
});

test('已暂停 / 广告暂停时竖屏：显示遮罩但不重复暂停', () => {
  for (const over of [{ paused: true }, { adPaused: true }]) {
    const { guard, pauses } = setup({ over });
    env.setViewport(390, 844);
    assert.equal(guard().style.display, 'flex', JSON.stringify(over));
    assert.equal(pauses(), 0);
    mock.timers.reset(); env.restore(); env = null;
  }
});

test('来回切换：每次竖屏各暂停一次', () => {
  const { game, pauses } = setup();
  env.setViewport(390, 844); assert.equal(pauses(), 1);
  env.setViewport(844, 390); game.paused = false;
  env.setViewport(390, 844); assert.equal(pauses(), 2);
});

test('iOS UA 才显示“添加到主屏幕”一行', () => {
  withUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1');
  const ios = setup();
  assert.equal(ios.guard().children.length, 2);
  env.setViewport(390, 844);
  assert.equal(ios.guard().children[1].textContent, 'touch.addToHome');
  mock.timers.reset(); env.restore(); env = null;

  withUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36');
  const android = setup();
  assert.equal(android.guard().children.length, 1);
});

test('detach：移除遮罩、停止轮询、不再响应方向变化，且幂等', () => {
  const { game, guard, detach, pauses } = setup({ width: 390, height: 844 });
  const g = guard();
  detach();
  assert.equal(g.removed, true);
  game.paused = false;
  mock.timers.tick(2000);
  env.setViewport(844, 390); env.setViewport(390, 844);
  assert.equal(pauses(), 0, 'detach 后不应再暂停');
  assert.doesNotThrow(() => detach());
});

test('缺少 matchMedia / document.body 时 attach 不抛错', () => {
  env = installEnv();
  const game = makeFakeGame(); const touch = makeFakeTouch(game);
  const saved = globalThis.matchMedia;
  globalThis.matchMedia = undefined;
  assert.doesNotThrow(() => attach(game, touch)());
  globalThis.matchMedia = saved;
  env.doc.body = null;
  assert.doesNotThrow(() => attach(game, touch)());
});
