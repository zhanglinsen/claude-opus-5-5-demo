// 设置存取与版本迁移（纯模块：storage 可注入，便于单元测试）
// v1（cf_ship_opts）为运输船单地图时代的无版本设置；v2 增加地图字段。
// 任何来源的数据（v1 / v2 / 损坏 / 抛错 storage）经 loadOpts 后都保证字段完整且合法。

export const LEGACY_KEY = 'cf_ship_opts';
export const SETTINGS_KEY = 'cf_opts_v2';
export const SETTINGS_VERSION = 2;

export const DEFAULT_OPTS = {
  v: SETTINGS_VERSION,
  map: null, // null = 新玩家默认（由地图注册表解析；沙漠灰开放前回退运输船）
  team: 'BL',
  primary: 'ak47',
  size: 6,
  diff: 'normal',
  goal: 50,
  tod: 'day',
  quality: null, // null = 运行时按设备决定（触屏 low / 桌面 high）
  sens: 1.0,
  fov: 78,
  vol: 0.8,
  mode: null, // null = 跟随地图默认模式（运输船 tdm、沙漠灰 bomb）；对局时 URL ?mode= 优先于已存设置
};

// 模式合法取值（与 modes/index.js 的 MODES 键一致；菜单模式分段与持久化共用）
export const ENUMS_MODE = ['tdm', 'bomb', 'practice'];

// 合法取值与数值范围；范围覆盖菜单分段控件并留出合理余量
const ENUMS = {
  team: ['BL', 'GR'],
  primary: ['ak47', 'm4a1', 'awm', 'mp5'],
  diff: ['easy', 'normal', 'hard', 'hell'],
  tod: ['day', 'dusk'],
  quality: ['low', 'medium', 'high'],
  mode: ENUMS_MODE,
};
const RANGES = {
  sens: [0.2, 3],
  fov: [65, 100],
  vol: [0, 1],
  goal: [1, 1000],
  size: [2, 16],
};

// 用默认值兜底重建：非法枚举回默认，非法/越界数值回默认并夹紧；输出总是字段齐全
export function normalize(raw, touch = false) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const out = { ...DEFAULT_OPTS };
  for (const k of Object.keys(ENUMS)) if (ENUMS[k].includes(o[k])) out[k] = o[k];
  // 地图 id 的合法性由地图注册表解析兜底（未知 id 自动回退），这里只保证类型
  if (typeof o.map === 'string' || o.map === null) out.map = o.map;
  for (const k of Object.keys(RANGES)) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.min(RANGES[k][1], Math.max(RANGES[k][0], v));
  }
  out.v = SETTINGS_VERSION;
  if (out.quality == null) out.quality = touch ? 'low' : 'high';
  return out;
}

// v1 -> v2：保留灵敏度/音量/画质/武器偏好等旧字段。
// 旧用户判定基于「legacy 键存在」（哪怕内容是 {} 或损坏 JSON），与其中的字段数无关：
// 有旧记录的用户默认运输船；无任何记录的全新玩家 map 交由注册表解析。
export function migrate(rawLegacy, hasLegacyKey = rawLegacy != null, touch = false) {
  let parsed = null;
  if (typeof rawLegacy === 'string') {
    try { parsed = JSON.parse(rawLegacy); } catch (e) { parsed = null; }
  } else if (rawLegacy && typeof rawLegacy === 'object') parsed = rawLegacy;
  const out = normalize(parsed, touch);
  out.map = hasLegacyKey ? 'transport-ship' : DEFAULT_OPTS.map;
  return out;
}

function safeGet(storage, key) {
  try { return storage.getItem(key); } catch (e) { return null; } // 隐私模式等会抛 SecurityError
}

// 内存兜底：localStorage 属性本身被拦截（getter 抛错）或不存在时，设置退化为会话内有效
const MEMORY_STORAGE = (() => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
})();

// 获取 storage 的唯一入口：属性读取（getter）本身可能抛 SecurityError，
// 调用方不得直接书写 `localStorage`，统一经此获取；失败时回退内存实现。
export function acquireStorage() {
  try {
    const s = globalThis.localStorage;
    if (s && typeof s.getItem === 'function') return s;
  } catch (e) { /* getter 抛错 → 内存兜底 */ }
  return MEMORY_STORAGE;
}

export function loadOpts(storage, touch = false) {
  // v2 记录：解析成功即归一化使用；否则尝试迁移旧记录；storage 抛错时走全新默认
  let o = null;
  const raw = safeGet(storage, SETTINGS_KEY);
  if (raw != null) {
    try { o = JSON.parse(raw); } catch (e) { o = null; }
    if (o && typeof o === 'object' && o.v === SETTINGS_VERSION) return normalize(o, touch);
  }
  const legacyRaw = safeGet(storage, LEGACY_KEY);
  o = migrate(legacyRaw, typeof legacyRaw === 'string', touch);
  saveOpts(storage, o);
  return o;
}

export function saveOpts(storage, o) {
  try { storage.setItem(SETTINGS_KEY, JSON.stringify(o)); } catch (e) { /* 只读/抛错 storage 下放弃持久化 */ }
}
