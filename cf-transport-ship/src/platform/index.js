/**
 * 平台插件公共入口（F8）：任何游戏一行安装、可完整退订与销毁的即插即用面。
 *
 *   import { installPlatform, OfflinePlatformAdapter } from './src/platform/index.js';
 *   const handle = installPlatform({
 *     controls: { isUserPaused, enterAdPause, exitAdPause, setAdMuted }, // 游戏注入，必传
 *     onEvent: (type, payload) => {},        // 可选：会话生命周期事件
 *     breaks: ['match-end', 'menu-return'],  // 可选：本游戏自然断点（F1，默认即此两点）
 *     languages: ['zh-cn', 'en'],            // 可选：支持语言集（F2）
 *     language: savedLang,                   // 可选：玩家/平台语言原始值
 *     watchdog: { handshakeMs: 8000, playingMs: 60000 }, // 可选，默认即此（F6）；false 关闭
 *     adapter: myAdapter,                    // 可选：默认离线适配器；Y8/GM 适配器由此注入
 *   });
 *   await handle.ready;
 *   handle.session.request('match-end');
 *   handle.on(PLATFORM_EVENTS.AD_START, fn); // 统一事件面（平台 + 会话）
 *   handle.off(PLATFORM_EVENTS.AD_START, fn);
 *   handle.destroy();                        // 挂起请求安全收口、恢复暂停/静音、释放全部监听
 *
 * 本模块只依赖 src/platform 内部文件：不 import 游戏代码、不引用 CF 地图/模式/音频 singleton。
 */
import {
  AD_STATUS, PLATFORM_EVENTS, validateAdapter, createEmitter,
} from './contract.js';
import { AdSession } from './ad-session.js';
import { OfflinePlatformAdapter } from './offline.js';

export * from './contract.js';
export { AdSession } from './ad-session.js';
export { OfflinePlatformAdapter } from './offline.js';


/**
 * 安装平台插件（F8）。返回句柄：
 *   { adapter, session, ready, on, off, destroyed, destroy }。
 * destroy：幂等；断开平台/会话事件转发，session.close() 收口挂起请求，
 * 释放会话与适配器监听，并调用 adapter.destroy()（若实现）。
 */
export function installPlatform(options = {}) {
  const {
    adapter = null,
    platform = 'offline',
    controls = {},
    onEvent = null,
    breaks = null,
    watchdog,
    language = undefined,
    languages = undefined,
  } = options;

  const impl = adapter || (platform === 'offline'
    ? new OfflinePlatformAdapter({ language, languages })
    : null);
  if (!impl) {
    throw new Error(`installPlatform: unknown platform "${platform}"（传入 adapter 或使用 "offline"）`);
  }
  const check = validateAdapter(impl);
  if (!check.ok) {
    throw new Error(`installPlatform: adapter missing ${check.missing.join(', ')}`);
  }

  const session = new AdSession({
    requestAd: (breakpoint, callbacks) => impl.requestAd(breakpoint, callbacks),
    controls,
    onEvent,
    breaks,
    watchdog,
  });

  // 统一事件面：适配器平台级事件（READY 等）与会话生命周期事件都转发到同一 bus。
  // 合同要求适配器不得伪造 ad-* 生命周期事件，因此不会与 session 重复。
  const bus = createEmitter();
  const unsubs = [];
  let destroyed = false;
  for (const event of Object.values(PLATFORM_EVENTS)) {
    unsubs.push(impl.on(event, (p) => { if (!destroyed) bus.emit(event, p); }));
    unsubs.push(session.on(event, (p) => { if (!destroyed) bus.emit(event, p); }));
  }

  const ready = Promise.resolve()
    .then(() => impl.init())
    .then((ok) => {
      if (!destroyed && !ok) bus.emit(PLATFORM_EVENTS.AD_ERROR, { reason: 'init-failed' });
      return ok;
    })
    .catch((e) => {
      if (!destroyed) {
        bus.emit(PLATFORM_EVENTS.AD_ERROR, { reason: e && e.message ? e.message : 'init-failed' });
      }
      return false;
    });

  return {
    adapter: impl,
    session,
    ready,
    on(event, handler) { return destroyed ? () => {} : bus.on(event, handler); },
    off(event, handler) { bus.off(event, handler); },
    get destroyed() { return destroyed; },
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      for (const unsub of unsubs) {
        try { unsub(); } catch (_) { /* 退订失败不阻断销毁 */ }
      }
      unsubs.length = 0;
      session.close('destroyed');
      if (typeof impl.destroy === 'function') {
        try { impl.destroy(); } catch (_) { /* 适配器销毁失败不阻断宿主销毁 */ }
      }
      return true;
    },
  };
}
