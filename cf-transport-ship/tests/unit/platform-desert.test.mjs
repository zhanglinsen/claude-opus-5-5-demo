// 赤霞集市（平台原创沙漠图）布局校验（平台扩展 US-04）
// 覆盖：数据一致性、与离线旧图「沙漠灰」的原创性区分守卫、双包区拓扑、
// 报点区域、高度层支撑/坡道衔接，以及真实碰撞世界中的最少必要路线。
// 视觉集成（构建网格/材质/截图）由集成阶段验证，这里不依赖 three/DOM。
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/physics.js';
import { createNavigation } from '../../src/navigation.js';
import { PLATFORM_DESERT_LAYOUT as L } from '../../src/maps/platform-desert/layout.js';
import { DESERT_LAYOUT as DG } from '../../src/maps/desert-grey-layout.js';

const region = (id) => L.regions.find((r) => r.id === id);
const node = (id) => L.navGraph.nodes.find((n) => n.id === id);
// extents 无 y 轴时不做高度过滤
function inside(e, x, z, y = 0) {
  if (x < e.x0 || x > e.x1 || z < e.z0 || z > e.z1) return false;
  if (e.y0 === undefined) return true;
  return y >= e.y0 - 0.6 && y <= (e.y1 ?? e.y0) + 2.6;
}

// ================= 原创性守卫（US-04：不得仅将沙漠灰换名） =================

test('原创地图：报点命名与沙漠灰几乎无重叠（轮廓/地标全新）', () => {
  const mine = new Set(L.regions.map((r) => r.id));
  const theirs = new Set(DG.regions.map((r) => r.id));
  const shared = [...mine].filter((id) => theirs.has(id));
  assert.deepEqual(shared.filter((id) => !['blSpawn', 'grSpawn'].includes(id)), [],
    '与沙漠灰共享的地标 id 应只有通用出生点');
  // 名称也不得复用（防止换 id 不换名）
  const myNames = new Set(L.regions.map((r) => r.name));
  const dgNames = new Set(DG.regions.map((r) => r.name));
  assert.deepEqual([...myNames].filter((n) => dgNames.has(n)), [], '报点名称不得与沙漠灰重复');
});

test('原创地图：包点位置与旧图 A/B 明显错开，出生为对角布置', () => {
  assert.equal(L.meta.id, 'platform-desert');
  for (const b of L.bombSites) {
    const d = DG.bombSites.find((q) => q.id === b.id);
    const dist = Math.hypot(b.x - d.x, b.z - d.z);
    assert.ok(dist > 10, `包点 ${b.id} 与沙漠灰同位包点仅相距 ${dist.toFixed(1)}m`);
  }
  // A 包点虽同处东北象限，但落在与旧图不同层的整块高台上（3.0 vs 2.6）
  assert.notEqual(L.bombSites[0].y, DG.bombSites[0].y, 'A 包点站立层应与旧图不同');
  // 沙漠灰为 BL 正南 / GR 正北；本图为 BL 东南 / GR 西北对角
  const cx = (t) => L.spawns[t].reduce((s, p) => s + p.x, 0) / L.spawns[t].length;
  const cz = (t) => L.spawns[t].reduce((s, p) => s + p.z, 0) / L.spawns[t].length;
  assert.ok(cx('BL') > 15 && cz('BL') > 20, 'BL 出生质心应在东南象限');
  assert.ok(cx('GR') < -20 && cz('GR') < -20, 'GR 出生质心应在西北象限');
  // 层高方案不同：旧图上/下两层为 2.6 / -1.8，本图为高台 3.0 / 棚栈 2.4 / 渠底 -2.5
  assert.equal(L.meta.levels.granaryDeck, 3.0);
  assert.equal(L.meta.levels.catwalk, 2.4);
  assert.equal(L.meta.levels.canalBed, -2.5);
});

test('必含地标全部作为报点区域存在、id 唯一且带导航节点', () => {
  const required = [
    'blSpawn', 'grSpawn', 'canal', 'bridgeGate', 'bridgeEast', 'canalHead', 'canalTail',
    'gateLane', 'granary', 'granaryRampS', 'granaryRampW', 'granaryLane', 'market',
    'hallDoorN', 'hallDoorS', 'catwalk', 'palmStreet', 'westLane', 'northBank', 'northStrip', 'southCourt',
  ];
  const ids = L.regions.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, 'region id 不得重复');
  for (const id of required) {
    const r = region(id);
    assert.ok(r, `缺少地标区域 ${id}`);
    assert.ok(r.name, `地标 ${id} 缺少名称`);
    assert.ok(L.navGraph.nodes.some((n) => n.region === id), `地标 ${id} 没有任何导航节点`);
  }
});

