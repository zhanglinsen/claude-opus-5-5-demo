// 浏览器侧地图装配：把纯元数据注册表与几何构建函数接起来
import { MAPS, NEW_PLAYER_DEFAULT_MAP, TARGET_SET, getMapDescriptor, resolveMapId, inSpawnZone } from './registry.js';

export { MAPS, NEW_PLAYER_DEFAULT_MAP, getMapDescriptor, resolveMapId, inSpawnZone } from './registry.js';
export { DESERT_LAYOUT } from './desert-grey-layout.js';

// 点击出击后只执行所选地图的构建器；包仍是离线单文件，但不在开局时
// 同时初始化另一张地图模块。编译目标分支保持原有隔离。
export async function getMapBuilder(id) {
  if (TARGET_SET === 'platform') {
    if (id === 'platform-desert') return (await import('./platform-desert/build.js')).buildPlatformDesert;
    if (id === 'platform-harbor') return (await import('./platform-harbor/index.js')).buildPlatformHarbor;
    return null;
  }
  if (id === 'transport-ship') return (await import('../map.js')).buildMap;
  if (id === 'desert-grey') return (await import('./desert-grey.js')).buildDesertGrey;
  return null;
}
