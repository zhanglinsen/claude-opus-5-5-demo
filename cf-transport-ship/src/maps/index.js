// 浏览器侧地图装配：把纯元数据注册表与几何构建函数接起来
import { MAPS, NEW_PLAYER_DEFAULT_MAP, MAP_SET, getMapDescriptor, resolveMapId, inSpawnZone } from './registry.js';

export { MAPS, NEW_PLAYER_DEFAULT_MAP, getMapDescriptor, resolveMapId, inSpawnZone } from './registry.js';
export { DESERT_LAYOUT } from './desert-grey-layout.js';

// 点击出击后只执行所选地图的构建器；包仍是自包含单文件，但不在开局时
// 同时初始化另一张地图模块。地图集分支与构建目标解耦（registry.MAP_SET）。
export async function getMapBuilder(id) {
  if (MAP_SET === 'classic') {
    if (id === 'transport-ship') return (await import('../map.js')).buildMap;
    if (id === 'desert-grey') return (await import('./desert-grey.js')).buildDesertGrey;
    return null;
  }
  if (id === 'platform-desert') return (await import('./platform-desert/build.js')).buildPlatformDesert;
  if (id === 'platform-harbor') return (await import('./platform-harbor/index.js')).buildPlatformHarbor;
  return null;
}
