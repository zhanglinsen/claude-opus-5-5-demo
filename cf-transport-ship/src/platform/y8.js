/**
 * Y8 平台适配器（任务 7 / US-03）：实现 PlatformAdapter 合同的 Y8 SDK 接入。
 * 首版范围：自然断点插屏（type:'next'）与平台语言；不做登录、云存档、激励视频、常驻横幅。
 *
 * 官方依据（https://docs.y8.com/sdk/intro/ 与 /sdk/advertising/，2026-09 核对）：
 *   - 页面以 <script src="https://cdn.y8.com/minimal-sdk/2-0/y8.min.js" async> 引入 SDK；
 *     监听 window 的 `y8sdk.ready` 事件（{ once: true }）后 `y8.sdk()` 取实例，
 *     `sdk.init(appConfig, adConfig)`；SDK 先于页面加载时官方允许 `window.y8.emitReadyEvent()`
 *     手动补发 ready 事件（本适配器据此做先/后到达双路径）。
 *   - 广告入口是 `sdk.showAd({ type:'next', name, beforeAd, afterAd, adBreakDone })`
 *     （官方现行为 showAd，非早期 adBreak），返回 Promise；`beforeAd` 仅在广告真正出现时
 *     回调——游戏暂停/静音只接在这里；`adBreakDone` 对每次 break 都回调，
 *     `breakStatus` 仅 'viewed' | 'dismissed' 表示广告出现过，其余为无填充。
 *   - 官方要求不得在页面加载时请求广告（无 preroll）：本适配器初始化绝不调用 showAd，
 *     广告只在 AdSession 传入的合法自然断点下被动请求。
 *   - `sdk.getPlatformLocale()` 返回平台语言基础码（'zh'、'en'、'pt'…），
 *     失败或未知时官方回退 'en'；本适配器在此之上经 normalizeLanguage 做支持集归一化。
 *
 * 与官方/规格的差异记录：
 *   - adConfig.preloadAdBreaks 官方默认 'on'，本适配器默认 'off'（首版不在启动期预取广告，
 *     可经 options.preloadAdBreaks 覆盖）；sound 默认 'on'。
 *   - appConfig.autoLogin 恒为 false（首版不做登录）。
 *
 * 可靠性约定（与 contract.js F4/F5 一致）：
 *   - init 幂等：先到（window.y8 已就绪）与后到（y8sdk.ready / emitReadyEvent 补发）都只
 *     初始化一次；注入 loadScript（默认注入官方 CDN script 标签）与 window 以便 Node 测试。
 *     SDK 缺失或超时不 reject、不发 READY，init resolve false——游戏照常运行。
 *   - requestAd 把 SDK 回调接到 AdSession 的请求作用域句柄：beforeAd→started、
 *     afterAd→ended、无填充→noFill、showAd 同步/异步拒绝→failed；adBreakDone 作兜底收口
 *     （开始过而未结束→ended；从未开始→noFill）。重复/迟到回调由标志位与 AdSession 去重，
 *     任何路径都不挂起游戏。
 */
import {
  AD_STATUS, normalizeLanguage, validateAdapter, createEmitter,
} from './contract.js';

const SDK_SCRIPT_URL = 'https://cdn.y8.com/minimal-sdk/2-0/y8.min.js';
const READY_EVENT = 'y8sdk.ready';
const DEFAULT_FALLBACK_LANGUAGE = 'zh-cn'; // 与离线适配器一致（US-02：zh-cn/en）

function reasonOf(e) {
  if (e && typeof e === 'object' && typeof e.message === 'string' && e.message) return e.message;
  return typeof e === 'string' && e ? e : 'error';
}

/** 默认脚本加载器：注入官方 CDN 的 async script 标签；无 document（Node）时不加载。 */
function defaultLoadScript(src) {
  if (typeof document === 'undefined') return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      const el = document.createElement('script');
      el.src = src;
      el.async = true;
      el.onload = () => resolve(true);
      el.onerror = () => resolve(false);
      (document.head || document.documentElement).appendChild(el);
    } catch (_) {
      resolve(false);
    }
  });
}

