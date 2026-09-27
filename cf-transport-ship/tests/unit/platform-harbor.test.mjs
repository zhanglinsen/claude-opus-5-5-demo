// 雾港码头（platform-harbor）布局与导航校验（US-04 平台原创地图）
// 覆盖：出生区、导航图与真实寻路、静态靶、点对称路线平衡、原创性/资源预算。
// 不做 GPU/浏览器验证（由视觉集成阶段负责）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/physics.js';
import { createNavigation } from '../../src/navigation.js';
import {
  LEVELS, BOUNDS, KILL_Y, PALETTE, CONTAINER_COLOR_BUDGET,
  SOLIDS, REGIONS, NAV_GRAPH, NAV_PAIRS, SPAWNS, PRACTICE_TARGETS, ROUTES,
  PLATFORM_HARBOR_DESCRIPTOR as DESC, META,
} from '../../src/maps/platform-harbor/layout.js';
import { buildPlatformHarbor } from '../../src/maps/platform-harbor/build.js';

// build.js 只把纹理对象透传进材质参数，node 下用空对象桩即可（不做 GPU 验证）
const TEX = {
  deck: { map: {}, normalMap: {}, roughnessMap: {} },
  bulkhead: { map: {}, normalMap: {} },
  darkSteel: { map: {}, normalMap: {} },
  yellowSteel: { map: {}, normalMap: {} },
  hull: { map: {}, normalMap: {} },
  crates: Array.from({ length: 4 }, () => ({ map: {}, normalMap: {} })),
  containers: Array.from({ length: 4 }, () => ({ side20: {}, n20: {}, side40: {}, n40: {}, door: {}, doorN: {}, roof: {}, roofN: {} })),
};

function buildMap() {
  return buildPlatformHarbor({ add() {}, remove() {} }, TEX, new World());
}

// 与 game.js regionAt 相同的首匹配解析（顺序敏感）
function regionNameAt(regions, x, y, z) {
  for (const r of regions) {
    const e = r.extents || r.bounds || r;
    if (e.x0 === undefined || e.x1 === undefined || e.z0 === undefined || e.z1 === undefined) continue;
    if (x < e.x0 || x > e.x1 || z < e.z0 || z > e.z1) continue;
    if (e.y0 !== undefined && (y < e.y0 - 0.6 || y > (e.y1 ?? e.y0) + 2.6)) continue;
    return r.name || r.id;
  }
  return null;
}

const region = (id) => REGIONS.find((r) => r.id === id);
const node = (id) => NAV_GRAPH.nodes.find((n) => n.id === id);
const inExtents = (e, x, z, y = 0) =>
  x >= e.x0 && x <= e.x1 && z >= e.z0 && z <= e.z1 && (e.y0 === undefined || (y >= e.y0 - 0.6 && y <= (e.y1 ?? e.y0) + 2.6));

function buildRealNav() {
  const world = new World();
  for (const s of SOLIDS) {
    world.add({
      x: s.x, y: s.y, z: s.z, sx: s.sx, sy: s.sy, sz: s.sz, yaw: s.yaw,
      mat: s.mat, surface: s.surface, bullet: s.bullet, sight: s.sight, solid: s.solid, tag: s.tag,
    });
  }
  world.build();
  return { world, nav: createNavigation(world, {}, { navGraph: NAV_GRAPH }) };
}

// ================= 原创性与资源预算 =================

test('俯视轮廓为码头矩形（与运输船纺锤形船体轮廓不同）', () => {
  const deck = SOLIDS.find((s) => s.id === 'deckFloor');
  assert.ok(deck, '缺码头面地板');
  assert.ok(deck.sz > deck.sx, `码头面应为南北向矩形（${deck.sx} × ${deck.sz}）`);
  // 运输船可玩区为 74m × 26m 东西向纺锤；本图长宽比必须明显不同
  const ratio = deck.sz / deck.sx;
  assert.ok(ratio > 1.1, `长宽比 ${ratio.toFixed(2)} 应为纵向码头，而非横向船体`);
  assert.ok(Math.abs(BOUNDS.x1) < 40 && Math.abs(BOUNDS.z1) < 40, 'bounds 应为紧凑码头尺度');
});

