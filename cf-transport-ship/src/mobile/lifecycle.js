// 中断与后台生命周期（任务 5）：切后台/锁屏/来电/pagehide 时清输入、暂停、挂起音频；恢复只能由玩家点“继续”。
// 契约见 .ultra/mobile-adaptation/dispatch/contract.md。导入时不访问 DOM/window；只有 attach 被调用时才可以。
//
// 为什么必须显式挂起音频：audio.js 有 setInterval(_tick, 100) 兜底心跳，“即使游戏暂停调用 update()，
// 心跳/环境事件仍能继续”，所以停游戏循环不会让声音停。恢复走 audio.init()：它幂等，已有 ctx 时调用 _resume()，
// 同时处理 suspended 与 iOS 的 interrupted（audio.js），必须在用户手势里调用。
export function attach(game, touch) {
  let detached = false;
  let armed = null; // 挂起后等待的一次性用户手势监听

  const suspendAudio = () => {
    try {
      const ctx = game && game.audio && game.audio.ctx;
      if (!ctx || typeof ctx.suspend !== 'function') return;
      if (ctx.state === 'suspended' || ctx.state === 'closed') return; // 已挂起/已关闭不重复
      const pr = ctx.suspend();
      if (pr && typeof pr.catch === 'function') pr.catch(() => {});
    } catch (e) { /* 忽略 */ }
  };

  // 下一次用户手势里恢复音频；不自动“继续”对局
  const armResume = () => {
    if (armed || typeof window === 'undefined' || !window.addEventListener) return;
    const opts = { capture: true, once: true };
    const onGesture = () => {
      armed = null;
      try { window.removeEventListener('touchstart', onGesture, opts); } catch (e) { /* 忽略 */ }
      try { if (game.audio && typeof game.audio.init === 'function') game.audio.init(); } catch (e) { /* 忽略 */ }
    };
    armed = { onGesture, opts };
    window.addEventListener('touchstart', onGesture, opts);
  };

  const interrupt = () => {
    if (!game || !game.playing) return; // 大厅/结算不触发
    touch.resetTouchState();
    touch.requestPause('lifecycle'); // 守卫已内置：广告暂停/已暂停时返回 false，不覆盖
    suspendAudio(); // 无论是否刚暂停都要静音：玩家可能已经在暂停界面
    armResume();
  };

  const onVisibility = () => {
    const hidden = document.hidden === true || document.visibilityState === 'hidden';
    if (hidden) interrupt();
  };
  const onPageHide = () => interrupt();

  const hasDoc = typeof document !== 'undefined' && document && typeof document.addEventListener === 'function';
  const hasWin = typeof window !== 'undefined' && window && typeof window.addEventListener === 'function';
  if (hasDoc) document.addEventListener('visibilitychange', onVisibility);
  if (hasWin) window.addEventListener('pagehide', onPageHide);

  return function detach() {
    if (detached) return;
    detached = true;
    if (hasDoc) document.removeEventListener('visibilitychange', onVisibility);
    if (hasWin) {
      window.removeEventListener('pagehide', onPageHide);
      if (armed) { window.removeEventListener('touchstart', armed.onGesture, armed.opts); armed = null; }
    }
  };
}
