// 练习模式纯核心：无 DOM/Three/存储/全局时钟/随机数/外部副作用。
// Game 集成契约：
//  - 靶子：构造时注入合法靶点数组 [{ id, pos? }]，id 必须为非空字符串（重复取首个，其余忽略）；
//    pos 为 Game 提供的不透明数据，引擎原样透传，不含任何固定地图坐标。
//  - 命中：hit(id) 只认已注入的靶子 ID；未知/非法 ID 安全忽略，绝不新增状态（避免无限增长）。
//  - 时间：只通过 update(dt) 推进；暂停 = 不调用 update 即冻结（无隐藏墙钟）。
//  - 输出：snapshot() 返回可序列化纯对象，供后续 Game/HUD 渲染。

// 非空字符串 ID 才是合法靶子
const isTargetId = (v) => typeof v === 'string' && v.length > 0;

export class PracticeSession {
  constructor({ targets = [] } = {}) {
    const list = Array.isArray(targets) ? targets : [];
    const seen = new Set();
    this.targets = [];
    for (const t of list) {
      const id = t && t.id;
      if (!isTargetId(id) || seen.has(id)) continue;
      seen.add(id);
      this.targets.push({ id, pos: t.pos, hits: 0, flash: 0 });
    }
    this.totalHits = 0;
    this.now = 0;
    this.hitFlash = 0.35; // 靶子受击反应持续时间（秒，模拟时间）
    this.byId = new Map(this.targets.map((t) => [t.id, t]));
  }

  // 命中登记：只认已注入靶子；未知/非法 ID 忽略并返回 false，不新增任何状态
  hit(id) {
    const target = isTargetId(id) ? this.byId.get(id) : null;
    if (!target) return false;
    target.hits++;
    this.totalHits++;
    target.flash = this.hitFlash;
    return true;
  }

  // 只按模拟 dt 推进：衰减受击反应、累计 now；非法 dt 安全忽略。暂停 = 不调用本方法即冻结。
  update(dt) {
    if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) return;
    this.now += dt;
    for (const t of this.targets) {
      t.flash = Math.max(0, t.flash - dt);
    }
  }

  // 重开一局：清空命中统计、受击反应与模拟时间；靶子结构（ID/pos）原样保留
  reset() {
    this.totalHits = 0;
    this.now = 0;
    for (const t of this.targets) {
      t.hits = 0;
      t.flash = 0;
    }
  }

  snapshot() {
    return {
      now: this.now,
      totalHits: this.totalHits,
      targets: this.targets.map((t) => ({ ...t })),
    };
  }
}
