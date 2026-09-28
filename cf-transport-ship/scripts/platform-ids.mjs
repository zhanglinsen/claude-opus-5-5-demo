// 正式平台 ID 配置（build:configured 专用构建期模块）：读取/校验 platform-ids.json。
// 刻意不放进 src/platform/：那里是可复用平台插件层，与本游戏的具体凭据无关；
// 本模块只在构建期由 build.mjs 使用，不参与 esbuild 打包。
// platform-ids.json 是本游戏专属、可整体替换的公开客户端 ID 配置——平台 SDK 在
// 浏览器端使用的公开 ID，非服务端密钥。任何缺失/空 ID 都在构建期明确失败，
// 绝不产出伪装成正式包的产物。
import fs from 'node:fs';

function requireStr(obj, keyPath) {
  const v = obj && obj[keyPath.split('.').pop()];
  if (typeof v !== 'string' || !v.trim()) {
    throw new Error(`platform-ids.json: 字段 "${keyPath}" 缺失或不是非空字符串`);
  }
  return v.trim();
}

// 校验并归位：{ y8: {appId, gameId}, gamemonetize: {gameId} }。
// y8 SDK 需要 App ID + Game ID 两项；GameMonetize 官方 SDK 只需要 Game ID。
export function parsePlatformIds(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('platform-ids.json: 配置必须是对象 { y8: {appId, gameId}, gamemonetize: {gameId} }');
  }
  if (!raw.y8 || typeof raw.y8 !== 'object') {
    throw new Error('platform-ids.json: 缺少 "y8" 目标配置（需要 y8.appId 与 y8.gameId）');
  }
  if (!raw.gamemonetize || typeof raw.gamemonetize !== 'object') {
    throw new Error('platform-ids.json: 缺少 "gamemonetize" 目标配置（需要 gamemonetize.gameId）');
  }
  return Object.freeze({
    y8: Object.freeze({
      appId: requireStr(raw.y8, 'y8.appId'),
      gameId: requireStr(raw.y8, 'y8.gameId'),
    }),
    gamemonetize: Object.freeze({ gameId: requireStr(raw.gamemonetize, 'gamemonetize.gameId') }),
  });
}

export function loadPlatformIds(file) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`platform-ids.json 读取/解析失败（${file}）: ${e.message}`);
  }
  return parsePlatformIds(raw);
}
