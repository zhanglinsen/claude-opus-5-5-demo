// 雾港码头地图模块出口：接入时在 maps/index.js 增加一行
//   MAP_BUILDERS['platform-harbor'] = buildPlatformHarbor;
// 并把 PLATFORM_HARBOR_DESCRIPTOR 并入 maps/registry.js 的 MAPS（见模块报告的集成要求）。
export { buildPlatformHarbor } from './build.js';
export {
  LEVELS, BOUNDS, KILL_Y, PALETTE, CONTAINER_COLOR_BUDGET,
  SOLIDS, REGIONS, NAV_GRAPH, NAV_NODES, NAV_EDGES, NAV_PAIRS,
  SPAWNS, LAMPS, PRACTICE_TARGETS, ROUTES, PLATFORM_HARBOR_DESCRIPTOR, META,
} from './layout.js';
