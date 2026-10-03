// 地图注册表（纯数据 + 解析函数，不依赖 three / DOM，可在 node 下测试）
// 每张地图描述：元信息、寻路范围、小地图参数、菜单镜头、AI 常量与换弹出生区判定。
// 编译目标（Task 11 / US-05）决定平台适配；可用地图集由独立的"地图集开关"决定：
//   classic（默认） 沙漠灰 desert-grey + 运输船 transport-ship：经典复刻图集，
//                  接平台 SDK 上架试用的默认图集（平台对经典复刻内容的审核结果待定）
//   original        赤霞集市 platform-desert + 雾港码头 platform-harbor：原创图集
//                  （公开文案走 i18n，不出现原作品牌名）；内部稳定 id 不变。
// 两版共用枪械/军衔/装备/设置与平台适配，存档键不变；旧存档里的失效地图 id 由
// resolveMapId 自动回退到当前图集有效地图。
// esbuild 以 define 注入 __BUILD_TARGET__ 与 __MAP_SET__（build.mjs --map-set=）；
// Node 测试环境无此全局时分别回退 offline / classic。

import { PLATFORM_DESERT_DESCRIPTOR } from './platform-desert/descriptor.js';
import { PLATFORM_HARBOR_DESCRIPTOR } from './platform-harbor/layout.js';

export const BUILD_TARGET = typeof __BUILD_TARGET__ !== 'undefined' ? __BUILD_TARGET__ : 'offline';

// 地图集开关：与编译目标解耦的项目级开关（仅构建期可见，玩家无感知）。
// 顺序即菜单/回退优先级；未知图集一律回退 classic。
export const MAP_SETS = Object.freeze({
  classic: ['transport-ship', 'desert-grey'],
  original: ['platform-desert', 'platform-harbor'],
});

// 纯函数：图集合法性归一（含 __MAP_SET__ 缺失/拼错的回退），node 可测
export function normalizeMapSet(v) { return v === 'original' ? 'original' : 'classic'; }

export const MAP_SET = normalizeMapSet(typeof __MAP_SET__ !== 'undefined' ? __MAP_SET__ : null);

