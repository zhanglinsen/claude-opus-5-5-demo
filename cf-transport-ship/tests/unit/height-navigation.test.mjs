// 阶段 2 高度感知物理与导航（node --test，纯 JS fixture，不依赖 three/DOM）
// 覆盖：坡道行走/楔形射线、叠加楼层与低净空、图导航的阻断/可通行边、运输船 NavGrid 适配。
import test from 'node:test';
import assert from 'node:assert/strict';
import { World, NavGrid } from '../../src/physics.js';
import { createNavigation } from '../../src/navigation.js';

const DT = 1 / 60;

function ground(w, x0, x1, z0, z1, top = 0) {
  return w.add({ x: (x0 + x1) / 2, y: top - 0.5, z: (z0 + z1) / 2, sx: x1 - x0, sy: 1, sz: z1 - z0, mat: 'concrete', surface: 'stone', tag: 'ground' });
}

function makeEnt(w, x, y, z) {
  return { pos: { x, y, z }, vel: { x: 0, y: 0, z: 0 }, radius: 0.4, height: 1.75, onGround: true, stepHeight: 0.42 };
}

// 施加重力与水平速度走 n 帧
function walk(w, ent, vx, vz, frames) {
  for (let f = 0; f < frames; f++) {
    ent.vel.x = vx; ent.vel.z = vz; ent.vel.y -= 18 * DT;
    w.move(ent, DT);
  }
}

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============ 坡道碰撞 ============

test('坡道：胶囊沿斜面平滑上升登上上层，再平滑下降回到地面', () => {
  const w = new World();
  ground(w, -20, 30, -10, 10);
  w.addRamp({ x: 5, z: 0, sx: 4, sz: 3, y0: 0, y1: 2, axis: 'x' }); // x 3..7，0→2
  w.add({ x: 12, y: 1.8, z: 0, sx: 10, sy: 0.4, sz: 6 });           // 上层 x 7..17 top 2.0
  w.build();
  const ent = makeEnt(w, 1, 0.02, 0);
  let minY = 9, maxY = -9, everAir = false;
  for (let f = 0; f < 300; f++) {
    walk(w, ent, 3, 0, 1);
    minY = Math.min(minY, ent.pos.y); maxY = Math.max(maxY, ent.pos.y);
    if (!ent.onGround) everAir = true;
  }
  assert.ok(ent.pos.x > 8, '应走上层平台，x=' + ent.pos.x.toFixed(2));
  assert.ok(Math.abs(ent.pos.y - 2) < 0.05, '应到达上层高度，y=' + ent.pos.y.toFixed(3));
  assert.ok(maxY <= 2.05 && minY >= -0.01, '高度应贴合坡面无跳变，min=' + minY.toFixed(3) + ' max=' + maxY.toFixed(3));
  assert.ok(!everAir, '上坡过程不应离地');
  assert.ok(ent.onGround);
  // 下降
  let f2 = 0;
  while (ent.pos.x > 1 && f2++ < 300) walk(w, ent, -3, 0, 1);
  assert.ok(ent.pos.x < 2 && Math.abs(ent.pos.y) < 0.05 && ent.onGround, '应落回地面，x=' + ent.pos.x.toFixed(2) + ' y=' + ent.pos.y.toFixed(3));
});

test('坡道下方可正常通行（高处楔形不提供假支撑也不阻挡）', () => {
  const w = new World();
  ground(w, -10, 20, -10, 10);
  w.addRamp({ x: 5, z: 0, sx: 4, sz: 3, y0: 2.6, y1: 3.6, axis: 'x' }); // 底 2.3，脚下净空足够
  w.build();
  const ent = makeEnt(w, 1, 0.02, 0);
  walk(w, ent, 3, 0, 220);
  assert.ok(ent.pos.x > 10, '应从楔形下方穿过，x=' + ent.pos.x.toFixed(2));
  assert.ok(Math.abs(ent.pos.y) < 0.05, '不应被抬到楔形顶，y=' + ent.pos.y.toFixed(3));
  assert.ok(ent.onGround);
});