test('出生点：数量、有限坐标、界内、落在各自出生区', () => {
  for (const team of ['BL', 'GR']) {
    assert.equal(L.spawns[team].length, 10, `${team} 需要 10 个出生点`);
    for (const sp of L.spawns[team]) {
      for (const v of [sp.x, sp.y, sp.z, sp.yaw]) assert.ok(Number.isFinite(v), `${team} 出生点坐标必须有限`);
      const B = L.bounds;
      assert.ok(sp.x > B.x0 && sp.x < B.x1 && sp.z > B.z0 && sp.z < B.z1, `${team} 出生点越界`);
      assert.ok(inside(region(team === 'BL' ? 'blSpawn' : 'grSpawn').extents, sp.x, sp.z, sp.y),
        `${team} 出生点不在出生区内 (${sp.x},${sp.z})`);
    }
  }
});

// regionAt（game.js）按 regions 数组顺序取首个匹配：出生区若排在 southCourt/northStrip/
// westLane/palmStreet 等大区域之后，开局报点会被大区域遮蔽。此测试复刻该首匹配语义。
test('报点首匹配：全部出生点按 regions 顺序命中各自出生区，不被大区域遮蔽', () => {
  const regionNameAt = (x, z, y = 0) => {
    for (const r of L.regions) if (inside(r.extents, x, z, y)) return r.name || r.id;
    return null;
  };
  for (const [team, id] of [['BL', 'blSpawn'], ['GR', 'grSpawn']]) {
    const expected = region(id).name;
    for (const sp of L.spawns[team]) {
      assert.equal(regionNameAt(sp.x, sp.z, sp.y), expected,
        `${team} 出生点 (${sp.x},${sp.z}) 报点应为「${expected}」`);
    }
  }
});

test('导航图完整性：节点/边引用有效、界内、区域存在', () => {
  const ids = L.navGraph.nodes.map((n) => n.id);
  assert.equal(new Set(ids).size, ids.length, '导航节点 id 重复');
  const B = L.bounds;
  for (const n of L.navGraph.nodes) {
    for (const v of [n.x, n.y, n.z]) assert.ok(Number.isFinite(v), `节点 ${n.id} 坐标必须有限`);
    assert.ok(n.x > B.x0 - 1 && n.x < B.x1 + 1 && n.z > B.z0 - 1 && n.z < B.z1 + 1, `节点 ${n.id} 越界`);
    assert.ok(region(n.region), `节点 ${n.id} 引用未知区域 ${n.region}`);
    assert.ok(n.clearance > 0, `节点 ${n.id} clearance 非法`);
  }
  for (const e of L.navGraph.edges) {
    assert.ok(node(e.from) && node(e.to), `边引用不存在的节点 ${e.from}->${e.to}`);
    assert.ok(['walk', 'crouch', 'jump'].includes(e.requires ?? 'walk'), `边 ${e.from}->${e.to} requires 非法`);
    if (e.width !== undefined) assert.ok(e.width > 0.9, `边 ${e.from}->${e.to} 宽度过窄`);
  }
});

test('双包区：数据一致、各落其区域，A 在高台面、B 在棚厅地面', () => {
  assert.equal(L.bombSites.length, 2);
  const a = L.bombSites.find((b) => b.id === 'A');
  const b = L.bombSites.find((s) => s.id === 'B');
  assert.equal(a.y, L.meta.levels.granaryDeck, 'A 包点应落在粮仓高台面');
  assert.equal(b.y, L.meta.levels.ground, 'B 包点应落在驼队市场地面');
  for (const bs of L.bombSites) {
    const r = region(bs.region);
    assert.ok(r, `包点 ${bs.id} 引用未知区域`);
    assert.ok(inside(r.extents, bs.x, bs.z, bs.y), `包点 ${bs.id} 位置不在其区域内`);
    for (const v of [bs.x, bs.y, bs.z, bs.radius]) assert.ok(Number.isFinite(v), `包点 ${bs.id} 数据必须有限`);
  }
  for (const [team, goals] of Object.entries(L.teamGoals)) {
    for (const g of goals) assert.ok(node(g), `${team} 目标节点 ${g} 不存在`);
  }
});

