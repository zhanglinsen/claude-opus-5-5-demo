// src/mobile/fullscreen.js 模块测试（任务 7）：installEnv + 假 game/touch。
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { attach } from '../../../src/mobile/fullscreen.js';
import { installEnv, makeFakeGame, makeFakeTouch, press } from './helpers/fake-env.mjs';

let env = null;
let savedScreen = null;
afterEach(() => {
  if (savedScreen) { Object.defineProperty(globalThis, 'screen', savedScreen); savedScreen = null; }
  if (env) { env.restore(); env = null; }
});

function withScreen(value) {
  savedScreen = Object.getOwnPropertyDescriptor(globalThis, 'screen') || { value: undefined, configurable: true, writable: true };
  Object.defineProperty(globalThis, 'screen', { value, configurable: true, writable: true });
}

function setup({ supported = true } = {}) {
  env = installEnv();
  const calls = [];
  if (supported) {
    env.doc.fullscreenEnabled = true;
    env.doc.documentElement.requestFullscreen = (opts) => { calls.push(['request', opts]); return Promise.resolve(); };
    env.doc.exitFullscreen = () => { calls.push(['exit']); return Promise.resolve(); };
  }
  const game = makeFakeGame();
  const touch = makeFakeTouch(game);
  const detach = attach(game, touch);
  return { calls, touch, detach, btn: () => touch.button('fullscreen') };
}

test('浏览器不支持 Fullscreen API（iPhone Safari / 无 allowfullscreen 的 iframe）：不创建按钮、不抛错', () => {
  const { touch } = setup({ supported: false });
  assert.equal(touch.buttons.length, 0);
});

test('fullscreenEnabled 为真但没有 requestFullscreen：不创建按钮', () => {
  env = installEnv();
  env.doc.fullscreenEnabled = true;
  const touch = makeFakeTouch(makeFakeGame());
  attach(touch.g, touch);
  assert.equal(touch.buttons.length, 0);
});

test('支持时创建 fullscreen 按钮（本地化键 touch.fullscreen）', () => {
  const { btn } = setup();
  assert.ok(btn());
  assert.equal(btn().spec.labelKey, 'touch.fullscreen');
});

test('点击：requestFullscreen({navigationUI:hide}) 并尽力锁定横屏', () => {
  const locks = [];
  withScreen({ orientation: { lock: (o) => { locks.push(o); return Promise.resolve(); } } });
  const { calls, btn } = setup();
  press(btn());
  assert.deepEqual(calls, [['request', { navigationUI: 'hide' }]]);
  assert.deepEqual(locks, ['landscape']);
});

test('已在全屏时点击改为退出全屏', () => {
  const { calls, btn } = setup();
  env.doc.fullscreenElement = {};
  press(btn());
  assert.deepEqual(calls, [['exit']]);
});

test('Promise 拒绝与同步异常都被吞掉，不外泄', async () => {
  withScreen({ orientation: { lock: () => { throw new Error('NotSupported'); } } });
  const { btn } = setup();
  env.doc.documentElement.requestFullscreen = () => Promise.reject(new Error('denied'));
  assert.doesNotThrow(() => press(btn()));
  await new Promise((r) => setTimeout(r, 0)); // 若拒绝未被捕获，这里会以 unhandled rejection 使测试失败
});

test('没有 screen.orientation 时不抛错，仍会请求全屏', () => {
  withScreen(undefined);
  const { calls, btn } = setup();
  assert.doesNotThrow(() => press(btn()));
  assert.equal(calls.length, 1);
});

test('detach：移除按钮，且幂等', () => {
  const { btn, detach } = setup();
  const b = btn();
  detach();
  assert.equal(b.removed, true);
  assert.doesNotThrow(() => detach());
});
