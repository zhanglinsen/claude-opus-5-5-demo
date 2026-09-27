// 沙漠灰布局纯数据校验（阶段 2 MAP 契约要求的必要校验）
// 只验证数据一致性：地标齐全、出生点合法、导航图连通且边引用有效。
// 坡面/净空/实际行走等物理可通行性由 MOVEMENT 模块与集成阶段负责，这里不做碰撞模拟。
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/physics.js';
import { createNavigation } from '../../src/navigation.js';
import { DESERT_LAYOUT as L } from '../../src/maps/desert-grey-layout.js';

const region = (id) => L.regions.find((r) => r.id === id);
const node = (id) => L.navGraph.nodes.find((n) => n.id === id);
const inExtents = (e, x, z, y = 0) =>
  x >= e.x0 && x <= e.x1 && z >= e.z0 && z <= e.z1 && (e.y0 === undefined || (y >= e.y0 - 0.6 && y <= (e.y1 ?? e.y0) + 2.6));

test('必含地标全部作为报点区域存在且 id 唯一', () => {
  const required = [
    'blSpawn', 'backGarden', 'aDoor', 'aLong', 'aPit', 'aPlatform', 'aShortStairs', 'aShort',
    'mid', 'midDoors', 'underpass', 'grSpawn', 'bTunnelUpper', 'bTunnelLower', 'bDoor', 'bWindow', 'bSite',
  ];
  const ids = L.regions.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, 'region id 不得重复（防止重名掩盖缺失拓扑）');
  for (const id of required) {
    const r = region(id);
    assert.ok(r, `缺少地标区域 ${id}`);
    assert.ok(r.name, `地标 ${id} 缺少名称`);
    assert.ok(L.navGraph.nodes.some((n) => n.region === id), `地标 ${id} 没有任何导航节点（有区域无拓扑）`);
  }
});

