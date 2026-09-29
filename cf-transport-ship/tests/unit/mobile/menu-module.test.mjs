// src/mobile/menu.js 模块测试（任务 4）：用契约里 touch 对象的假实现，不 import touch.js。
import test, { mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { attach } from '../../../src/mobile/menu.js';
import { makeFakeGame, makeFakeTouch, press, release } from './helpers/fake-env.mjs';

afterEach(() => mock.timers.reset());

function setup(over = {}) {
  const game = makeFakeGame(over);
  const touch = makeFakeTouch(game);
  const detach = attach(game, touch);
  return { game, touch, detach, player: game.player, btn: (act) => touch.button(act) };
}

test('挂接后新增 9 个按钮：menu board loadout inspect slot1-4，文本与 labelKey 符合契约', () => {
  const { touch } = setup();
  const acts = touch.buttons.map((b) => b.dataset.act);
  assert.deepEqual(acts, ['menu', 'board', 'loadout', 'inspect', 'slot1', 'slot2', 'slot3', 'slot4']);
  assert.equal(touch.button('menu').spec.label, '☰');
  assert.equal(touch.button('menu').attrs['aria-label'], 'touch.menu');
  assert.equal(touch.button('board').spec.labelKey, 'touch.board');
  assert.equal(touch.button('loadout').spec.labelKey, 'touch.loadout');
  assert.equal(touch.button('inspect').spec.labelKey, 'touch.inspect');
  assert.deepEqual(['slot1', 'slot2', 'slot3', 'slot4'].map((a) => touch.button(a).spec.label), ['1', '2', '3', '4']);
});

test('菜单：对局中经 requestPause 暂停，原因为 menu', () => {
  const { touch, game } = setup();
  press(touch.button('menu'));
  assert.equal(game.paused, true);
  assert.deepEqual(touch.pauseReasons, ['menu']);
  assert.equal(game.calls.filter((c) => c === 'pause').length, 1);
});

test('菜单：不在对局中 / 已暂停 / 广告暂停时不暂停', () => {
  for (const over of [{ playing: false }, { paused: true }, { ended: true }, { adPaused: true }]) {
    const { touch, game } = setup(over);
    press(touch.button('menu'));
    assert.equal(game.calls.includes('pause'), false, JSON.stringify(over));
  }
});

test('记分板：切换开关，开启注入 Tab、关闭移除，并高亮', () => {
  const { touch, player } = setup();
  const b = touch.button('board');
  press(b);
  assert.equal(player.keys.has('Tab'), true);
  assert.equal(b.classList.contains('on'), true);
  press(b);
  assert.equal(player.keys.has('Tab'), false);
  assert.equal(b.classList.contains('on'), false);
});

test('记分板：不在对局中不能开启', () => {
  const { touch, player } = setup({ paused: true });
  press(touch.button('board'));
  assert.equal(player.keys.has('Tab'), false);
});

test('记分板：开启后暂停/结算时自动关闭（避免恢复后残留 Tab）', () => {
  mock.timers.enable({ apis: ['setInterval'] });
  const { touch, player, game } = setup();
  press(touch.button('board'));
  assert.equal(player.keys.has('Tab'), true);
  game.paused = true;
  mock.timers.tick(300);
  assert.equal(player.keys.has('Tab'), false, '暂停后 Tab 未自动释放');
  assert.equal(touch.button('board').classList.contains('on'), false);
  // 计时器已清除：之后恢复对局、手动再开不受旧计时器影响
  game.paused = false;
  press(touch.button('board'));
  assert.equal(player.keys.has('Tab'), true);
});

test('记分板：点菜单暂停时同时关闭记分板', () => {
  const { touch, player } = setup();
  press(touch.button('board'));
  press(touch.button('menu'));
  assert.equal(player.keys.has('Tab'), false);
});

test('配装/检视/槽位注入对应键位到 pressed', () => {
  const { touch, player } = setup();
  press(touch.button('loadout')); assert.equal(player.pressed.has('KeyB'), true);
  press(touch.button('inspect')); assert.equal(player.pressed.has('KeyF'), true);
  for (let i = 1; i <= 4; i++) { press(touch.button('slot' + i)); assert.equal(player.pressed.has('Digit' + i), true, 'slot' + i); }
});

test('不在对局中（暂停/结算/大厅）时配装/检视/槽位都不产生输入', () => {
  for (const over of [{ paused: true }, { ended: true }, { playing: false }]) {
    const { touch, player } = setup(over);
    for (const act of ['loadout', 'inspect', 'slot1', 'slot4']) press(touch.button(act));
    assert.equal(player.pressed.size, 0, JSON.stringify(over));
  }
});

test('player 为 null 时不抛错', () => {
  const { touch, game } = setup();
  game.player = null;
  for (const act of ['menu', 'board', 'loadout', 'inspect', 'slot1']) {
    assert.doesNotThrow(() => { press(touch.button(act)); release(touch.button(act)); }, act);
  }
});

test('detach：释放 Tab、清计时器、移除按钮，且幂等', () => {
  mock.timers.enable({ apis: ['setInterval'] });
  const { touch, player, detach } = setup();
  press(touch.button('board'));
  detach();
  assert.equal(player.keys.has('Tab'), false);
  assert.ok(touch.buttons.every((b) => b.removed === true));
  assert.doesNotThrow(() => detach());
  assert.doesNotThrow(() => mock.timers.tick(1000), '计时器应已清除');
});
