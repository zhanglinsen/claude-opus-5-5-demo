// 雾港码头（FOG HARBOR QUAY）布局数据 —— 原创港口/码头主题平台地图（US-04）
// 纯数据模块：不依赖 three / DOM，可在 node 下校验（tests/unit/platform-harbor.test.mjs）。
//
// 原创性约定（与离线运输船区分）：
//   - 俯视轮廓为 56m × 68m 的矩形突堤码头（船图是 74m × 25m 纺锤形船体）；
//   - 地标为两侧港池（水线 -1.8）、南北端转运棚、跨码头龙门吊、中央装卸站台与集装箱堆场，
//     不使用运输船的舷侧集装箱管道 / 二楼通廊 / V 形斜箱与 CF 标识（不引用 SIGN_UV 图集）；
//   - 全图 180° 点对称（BL 半场定义 + 自动镜像），路线平衡可由数据直接证明。
//
// 坐标约定（与沙漠灰一致）：+X 东、-X 西、+Z 南 = 潜伏者(BL)、-Z 北 = 保卫者(GR)；
// y 为脚底站立面高度；单位米；站姿约 1.75m。码头面 y=0，港池水面 y=-1.8。

export const LEVELS = {
  quay: 0,        // 码头面
  water: -1.8,    // 港池水面（killY 兜底）
  dock: 1.2,      // 中央装卸站台面
  roof: 2.59,     // 集装箱顶（南/北箱顶步道）
  shed: 4.6,      // 转运棚檐口
  shedRoof: 5.2,  // 转运棚顶
  crane: 11,      // 龙门吊主梁
};
export const BOUNDS = { x0: -29.3, z0: -34.6, x1: 29.3, z1: 34.6 };
export const KILL_Y = -1.3;

// 视觉材质键预算（draw call 收口：每种键一个合批网格；集装箱另按 4 色展开）
export const PALETTE = ['concrete', 'kerb', 'shedWall', 'shedRoof', 'steel', 'dock',
  'wood', 'yellow', 'black', 'white', 'orange', 'none'];
export const CONTAINER_COLOR_BUDGET = 4; // 最多使用 4 种集装箱配色（纹理/合批收敛）

// ---------- 小工具 ----------
const solids = [];
let sid = 0;
const D2R = Math.PI / 180;

// 单个碰撞盒；o.mir = true 时自动生成 180° 对称孪生（x,z 取反，yaw + π）
function S(x, y, z, sx, sy, sz, o = {}) {
  const s = {
    id: o.id || ('ph' + (++sid)),
    x, y, z, sx, sy, sz,
    yaw: o.yaw || 0,
    role: o.role || 'wall',          // floor|wall|ceil|struct|step|cover|bound
    m: o.m || 'steel',               // 视觉材质键（build.js 解析；'none' = 不可见）
    mat: o.mat || 'metal',           // 命中材质
    surface: o.surface || 'metal',   // 脚步声
    bullet: o.bullet || 'block',     // block | pass | pen
    sight: o.sight !== false,
    solid: o.solid !== false,
    tag: o.tag || '',
    ...(o.cont ? { cont: o.cont } : {}),
  };
  solids.push(s);
  if (o.mir) solids.push({ ...s, id: s.id + 'M', x: -x, z: -z, yaw: s.yaw + Math.PI });
  return s;
}

// 集装箱（可选堆叠层数；每层独立碰撞，箱顶可行走视布局而定）
function C(x, z, len, colorIdx, o = {}) {
  const L = len === 40 ? 12.19 : 6.06, W = 2.44, H = 2.59;
  const yaw = (o.yawDeg || 0) * D2R;
  for (let tier = 0; tier < (o.stack || 1); tier++) {
    S(x, (o.y0 || 0) + tier * H + H / 2, z, L, H, W, {
      yaw, m: 'cont', role: 'cover', tag: 'container',
      cont: { len, colorIdx: colorIdx % CONTAINER_COLOR_BUDGET },
      mir: o.mir, id: o.id ? o.id + (tier ? 't' + tier : '') : undefined,
    });
  }
}

