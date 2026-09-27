// 投掷物运动纯核心（stage4 战斗）：抛体、碰撞反弹/滚动衰减、引信到期。
// 无 DOM/Three/音频/全局时钟/随机数；世界碰撞通过注入的 raycast(pos, dir, len) 纯回调，
// 命中约定与现役 Game 世界一致：返回 { t(沿 ray 的距离), nx, ny, nz(命中面法线) } 或 null。
// 位置/速度一律用 {x,y,z} 平面向量；确定性来自显式 step(dt)，暂停 = 不调用。
// Game 集成契约（D 波）：
//  - raycast 用现有 world.raycast(x,y,z, dx,dy,dz, len, 'move') 适配；
//  - 出手速度用 computeThrowVelocity 生成（与现役 throwGrenade 手感一致）；
//  - step 返回 bounce/fuse 事件供 Game 播音效与爆炸结算，模块自身不扣血不建网格。
//  - ** bounced 音效必须由 Game 用 |impactSpeed| > 2 闸门过滤（与现役 game.js 一致）：
//    贴地静止（rested）后每个子步仍会重命中并发出 bounce 事件（impactSpeed 为浮点尘埃级），
//    本模块为与现役 updateNades 逐位一致不做抑制——漏掉闸门会出现持续弹跳音。

// 数值与现役 updateNades/throwGrenade 对齐（HE 行为不变，D 波仅替换运行时）：
//  - 重力 14 m/s²、每帧 3 个子步；
//  - 反弹：现役为 vel += n*(-1.45*vn) 再整体 *0.55，等价于法向保留 0.2475（反向）、
//    切向保留 0.55，这里拆成独立系数便于调参；
//  - 落地静止：命中面朝上（ny > 0.7）且反弹后 |vy| < 1.2 时 vy 清零、水平 *0.8；
//  - 出手：dir*16 + 竖直上抬 2.8 + 投掷者自身速度 *0.6。
export const PROJECTILE_DEFAULTS = Object.freeze({
  gravity: 14,
  substeps: 3,
  skin: 0.07,
  bounceNormal: 0.2475,
  bounceTangent: 0.55,
  restNormalY: 0.7,
  restVy: 1.2,
  rollFriction: 0.8,
  sleepSpeed: 0.05, // 水平速度低于此值且贴地视为完全静止
});

export const THROW_DEFAULTS = Object.freeze({ speed: 16, up: 2.8, inherit: 0.6 });

// 出手初速：dir 为视线方向（内部归一化，允许零向量），actorVel 为投掷者自身速度。
export function computeThrowVelocity({ dir, actorVel, rules = {} }) {
  const R = { ...THROW_DEFAULTS, ...rules };
  const L = Math.hypot(dir?.x || 0, dir?.y || 0, dir?.z || 0);
  const dx = L > 0 ? dir.x / L : 0, dy = L > 0 ? dir.y / L : 0, dz = L > 0 ? dir.z / L : 0;
  const ax = actorVel?.x || 0, ay = actorVel?.y || 0, az = actorVel?.z || 0;
  return {
    x: dx * R.speed + ax * R.inherit,
    y: dy * R.speed + R.up + ay * R.inherit,
    z: dz * R.speed + az * R.inherit,
  };
}

const ZERO = Object.freeze({ x: 0, y: 0, z: 0 });

// 单枚投掷物的确定性运动状态。step(dt, raycast) 显式推进并返回本帧事件数组：
//  - { type: 'bounce', pos, normal, impactSpeed } 每次命中一次；
//  - { type: 'rest', pos } 从运动进入贴地静止时恰好一次；
//  - { type: 'fuse', pos } 引信到期（explode-ready），此后 done=true 且不再运动。
// 触发顺序与现役一致：整帧扣引信 → 子步运动 → 引信判定。
// 注：不接收 radius——碰撞体由世界 raycast 隐式决定（skin 为贴面间距）；
// WEAPONS 里的 radius 是爆炸效果半径，属 Game 侧结算，与本运动模块无关。
export class GrenadeProjectile {
  constructor({ pos, vel, fuse, rules = {} }) {
    this.pos = { ...(pos || ZERO) };
    this.vel = { ...(vel || ZERO) };
    this.fuse = fuse;
    this.R = { ...PROJECTILE_DEFAULTS, ...rules };
    this.grounded = false;   // 最近一次接触为朝上面
    this.rested = false;     // 已发出 rest 事件
    this.done = false;       // 引信已到期
  }

  get atRest() {
    if (this.done || !this.grounded) return false;
    // 垂直判零用容差：rest 分支置零后若经历一次未命中的子步，重力会留下尘埃级负值
    return Math.hypot(this.vel.x, this.vel.z) < this.R.sleepSpeed && Math.abs(this.vel.y) < 1e-9;
  }

  step(dt, raycast) {
    if (this.done || !(dt > 0)) return [];
    const R = this.R;
    this.fuse -= dt;
    const events = [];
    const h = dt / R.substeps;
    for (let s = 0; s < R.substeps; s++) {
      this.vel.y -= R.gravity * h;
      const sp = Math.hypot(this.vel.x, this.vel.y, this.vel.z);
      if (sp < 1e-4) continue;
      const dir = { x: this.vel.x / sp, y: this.vel.y / sp, z: this.vel.z / sp };
      const len = sp * h + R.skin;
      const hit = typeof raycast === 'function' ? raycast(this.pos, dir, len) : null;
      if (hit) {
        this.pos.x += dir.x * Math.max(0, hit.t - R.skin);
        this.pos.y += dir.y * Math.max(0, hit.t - R.skin);
        this.pos.z += dir.z * Math.max(0, hit.t - R.skin);
        const vn = this.vel.x * hit.nx + this.vel.y * hit.ny + this.vel.z * hit.nz;
        // 分解为法向/切向分量分别衰减（与现役 vel += n*(-1.45*vn); vel *= 0.55 等价）
        const nX = hit.nx * vn, nY = hit.ny * vn, nZ = hit.nz * vn;
        this.vel.x = (this.vel.x - nX) * R.bounceTangent - nX * R.bounceNormal;
        this.vel.y = (this.vel.y - nY) * R.bounceTangent - nY * R.bounceNormal;
        this.vel.z = (this.vel.z - nZ) * R.bounceTangent - nZ * R.bounceNormal;
        events.push({ type: 'bounce', pos: { ...this.pos }, normal: { x: hit.nx, y: hit.ny, z: hit.nz }, impactSpeed: Math.abs(vn) });
        if (hit.ny > R.restNormalY && Math.abs(this.vel.y) < R.restVy) {
          this.vel.y = 0;
          this.vel.x *= R.rollFriction; this.vel.z *= R.rollFriction;
          this.grounded = true;
        } else {
          this.grounded = false;
        }
      } else {
        this.pos.x += this.vel.x * h;
        this.pos.y += this.vel.y * h;
        this.pos.z += this.vel.z * h;
      }
    }
    if (this.atRest && !this.rested) {
      this.rested = true;
      events.push({ type: 'rest', pos: { ...this.pos } });
    }
    if (this.fuse <= 0) {
      this.done = true;
      events.push({ type: 'fuse', pos: { ...this.pos } });
    }
    return events;
  }
}
