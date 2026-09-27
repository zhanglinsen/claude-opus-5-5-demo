// 本游戏 i18n 稳定公共入口。
// 可移植核心在 ./locale-service.js（无游戏专属依赖，其他游戏可直接复制）；
// 这里用本游戏词典与设置适配层把核心装配好，供菜单/HUD/结算等后续任务接入。

import { createLocaleService, normalizeTag, matchLocale, resolveLocale, validateCatalogs } from './locale-service.js';
import { CATALOGS, withPlatformBranding } from './catalogs.js';
import { createOptsLangAdapter } from './adapter-settings.js';

export { createLocaleService, normalizeTag, matchLocale, resolveLocale, validateCatalogs };
export { CATALOGS, withPlatformBranding };
export { createOptsLangAdapter };

// 编译目标（Task 11 / US-05）：esbuild define 注入；Node 测试环境回退 offline。
// 平台目标（y8 / gamemonetize）用品牌中立目录——公开可见文本不出现原作品牌词。
const BUILD_TARGET = typeof __BUILD_TARGET__ !== 'undefined' ? __BUILD_TARGET__ : 'offline';
const TARGET_CATALOGS = BUILD_TARGET === 'offline' ? CATALOGS : withPlatformBranding(CATALOGS);

// 创建游戏语言服务（主控只创建一个实例，贯通 HUD / 触屏 / 战斗报点）。
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
    catalogs: TARGET_CATALOGS,
    storage,
    storageKey: 'lang',
    platformLocale,
    browserLocale,
    defaultLocale,
    onMissing,
  });
}
