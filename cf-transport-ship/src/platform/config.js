// 构建目标 → 平台配置解析（Task 11 / US-05，纯函数，node 可测）。
// 本模块不 import 任何适配器：适配器选择由主控（src/main.js）按 kind 执行，
// 保证三种构建互不加载彼此的外部 SDK。
//
// 凭据约定（两条路径）：默认三构建包内不含任何真实平台 ID，宿主页注入
// window.__PLATFORM_IDS__（{ appId, gameId }），缺失时进入 mock 模式——不创建平台
// 适配器（回退离线适配器，不发起平台 SDK 外部请求），并生成明确标记 mock 的占位
// ID 供诊断展示；build:configured 配置包由构建期在主脚本之前内联同一全局，
// 运行时经本模块解析直接得到 mock=false（SDK 失败仍安全退化）。本插件层保持
// 可复用：不包含任何具体平台 ID（具体值在仓库根 platform-ids.json，
// scripts/platform-ids.mjs 只负责构建期读取/校验并内联）。

export const BUILD_TARGETS = Object.freeze(['offline', 'y8', 'gamemonetize']);

// 各目标的外部 SDK 主机（文档用，不供运行时判断）：适配器脚本地址只存在于
// 对应目标的包内（src/main.js 目标分支被 esbuild 整枝），本表不参与打包隔离。
// SDK 隔离的验证在 tests/unit/build-targets.test.mjs 的构建产物检查中完成。

function str(v) {
  return typeof v === 'string' && v ? v : null;
}

// 解析目标配置：
//   {
//     kind          : 'offline' | 'y8' | 'gamemonetize'   目标平台
//     appId, gameId : string | null                       正式凭据（缺失为 null）
//     mock          : boolean                             无正式凭据的明确标记
//     mockIds       : { appId, gameId } | null            mock 占位 ID（仅诊断展示）
//     defaultLocale : 'zh' | 'en'                         构建默认语言
//   }
// 目标未知直接抛错：构建目标拼写错误必须构建期暴露，不能静默回退。
export function resolvePlatformConfig(target, ids = {}) {
  if (!BUILD_TARGETS.includes(target)) {
    throw new Error(`resolvePlatformConfig: unknown build target "${target}"`);
  }
  if (target === 'offline') {
    return { kind: 'offline', appId: null, gameId: null, mock: false, mockIds: null, defaultLocale: 'zh' };
  }
  const appId = str(ids.appId);
  const gameId = str(ids.gameId);
  const hasCredentials = target === 'y8' ? !!(appId && gameId) : !!gameId;
  return {
    kind: target,
    appId,
    gameId,
    mock: !hasCredentials,
    mockIds: hasCredentials
      ? null
      : { appId: `mock-${target}-app-id`, gameId: `mock-${target}-game-id` },
    defaultLocale: 'en',
  };
}

// mock 模式的页面标记（HTTP mock 可验证）：返回应写入 window 的诊断对象。
export function mockMarker(config) {
  if (!config || !config.mock) return null;
  return { mock: true, target: config.kind, ids: config.mockIds };
}