export class Y8PlatformAdapter {
  /**
   * options: {
   *   window?, loadScript?,               // 注入以便测试异步加载竞态
   *   appId?, gameId?,                    // 正式接入的凭据；缺省时仅挂接 SDK（mock/本地）
   *   language?, languages?, fallback?,   // 语言策略（F2）
   *   preloadAdBreaks?, sound?,           // adConfig 覆盖（默认 'off' / 'on'，见头部差异记录）
   *   initTimeoutMs?,                     // 等 y8sdk.ready 的上限，默认 8000
   * }
   */
  constructor(options = {}) {
    this.id = 'y8';
    this._win = options.window || (typeof window !== 'undefined' ? window : null);
    this._loadScript = typeof options.loadScript === 'function' ? options.loadScript : defaultLoadScript;
    this._appId = typeof options.appId === 'string' && options.appId ? options.appId : null;
    this._gameId = typeof options.gameId === 'string' && options.gameId ? options.gameId : null;
    this._preloadAdBreaks = options.preloadAdBreaks === 'on' ? 'on' : 'off';
    this._sound = options.sound === 'off' ? 'off' : 'on';
    this._initTimeoutMs = typeof options.initTimeoutMs === 'number' && options.initTimeoutMs >= 0
      ? options.initTimeoutMs : 8000;
    this._fallback = typeof options.fallback === 'string' && options.fallback
      ? options.fallback : DEFAULT_FALLBACK_LANGUAGE;
    this._languages = Array.isArray(options.languages) ? options.languages : undefined;
    this._language = normalizeLanguage(options.language, this._fallback, this._languages);
    this._bus = createEmitter();
    this._sdk = null;
    this._initPromise = null;
    this._destroyed = false;
  }

  get language() { return this._language; }
  get gameId() { return this._gameId; }

  /** 幂等初始化：就绪发 READY（一次）；SDK 缺失/超时 resolve false，游戏可继续。 */
  init() {
    if (this._initPromise) return this._initPromise;
    this._initPromise = this._init().catch(() => false);
    return this._initPromise;
  }

  async _init() {
    if (this._destroyed || !this._win) return false;
    // 先到：SDK 与 y8sdk.ready 都已错过，直接初始化。
    if (this._win.y8 && typeof this._win.y8.sdk === 'function') {
      return this._startSdk(this._win.y8);
    }
    // 后到：注入官方脚本（幂等，仅一次），随后等 ready。
    if (!this._loadStarted) {
      this._loadStarted = true;
      try { this._loadScript(SDK_SCRIPT_URL); } catch (_) { /* 加载失败仍等 ready/超时 */ }
    }
    const root = await this._waitForReady(this._win);
    if (!root) return false; // 缺 SDK：不发 READY，游戏照常运行
    return this._startSdk(root);
  }