test('出生点：数量、有限坐标、界内、落在各自出生区、双方非对称分离', () => {
  for (const team of ['BL', 'GR']) {
    assert.equal(L.spawns[team].length, 10, `${team} 需要 10 个出生点`);
    for (const sp of L.spawns[team]) {
      for (const v of [sp.x, sp.y, sp.z, sp.yaw]) assert.ok(Number.isFinite(v), `${team} 出生点坐标必须有限`);
      const B = L.bounds;
      assert.ok(sp.x > B.x0 && sp.x < B.x1 && sp.z > B.z0 && sp.z < B.z1, `${team} 出生点越界`);
      const r = region(team === 'BL' ? 'blSpawn' : 'grSpawn');
      assert.ok(inExtents(r.extents, sp.x, sp.z, sp.y), `${team} 出生点不在出生区内 (${sp.x},${sp.z})`);
      assert.ok(Number.isFinite(sp.yaw), `${team} 出生点缺少朝向`);
    }
  }
  const cx = (t) => L.spawns[t].reduce((s, p) => s + p.x, 0) / 10;
  const cz = (t) => L.spawns[t].reduce((s, p) => s + p.z, 0) / 10;
  const d = Math.hypot(cx('BL') - cx('GR'), cz('BL') - cz('GR'));
  assert.ok(d > 50, `双方出生质心距离 ${d.toFixed(1)}m，应构成非对称攻防（>50m）`);
  assert.ok(L.spawns.BL.every((p) => p.z > 20) && L.spawns.GR.every((p) => p.z < -20), 'BL 应在南端、GR 应在北端');
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

function bfsFrom(startIds) {
  const adj = new Map();
  for (const e of L.navGraph.edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    if (!adj.has(e.to)) adj.set(e.to, []);
    adj.get(e.from).push(e.to);
    adj.get(e.to).push(e.from);
  }
  const seen = new Set(startIds);
  const q = [...startIds];
  while (q.length) {
    const cur = q.shift();
    for (const nx of adj.get(cur) || []) if (!seen.has(nx)) { seen.add(nx); q.push(nx); }
  }
  return seen;
}
const regionNodes = (id) => L.navGraph.nodes.filter((n) => n.region === id).map((n) => n.id);

test('BL 从出生点可沿图到达 A 平台包点与 B 包点（爆破进攻拓扑）', () => {
  const seen = bfsFrom(regionNodes('blSpawn'));
  for (const goal of L.teamGoals.BL) {
    assert.ok(seen.has(goal), `BL 无法从图上到达目标节点 ${goal}`);
  }
  assert.ok(seen.has('md1'), 'BL 应能到达中门南侧');
  // 进攻路径上不允许出现需要特殊能力的边（本图全部为 walk，防止图说话不算数）
  assert.ok(L.navGraph.edges.every((e) => (e.requires ?? 'walk') === 'walk'), '当前白盒所有边都应为 walk');
});

test('GR 从出生点可到达 A/B 回防枢纽、中门与 A 平台、B 窗（防守/回防拓扑）', () => {
  const seen = bfsFrom(regionNodes('grSpawn'));
  for (const goal of [...L.teamGoals.GR, 'plt2', 'wr3']) {
    assert.ok(seen.has(goal), `GR 无法从图上到达 ${goal}`);
  }
});

test('队首目标与包点数据一致且包点落在对应区域内', () => {
  assert.equal(L.bombSites.length, 2);
  for (const bs of L.bombSites) {
    const r = region(bs.region);
    assert.ok(r, `包点 ${bs.id} 引用未知区域`);
    assert.ok(inExtents(r.extents, bs.x, bs.z, bs.y), `包点 ${bs.id} 位置不在其区域内`);
    for (const v of [bs.x, bs.y, bs.z, bs.radius]) assert.ok(Number.isFinite(v), `包点 ${bs.id} 数据必须有限`);
  }
  for (const [team, goals] of Object.entries(L.teamGoals)) {
    for (const g of goals) assert.ok(node(g), `${team} 目标节点 ${g} 不存在`);
  }
});

test('几何数据：solids/ramps 数值有限、尺寸为正、界内', () => {
  assert.ok(L.solids.length > 100, ' solids 应覆盖全图结构');
  const B = L.bounds;
  for (const s of L.solids) {
    for (const v of [s.x, s.y, s.z, s.sx, s.sy, s.sz]) assert.ok(Number.isFinite(v), `solid ${s.id} 数值必须有限`);
    for (const v of [s.sx, s.sy, s.sz]) assert.ok(v > 0, `solid ${s.id} 尺寸必须为正`);
    assert.ok(s.x - s.sx / 2 > B.x0 - 2 && s.x + s.sx / 2 < B.x1 + 2, `solid ${s.id} X 越界`);
    assert.ok(s.z - s.sz / 2 > B.z0 - 2 && s.z + s.sz / 2 < B.z1 + 2, `solid ${s.id} Z 越界`);
  }
  assert.ok(L.ramps.length >= 2, 'A 大坑需要进出坡道');
  for (const r of L.ramps) {
    assert.ok(['x', 'z'].includes(r.axis), '坡道 axis 非法');
    assert.notEqual(r.y0, r.y1, '坡道两端高度不能相同');
    for (const v of [r.x, r.z, r.sx, r.sz, r.y0, r.y1]) assert.ok(Number.isFinite(v), `ramp ${r.id} 数值必须有限`);
  }
});

test('A 平台入口以连续斜坡衔接地面和包点高台', () => {
  const ramp = L.ramps.find((r) => r.id === 'aPlatformRamp');
  assert.ok(ramp, 'A 平台应有连续斜坡，而非整排直角踏步');
  assert.equal(ramp.axis, 'z');
  assert.equal(ramp.y0, L.meta.levels.upper);
  assert.equal(ramp.y1, L.meta.levels.ground);
  const middle = L.navGraph.nodes.find((n) => n.id === 'plt1');
  assert.ok(Math.abs(middle.y - (ramp.y0 + ramp.y1) / 2) < 0.1);
});

test('潜伏者前院被建筑分成可交火的街巷，中央进攻线仍敞开', () => {
  const world = new World();
  for (const s of L.solids) world.add(s);
  world.build();
  assert.ok(world.raycast(-11, 1.6, 18, 1, 0, 0, 11, 'sight'), '后花园一侧应有建筑遮挡横穿前院的枪线');
  assert.ok(world.raycast(0, 1.6, 18, 1, 0, 0, 10, 'sight'), '中路与 A 向巷道之间应有建筑遮挡');
  assert.ok(world.raycast(10, 1.6, 18, 1, 0, 0, 15, 'sight'), 'A 大入口一侧应有建筑转角');
  assert.equal(world.raycast(0, 1.6, 24, 0, 0, -1, 12, 'sight'), null, '中央前进路线不得被封死');
  assert.equal(world.raycast(10, 1.6, 24, 0, 0, -1, 12, 'sight'), null, 'A 向前进路线不得被封死');
});

test('每一条地图导航边都可被标准角色通过', () => {
  const nav = buildRealNav();
  const agent = { radius: 0.36, height: 1.8, canCrouch: true, canJump: true };
  const blocked = L.navGraph.edges.filter((e) => !nav.canTraverse(e.from, e.to, agent));
  assert.deepEqual(blocked.map((e) => `${e.from}->${e.to}`), []);
});

test('A 平台前缘有内凹转角，包点与斜坡端保持上层支撑', () => {
  const world = new World();
  for (const s of L.solids) world.add(s);
  for (const r of L.ramps) world.addRamp(r);
  world.build();
  assert.equal(world.support(35.5, -22, 0.2, 3)?.y, 0, '平台前缘内凹处应落到地面');
  assert.equal(world.support(39, -22, 0.2, 3)?.y, L.meta.levels.upper, '包点前臂仍需上层支撑');
  assert.equal(world.support(39, -28, 0.2, 3)?.y, L.meta.levels.upper, '包点主台仍需上层支撑');
});

test('真实分层：存在同 XZ 上下共存的两个可行走层（上层地板叠在地面层之上）', () => {
  const floors = L.solids.filter((s) => s.role === 'floor' || s.role === 'struct');
  let stacked = 0;
  for (const a of floors) {
    for (const b of floors) {
      if (a === b) continue;
      const topA = a.y + a.sy / 2, topB = b.y + b.sy / 2;
      if (topA - topB < 2) continue;
      const ox = Math.min(a.x + a.sx / 2, b.x + b.sx / 2) - Math.max(a.x - a.sx / 2, b.x - b.sx / 2);
      const oz = Math.min(a.z + a.sz / 2, b.z + b.sz / 2) - Math.max(a.z - a.sz / 2, b.z - b.sz / 2);
      if (ox > 2 && oz > 2) stacked++;
    }
  }
  assert.ok(stacked > 0, '缺少真实上下叠层（桥/上层坑道必须与下层同 XZ 共存）');
});

test('图边高度合理性：相邻节点高差不超过楼梯/坡道可达范围', () => {
  for (const e of L.navGraph.edges) {
    const a = node(e.from), b = node(e.to);
    assert.ok(Math.abs(a.y - b.y) <= 2.7, `边 ${e.from}->${e.to} 高差 ${Math.abs(a.y - b.y).toFixed(2)} 超过单级楼梯可达范围`);
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
  for (const id of ['blSpawn', 'backGarden', 'aDoor', 'aLong', 'aPit', 'aPlatform', 'aShort', 'mid', 'midDoors',
    'underpass', 'grSpawn', 'bTunnelUpper', 'bTunnelLower', 'bDoor', 'bWindow', 'bSite', 'overview']) {
    assert.ok(ids.includes(id), `缺少机位 ${id}`);
  }
});

test('布局元信息记录了方向约定与估算比例（物理可通行性由集成阶段验证）', () => {
  assert.ok(L.meta.orientation.includes('+X') && L.meta.orientation.includes('-Z'), '需记录坐标方向约定');
  assert.ok(L.meta.scaleNote.length > 10, '需记录估算比例说明');
});

// ================= 真实几何路由校验（MOVEMENT 契约 API + 真实碰撞世界） =================
// 纯图连通 ≠ 真正可走：边会被真实箱体/墙体挡住。这里用真实 World + createNavigation
// 验证「从出生点沿碰撞世界实际走到包点/回防点」，防止图上连通、脚下被断。
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
  return createNavigation(world, {}, { navGraph: L.navGraph });
}
const centroid = (team) => ({
  x: L.spawns[team].reduce((s, p) => s + p.x, 0) / L.spawns[team].length,
  y: 0,
  z: L.spawns[team].reduce((s, p) => s + p.z, 0) / L.spawns[team].length,
});

test('BL 出生点沿真实碰撞世界可走到 A 平台包点与 B 包点', () => {
  const nav = buildRealNav();
  const bl = centroid('BL');
  for (const goal of L.teamGoals.BL) {
    const n = L.navGraph.nodes.find((q) => q.id === goal);
    const path = nav.findPath(bl, { x: n.x, y: n.y, z: n.z });
    assert.ok(path.length > 0, `BL 无法从真实几何走到 ${goal}（图连通但被碰撞拒绝）`);
  }
});

test('GR 出生点沿真实碰撞世界可回防 A 连接/中门/B 连接并上 A 平台、B 窗、B 下层', () => {
  const nav = buildRealNav();
  const gr = centroid('GR');
  for (const goal of [...L.teamGoals.GR, 'plt2', 'wr3', 'lo2']) {
    const n = L.navGraph.nodes.find((q) => q.id === goal);
    const path = nav.findPath(gr, { x: n.x, y: n.y, z: n.z });
    assert.ok(path.length > 0, `GR 无法从真实几何走到 ${goal}`);
  }
});

test('全图节点从 BL 出生点均真实可达（不允许孤岛簇）', () => {
  const nav = buildRealNav();
  const start = 'bl2';
  const adj = new Map();
  for (const e of L.navGraph.edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    if (!adj.has(e.to)) adj.set(e.to, []);
    adj.get(e.from).push(e.to);
    adj.get(e.to).push(e.from);
  }
  const seen = new Set([start]);
  const q = [start];
  while (q.length) {
    const cur = q.shift();
    for (const nx of adj.get(cur) || []) {
      if (seen.has(nx)) continue;
      if (nav.canTraverse(cur, nx)) { seen.add(nx); q.push(nx); }
    }
  }
  const orphans = L.navGraph.nodes.filter((n) => !seen.has(n.id)).map((n) => `${n.id}(${n.region})`);
  assert.equal(orphans.length, 0, `碰撞校验后不可达节点 ${seen.size}/${L.navGraph.nodes.length}：${orphans.join(', ')}`);
});
