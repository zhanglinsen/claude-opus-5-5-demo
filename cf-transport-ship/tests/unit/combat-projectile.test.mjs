// 投掷物运动核心边界测试（node --test，纯运动，无 DOM/Three/时钟/随机）。
// 只测公开 API 上的可观察行为：抛物线运动、反弹衰减、引信到期、边界初速与确定性，
// 不断言内部常数；世界碰撞用最小平面 raycast 注入（与 Game 的 {t,nx,ny,nz} 命中约定一致）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { GrenadeProjectile, computeThrowVelocity, PROJECTILE_DEFAULTS } from '../../src/combat/projectile.js';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// 现役手感常数封死：这些数值与 game.js 的 updateNades/throwGrenade 逐位对齐（审核探针实证），
// 改动任何一个都会破坏与现役手感的等价性，必须显式失败提醒同步 game.js。
test('PROJECTILE_DEFAULTS 与现役手感常数一致', () => {
  assert.deepEqual({ ...PROJECTILE_DEFAULTS }, {
    gravity: 14, substeps: 3, skin: 0.07,
    bounceNormal: 0.2475, bounceTangent: 0.55,
    restNormalY: 0.7, restVy: 1.2, rollFriction: 0.8, sleepSpeed: 0.05,
  });
});

// y=0 地板 / x=1 竖墙的最小世界
const floor = (pos, dir, len) => {
  if (dir.y >= 0) return null;
  const t = -pos.y / dir.y;
  return t <= len ? { t: Math.max(0, t), nx: 0, ny: 1, nz: 0 } : null;
};
const wall = (pos, dir, len) => {
  if (dir.x <= 0) return null;
  const t = (1 - pos.x) / dir.x;
  return t <= len ? { t: Math.max(0, t), nx: -1, ny: 0, nz: 0 } : null;
};

test('自由抛体：水平匀速、竖直受重力加速，结果确定可复现', () => {
  const p = new GrenadeProjectile({ pos: { x: 0, y: 10, z: 0 }, vel: { x: 4, y: 0, z: -3 }, fuse: 5 });
  const before = { ...p.vel };
  p.step(0.5, () => null);
  assert.ok(close(p.pos.x, 2), `水平应匀速前进 4*0.5=2，实际 ${p.pos.x}`);
  assert.ok(close(p.vel.x, before.x) && close(p.vel.z, before.z), '重力只作用于竖直方向');
  assert.ok(p.vel.y < before.y - 5, `竖直速度应按重力下降，实际 ${p.vel.y}`);
  // 半隐式积分：下落量介于解析解 g*t²/2 与全步欧拉 g*t² 之间
  assert.ok(p.pos.y < 10 - 0.5 * 14 * 0.25 && p.pos.y > 10 - 14 * 0.25, `应下落 1.75~3.5m，实际 ${10 - p.pos.y}`);

  const again = new GrenadeProjectile({ pos: { x: 0, y: 10, z: 0 }, vel: { x: 4, y: 0, z: -3 }, fuse: 5 });
  const ev2 = again.step(0.5, () => null);
  assert.deepEqual(again.pos, p.pos, '同初值同步长必须逐位一致');
  assert.deepEqual(again.vel, p.vel);
  assert.deepEqual(ev2, []);
});

test('反弹：法向翻转且衰减、切向按比例保留，并发出 bounce 事件', () => {
  const p = new GrenadeProjectile({ pos: { x: 0, y: 2, z: 0 }, vel: { x: 4, y: -8, z: 0 }, fuse: 5 });
  const events = p.step(0.2, floor);
  const bounce = events.filter((e) => e.type === 'bounce');
  assert.ok(bounce.length >= 1, '应有 bounce 事件');
  assert.equal(bounce[0].normal.y, 1);
  assert.ok(p.vel.y > 0, '法向速度应反向弹起');
  assert.ok(Math.abs(p.vel.y) < 8, '法向速度应衰减');
  assert.ok(p.vel.x > 0 && p.vel.x < 4, '切向速度应保留但衰减');
  assert.ok(bounce[0].impactSpeed > 0);
});

