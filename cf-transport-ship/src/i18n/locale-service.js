// LocaleService 可移植插件核心（与具体游戏解耦）：
// - 目录（catalogs）由宿主注入，本文件不含任何游戏文案或游戏专属名称；
// - 语言来源优先级：已保存选择 > 平台语言 > 浏览器语言 > 构建默认；
// - 保存值 '' / null 表示「自动」，按上述优先级重新解析；
// - storage 可注入且允许抛错（隐私模式等），失败仅放弃持久化，不影响运行。
// 接入方式见同目录 README.md。

// BCP47 风格标签归一：小写、去空白；非字符串或空值返回 null
export function normalizeTag(tag) {
  if (typeof tag !== 'string') return null;
  const t = tag.trim().toLowerCase();
  return t ? t : null;
}

// 在目录中匹配语言标签：先精确匹配，再回退主子标签（zh-hans-cn → zh）。
// 只认字母数字与连字符，杜绝任意字符串进入目录键。
export function matchLocale(catalogs, tag) {
  const t = normalizeTag(tag);
  if (!t || !catalogs) return null;
  if (Object.prototype.hasOwnProperty.call(catalogs, t)) return t;
  const primary = t.split(/[^a-z0-9]+/)[0];
  if (primary && Object.prototype.hasOwnProperty.call(catalogs, primary)) return primary;
  return null;
}

// 目录体检：返回问题描述数组（空数组 = 通过）。要求：目录非空、值为非空字符串、各语言键一致。
export function validateCatalogs(catalogs) {
  const problems = [];
  const locales = catalogs && typeof catalogs === 'object' ? Object.keys(catalogs) : [];
  if (!locales.length) { problems.push('catalogs 为空'); return problems; }
  const keySets = new Map();
  for (const loc of locales) {
    const dict = catalogs[loc];
    if (!dict || typeof dict !== 'object') { problems.push(`目录 ${loc} 不是对象`); continue; }
    const keys = new Set();
    for (const [k, v] of Object.entries(dict)) {
      if (typeof v !== 'string' || !v.length) problems.push(`${loc}.${k} 的值不是非空字符串`);
      keys.add(k);
    }
    keySets.set(loc, keys);
  }
  const [first, ...rest] = locales.filter((l) => keySets.has(l));
  for (const loc of rest) {
    for (const k of keySets.get(first)) if (!keySets.get(loc).has(k)) problems.push(`${loc} 缺键 ${k}`);
    for (const k of keySets.get(loc)) if (!keySets.get(first).has(k)) problems.push(`${loc} 多键 ${k}`);
  }
  return problems;
}

// 解析生效语言：saved（非空）> platform > browser > default。
// 每一级都必须命中目录，否则跳到下一级；默认也不命中时回目录第一个键。
export function resolveLocale({ catalogs, saved, platformLocale, browserLocale, defaultLocale }) {
  const fromSource = (src) => (typeof src === 'function' ? src() : src);
  return (
    matchLocale(catalogs, saved) ||
    matchLocale(catalogs, fromSource(platformLocale)) ||
    matchLocale(catalogs, fromSource(browserLocale)) ||
    matchLocale(catalogs, defaultLocale) ||
    Object.keys(catalogs || {})[0] ||
    null
  );
}

const AUTOMATIC = new Set(['', null, undefined]);

