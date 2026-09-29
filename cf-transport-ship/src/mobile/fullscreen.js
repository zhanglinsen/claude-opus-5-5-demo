// 全屏按钮（任务 7）：仅在浏览器支持时出现（Android Chrome、iPadOS）；iPhone Safari 与无 allowfullscreen 的 iframe 不出现。
// 契约见 .ultra/mobile-adaptation/dispatch/contract.md。导入时不访问 DOM/window；只有 attach 被调用时才可以。
export function attach(game, touch) {
  if (typeof document === 'undefined' || !document) return () => {};
  const root = document.documentElement;
  if (!document.fullscreenEnabled || !root || typeof root.requestFullscreen !== 'function') return () => {};

  // 拒绝/异常一律吞掉：全屏失败不应影响游戏
  const swallow = (fn) => {
    try { const pr = fn(); if (pr && typeof pr.catch === 'function') pr.catch(() => {}); } catch (e) { /* 忽略 */ }
  };

  const btn = touch.addButton({
    act: 'fullscreen',
    labelKey: 'touch.fullscreen',
    down: () => {
      if (document.fullscreenElement) {
        if (typeof document.exitFullscreen === 'function') swallow(() => document.exitFullscreen());
        return;
      }
      swallow(() => root.requestFullscreen({ navigationUI: 'hide' }));
      // 横屏锁定只在全屏下、且仅部分浏览器可用（iOS 不支持），尽力而为
      if (typeof screen !== 'undefined' && screen && screen.orientation && typeof screen.orientation.lock === 'function') {
        swallow(() => screen.orientation.lock('landscape'));
      }
    },
  });

  let detached = false;
  return function detach() {
    if (detached) return;
    detached = true;
    if (btn && btn.remove) btn.remove();
  };
}