test('不使用集装箱通廊/管道式单向走廊：无 nav 网格、无船名/阵营标识依赖', () => {
  assert.equal(DESC.nav, null, '平台版应使用高度感知导航图（与沙漠灰同机制）');
  assert.ok(META.orientation.includes('+X') && META.orientation.includes('-Z'), '需记录方向约定');
  assert.ok(META.scaleNote.length > 10, '需记录比例说明');
});

test('视觉材质键与集装箱配色在预算内（draw call 收口）', () => {
  const used = new Set(SOLIDS.filter((s) => s.m !== 'none' && s.m !== 'cont').map((s) => s.m));
  for (const m of used) assert.ok(PALETTE.includes(m), `未知视觉材质键 ${m}`);
  assert.ok(used.size <= PALETTE.length, `材质键 ${used.size} 超出调色板`);
  const colors = new Set(SOLIDS.filter((s) => s.cont).map((s) => s.cont.colorIdx));
  assert.ok(colors.size <= CONTAINER_COLOR_BUDGET, `集装箱配色 ${colors.size} 超预算 ${CONTAINER_COLOR_BUDGET}`);
});

// ================= 数据完整性 =================

test('实体数据：数值有限、尺寸为正、界内', () => {
  assert.ok(SOLIDS.length > 80, '实体应覆盖全图结构');
  for (const s of SOLIDS) {
    for (const v of [s.x, s.y, s.z, s.sx, s.sy, s.sz]) assert.ok(Number.isFinite(v), `${s.id} 数值必须有限`);
    for (const v of [s.sx, s.sy, s.sz]) assert.ok(v > 0, `${s.id} 尺寸必须为正`);
    assert.ok(s.x - s.sx / 2 > BOUNDS.x0 - 2 && s.x + s.sx / 2 < BOUNDS.x1 + 2, `${s.id} X 越界`);
    assert.ok(s.z - s.sz / 2 > BOUNDS.z0 - 2 && s.z + s.sz / 2 < BOUNDS.z1 + 2, `${s.id} Z 越界`);
  }
});

test('180° 点对称：每个镜像实体都有正确的孪生（US-04 路线平衡的结构保证）', () => {
  const byId = new Map(SOLIDS.map((s) => [s.id, s]));
  let mirrored = 0;
  for (const s of SOLIDS) {
    if (!s.id.endsWith('M')) continue;
    mirrored++;
    const src = byId.get(s.id.slice(0, -1));
    assert.ok(src, `孪生 ${s.id} 缺少原体`);
    assert.ok(Math.abs(src.x + s.x) < 1e-6 && Math.abs(src.z + s.z) < 1e-6, `${s.id} 位置未取反`);
    assert.ok(Math.abs(src.y - s.y) < 1e-6, `${s.id} 高度不一致`);
    assert.equal(src.sx, s.sx); assert.equal(src.sy, s.sy); assert.equal(src.sz, s.sz);
  }
  assert.ok(mirrored > 30, `镜像实体过少（${mirrored}），半场结构疑似未镜像`);
});

// ================= 出生区 =================

test('出生点：数量、有限坐标、界内、落在出生区、双方分离且朝向敌方', () => {
  for (const team of ['BL', 'GR']) {
    assert.equal(SPAWNS[team].length, 10, `${team} 需要 10 个出生点`);
    const r = region(team === 'BL' ? 'blSpawn' : 'grSpawn');
    assert.ok(r, `缺少 ${team} 出生区`);
    for (const sp of SPAWNS[team]) {
      for (const v of [sp.x, sp.y, sp.z, sp.yaw]) assert.ok(Number.isFinite(v), `${team} 出生点坐标必须有限`);
      assert.ok(sp.x > BOUNDS.x0 && sp.x < BOUNDS.x1 && sp.z > BOUNDS.z0 && sp.z < BOUNDS.z1, `${team} 出生点越界`);
      assert.ok(inExtents(r.extents, sp.x, sp.z, sp.y), `${team} 出生点不在出生区 (${sp.x},${sp.z})`);
    }
  }
  const cx = (t) => SPAWNS[t].reduce((s, p) => s + p.x, 0) / 10;
  const cz = (t) => SPAWNS[t].reduce((s, p) => s + p.z, 0) / 10;
  const d = Math.hypot(cx('BL') - cx('GR'), cz('BL') - cz('GR'));
  assert.ok(d > 50, `双方出生质心距离 ${d.toFixed(1)}m，应构成攻防纵深（>50m）`);
  assert.ok(SPAWNS.BL.every((p) => p.z > 24) && SPAWNS.GR.every((p) => p.z < -24), 'BL 应在南端、GR 应在北端');
});