// 楼梯：n 级全高踏步，run 为踏步进深；dir '+x' 沿 +X 抬升 / '-x' 沿 -X 抬升
function Stairs(x0, x1, z, n, h, dir, o = {}) {
  const run = Math.abs(x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const hh = (h / n) * (i + 1);
    const cx = dir === '+x' ? x0 + (i + 0.5) * run : x1 - (i + 0.5) * run;
    S(cx, hh / 2, z, run + 0.02, hh, o.sz || 2.2, {
      role: 'step', m: 'steel', surface: 'metal', tag: 'stairs', mir: o.mir,
      id: o.id ? o.id + 'i' + i : undefined,
    });
  }
}

// ================== 码头面与边界 ==================
S(0, -1.25, 0, 58, 2.5, 70, { id: 'deckFloor', role: 'floor', m: 'concrete', mat: 'concrete', surface: 'concrete' });
S(28.35, 0.225, 0, 0.5, 0.45, 69, { id: 'kerbE', role: 'cover', m: 'kerb', mat: 'concrete', surface: 'concrete', bullet: 'pen', mir: true });
// 舷外不可见墙（防跳海；与运输船同款 pass/sight:false 契约）
S(29.3, 3, 0, 0.6, 12, 70, { id: 'boundE', role: 'bound', m: 'none', sight: false, bullet: 'pass', mir: true });
// 南北端墙（端部转运棚外墙，全高封挡）
S(0, 3.25, 34.7, 59.2, 6.5, 0.6, { id: 'endWallS', role: 'bound', m: 'shedWall', mir: true });

// ================== 南转运棚（BL 半场；镜像为北棚） ==================
// x∈[-25.2,-6.8] z∈[8,24] 檐口 4.6 顶 5.2；南门 x[-14.5,-9.5]、北门 x[-19,-15] 与
// 便门 x[-11.5,-10.1]、东门 z[14,17]
S(-19.85, 2.3, 24, 10.7, 4.6, 0.4, { id: 'shedSWall1', m: 'shedWall', mir: true }); // 南墙西段（含门洞让位）
S(-8.15, 2.3, 24, 2.7, 4.6, 0.4, { id: 'shedSWall2', m: 'shedWall', mir: true }); // 南墙东段
S(-25, 2.3, 16, 0.4, 4.6, 16.4, { id: 'shedWWall', m: 'shedWall', mir: true });   // 西墙
S(-22.1, 2.3, 8, 6.2, 4.6, 0.4, { id: 'shedNWall1', m: 'shedWall', mir: true });  // 北墙西段
S(-13.25, 2.3, 8, 3.5, 4.6, 0.4, { id: 'shedNWall2', m: 'shedWall', mir: true }); // 北墙中段（两门之间）
S(-8.45, 2.3, 8, 3.3, 4.6, 0.4, { id: 'shedNWall3', m: 'shedWall', mir: true });  // 北墙东段
S(-7, 2.3, 10.9, 0.4, 4.6, 6.2, { id: 'shedEWall1', m: 'shedWall', mir: true });  // 东墙南段
S(-7, 2.3, 20.6, 0.4, 4.6, 7.2, { id: 'shedEWall2', m: 'shedWall', mir: true });  // 东墙北段
S(-16, 4.9, 16, 18.8, 0.6, 16.8, { id: 'shedRoofS', role: 'ceil', m: 'shedRoof', mir: true });
S(-21, 0.65, 13, 1.3, 1.3, 1.3, { id: 'shedCrate1', role: 'cover', m: 'wood', mat: 'wood', bullet: 'pen', surface: 'wood', mir: true });
S(-22.5, 0.55, 22.5, 1.1, 1.1, 1.1, { id: 'shedCrate2', role: 'cover', m: 'wood', mat: 'wood', bullet: 'pen', surface: 'wood', mir: true });

