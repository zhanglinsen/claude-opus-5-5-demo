// 投掷物效果纯规则核心（stage4 战斗）：HE/闪光/烟雾的伤害与视线判定。
// 无 DOM/Three/音频/全局时钟/随机数；世界遮挡通过注入的 isBlocked(start, end) 纯回调，
// 本模块不读取任何隐藏全局游戏状态，位置一律用 {x,y,z} 平面向量。
// Game 集成契约：
//  - HE/闪光遮挡：Game 用现有 world.raycast('bullet') 适配 isBlocked(from, to)。
//  - 烟雾视线：smokeBlocksSight 是玩家视觉与 AI 视线共用的唯一接缝，保证二者判定一致。
//  - 只返回伤害值/强度/布尔判定，不直接扣血、播音效或建网格；投掷物运动、音效、
//    网格仍是 Game 侧运行时适配器。

// HE 默认值与现役 WEAPONS.he / Game.explode 行为对齐：
// 队友免疫（投掷者自身可受伤）、线性半径外不结算、几何遮挡残余伤害、伤害≤1 不结算。
export const GRENADE_EFFECT_DEFAULTS = Object.freeze({
  he: Object.freeze({ radius: 7.5, damage: 115, falloff: 1.1, occlusionFactor: 0.2, minDamage: 1 }),
  // 闪光为新规则：视野锥内满致盲，behindDot 之外（约背对）不致盲，之间线性过渡。
  flash: Object.freeze({ radius: 16, maxDuration: 3, facingFullDot: 0.5, behindDot: -0.2 }),
  // 烟雾为新规则：fadeStart 前全浓，之后线性变稀，duration 后完全消散；
  // opacity ≥ denseOpacity 视为浓烟、挡视线。
  smoke: Object.freeze({ radius: 3.5, duration: 12, fadeStart: 7, denseOpacity: 0.5 }),
});

