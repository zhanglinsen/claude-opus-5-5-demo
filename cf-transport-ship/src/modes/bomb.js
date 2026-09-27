// 爆破模式纯规则引擎：无 DOM/Three/全局时钟/随机数/外部副作用。
// Game 集成契约：
//  - 时间：只通过 update(dt, facts) 推进；暂停 = 不调用 update（无隐藏墙钟）。
//  - 事实：每帧传入 facts.actors = [{ id, alive, inSite, moving, damaged, pos }]，
//    分别表示存活、是否在包点/拆包范围内、是否移动中、本帧是否受伤、最近位置。
//    inSite 严格契约：必须是非空包点 ID 字符串（当前 'A'/'B'）才视为在包点/拆包范围；
//    布尔 true、空串等非法值一律视为不在——不得开始安/拆包，进行中失去合法 site 即中断。
//    引擎不校验 site ID 是否存在于地图（BombMatch 不依赖地图元数据），由 Game 提供真实包点 ID。
//    引擎按帧粒度采信事实，交战帧率下 dt 应为正常帧长。
//  - 命令：command({type, actorId, pos?}) 排队，在下次 update 开头结算；
//    类型：startPlant/stopPlant、startDefuse/stopDefuse、dropBomb、pickupBomb。
//    startDefuse 优先于 pickupBomb 结算（E 键拆包优先语义）。
//  - 输出：update 返回本帧有序语义事件；snapshot() 供 HUD/观战/提示（含 plantable/defusable）。
//  - 回合流转：roundEnded 后由 Game 在统一复活时调用 startRound(carrierId) 开启下一回合准备期。

export const BOMB_DEFAULTS = Object.freeze({
  teamSize: 5, // 固定 5v5
  winsNeeded: 7, // 先赢 7 局
  prepTime: 5, // 准备期（秒）
  roundTime: 150, // 回合时间（秒）
  plantHold: 5, // 安包需持续按住（秒）
  defuseHold: 7, // 拆包需持续按住（秒）
  fuseTime: 40, // 安包后引爆倒计时（秒）
});

// 同一帧内多个候选结局按精确完成时间仲裁；引爆与拆包同时刻平手判引爆。
const DEFUSE_START_PRIORITY = 0;
const PICKUP_PRIORITY = 5;
const COMMAND_PRIORITY = {
  startDefuse: DEFUSE_START_PRIORITY, stopDefuse: 1,
  startPlant: 2, stopPlant: 3, dropBomb: 4, pickupBomb: PICKUP_PRIORITY,
};

// inSite 严格契约：只接受非空包点 ID 字符串；布尔 true 等非法值不算在包点
const isSite = (v) => typeof v === 'string' && v.length > 0;

// 掉包拾取交互半径（米，3D 距离，含垂直项防跨层隔空拾取）。
// 取 2.0 的依据：机器人自身兜底门限 1.7m（bots.js）在其内，bot 下发的拾取命令不会被弹回；
// 与近身交互尺度一致（刀轻击 ~2.2m），远小于包点判定半径（5.5m），足以杜绝任意距离隔空取包。
export const PICKUP_RADIUS = 2;
export const DEFUSE_RADIUS = 2.5;

export class BombMatch {
  constructor({ roster = [], rules = {} } = {}) {
    this.roster = roster.map((r) => ({ ...r }));
    this.rules = { ...BOMB_DEFAULTS, ...rules }; // rules 仅作测试/确定性接缝
    this.restart();
  }

  // 重开：清空比分、回合、C4 与事件队列，不留任何残留回放
  restart() {
    this.score = { BL: 0, GR: 0 };
    this.round = 0;
    this.phase = 'idle'; // idle | prep | live | planted | roundEnd | matchEnd
    this.now = 0;
    this.bomb = null; // {carrierId} | {dropped:true,pos} | {planted:true,site,pos}
    this.plantedSite = null;
    this.alive = {}; // id -> bool；回合开始统一复活
    this.action = null; // {kind:'plant'|'defuse', actorId, start}
    this.roundWinner = null;
    this.matchWinner = null;
    this.deadlines = {}; // prep/live/fuse 的绝对截止时刻
    this.pos = {}; // 最近已知位置（死亡掉包用）
    this.queue = [];
    this.tickFacts = {};
  }

