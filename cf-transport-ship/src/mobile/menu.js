// 触屏菜单与动作补全（任务 4）：菜单（暂停）、记分板、配装、检视、1–4 槽位。
// 契约见 .ultra/mobile-adaptation/dispatch/contract.md §2/§4。导入时不访问 DOM/window；只有 attach 被调用时才可以。
// 只通过公开字段与游戏交互：向 player.keys / player.pressed 注入键位，暂停一律走 touch.requestPause。
const BOARD_POLL_MS = 250; // 记分板开启期间检测“暂停/结算”的间隔；关闭即清除，平时零开销

export function attach(game, touch) {
  const buttons = [];
  let boardOn = false;
  let boardBtn = null;
  let boardTimer = null;

  const player = () => touch.player();
  // 大厅/暂停/结算界面不产生输入
  const inject = (fn) => () => {
    if (!touch.isPlaying()) return;
    const p = player();
    if (p && p.pressed) fn(p);
  };
  const press = (code) => inject((p) => p.pressed.add(code));

  const stopBoardTimer = () => {
    if (boardTimer !== null) { clearInterval(boardTimer); boardTimer = null; }
  };
  const setBoard = (on) => {
    if (on === boardOn) return;
    boardOn = on;
    const p = player();
    if (p && p.keys) { if (on) p.keys.add('Tab'); else p.keys.delete('Tab'); }
    if (boardBtn && boardBtn.classList) boardBtn.classList.toggle('on', on);
    if (!on) { stopBoardTimer(); return; }
    // game.js 只在对局且未暂停时显示记分板；暂停/结算后 Tab 若残留，恢复时记分板会“自己冒出来”
    boardTimer = setInterval(() => { if (!touch.isPlaying()) setBoard(false); }, BOARD_POLL_MS);
  };

  const add = (spec) => { const b = touch.addButton(spec); buttons.push(b); return b; };

  const menu = add({
    act: 'menu',
    label: '☰',
    down: () => { setBoard(false); touch.requestPause('menu'); },
  });
  if (menu && menu.setAttribute) menu.setAttribute('aria-label', touch.labelText('touch.menu'));

  boardBtn = add({
    act: 'board',
    labelKey: 'touch.board',
    down: () => {
      if (boardOn) setBoard(false);
      else if (touch.isPlaying()) setBoard(true);
    },
  });
  add({ act: 'loadout', labelKey: 'touch.loadout', down: press('KeyB') });
  add({ act: 'inspect', labelKey: 'touch.inspect', down: press('KeyF') });
  for (let i = 1; i <= 4; i++) add({ act: 'slot' + i, label: String(i), down: press('Digit' + i) });

  let detached = false;
  return function detach() {
    if (detached) return;
    detached = true;
    setBoard(false);
    stopBoardTimer();
    for (const b of buttons) { if (b && b.remove) b.remove(); }
  };
}
