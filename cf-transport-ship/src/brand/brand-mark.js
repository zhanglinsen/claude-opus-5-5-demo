// 品牌资源选择（US-01，纯逻辑，不含资源字节与 DOM 依赖）。
// 三张 175×175 原图：中文深底 / 中文透明 / 英文透明；实际 src 由 assets.js
// 经 esbuild dataurl loader 内联注入，选择规则与原图解耦，便于测试与复用。

export const BRAND_DIMENSIONS = { width: 175, height: 175 };

// 资源清单元数据：id → 语言 / 背景 / 默认替代文本来源
export const BRAND_ASSET_IDS = ['zh-dark', 'zh-transparent', 'en-transparent'];

const ASSET_META = {
  'zh-dark': { locale: 'zh', background: 'dark' },
  'zh-transparent': { locale: 'zh', background: 'transparent' },
  'en-transparent': { locale: 'en', background: 'transparent' },
};

// 默认替代文本（与 i18n 目录解耦，品牌组件保持独立可用）
export const BRAND_ALT = { zh: '无限工作室标志', en: 'Infinity studio logo' };

// 语言 → 中文/英文（主子标签命中；未知语言回退 defaultLocale）
export function resolveBrandLocale(locale, defaultLocale = 'zh') {
  if (typeof locale !== 'string') return defaultLocale;
  const primary = locale.trim().toLowerCase().split(/[^a-z0-9]+/)[0];
  if (primary === 'zh' || primary === 'en') return primary;
  return defaultLocale;
}

// 按当前语言与背景选品牌资源：
//   selectBrandMark('zh', 'dark', { assets, altTexts }) →
//   { id, src, alt, width, height, locale, background }
// 英文只有透明版（任何背景都用它）；深底缺失时回退中文透明；未知语言回退 defaultLocale。
export function selectBrandMark(locale, background = 'dark', { assets = {}, altTexts = BRAND_ALT, defaultLocale = 'zh' } = {}) {
  const lang = resolveBrandLocale(locale, defaultLocale);
  const wanted = lang === 'en'
    ? ['en-transparent']
    : background === 'dark' ? ['zh-dark', 'zh-transparent'] : ['zh-transparent', 'zh-dark'];
  const id = wanted.find((k) => assets && assets[k] && assets[k].src != null) || null;
  const alt = (altTexts && (altTexts[lang] || altTexts[defaultLocale])) || '';
  if (!id) return null;
  return { id, src: assets[id].src, alt, ...BRAND_DIMENSIONS, locale: lang, background };
}
