// 赤霞集市（平台原创沙漠图）布局数据（纯数据，不依赖 three / DOM，可在 node 下测试与校验）
// 平台扩展 US-04：与离线版「沙漠灰」完全不同的原创地图——
//   不同的整体轮廓（对角出生 + 横贯中轴的赤水暗渠）、不同的建筑体块
//   （粮仓高台 / 驼队市场 / 驼门巷商栈）、全新的报点命名与视觉标识。
// 坐标约定（与沙漠灰一致的阶段 2 并行契约）：
//   +X 东 = A 包点方向，-X 西 = B 包点方向，-Z 北 = 保卫者(GR)端，+Z 南 = 潜伏者(BL)端
//   y 为脚底站立面高度；单位米；站姿约 1.75m；yaw=0 朝北
// 与沙漠灰的关键差异（原创性守卫由 platform-desert.test.mjs 校验）：
//   - 出生点对角布置：BL 东南、GR 西北（沙漠灰为正南/正北）
//   - 中轴为一条横贯东西的下沉暗渠（渠底 -2.5，两座平桥跨越），而非 A 大坑/中门
//   - A 包点 = 东北「粮仓高台」（台面 +3.0，南坡/西坡双坡道），非 A 平台斜坡布局
//   - B 包点 = 西南「驼队市场」棚厅（棚顶栈道 +2.4），非 B 洞/ B 窗房
//
// 层高方案：
//   地面 y=0（红沙地）；暗渠渠底 y=-2.5（渠底净空 2.15，平桥下可直立通行）；
//   市场棚顶栈道 y=2.4；粮仓高台 y=3.0（南坡/西坡双坡道进出）。
//
// 结构数据：solids（碰撞盒，与视觉一一对应）、ramps（契约 world.addRamp 数据）。
// 视觉装饰（檐口、遮阳篷、渠沿压顶、棕榈、远景沙丘天际线、包点喷漆、灯具）
// 由 build.js 构建时补充，不参与碰撞。

const GROUND = 0;      // 地面
const BED = -2.5;      // 暗渠渠底
const CATWALK = 2.4;   // 市场棚顶栈道
const DECK = 3.0;      // 粮仓高台面
const WALL = 0.4;      // 常规内墙厚

