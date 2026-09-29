// 横屏引导（任务 7）：对局中处于竖屏时自动暂停并显示“请横屏”遮罩；回到横屏后不自动继续。
// 契约见 .ultra/mobile-adaptation/dispatch/contract.md。导入时不访问 DOM/window；只有 attach 被调用时才可以。
// 遮罩由本模块创建并在 detach 时移除，不新增/修改 hud.js 的 DOM。
//
// 为什么除了 matchMedia 的 change 事件还要在竖屏期间轮询 game.playing：玩家可能在竖屏的大厅里直接点“开始”，
// 此时方向没有变化，不会有 change 事件，但对局已经开始了。轮询只在竖屏时运行（2Hz），回到横屏即停，不改 game.js。
const POLL_MS = 500;

export function attach(game, touch) {
  if (typeof document === 'undefined' || !document || typeof document.createElement !== 'function' || !document.body) {
    return () => {};
  }
  if (typeof matchMedia !== 'function') return () => {};

  const mq = matchMedia('(orientation:portrait)');
  // iPadOS 13+ 的 Safari 默认发送桌面版 UA（Macintosh），要靠多点触控区分于真正的 Mac
  const isIOS = typeof navigator !== 'undefined' && !!navigator
    && (/iPhone|iPad|iPod/.test(navigator.userAgent || '') || (/Macintosh/.test(navigator.userAgent || '') && navigator.maxTouchPoints > 1));

  // 遮罩：一行提示 +（仅 iOS）一行“添加到主屏幕”。文字在每次显示时重新取，语言切换后下次显示生效。
  const guard = document.createElement('div');
  guard.id = 'rotateGuard';
  guard.style.display = 'none';
  const line1 = document.createElement('div');
  line1.className = 'rg-title';
  guard.appendChild(line1);
  let line2 = null;
  if (isIOS) {
    line2 = document.createElement('div');
    line2.className = 'rg-tip';
    guard.appendChild(line2);
  }
  document.body.appendChild(guard);

  let shown = false;
  let timer = null;
  const show = () => {
    line1.textContent = touch.labelText('touch.rotate');
    if (line2) line2.textContent = touch.labelText('touch.addToHome');
    guard.style.display = 'flex';
    shown = true;
  };
  const hide = () => {
    if (!shown) return;
    guard.style.display = 'none';
    shown = false;
  };

  const isPortrait = () => !!(mq && mq.matches);
  // 竖屏且对局中：显示遮罩并暂停（requestPause 已内置守卫，已暂停/广告暂停时不重复）；否则隐藏，不自动继续
  const check = () => {
    if (isPortrait() && game && game.playing) {
      if (!shown) show();
      touch.requestPause('orientation');
    } else {
      hide();
    }
  };
  const stopPoll = () => { if (timer !== null) { clearInterval(timer); timer = null; } };
  const startPoll = () => { if (timer === null) timer = setInterval(check, POLL_MS); };
  const onChange = (e) => {
    const portrait = e && typeof e.matches === 'boolean' ? e.matches : isPortrait();
    if (portrait) { startPoll(); check(); } else { stopPoll(); hide(); }
  };

  // 兼容旧 Safari 只有 addListener
  if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onChange);
  else if (typeof mq.addListener === 'function') mq.addListener(onChange);
  if (isPortrait()) startPoll(); // 挂接时已经是竖屏（例如竖屏打开页面）

  let detached = false;
  return function detach() {
    if (detached) return;
    detached = true;
    stopPoll();
    if (typeof mq.removeEventListener === 'function') mq.removeEventListener('change', onChange);
    else if (typeof mq.removeListener === 'function') mq.removeListener(onChange);
    if (guard.remove) guard.remove();
  };
}
