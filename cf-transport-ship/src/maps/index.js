// 浏览器侧地图装配：把纯元数据注册表与几何构建函数接起来
import { buildMap } from '../map.js';
import { buildDesertGrey } from './desert-grey.js';

export { MAPS, NEW_PLAYER_DEFAULT_MAP, getMapDescriptor, resolveMapId, inSpawnZone } from './registry.js';
export { DESERT_LAYOUT } from './desert-grey-layout.js';

export const MAP_BUILDERS = {
  'transport-ship': buildMap,
  'desert-grey': buildDesertGrey,
};