// ================== 南箱区（集装箱堆场） ==================
// A 排 z=10.5（单层掩体）；B 排 z=16（双箱连顶 = 箱顶步道，东端楼梯上）
C(1.5, 10.5, 40, 0, { id: 'ctA1', mir: true });
C(11.2, 10.5, 20, 1, { id: 'ctA2', mir: true });
C(2.6, 16, 40, 2, { id: 'ctB1', mir: true });
C(14.9, 16, 40, 2, { id: 'ctB2', mir: true });
Stairs(21.0, 23.7, 16, 8, 2.59, '-x', { id: 'stB', sz: 2.2, mir: true }); // 东端楼梯：西高东低（顶接 ctB2 东脸）
// 角部 L 形单箱（棚东门侧翼掩体）
C(-2.5, 20.8, 20, 3, { id: 'ctC1', yawDeg: 90, mir: true });
// 箱区巷掩体木箱（贴 A 排北脸）
S(9, 0.7, 12.4, 1.4, 1.4, 1.4, { id: 'yardCrate1', role: 'cover', m: 'wood', mat: 'wood', bullet: 'pen', surface: 'wood', mir: true });
// 中场南_strip 掩体木箱（吊道口）
S(22.5, 0.8, 4.5, 1.6, 1.6, 1.6, { id: 'yardCrate2', role: 'cover', m: 'wood', mat: 'wood', bullet: 'pen', surface: 'wood', mir: true });

// ================== 南出生区（apron） ==================
S(-24, 0.7, 26.5, 1.4, 1.4, 1.4, { id: 'spawnCrate1', role: 'cover', m: 'wood', mat: 'wood', bullet: 'pen', surface: 'wood', mir: true });
C(21, 31, 20, 1, { id: 'spawnStack', stack: 2, mir: true }); // 双层堆（防吊道直瞄出生区）

// ================== 中央装卸站台（自对称） ==================
S(0, 0.6, 0, 13, 1.2, 7, { id: 'dockBase', role: 'struct', m: 'dock', mat: 'concrete', surface: 'concrete' });
C(0, 0, 20, 1, { id: 'dockBox', y0: 1.2 }); // 站台中央箱（四周环廊通行）
Stairs(-7.7, -6.5, 2.0, 4, 1.2, '+x', { id: 'stDockW', sz: 2.8, mir: true }); // 西侧上站台阶（东侧由镜像生成）

// ================== 中场斜置箱组（self-symmetric via 镜像） ==================
C(-16, 2.2, 20, 2, { id: 'chic1', yawDeg: -25, mir: true });
C(-16, -2.2, 20, 3, { id: 'chic2', yawDeg: 25, mir: true });
S(-11, 0.7, -4.5, 1.4, 1.4, 1.4, { id: 'midCrate1', role: 'cover', m: 'wood', mat: 'wood', bullet: 'pen', surface: 'wood', mir: true });

// ================== 跨码头龙门吊腿（梁与小车为纯装饰，见 build.js） ==================
S(24, 5.5, 10, 1.4, 11, 1.4, { id: 'craneLeg1', m: 'yellow', mir: true });
S(24, 5.5, -10, 1.4, 11, 1.4, { id: 'craneLeg2', m: 'yellow', mir: true });

export const SOLIDS = solids;

// ================== 报点区域（callouts） ==================
// extents 为本侧定义；镜像侧由 twin 自动生成（extents 取反映转）
const regionDefs = [
  { id: 'blSpawn', name: '潜伏者出生区', en: 'BL Spawn', ext: { x0: -24, z0: 26, x1: 24, z1: 34 }, twin: 'grSpawn', twinName: '保卫者出生区', twinEn: 'GR Spawn' },
  { id: 'quaySW', name: '西南岸巷', en: 'SW Quay Lane', ext: { x0: -28.1, z0: 1, x1: -25.2, z1: 26 }, twin: 'quayNE', twinName: '东北岸巷', twinEn: 'NE Quay Lane' },
  { id: 'shedS', name: '南货运棚', en: 'South Shed', ext: { x0: -25.2, z0: 8, x1: -6.8, z1: 24 }, twin: 'shedN', twinName: '北货运棚', twinEn: 'North Shed' },
  // roofS 必须排在 yardS 之前：game.js regionAt 按数组顺序取首个 XZ/Y 匹配，
  // yardS 无 y 过滤，若在前会吞掉箱顶高度（y≈2.59）的报点
  { id: 'roofS', name: '南箱顶', en: 'South Rooftop', ext: { x0: -3.5, z0: 14.7, x1: 21, z1: 17.3, y0: 2.5, y1: 2.7 }, twin: 'roofN', twinName: '北箱顶', twinEn: 'North Rooftop' },
  { id: 'yardS', name: '南箱区', en: 'South Yard', ext: { x0: -4.6, z0: 9.2, x1: 21, z1: 17.3 }, twin: 'yardN', twinName: '北箱区', twinEn: 'North Yard' },
  { id: 'craneSE', name: '东南吊道', en: 'SE Crane Run', ext: { x0: 21, z0: 6, x1: 28.1, z1: 34 }, twin: 'craneNW', twinName: '西北吊道', twinEn: 'NW Crane Run' },
  { id: 'midS', name: '中场南', en: 'Mid South', ext: { x0: -28, z0: 3.6, x1: 28, z1: 9.2 }, twin: 'midN', twinName: '中场北', twinEn: 'Mid North' },
  { id: 'midW', name: '中场西', en: 'Mid West', ext: { x0: -20, z0: -6.5, x1: -7, z1: 6.5 }, twin: 'midE', twinName: '中场东', twinEn: 'Mid East' },
  { id: 'dock', name: '中央站台', en: 'Loading Dock', ext: { x0: -6.5, z0: -3.5, x1: 6.5, z1: 3.5, y0: 1.1, y1: 1.3 }, twin: 'dock' },
];

