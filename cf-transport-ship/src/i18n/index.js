// 本游戏 i18n 稳定公共入口。
// 可移植核心在 ./locale-service.js（无游戏专属依赖，其他游戏可直接复制）；
// 这里用本游戏词典与设置适配层把核心装配好，供菜单/HUD/结算等后续任务接入。

import { createLocaleService, normalizeTag, matchLocale, resolveLocale, validateCatalogs } from './locale-service.js';
import { CATALOGS } from './catalogs.js';
import { createOptsLangAdapter } from './adapter-settings.js';

export { createLocaleService, normalizeTag, matchLocale, resolveLocale, validateCatalogs };
export { CATALOGS };
export { createOptsLangAdapter };

// 创建游戏语言服务。
//   storage         默认桥接 cf_opts_v2 的 lang 字段（acquireStorage 内存兜底）；
//   platformLocale  平台语言（Y8 locale），字符串或 () => string，由平台适配器传入；
//   browserLocale   默认取 navigator.language（Node/测试可显式覆盖）；
//   defaultLocale   构建默认语言：离线为 'zh'（默认），平台构建传 'en'。
export function createGameLocale({
  storage = createOptsLangAdapter(),
  platformLocale = null,
  browserLocale = typeof navigator !== 'undefined' ? navigator.language : null,
  defaultLocale = 'zh',
  onMissing = null,
} = {}) {
  return createLocaleService({
    catalogs: CATALOGS,
    storage,
    storageKey: 'lang',
    platformLocale,
    browserLocale,
    defaultLocale,
    onMissing,
  });
}
