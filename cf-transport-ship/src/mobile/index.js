// 移动端模块统一挂接入口。仅由 touch.js 在 TouchControls.enabled 为真时调用；桌面路径不会加载到这里。
// 每个模块导出 attach(game, touch) -> detach；契约见 .ultra/mobile-adaptation/dispatch/contract.md。
// 本文件只做注册与容错，不含业务逻辑；各模块由各自的 lane 实现，互不修改对方文件。
import { attach as attachMenu } from './menu.js';
import { attach as attachLifecycle } from './lifecycle.js';
import { attach as attachOrientation } from './orientation.js';
import { attach as attachFullscreen } from './fullscreen.js';

const MODULES = [
  ['menu', attachMenu],
  ['lifecycle', attachLifecycle],
  ['orientation', attachOrientation],
  ['fullscreen', attachFullscreen],
];

export function attachMobile(game, touch) {
  const detachers = [];
  for (const [name, attach] of MODULES) {
    try {
      const detach = attach(game, touch);
      if (typeof detach === 'function') detachers.push(detach);
    } catch (e) {
      // 单个模块失败不能拖垮游戏：记录后继续挂接其余模块
      if (typeof console !== 'undefined' && console.warn) console.warn('[mobile] ' + name + ' 挂接失败', e);
    }
  }
  return () => {
    for (const detach of detachers.splice(0).reverse()) {
      try { detach(); } catch (e) { /* 忽略 */ }
    }
  };
}
