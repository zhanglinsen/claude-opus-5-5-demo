// C 路：射线宽阶段搜索（沿线段逐列访问网格）的差分与性能验证。
// node --test 纯 JS；oracle 有两个：
//   1) 基线 c40d4bd 冻结的旧 AABB query/raycast/raycastAll（验证顺序/等距/边界逐位一致）；
//   2) 独立朴素全量精确碰撞（不经过网格，验证命中集合与 t 的绝对正确性）。
// 全部随机射线用确定性 mulberry32，可复现。
import test from 'node:test';
import assert from 'node:assert/strict';
import { World, Ramp } from '../../src/physics.js';

const CELL = 4;

// ===== 冻结的基线实现（与 c40d4bd 逐行等价，仅显式传入 world）=====
function oldQuery(w, minX, minZ, maxX, maxZ) {
  const out = w._cand; out.length = 0;
  const st = ++w.stamp;
  const x0 = Math.floor(minX / CELL), x1 = Math.floor(maxX / CELL);
  const z0 = Math.floor(minZ / CELL), z1 = Math.floor(maxZ / CELL);
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    const arr = w.grid.get(x * 1000 + z);
    if (!arr) continue;
    for (const c of arr) {
      if (c.stamp === st) continue;
      c.stamp = st;
      if (c.maxX < minX || c.minX > maxX || c.maxZ < minZ || c.minZ > maxZ) continue;
      out.push(c);
    }
  }
  return out;
}

function oldRaycast(w, ox, oy, oz, dx, dy, dz, maxT, mode = 'bullet', out = {}) {
  const ex = ox + dx * maxT, ez = oz + dz * maxT;
  const cands = oldQuery(w, Math.min(ox, ex) - 0.1, Math.min(oz, ez) - 0.1, Math.max(ox, ex) + 0.1, Math.max(oz, ez) + 0.1);
  let best = maxT, hit = null;
  const r = {};
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i];
    if (mode === 'bullet' && c.bullet === 'pass') continue;
    if (mode === 'sight' && !c.sight) continue;
    if (mode === 'move' && !c.solid) continue;
    const struck = c.isRamp
      ? Ramp.rayWedge(c, ox, oy, oz, dx, dy, dz, best, r)
      : World.rayOBB(c, ox, oy, oz, dx, dy, dz, best, r);
    if (struck && r.t < best) {
      best = r.t; hit = c;
      out.nx = r.nx; out.ny = r.ny; out.nz = r.nz; out.exit = r.exit;
    }
  }
  if (!hit) return null;
  out.t = best; out.collider = hit;
  return out;
}

function oldRaycastAll(w, ox, oy, oz, dx, dy, dz, maxT) {
  const ex = ox + dx * maxT, ez = oz + dz * maxT;
  const cands = oldQuery(w, Math.min(ox, ex) - 0.1, Math.min(oz, ez) - 0.1, Math.max(ox, ex) + 0.1, Math.max(oz, ez) + 0.1);
  const hits = [];
  const r = {};
  for (const c of cands) {
    if (c.bullet === 'pass') continue;
    const struck = c.isRamp
      ? Ramp.rayWedge(c, ox, oy, oz, dx, dy, dz, maxT, r)
      : World.rayOBB(c, ox, oy, oz, dx, dy, dz, maxT, r);
    if (struck) hits.push({ t: r.t, exit: r.exit, nx: r.nx, ny: r.ny, nz: r.nz, collider: c });
  }
  hits.sort((a, b) => a.t - b.t);
  return hits;
}

// ===== 独立朴素 oracle：全量遍历 colliders，不经过网格与扫描顺序 =====
function naiveRaycast(w, ox, oy, oz, dx, dy, dz, maxT, mode = 'bullet') {
  let best = maxT, hit = null;
  const r = {};
  for (const c of w.colliders) {
    if (mode === 'bullet' && c.bullet === 'pass') continue;
    if (mode === 'sight' && !c.sight) continue;
    if (mode === 'move' && !c.solid) continue;
    const struck = c.isRamp
      ? Ramp.rayWedge(c, ox, oy, oz, dx, dy, dz, maxT, r)
      : World.rayOBB(c, ox, oy, oz, dx, dy, dz, maxT, r);
    if (struck && r.t < best) { best = r.t; hit = c; }
  }
  return hit ? { t: best, collider: hit } : null;
}

