// 爆破模式控制器：持有纯规则引擎 BombMatch，负责回合流转、世界事实装配与命令入口。
// 无 DOM/Three/存储；模拟时间只来自 update(dt)（暂停 = Game 不调用，即冻结，无隐藏墙钟）。
// Game 侧契约：Game.bomb = 本会话的 BombMatch（仅爆破模式非空）；
// 事实由 Game 提供 { id, alive, pos, moving, damaged }，inSite 由本控制器按地图包点补全为
// 包点 ID 字符串（'A'/'B'，绝无布尔）——BombMatch 的严格 inSite 契约在此收口。
import { BombMatch } from './bomb.js';

export const ROUND_RESTART_DELAY = 4; // 回合结束到统一复活开下一回合（秒，模拟时间）
const SITE_Y_TOL = 3.2;               // 包点垂直容差（平台/地面高差）

const COMMAND_TYPES = new Set(['startPlant', 'stopPlant', 'startDefuse', 'stopDefuse', 'dropBomb', 'pickupBomb']);

export class BombSession {
  constructor({ roster = [], bombSites = [], rules = {}, hooks = {} } = {}) {
    this.roster = (Array.isArray(roster) ? roster : [])
      .filter((r) => r && r.id != null && (r.team === 'BL' || r.team === 'GR'))
      .map((r) => ({ id: r.id, team: r.team, name: r.name }));
    // 包点元数据只来自地图；缺坐标/ID 的条目忽略，绝不臆造包点
    this.sites = (Array.isArray(bombSites) ? bombSites : [])
      .filter((b) => b && typeof b.id === 'string' && b.id.length > 0
        && Number.isFinite(b.x) && Number.isFinite(b.z));
    this.match = new BombMatch({ roster: this.roster, rules });
    this.hooks = {
      spawnAll: hooks.spawnAll || (() => {}),
      onEvents: hooks.onEvents || (() => {}),
    };
    this.blIds = this.roster.filter((r) => r.team === 'BL').map((r) => r.id);
    this.destroyed = false;
    this.lastFacts = new Map(); // id -> 最近一帧事实（视图提示用）
    this.carrierIdx = 0;        // 逐回合确定性轮转首发 C4 携带者
    this.endT = 0;
  }

  // 世界坐标 → 包点 ID 字符串；不在任何包点返回 null，绝不返回布尔
  siteAt(pos) {
    if (!pos) return null;
    for (const b of this.sites) {
      if (Math.hypot(pos.x - b.x, pos.z - b.z) <= (b.radius || 5)
        && Math.abs((pos.y || 0) - (b.y || 0)) <= SITE_Y_TOL) return b.id;
    }
    return null;
  }

  // 开局：先统一复活，再开始第一回合（准备期）
  start() {
    if (this.destroyed || this.match.phase !== 'idle') return [];
    this.hooks.spawnAll();
    return this.#beginRound();
  }

  #beginRound() {
    const carrier = this.blIds.length ? this.blIds[this.carrierIdx++ % this.blIds.length] : null;
    const ev = this.match.startRound(carrier);
    this.#emit(ev);
    return ev;
  }

  // 命令入口（玩家/机器人共用）：只做类型收口，合法性由规则引擎在下一帧结算
  command(type, actorId, pos) {
    if (this.destroyed || !COMMAND_TYPES.has(type)) return false;
    this.match.command({ type, actorId, pos });
    return true;
  }

  // 每模拟帧：装配事实 → 推进规则引擎 → 派发语义事件 → 回合流转
  update(dt, rawFacts = []) {
    if (this.destroyed) return [];
    const actors = [];
    for (const f of (Array.isArray(rawFacts) ? rawFacts : [])) {
      if (!f || f.id == null) continue;
      actors.push({
        id: f.id, alive: f.alive, pos: f.pos,
        moving: !!f.moving, damaged: !!f.damaged,
        inSite: this.siteAt(f.pos),
      });
      this.lastFacts.set(f.id, f);
    }
    const events = this.match.update(dt, { actors });
    this.#emit(events);
    this.#flow(dt);
    return events;
  }

  #emit(events) { if (events.length) this.hooks.onEvents(events); }

  // 回合结束 → 延迟统一复活 → 下一回合；matchEnd 不再开新回合（由 matchEnded 事件通知 Game）
  #flow(dt) {
    const m = this.match;
    if (m.phase === 'roundEnd') {
      this.endT += dt;
      if (this.endT >= ROUND_RESTART_DELAY) {
        this.endT = 0;
        this.hooks.spawnAll();
        this.#beginRound();
      }
    } else this.endT = 0;
  }

  // HUD/交互/机器人共用的公开视图：可序列化快照 + 交互提示。
  // 只依赖 BombMatch 公共输出（snapshot/plantable/defusable/pickupable）与本会话事实，不读引擎私有中间态。
  view(actorId = null) {
    if (this.destroyed) return null;
    const m = this.match;
    const snap = m.snapshot();
    const f = actorId != null ? this.lastFacts.get(actorId) : null;
    const me = this.roster.find((r) => r.id === actorId);
    const spectate = me
      ? this.roster
        .filter((r) => r.team === me.team && r.id !== actorId && m.alive[r.id] !== false)
        .map((r) => ({ id: r.id, name: r.name }))
      : [];
    return {
      ...snap,
      winsNeeded: m.rules.winsNeeded,
      inSite: f ? this.siteAt(f.pos) : null,
      plantable: actorId != null && m.plantable(actorId),
      defusable: actorId != null && m.defusable(actorId),
      pickupable: actorId != null && m.pickupable(actorId), // 掉落态/相位/阵营/存活/交互半径的引擎权威判定
      // 进度条分母随规则接缝下发（HUD 优先读取，不再回退硬编码默认）
      plantHold: m.rules.plantHold,
      defuseHold: m.rules.defuseHold,
      spectate,
    };
  }

  // 重开一局：清空比分/回合/排队命令与流转计时（对局重建时由 Game 调用）
  restart() {
    this.match.restart();
    this.lastFacts.clear();
    this.carrierIdx = 0;
    this.endT = 0;
  }

  // 销毁：断开钩子（重开后旧会话不再向 Game 发任何事件/复活调用）
  destroy() {
    this.destroyed = true;
    this.hooks = { spawnAll: () => {}, onEvents: () => {} };
    this.match.restart();
  }
}