// ---------- 小工具（仅在模块加载期生成纯数据） ----------
const solids = [];
let sid = 0;
function S(x, y, z, sx, sy, sz, o = {}) {
  solids.push({
    id: o.id || ('s' + (++sid)),
    x, y, z, sx, sy, sz,
    yaw: o.yaw || 0,
    role: o.role || 'wall',            // floor|wall|ceil|struct|step|cover|door|bound
    m: o.m || 'adobe',                 // 视觉材质键（build.js 材质表）
    mat: o.mat || 'concrete',          // 命中材质 metal|wood|concrete
    surface: o.surface || 'stone',     // 脚步声
    bullet: o.bullet || 'block',
    sight: o.sight !== false,
    solid: o.solid !== false,
    tag: o.tag || '',
  });
}
// 墙：给起止范围与高度
function W(x0, x1, z0, z1, y0, y1, o = {}) {
  S((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, o);
}
// 木箱/货箱掩体
function Crates(list) {
  for (const [x, z, s, y0 = 0, yaw = 0] of list) {
    S(x, y0 + s / 2, z, s, s, s * 0.96, { role: 'cover', m: 'woodDark', mat: 'wood', bullet: 'pen', surface: 'wood', yaw, tag: 'crate' });
  }
}

// ================== 地面（顶面 y=0；中轴 z[-4,4] 为下沉暗渠带） ==================
W(-42, 42, 4, 36, -1, 0, { role: 'floor', m: 'sandRed', surface: 'sand', id: 'groundS' });   // 渠南地面
W(-42, 42, -36, -4, -1, 0, { role: 'floor', m: 'sandRed', surface: 'sand', id: 'groundN' }); // 渠北地面
W(-42, -30, -4, 4, -1, 0, { role: 'floor', m: 'sandRed', surface: 'sand', id: 'groundHead' }); // 渠首广场地面
W(30, 42, -4, 4, -1, 0, { role: 'floor', m: 'sandRed', surface: 'sand', id: 'groundTail' });   // 渠尾广场地面
W(-26, 26, -4, 4, BED - 1, BED, { role: 'floor', m: 'canalStone', surface: 'stone', id: 'canalBed' }); // 渠底

// ================== 地图边界墙（防越界） ==================
W(-42.6, 42.6, -36, -35.4, 0, 7, { role: 'bound', m: 'adobe', id: 'boundN' });
W(-42.6, 42.6, 35.4, 36, 0, 7, { role: 'bound', m: 'adobe', id: 'boundS' });
W(-42, -41.4, -36, 36, 0, 7, { role: 'bound', m: 'adobe', id: 'boundW' });
W(41.4, 42, -36, 36, 0, 7, { role: 'bound', m: 'adobe', id: 'boundE' });

// ================== 赤水暗渠（中轴下沉渠，两端坡道进出，两座平桥跨越） ==================
W(-30, 30, 3.6, 4.3, BED - 1, 0, { role: 'wall', m: 'canalStone', id: 'canalWallS' }); // 渠南帮
W(-30, 30, -4.3, -3.6, BED - 1, 0, { role: 'wall', m: 'canalStone', id: 'canalWallN' }); // 渠北帮
W(-3, 3, -3.6, 3.6, -0.35, 0, { role: 'struct', m: 'concrete', id: 'bridgeGate', tag: 'canalBridge' });   // 驼门桥（渠首侧）
W(8, 14, -3.6, 3.6, -0.35, 0, { role: 'struct', m: 'concrete', id: 'bridgeEast', tag: 'canalBridge' });   // 东渠桥

// ================== 驼门巷商栈（中北部双楼夹巷，巷口石拱 + 骆驼石像） ==================
W(-12, -3, -30, -8, 0, 5.5, { role: 'struct', m: 'adobe', id: 'bldCaravanseraiW' });
W(3, 8, -30, -8, 0, 5.5, { role: 'struct', m: 'adobe', id: 'bldCaravanseraiE' });
W(-3, 3, -19.3, -18.7, 3.2, 4.4, { role: 'struct', m: 'adobe', id: 'gateArch', tag: 'gateArch' }); // 巷中石拱（净空 3.2）
S(1.4, 1.3, -19, 1.6, 2.6, 1.6, { role: 'cover', m: 'stoneTrim', mat: 'concrete', tag: 'statue', id: 'camelStatue' }); // 拱下石像掩体

// ================== 粮仓高台（东北 A 包点，台面 +3.0，实心台体 + 角部筒仓） ==================
W(16, 38, -36, -14, 0, DECK, { role: 'struct', m: 'concrete', id: 'granaryDeck' });
W(34, 38, -36, -32, DECK, 6.2, { role: 'struct', m: 'adobe', id: 'granaryTower', tag: 'siloTower' }); // 东北角筒仓地标
// 台缘矮墙（南缘留南坡道口 x[28,34]，西缘留西坡道口 z[-24,-18]）
W(15.8, 16.2, -36, -24, DECK, 3.9, { role: 'cover', m: 'plaster', id: 'deckRailW1' });
W(15.8, 16.2, -18, -14, DECK, 3.9, { role: 'cover', m: 'plaster', id: 'deckRailW2' });
W(16, 27.5, -14.2, -13.8, DECK, 3.9, { role: 'cover', m: 'plaster', id: 'deckRailS1' });
W(34.5, 38, -14.2, -13.8, DECK, 3.9, { role: 'cover', m: 'plaster', id: 'deckRailS2' });
W(37.8, 38.2, -36, -14, DECK, 3.9, { role: 'cover', m: 'plaster', id: 'deckRailE' });

// ================== 驼队市场（西南 B 包点棚厅：柱廊北入口 + 棚顶栈道） ==================
W(-38, -12, 10, 34, 4.6, 5.0, { role: 'ceil', m: 'concrete', id: 'marketRoof' });
W(-38, -37.6, 10, 34, 0, 5, { role: 'wall', m: 'adobe', id: 'marketWallW' });
W(-38, -12, 33.6, 34, 0, 5, { role: 'wall', m: 'adobe', id: 'marketWallS' });
// 东墙：两处门洞（北门 z[14,18]、南门 z[26,30]），其余封闭
W(-12.4, -12, 10, 14, 0, 5, { role: 'wall', m: 'adobe', id: 'marketWallE1' });
W(-12.4, -12, 18, 26, 0, 5, { role: 'wall', m: 'adobe', id: 'marketWallE2' });
W(-12.4, -12, 30, 34, 0, 5, { role: 'wall', m: 'adobe', id: 'marketWallE3' });
W(-12.4, -12, 14, 18, 3, 5, { role: 'wall', m: 'adobe', id: 'marketDoorNLintel' });
W(-12.4, -12, 26, 30, 3, 5, { role: 'wall', m: 'adobe', id: 'marketDoorSLintel' });
// 北柱廊（棚厅朝渠首广场敞开）
for (const px of [-36, -28, -20]) {
  S(px, 2.3, 10.6, 0.8, 4.6, 0.8, { role: 'struct', m: 'stoneTrim', id: 'marketPillar' + px });
}
// 棚顶栈道（北跨 x[-38,-20]，面 +2.4，棚厅坡道上下）
W(-38, -20, 10, 15, 2.1, CATWALK, { role: 'struct', m: 'concrete', id: 'marketCatwalk' });
W(-38, -20, 10, 10.3, CATWALK, 3.3, { role: 'cover', m: 'plaster', id: 'catwalkRailN' }); // 栈道北缘护栏
W(-34, -20, 14.7, 15, CATWALK, 3.3, { role: 'cover', m: 'plaster', id: 'catwalkRailS' }); // 南缘护栏（西端留坡道口）
// 市场货摊（两排，id 冲突避免：循环内自动编号）
for (const [sx, sz] of [[-31, 20.5], [-25, 20.5], [-19, 20.5], [-31, 26.5], [-25, 26.5], [-19, 26.5]]) {
  S(sx, 0.55, sz, 2.4, 1.1, 1.2, { role: 'cover', m: 'woodDark', mat: 'wood', bullet: 'pen', surface: 'wood', tag: 'stall' });
}
S(-15, 0.65, 13, 1.3, 1.3, 1.3, { role: 'cover', m: 'woodDark', mat: 'wood', bullet: 'pen', surface: 'wood', tag: 'crate', id: 'marketCrate' });

// ================== 南驮队场（中央喷泉 + 货箱群） ==================
S(13, 0.55, 18, 2.4, 1.1, 2.4, { role: 'cover', m: 'stoneTrim', mat: 'concrete', tag: 'fountain', id: 'courtFountain' });

// ================== 木箱掩体（避开导航直线，形成转角掩体） ==================
Crates([
  // 南驮队场
  [26, 10, 1.3], [18, 33, 1.3], [8, 30, 1.4], [0, 20, 1.3], [24, 8, 1.2], [14, 30, 1.2],
  [36, 6, 1.2],
  // 北集场
  [-20, -31.5, 1.3],
  // 粮仓高台上的货箱（大号粮袋垛，y0=台面）
  [20, -33, 3, DECK], [24.5, -33.5, 3, DECK], [19.5, -17, 3, DECK, 0.3], [36.5, -16.5, 3, DECK],
  // 棚顶栈道
  [-32, 11, 1.1, CATWALK],
  // 驼门巷北口（北集场走线 z=-33 南侧，避免挡 ns2→ns3）
  [-5.5, -30.8, 1.2],
]);

// ================== 坡道（契约 world.addRamp 数据） ==================
const ramps = [
  // 粮仓南坡：南驮队场/渠尾广场 → 高台（北端接台面）
  { id: 'granaryRampS', x: 31, z: -11, sx: 6, sz: 6, y0: DECK, y1: 0, axis: 'z', yaw: 0, thickness: 0.4, mat: 'concrete', surface: 'stone', tag: 'granaryRamp', m: 'stoneTrim' },
  // 粮仓西坡：粮仓西巷 → 高台（东端接台面，西端留 x[8,10] 绕行带）
  { id: 'granaryRampW', x: 13, z: -21, sx: 6, sz: 6, y0: 0, y1: DECK, axis: 'x', yaw: 0, thickness: 0.4, mat: 'concrete', surface: 'stone', tag: 'granaryRamp', m: 'stoneTrim' },
  // 暗渠西坡（渠首广场 → 渠底）
  { id: 'canalRampW', x: -28, z: 0, sx: 4, sz: 7.2, y0: 0, y1: BED, axis: 'x', yaw: 0, thickness: 0.3, mat: 'concrete', surface: 'stone', tag: 'canalRamp', m: 'canalStone' },
  // 暗渠东坡（渠底 → 渠尾广场）
  { id: 'canalRampE', x: 28, z: 0, sx: 4, sz: 7.2, y0: BED, y1: 0, axis: 'x', yaw: 0, thickness: 0.3, mat: 'concrete', surface: 'stone', tag: 'canalRamp', m: 'canalStone' },
  // 市场棚栈坡（棚厅地面 → 棚顶栈道，西端上行）
  { id: 'catwalkRamp', x: -36, z: 17, sx: 4, sz: 4, y0: CATWALK, y1: 0, axis: 'z', yaw: 0, thickness: 0.3, mat: 'wood', surface: 'wood', tag: 'catwalkRamp', m: 'woodDark' },
];

// ================== 出生点（y=脚底站立面；yaw=0 朝北，PI 朝南） ==================
const spawns = { BL: [], GR: [] };
for (let i = 0; i < 5; i++) {
  const x = 26.5 + i * 3;
  spawns.BL.push({ x, y: 0, z: 30.5, yaw: 0 }, { x, y: 0, z: 33.2, yaw: 0 });
  const gx = -39.5 + i * 3;
  spawns.GR.push({ x: gx, y: 0, z: -33.2, yaw: Math.PI }, { x: gx, y: 0, z: -30.2, yaw: Math.PI });
}

// ================== 报点区域（数组顺序即 regionAt 匹配优先级：具体在前） ==================
const R = (id, name, x0, x1, z0, z1, y0, y1) => ({
  id, name, extents: y0 === undefined ? { x0, x1, z0, z1 } : { x0, x1, z0, z1, y0, y1 },
});
const regions = [
  R('bridgeGate', '驼门桥', -3, 3, -4, 4, -0.4, 0.7),
  R('bridgeEast', '东渠桥', 8, 14, -4, 4, -0.4, 0.7),
  R('canal', '赤水暗渠', -26, 26, -4, 4, -2.9, 0.2),
  R('granaryRampS', '粮仓南坡', 28, 34, -14, -8),
  R('granaryRampW', '粮仓西坡', 10, 16, -24, -18),
  R('granary', '粮仓高台', 16, 38, -36, -14, 2.6, 5),
  R('catwalk', '集市棚栈', -38, -20, 10, 15, 2.0, 3.6),
  R('catwalkRamp', '棚栈坡道', -38, -34, 15, 19),
  R('hallDoorN', '市场北门', -13, -11, 13, 19),
  R('hallDoorS', '市场南门', -13, -11, 25, 31),
  R('market', '驼队市场', -38, -12, 10, 34, -0.5, 2.0),
  R('gateLane', '驼门巷', -3, 3, -30, -4),
  R('granaryLane', '粮仓西巷', 8, 16, -36, -4),
  R('palmStreet', '枣椰大道', 38, 42, -36, 36),
  R('westLane', '西驮道', -42, -38, -36, 10),
  R('canalTail', '渠尾广场', 26, 42, -8, 6, -2.9, 2),
  R('canalHead', '渠首广场', -42, -26, -4, 10, -2.9, 2),
  R('northBank', '北渠沿', -42, 26, -8, -4),
  R('northStrip', '北集场', -42, 8, -36, -30),
  R('southCourt', '南驮队场', -12, 38, 4, 36),
  R('grSpawn', '保卫者哨站', -41.2, -24, -36, -26),
  R('blSpawn', '潜伏者营地', 24, 40, 26, 34),
];

// ================== 包点 ==================
const bombSites = [
  { id: 'A', name: '粮仓高台', x: 28, y: DECK, z: -24, region: 'granary', radius: 5.5 },
  { id: 'B', name: '驼队市场', x: -28, y: 0, z: 23, region: 'market', radius: 5.5 },
];

// ================== 导航图（y 为脚底高度；clearance 为该点可通过半径） ==================
const N = (id, x, y, z, region, clearance = 0.45) => ({ id, x, y, z, clearance, region });
const nodes = [
  // BL 出生与南驮队场
  N('bl1', 28, 0, 28, 'blSpawn'), N('bl2', 34, 0, 28, 'blSpawn'),
  N('bl3', 28, 0, 32.5, 'blSpawn'), N('bl4', 34, 0, 32.5, 'blSpawn'),
  N('sc1', 20, 0, 28, 'southCourt'), N('sc2', 9, 0, 24, 'southCourt'), N('sc3', 4, 0, 28, 'southCourt'),
  N('sc4', 20, 0, 12, 'southCourt'), N('sc5', 9.5, 0, 10, 'southCourt'), N('sc6', 2, 0, 12, 'southCourt'),
  N('sc7', -6, 0, 10, 'southCourt'), N('sc8', 20, 0, 20, 'southCourt'), N('sc9', 30, 0, 20, 'southCourt'),
  N('scW1', -8, 0, 16, 'southCourt'), N('scW2', -8, 0, 28, 'southCourt'),
  N('bwS', 0, 0, 7, 'southCourt'), N('beS', 11, 0, 7, 'southCourt'),
  // 枣椰大道（东侧南北干道）
  N('ps1', 40, 0, 28, 'palmStreet'), N('ps2', 40, 0, 14, 'palmStreet'), N('ps3', 40, 0, 0, 'palmStreet'),
  N('ps4', 40, 0, -12, 'palmStreet'), N('ps5', 40, 0, -24, 'palmStreet'), N('ps6', 40, 0, -33, 'palmStreet'),
  // 渠尾广场 + 粮仓南坡
  N('ct1', 33, 0, 0, 'canalTail'), N('grs0', 31, 0, -6, 'canalTail'),
  N('grs1', 31, 1.5, -11, 'granaryRampS'), N('grs2', 31, 3, -16, 'granary'),
  // 粮仓高台
  N('dTop', 17.5, 3, -21, 'granary'), N('d2', 22, 3, -28, 'granary'), N('dA', 28, 3, -24, 'granary'),
  N('d1', 31, 3, -18, 'granary'), N('d4', 30, 3, -31, 'granary'), N('d6', 35, 3, -20, 'granary'),
  N('d7', 35, 3, -27, 'granary'),
  // 粮仓西巷 + 粮仓西坡
  N('grw0', 9, 0, -21, 'granaryLane'), N('grw1', 13, 1.5, -21, 'granaryRampW'),
  N('gl1', 9, 0, -33, 'granaryLane'), N('gl2', 9, 0, -27, 'granaryLane'), N('gl3', 9, 0, -11, 'granaryLane'),
  // 北集场
  N('ns1', -16, 0, -33, 'northStrip'), N('ns2', -8, 0, -33, 'northStrip'), N('ns3', 0, 0, -33, 'northStrip'),
  // 驼门巷
  N('ga2', 0, 0, -26, 'gateLane'), N('ga1', 0, 0, -14, 'gateLane'),
  // 北渠沿
  N('nb1', 0, 0, -6, 'northBank'), N('nb2', 11, 0, -6, 'northBank'), N('nb3', 20, 0, -6, 'northBank'),
  N('nb4', -20, 0, -6, 'northBank'),
  // 平桥
  N('bw1', 0, 0, 0, 'bridgeGate'), N('be1', 11, 0, 0, 'bridgeEast'),
  // 暗渠渠底
  N('crW', -28, -1.25, 0, 'canalHead'), N('cb1', -22, BED, 0, 'canal'), N('cb2', -14, BED, 0, 'canal'),
  N('cb3', -6, BED, 0, 'canal'), N('cb4', 2, BED, 0, 'canal'), N('cb5', 10, BED, 0, 'canal'),
  N('cb6', 18, BED, 0, 'canal'), N('cb7', 23, BED, 0, 'canal'), N('crE', 28, -1.25, 0, 'canalTail'),
  // 渠首广场 / 西驮道
  N('ch1', -31, 0, 0, 'canalHead'), N('ch2', -35, 0, -2, 'canalHead'), N('ch3', -33, 0, 7, 'canalHead'),
  N('wl1', -39.7, 0, -28, 'westLane'), N('wl2', -39.7, 0, -16, 'westLane'), N('wl3', -39.7, 0, -2, 'westLane'),
  // GR 出生
  N('gr1', -39.5, 0, -33.2, 'grSpawn'), N('gr2', -36.5, 0, -33.2, 'grSpawn'),
  N('gr3', -33.5, 0, -33.2, 'grSpawn'), N('gr4', -30.5, 0, -33.2, 'grSpawn'), N('gr5', -27.5, 0, -33.2, 'grSpawn'),
  N('gr6', -39.5, 0, -30.2, 'grSpawn'), N('gr7', -33.5, 0, -30.2, 'grSpawn'), N('gr8', -27.5, 0, -30.2, 'grSpawn'),
  // 驼队市场
  N('mk1', -32.5, 0, 18, 'market'), N('mk2', -28, 0, 17, 'market'), N('mk3', -22, 0, 17, 'market'),
  N('mk3b', -16, 0, 17, 'market'), N('mk4', -34, 0, 23, 'market'), N('mkB', -28, 0, 23, 'market'),
  N('mk5', -22, 0, 23, 'market'), N('mk5b', -16, 0, 23, 'market'), N('mk6', -34, 0, 29, 'market'),
  N('mk7', -28, 0, 29, 'market'), N('mk8', -22, 0, 29, 'market'), N('mk8b', -15, 0, 29, 'market'),
  N('hdN', -12.2, 0, 16, 'hallDoorN'), N('hdS', -12.2, 0, 28, 'hallDoorS'),
  // 棚顶栈道
  N('st0', -36, 0, 20, 'catwalkRamp'), N('st1', -36, 1.2, 17, 'catwalkRamp'), N('st2', -36, CATWALK, 14, 'catwalk'),
  N('cw1', -36, CATWALK, 12.5, 'catwalk'), N('cw2', -28, CATWALK, 12.5, 'catwalk'), N('cw3', -21, CATWALK, 12.5, 'catwalk'),
];

const E = (from, to, width = 2.5, requires = 'walk') => ({ from, to, bidirectional: true, width, requires });
const edges = [
  // BL 出生 ↔ 南驮队场 / 枣椰大道
  E('bl1', 'bl2'), E('bl3', 'bl1'), E('bl4', 'bl2'), E('bl3', 'bl4'),
  E('bl1', 'sc1'), E('bl2', 'sc8'), E('bl2', 'sc9'), E('bl2', 'ps1'),
  // 南驮队场内部
  E('sc1', 'sc2'), E('sc1', 'sc3'), E('sc2', 'sc3'), E('sc1', 'sc8'), E('sc8', 'sc9'),
  E('sc8', 'sc4'), E('sc4', 'sc5'), E('sc5', 'sc6'), E('sc6', 'sc3'), E('sc2', 'sc5'),
  E('sc4', 'sc9'), E('sc9', 'ps1'), E('sc9', 'ps2'), E('sc9', 'ct1'),
  E('sc5', 'beS'), E('sc6', 'bwS'), E('sc7', 'bwS'), E('sc7', 'scW1'), E('scW1', 'scW2'),
  // 枣椰大道
  E('ps1', 'ps2'), E('ps2', 'ps3'), E('ps3', 'ps4'), E('ps4', 'ps5'), E('ps5', 'ps6'), E('ps3', 'ct1'),
  // 渠尾广场 ↔ 粮仓南坡 ↔ 高台
  E('ct1', 'grs0'), E('ct1', 'crE'), E('grs0', 'grs1'), E('grs1', 'grs2'),
  // 高台内部 + 西坡
  E('grs2', 'd1'), E('d1', 'dA'), E('dA', 'd2'), E('d2', 'dTop'), E('d2', 'grs2'), E('d4', 'dA'),
  E('d2', 'd4'), E('d4', 'd7'), E('d7', 'd6'), E('d6', 'd1'), E('d6', 'dA'),
  E('dTop', 'grw1'), E('grw1', 'grw0'),
  // 粮仓西巷 ↔ 北集场
  E('grw0', 'gl2'), E('gl2', 'gl1'), E('gl1', 'ns3'), E('ns1', 'ns2'), E('ns2', 'ns3'),
  E('gl2', 'gl3'), E('gl3', 'nb2'), E('gl3', 'nb3'),
  // GR 出生 ↔ 北集场 / 西驮道
  E('gr1', 'gr2'), E('gr2', 'gr3'), E('gr3', 'gr4'), E('gr4', 'gr5'),
  E('gr6', 'gr1'), E('gr7', 'gr3'), E('gr8', 'gr5'), E('gr6', 'gr7'), E('gr7', 'gr8'),
  E('gr2', 'ns1'), E('gr4', 'ns1'), E('gr5', 'ns1'), E('gr6', 'wl1'),
  // 西驮道 ↔ 渠首广场
  E('wl1', 'wl2'), E('wl2', 'wl3'), E('wl3', 'ch2'), E('ch2', 'ch1'), E('ch1', 'crW'),
  E('ch1', 'ch3'), E('ch2', 'nb4'), E('ch3', 'mk1'),
  // 驼门巷 ↔ 北渠沿
  E('ns3', 'ga2'), E('ga1', 'ga2'), E('ga1', 'nb1'), E('nb1', 'nb4'), E('nb1', 'nb2'),
  E('nb2', 'nb3'), E('nb4', 'ch2'),
  // 平桥
  E('nb1', 'bw1'), E('bw1', 'bwS'), E('nb2', 'be1'), E('be1', 'beS'),
  // 渠底
  E('crW', 'cb1'), E('cb1', 'cb2'), E('cb2', 'cb3'), E('cb3', 'cb4'), E('cb4', 'cb5'),
  E('cb5', 'cb6'), E('cb6', 'cb7'), E('cb7', 'crE'),
  // 市场内部
  E('mk1', 'mk2'), E('mk2', 'mk3'), E('mk3', 'mk3b'), E('mk1', 'mk4'), E('mk4', 'mkB'),
  E('mkB', 'mk5'), E('mk5', 'mk5b'), E('mk4', 'mk6'), E('mkB', 'mk7'), E('mk7', 'mk8'),
  E('mk5b', 'mk8b'), E('mk2', 'mkB'), E('mk3', 'mk5'), E('mk6', 'mk7'), E('mk8', 'mk8b'),
  E('mk3b', 'hdN'), E('mk8b', 'hdS'), E('mk5b', 'hdS'),
  E('hdN', 'scW1'), E('hdS', 'scW2'),
  // 棚顶栈道
  E('st0', 'st1'), E('st1', 'st2'), E('st2', 'cw1'), E('cw1', 'cw2'), E('cw2', 'cw3'),
  E('st0', 'mk4'),
];

// 队伍目标节点：BL 目标 = 两个包点；GR 目标 = 防守/回防枢纽（驼门巷南口、渠首坡道口、枣椰大道中段）
const teamGoals = {
  BL: ['dA', 'mkB'],
  GR: ['ga1', 'ch1', 'ps2'],
};

// ================== 地标观察机位（总览/逐地标截图与校验用） ==================
const V = (id, name, x, y, z, lx, ly, lz) => ({ id, name, position: { x, y, z }, lookAt: { x: lx, y: ly, z: lz } });
const landmarkViews = [
  V('overview', '总览', 0, 52, 62, 0, 0, -2),
  V('blSpawn', '潜伏者营地', 31, 3.2, 34.5, 28, 1, 20),
  V('grSpawn', '保卫者哨站', -34, 3.2, -29, -34, 1, -36),
  V('southCourt', '南驮队场', 12, 3, 30, 12, 0, 8),
  V('palmStreet', '枣椰大道', 40, 3.4, 30, 40, 1, -10),
  V('canal', '赤水暗渠', -12, -0.9, 5, 8, -2, 0),
  V('bridgeGate', '驼门桥', 0, 2.6, 8, 0, 0.5, -8),
  V('gateLane', '驼门巷', 0, 2.4, -10, 0, 1, -28),
  V('granaryRampS', '粮仓南坡', 34, 1.6, -4, 30, 2, -14),
  V('granary', '粮仓高台', 26, 5, -18, 30, 3, -28),
  V('granaryLane', '粮仓西巷', 12, 2.4, -30, 13, 1, -16),
  V('northStrip', '北集场', -8, 2.6, -31, -20, 1, -34),
  V('westLane', '西驮道', -39.7, 2.4, -10, -39.7, 1, -28),
  V('canalHead', '渠首广场', -36, 2.4, 6, -30, -1, 0),
  V('market', '驼队市场', -24, 2.6, 14, -28, 0.5, 26),
  V('catwalk', '集市棚栈', -24, 4, 11, -36, 2.4, 13),
  V('hallDoorS', '市场南门', -9, 2.2, 28, -13, 1.5, 28),
];

export const PLATFORM_DESERT_LAYOUT = {
  meta: {
    id: 'platform-desert',
    orientation: '+X 东/A包点，-X 西/B包点，-Z 北/GR端，+Z 南/BL端；yaw=0 朝北',
    scaleNote: '约 84m × 72m；原创平台版布局：对角出生 + 横贯中轴暗渠 + 粮仓高台/驼队市场双包点，与离线版沙漠灰无共同轮廓',
    levels: { ground: GROUND, canalBed: BED, catwalk: CATWALK, granaryDeck: DECK },
  },
  bounds: { x0: -42, x1: 42, z0: -36, z1: 36 },
  spawns,
  regions,
  bombSites,
  navGraph: { nodes, edges },
  teamGoals,
  landmarkViews,
  solids,
  ramps,
};
