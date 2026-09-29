// 生命周期 / 横屏遮罩 / 全屏的端到端测试（任务 2 用例 9、10）：通过真实 TouchControls 与 src/mobile/* 联动。
import test, { mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { makeTouchControls } from './helpers/touch-dom.mjs';

let ctx = null;
const setup = (opts) => { ctx = makeTouchControls(opts); return ctx; };
afterEach(() => { mock.timers.reset(); if (ctx) { ctx.cleanup(); ctx = null; } });
const count = (game, name) => game.calls.filter((c) => c === name).length;
const guardOf = (env) => env.doc.body.children.find((c) => c.id === 'rotateGuard');

// ---------- 用例 9：后台生命周期 ----------

test('用例9：切后台——清触屏状态、暂停一次、挂起音频', () => {
  const { byAct, env, game, player } = setup();
  byAct('fire').dispatch('touchstart');
  assert.equal(player.touch.fire, true);
  env.setHidden(true);
  assert.equal(player.touch.fire, false, '切后台后开火仍被按住');
  assert.equal(game.paused, true);
  assert.equal(count(game, 'pause'), 1);
  assert.equal(count(game, 'audio.suspend'), 1, '未挂起音频：audio.js 的兜底心跳会让声音继续');
});

test('用例9：pagehide 同样处理；重复触发只暂停一次', () => {
  const { env, game } = setup();
  env.emit(env.win, 'pagehide');
  env.setHidden(true);
  assert.equal(count(game, 'pause'), 1);
  assert.equal(count(game, 'audio.suspend'), 1);
});

test('用例9：边界——广告暂停/已暂停/大厅/已结束', () => {
  for (const [gameOver, expectPause] of [[{ adPaused: true }, 0], [{ paused: true }, 0], [{ playing: false }, 0], [{ playing: false, ended: true }, 0]]) {
    const { env, game } = setup({ gameOver });
    env.setHidden(true);
    assert.equal(count(game, 'pause'), expectPause, JSON.stringify(gameOver));
    ctx.cleanup(); ctx = null;
  }
});

test('用例9：返回后停留在暂停界面，音频在首个触摸手势里恢复', () => {
  const { env, game } = setup();
  env.setHidden(true);
  env.setHidden(false);
  assert.equal(game.paused, true);
  assert.equal(count(game, 'resume'), 0, '不应自动继续');
  assert.equal(count(game, 'audio.init'), 0);
  env.emit(env.win, 'touchstart');
  assert.equal(count(game, 'audio.init'), 1);
});

test('用例9：TouchControls.destroy 后不再响应后台事件', () => {
  const { env, game, touch } = setup();
  touch.destroy();
  env.setHidden(true);
  assert.equal(count(game, 'pause'), 0);
});

// ---------- 用例 10：横屏引导 ----------

test('用例10：对局中变竖屏——暂停一次并出现 #rotateGuard', () => {
  const { env, game } = setup();
  const guard = guardOf(env);
  assert.ok(guard, '未创建 #rotateGuard：orientation 模块未挂接');
  assert.equal(guard.style.display, 'none');
  env.setViewport(390, 844);
  assert.equal(count(game, 'pause'), 1);
  assert.equal(guard.style.display, 'flex');
  env.setViewport(844, 390);
  assert.equal(guard.style.display, 'none');
  assert.equal(game.paused, true, '回到横屏不应自动继续');
});

test('用例10：非对局竖屏不触发', () => {
  const { env, game } = setup({ gameOver: { playing: false } });
  env.setViewport(390, 844);
  assert.equal(count(game, 'pause'), 0);
  assert.equal(guardOf(env).style.display, 'none');
});

test('用例10：竖屏的大厅里点“开始”（方向没变）也会被拦下', () => {
  mock.timers.enable({ apis: ['setInterval'] });
  const { env, game } = setup({ width: 390, height: 844, gameOver: { playing: false } });
  game.playing = true;
  mock.timers.tick(600);
  assert.equal(guardOf(env).style.display, 'flex');
  assert.equal(count(game, 'pause'), 1);
});

// ---------- 全屏 ----------

test('全屏：支持时出现按钮，点击请求全屏；不支持时没有按钮', () => {
  const calls = [];
  const on = setup({ prepare: (env) => {
    env.doc.fullscreenEnabled = true;
    env.doc.documentElement.requestFullscreen = (o) => { calls.push(o); return Promise.resolve(); };
  } });
  const b = on.byAct('fullscreen');
  assert.ok(b, '支持全屏时应出现按钮');
  b.dispatch('touchstart');
  assert.deepEqual(calls, [{ navigationUI: 'hide' }]);
  on.cleanup(); ctx = null;

  const off = setup();
  assert.equal(off.byAct('fullscreen'), null, '不支持全屏时不应出现按钮');
});

// ---------- 整体：所有模块同时挂接 ----------

test('整体：全部按钮（既有 10 + 新增 8）齐全，destroy 后新增按钮被移除', () => {
  const { buttons, touch } = setup({ prepare: (env) => {
    env.doc.fullscreenEnabled = true;
    env.doc.documentElement.requestFullscreen = () => Promise.resolve();
  } });
  const acts = buttons().map((b) => b.dataset.act).sort();
  assert.deepEqual(acts, ['board', 'c4', 'crouch', 'e', 'fire', 'fire2', 'fullscreen', 'g', 'inspect', 'jump', 'loadout', 'menu', 'reload', 'scope', 'slot1', 'slot2', 'slot3', 'slot4', 'swap']);
  const menu = buttons().find((b) => b.dataset.act === 'menu');
  touch.destroy();
  assert.equal(menu.removed, true);
});
