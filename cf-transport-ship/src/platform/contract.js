/**
 * PlatformAdapter 合同（US-03）：任何游戏可复制的即插即用广告插件的最小接口与纯工具。
 * 本模块零依赖、无 DOM/window/network，不 import 任何游戏代码，可被 Node 测试与构建期直接加载。
 *
 * 公共入口见 index.js：installPlatform(options) 一行接入，返回 { adapter, session, ready, on, off, destroy }。
 *
 * 平台实现（y8 / gamemonetize，任务 7/8）需满足 validateAdapter 的结构：
 *   id        : string                          平台标识（'offline' | 'y8' | 'gamemonetize' | ...）
 *   language  : string                          归一化平台语言（normalizeLanguage 的结果）
 *   init()    : Promise<boolean>                幂等初始化，就绪时发 PLATFORM_EVENTS.READY
 *   requestAd(breakpoint, callbacks): Promise<'ok'|'no-fill'|'error'>
 *               仅在配置的自然断点调用；resolve 值约定见 AD_STATUS；
 *               'ok' 仅表示"SDK 已接手该机会"，是否真的播放以回调为准（F4）。
 *   on/off(event, handler)                      平台事件订阅（off 必须存在，F7）
 *   destroy()?  : 可选，宿主销毁时释放 SDK 资源。
 *
 * 接线合同（F4/F5，Y8/GM 适配器必须遵守）：
 *   - requestAd resolve 'ok' 后，SDK 的"广告实际开始"回调（Y8 beforeAd / GM SDK_GAME_PAUSE）
 *     可能异步迟到。适配器必须把该回调接到 requestAd 第二参 callbacks 句柄上：
 *       callbacks.started() / callbacks.ended() / callbacks.failed(reason) / callbacks.noFill()
 *     句柄按请求作用域绑定（epoch），请求收口或新请求开始后自动失效，旧 SDK 回调不会污染新请求（F5）。
 *     兼容路径：也可继续调用 session.adStarted() 等全局入口（作用于当前活动请求）。
 *   - 会话在 resolve('ok') 后进入握手等待：等 beforeAd 到来（正常播放）或握手超时
 *     （视为机会消耗、无播放收口）。超时后 SDK 仍迟到开始真实播放的，会话仍会施加暂停/静音——
 *     "真实播放必暂停静音、游戏不挂起"是最高优先级（F4）。
 *
 * 本模块不引用 game.js：游戏暂停与音频一律经 AdSession 的 controls 依赖注入。
 */

// 默认自然断点（本游戏 US-03）：广告只允许在整场比赛结束或返回菜单时请求。
// 断点集是默认配置而非硬编码：其他游戏经 breaks 配置注入自己的自然断点（F1）。
export const AD_BREAKS = Object.freeze({
  MATCH_END: 'match-end',
  MENU_RETURN: 'menu-return',
});

// requestAd 的 resolve 约定与 AdSession.request() 的最终结果状态。
// PLAYED = 广告确实播放过（或机会被 SDK 消耗）；NO_FILL = 无填充（绝不暂停）；
// ERROR = 平台失败；UNAVAILABLE = 平台不具备广告能力。
// requestAd 的 resolve 值：'ok' 表示广告机会已被 SDK 接手（是否真的播放以回调为准）
export const AD_STATUS = Object.freeze({
  PLAYED: 'played',
  NO_FILL: 'no-fill',
  ERROR: 'error',
  UNAVAILABLE: 'unavailable',
  OK: 'ok',
});

// 统一状态事件。onEvent / adapter.on 收到 (type, payload)。
// 适配器只发平台级事件（READY 等）；ad-* 生命周期由 AdSession 统一发出，适配器不得伪造。
export const PLATFORM_EVENTS = Object.freeze({
  READY: 'ready',
  AD_REQUEST: 'ad-request',
  AD_START: 'ad-start',
  AD_COMPLETE: 'ad-complete',
  AD_NO_FILL: 'ad-no-fill',
  AD_ERROR: 'ad-error',
});

