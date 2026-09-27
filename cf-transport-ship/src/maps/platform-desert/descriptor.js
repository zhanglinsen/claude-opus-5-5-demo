// 赤霞集市注册表描述符（纯数据，不依赖 three / DOM，可在 node 下测试）。
// 全部字段取自本图布局 PLATFORM_DESERT_LAYOUT，与离线版沙漠灰描述符互不复用：
//   - 出生对角（BL 东南 / GR 西北）→ loadoutZone 按南北 z 轴判定
//   - 中轴赤水暗渠（渠底 -2.5）→ killY 取 -8（远低于渠底）
//   - 雷达/上层遮罩/AI 兜底常量均按本图 bounds 与导航图推导
import { PLATFORM_DESERT_LAYOUT } from './layout.js';

const L = PLATFORM_DESERT_LAYOUT;

// 练习靶点：全部取自导航节点（可站立/寻路安全点），胸口高 = 站立面 + 1.2
const PRACTICE_TARGETS = [
  { id: 'pd-bl-spawn', pos: { x: 28, y: 1.2, z: 28 } },      // 潜伏者营地（bl1）
  { id: 'pd-south-court', pos: { x: 9.5, y: 1.2, z: 10 } },  // 南驮队场（sc5）
  { id: 'pd-north-bank', pos: { x: 0, y: 1.2, z: -6 } },     // 北渠沿（nb1）
  { id: 'pd-canal', pos: { x: -14, y: -1.3, z: 0 } },        // 赤水暗渠渠底（cb2）
  { id: 'pd-granary', pos: { x: 28, y: 4.2, z: -24 } },      // 粮仓高台 A 包点（dA）
  { id: 'pd-market', pos: { x: -28, y: 1.2, z: 23 } },       // 驼队市场 B 包点（mkB）
  { id: 'pd-palm', pos: { x: 40, y: 1.2, z: 0 } },           // 枣椰大道中段（ps3）
  { id: 'pd-gr-spawn', pos: { x: -36.5, y: 1.2, z: -33.2 } },// 保卫者哨站（gr2）
];

// 注册表就绪描述符（并入 maps/registry.js 的 MAPS）。
// ai 仅为对称路径兜底常量（本图有 navGraph，bots 优先走 teamGoals 图目标）；
// 报点/名称显示一律走 i18n 目录 map.platform-desert.*，注册表原值仅作缺键回退。
export const PLATFORM_DESERT_DESCRIPTOR = {
  id: 'platform-desert',
  name: '赤霞集市',
  en: 'CHIXIA BAZAAR',
  available: true,
  supportedModes: ['bomb', 'tdm', 'practice'],
  defaultMode: 'bomb',
  loadingLabel: '搭建赤霞集市',
  // 高度感知导航图（与平台港口图同机制）；平面寻路网格不适用
  nav: null,
  bounds: { ...L.bounds },
  radar: {
    widthM: 84, heightM: 72, offX: 42, offZ: 36,
    maxColliderHalf: 24, // 过滤地面/渠帮级大碰撞体
    overlays: [ // 上层可站立面（粮仓高台 / 集市棚栈）虚线框
      { x: 27, z: -25, w: 22, h: 22 },
      { x: -29, z: 12.5, w: 18, h: 5 },
    ],
  },
  menu: {
    orbit: { r: 62, rOff: 0, y: 28, yAmp: 5, zR: 44, look: [0, 2, 0], fov: 55, speed: 0.035 },
    blurb: '原创平台图「赤霞集市」：横贯中轴的赤水暗渠连接南北两片红沙街区，东北粮仓高台与西南驼队市场为两个包点。进攻方从东南营地出发，防守方驻守西北哨站；平桥、暗渠与高台双坡道构成多线进攻路线。',
  },
  env: {
    ocean: false, shipSpeed: 0, // 沙漠地图：无海面/船体漂移
    groundColor: 0x9a7a5c,      // 环境反射里的地面近似色（红沙地）
    fogColor: 0xcfae8a, fogDensity: 0.0013, // 赤霞暖沙尘雾
    sunElev: 52, sunAzim: 105,  // 午后偏东阳光
    // shadowBox 缺省时由 bounds 自动推导（见 game.init）
  },
  ambientKey: null, // 无烟囱排烟/海鸥等船用氛围
  spawnYFallback: 0.02,
  killY: -8, // 暗渠渠底 -2.5，兜底线留足余量
  // 出生区内换背包立即生效：BL 东南营地 z[26,36]、GR 西北哨站 z[-36,-26]
  loadoutZone: { BL: { axis: 'z', min: 26 }, GR: { axis: 'z', max: -26 } },
  // 图目标池兜底（map.teamGoals 优先）：BL 冲两包点，GR 守驼门巷南口/渠首/枣椰大道中段
  teamGoals: L.teamGoals,
  ai: {
    holds: [[28, 24, 0], [-28, 20, 0], [40, 24, 0], [9.5, 10, 0], [31, 8, 0]],
    lanes: [28, 20, 10],
    flank: [[-28, 18], [0, 8], [40, 12]],
    rushZone: { x0: -12, x1: 38 },
    roam: { x0: -38, z0: -32, x1: 38, z1: 32 },
  },
  practiceTargets: PRACTICE_TARGETS,
};