// ================== 导航图 ==================
// BL 半场 + 自对称节点，全部带 mir（dock 类节点由 pairs 显式成对定义，避免孪生重叠）
const nodes = [];
const edges = [];
function N(id, x, y, z, region, o = {}) {
  nodes.push({ id, x, y, z, region, clearance: o.clr || 0.45, ...(o.mir ? { mir: true } : {}) });
}
function E(a, b, requires) {
  edges.push({ from: a, to: b, ...(requires ? { requires } : {}) });
}

// 出生区
N('bl1', -8, 0, 30, 'blSpawn', { mir: true });
N('bl2', 6, 0, 30, 'blSpawn', { mir: true });
N('bl3', -20, 0, 30, 'blSpawn', { mir: true });
// 西南岸巷
N('qw0', -26.6, 0, 30, 'quaySW', { mir: true });
N('qw1', -26.6, 0, 22, 'quaySW', { mir: true });
N('qw2', -26.6, 0, 14, 'quaySW', { mir: true });
N('qw3', -26.6, 0, 7, 'quaySW', { mir: true });
// 南货运棚
N('sh1', -21, 0, 20, 'shedS', { mir: true });
N('sh2', -13, 0, 20, 'shedS', { mir: true });
N('sh3', -17, 0, 10.5, 'shedS', { mir: true });
N('sh4', -9.5, 0, 15.5, 'shedS', { mir: true });
N('shDoor', -5.4, 0, 15.5, 'yardS', { mir: true }); // 东门外廊（对齐门洞 z[14,17]）
// 南箱区 / 巷道
N('ya1', 1.5, 0, 14, 'yardS', { mir: true });
N('ya2', 11, 0, 14, 'yardS', { mir: true });
N('ya3', -5.4, 0, 13, 'yardS', { mir: true });
N('ya4', -5.4, 0, 19, 'yardS', { mir: true });
N('ya7', -5, 0, 27, 'blSpawn', { mir: true });
N('ya6', 17.5, 0, 13.2, 'yardS', { mir: true });
// 东南吊道
N('ce0b', 20, 0, 26.5, 'craneSE', { mir: true });
N('ce1', 25.5, 0, 30, 'craneSE', { mir: true });
N('ce2', 25.5, 0, 20, 'craneSE', { mir: true });
N('ce3', 26, 0, 12, 'craneSE', { mir: true });
N('ce4', 26, 0, 7, 'craneSE', { mir: true });
N('stB1', 24.6, 0, 16, 'craneSE', { mir: true }); // 箱顶楼梯底
// 南箱顶
N('rf1', 2.6, 2.59, 16, 'roofS', { clr: 0.4, mir: true });
N('rf2', 14.9, 2.59, 16, 'roofS', { clr: 0.4, mir: true });
// 中场
N('outN1', -17, 0, 5, 'midS', { mir: true });
N('mdsC', 0, 0, 6.4, 'midS', { mir: true });
N('ya5', 6, 0, 6.5, 'midS', { mir: true });
N('ya5b', 15.5, 0, 7.5, 'midS', { mir: true });
N('mwS1', -16, 0, 6.3, 'midW', { mir: true });
N('mwS2', -10.5, 0, 5, 'midW', { mir: true });
N('mwS3', -8.9, 0, 2, 'midW', { mir: true });
N('mdw2', -10.2, 0, 0, 'midW', { mir: true });
// 中央站台（成对定义：点对称伙伴，不走 'M' 后缀）
N('dk1', 0, 1.2, 2.35, 'dock', { clr: 0.4 });
N('dk2', 0, 1.2, -2.35, 'dock', { clr: 0.4 });
N('dkSW', -4.7, 1.2, 2.3, 'dock', { clr: 0.4 });
N('dkNE', 4.7, 1.2, -2.3, 'dock', { clr: 0.4 });
N('dkW1', -4.7, 1.2, 0, 'dock', { clr: 0.4 });
N('dkE1', 4.7, 1.2, 0, 'dock', { clr: 0.4 });
N('dkNW', -4.7, 1.2, -2.3, 'dock', { clr: 0.4 });
N('dkSE', 4.7, 1.2, 2.3, 'dock', { clr: 0.4 });
export const NAV_PAIRS = [['dk1', 'dk2'], ['dkSW', 'dkNE'], ['dkW1', 'dkE1'], ['dkNW', 'dkSE']];