const dist3 = (a, b) => {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

// HE 爆炸对单个目标的结算。target: { pos, team, alive, isOwner }。
// 不结算是时 damage 为 0，reason: dead | sameTeam | outOfRange | belowThreshold | null，
// 判定优先级与现役 Game.explode 一致（存活 → 队伍 → 半径 → 阈值）。
export function computeHeBlast({ origin, target, ownerTeam, isBlocked, rules = {} }) {
  const R = { ...GRENADE_EFFECT_DEFAULTS.he, ...rules };
  const noEffect = (reason) => ({ applies: false, reason, damage: 0, distance: 0, blocked: false });
  if (!target || target.alive === false) return noEffect('dead');
  if (ownerTeam != null && target.team === ownerTeam && !target.isOwner) return noEffect('sameTeam');

  const distance = dist3(origin, target.pos);
  if (distance > R.radius) return noEffect('outOfRange');

  const falloff = R.radius > 0 ? Math.max(0, 1 - distance / R.radius) : 0;
  let damage = R.damage * Math.pow(falloff, R.falloff);
  const blocked = typeof isBlocked === 'function' ? !!isBlocked(origin, target.pos) : false;
  if (blocked) damage *= R.occlusionFactor;
  if (damage <= R.minDamage) return noEffect('belowThreshold');
  return { applies: true, reason: null, damage, distance, blocked };
}

const norm3 = (v) => {
  const L = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  return L > 0 ? { x: v.x / L, y: v.y / L, z: v.z / L } : null;
};

// 视线方向因子：面朝（dot ≥ facingFullDot）为 1，背对（dot ≤ behindDot）为 0，之间线性。
// viewDir 缺失或零向量时视为面朝（无法判定视线方向时闪光仍然致盲）。
function viewAngleFactor(viewDir, toFlash, R) {
  const dir = norm3(viewDir);
  if (!dir) return 1;
  const dot = dir.x * toFlash.x + dir.y * toFlash.y + dir.z * toFlash.z;
  if (dot >= R.facingFullDot) return 1;
  if (dot <= R.behindDot) return 0;
  return (dot - R.behindDot) / (R.facingFullDot - R.behindDot);
}

// 闪光对单个观察者的致盲判定。observer: { pos, viewDir, alive, spectating }，
// 对玩家与 AI 使用同一规则；死亡/观战视角不受影响。
// 返回 { blinded, intensity(0..1), duration(秒) }；不致盲时 intensity 与 duration 为 0。
export function computeFlashEffect({ origin, observer, isBlocked, rules = {} }) {
  const R = { ...GRENADE_EFFECT_DEFAULTS.flash, ...rules };
  const off = { blinded: false, intensity: 0, duration: 0 };
  if (!observer || observer.alive === false || observer.spectating === true) return off;

  const toFlash = norm3({ x: origin.x - observer.pos.x, y: origin.y - observer.pos.y, z: origin.z - observer.pos.z });
  if (!toFlash) return { blinded: true, intensity: 1, duration: R.maxDuration }; // 贴脸
  const distance = dist3(origin, observer.pos);
  if (distance > R.radius) return off;
  if (typeof isBlocked === 'function' && isBlocked(origin, observer.pos)) return off;

  const intensity = (1 - distance / R.radius) * viewAngleFactor(observer.viewDir, toFlash, R);
  if (intensity <= 0) return off;
  return { blinded: true, intensity, duration: R.maxDuration * intensity };
}

// 点到线段（from→to）的最近距离，用于判定视线是否穿越烟团体积
function segmentPointDistance(from, to, p) {
  const ax = to.x - from.x, ay = to.y - from.y, az = to.z - from.z;
  const L2 = ax * ax + ay * ay + az * az;
  let t = 0;
  if (L2 > 0) {
    t = ((p.x - from.x) * ax + (p.y - from.y) * ay + (p.z - from.z) * az) / L2;
    t = Math.max(0, Math.min(1, t));
  }
  return dist3({ x: from.x + ax * t, y: from.y + ay * t, z: from.z + az * t }, p);
}

// 一团定时烟雾体积：advance(dt) 显式推进（暂停 = 不调用，无隐藏墙钟），
// opacity()/blocksSight() 为纯查询，同刻重复查询结果一致。
export class SmokeCloud {
  constructor({ pos, ...rules } = {}) {
    const R = { ...GRENADE_EFFECT_DEFAULTS.smoke, ...rules };
    this.pos = { ...(pos || { x: 0, y: 0, z: 0 }) };
    this.radius = R.radius;
    this.duration = R.duration;
    this.fadeStart = Math.min(R.fadeStart, R.duration);
    this.denseOpacity = R.denseOpacity;
    this.age = 0;
  }

  // 推进烟雾寿命；负 dt 忽略，超过 duration 不再累积
  advance(dt) {
    if (!(dt > 0)) return;
    this.age = Math.min(this.duration, this.age + dt);
  }

  expired() { return this.age >= this.duration; }

  // 0..1：fadeStart 前为 1，之后线性降到 0
  opacity() {
    if (this.expired()) return 0;
    if (this.age <= this.fadeStart) return 1;
    return Math.max(0, 1 - (this.age - this.fadeStart) / (this.duration - this.fadeStart));
  }

  // 视线是否被这团烟挡住：视线段穿入烟团体积且当前烟足够浓。
  // 玩家视觉与 AI 视线必须都经此判定（或经 smokeBlocksSight），保证二者一致。
  blocksSight(from, to) {
    if (this.opacity() < this.denseOpacity) return false;
    return segmentPointDistance(from, to, this.pos) < this.radius;
  }
}

// 玩家视觉与 AI 视线共用的唯一烟雾视线接缝：任一活烟阻挡即视线受阻
export function smokeBlocksSight(from, to, clouds) {
  for (const c of clouds || []) {
    if (c && typeof c.blocksSight === 'function' && c.blocksSight(from, to)) return true;
  }
  return false;
}