  // Game 在统一复活后调用；carrierId 非 BL 或缺省时取首个 BL
  startRound(carrierId = null) {
    if (this.phase !== 'idle' && this.phase !== 'roundEnd') return [];
    this.round++;
    this.phase = 'prep';
    this.roundWinner = null;
    this.plantedSite = null;
    this.action = null;
    const bl = this.roster.filter((r) => r.team === 'BL').map((r) => r.id);
    for (const r of this.roster) this.alive[r.id] = true;
    // 玩家 id 可以是数值 0：只把 null/undefined 视为缺失，不得用 falsy 判断
    const carrier = bl.includes(carrierId) ? carrierId : (bl[0] ?? null);
    this.bomb = carrier != null ? { carrierId: carrier } : null;
    this.deadlines.prep = this.now + this.rules.prepTime;
    return [{ type: 'roundStart', round: this.round, carrierId: carrier }];
  }

  command(cmd) { this.queue.push({ ...cmd }); }

  update(dt, factsData = {}) {
    const events = [];
    if (!(dt >= 0)) return events;
    if (this.phase !== 'prep' && this.phase !== 'live' && this.phase !== 'planted') {
      this.queue.length = 0;
      return events;
    }
    this.mergeFacts(factsData);
    this.dropIfCarrierDead(events);
    this.drainCommands(events);
    if (dt > 0) this.advance(dt, events);
    return events;
  }

  mergeFacts(data) {
    this.tickFacts = {};
    for (const a of data.actors || []) {
      if (!a || a.id == null) continue; // id 0 合法，只有 null/undefined 视为缺失
      this.tickFacts[a.id] = a;
      if (a.pos) this.pos[a.id] = a.pos;
      if (typeof a.alive === 'boolean') this.alive[a.id] = a.alive;
    }
  }

  dropIfCarrierDead(events) {
    const carrierId = this.bomb ? this.bomb.carrierId : null;
    if (carrierId == null || this.alive[carrierId] !== false) return;
    const pos = this.pos[carrierId] || null;
    this.bomb = { dropped: true, pos };
    events.push({ type: 'bombDropped', actorId: carrierId, reason: 'death', pos });
  }

  drainCommands(events) {
    const cmds = this.queue;
    this.queue = [];
    cmds.sort((a, b) => (COMMAND_PRIORITY[a.type] ?? 9) - (COMMAND_PRIORITY[b.type] ?? 9));
    for (const c of cmds) this.applyCommand(c, events);
  }

  applyCommand(c, events) {
    const fact = (id) => this.tickFacts[id] || {};
    switch (c.type) {
      case 'startPlant': {
        if (this.phase !== 'live') return;
        if (!this.bomb || this.bomb.carrierId !== c.actorId) return;
        if (!this.alive[c.actorId] || !isSite(fact(c.actorId).inSite) || this.action) return;
        this.action = { kind: 'plant', actorId: c.actorId, start: this.now };
        events.push({ type: 'plantStarted', actorId: c.actorId });
        return;
      }
      case 'stopPlant': {
        if (this.action && this.action.kind === 'plant' && this.action.actorId === c.actorId) {
          events.push({ type: 'plantCancelled', actorId: c.actorId, reason: 'released' });
          this.action = null;
        }
        return;
      }
      case 'startDefuse': {
        if (!this.defusable(c.actorId)) return;
        this.action = { kind: 'defuse', actorId: c.actorId, start: this.now };
        events.push({ type: 'defuseStarted', actorId: c.actorId });
        return;
      }
      case 'stopDefuse': {
        if (this.action && this.action.kind === 'defuse' && this.action.actorId === c.actorId) {
          events.push({ type: 'defuseCancelled', actorId: c.actorId, reason: 'released' });
          this.action = null;
        }
        return;
      }
      case 'dropBomb': {
        if (!this.bomb || this.bomb.carrierId !== c.actorId) return;
        if (this.phase !== 'prep' && this.phase !== 'live') return;
        const pos = c.pos !== undefined ? c.pos : this.pos[c.actorId] || null;
        this.bomb = { dropped: true, pos };
        events.push({ type: 'bombDropped', actorId: c.actorId, reason: 'discarded', pos });
        return;
      }
      case 'pickupBomb': {
        // 权威校验收敛到 pickupable()：掉落态/相位/阵营/存活/距离全部以引擎事实为准，
        // 不信任任何视图或调用方（视图同名字段只是本方法的只读镜像）
        if (!this.pickupable(c.actorId)) return;
        this.bomb = { carrierId: c.actorId };
        events.push({ type: 'bombPickedUp', actorId: c.actorId });
        return;
      }
    }
  }