test('楔形射线：坡顶上方视线/子弹穿过，命中坡面与侧壁的位置和法线正确', () => {
  const w = new World();
  w.addRamp({ x: 5, z: 0, sx: 4, sz: 3, y0: 0, y1: 2, axis: 'x' }); // x 3..7，h(x)=(x-3)/2
  w.build();
  // 高于坡顶最高点（2.0）的水平射线：整个包围盒都不该挡（旧 OBB 行为会在 t=5 处误挡）
  assert.equal(w.raycast(-2, 2.5, 0, 1, 0, 0, 30, 'sight'), null);
  // y=1.5 → 命中坡面 x=6，t=8，法线朝上偏 -x
  const h1 = w.raycast(-2, 1.5, 0, 1, 0, 0, 30, 'bullet');
  assert.ok(h1 && Math.abs(h1.t - 8) < 0.01, '命中坡面 t=' + (h1 && h1.t));
  assert.ok(h1.ny > 0.85 && h1.nx < -0.3 && Math.abs(h1.nz) < 0.01, '坡面法线 n=' + [h1.nx, h1.ny, h1.nz].map((v) => v.toFixed(2)));
  // 侧壁
  const h2 = w.raycast(5, 0.5, -5, 0, 0, 1, 30, 'bullet');
  assert.ok(h2 && Math.abs(h2.t - 3.5) < 0.01 && h2.nz < -0.99, '侧壁命中 t=' + (h2 && h2.t));
  // 起点在楔形内
  const h3 = w.raycast(5, 0.5, 0, 1, 0, 0, 30, 'bullet');
  assert.ok(h3 && h3.t === 0, '楔内起点 t=0');
  // raycastAll 同样按楔形求交
  const all = w.raycastAll(-2, 2.5, 0, 1, 0, 0, 30);
  assert.equal(all.length, 0, '坡顶上方 raycastAll 不应命中');
});

test('叠加楼层：上下层各自支撑、脚下互不干扰，低净空挡站立不挡蹲姿，起跳顶头受限', () => {
  const w = new World();
  ground(w, -15, 15, -10, 10);
  w.add({ x: -5, y: 2.4, z: 0, sx: 10, sy: 0.4, sz: 20 }); // 上层 x -10..0 top 2.6
  w.add({ x: 5, y: 1.35, z: 7, sx: 10, sy: 0.3, sz: 6 });  // 低顶 x 0..10 z 4..10 bottom 1.2
  w.build();
  // 支撑查询按 maxY 区分层
  assert.equal(w.support(-5, 0, 0.4, 3).y, 2.6);
  assert.equal(w.support(-5, 0, 0.4, 1).y, 0);
  // 低净空
  assert.equal(w.blocked(5, 0.05, 7, 0.36, 1.75), true);
  assert.equal(w.blocked(5, 0.05, 7, 0.36, 1.0), false);
  // 上层下净空 2.2m，站立不挡
  assert.equal(w.blocked(-5, 0.05, 0, 0.36, 1.75), false);
  // 上层行走保持高度，走出边缘后自然坠落（坠落路径避开低顶区）
  const ent = makeEnt(w, -5, 2.6, 0);
  walk(w, ent, 2, 0, 60);
  assert.ok(ent.onGround && Math.abs(ent.pos.y - 2.6) < 0.02, '上层行走不应掉落/吸附，y=' + ent.pos.y.toFixed(3));
  walk(w, ent, 2, 0, 150);
  assert.ok(ent.pos.x > 0.5 && Math.abs(ent.pos.y) < 0.05 && ent.onGround, '走出边缘应落地，x=' + ent.pos.x.toFixed(2) + ' y=' + ent.pos.y.toFixed(3));
  // 低顶下（蹲姿高度）起跳顶头
  const j = makeEnt(w, 5, 0.02, 7);
  j.height = 1.0;
  j.vel.y = 6; w.move(j, DT);
  for (let f = 0; f < 20; f++) w.move(j, DT);
  assert.ok(j.vel.y <= 0.01, '顶头后垂直速度清零');
  assert.ok(j.pos.y + 1.0 <= 1.2 + 0.01, '头顶不应穿入低顶，y=' + j.pos.y.toFixed(3));
});