// 边（全部 mir：孪生边由镜像机制生成；箱顶跳下为 jump，其余 walk）
E('bl1', 'bl2', 'walk'); E('bl2', 'bl3', 'walk');
E('bl3', 'qw0', 'walk'); E('bl2', 'ce0b', 'walk');
E('bl1', 'sh2', 'walk');            // 南门进棚
E('bl1', 'ya7', 'walk'); E('ya7', 'ya4', 'walk'); // 箱区西肋入口
E('qw0', 'qw1', 'walk'); E('qw1', 'qw2', 'walk'); E('qw2', 'qw3', 'walk');
E('qw3', 'mwS1', 'walk'); E('qw3', 'outN1', 'walk');
E('sh1', 'sh2', 'walk'); E('sh2', 'sh3', 'walk'); E('sh3', 'sh4', 'walk'); E('sh1', 'sh4', 'walk');
E('sh3', 'outN1', 'walk');          // 北门出棚
E('sh4', 'shDoor', 'walk');         // 东门出棚
E('shDoor', 'ya3', 'walk'); E('shDoor', 'ya4', 'walk');
E('ya3', 'ya4', 'walk'); E('ya3', 'ya1', 'walk');
E('ya1', 'ya2', 'walk'); E('ya2', 'ya6', 'walk'); E('ya6', 'ya5b', 'walk');
E('ya5', 'mdsC', 'walk'); E('ya5', 'ya5b', 'walk'); E('ya5', 'outN1', 'walk');
E('mdsC', 'mwS1', 'walk'); E('mdsC', 'outN1', 'walk');
E('mwS1', 'mwS2', 'walk'); E('mwS2', 'mdw2', 'walk'); E('mwS2', 'mwS3', 'walk');
E('mwS3', 'mdw2', 'walk'); E('mwS3', 'dk1', 'walk'); // 台阶上站台
E('dk1', 'dkSW', 'walk'); E('dkSW', 'dkW1', 'walk'); E('dkW1', 'dkNW', 'walk'); E('dkNW', 'dk2', 'walk');
E('ce0b', 'ce1', 'walk'); E('ce1', 'ce2', 'walk'); E('ce2', 'ce3', 'walk'); E('ce3', 'ce4', 'walk');
E('ce2', 'stB1', 'walk'); E('stB1', 'rf2', 'walk'); // 楼梯上箱顶
E('ce4', 'ya5b', 'walk'); E('ce4', 'ya5', 'walk');
E('rf1', 'rf2', 'walk');            // 箱顶连廊
E('rf1', 'ya1', 'jump'); E('rf2', 'ya2', 'jump');   // 箱顶跳下（单向下撤）

export const NAV_NODES = nodes;
export const NAV_EDGES = edges;

