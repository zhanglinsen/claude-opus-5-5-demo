import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/physics.js';
import { DESERT_LAYOUT as L } from '../../src/maps/desert-grey-layout.js';

// 中门木门弹道校验（公共行为：用真实 DESERT_LAYOUT solids/ramps 构建碰撞世界后走 World.raycastAll）
// 缺陷背景：midDoorWallL/R 混凝土墙（x[-6,-0.7]/[0.7,6] 全高 0..4.2）完全覆盖了两侧
// 木门扇（x[-2.7,-0.7]/[0.7,2.7]，y[0,2.6]）的孔径，射向木门的子弹先撞上不可穿透混凝土。
// 期望行为：木门孔径内先命中可穿透木门扇；侧混凝土门框/门楣仍阻挡；中缝 1.4m 敞开。

function buildDesertWorld() {
  const world = new World();
  for (const s of L.solids) {
    world.add({
      x: s.x, y: s.y, z: s.z, sx: s.sx, sy: s.sy, sz: s.sz, yaw: s.yaw || 0,
      mat: s.mat, surface: s.surface, bullet: s.bullet, sight: s.sight, solid: s.solid, tag: s.tag || s.role,
    });
  }
  for (const r of L.ramps) world.addRamp(r);
  world.build();
  return world;
}

function fmt(hits) {
  return hits.map((h) => h.collider.tag + '@' + h.t.toFixed(2)).join(', ');
}

test('南向北射击左侧木门扇：先命中可穿透木门而非混凝土', () => {
  const world = buildDesertWorld();
  // 站在中门正南（x=-1.7 在左门扇 x[-2.7,-0.7] 中央，y=1.62 约胸口高度）朝北开枪
  const hits = world.raycastAll(-1.7, 1.62, -20, 0, 0, -1, 8);
  assert.ok(hits.length > 0, '射线应命中木门扇');
  assert.equal(hits[0].collider.mat, 'wood', '首个命中应是木门扇，实际 ' + hits[0].collider.mat);
  assert.equal(hits[0].collider.bullet, 'pen', '木门扇应可被子弹穿透');
  assert.ok(Math.abs(hits[0].t - 3.85) < 1e-6, '木门扇迎弹面 t 应为 3.85（z=-23.85），实际 ' + hits[0].t);
  assert.ok(!hits.some((h) => h.collider.bullet === 'block' && h.t < 5), '门孔径内不得先遇到混凝土阻挡：' + fmt(hits));
});

test('北向南射击两侧木门扇：先命中可穿透木门而非混凝土', () => {
  const world = buildDesertWorld();
  for (const x of [-1.7, 1.7]) {
    const hits = world.raycastAll(x, 1.62, -28, 0, 0, 1, 8);
    assert.ok(hits.length > 0, 'x=' + x + ' 射线应命中木门扇');
    assert.equal(hits[0].collider.mat, 'wood', 'x=' + x + ' 首个命中应是木门扇，实际 ' + hits[0].collider.mat);
    assert.equal(hits[0].collider.bullet, 'pen', 'x=' + x + ' 木门扇应可被子弹穿透');
    assert.ok(Math.abs(hits[0].t - 3.85) < 1e-6, 'x=' + x + ' 木门扇迎弹面 t 应为 3.85（z=-24.15），实际 ' + hits[0].t);
    assert.ok(
      !hits.some((h) => h.collider.bullet === 'block' && h.t < 5),
      'x=' + x + ' 门孔径内不得先遇到混凝土阻挡：' + fmt(hits),
    );
  }
});

test('门框与门楣混凝土仍然阻挡弹道', () => {
  const world = buildDesertWorld();
  // 左侧混凝土门框（midDoorWallL 现在 x[-6,-2.7]）全高保留
  const jamb = world.raycastAll(-4, 1.62, -20, 0, 0, -1, 8);
  assert.ok(jamb.length > 0 && jamb[0].collider.bullet === 'block', '左侧门框应阻挡子弹');
  assert.ok(Math.abs(jamb[0].t - 3.8) < 1e-6, '门框迎弹面 t 应为 3.8（z=-23.8），实际 ' + jamb[0].t);
  // 右侧门框对称
  const jambR = world.raycastAll(4, 1.62, -20, 0, 0, -1, 8);
  assert.ok(jambR.length > 0 && jambR[0].collider.bullet === 'block', '右侧门框应阻挡子弹');
  // 门楣（y 2.6..4.2）在门扇上方仍封死
  const lintel = world.raycastAll(0, 3.4, -20, 0, 0, -1, 8);
  assert.ok(lintel.length > 0 && lintel[0].collider.bullet === 'block', '门楣应阻挡子弹');
  assert.ok(Math.abs(lintel[0].t - 3.8) < 1e-6, '门楣迎弹面 t 应为 3.8（z=-23.8），实际 ' + lintel[0].t);
});

test('中门 1.4m 中缝（x[-0.7,0.7]）对弹道敞开，木门扇仍阻挡移动', () => {
  const world = buildDesertWorld();
  const gap = world.raycastAll(0, 1.62, -20, 0, 0, -1, 8);
  assert.equal(gap.length, 0, '中缝内 8m 内不得有任何命中：' + fmt(gap));
  // 木门扇保持移动碰撞（role door，solid）
  const moveL = world.raycast(-1.7, 1.62, -20, 0, 0, -1, 8, 'move');
  assert.ok(moveL && moveL.collider.mat === 'wood', '左门扇应仍是移动实体');
  const moveR = world.raycast(1.7, 1.62, -20, 0, 0, -1, 8, 'move');
  assert.ok(moveR && moveR.collider.mat === 'wood', '右门扇应仍是移动实体');
});

test('南向北射击右侧木门扇：先命中可穿透木门而非混凝土', () => {
  const world = buildDesertWorld();
  const hits = world.raycastAll(1.7, 1.62, -20, 0, 0, -1, 8);
  assert.ok(hits.length > 0, '射线应命中木门扇');
  assert.equal(hits[0].collider.mat, 'wood', '首个命中应是木门扇，实际 ' + hits[0].collider.mat);
  assert.equal(hits[0].collider.bullet, 'pen', '木门扇应可被子弹穿透');
  assert.ok(Math.abs(hits[0].t - 3.85) < 1e-6, '木门扇迎弹面 t 应为 3.85（z=-23.85），实际 ' + hits[0].t);
  assert.ok(!hits.some((h) => h.collider.bullet === 'block' && h.t < 5), '门孔径内不得先遇到混凝土阻挡：' + fmt(hits));
});