test('几何数据：solids/ramps 数值有限、尺寸为正、界内', () => {
  assert.ok(L.solids.length > 50, 'solids 应覆盖全图结构');
  const B = L.bounds;
  const seen = new Set();
  for (const s of L.solids) {
    assert.ok(!seen.has(s.id), `solid id 重复 ${s.id}`);
    seen.add(s.id);
    for (const v of [s.x, s.y, s.z, s.sx, s.sy, s.sz]) assert.ok(Number.isFinite(v), `solid ${s.id} 数值必须有限`);
    for (const v of [s.sx, s.sy, s.sz]) assert.ok(v > 0, `solid ${s.id} 尺寸必须为正`);
    assert.ok(s.x - s.sx / 2 > B.x0 - 2 && s.x + s.sx / 2 < B.x1 + 2, `solid ${s.id} X 越界`);
    assert.ok(s.z - s.sz / 2 > B.z0 - 2 && s.z + s.sz / 2 < B.z1 + 2, `solid ${s.id} Z 越界`);
  }
  assert.ok(L.ramps.length >= 5, '高台/暗渠/棚栈共需至少 5 条坡道');
  for (const r of L.ramps) {
    assert.ok(['x', 'z'].includes(r.axis), '坡道 axis 非法');
    assert.notEqual(r.y0, r.y1, '坡道两端高度不能相同');
    for (const v of [r.x, r.z, r.sx, r.sz, r.y0, r.y1]) assert.ok(Number.isFinite(v), `ramp ${r.id} 数值必须有限`);
  }
});

test('图边高度合理性：相邻节点高差不超过坡道可达范围', () => {
  for (const e of L.navGraph.edges) {
    const a = node(e.from), b = node(e.to);
    assert.ok(Math.abs(a.y - b.y) <= 2.7, `边 ${e.from}->${e.to} 高差 ${Math.abs(a.y - b.y).toFixed(2)} 超限`);
  }
});

test('地标观察机位齐全且坐标有限', () => {
  const ids = L.landmarkViews.map((v) => v.id);
  assert.equal(new Set(ids).size, ids.length, 'landmarkViews id 重复');
  for (const v of L.landmarkViews) {
    for (const p of [v.position, v.lookAt]) {
      for (const k of ['x', 'y', 'z']) assert.ok(Number.isFinite(p[k]), `机位 ${v.id} 坐标必须有限`);
    }
  }
  for (const id of ['overview', 'blSpawn', 'grSpawn', 'canal', 'bridgeGate', 'gateLane', 'granary',
    'market', 'catwalk', 'canalHead', 'southCourt', 'palmStreet']) {
    assert.ok(ids.includes(id), `缺少机位 ${id}`);
  }
});

test('布局元信息记录了方向约定与比例说明', () => {
  assert.ok(L.meta.orientation.includes('+X') && L.meta.orientation.includes('-Z'), '需记录坐标方向约定');
  assert.ok(L.meta.scaleNote.length > 10, '需记录比例说明');
});

// ================= 真实几何校验（MOVEMENT 契约 API + 真实碰撞世界） =================
// 纯图连通 ≠ 真正可走：这里用真实 World + createNavigation 验证每条边、
// 双包区进攻路线、回防路线与上下层可达，防止图上连通、脚下被断。
function buildRealNav() {
  const world = new World();
  for (const s of L.solids) {
    world.add({
      x: s.x, y: s.y, z: s.z, sx: s.sx, sy: s.sy, sz: s.sz, yaw: s.yaw || 0,
      mat: s.mat, surface: s.surface, bullet: s.bullet, sight: s.sight, solid: s.solid, tag: s.tag || s.role,
    });
  }
  for (const r of L.ramps) world.addRamp(r);
  world.build();
  return { world, nav: createNavigation(world, {}, { navGraph: L.navGraph }) };
}
const AGENT = { radius: 0.36, height: 1.8, canCrouch: true, canJump: true };

test('每一条地图导航边都可被标准角色通过', () => {
  const { nav } = buildRealNav();
  const blocked = L.navGraph.edges.filter((e) => !nav.canTraverse(e.from, e.to, AGENT));
  assert.deepEqual(blocked.map((e) => `${e.from}->${e.to}`), []);
});

test('高度层：高台 3.0 / 棚栈 2.4 / 渠底 -2.5 / 桥面与地面 0 各自支撑', () => {
  const { world } = buildRealNav();
  const top = (x, z, hint) => world.support(x, z, 0.36, hint)?.y;
  assert.equal(top(28, -24, 4), L.meta.levels.granaryDeck, '粮仓高台面');
  assert.equal(top(-30, 12.5, 4), L.meta.levels.catwalk, '市场棚顶栈道');
  assert.equal(top(18, 0, 3), L.meta.levels.canalBed, '暗渠渠底（避开平桥投影）');
  assert.equal(top(10, 0, -0.4), L.meta.levels.canalBed, '东渠桥下方仍为渠底（桥下净空分层）');
  assert.equal(top(0, 0, 3), 0, '驼门桥面');
  assert.equal(top(11, 0, 3), 0, '东渠桥面');
  assert.equal(top(20, 20, 3), 0, '南驮队场地面');
});