// ---------- 镜像机制：由 BL 半场 + 成对定义生成全图 ----------
const pairMap = new Map();
for (const [a, b] of NAV_PAIRS) { pairMap.set(a, b); pairMap.set(b, a); }
const mapId = (id) => pairMap.get(id) || (id + 'M');
const mirrorExt = (e) => ({ x0: -e.x1, x1: -e.x0, z0: -e.z1, z1: -e.z0, ...(e.y0 !== undefined ? { y0: e.y0, y1: e.y1 } : {}) });

export const REGIONS = (() => {
  const out = [];
  for (const r of regionDefs) {
    out.push({ id: r.id, name: r.name, en: r.en, extents: r.ext });
    if (r.twin !== r.id) {
      out.push({ id: r.twin, name: r.twinName, en: r.twinEn, extents: mirrorExt(r.ext) });
    }
  }
  return out;
})();

const twinRegion = new Map(regionDefs.map((r) => [r.id, r.twin]));

export const NAV_GRAPH = (() => {
  const outNodes = [...nodes];
  const outEdges = [...edges];
  for (const n of nodes) {
    if (pairMap.has(n.id)) continue; // 成对节点已显式定义
    outNodes.push({ ...n, id: n.id + 'M', x: -n.x, z: -n.z, region: twinRegion.get(n.region) });
  }
  for (const e of edges) {
    outEdges.push({ from: mapId(e.from), to: mapId(e.to), requires: e.requires || 'walk' });
  }
  return { nodes: outNodes, edges: outEdges };
})();

// ================== 出生点（契约：{x,y,z,yaw}，y 为脚底站立面） ==================
// BL 朝 -Z（yaw 0），GR 由点对称生成（yaw + π）
export const SPAWNS = (() => {
  const bl = [];
  for (let i = 0; i < 10; i++) {
    bl.push({ x: -22 + (i % 5) * 7, y: 0, z: 29.5 + Math.floor(i / 5) * 2.5, yaw: 0 });
  }
  const gr = bl.map((p) => ({ x: -p.x, y: p.y, z: -p.z, yaw: p.yaw + Math.PI }));
  return { BL: bl, GR: gr };
})();

// ================== 灯位（build.js 出几何；game 取前 4 个作真实点光源） ==================
export const LAMPS = [
  { x: -16, y: 4.2, z: 16, mast: false },  // 南棚内
  { x: -9.5, y: 4.2, z: 12, mast: false },
  { x: -14, y: 5.6, z: 6.4, mast: true },  // 中场西桅灯
  { x: 14, y: 5.6, z: -6.4, mast: true },  // 中场东桅灯（镜像位）
  { x: 24.5, y: 5.6, z: 22, mast: true },  // 东南吊道桅灯
  { x: -24.5, y: 5.6, z: -22, mast: true },
  { x: 16, y: 4.2, z: -16, mast: false },  // 北棚内
  { x: 9.5, y: 4.2, z: -12, mast: false },
];

// ================== 静态靶（练习模式；pos 为靶心，胸口高 = 站立面 + 1.2） ==================
export const PRACTICE_TARGETS = [
  { id: 'ph-bl-spawn', pos: { x: -8, y: 1.2, z: 30 } },
  { id: 'ph-shed', pos: { x: -16, y: 1.2, z: 16 } },
  { id: 'ph-yard', pos: { x: 1.5, y: 1.2, z: 13.5 } },
  { id: 'ph-crane', pos: { x: 25.5, y: 1.2, z: 20 } },
  { id: 'ph-quay', pos: { x: -26.6, y: 1.2, z: 14 } },
  { id: 'ph-mid-west', pos: { x: -10.2, y: 1.2, z: 0 } },
  { id: 'ph-mid-dock', pos: { x: 0, y: 2.4, z: 2.35 } },
  { id: 'ph-roof', pos: { x: 2.6, y: 3.79, z: 16 } },
  { id: 'ph-gr-spawn', pos: { x: 8, y: 1.2, z: -30 } },
  { id: 'ph-shed-n', pos: { x: 16, y: 1.2, z: -16 } },
  { id: 'ph-yard-n', pos: { x: -1.5, y: 1.2, z: -13.5 } },
  { id: 'ph-crane-n', pos: { x: -25.5, y: 1.2, z: -20 } },
];