  advance(dt, events) {
    this.now += dt;

    if (this.phase === 'prep' && this.now >= this.deadlines.prep) {
      this.phase = 'live';
      this.deadlines.live = this.deadlines.prep + this.rules.roundTime;
      events.push({ type: 'phaseLive' });
    }

    if (this.phase === 'live') {
      const plant = this.progressAction('plant', this.rules.plantHold, events);
      const timeoutDue = this.now >= this.deadlines.live;
      // 安包完成时刻早于（或不晚于，若超时还没到）超时期限则安包有效
      if (plant && (this.now < this.deadlines.live || plant.time <= this.deadlines.live)) {
        this.plantAt(plant, events);
      } else if (timeoutDue) {
        this.endRound('GR', 'timeout', events);
        return;
      }
    }

    if (this.phase === 'planted') {
      const defuse = this.progressAction('defuse', this.rules.defuseHold, events);
      const explosionDue = this.now >= this.deadlines.fuse;
      // 同一精确时刻平手判引爆：拆包必须严格早于引爆期限
      if (defuse && defuse.time < this.deadlines.fuse) {
        events.push({ type: 'bombDefused', actorId: defuse.actorId });
        this.endRound('GR', 'defused', events);
      } else if (explosionDue) {
        events.push({ type: 'bombExploded', site: this.plantedSite });
        this.endRound('BL', 'exploded', events);
      }
    }

    // 灭队检查按帧粒度采信事实；安包后 BL 全灭不结束回合，等待拆除或引爆
    if (this.phase === 'live' || this.phase === 'planted') {
      if (this.countAlive('GR') === 0) this.endRound('BL', 'grWiped', events);
      else if (this.phase === 'live' && this.countAlive('BL') === 0) this.endRound('GR', 'blWiped', events);
    }
  }

  // 推进当前安包/拆包动作；条件被外部事实打破则打断并重置进度，返回 undefined
  progressAction(kind, hold, events) {
    const act = this.action;
    if (!act || act.kind !== kind) return undefined;
    const reason = this.actionInvalidReason(act);
    if (reason) {
      events.push({
        type: kind === 'plant' ? 'plantCancelled' : 'defuseCancelled',
        actorId: act.actorId, reason,
      });
      this.action = null;
      return undefined;
    }
    const done = act.start + hold;
    if (this.now < done) return undefined;
    this.action = null;
    return { time: done, actorId: act.actorId };
  }

  actionInvalidReason(act) {
    const f = this.tickFacts[act.actorId] || {};
    if (this.alive[act.actorId] === false) return 'died';
    if (act.kind === 'plant' && (!this.bomb || this.bomb.carrierId !== act.actorId)) return 'lostBomb';
    if (act.kind === 'defuse' && !this.canDefuseAt(act.actorId)) return 'leftBomb';
    if (!isSite(f.inSite)) return 'leftSite';
    if (f.moving) return 'moved';
    if (f.damaged) return 'damaged';
    return null;
  }