const ALL_MAPS = {
  'transport-ship': {
    id: 'transport-ship',
    name: '运输船',
    en: 'TRANSPORT SHIP',
    available: true,
    supportedModes: ['tdm', 'practice'],
    defaultMode: 'tdm',
    loadingLabel: '搭建运输船',
    nav: { x0: -36.2, z0: -12.1, x1: 36.2, z1: 12.1, cell: 0.5, agentR: 0.42 },
    // 可玩区域边界（与甲板舷侧 invisible 墙一致）；出生点必须落在界内
    bounds: { x0: -36.6, z0: -12.15, x1: 36.6, z1: 12.15 },
    radar: {
      widthM: 74, heightM: 26, offX: 37, offZ: 13,
      maxColliderHalf: 30, // 过滤船体级大碰撞体
      overlays: [ // 二楼管道顶棚（虚线框）
        { x: -29.5, z: 9.4, w: 36.6, h: 2.44 },
        { x: -7.1, z: -11.84, w: 36.6, h: 2.44 },
      ],
    },
    menu: {
      orbit: { r: 46, rOff: -6, y: 13, yAmp: 3, zR: 34, look: [-4, 1.5, 0], fov: 60, speed: 0.045 },
      blurb: '联合国维和行动在监视非法军火出口时，发现一艘从俄罗斯驶往尼日利亚的可疑货轮。保卫者（Global Risk）奉命登船突击检查，却遭到潜伏者（Black List）伏击。<br>船头船尾两个船舱出生，中路 V 形斜放集装箱、两侧 L 形箱堆，左右各有一条只能从己方出生点进入的集装箱管道，管道顶上就是可以架枪的二楼。',
    },
    env: {
      shipSpeed: 6.5,
      // 阴影相机包住整艘可见船体（船体超出 bounds，显式给出以保留原效果）
      shadowBox: { x0: -58, x1: 40, y0: -1, y1: 26, z0: -15, z1: 15 },
    },
    ambientKey: 'funnelTop', // 烟囱冒烟等环境氛围取构建结果字段
    // 出生点契约：buildMap 返回 spawns[team] = [{x, y, z, yaw}]，y 为脚底站立面高度；
    // Actor.spawn 以 sp.y 为出生高度，缺失时安全回退 0.02。
    spawnYFallback: 0.02,
    // 换背包「立即生效」的出生区判定（复活生效兜底在模式层）
    loadoutZone: { BL: { axis: 'x', max: -28.3 }, GR: { axis: 'x', min: 28.3 } },
    ai: {
      holds: [[-20.5, -7.2, 0.2], [-24.6, 5.8, -0.15], [-16.4, 1.3, 0.1], [-9.8, -6.8, 0.25], [-26.2, -6.5, 0.05]],
      lanes: [-6.8, -0.4, 6.8],
      flank: [[-31.5, 10.5], [-8, 10.6], [8.0, 7.8]],
      rushZone: { x0: 4, x1: 22 },
      roam: { x0: -26, z0: -8.8, x1: 26, z1: 8.8 },
    },
    // 练习靶点（pos 为靶心世界坐标，甲板面 y=0、靶心取站姿胸口高 1.2）：
    // 全部取 AI 可站立/寻路区（holds/lanes 邻域与船艏空地），保证不嵌进集装箱/墙体内
    practiceTargets: [
      { id: 'ts-bl-hold', pos: { x: -26.2, y: 1.2, z: -6.5 } },
      { id: 'ts-mid-hold', pos: { x: -16.4, y: 1.2, z: 1.3 } },
      { id: 'ts-bl-lane', pos: { x: -9.8, y: 1.2, z: -6.8 } },
      { id: 'ts-gr-hold', pos: { x: 26.2, y: 1.2, z: 6.5 } },
      { id: 'ts-gr-lane', pos: { x: 9.8, y: 1.2, z: 6.8 } },
      { id: 'ts-bow', pos: { x: 31.5, y: 1.2, z: 0 } },
    ],
  },
  'desert-grey': {
    id: 'desert-grey',
    name: '沙漠灰',
    en: 'DESERT GREY',
    // 阶段 2 起开放：几何与高度导航由地图模块（buildDesertGrey / DESERT_LAYOUT）提供
    available: true,
    supportedModes: ['bomb', 'tdm', 'practice'],
    // 阶段 3 起沙图默认 5v5 爆破（new player 直接进爆破）；团队竞技/练习仍显式可选
    defaultMode: 'bomb',
    loadingLabel: '搭建沙漠灰',
    // 沙漠灰使用高度感知导航图（map.navGraph），不再用平面寻路网格；nav=null 表示走共享导航适配
    nav: null,
    // 俯视参考约定：+X 东（A 方向）、-X 西（B 方向）、-Z 北（保卫者 GR）、+Z 南（潜伏者 BL）
    // 尺寸与 DESERT_LAYOUT 一致（约 88m × 76m 白盒尺度，见 layout.meta.scaleNote）
    bounds: { x0: -44, z0: -38, x1: 44, z1: 38 },
    radar: {
      widthM: 92, heightM: 82, offX: 46, offZ: 41,
      maxColliderHalf: 24, // 过滤地面级大碰撞体
      // 上层可站立面（A 平台/A 小道/B 洞上层/B 窗房）虚线框
      overlays: [
        { x: 34, z: -38, w: 10, h: 20 },  // aPlatform
        { x: 10, z: -19, w: 16, h: 4 },   // aShort (catwalk)
        { x: -32, z: -14, w: 6, h: 22 },  // bTunnelUpper
        { x: -26, z: -28, w: 6, h: 18 },  // bWindow 房
      ],
    },
    menu: {
      orbit: { r: 60, rOff: 0, y: 28, yAmp: 5, zR: 42, look: [0, 2, 0], fov: 55, speed: 0.035 },
      blurb: '经典的沙漠巷战地图：潜伏者（Black List）从南侧出生，保卫者（Global Risk）驻守北侧。中路直通 A 大与 A 平台，西侧 B 洞分上下两层经桥下、B 门与 B 窗迂回，A 大坑经南北坡道进出，木门木箱可穿透。',
    },
    env: {
      ocean: false, shipSpeed: 0, // 沙漠地图：无海面/船体漂移；云层与日光循环保留
      groundColor: 0x8a8072,      // 环境反射里的地面近似色（沙地）
      fogColor: 0xc7bba2, fogDensity: 0.0012, // 沙尘感暖灰雾
      sunElev: 55, sunAzim: 115,  // 沙漠 高角度偏东阳光
      // shadowBox 缺省时由 bounds 自动推导（见 game.init）
    },
    ambientKey: null, // 无烟囱排烟/海鸥等船用氛围
    spawnYFallback: 0.02,
    killY: -6, // A 大坑坑底 -1.8，仍远高于兜底线
    // 出生区内换背包立即生效：BL 南侧出生区 z[28,36]、GR 北侧出生区 z[-38,-30]
    loadoutZone: { BL: { axis: 'z', min: 26 }, GR: { axis: 'z', max: -26 } },
    // 练习靶点（取沙漠灰导航节点坐标 + 站姿胸口高 1.2，UPPER=2.6 / PIT=-1.8 同布局常量）：
    // 节点位置均为可站立/寻路安全点，覆盖双方出生、中路、B 区、A 平台、A 大坑与桥下
    practiceTargets: [
      { id: 'dg-bl-spawn', pos: { x: -3, y: 1.2, z: 32 } },
      { id: 'dg-gr-spawn', pos: { x: 0, y: 1.2, z: -34 } },
      { id: 'dg-mid', pos: { x: 0, y: 1.2, z: -2 } },
      { id: 'dg-b-site', pos: { x: -36, y: 1.2, z: -23 } },
      { id: 'dg-a-platform', pos: { x: 39, y: 3.8, z: -22 } },
      { id: 'dg-a-pit', pos: { x: 30, y: -0.6, z: 0 } },
      { id: 'dg-underpass', pos: { x: -14, y: 1.2, z: 4 } },
    ],
  },
  // 原创平台沙漠图（赤霞集市）：描述符见 platform-desert/descriptor.js，几何惰性加载
  'platform-desert': PLATFORM_DESERT_DESCRIPTOR,
  // 原创平台港口图（雾港码头）：描述符来自 platform-harbor/layout.js（独立审核产物）。
  // 公开简介改用中性文案（原描述符 blurb 含原作阵营名），显示一律走 i18n 目录。
  'platform-harbor': {
    ...PLATFORM_HARBOR_DESCRIPTOR,
    menu: { ...PLATFORM_HARBOR_DESCRIPTOR.menu, blurb: '雾气未散的集装箱码头：中央装卸站台连接两侧港池岸巷，东西吊道与南北箱顶构成三条进攻路线，跨码头龙门吊下是全场最快的直通道。' },
  },
};