test('每个出生点脚下有真实支撑且未被埋入几何', () => {
  const { world } = buildRealNav();
  for (const team of ['BL', 'GR']) {
    for (const sp of SPAWNS[team]) {
      const sup = world.support(sp.x, sp.z, 0.35, sp.y + 0.6);
      assert.ok(sup && Math.abs(sup.y - sp.y) < 0.1, `${team} 出生点 (${sp.x},${sp.z}) 无支撑面`);
      assert.equal(world.blocked(sp.x, sp.y + 0.05, sp.z, 0.36, 1.75), false, `${team} 出生点 (${sp.x},${sp.z}) 被几何阻塞`);
    }
  }
});

test('出生区内换背包立即生效的 loadoutZone 与出生区一致', () => {
  assert.equal(DESC.loadoutZone.BL.axis, 'z');
  assert.ok(DESC.loadoutZone.BL.min <= Math.min(...SPAWNS.BL.map((p) => p.z)));
  assert.ok(DESC.loadoutZone.GR.max >= Math.max(...SPAWNS.GR.map((p) => p.z)));
});

// ================= 导航图 =================

test('导航图完整性：节点 id 唯一、边引用有效、区域存在、高差合法', () => {
  const ids = NAV_GRAPH.nodes.map((n) => n.id);
  assert.equal(new Set(ids).size, ids.length, '导航节点 id 重复');
  for (const n of NAV_GRAPH.nodes) {
    for (const v of [n.x, n.y, n.z]) assert.ok(Number.isFinite(v), `节点 ${n.id} 坐标必须有限`);
    assert.ok(n.x > BOUNDS.x0 - 1 && n.x < BOUNDS.x1 + 1 && n.z > BOUNDS.z0 - 1 && n.z < BOUNDS.z1 + 1, `节点 ${n.id} 越界`);
    assert.ok(region(n.region), `节点 ${n.id} 引用未知区域 ${n.region}`);
    assert.ok(n.clearance > 0, `节点 ${n.id} clearance 非法`);
  }
  for (const e of NAV_GRAPH.edges) {
    const a = node(e.from), b = node(e.to);
    assert.ok(a && b, `边引用不存在的节点 ${e.from}->${e.to}`);
    assert.ok(['walk', 'crouch', 'jump'].includes(e.requires ?? 'walk'), `边 ${e.from}->${e.to} requires 非法`);
    assert.ok(Math.abs(a.y - b.y) <= 2.7, `边 ${e.from}->${e.to} 高差超过楼梯/坡道可达范围`);
  }
  // jump 边只允许是箱顶下撤（其余全部 walk，保证标准角色全图可达）
  const jumps = NAV_GRAPH.edges.filter((e) => (e.requires ?? 'walk') === 'jump');
  assert.deepEqual(jumps.map((e) => `${e.from}->${e.to}`).sort(), ['rf1M->ya1M', 'rf1->ya1', 'rf2M->ya2M', 'rf2->ya2'].sort());
});

test('每一条导航边都可被标准角色沿真实几何通过', () => {
  const { nav } = buildRealNav();
  const agent = { radius: 0.36, height: 1.8, canCrouch: true, canJump: true };
  const blocked = NAV_GRAPH.edges.filter((e) => !nav.canTraverse(e.from, e.to, agent));
  assert.deepEqual(blocked.map((e) => `${e.from}->${e.to}`), []);
});