// ===== 测试场景：轴对齐/旋转 OBB、坡道、多格大碰撞体、负坐标、
// 特性 collider（pass/sight:false/solid:false/pen）、压在 4m 网格线与角点上的物体 =====
function buildScene(w) {
  w.add({ x: 0, y: -0.5, z: 0, sx: 220, sy: 1, sz: 220, mat: 'concrete', surface: 'stone', tag: 'ground' });
  // 纵贯多格长墙：首格远离射线裁剪点，考验跨格去重与 clamp 排序
  w.add({ x: 0, y: 2, z: -30, sx: 1.2, sy: 4, sz: 60, mat: 'concrete', tag: 'long-wall' });
  // 压在网格线/角点上的板条箱
  w.add({ x: 9, y: 1, z: 9, sx: 2, sy: 2, sz: 2, mat: 'wood', tag: 'crate-corner' }); // x∈[8,10] z∈[8,10]
  w.add({ x: -7, y: 1, z: 5, sx: 2, sy: 2, sz: 2, mat: 'wood' });                     // x∈[-8,-6] 跨 x=-8
  // 角点擦擦专用箱：仅占 (x∈[6,8], z∈[8,10]) 象限（角点遍历回归用）
  w.add({ x: 7, y: 1, z: 9, sx: 2, sy: 2, sz: 2, mat: 'metal', tag: 'corner-quadrant' });
  // 旋转 OBB
  w.add({ x: -14, y: 1.5, z: 18, sx: 6, sy: 3, sz: 2, yaw: 0.4, mat: 'metal' });
  w.add({ x: 18, y: 2, z: -14, sx: 3, sy: 4, sz: 3, yaw: -1.1, mat: 'wood' });
  w.add({ x: -22, y: 1, z: -22, sx: 4, sy: 2, sz: 4, yaw: Math.PI / 4, mat: 'wood' });
  // 坡道（两种轴向 + 旋转）
  w.addRamp({ x: 12, z: 20, sx: 8, sz: 3, yaw: 0.2, axis: 'x', y0: 0, y1: 2.5, mat: 'stone' });
  w.addRamp({ x: -18, z: 6, sx: 3, sz: 10, yaw: Math.PI / 2, axis: 'z', y0: 1.8, y1: 0, mat: 'stone' });
  // 楼板 + 柱
  w.add({ x: 24, y: 3, z: 24, sx: 12, sy: 0.4, sz: 12, mat: 'concrete' });
  w.add({ x: 24, y: 1.5, z: 24, sx: 1, sy: 3, sz: 1, mat: 'metal' });
  // 特性 collider
  w.add({ x: 4, y: 1.5, z: -12, sx: 0.2, sy: 3, sz: 8, mat: 'mesh', bullet: 'pass', tag: 'glass' });
  w.add({ x: -10, y: 1.5, z: 30, sx: 10, sy: 3, sz: 0.2, mat: 'mesh', sight: false, tag: 'fence' });
  w.add({ x: 30, y: 1.5, z: 0, sx: 2, sy: 3, sz: 2, mat: 'wood', solid: false, tag: 'decor' });
  w.add({ x: 14, y: 1.5, z: -4, sx: 0.3, sy: 3, sz: 6, mat: 'wood', bullet: 'pen' });
  // 负坐标群
  w.add({ x: -32, y: 1, z: -34, sx: 3, sy: 2, sz: 3, mat: 'concrete' });
  w.add({ x: -28, y: 1.2, z: -30, sx: 2, sy: 2.4, sz: 2, yaw: 0.9, mat: 'metal' });
  w.addRamp({ x: -36, z: -28, sx: 6, sz: 3, axis: 'x', y0: 0, y1: 1.6 });
  w.build();
  return w;
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

// 确定性射线集：随机 + 网格线/角点/轴对齐/竖直/极短/最远端/非单位方向
function genRays() {
  const rnd = mulberry32(20260929);
  const rays = [];
  const boundary = [0, 4, -4, 8, -8, 12, -12, 0.0001, -0.0001, 7.9999, 8.0001];
  for (let i = 0; i < 1000; i++) {
    const ox = (rnd() - 0.5) * 90, oy = 0.2 + rnd() * 7, oz = (rnd() - 0.5) * 90;
    let dx = rnd() * 2 - 1, dy = rnd() * 1.2 - 0.6, dz = rnd() * 2 - 1;
    const L = Math.hypot(dx, dy, dz) || 1;
    dx /= L; dy /= L; dz /= L;
    const maxT = rnd() < 0.15 ? 0.05 + rnd() * 2 : rnd() * 140;
    rays.push([ox, oy, oz, dx, dy, dz, maxT]);
  }
  const dirs = [
    [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0],
    [1, 0, 1], [1, 0, -1], [-1, 0, 1], [-1, 0, -1], [0.995, 0.02, 0.995], [1, 0.5, 0],
  ];
  const origins = [
    [8, 1, 8], [-4, 1, 12], [0, 1, 0], [-30, 1, -30], [7.9, 1, 7.9], [8.0001, 1, 8.0001],
    [-0.001, 3, 4], [30, 1.7, 30], [-10.6, 1, -20], [9, 1, 9], [7, 1, 9], [-22, 1, -22],
    [0, 4.2, 0], [9, 1.01, 9],
  ];
  for (const d of dirs) {
    const L = Math.hypot(d[0], d[1], d[2]);
    for (const o of origins) {
      for (const maxT of [0, 0.05, 0.5, 6, 40, 130]) {
        rays.push([o[0], o[1], o[2], d[0] / L, d[1] / L, d[2] / L, maxT]);
      }
    }
  }
  // 非单位方向（API 按 t 参数语义，允许任意长度方向）
  for (let i = 0; i < 60; i++) {
    let dx = rnd() * 2 - 1, dy = rnd() * 1.2 - 0.6, dz = rnd() * 2 - 1;
    const L = (Math.hypot(dx, dy, dz) || 1) / (1.5 + rnd() * 3);
    rays.push([(rnd() - 0.5) * 60, 0.5 + rnd() * 5, (rnd() - 0.5) * 60, dx / L, dy / L, dz / L, rnd() * 60]);
  }
  // 起点严格压在物体表面上/网格边界上
  for (const bx of boundary) for (const bz of [0, 8, -8, 4]) {
    rays.push([bx, 1, bz, 1, 0, 0.03, 30]);
    rays.push([bx, 1, bz, -1, 0, -0.03, 30]);
    rays.push([bx, 1, bz, 0, 0, 1, 30]);
  }
  return rays;
}

const MODES = ['bullet', 'sight', 'move'];

function assertSameHit(a, b, msg) {
  if (a === null || b === null) {
    assert.equal(a, b, msg + '（null 一致性）');
    return;
  }
  assert.equal(a.t, b.t, msg + '（t）');
  assert.equal(a.exit, b.exit, msg + '（exit）');
  assert.equal(a.nx, b.nx, msg + '（nx）');
  assert.equal(a.ny, b.ny, msg + '（ny）');
  assert.equal(a.nz, b.nz, msg + '（nz）');
  assert.equal(a.collider, b.collider, msg + '（collider 身份）');
}

test('差分：三种 mode 下与冻结旧实现逐位一致（含 raycastAll 顺序）', () => {
  const w = buildScene(new World());
  const rays = genRays();
  for (let i = 0; i < rays.length; i++) {
    const [ox, oy, oz, dx, dy, dz, maxT] = rays[i];
    for (const mode of MODES) {
      const got = w.raycast(ox, oy, oz, dx, dy, dz, maxT, mode, {});
      const want = oldRaycast(w, ox, oy, oz, dx, dy, dz, maxT, mode, {});
      assertSameHit(got, want, `ray#${i} mode=${mode}`);
    }
    const gotAll = w.raycastAll(ox, oy, oz, dx, dy, dz, maxT);
    const wantAll = oldRaycastAll(w, ox, oy, oz, dx, dy, dz, maxT);
    assert.equal(gotAll.length, wantAll.length, `ray#${i} raycastAll 命中数`);
    for (let j = 0; j < gotAll.length; j++) {
      assertSameHit(gotAll[j], wantAll[j], `ray#${i} raycastAll[${j}]`);
    }
  }
});

test('差分：与朴素全量精确碰撞 oracle 的命中集合与 t 一致', () => {
  const w = buildScene(new World());
  const rays = genRays();
  for (let i = 0; i < rays.length; i++) {
    const [ox, oy, oz, dx, dy, dz, maxT] = rays[i];
    for (const mode of MODES) {
      const got = w.raycast(ox, oy, oz, dx, dy, dz, maxT, mode, {});
      const want = naiveRaycast(w, ox, oy, oz, dx, dy, dz, maxT, mode);
      if (want === null) assert.equal(got, null, `ray#${i} mode=${mode} 不应命中`);
      else {
        assert.notEqual(got, null, `ray#${i} mode=${mode} 漏检`);
        assert.equal(got.t, want.t, `ray#${i} mode=${mode} t 偏差`);
      }
    }
    const all = w.raycastAll(ox, oy, oz, dx, dy, dz, maxT);
    for (let j = 1; j < all.length; j++) assert.ok(all[j].t >= all[j - 1].t, `ray#${i} raycastAll 未按 t 升序`);
  }
});

test('定向：射线恰穿过网格角点时，被跳过象限内的命中体不漏检', () => {
  const w = buildScene(new World());
  // corner-quadrant 箱仅占 x∈[6,8], z∈[8,10]；射线 (6,1,6)+(1,0,1) 恰经角点 (8,8)，t=2 处擦中箱角
  const hit = w.raycast(6, 1, 6, 1, 0, 1, 20, 'bullet', {});
  const want = oldRaycast(w, 6, 1, 6, 1, 0, 1, 20, 'bullet', {});
  assert.notEqual(hit, null, '角点擦碰命中体被宽阶段漏检');
  assert.equal(hit.t, 2);
  assert.equal(hit.collider.tag, 'corner-quadrant');
  assertSameHit(hit, want, '角点擦碰与旧实现');
  // 反向对角：起点恰压在 crate-corner 的边界角上（t=0 视为盒内命中），角点擦碰仍由旧路径命中
  const hit2 = w.raycast(10, 1, 10, -1, 0, -1, 20, 'bullet', {});
  assert.notEqual(hit2, null, '反向角点漏检');
  assert.equal(hit2.t, 0);
  assert.equal(hit2.collider.tag, 'crate-corner');
  assertSameHit(hit2, oldRaycast(w, 10, 1, 10, -1, 0, -1, 20, 'bullet', {}), '反向角点与旧实现');
  // 角点附近的反向斜射：从 (9.9,1,6.1) 沿 (-0.9,0,-0.1) 仍应与旧实现逐位一致
  const hit3 = w.raycast(9.9, 1, 6.1, -0.9, 0, -0.1, 20, 'bullet', {});
  assertSameHit(hit3, oldRaycast(w, 9.9, 1, 6.1, -0.9, 0, -0.1, 20, 'bullet', {}), '斜向角点与旧实现');
});

test('定向：等距命中的赢家与 raycastAll 顺序和旧扫描一致', () => {
  const w = new World();
  // 两箱共面 x∈[0,4]，z 向堆叠共享 z=2 边；沿 +x、z=2 的射线对两者等 t 命中
  const k = w.add({ x: 2, y: 1, z: 1, sx: 4, sy: 2, sz: 2, mat: 'metal' }); // z∈[0,2]
  const m = w.add({ x: 2, y: 1, z: 3, sx: 4, sy: 2, sz: 2, mat: 'wood' });  // z∈[2,4]
  w.build();
  const hit = w.raycast(-1, 1, 2, 1, 0, 0, 10, 'bullet', {});
  assert.notEqual(hit, null);
  assert.equal(hit.collider, k, '等距命中应取旧扫描顺序中的前者（先构建者）');
  const all = w.raycastAll(-1, 1, 2, 1, 0, 0, 10);
  assert.equal(all.length, 2);
  assert.equal(all[0].collider, k);
  assert.equal(all[1].collider, m);
  assert.equal(all[0].t, all[1].t);
  // 反方向从 +x 进入时旧扫描顺序不变，赢家仍是先构建者
  const hit2 = w.raycast(5, 1, 2, -1, 0, 0, 10, 'bullet', {});
  assert.equal(hit2.collider, k);
});

test('定向：起点在物体内/穿透多命中/最远端边界/极短射线', () => {
  const w = buildScene(new World());
  // 起点在物体内：t=0 命中，身份一致
  const inside = w.raycast(9, 1, 9, 1, 0, 0, 5, 'bullet', {});
  assert.equal(inside.t, 0);
  assert.equal(inside.collider.tag, 'crate-corner');
  assertSameHit(inside, oldRaycast(w, 9, 1, 9, 1, 0, 0, 5, 'bullet', {}), '起点在物体内');
  // 穿透：pen 板 + 其后墙体，raycastAll 按进出次序排列，exit > t
  const penAll = w.raycastAll(20, 1.2, -4, -1, 0, 0, 30);
  assertSameHitList(penAll, oldRaycastAll(w, 20, 1.2, -4, -1, 0, 0, 30));
  assert.equal(penAll.length, 2, '应命中 pen 板与其后的长墙各一条');
  assert.equal(penAll[0].collider.bullet, 'pen');
  assert.equal(penAll[1].collider.tag, 'long-wall');
  for (const h of penAll) assert.ok(h.exit >= h.t - 1e-12, 'exit 不得小于 t');
  assert.ok(penAll[0].exit > penAll[0].t, '穿透板应有 exit > t');
  // 最远端：旧契约是 t < maxT 严格比较——恰在 maxT 上的命中被丢弃，maxT 略大时命中
  const edge = w.raycast(-10.6, 1, -20, 1, 0, 0, 10, 'bullet', {});
  assert.equal(edge, null, '恰在 maxT 上的命中按旧契约丢弃');
  assertSameHit(oldRaycast(w, -10.6, 1, -20, 1, 0, 0, 10, 'bullet', {}), null, 'maxT 边界与旧实现一致');
  const edge2 = w.raycast(-10.6, 1, -20, 1, 0, 0, 10.0001, 'bullet', {});
  assert.notEqual(edge2, null, 'maxT 略大于命中面时应命中');
  assert.equal(edge2.t, 10);
  assert.equal(edge2.collider.tag, 'long-wall');
  assertSameHit(edge2, oldRaycast(w, -10.6, 1, -20, 1, 0, 0, 10.0001, 'bullet', {}), '最远端命中与旧实现');
  // 极短射线/零长度：t=0 不满足 t < maxT 严格比较，按旧契约丢弃
  assert.equal(w.raycast(50, 1, 50, 1, 0, 0, 0.01, 'bullet', {}), null);
  const zero = w.raycast(9, 1, 9, 0, 0, 0, 0, 'bullet', {});
  assert.equal(zero, null, '零长度射线按旧契约丢弃');
  assertSameHit(zero, oldRaycast(w, 9, 1, 9, 0, 0, 0, 0, 'bullet', {}), '零长度与旧实现');
  // 竖直射线：向上命中楼板顶面 y=3.2（起点避开楼板柱）
  const up = w.raycast(26, 1.9, 26, 0, 1, 0, 5, 'sight', {});
  assert.notEqual(up, null);
  assert.ok(Math.abs(up.t - 0.9) < 1e-9, `竖直命中楼板底面，实际 t=${up.t}`); // 自下而上先命中 y=2.8
  assertSameHit(up, oldRaycast(w, 26, 1.9, 26, 0, 1, 0, 5, 'sight', {}), '竖直视线');
});

function assertSameHitList(a, b, msg = 'raycastAll 列表') {
  assert.equal(a.length, b.length, msg + ' 长度');
  for (let i = 0; i < a.length; i++) assertSameHit(a[i], b[i], `${msg}[${i}]`);
}

test('性能：长对角射线格子访问数显著下降，短轴向射线不明显恶化', () => {
  const w = buildScene(new World());
  const count = (fn) => {
    const grid = w.grid, orig = grid.get;
    let n = 0;
    grid.get = (k) => { n++; return orig.call(grid, k); };
    try { fn(); } finally { grid.get = orig; }
    return n;
  };
  // 长对角视线（AI 横穿地图的典型射线）
  const diag = () => w.raycast(-48, 1.6, -48, Math.SQRT1_2, 0, Math.SQRT1_2, 140, 'sight', {});
  const oldDiag = count(() => oldRaycast(w, -48, 1.6, -48, Math.SQRT1_2, 0, Math.SQRT1_2, 140, 'sight', {}));
  const newDiag = count(diag);
  assert.ok(newDiag * 5 < oldDiag, `长对角格子访问应下降 5 倍以上：old=${oldDiag} new=${newDiag}`);
  // 短轴向射线：新旧应基本持平
  const axialOld = count(() => oldRaycast(w, -40, 1, 2, 1, 0, 0, 80, 'sight', {}));
  const axialNew = count(() => w.raycast(-40, 1, 2, 1, 0, 0, 80, 'sight', {}));
  assert.ok(axialNew <= axialOld + 4, `短轴向射线访问数不应恶化：old=${axialOld} new=${axialNew}`);
  // 竖直射线：两者都只访问起点格附近
  const vertOld = count(() => oldRaycast(w, 3.9, 5, 3.9, 0, 1, 0, 10, 'sight', {}));
  const vertNew = count(() => w.raycast(3.9, 5, 3.9, 0, 1, 0, 10, 'sight', {}));
  assert.ok(vertNew <= vertOld + 4, `竖直射线访问数不应恶化：old=${vertOld} new=${vertNew}`);
});

// ===== 真实地图差分：港口（构建器）+ 两张沙漠（layout 碰撞体），与冻结旧实现逐位一致 =====
import { DESERT_LAYOUT } from '../../src/maps/desert-grey-layout.js';
import { PLATFORM_DESERT_LAYOUT } from '../../src/maps/platform-desert/layout.js';
import { buildPlatformHarbor } from '../../src/maps/platform-harbor/build.js';

function layoutWorld(L) {
  const w = new World();
  for (const s of L.solids) {
    w.add({
      x: s.x, y: s.y, z: s.z, sx: s.sx, sy: s.sy, sz: s.sz, yaw: s.yaw || 0,
      mat: s.mat, surface: s.surface, bullet: s.bullet, sight: s.sight, solid: s.solid, tag: s.tag || s.role,
    });
  }
  for (const r of L.ramps || []) w.addRamp(r);
  w.build();
  return w;
}
function harborWorld() {
  const tex = {
    deck: { map: {}, normalMap: {}, roughnessMap: {} },
    bulkhead: { map: {}, normalMap: {} }, darkSteel: { map: {}, normalMap: {} },
    yellowSteel: { map: {}, normalMap: {} }, hull: { map: {}, normalMap: {} },
    crates: Array.from({ length: 4 }, () => ({ map: {}, normalMap: {} })),
    containers: Array.from({ length: 4 }, () => ({ side20: {}, n20: {}, side40: {}, n40: {}, door: {}, doorN: {}, roof: {}, roofN: {} })),
  };
  const w = new World();
  buildPlatformHarbor({ add() {}, remove() {} }, tex, w);
  return w;
}

function diffWorld(name, w, seed) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const c of w.colliders) {
    if (c.maxX - c.minX > 150 || c.maxZ - c.minZ > 150) continue; // 地面等超大板不参与定界
    minX = Math.min(minX, c.minX); maxX = Math.max(maxX, c.maxX);
    minZ = Math.min(minZ, c.minZ); maxZ = Math.max(maxZ, c.maxZ);
  }
  const rnd = mulberry32(seed);
  const px = () => minX + rnd() * (maxX - minX), pz = () => minZ + rnd() * (maxZ - minZ);
  let n = 0, hits = 0;
  for (let i = 0; i < 3000; i++) {
    const ox = px(), oy = 0.3 + rnd() * 6, oz = pz();
    let dx, dy, dz, maxT;
    if (i % 3 === 0) { // AI 视线/射击：两点连线
      const tx = px(), ty = 0.3 + rnd() * 6, tz = pz();
      dx = tx - ox; dy = ty - oy; dz = tz - oz;
      maxT = Math.hypot(dx, dy, dz) || 1; dx /= maxT; dy /= maxT; dz /= maxT;
    } else if (i % 3 === 1) { // 轴向/网格线上的射线
      const a = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]][i % 6];
      [dx, dy, dz] = a; maxT = rnd() * 120;
    } else {
      dx = rnd() * 2 - 1; dy = rnd() * 1.2 - 0.6; dz = rnd() * 2 - 1;
      const L = Math.hypot(dx, dy, dz) || 1; dx /= L; dy /= L; dz /= L; maxT = rnd() * 140;
    }
    for (const mode of MODES) {
      const got = w.raycast(ox, oy, oz, dx, dy, dz, maxT, mode, {});
      if (got) hits++;
      assertSameHit(got, oldRaycast(w, ox, oy, oz, dx, dy, dz, maxT, mode, {}), `${name} ray#${i} mode=${mode}`);
    }
    assertSameHitList(w.raycastAll(ox, oy, oz, dx, dy, dz, maxT), oldRaycastAll(w, ox, oy, oz, dx, dy, dz, maxT), `${name} ray#${i} raycastAll`);
    n++;
  }
  assert.ok(hits > n, `${name} 差分样本应有足量命中（hits=${hits}）`);
}

test('真实地图差分：港口/经典沙漠/平台沙漠与冻结旧实现逐位一致', () => {
  diffWorld('platform-harbor', harborWorld(), 101);
  diffWorld('desert-grey', layoutWorld(DESERT_LAYOUT), 202);
  diffWorld('platform-desert', layoutWorld(PLATFORM_DESERT_LAYOUT), 303);
});
