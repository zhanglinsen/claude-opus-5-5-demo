// 投掷物效果规则核心边界测试（node --test，纯规则，不依赖 DOM/Three/时钟/随机）。
// 只测公开 API 上的行为样例：暴露 vs 遮挡、朝向 vs 背对、穿越 vs 未穿越烟雾，
// 不复制实现公式、不断言任意魔法常数。
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeHeBlast, computeFlashEffect, SmokeCloud, smokeBlocksSight, GRENADE_EFFECT_DEFAULTS } from '../../src/combat/grenade-effects.js';
import { WEAPONS } from '../../src/weapons.js';

// ---- HE ----

const ORIGIN = { x: 0, y: 1, z: 0 };
const HE_RULES = { radius: 10, damage: 100, falloff: 1.1, occlusionFactor: 0.2, minDamage: 1 };

const target = (overrides = {}) => ({ pos: { x: 5, y: 1, z: 0 }, team: 'GR', alive: true, isOwner: false, ...overrides });

test('HE 默认参数与现役手雷数据一致（radius/damage 与 WEAPONS.he 对齐）', () => {
  assert.equal(GRENADE_EFFECT_DEFAULTS.he.radius, WEAPONS.he.radius);
  assert.equal(GRENADE_EFFECT_DEFAULTS.he.damage, WEAPONS.he.dmg);
});

test('暴露的敌人按距离衰减受伤：近距离比远距离疼，且不超过基础伤害', () => {
  const near = computeHeBlast({ origin: ORIGIN, target: target({ pos: { x: 2, y: 1, z: 0 } }), ownerTeam: 'BL', rules: HE_RULES });
  const far = computeHeBlast({ origin: ORIGIN, target: target({ pos: { x: 8, y: 1, z: 0 } }), ownerTeam: 'BL', rules: HE_RULES });
  assert.equal(near.applies, true);
  assert.equal(far.applies, true);
  assert.ok(near.damage > far.damage, `near ${near.damage} 应大于 far ${far.damage}`);
  assert.ok(near.damage < HE_RULES.damage && near.damage > 0);
});

test('零距离安全处理：贴脸爆炸吃满基础伤害，不产生 NaN', () => {
  const r = computeHeBlast({ origin: ORIGIN, target: target({ pos: { x: 0, y: 1, z: 0 } }), ownerTeam: 'BL', rules: HE_RULES });
  assert.equal(r.applies, true);
  assert.equal(r.damage, HE_RULES.damage);
  assert.ok(Number.isFinite(r.damage));
});

test('几何遮挡实质减伤：被掩体挡住的同一目标伤害明显低于暴露目标但不为 0', () => {
  const exposed = computeHeBlast({ origin: ORIGIN, target: target(), ownerTeam: 'BL', rules: HE_RULES });
  const covered = computeHeBlast({ origin: ORIGIN, target: target(), ownerTeam: 'BL', rules: HE_RULES, isBlocked: () => true });
  assert.equal(exposed.blocked, false);
  assert.equal(covered.blocked, true);
  assert.ok(covered.damage > 0, '遮挡仍有残余伤害');
  assert.ok(covered.damage < exposed.damage * 0.5, `covered ${covered.damage} 应显著低于 exposed ${exposed.damage}`);
});

test('队伍伤害规则与现役一致：队友免疫、投掷者自身可受伤、敌人和伤害生效', () => {
  const enemy = computeHeBlast({ origin: ORIGIN, target: target({ team: 'GR' }), ownerTeam: 'BL', rules: HE_RULES });
  const mate = computeHeBlast({ origin: ORIGIN, target: target({ team: 'BL' }), ownerTeam: 'BL', rules: HE_RULES });
  const self = computeHeBlast({ origin: ORIGIN, target: target({ team: 'BL', isOwner: true }), ownerTeam: 'BL', rules: HE_RULES });
  assert.equal(enemy.applies, true);
  assert.equal(mate.applies, false);
  assert.equal(mate.reason, 'sameTeam');
  assert.equal(mate.damage, 0);
  assert.equal(self.applies, true, '现役规则允许自伤');
});

test('死亡目标、超出半径与低于最小伤害阈值都不结算', () => {
  const dead = computeHeBlast({ origin: ORIGIN, target: target({ alive: false }), ownerTeam: 'BL', rules: HE_RULES });
  assert.equal(dead.applies, false);
  assert.equal(dead.reason, 'dead');

  const out = computeHeBlast({ origin: ORIGIN, target: target({ pos: { x: 20, y: 1, z: 0 } }), ownerTeam: 'BL', rules: HE_RULES });
  assert.equal(out.applies, false);
  assert.equal(out.reason, 'outOfRange');
  assert.equal(out.damage, 0);

  // 半径边缘：衰减后伤害已低于 minDamage(1)
  const tickle = computeHeBlast({ origin: ORIGIN, target: target({ pos: { x: 9.95, y: 1, z: 0 } }), ownerTeam: 'BL', rules: HE_RULES });
  assert.equal(tickle.applies, false);
  assert.equal(tickle.reason, 'belowThreshold');
});

// ---- 闪光 ----

const FLASH_RULES = { radius: 16, maxDuration: 3, facingFullDot: 0.5, behindDot: -0.2 };
const FLASH_POS = { x: 8, y: 1.6, z: 0 };

// 观察者默认站在 FLASH_POS 正前方（西侧 8 米），面朝闪光（+x 方向）
const observer = (overrides = {}) => ({
  pos: { x: 0, y: 1.6, z: 0 }, viewDir: { x: 1, y: 0, z: 0 }, alive: true, spectating: false, ...overrides,
});
const flashAt = (o, extra = {}) => computeFlashEffect({ origin: FLASH_POS, observer: o, rules: FLASH_RULES, ...extra });

