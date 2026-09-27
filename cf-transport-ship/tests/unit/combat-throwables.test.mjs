// 投掷物装备数据与出手参数边界测试（node --test，纯数据/纯函数，无 DOM/Three）。
// 只测公开数据契约：flash/smoke 条目形状与 slot 3 轮换、效果半径与规则核心对齐、
// 装备目录自动收录、出手速度公式与现役手感一致；不复制实现内部。
import test from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS } from '../../src/weapons.js';
import { GRENADE_EFFECT_DEFAULTS } from '../../src/combat/grenade-effects.js';
import { computeThrowVelocity } from '../../src/combat/projectile.js';
import { CATALOG, SLOT_DEFAULTS } from '../../src/profile/equipment.js';

const GRENADE_FIELDS = ['id', 'name', 'slot', 'type', 'auto', 'fuse', 'count', 'draw', 'speed', 'sound', 'hudName', 'mag', 'reserve'];

test('新增闪光弹/烟雾弹条目：slot 3 轮换、字段形状与 he 一致', () => {
  for (const id of ['flash', 'smoke']) {
    const w = WEAPONS[id];
    assert.ok(w, `WEAPONS.${id} 应存在`);
    assert.equal(w.slot, 3, '与 he 同属 4 号投掷槽轮换');
    assert.equal(w.type, 'grenade');
    for (const f of GRENADE_FIELDS) assert.ok(f in w, `${id} 缺少字段 ${f}`);
    assert.ok(w.fuse > 0 && w.fuse < WEAPONS.he.fuse, `${id}.fuse ${w.fuse} 应为正且短于 HE 引信`);
    assert.ok(w.count >= 1);
  }
  assert.equal(WEAPONS.flash.hudName.toUpperCase(), 'FLASHBANG');
  assert.equal(WEAPONS.smoke.hudName.toUpperCase(), 'SMOKE');
});

test('效果半径与规则核心对齐：flash/smoke 半径等于 grenade-effects 默认值', () => {
  assert.equal(WEAPONS.flash.radius, GRENADE_EFFECT_DEFAULTS.flash.radius);
  assert.equal(WEAPONS.smoke.radius, GRENADE_EFFECT_DEFAULTS.smoke.radius);
});

test('effect 分发键与枪械 ID 一致：D 波结算器按 WEAPONS[id].effect 分发', () => {
  for (const id of ['he', 'flash', 'smoke']) {
    assert.equal(WEAPONS[id].effect, id, `WEAPONS.${id}.effect 应为 '${id}'`);
  }
});

test('装备目录自动收录新投掷物，且默认投掷物保持 he（目录首项不变）', () => {
  assert.deepEqual(CATALOG.grenade, ['he', 'flash', 'smoke']);
  assert.equal(SLOT_DEFAULTS.grenade, 'he');
});

test('出手速度公式与现役手感一致：dir*speed + 竖直上抬 + 继承投掷者速度', () => {
  const vel = computeThrowVelocity({
    dir: { x: 0, y: 0, z: -1 }, actorVel: { x: 1, y: 0, z: 2 },
  });
  assert.deepEqual(vel, { x: 0.6, y: 2.8, z: -14.8 });
});

test('出手速度边界：零方向与零自身速度安全，不产生 NaN', () => {
  const still = computeThrowVelocity({ dir: { x: 0, y: 0, z: 0 }, actorVel: { x: 0, y: 0, z: 0 } });
  assert.ok(Number.isFinite(still.x) && Number.isFinite(still.y) && Number.isFinite(still.z));
  assert.ok(still.y > 0, '零方向仍保留竖直上抬，避免原地扔脚底');

  const actor = computeThrowVelocity({ dir: { x: 0, y: 0, z: -1 }, actorVel: { x: -5, y: 3, z: 0 } });
  assert.deepEqual(actor, { x: -3, y: 4.6, z: -16 });
});
