// src/mobile/lifecycle.js 模块测试（任务 5）：installEnv + 假 game/touch，不 import touch.js。
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { attach } from '../../../src/mobile/lifecycle.js';
import { installEnv, makeFakeGame, makeFakeTouch } from './helpers/fake-env.mjs';

let env = null;
afterEach(() => { if (env) { env.restore(); env = null; } });

function setup(over = {}) {
  env = installEnv();
  const game = makeFakeGame(over);
  const touch = makeFakeTouch(game);
  const detach = attach(game, touch);
  return { game, touch, detach, count: (name) => game.calls.filter((c) => c === name).length };
}

test('切后台（visibilitychange hidden）：清输入 + 暂停一次 + 挂起音频', () => {
  const { touch, game, count } = setup();
  env.setHidden(true);
  assert.ok(touch.resetCount >= 1, '未清触屏输入'); // requestPause 内部也会清，所以是“至少一次”
  assert.equal(game.paused, true);
  assert.equal(count('pause'), 1);
  assert.deepEqual(touch.pauseReasons, ['lifecycle']);
  assert.equal(count('audio.suspend'), 1, '未挂起音频：audio.js 的兜底心跳会让声音继续');
});

test('pagehide 同样处理', () => {
  const { touch, count } = setup();
  env.emit(env.win, 'pagehide');
  assert.ok(touch.resetCount >= 1, '未清触屏输入');
  assert.equal(count('pause'), 1);
  assert.equal(count('audio.suspend'), 1);
});

test('页面重新可见（hidden=false）不触发任何动作，也不自动继续', () => {
  const { touch, game, count } = setup();
  env.setHidden(false);
  assert.equal(touch.resetCount, 0);
  assert.equal(count('pause'), 0);
  env.setHidden(true);
  env.setHidden(false);
  assert.equal(game.paused, true, '返回后应停留在暂停界面，由玩家点“继续”');
  assert.equal(count('resume'), 0);
});

test('连续触发两次只暂停一次、只挂起一次音频', () => {
  const { count } = setup();
  env.setHidden(true);
  env.emit(env.win, 'pagehide');
  assert.equal(count('pause'), 1);
  assert.equal(count('audio.suspend'), 1);
});

test('广告暂停期间：不覆盖广告暂停，但仍清输入并静音', () => {
  const { touch, count } = setup({ adPaused: true });
  env.setHidden(true);
  assert.equal(count('pause'), 0);
  assert.equal(touch.resetCount, 1);
  assert.equal(count('audio.suspend'), 1);
});

test('玩家已暂停：不重复暂停，但仍静音', () => {
  const { touch, count } = setup({ paused: true });
  env.setHidden(true);
  assert.equal(count('pause'), 0);
  assert.equal(touch.resetCount, 1);
  assert.equal(count('audio.suspend'), 1);
});

test('大厅/结算（playing=false）不触发任何动作', () => {
  for (const over of [{ playing: false }, { playing: false, ended: true }]) {
    const { touch, count } = setup(over);
    env.setHidden(true);
    env.emit(env.win, 'pagehide');
    assert.equal(touch.resetCount, 0, JSON.stringify(over));
    assert.equal(count('pause'), 0);
    assert.equal(count('audio.suspend'), 0);
    env.restore(); env = null;
  }
});

test('恢复：挂起后的首个 touchstart 调用 audio.init 一次，之后不再调用', () => {
  const { count } = setup();
  env.setHidden(true);
  assert.equal(count('audio.init'), 0, '不应在没有用户手势时恢复音频');
  env.emit(env.win, 'touchstart');
  assert.equal(count('audio.init'), 1);
  env.emit(env.win, 'touchstart');
  assert.equal(count('audio.init'), 1, '一次性监听，不应重复调用');
});

test('audio 缺失或 ctx 无 suspend 不抛错', () => {
  for (const over of [{ audio: undefined }, { audio: { ctx: {} } }, { audio: {} }]) {
    const { game } = setup(over);
    assert.doesNotThrow(() => { env.setHidden(true); env.emit(env.win, 'touchstart'); }, JSON.stringify(Object.keys(over)));
    assert.equal(game.paused, true);
    env.restore(); env = null;
  }
});

test('ctx 已是 suspended 时不重复挂起', () => {
  const { game, count } = setup();
  game.audio.ctx.state = 'suspended';
  env.setHidden(true);
  assert.equal(count('audio.suspend'), 0);
});

test('detach：事件不再响应，未触发的恢复监听也被撤销，且幂等', () => {
  const { touch, count, detach } = setup();
  env.setHidden(true); // 挂起并布置恢复监听
  detach();
  env.emit(env.win, 'touchstart');
  assert.equal(count('audio.init'), 0, 'detach 后恢复监听应已撤销');
  const before = touch.resetCount;
  env.setHidden(false); env.setHidden(true);
  assert.equal(touch.resetCount, before, 'detach 后不应再响应 visibilitychange');
  assert.doesNotThrow(() => detach());
});

test('缺少 document/window 全局时 attach 不抛错', () => {
  env = installEnv();
  const game = makeFakeGame();
  const touch = makeFakeTouch(game);
  const saved = { d: globalThis.document, w: globalThis.window };
  globalThis.document = undefined; globalThis.window = undefined;
  try {
    let detach;
    assert.doesNotThrow(() => { detach = attach(game, touch); });
    assert.doesNotThrow(() => detach());
  } finally {
    globalThis.document = saved.d; globalThis.window = saved.w;
  }
});