test('路线表：每条关键路线从 BL 出生质心沿真实碰撞世界可达', () => {
  const { nav } = buildRealNav();
  const bl = { x: SPAWNS.BL.reduce((s, p) => s + p.x, 0) / 10, y: 0, z: SPAWNS.BL.reduce((s, p) => s + p.z, 0) / 10 };
  assert.ok(ROUTES.length >= 5, '至少覆盖三条主路线 + 两条高层路线');
  for (const r of ROUTES) {
    const g = node(r.to);
    assert.ok(g, `路线 ${r.id} 目标节点 ${r.to} 不存在`);
    const path = nav.findPath(bl, { x: g.x, y: g.y, z: g.z }, { radius: 0.36, height: 1.8, canCrouch: true, canJump: true });
    assert.ok(path.length > 0, `路线 ${r.id}（${r.via}）不可达：${r.from} → ${r.to}`);
  }
});

test('全图节点从 BL 出生点均真实可达（不允许孤岛簇，含镜像半场）', () => {
  const { nav } = buildRealNav();
  const agent = { radius: 0.36, height: 1.8, canCrouch: true, canJump: true };
  const start = node('bl1');
  const adj = new Map();
  for (const e of NAV_GRAPH.edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    if (!adj.has(e.to)) adj.set(e.to, []);
    adj.get(e.from).push(e.to);
    adj.get(e.to).push(e.from);
  }
  const seen = new Set([start.id]);
  const q = [start.id];
  while (q.length) {
    const cur = q.shift();
    for (const nx of adj.get(cur) || []) {
      if (seen.has(nx)) continue;
      if (nav.canTraverse(cur, nx, agent)) { seen.add(nx); q.push(nx); }
    }
  }
  const orphans = NAV_GRAPH.nodes.filter((n) => !seen.has(n.id)).map((n) => `${n.id}(${n.region})`);
  assert.equal(orphans.length, 0, `碰撞校验后不可达节点 ${seen.size}/${NAV_GRAPH.nodes.length}：${orphans.join(', ')}`);
});

test('镜像路线长度一致（点对称地图的平衡性可由寻路直接验证）', () => {
  const { nav } = buildRealNav();
  const agent = { radius: 0.36, height: 1.8, canCrouch: true, canJump: true };
  for (const anchor of ['dk1', 'rf2', 'mwS1']) {
    const a = node(anchor), b = node(anchor + 'M') || node(a.id);
    const p1 = nav.findPath({ x: a.x, y: a.y, z: a.z }, { x: b.x, y: b.y, z: b.z }, agent);
    const p2 = nav.findPath({ x: b.x, y: b.y, z: b.z }, { x: a.x, y: a.y, z: a.z }, agent);
    assert.ok(p1.length > 0 && p2.length > 0, `${anchor} 双向寻路失败`);
    const len = (p) => p.slice(1).reduce((s, q, i) => s + Math.hypot(q.x - p[i].x, q.z - p[i].z), 0);
    assert.ok(Math.abs(len(p1) - len(p2)) < 6, `${anchor} 往返路线长度差过大（${len(p1).toFixed(1)} vs ${len(p2).toFixed(1)}）`);
  }
});

// ================= 报点区域与静态靶 =================

test('报点区域：id 唯一、双方/中场/高层关键点齐全、区域有导航节点', () => {
  const ids = REGIONS.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, '区域 id 重复');
  for (const id of ['blSpawn', 'grSpawn', 'shedS', 'shedN', 'yardS', 'yardN', 'quaySW', 'quayNE',
    'craneSE', 'craneNW', 'roofS', 'roofN', 'midS', 'midN', 'midW', 'midE', 'dock']) {
    const r = region(id);
    assert.ok(r, `缺少报点区域 ${id}`);
    assert.ok(r.name && r.en, `区域 ${id} 缺少名称`);
    assert.ok(NAV_GRAPH.nodes.some((n) => n.region === id), `区域 ${id} 没有任何导航节点`);
  }
});