test('坡道衔接：各坡道中点高度落在两端之间，坡道端点接入目标层', () => {
  const { world } = buildRealNav();
  const mid = (id) => {
    const r = L.ramps.find((q) => q.id === id);
    return world.support(r.x, r.z, 0.36, 4)?.y;
  };
  assert.ok(Math.abs(mid('granaryRampS') - (0 + 3) / 2) < 0.15, '粮仓南坡中点');
  assert.ok(Math.abs(mid('granaryRampW') - (0 + 3) / 2) < 0.15, '粮仓西坡中点');
  assert.ok(Math.abs(mid('canalRampW') - (0 - 2.5) / 2) < 0.15, '暗渠西坡中点');
  assert.ok(Math.abs(mid('canalRampE') - (0 - 2.5) / 2) < 0.15, '暗渠东坡中点');
  assert.ok(Math.abs(mid('catwalkRamp') - (2.4 + 0) / 2) < 0.15, '棚栈坡道中点');
  // 南坡北端接台面、西坡东端接台面（坡顶与台面同层，不悬空、不断接）
  assert.equal(world.support(31, -14.2, 0.36, 4)?.y, L.meta.levels.granaryDeck, '南坡顶接高台');
  assert.equal(world.support(16.6, -21, 0.36, 4)?.y, L.meta.levels.granaryDeck, '西坡顶接高台');
});

test('双包区路线：BL 出生沿真实碰撞可走到 A 高台与 B 市场', () => {
  const { nav } = buildRealNav();
  const bl = {
    x: L.spawns.BL.reduce((s, p) => s + p.x, 0) / L.spawns.BL.length,
    y: 0, z: L.spawns.BL.reduce((s, p) => s + p.z, 0) / L.spawns.BL.length,
  };
  for (const goal of L.teamGoals.BL) {
    const n = node(goal);
    const path = nav.findPath(bl, { x: n.x, y: n.y, z: n.z }, AGENT);
    assert.ok(path.length > 0, `BL 无法从真实几何走到 ${goal}`);
  }
});

test('回防路线：GR 出生可到回防枢纽并登上 A 高台、进入 B 市场、下暗渠渠底', () => {
  const { nav } = buildRealNav();
  const gr = {
    x: L.spawns.GR.reduce((s, p) => s + p.x, 0) / L.spawns.GR.length,
    y: 0, z: L.spawns.GR.reduce((s, p) => s + p.z, 0) / L.spawns.GR.length,
  };
  for (const goal of [...L.teamGoals.GR, 'dA', 'mkB', 'cb4', 'cw2']) {
    const n = node(goal);
    const path = nav.findPath(gr, { x: n.x, y: n.y, z: n.z }, AGENT);
    assert.ok(path.length > 0, `GR 无法从真实几何走到 ${goal}`);
  }
});

test('全图节点从 BL 出生点均真实可达（不允许孤岛簇）', () => {
  const { nav } = buildRealNav();
  const start = 'bl1';
  const adj = new Map();
  for (const e of L.navGraph.edges) {
    for (const [a, b] of [[e.from, e.to], [e.to, e.from]]) {
      if (!adj.has(a)) adj.set(a, []);
      adj.get(a).push(b);
    }
  }
  const seen = new Set([start]);
  const q = [start];
  while (q.length) {
    const cur = q.shift();
    for (const nx of adj.get(cur) || []) {
      if (seen.has(nx)) continue;
      if (nav.canTraverse(cur, nx, AGENT)) { seen.add(nx); q.push(nx); }
    }
  }
  const orphans = L.navGraph.nodes.filter((n) => !seen.has(n.id)).map((n) => `${n.id}(${n.region})`);
  assert.equal(orphans.length, 0, `碰撞校验后不可达节点 ${seen.size}/${L.navGraph.nodes.length}：${orphans.join(', ')}`);
});

test('关键视线：棚厅入口敞开、暗渠渠底纵线通视、渠帮与高台形成遮挡', () => {
  const { world } = buildRealNav();
  // 渠首广场经北柱廊看进市场（北入口通视，不得被封闭）
  assert.equal(world.raycast(-33, 1.5, 7, 0, 0, 1, 12, 'sight'), null, '市场北柱廊入口应敞开');
  // 渠底沿暗渠纵向通视（平桥底面高于头部）
  assert.equal(world.raycast(-14, -0.9, 0, 1, 0, 0, 22, 'sight'), null, '渠底纵线应可通视');
  // 地面横穿暗渠的枪线在渠沿处被遮挡有限：但出生点对角直射必须被高台/建筑挡住
  assert.ok(world.raycast(28, 1.6, 30, -1, 0, -1, 80, 'sight'), 'BL→GR 对角直射应被建筑遮挡');
  // 棚厅东墙封挡市场内外的水平视线
  assert.ok(world.raycast(-8, 1.2, 22, -1, 0, 0, 8, 'sight'), '市场东墙应遮挡横穿视线');
});
