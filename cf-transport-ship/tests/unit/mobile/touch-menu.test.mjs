// 触屏菜单与动作的端到端测试（任务 2 用例 6、7）：通过真实 TouchControls + src/mobile/menu.js 联动。
import test, { mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { makeTouchControls } from './helpers/touch-dom.mjs';

let ctx = null;
const setup = (opts) => { ctx = makeTouchControls(opts); return ctx; };
afterEach(() => { mock.timers.reset(); if (ctx) { ctx.cleanup(); ctx = null; } });

const NEW_ACTS = ['menu', 'board', 'loadout', 'inspect', 'slot1', 'slot2', 'slot3', 'slot4'];

test('用例6：菜单按钮仅在 playing && !paused && !ended 时使 game.pause() 被调用一次', () => {
  const { byAct, game } = setup();
  const menu = byAct('menu');
  assert.ok(menu, '未找到 [data-act=menu] 按钮：menu 模块未挂接');
  menu.dispatch('touchstart');
  assert.equal(game.calls.filter((c) => c === 'pause').length, 1);
  menu.dispatch('touchend');
  menu.dispatch('touchstart'); // 已暂停：不重复
  assert.equal(game.calls.filter((c) => c === 'pause').length, 1);
});

test('用例6：不在对局中 / 已结束 / 广告暂停时菜单不暂停', () => {
  for (const gameOver of [{ playing: false }, { ended: true }, { adPaused: true }]) {
    const { byAct, game } = setup({ gameOver });
    byAct('menu').dispatch('touchstart');
    assert.equal(game.calls.includes('pause'), false, JSON.stringify(gameOver));
    ctx.cleanup(); ctx = null;
  }
});

test('用例6：菜单暂停会清掉正在按住的开火', () => {
  const { byAct, player } = setup();
  byAct('fire').dispatch('touchstart');
  assert.equal(player.touch.fire, true);
  byAct('menu').dispatch('touchstart');
  assert.equal(player.touch.fire, false, '暂停后触屏状态未清零');
});

test('用例7：记分板切换增删 Tab', () => {
  const { byAct, player } = setup();
  const board = byAct('board');
  const tap = () => { board.dispatch('touchstart'); board.dispatch('touchend'); }; // 完整点按：按下 + 抬起
  tap();
  assert.equal(player.keys.has('Tab'), true, '记分板未开启');
  tap();
  assert.equal(player.keys.has('Tab'), false, '记分板未关闭');
});

test('用例7：记分板开启后暂停，Tab 被自动释放（恢复后不会残留）', () => {
  mock.timers.enable({ apis: ['setInterval'] });
  const { byAct, player, game } = setup();
  byAct('board').dispatch('touchstart');
  game.paused = true;
  mock.timers.tick(300);
  assert.equal(player.keys.has('Tab'), false);
});

test('用例7：配装/检视/槽位注入 KeyB/KeyF/Digit1-4', () => {
  const { byAct, player } = setup();
  byAct('loadout').dispatch('touchstart'); assert.equal(player.pressed.has('KeyB'), true);
  byAct('inspect').dispatch('touchstart'); assert.equal(player.pressed.has('KeyF'), true);
  for (let i = 1; i <= 4; i++) {
    byAct('slot' + i).dispatch('touchstart');
    assert.equal(player.pressed.has('Digit' + i), true, 'slot' + i);
  }
});

test('用例7：不在对局中时动作按钮不产生输入', () => {
  const { byAct, player } = setup({ gameOver: { paused: true } });
  for (const act of ['loadout', 'inspect', 'slot1', 'slot2']) byAct(act).dispatch('touchstart');
  byAct('board').dispatch('touchstart');
  assert.equal(player.pressed.size, 0);
  assert.equal(player.keys.has('Tab'), false);
});

test('新增 8 个按钮都在视口内、≥44px，且与既有按钮互不重叠（844×390、932×430、667×375、含安全区无关的基础几何）', () => {
  for (const [w, h] of [[844, 390], [932, 430], [667, 375], [800, 360]]) {
    const { buttons, rectOf } = setup({ width: w, height: h });
    const all = buttons();
    for (const act of NEW_ACTS) assert.ok(all.some((b) => b.dataset.act === act), `${w}x${h}: 缺少 ${act}`);
    const rects = all.map((b) => ({ act: b.dataset.act, ...rectOf(b) }));
    for (const r of rects) {
      assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h, `${w}x${h}: ${r.act} 出屏`);
      assert.ok(r.w >= 44, `${w}x${h}: ${r.act} 边长 ${r.w} < 44`);
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        assert.ok(!(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h), `${w}x${h}: ${a.act} 与 ${b.act} 重叠`);
      }
    }
    ctx.cleanup(); ctx = null;
  }
});

test('语言切换即时刷新新按钮文案，且不影响既有 6 个按钮的 _labeled', () => {
  const { touch, byAct } = setup();
  let prefix = 'X'; const subs = new Set();
  touch.setLocaleService({ t: (k) => `${prefix}:${k}`, subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); } });
  assert.equal(byAct('board').textContent, 'X:touch.board');
  prefix = 'Y'; for (const fn of subs) fn();
  assert.equal(byAct('board').textContent, 'Y:touch.board');
  assert.equal(byAct('loadout').textContent, 'Y:touch.loadout');
  assert.equal(touch._labeled.length, 6);
});