// ============ 图导航（高度感知） ============

// 双层 fixture：南/北地面被墙隔开（门洞 x 5.4..7.2），西端上层平台由坡道连接，
// 南侧有低顶蹲行通道（bottom 1.2），北端 gN 放在坡道足迹之外。
function buildFixtureWorld() {
  const w = new World();
  w.add({ x: 0, y: -0.5, z: 0, sx: 20, sy: 1, sz: 20 });
  w.add({ x: -6, y: 2.6, z: 0, sx: 8, sy: 0.4, sz: 20 });              // 上层 x -10..-2 top 2.8
  w.addRamp({ x: 1, z: 6, sx: 6, sz: 3, y0: 2.8, y1: 0, axis: 'x' });  // x -2..4
  w.add({ x: -2.3, y: 1.5, z: 0, sx: 15.4, sy: 3, sz: 0.4 });          // 墙 x -10..5.4
  w.add({ x: 8.6, y: 1.5, z: 0, sx: 2.8, sy: 3, sz: 0.4 });            // 墙 x 7.2..10
  w.add({ x: 0, y: 1.35, z: -8, sx: 6, sy: 0.3, sz: 4 });              // 低顶 x -3..3 z -10..-6
  w.build();
  return w;
}

const FIXTURE_NODES = [
  { id: 'gS', x: 2, y: 0, z: -5, clearance: 0.6, region: 'south' },
  { id: 'door', x: 6.3, y: 0, z: 0, clearance: 0.6, region: 'mid' },
  { id: 'gN', x: 2, y: 0, z: 3, clearance: 0.6, region: 'north' },
  { id: 'rampB', x: 5, y: 0, z: 6, clearance: 0.6, region: 'north' },
  { id: 'rampT', x: -2, y: 2.8, z: 6, clearance: 0.6, region: 'upper' },
  { id: 'uS', x: -6, y: 2.8, z: 5, clearance: 0.6, region: 'upper' },
  { id: 'uN', x: -6, y: 2.8, z: -5, clearance: 0.6, region: 'upper' },
  { id: 'cW', x: -6, y: 0, z: -8, clearance: 0.6, region: 'south' },
  { id: 'cE', x: 6, y: 0, z: -8, clearance: 0.6, region: 'south' },
  { id: 'gW', x: -6, y: 0, z: -3, clearance: 0.6, region: 'south' },
  { id: 'gE', x: 6, y: 0, z: -3, clearance: 0.6, region: 'south' },
];

const FIXTURE_EDGES = [
  { from: 'gS', to: 'door', width: 1.6 },
  { from: 'door', to: 'gN', width: 1.6 },
  { from: 'gN', to: 'rampB', width: 1.6 },
  { from: 'rampB', to: 'rampT', width: 1.6 },
  { from: 'rampT', to: 'uS', width: 1.6 },
  { from: 'uS', to: 'uN', width: 1.6 },
  { from: 'gS', to: 'gN', width: 1.6 },                    // 直接穿墙 → 几何校验必须拒绝
  { from: 'gS', to: 'uN', width: 1.6 },                    // 低→高跨层 → 必须拒绝
  { from: 'cW', to: 'cE', width: 1.6, requires: 'crouch' }, // 低顶通道
  { from: 'gS', to: 'gW', width: 1.6 },
  { from: 'gW', to: 'cW', width: 1.6 },
  { from: 'cE', to: 'gE', width: 1.6 },
  { from: 'gE', to: 'door', width: 1.6 },
  { from: 'gE', to: 'gS', width: 1.6 },
];

const AGENT = { radius: 0.36, height: 1.55, canCrouch: true, canJump: true };