// 创建语言服务。所有依赖显式注入，无全局副作用：
//   createLocaleService({ catalogs, storage, storageKey, platformLocale, browserLocale, defaultLocale, onMissing })
// storage：可选 { getItem, setItem }（DOM localStorage 形状即可），读写抛错均被吞掉。
// platformLocale / browserLocale：字符串或 () => string|null（函数便于宿主延迟求值）。
export function createLocaleService({
  catalogs,
  storage = null,
  storageKey = 'lang',
  platformLocale = null,
  browserLocale = null,
  defaultLocale = null,
  onMissing = null,
} = {}) {
  if (!catalogs || typeof catalogs !== 'object' || !Object.keys(catalogs).length) {
    throw new TypeError('createLocaleService: catalogs 不能为空');
  }
  let destroyed = false;
  const listeners = new Set();
  const missingKeys = new Set();

  const savedValue = () => {
    if (!storage) return null;
    try {
      const v = storage.getItem(storageKey);
      return typeof v === 'string' ? v : null;
    } catch (e) { return null; } // 隐私模式等会抛 SecurityError
  };
  const persist = (value) => {
    if (!storage) return false;
    try { storage.setItem(storageKey, value); return true; } catch (e) { return false; }
  };
  const fallbackLocale = () => matchLocale(catalogs, defaultLocale) || Object.keys(catalogs)[0];

  // 当前保存值；空值即自动（用 null 统一表示，对外由 isAuto() 区分语义）
  let saved = savedValue();
  let current = resolveLocale({ catalogs, saved, platformLocale, browserLocale, defaultLocale });

  function t(key, params = null) {
    let text = catalogs[current] && Object.prototype.hasOwnProperty.call(catalogs[current], key)
      ? catalogs[current][key]
      : undefined;
    if (text === undefined) {
      const fb = fallbackLocale();
      if (fb != null && catalogs[fb] && Object.prototype.hasOwnProperty.call(catalogs[fb], key)) {
        text = catalogs[fb][key];
      } else {
        // 缺键诊断：记录 + 一次性回调，回退键名本身（可诊断、不崩溃）
        const sig = `${current}:${key}`;
        if (!missingKeys.has(sig)) {
          missingKeys.add(sig);
          if (typeof onMissing === 'function') onMissing(key, current);
        }
        text = key;
      }
    }
    if (params && typeof params === 'object') {
      text = text.replace(/\{(\w+)\}/g, (m, name) => (params[name] != null ? String(params[name]) : m));
    }
    return text;
  }

  function notify(locale) {
    for (const fn of [...listeners]) {
      try { fn(locale); } catch (e) { /* 单个订阅者异常不阻断通知 */ }
    }
  }

  return {
    // 当前生效语言（目录键，如 'zh' / 'en'）
    getLocale() { return current; },
    // 是否处于自动解析（用户未指定语言）
    isAuto() { return AUTOMATIC.has(saved); },
    // 原始保存值；无 storage 或读取失败时为 null
    getSavedLocale() { return AUTOMATIC.has(saved) ? null : saved; },
    // 翻译：t(key, params)；缺键回退默认语言，再回退键名
    t,
    // 显式选择语言并持久化；'' / null 回到自动。未知语言返回 false（状态不变）
    setLocale(tag) {
      if (destroyed) return false;
      if (AUTOMATIC.has(tag)) {
        saved = '';
        persist('');
        current = resolveLocale({ catalogs, saved: null, platformLocale, browserLocale, defaultLocale });
        notify(current);
        return true;
      }
      const loc = matchLocale(catalogs, tag);
      if (!loc) return false;
      const changed = loc !== current || AUTOMATIC.has(saved);
      saved = normalizeTag(tag); // 保留用户输入的区域变体（如 zh-CN），解析时按主子标签命中
      persist(saved);
      if (changed) { current = loc; notify(current); }
      return true;
    },
    // 语言切换通知；返回退订函数，销毁后返回 null
    subscribe(fn) {
      if (destroyed || typeof fn !== 'function') return null;
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    // 缺键诊断：[{ locale, key }]
    getMissingKeys() {
      return [...missingKeys].map((sig) => {
        const i = sig.indexOf(':');
        return { locale: sig.slice(0, i), key: sig.slice(i + 1) };
      });
    },
    // 释放订阅列表；销毁后只读查询（t/getLocale）仍可用，写入类操作静默失效
    destroy() {
      destroyed = true;
      listeners.clear();
    },
  };
}