test('撞墙：法向（水平 x）分量反向衰减，竖直分量保持朝下（切向整体衰减与现役一致）', () => {
  const p = new GrenadeProjectile({ pos: { x: 0.5, y: 2, z: 0 }, vel: { x: 5, y: -3, z: 1 }, fuse: 5 });
  const vyBefore = p.vel.y;
  p.step(0.12, wall);
  assert.ok(p.vel.x < 0, '撞墙后应背向墙面');
  assert.ok(Math.abs(p.vel.x) < 5, '法向反弹衰减');
  assert.ok(p.vel.y < 0 && Math.abs(p.vel.y) < Math.abs(vyBefore), '竖直分量仍朝下且随切向整体衰减');
});

test('引信到期：fuse 事件带最终位置，此后不再运动也不再发事件', () => {
  const p = new GrenadeProjectile({ pos: { x: 0, y: 1, z: 0 }, vel: { x: 4, y: 0, z: 0 }, fuse: 0.5 });
  let events = p.step(0.3, () => null);
  assert.equal(p.done, false);
  assert.ok(!events.some((e) => e.type === 'fuse'));
  events = p.step(0.3, () => null);
  assert.equal(p.done, true);
  assert.equal(events.filter((e) => e.type === 'fuse').length, 1);
  assert.deepEqual(events[events.length - 1].pos, p.pos, 'fuse 事件应携带引爆位置');
  const pos = { ...p.pos };
  assert.deepEqual(p.step(1, () => null), [], '到期后步进无事件');
  assert.deepEqual(p.pos, pos, '到期后位置冻结');
});

test('零初速下落：在地板上弹跳衰减至静止，rest 事件恰好一次且贴近地面', () => {
  const p = new GrenadeProjectile({ pos: { x: 0, y: 2, z: 0 }, vel: { x: 0, y: 0, z: 0 }, fuse: 10 });
  let restEvents = 0;
  for (let i = 0; i < 40 && !p.done; i++) {
    restEvents += p.step(0.1, floor).filter((e) => e.type === 'rest').length;
    if (p.atRest) break;
  }
  assert.equal(restEvents, 1, 'rest 事件恰好发出一次');
  assert.equal(p.atRest, true);
  assert.equal(p.vel.y, 0, '静止时竖直速度清零');
  assert.ok(p.pos.y > -0.3 && p.pos.y < 0.3, `应停在地面附近，实际 y=${p.pos.y}`);
  assert.ok(p.fuse > 0, '静止不等于引爆，引信仍在走');
});

test('大初速边界：无 NaN，长距离匀速段位移与速度成正比', () => {
  const p = new GrenadeProjectile({ pos: { x: 0, y: 20, z: 0 }, vel: { x: 40, y: 2, z: -10 }, fuse: 5 });
  const total = { x: 0, z: 0 };
  for (let i = 0; i < 10; i++) {
    const px = p.pos.x, pz = p.pos.z;
    p.step(0.05, () => null);
    total.x += p.pos.x - px; total.z += p.pos.z - pz;
  }
  assert.ok(Number.isFinite(p.pos.x) && Number.isFinite(p.pos.y) && Number.isFinite(p.pos.z));
  assert.ok(close(total.x, 40 * 0.5, 1e-9), `0.5s 水平位移应≈20，实际 ${total.x}`);
  assert.ok(close(total.z, -10 * 0.5, 1e-9));
});

test('dt 边界：0 或负步长被忽略，不运动、不扣引信、无事件', () => {
  const p = new GrenadeProjectile({ pos: { x: 1, y: 2, z: 3 }, vel: { x: 5, y: 0, z: 0 }, fuse: 2 });
  assert.deepEqual(p.step(0, floor), []);
  assert.deepEqual(p.step(-0.1, floor), []);
  assert.deepEqual(p.pos, { x: 1, y: 2, z: 3 });
  assert.equal(p.fuse, 2);
});

test('computeThrowVelocity 生成确定性初速：同输入同输出（供 D 波 Game 直接使用）', () => {
  const input = { dir: { x: 0, y: 0.2, z: -1 }, actorVel: { x: 1.5, y: 0, z: 0 } };
  const a = computeThrowVelocity(input);
  const b = computeThrowVelocity(input);
  assert.deepEqual(a, b);
  assert.ok(Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z));
});
