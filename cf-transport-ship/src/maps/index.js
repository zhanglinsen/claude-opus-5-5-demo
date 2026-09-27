// 浏览器侧地图装配：把纯元数据注册表与几何构建函数接起来
import { MAPS, NEW_PLAYER_DEFAULT_MAP, TARGET_SET, getMapDescriptor, resolveMapId, inSpawnZone } from './registry.js';

export { MAPS, NEW_PLAYER_DEFAULT_MAP, getMapDescriptor, resolveMapId, inSpawnZone } from './registry.js';
export { DESERT_LAYOUT } from './desert-grey-layout.js';

// 按编译目标惰性加载构建器（Task 11 / US-05）：__BUILD_TARGET__ 由 esbuild define 注入，
// minify 时非目标分支被整枝剔除——离线包不含平台图几何代码，反之亦然。
// 离线版只保留旧 desert-grey / transport-ship 构建器；平台版只用原创图构建器。
export async function getMapBuilders() {
  if (TARGET_SET === 'platform') {
    const [{ buildPlatformDesert }, { buildPlatformHarbor }] = await Promise.all([
      import('./platform-desert/build.js'),
      import('./platform-harbor/index.js'),
    ]);
    return { 'platform-desert': buildPlatformDesert, 'platform-harbor': buildPlatformHarbor };
  }
  const [{ buildMap }, { buildDesertGrey }] = await Promise.all([
    import('../map.js'),
    import('./desert-grey.js'),
  ]);
  return { 'transport-ship': buildMap, 'desert-grey': buildDesertGrey };
}