// ================== 路线表（平衡说明 + 测试锚点） ==================
export const ROUTES = [
  { id: 'laneW', from: 'bl3', to: 'bl3M', via: '西南岸巷 → 中场西 → 东北岸巷' },
  { id: 'laneE', from: 'bl2', to: 'bl2M', via: '东南吊道 → 中场南 → 西北吊道' },
  { id: 'mid', from: 'bl1', to: 'bl1M', via: '南棚 → 中场南 → 北棚' },
  { id: 'roof', from: 'bl2', to: 'rf2', via: '吊道楼梯上南箱顶' },
  { id: 'dock', from: 'bl1', to: 'dk1', via: '中场西台阶上站台' },
];

// ================== 注册表就绪描述符（接入时原样并入 maps/registry.js MAPS） ==================
export const PLATFORM_HARBOR_DESCRIPTOR = {
  id: 'platform-harbor',
  name: '雾港码头',
  en: 'FOG HARBOR QUAY',
  available: true,
  supportedModes: ['tdm', 'practice'],
  defaultMode: 'tdm',
  loadingLabel: '搭建雾港码头',
  nav: null, // 使用高度感知导航图（NAV_GRAPH），与沙漠灰同机制
  bounds: BOUNDS,
  radar: {
    widthM: 60, heightM: 72, offX: 30, offZ: 37,
    maxColliderHalf: 24, // 过滤码头面/端墙级大碰撞体
    overlays: [ // 上层可站立面（箱顶步道 / 中央站台）虚线框
      { x: 8.75, z: 16, w: 24.5, h: 2.44 },
      { x: -8.75, z: -16, w: 24.5, h: 2.44 },
      { x: 0, z: 0, w: 13, h: 7 },
    ],
  },
  menu: {
    orbit: { r: 54, rOff: 0, y: 24, yAmp: 4, zR: 40, look: [0, 2, 0], fov: 55, speed: 0.04 },
    blurb: '雾气未散的集装箱码头：潜伏者（Black List）从南端堆场登陆，保卫者（Global Risk）驻守北端。中央装卸站台连接两侧港池岸巷，东西吊道与南北箱顶构成三条进攻路线，跨码头龙门吊下是全场最快的直通道。',
  },
  env: {
    ocean: false, shipSpeed: 0,           // 港池水面由地图自建（静态水线 + 潮汐起伏），不启用共享海面
    groundColor: 0x4c5a5c,                // 环境反射里的水面近似色
    fogColor: 0xb9c3c6, fogDensity: 0.0016, // 海雾
    sunElev: 48, sunAzim: 120,
    shadowBox: { x0: -33, x1: 33, y0: -3, y1: 20, z0: -39, z1: 39 },
  },
  ambientKey: null,
  spawnYFallback: 0.02,
  killY: KILL_Y,
  loadoutZone: { BL: { axis: 'z', min: 26 }, GR: { axis: 'z', max: -26 } },
  ai: {
    // holds/flank 为潜伏者侧坐标，保卫者由 bots 取反；holds[2] = π/2 使双方朝向各自敌方
    holds: [[-21, 20, Math.PI / 2], [1.5, 13.4, Math.PI / 2], [25.5, 16, Math.PI / 2], [-16, 6.3, Math.PI / 2], [-10.2, 0, Math.PI / 2]],
    lanes: [-18, -8], // 突击纵深（z）
    flank: [[-26.6, 18], [6, 24], [25.5, 26]],
    rushZone: { x0: -22, x1: 22 },
    roam: { x0: -26, z0: -24, x1: 26, z1: 24 },
  },
  practiceTargets: PRACTICE_TARGETS,
};

export const META = {
  orientation: '+X 东（东南吊道），-Z 北（保卫者 GR），+Z 南（潜伏者 BL）；y 为脚底站立面高度',
  scaleNote: '码头面约 56m × 68m（含护舩 58.6 × 70.6），层高：码头面 0 / 站台 1.2 / 箱顶 2.59 / 棚顶 5.2 / 龙门吊梁 11',
};