test('贴脸且正面直视：满强度致盲，持续满时长（对玩家与 AI 同一规则）', () => {
  const r = flashAt(observer({ pos: { x: 8, y: 1.6, z: 0 } }));
  assert.equal(r.blinded, true);
  assert.equal(r.intensity, 1);
  assert.equal(r.duration, FLASH_RULES.maxDuration);
});

test('完全背对闪光：不受影响', () => {
  const r = flashAt(observer({ viewDir: { x: -1, y: 0, z: 0 } }));
  assert.equal(r.blinded, false);
  assert.equal(r.intensity, 0);
  assert.equal(r.duration, 0);
});

test('侧向视线（与闪光方向垂直）：致盲但强度和时长低于正面', () => {
  const side = flashAt(observer({ viewDir: { x: 0, y: 0, z: 1 } }));
  const facing = flashAt(observer());
  assert.equal(side.blinded, true);
  assert.ok(side.intensity > 0 && side.intensity < facing.intensity, `side ${side.intensity} 应弱于 facing ${facing.intensity}`);
  assert.ok(side.duration < facing.duration);
});

test('几何遮挡完全挡住闪光：即使正面直视也不致盲', () => {
  const r = flashAt(observer(), { isBlocked: () => true });
  assert.equal(r.blinded, false);
  assert.equal(r.intensity, 0);
});

test('半径外不致盲；同朝向下距离越远持续越短', () => {
  const out = flashAt(observer({ pos: { x: 100, y: 1.6, z: 0 } }));
  assert.equal(out.blinded, false);

  const far = flashAt(observer({ pos: { x: 12, y: 1.6, z: 0 }, viewDir: { x: -1, y: 0, z: 0 } }));
  const near = flashAt(observer({ pos: { x: 8, y: 1.6, z: 0 } }));
  assert.equal(far.blinded, true);
  assert.ok(far.duration < near.duration, `far ${far.duration} 应短于 near ${near.duration}`);
});

test('死亡或观战中的视角不受闪光影响', () => {
  for (const o of [observer({ alive: false }), observer({ spectating: true })]) {
    const r = flashAt(o);
    assert.equal(r.blinded, false, JSON.stringify(o));
    assert.equal(r.duration, 0);
  }
});

// ---- 烟雾 ----

const SMOKE_RULES = { radius: 3.5, duration: 12, fadeStart: 7, denseOpacity: 0.5 };
const SMOKE_POS = { x: 0, y: 1.5, z: 0 };
const cloud = () => new SmokeCloud({ pos: SMOKE_POS, ...SMOKE_RULES });

// 穿过烟心的视线 vs 从烟旁 6 米外绕过的视线
const THROUGH = { from: { x: -10, y: 1.5, z: 0 }, to: { x: 10, y: 1.5, z: 0 } };
const MISS = { from: { x: -10, y: 1.5, z: 6 }, to: { x: 10, y: 1.5, z: 6 } };

test('活跃浓烟阻挡穿越视线，不经过烟雾的视线畅通（玩家视觉与 AI 视线同一判定）', () => {
  const c = cloud();
  assert.equal(c.opacity(), 1);
  assert.equal(c.blocksSight(THROUGH.from, THROUGH.to), true);
  assert.equal(c.blocksSight(MISS.from, MISS.to), false);
  assert.equal(smokeBlocksSight(THROUGH.from, THROUGH.to, [c]), true, 'smokeBlocksSight 接缝同样判定阻挡');
  assert.equal(smokeBlocksSight(MISS.from, MISS.to, [c]), false);
});

test('到时完全消散：同一条穿越视线恢复畅通', () => {
  const c = cloud();
  c.advance(SMOKE_RULES.duration + 0.5);
  assert.equal(c.expired(), true);
  assert.equal(c.opacity(), 0);
  assert.equal(c.blocksSight(THROUGH.from, THROUGH.to), false);
  assert.equal(smokeBlocksSight(THROUGH.from, THROUGH.to, [c]), false);
});

test('确定性消散：浓烟期不衰减，fadeStart 后线性变稀，同刻查询结果一致', () => {
  const c = cloud();
  c.advance(4);
  assert.equal(c.opacity(), 1, 'fadeStart 前保持全浓');
  c.advance(2); // 到 fadeStart(7)
  assert.equal(c.opacity(), 1);
  const o1 = c.opacity();
  c.advance(2.5); // 累计 8.5s，处于消散中段
  const o2 = c.opacity();
  assert.ok(o2 < o1 && o2 > 0, 'opacity 应在消散期单调下降且大于 0：' + o2);
  // 确定性：新建同参数烟推进到同一时刻，opacity 相同
  const again = cloud();
  again.advance(8.5);
  assert.equal(again.opacity(), o2);
});

test('稀释到不浓（opacity < denseOpacity）后视线可穿透；多团烟任一阻挡即阻挡', () => {
  const faded = cloud();
  faded.advance(SMOKE_RULES.duration - 0.5); // 临近消散完毕，opacity 远低于 denseOpacity
  assert.ok(faded.opacity() < SMOKE_RULES.denseOpacity);
  assert.equal(faded.blocksSight(THROUGH.from, THROUGH.to), false);

  const freshA = cloud();
  const freshB = cloud();
  freshB.advance(SMOKE_RULES.duration + 1); // 已消散
  assert.equal(smokeBlocksSight(THROUGH.from, THROUGH.to, [freshB, freshA]), true, '活烟阻挡');
  assert.equal(smokeBlocksSight(THROUGH.from, THROUGH.to, [freshB]), false, '只剩消散烟则畅通');
});