test('图导航：地面到上层只经坡道连接，端点各自吸附到正确的可达层', () => {
  const nav = createNavigation(buildFixtureWorld(), {}, { navGraph: { nodes: FIXTURE_NODES, edges: FIXTURE_EDGES } });
  assert.equal(nav.kind, 'graph');
  const p = nav.findPath({ x: 2, y: 0, z: -5 }, { x: -6, y: 2.8, z: -5 }, AGENT);
  assert.ok(p.length >= 4, '应有多路径点，实际 ' + p.length);
  assert.ok(Math.abs(p[0].x - 2) < 0.1 && Math.abs(p[0].y) < 0.1, '起点吸附地面层');
  const last = p[p.length - 1];
  assert.ok(Math.abs(last.y - 2.8) < 0.1 && Math.abs(last.x + 6) < 0.1, '终点吸附上层，y=' + last.y);
  // 高度只在坡道边（rampB→rampT）变化，不允许其它位置“瞬移”跨层
  for (let i = 1; i < p.length; i++) {
    if (Math.abs(p[i].y - p[i - 1].y) > 0.7) {
      assert.equal(p[i - 1].nodeId, 'rampB', '跨层只能发生在坡道边，实际在 ' + (p[i - 1].nodeId || 'pt'));
    }
  }
  const ids = p.map((q) => q.nodeId).filter(Boolean);
  assert.ok(ids.includes('rampT'), '应经过坡顶结点');
});

test('图导航：穿墙直连边被拒绝，路径必须绕门洞；只剩穿墙边时不可达', () => {
  const w = buildFixtureWorld();
  const nav = createNavigation(w, {}, { navGraph: { nodes: FIXTURE_NODES, edges: FIXTURE_EDGES } });
  assert.equal(nav.canTraverse('gS', 'gN', AGENT), false, '穿墙边必须被几何校验拒绝');
  const p = nav.findPath({ x: 2, y: 0, z: -5 }, { x: 2, y: 0, z: 3 }, AGENT);
  const ids = p.map((q) => q.nodeId).filter(Boolean);
  assert.ok(ids.includes('door'), '必须绕经门洞，路径 ' + ids.join(','));
  const blockedOnly = createNavigation(w, {}, {
    navGraph: {
      nodes: FIXTURE_NODES.filter((n) => n.id === 'gS' || n.id === 'gN'),
      edges: [{ from: 'gS', to: 'gN', width: 1.6 }],
    },
  });
  assert.deepEqual(blockedOnly.findPath({ x: 2, y: 0, z: -5 }, { x: 2, y: 0, z: 3 }, AGENT), [], '只剩穿墙边应不可达');
});

test('图导航：跨层伪边被拒绝；蹲行边按 canCrouch 准入；窄边按宽度准入', () => {
  const w = buildFixtureWorld();
  const nav = createNavigation(w, {}, { navGraph: { nodes: FIXTURE_NODES, edges: FIXTURE_EDGES } });
  assert.equal(nav.canTraverse('gS', 'uN', AGENT), false, '跨层边必须被拒绝');
  const levelOnly = createNavigation(w, {}, { navGraph: { nodes: FIXTURE_NODES.slice(0, 7), edges: [{ from: 'gS', to: 'uN', width: 1.6 }] } });
  assert.deepEqual(levelOnly.findPath({ x: 2, y: 0, z: -5 }, { x: -6, y: 2.8, z: -5 }, AGENT), [], '只剩跨层边应不可达');

  assert.equal(nav.canTraverse('cW', 'cE', AGENT), true, '蹲行通道对可蹲 agent 开放');
  assert.equal(nav.canTraverse('cW', 'cE', { ...AGENT, canCrouch: false }), false, '不可蹲 agent 被拒绝');
  assert.equal(nav.canTraverse('cW', 'cE', { ...AGENT, radius: 0.9 }), false, '超宽 agent 被拒绝');
});

