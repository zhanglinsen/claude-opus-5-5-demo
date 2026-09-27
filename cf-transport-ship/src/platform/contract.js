/**
 * PlatformAdapter 合同（US-03）：离线 / Y8 / GameMonetize 共用的最小接口与纯工具。
 * 本模块零依赖、无 DOM/window/network，可被 Node 测试与构建期直接加载。
 *
 * 平台实现（y8 / gamemonetize，任务 7/8）需满足 validateAdapter 的结构：
 *   id        : string                          平台标识（'offline' | 'y8' | 'gamemonetize'）
 *   language  : string                          归一化平台语言（normalizeLanguage 的结果）
 *   init()    : Promise<boolean>                幂等初始化，就绪时发 PLATFORM_EVENTS.READY
 *   requestAd(breakpoint): Promise<'ok'|'no-fill'|'error'>
 *               仅在自然断点调用；resolve 值约定见 AD_STATUS；
 *               广告实际开始/结束由平台回调驱动（Y8 beforeAd/afterAd，GM SDK_GAME_PAUSE/SDK_GAME_START），
 *               由 AdSession（ad-session.js）收口为统一生命周期。
 *   on/off(event, handler)                      平台事件订阅
 *
 * 本模块不引用 game.js：游戏暂停与音频一律经 AdSession 的 controls 依赖注入。
 */

// 自然断点：广告只允许在整场比赛结束或返回菜单时请求（US-03），交战期间/页面加载绝不触发。
export const AD_BREAKS = Object.freeze({
  MATCH_END: 'match-end',
  MENU_RETURN: 'menu-return',
});

// requestAd 的 resolve 约定与 AdSession.request() 的最终结果状态。
// PLAYED = 广告确实播放过；NO_FILL = 无填充（绝不暂停）；ERROR = 平台失败；
// UNAVAILABLE = 平台不具备广告能力（如离线版无填充语义之外的兜底）。
export const AD_STATUS = Object.freeze({
  PLAYED: 'played',
  NO_FILL: 'no-fill',
  ERROR: 'error',
  UNAVAILABLE: 'unavailable',
  // requestAd 的 resolve 值：'ok' 表示广告机会已被 SDK 接手（是否真的播放以回调为准）
  OK: 'ok',
});

// 统一状态事件。onEvent / adapter.on 收到 (type, payload)。
export const PLATFORM_EVENTS = Object.freeze({
  READY: 'ready',
  AD_REQUEST: 'ad-request',
  AD_START: 'ad-start',
  AD_COMPLETE: 'ad-complete',
  AD_NO_FILL: 'ad-no-fill',
  AD_ERROR: 'ad-error',
});

// 首版支持语言（US-02）：简体中文与英语；平台默认英语，离线默认中文。
export const SUPPORTED_LANGUAGES = Object.freeze(['zh-cn', 'en']);

/** 语言标签归一化：无效/未支持安全回退（玩家保存 > 平台 > 浏览器 > 默认的优先级由 i18n 层组合）。 */
export function normalizeLanguage(raw, fallback = 'en') {
  const fb = typeof fallback === 'string' && fallback ? fallback.toLowerCase() : 'en';
  if (typeof raw !== 'string') return fb;
  const tag = raw.trim().toLowerCase().replace(/_/g, '-');
  if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(tag)) return fb;
  if (SUPPORTED_LANGUAGES.includes(tag)) return tag;
  const base = tag.split('-')[0];
  return SUPPORTED_LANGUAGES.find((l) => l.split('-')[0] === base) || fb;
}

/** 是否合法自然断点：非法断点必须直接拒绝，不得触发平台广告调用。 */
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
  ['init', 'function'], ['requestAd', 'function'], ['on', 'function'],
];

/** 平台实现自检：Y8/GM 适配器接入前调用，返回 { ok, missing }。 */
export function validateAdapter(adapter) {
  const missing = ADAPTER_REQUIRED
    .filter(([k, t]) => !adapter || typeof adapter[k] !== t)
    .map(([k]) => k);
  return { ok: missing.length === 0, missing };
}