// 默认支持语言（本游戏 US-02：简体中文与英语）。这是默认配置、不是通用核心不可改变的表：
// 其他游戏经 createLanguagePolicy / normalizeLanguage 第三参 / installPlatform({ languages }) 覆盖（F2）。
export const SUPPORTED_LANGUAGES = Object.freeze(['zh-cn', 'en']);

/** 语言标签归一化：无效/未支持安全回退（玩家保存 > 平台 > 浏览器 > 默认的优先级由 i18n 层组合）。 */
export function normalizeLanguage(raw, fallback = 'en', supported = SUPPORTED_LANGUAGES) {
  const list = Array.isArray(supported) && supported.length
    ? supported.filter((s) => typeof s === 'string')
    : SUPPORTED_LANGUAGES;
  const fb = typeof fallback === 'string' && fallback ? fallback.toLowerCase() : 'en';
  if (typeof raw !== 'string') return fb;
  const tag = raw.trim().toLowerCase().replace(/_/g, '-');
  if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(tag)) return fb;
  if (list.includes(tag)) return tag;
  const base = tag.split('-')[0];
  return list.find((l) => l.split('-')[0] === base) || fb;
}

/** 语言策略（F2）：每个游戏用自己的支持集与回退，核心不持有任何具体语言表。 */
export function createLanguagePolicy({ supported = SUPPORTED_LANGUAGES, fallback = 'en' } = {}) {
  const list = Array.isArray(supported) && supported.length
    ? supported.filter((s) => typeof s === 'string')
    : [...SUPPORTED_LANGUAGES];
  return {
    supported: list,
    fallback,
    normalize: (raw) => normalizeLanguage(raw, fallback, list),
  };
}

/** 断点策略（F1）：null/undefined 用默认两点；数组/Set/枚举对象按成员；函数按谓词（异常视为非法断点）。 */
export function createBreakPolicy(breaks) {
  if (breaks == null) return (v) => isAdBreak(v);
  if (typeof breaks === 'function') {
    return (v) => {
      try { return !!breaks(v); } catch (_) { return false; }
    };
  }
  const raw = Array.isArray(breaks) ? breaks
    : breaks instanceof Set ? [...breaks]
    : typeof breaks === 'object' ? Object.values(breaks) : [];
  const set = new Set(raw.filter((x) => typeof x === 'string'));
  return (v) => typeof v === 'string' && set.has(v);
}

/** 是否合法自然断点（默认两点）：非法断点必须直接拒绝，不得触发平台广告调用。 */
export function isAdBreak(v) {
  return v === AD_BREAKS.MATCH_END || v === AD_BREAKS.MENU_RETURN;
}

/** 最小事件总线：处理器异常互相隔离（平台回调质量不可控，单个坏处理器不得中断生命周期）。 */
export function createEmitter() {
  const handlers = new Map();
  const remove = (event, handler) => {
    const list = handlers.get(event);
    if (!list) return;
    const i = list.indexOf(handler);
    if (i >= 0) list.splice(i, 1);
    if (!list.length) handlers.delete(event);
  };
  return {
    on(event, handler) {
      if (typeof event !== 'string' || typeof handler !== 'function') return () => {};
      let list = handlers.get(event);
      if (!list) handlers.set(event, (list = []));
      list.push(handler);
      return () => remove(event, handler);
    },
    off(event, handler) { remove(event, handler); },
    emit(event, payload) {
      const list = handlers.get(event);
      if (!list || !list.length) return;
      for (const h of list.slice()) {
        try { h(payload); } catch (_) { /* 处理器异常不得阻断生命周期 */ }
      }
    },
  };
}

const ADAPTER_REQUIRED = [
  ['id', 'string'], ['language', 'string'],
  ['init', 'function'], ['requestAd', 'function'], ['on', 'function'], ['off', 'function'],
];

/** 平台实现自检：Y8/GM 适配器接入前调用，返回 { ok, missing }。off 必须存在（F7：可退订）。 */
export function validateAdapter(adapter) {
  const missing = ADAPTER_REQUIRED
    .filter(([k, t]) => !adapter || typeof adapter[k] !== t)
    .map(([k]) => k);
  return { ok: missing.length === 0, missing };
}