// 按图集过滤地图表（纯函数，node 可测）；未知图集回退 classic
export function mapsForSet(set) {
  const ids = MAP_SETS[normalizeMapSet(set)];
  return Object.fromEntries(ids.filter((id) => ALL_MAPS[id]).map((id) => [id, ALL_MAPS[id]]));
}

// 当前图集的可用地图（HUD 菜单、resolveMapId 均只看到本图集）
export const MAPS = mapsForSet(MAP_SET);

// 新玩家默认地图：classic 图集默认沙漠灰；original 图集默认赤霞集市（旧存档/URL 无效时也回退到此）
export const NEW_PLAYER_DEFAULT_MAP = MAP_SET === 'original' ? 'platform-desert' : 'desert-grey';

export function getMapDescriptor(id) { return MAPS[id] || null; }

// 公开平台图的显示名走翻译键（中英成对维护在 i18n/catalogs.js）；id 为稳定键，
// 注册表的 name/en/loadingLabel/menu.blurb 原值保持不动，作为目录缺键时的回退。
// 战斗逻辑只认 mapId，不硬编码任何显示名。
export function mapDisplayKeys(id) {
  return {
    name: `map.${id}.name`,
    en: `map.${id}.en`,
    loading: `map.${id}.loading`,
    blurb: `map.${id}.blurb`,
  };
}

export function firstAvailableMapId() {
  for (const k of Object.keys(MAPS)) if (MAPS[k].available) return k;
  return null;
}

// 解析顺序：URL 参数 > 已存设置 > 新玩家默认 > 第一张可用地图；不可用的地图一律跳过。
// resolveMapIdIn 为纯函数形态（地图表显式传入），供图集隔离测试与 resolveMapId 复用。
export function resolveMapIdIn(maps, requested, stored, defaultMap) {
  for (const c of [requested, stored, defaultMap]) {
    if (c && maps[c] && maps[c].available) return c;
  }
  for (const k of Object.keys(maps)) if (maps[k].available) return k;
  return null;
}

export function resolveMapId(requested, stored) {
  return resolveMapIdIn(MAPS, requested, stored, NEW_PLAYER_DEFAULT_MAP);
}

// 出生区内换背包立即生效（axis: 'x' 运输船左右舷 / 'z' 沙漠灰南北两端）
export function inSpawnZone(desc, team, pos) {
  const z = desc && desc.loadoutZone && desc.loadoutZone[team];
  if (!z || (z.axis !== 'x' && z.axis !== 'z')) return false;
  const v = z.axis === 'x' ? pos.x : pos.z;
  if (z.max !== undefined) return v < z.max;
  if (z.min !== undefined) return v > z.min;
  return false;
}
