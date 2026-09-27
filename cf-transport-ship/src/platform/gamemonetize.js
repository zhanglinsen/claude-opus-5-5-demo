/**
 * GameMonetize 平台适配器（任务 8 / US-03）：官方 SDK（sdk.js）的 PlatformAdapter 实现。
 * 官方依据（https://github.com/GameMonetize/GameMonetize.com-SDK）：
 *   window.SDK_OPTIONS = { gameId, onEvent: function (a) { switch (a.name) { ... } } }
 *   官方 loader 注入 <script id="gamemonetize-sdk" src="https://api.gamemonetize.com/sdk.js">
 *   SDK_READY：SDK 就绪；全局 sdk.showBanner() 触发一次广告机会（非游戏常驻横幅）；
 *   SDK_GAME_PAUSE：广告实际开始（暂停游戏、临时静音）；SDK_GAME_START：广告结束（恢复）；
 *   SDK_ERROR：SDK/填充失败。
 *
 * 接线合同（contract.js F4/F5）：SDK_GAME_PAUSE → callbacks.started()、
 * SDK_GAME_START → callbacks.ended()、SDK_ERROR → callbacks.failed()。
 * 游戏暂停与音频不经本模块：统一由 AdSession 经 controls 依赖注入施加，
 * 本适配器绝不触碰游戏状态，也无 pending 事件时不派发（防伪造生命周期）。
 *
 * 幂等（官方 loader 语义）：SDK_OPTIONS 只包装一次（保留宿主已有 onEvent，
 * 宿主 gameId 优先）；脚本按官方 id "gamemonetize-sdk" 查重，存在则不重复注入。
 *
 * 安全退化：无 gameId / document 不可用 / READY 超时（默认 10s）/ destroy 后，
 * init 返回 false、requestAd 一律无填充收口，绝不调用 showBanner、绝不触碰游戏。
 * 仅在配置的自然断点请求广告（isAdBreak），非法断点防御性拒绝。
 *
 * 本文件不 import 游戏代码；window/document 经 env 注入（默认浏览器全局），
 * Node 测试用 mock env 模拟官方 SDK 事件通道 —— 无 Game ID 时仅能 mock，
 * 本实现不代表正式平台验证。
 */
import {
  AD_STATUS, PLATFORM_EVENTS, isAdBreak, normalizeLanguage, validateAdapter, createEmitter,
} from './contract.js';

// 官方 SDK 接线常量（loader 与文档原值）。
export const GM_SDK_SCRIPT_ID = 'gamemonetize-sdk';
export const GM_SDK_SCRIPT_SRC = 'https://api.gamemonetize.com/sdk.js';

// 官方事件名（a.name）。注意 SDK_GAME_PAUSE = 广告开始，勿与"游戏常驻横幅"混淆。
export const GM_SDK_EVENTS = Object.freeze({
  READY: 'SDK_READY',
  GAME_PAUSE: 'SDK_GAME_PAUSE',
  GAME_START: 'SDK_GAME_START',
  ERROR: 'SDK_ERROR',
});

const OWNED = Symbol('gamemonetize-sdk-options');

function safeCall(fn, ...args) {
  if (typeof fn !== 'function') return undefined;
  try { return fn(...args); } catch (_) { return undefined; }
}

export class GameMonetizePlatformAdapter {
  /**
   * options: {
   *   gameId?         : string，官方后台分配；缺失则安全退化（Node/离线环境）
   *   language?       : string，归一化后的平台语言（合同字段）
   *   languages?      : string[]，支持集（F2，默认 contract 两语言）
   *   readyTimeoutMs? : number，SDK_READY 等待上限（默认 10000；0 = 不限时）
   *   env?            : { window?, document? }，注入测试替身；默认浏览器全局
   * }
   */
  constructor(options = {}) {
    this.id = 'gamemonetize';
    this._gameId = typeof options.gameId === 'string' && options.gameId ? options.gameId : null;
    this._env = options.env || {
      window: typeof window !== 'undefined' ? window : globalThis,
      document: typeof document !== 'undefined' ? document : null,
    };
    this._language = normalizeLanguage(options.language, 'en', options.languages);
    this._readyTimeoutMs = typeof options.readyTimeoutMs === 'number' && options.readyTimeoutMs >= 0
      ? options.readyTimeoutMs
      : 10000;
    this._bus = createEmitter();
    this._ready = false;
    this._destroyed = false;
    this._initPromise = null;   // init 幂等：重复调用复用同一 Promise
    this._pending = null;       // { callbacks } 当前活动请求（F4/F5 句柄）
    this._waiters = [];         // init 的 READY 等待者
  }

  get language() { return this._language; }
  get ready() { return this._ready; }

  /** 幂等初始化：接线官方 SDK 并等待 SDK_READY。就绪返回 true，退化返回 false。 */
  init() {
    if (!this._initPromise) {
      this._initPromise = this._initOnce().catch(() => false);
    }
    return this._initPromise;
  }

  async _initOnce() {
    if (this._destroyed) return false;
    if (!this._gameId || !this._env.document || !this._env.window) return false; // 无正式接入条件：安全退化
    this._ensureSdkOptions();
    this._ensureSdkScript();
    // SDK_READY 是唯一的就绪信号（官方无同步就绪 API）；超时视为加载失败。
    const ok = await this._waitForReady(this._readyTimeoutMs);
    return ok;
  }