test('图导航：randomFree 返回真实可站立面且尊重边界', () => {
  const nav = createNavigation(buildFixtureWorld(), {}, { navGraph: { nodes: FIXTURE_NODES, edges: FIXTURE_EDGES } });
  const rnd = mulberry32(20260926);
  const w = buildFixtureWorld();
  for (let i = 0; i < 30; i++) {
    const p = nav.randomFree(rnd);
    assert.ok(p, '应返回位置');
    const sup = w.support(p.x, p.z, 0.3, p.y + 0.8);
    assert.ok(sup && Math.abs(sup.y - p.y) < 0.7, '返回点应站得住：' + JSON.stringify(p));
    assert.equal(w.blocked(p.x, p.y + 0.05, p.z, 0.3, 1.5), false, '返回点应有净空');
  }
  const inB = nav.randomFree(rnd, { x0: -8, z0: -6, x1: 0, z1: 8 });
  assert.ok(inB && inB.x >= -8 && inB.x <= 0 && inB.z >= -6 && inB.z <= 8, '边界过滤生效');
  assert.equal(nav.randomFree(rnd, { x0: 40, z0: 40, x1: 41, z1: 41 }), null, '边界外无结点返回 null');
});

// ============ 运输船适配 ============

function buildShipWorld() {
  const w = new World();
  w.add({ x: 0, y: -0.5, z: 0, sx: 20, sy: 1, sz: 10 });      // 甲板 top 0
  w.add({ x: -5.5, y: 1.5, z: 0, sx: 9, sy: 3, sz: 0.6 });    // 舱壁 x -10..-1
  w.add({ x: 5.5, y: 1.5, z: 0, sx: 9, sy: 3, sz: 0.6 });     // 舱壁 x 1..10（门洞 x -1..1）
  w.build();
  return w;
}

const SHIP_DESC = {
  id: 'transport-ship',
  nav: { x0: -9, z0: -4, x1: 9, z1: 4, cell: 0.5, agentR: 0.42 },
  bounds: { x0: -10, z0: -4.5, x1: 10, z1: 4.5 },
};

test('运输船适配：同一 findPath/randomFree 接口，y 保持甲板 0，穿舱壁走门洞', () => {
  const nav = createNavigation(buildShipWorld(), SHIP_DESC, null);
  assert.equal(nav.kind, 'grid');
  const p = nav.findPath({ x: -8, y: 0, z: -2 }, { x: 8, y: 0, z: 2 });
  assert.ok(p.length >= 2, '应找到路径');
  assert.ok(p.every((q) => q.y === 0), '运输船导航保持 y=0');
  assert.ok(Math.abs(p[0].x + 8) < 1 && Math.abs(p[p.length - 1].x - 8) < 1, '起终点正确');
  assert.ok(p.some((q) => Math.abs(q.x) < 1.6 && Math.abs(q.z) < 1.2), '应穿过门洞附近');
  const rnd = mulberry32(7);
  for (let i = 0; i < 10; i++) {
    const q = nav.randomFree(rnd, { x0: -8, z0: -3, x1: 8, z1: 3 });
    assert.ok(q && q.y === 0 && q.x >= -9 && q.x <= 9 && q.z >= -4 && q.z <= 4, 'randomFree 返回甲板面内位置');
  }
});

test('运输船：legacy NavGrid 公有行为不变（数字签名、[x,z] 数组路径）', () => {
  const w = buildShipWorld();
  const grid = new NavGrid(w, -9, -4, 9, 4, 0.5, 0.42);
  const p = grid.findPath(-8, -2, 8, -2);
  assert.ok(Array.isArray(p) && p.length >= 2, 'legacy findPath 返回 [x,z] 数组');
  assert.ok(Array.isArray(p[0]) && p[0].length === 2, '路径点为 [x,z]');
  const rnd = mulberry32(11);
  const q = grid.randomFree(rnd, -8, -3, 8, 3);
  assert.ok(Array.isArray(q) && q.length === 2, 'legacy randomFree 返回 [x,z]');
});