  /**
   * 等 y8sdk.ready；官方先到达竞态兜底：emitReadyEvent 已可用时触发一次补发 ready 事件。
   * 超时以 null 收口，不挂起 init。幂等：多个等待者共享同一次竞态处理。
   */
  _waitForReady(win) {
    if (!this._readyWaiter) {
      this._readyWaiter = new Promise((resolve) => {
        let settled = false;
        let timer = null; // 先声明：emitReadyEvent 可能在 setTimeout 之前同步触发 finish
        const finish = (root) => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          try { win.removeEventListener(READY_EVENT, onReady); } catch (_) { /* 忽略 */ }
          resolve(root && typeof root.sdk === 'function' ? root : null);
        };
        const onReady = () => finish(win.y8);
        try { win.addEventListener(READY_EVENT, onReady); } catch (_) { /* 忽略 */ }
        try {
          if (win.y8 && typeof win.y8.emitReadyEvent === 'function') win.y8.emitReadyEvent();
        } catch (_) { /* 补发失败仍等事件/超时 */ }
        timer = setTimeout(() => finish(null), this._initTimeoutMs);
        if (typeof timer.unref === 'function') timer.unref();
      });
    }
    return this._readyWaiter;
  }

  /** 取 SDK 实例并 init 一次；拉取平台语言；就绪发 READY。 */
  async _startSdk(y8root) {
    if (this._destroyed) return false;
    let sdk;
    try {
      sdk = y8root.sdk();
    } catch (_) {
      return false;
    }
    if (!sdk || typeof sdk.init !== 'function') return false;
    this._sdk = sdk;
    // 首版：不做登录（autoLogin 恒 false）；preloadAdBreaks 默认 'off'（见头部差异记录）。
    const appConfig = { appId: this._appId || undefined, autoLogin: false };
    const adConfig = {
      gameId: this._gameId || undefined,
      preloadAdBreaks: this._preloadAdBreaks,
      sound: this._sound,
      onReady: () => {}, // 广告子系统就绪信号；首版只作观测，不阻塞 init
    };
    try {
      await Promise.resolve(sdk.init(appConfig, adConfig)); // 同步/异步 init 均兼容
    } catch (_) {
      // init 抛错仍保留实例：语言可用则语言可用，广告后续请求会以 error 收口
    }
    const locale = await this.getPlatformLocale();
    if (locale) {
      this._language = normalizeLanguage(locale, this._fallback, this._languages);
    }
    this._bus.emit('ready', { id: this.id, language: this._language });
    return true;
  }

  /**
   * 平台语言原始值：成功 resolve 基础语言码（'zh'/'en'…），缺 SDK、SDK 抛错或空值
   * 一律 resolve null——归一化与回退交给 normalizeLanguage / i18n 层。
   */
  async getPlatformLocale() {
    const sdk = this._sdk;
    if (!sdk || typeof sdk.getPlatformLocale !== 'function') return null;
    try {
      const locale = await Promise.resolve(sdk.getPlatformLocale());
      return typeof locale === 'string' && locale ? locale : null;
    } catch (_) {
      return null;
    }
  }

  /**
   * 在自然断点请求插屏（仅 AdSession 从合法断点调来；适配器绝不主动发起）。
   * resolve 'ok' 表示 SDK 已接手机会（真实播放以回调为准）；SDK 缺失/销毁/无 Game ID
   * 返回 'error'，绝不阻塞游戏。
   */
  async requestAd(breakpoint, callbacks) {
    const sdk = this._destroyed ? null : this._sdk;
    if (!sdk || typeof sdk.showAd !== 'function' || !this._gameId) return AD_STATUS.ERROR;
    const cb = callbacks || {};
    const state = { started: false, closed: false };

    const start = () => {
      if (state.started) return; // 重复开始
      state.started = true;
      if (typeof cb.started === 'function') cb.started();
    };
    const end = () => {
      if (state.closed) return; // 重复收口
      state.closed = true;
      if (typeof cb.ended === 'function') cb.ended();
    };
    const fail = (reason) => {
      if (state.closed) return;
      state.closed = true;
      if (typeof cb.failed === 'function') cb.failed(reason);
    };
    // adBreakDone 兜底（官方：每次 break 必回调；breakStatus 仅 viewed/dismissed 表示出现过）：
    // 开始过而 afterAd 缺席 → 按结束收口；从未开始（无论状态）→ 玩家没看到广告，按无填充收口。
    const conclude = (info) => {
      if (state.closed) return;
      if (state.started) {
        end();
        return;
      }
      state.closed = true;
      if (typeof cb.noFill === 'function') cb.noFill();
    };

    let showPromise;
    try {
      showPromise = sdk.showAd({
        type: 'next',
        name: typeof breakpoint === 'string' && breakpoint ? breakpoint : 'next',
        beforeAd: start,                 // 广告真正开始：会话在此暂停/静音
        afterAd: end,                    // 广告结束：成对恢复
        adBreakDone: (info) => conclude(info),
      });
    } catch (e) {
      fail(reasonOf(e));
      return AD_STATUS.ERROR;
    }
    Promise.resolve(showPromise).then(
      () => conclude(),                  // break 正常走完：兜底收口（已收口则空操作）
      (e) => fail(reasonOf(e)),          // 拒绝：按失败收口，游戏不挂起
    );
    return AD_STATUS.OK;
  }

  on(event, handler) { return this._bus.on(event, handler); }
  off(event, handler) { this._bus.off(event, handler); }

  /** 销毁（F8）：幂等（与离线适配器一致恒返回 true）；销毁后不再请求广告，事件监听释放。 */
  destroy() {
    this._destroyed = true;
    this._sdk = null;
    this._bus = createEmitter();
    return true;
  }

  /** 合同自检（与离线适配器同一入口）。 */
  validate() { return validateAdapter(this); }
}