  /** SDK_OPTIONS 幂等接线：只包装一次；宿主已有 onEvent/gameId 优先保留。 */
  _ensureSdkOptions() {
    const w = this._env.window;
    const prev = w.SDK_OPTIONS;
    if (prev && prev[OWNED] && prev._owner === this) return; // 已是本实例接线：空操作
    // 宿主 onEvent 优先保留；若此前是另一适配器实例的接线，其闭包随退位一并弃用。
    const hostOnEvent = prev && !prev[OWNED] && typeof prev.onEvent === 'function'
      ? prev.onEvent
      : null;
    const opts = prev && typeof prev === 'object' ? prev : {};
    if (typeof opts.gameId !== 'string' || !opts.gameId) opts.gameId = this._gameId;
    opts.onEvent = (a) => {
      this._handleSdkEvent(a);              // 生命周期收口必须先于宿主处理器
      if (hostOnEvent) safeCall(hostOnEvent, a); // 宿主处理器异常不影响本适配器
    };
    opts[OWNED] = true;
    opts._owner = this;
    w.SDK_OPTIONS = opts;
  }

  /** sdk.js 幂等加载：官方 loader 语义——按 id 查重，存在即跳过。 */
  _ensureSdkScript() {
    const doc = this._env.document;
    if (doc.getElementById(GM_SDK_SCRIPT_ID)) return;
    const el = doc.createElement('script');
    el.id = GM_SDK_SCRIPT_ID;
    el.src = GM_SDK_SCRIPT_SRC;
    el.async = true;
    el.onerror = () => this._resolveWaiters(false); // 加载失败早于超时收口
    const parent = doc.head || doc.body || doc;
    parent.appendChild(el);
  }

  _waitForReady(timeoutMs) {
    return new Promise((resolve) => {
      const waiter = { resolve, timer: null };
      this._waiters.push(waiter);
      if (timeoutMs > 0) {
        waiter.timer = setTimeout(() => {
          const i = this._waiters.indexOf(waiter);
          if (i >= 0) this._waiters.splice(i, 1);
          resolve(false);
        }, timeoutMs);
        if (typeof waiter.timer.unref === 'function') waiter.timer.unref();
      }
    });
  }

  _resolveWaiters(ok) {
    for (const w of this._waiters.splice(0)) {
      if (w.timer) clearTimeout(w.timer);
      w.resolve(ok);
    }
  }

  /**
   * 官方事件分发（SDK_OPTIONS.onEvent）。
   * READY 只广播一次；GAME_PAUSE/START/ERROR 仅作用于当前活动请求的句柄——
   * 无 pending 的事件（宿主自行 showBanner、迟到的重复事件）不触碰游戏。
   */
  _handleSdkEvent(a) {
    const name = a && typeof a === 'object' ? a.name : null;
    if (name === GM_SDK_EVENTS.READY) {
      if (this._ready) return;
      this._ready = true;
      this._resolveWaiters(true);
      this._bus.emit(PLATFORM_EVENTS.READY, { id: this.id, language: this._language });
      return;
    }
    const pending = this._pending;
    if (!pending) return;
    if (name === GM_SDK_EVENTS.GAME_PAUSE) {
      safeCall(pending.callbacks && pending.callbacks.started);   // 广告实际开始（重复安全：AdSession 去重）
    } else if (name === GM_SDK_EVENTS.GAME_START) {
      this._pending = null;
      safeCall(pending.callbacks && pending.callbacks.ended);     // 广告结束（迟到/重复安全）
    } else if (name === GM_SDK_EVENTS.ERROR) {
      this._pending = null;
      safeCall(pending.callbacks && pending.callbacks.failed, 'gm-error');
    }
  }

  /**
   * 在自然断点请求一次广告机会：resolve 'ok' 表示官方 showBanner 已接手，
   * 是否真播以 SDK_GAME_PAUSE/START 回调为准（F4）。非法断点/未就绪/销毁后不调用 SDK。
   */
  async requestAd(breakpoint, callbacks) {
    if (!isAdBreak(breakpoint)) return AD_STATUS.ERROR;
    if (this._destroyed || !this._ready) return AD_STATUS.NO_FILL;
    const sdk = this._env.window && this._env.window.sdk;
    if (!sdk || typeof sdk.showBanner !== 'function') return AD_STATUS.NO_FILL; // SDK 缺失：安全退化
    // AdSession 已对进行中请求去重，此替换仅为防御：旧句柄经 F5 epoch 失效。
    this._pending = { callbacks };
    try {
      sdk.showBanner(); // 官方"触发广告"方法，非游戏常驻横幅
    } catch (_) {
      this._pending = null;
      return AD_STATUS.ERROR;
    }
    return AD_STATUS.OK;
  }

  on(event, handler) { return this._bus.on(event, handler); }
  off(event, handler) { this._bus.off(event, handler); }

  /**
   * 销毁（F8）：挂起请求句柄失效、init 等待按失败收口、事件监听释放。
   * 官方 SDK 无卸载 API：不移除脚本与 SDK_OPTIONS（页面级单例，宿主负责生命周期）。
   */
  destroy() {
    if (this._destroyed) return false;
    this._destroyed = true;
    this._pending = null;
    this._resolveWaiters(false);
    this._bus = createEmitter();
    return true;
  }

  /** 合同自检（与离线/Y8 适配器同一入口）。 */
  validate() { return validateAdapter(this); }
}
