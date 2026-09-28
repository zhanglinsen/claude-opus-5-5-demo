// 主控入口（Task 11 / US-05）：语言 → 平台适配器 → 游戏，同一 LocaleService 实例贯通
// 菜单/HUD、触屏控件与战斗报点；平台广告只在自然断点（match-end / menu-return）请求。
// 编译目标由 build.mjs 以 esbuild define 注入 __BUILD_TARGET__：
//   offline       离线版（默认）：OfflinePlatformAdapter，无平台 SDK、无运行时外部请求
//   y8            仅此目标创建 Y8PlatformAdapter（只加载 Y8 官方脚本）
//   gamemonetize  仅此目标创建 GameMonetizePlatformAdapter（只加载 GM 官方脚本）
import { Game } from './game.js';
import { createGameLocale } from './i18n/index.js';
import { installPlatform, OfflinePlatformAdapter } from './platform/index.js';
import { resolvePlatformConfig, mockMarker } from './platform/config.js';
import { createPlatformLocaleBridge } from './platform/locale-bridge.js';

(async () => {
  // 平台凭据两条路径：默认三构建包内不含任何真实平台 ID，宿主页经 window.__PLATFORM_IDS__
  // 注入，缺失时进入 mock 模式——不创建平台适配器、不请求平台 SDK，并明确标记；
  // build:configured 配置包由构建期在主脚本之前内联 window.__PLATFORM_IDS__，
  // 运行时走同一解析路径直接得到 mock=false 的真实平台适配器（SDK 失败仍安全退化）。
  const ids = typeof window !== 'undefined' && window.__PLATFORM_IDS__ ? window.__PLATFORM_IDS__ : {};
  const config = resolvePlatformConfig(__BUILD_TARGET__, ids);

  // 目标分支只以 __BUILD_TARGET__ 字面量比较（不得混入运行时条件）：
  // esbuild minify 可将非目标分支整枝剔除，平台适配器代码与官方 SDK 脚本地址
  // 不会进入其他目标的包。mock 模式在分支内部退回离线适配器。
  let adapter;
  if (__BUILD_TARGET__ === 'y8') {
    if (!config.mock) {
      const { Y8PlatformAdapter } = await import('./platform/y8.js');
      adapter = new Y8PlatformAdapter({ appId: config.appId, gameId: config.gameId });
    } else {
      adapter = new OfflinePlatformAdapter();
    }
  } else if (__BUILD_TARGET__ === 'gamemonetize') {
    if (!config.mock) {
      const { GameMonetizePlatformAdapter } = await import('./platform/gamemonetize.js');
      adapter = new GameMonetizePlatformAdapter({ gameId: config.gameId });
    } else {
      adapter = new OfflinePlatformAdapter();
    }
  } else {
    adapter = new OfflinePlatformAdapter();
  }

  // 单一语言实例：优先级（玩家保存 > 平台语言 > 浏览器 > 构建默认）在服务内解析。
  // 平台语言只来自真实平台适配器（Y8/GM 已注入正式 ID），且只在 SDK 就绪后生效
  // （locale-bridge）：就绪前适配器内部 fallback（Y8 'zh-cn'）不是真实平台语言，
  // getter 返回 null 落到浏览器语言 → 构建默认；ready 成功后仅自动档重解析一次
  // （显式选择不被覆盖，失败保持浏览器/默认）。离线保持离线适配器语言，mock 无平台语言。
  const localeBridge = __BUILD_TARGET__ === 'offline' || config.mock
    ? null
    : createPlatformLocaleBridge({
      // Y8：SDK ready 但 getPlatformLocale 缺失/抛错/返回空时，适配器 language 仍是
      // 内部 fallback（'zh-cn'）而非真实平台语言，只取 resolvedPlatformLocale（无则 null）；
      // GM：language 即构造注入的真实平台语言，直接可用。
      getLanguage: __BUILD_TARGET__ === 'y8'
        ? () => adapter.resolvedPlatformLocale
        : () => adapter.language,
    });
  const locale = createGameLocale({
    platformLocale: localeBridge
      ? localeBridge.platformLocale
      : config.mock ? null : () => adapter.language,
    defaultLocale: config.defaultLocale,
  });

  // 游戏注入的广告控制面：暂停与临时静音都由 Game/Audio 承接，
  // 广告结束/失败/no-fill 后准确恢复玩家此前的暂停状态与音量（音量持久层不可达）。
  let game = null;
  const platform = installPlatform({
    adapter,
    breaks: ['match-end', 'menu-return'], // 本游戏自然断点：整场结束 / 返回菜单
    controls: {
      isUserPaused: () => (game ? game.isUserPaused() : false),
      enterAdPause: () => game && game.enterAdPause(),
      exitAdPause: (wasUserPaused) => game && game.exitAdPause(wasUserPaused),
      setAdMuted: (on) => game && game.audio.setAdMuted(on),
    },
  });
  if (localeBridge) localeBridge.attach(platform, locale); // ready 后自动档重解析平台语言

  game = new Game();
  game.locale = locale;              // 触屏控件构造时自动接同一实例（touch.js 接线路径 1）
  game.setLocaleService(locale);     // 战斗报点/报点区域/结算文案即时取词（必须在 init 前）
  game.platform = platform;          // 自然断点广告请求经 game.requestPlatformAd()
  try {
    await game.init();
  } catch (e) {
    console.error(e);
    const el = document.getElementById('loadTxt');
    const msg = e && e.message ? e.message : String(e);
    if (el) el.textContent = locale.t('load.fail', { msg });
  }

  // mock 标记（可验证）：无正式 ID 的包明确自报 mock，不对外声称可提交
  const marker = mockMarker(config);
  if (marker && typeof window !== 'undefined') {
    window.__PLATFORM_MOCK__ = marker;
    document.documentElement.dataset.platformMock = 'true';
    console.warn(`[platform] ${marker.target}: 正式 App/Game ID 缺失，运行于 mock 模式（诊断占位 ID: ${marker.ids.appId}）。此包不可作为发布包提交。`);
  }
})();