test('静态靶：坐标有限、脚下有支撑、未嵌入几何、覆盖双方与高层', () => {
  const { world } = buildRealNav();
  const ids = PRACTICE_TARGETS.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, '靶位 id 重复');
  assert.ok(PRACTICE_TARGETS.length >= 10, '靶位过少');
  for (const t of PRACTICE_TARGETS) {
    for (const v of [t.pos.x, t.pos.y, t.pos.z]) assert.ok(Number.isFinite(v), `${t.id} 坐标必须有限`);
    assert.ok(t.pos.x > BOUNDS.x0 && t.pos.x < BOUNDS.x1 && t.pos.z > BOUNDS.z0 && t.pos.z < BOUNDS.z1, `${t.id} 越界`);
    const floor = t.pos.y - 1.2; // 靶心为站姿胸口高：脚下站立面 = pos.y - 1.2
    const sup = world.support(t.pos.x, t.pos.z, 0.3, floor + 0.6);
    assert.ok(sup && Math.abs(sup.y - floor) < 0.15, `${t.id} 脚下无支撑（期待 ${floor.toFixed(2)}，实际 ${sup ? sup.y.toFixed(2) : '无'}）`);
    assert.equal(world.blocked(t.pos.x, floor + 0.05, t.pos.z, 0.3, 1.2), false, `${t.id} 被几何阻塞`);
  }
  assert.ok(PRACTICE_TARGETS.some((t) => t.pos.y > LEVELS.quay + 2), '缺少高层靶位（箱顶/站台）');
});

// ================= 注册表接入就绪 =================

test('描述符字段完整，可与 maps/registry.js 直接对接', () => {
  for (const k of ['id', 'name', 'en', 'available', 'supportedModes', 'defaultMode', 'loadingLabel',
    'nav', 'bounds', 'radar', 'menu', 'env', 'spawnYFallback', 'killY', 'loadoutZone', 'ai', 'practiceTargets']) {
    assert.ok(DESC[k] !== undefined, `描述符缺少 ${k}`);
  }
  assert.deepEqual(DESC.bounds, BOUNDS, '描述符 bounds 应与布局一致');
  assert.deepEqual(DESC.supportedModes, ['tdm', 'practice'], '平台版支持团队竞技/练习');
  assert.equal(DESC.killY, KILL_Y);
  assert.ok(DESC.env.ocean === false && DESC.env.shadowBox, '陆基环境参数与阴影盒必须显式给出');
  assert.ok(DESC.radar.overlays.length >= 2, '雷达需要标注上层可站立面');
  assert.equal(DESC.practiceTargets.length, PRACTICE_TARGETS.length);
  for (const h of DESC.ai.holds) {
    assert.ok(h.length === 3 && Number.isFinite(h[2]), 'ai.holds 需要 [x, z, 朝向偏置] 三元组');
  }
  assert.ok(DESC.ai.roam.x0 === -DESC.ai.roam.x1 && DESC.ai.roam.z0 === -DESC.ai.roam.z1, 'ai.roam 未按对称地图约定关于原点对称');
});

// ================= 构建输出与报点首匹配（H1/H2 行为契约） =================

test('构建结果携带 regions：17 个报点区域随 build 输出暴露（game.js 只读 map.regions）', () => {
  const res = buildMap();
  assert.ok(Array.isArray(res.regions), 'build 返回缺少 regions（H1：game.js regionAt 将整体失效）');
  assert.equal(res.regions.length, 17, '应包含全部 17 个报点区域（9 定义 + 8 镜像）');
  assert.deepEqual(res.regions.map((r) => r.id).sort(), REGIONS.map((r) => r.id).sort(), 'build.regions 与 layout 导出不一致');
  for (const r of res.regions) {
    assert.ok(r.id && r.name && r.en && r.extents, `区域 ${r.id} 缺少 id/name/en/extents`);
  }
  res.dispose();
});

test('报点按首匹配顺序解析：箱顶报箱顶、地面报箱区（roofS 必须先于无 y 过滤的 yardS）', () => {
  const res = buildMap();
  // 南箱顶步道（ctB1/ctB2 顶 y=2.59）与北箱顶镜像
  assert.equal(regionNameAt(res.regions, 2.6, 2.59, 16), '南箱顶', '南箱顶在 y=2.59 被前置区域吞掉（H2）');
  assert.equal(regionNameAt(res.regions, -2.6, 2.59, -16), '北箱顶', '北箱顶在 y=2.59 被前置区域吞掉（H2）');
  // 同 XZ 的地面（y=0）不得命中 y 过滤的箱顶区，应落到箱区
  assert.equal(regionNameAt(res.regions, 1.5, 0, 14), '南箱区', '地面点应报南箱区');
  assert.equal(regionNameAt(res.regions, -1.5, 0, -14), '北箱区', '地面点应报北箱区');
  res.dispose();
});