  plantAt(plant, events) {
    const site = (this.tickFacts[plant.actorId] || {}).inSite;
    if (!isSite(site)) {
      // 防御：progressAction 放行时 site 必已合法；非法则按失去包点中断，绝不生成 planted
      events.push({ type: 'plantCancelled', actorId: plant.actorId, reason: 'leftSite' });
      return;
    }
    this.plantedSite = site;
    this.bomb = { planted: true, site, pos: this.pos[plant.actorId] || null };
    this.deadlines.fuse = plant.time + this.rules.fuseTime;
    this.phase = 'planted';
    events.push({ type: 'bombPlanted', actorId: plant.actorId, site });
  }

  endRound(winner, reason, events) {
    if (this.phase === 'roundEnd' || this.phase === 'matchEnd') return;
    this.phase = 'roundEnd';
    this.roundWinner = winner;
    this.score[winner]++;
    this.bomb = null;
    this.action = null;
    events.push({ type: 'roundEnded', winner, reason });
    if (this.score[winner] >= this.rules.winsNeeded) {
      this.phase = 'matchEnd';
      this.matchWinner = winner;
      events.push({ type: 'matchEnded', winner });
    }
  }

  countAlive(team) {
    return this.roster.filter((r) => r.team === team && this.alive[r.id] !== false).length;
  }

  // HUD/观战/交互提示用的状态快照（纯数据，可 JSON 序列化）
  snapshot() {
    const dl = this.phase === 'prep' ? this.deadlines.prep
      : this.phase === 'live' ? this.deadlines.live
      : this.phase === 'planted' ? this.deadlines.fuse : this.now;
    const act = this.action;
    return {
      phase: this.phase,
      round: this.round,
      score: { ...this.score },
      timeLeft: Math.max(0, dl - this.now),
      bomb: this.bomb ? { ...this.bomb } : null,
      plantProgress: act && act.kind === 'plant' ? Math.min(this.rules.plantHold, this.now - act.start) : 0,
      defuseProgress: act && act.kind === 'defuse' ? Math.min(this.rules.defuseHold, this.now - act.start) : 0,
      defuserId: act && act.kind === 'defuse' ? act.actorId : null,
      alive: { BL: this.countAlive('BL'), GR: this.countAlive('GR') },
      roundWinner: this.roundWinner,
      matchWinner: this.matchWinner,
    };
  }

  // 交互提示：持包者本帧事实下能否安包 / GR 能否拆包（基于最近一帧 facts）
  plantable(actorId) {
    return this.phase === 'live' && !!this.bomb && this.bomb.carrierId === actorId
      && this.alive[actorId] !== false && isSite(this.tickFacts[actorId]?.inSite) && !this.action;
  }

  defusable(actorId) {
    const row = this.roster.find((r) => r.id === actorId);
    return this.phase === 'planted' && !!row && row.team === 'GR'
      && this.alive[actorId] !== false && this.canDefuseAt(actorId) && !this.action;
  }

  canDefuseAt(actorId) {
    const bomb = this.bomb;
    const actor = this.pos[actorId];
    if (!bomb?.planted || !bomb.pos || !actor) return false;
    if (this.tickFacts[actorId]?.inSite !== bomb.site) return false;
    return Math.hypot(actor.x - bomb.pos.x, actor.y - bomb.pos.y, actor.z - bomb.pos.z) <= DEFUSE_RADIUS;
  }

  // 掉包拾取资格（命令与视图共用的唯一权威）：存活 BL、掉落态、相位允许，
  // 且最近一帧事实位置与掉点距离在 PICKUP_RADIUS 内；任一位置未知一律不可拾（绝不隔空取包）
  pickupable(actorId) {
    if (!this.bomb || !this.bomb.dropped) return false;
    if (this.phase !== 'prep' && this.phase !== 'live') return false;
    const row = this.roster.find((r) => r.id === actorId);
    if (!row || row.team !== 'BL' || this.alive[actorId] === false) return false;
    const p = this.pos[actorId], b = this.bomb.pos;
    if (!p || !b) return false;
    return Math.hypot(p.x - b.x, p.y - b.y, p.z - b.z) <= PICKUP_RADIUS;
  }
}
