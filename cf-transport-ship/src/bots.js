// 机器人 AI
import * as THREE from 'three';
import { Actor } from './actor.js';
import { createObjectivePlanner } from './ai/objective-planner.js';

export const DIFF = {
  easy: { react: [0.55, 0.9], aimErr: 0.075, turn: 3.2, track: 2.2, headP: 0.07, ctrl: 1.0, comp: 0.55, strafe: 0.35, see: 50, fov: 1.6, bunny: 0 },
  normal: { react: [0.38, 0.62], aimErr: 0.058, turn: 5.2, track: 3.2, headP: 0.12, ctrl: 0.85, comp: 0.8, strafe: 0.65, see: 62, fov: 1.85, bunny: 0.05 },
  hard: { react: [0.2, 0.34], aimErr: 0.032, turn: 8.5, track: 5.5, headP: 0.3, ctrl: 0.6, comp: 0.9, strafe: 0.85, see: 75, fov: 2.05, bunny: 0.12 },
  hell: { react: [0.12, 0.2], aimErr: 0.02, turn: 13, track: 8.5, headP: 0.5, ctrl: 0.42, comp: 0.95, strafe: 1, see: 95, fov: 2.3, bunny: 0.2 },
};

export const BOT_NAMES = [
  '丶夜猫子', 'CF灬战神', '狙神小白', '枪王之王', '火麒麟丶', '无敌小旋风', '天使の翼', '爆头专业户', '穿越者丨龙', '雷神M4',
  '灬冷血杀手', '沙鹰一哥', '老六本六', '我是菜鸟', '运输船之王', 'Sniper丶K', '二楼架枪', '管道守门员', '一枪一个', '闪电侠丶',
  '黑名单丶影', '保卫者老王', '夜袭者', '零度丶', '狂暴战神', '别打我头', '满血复活', '疾风步',
];

// 各阵营的架点 / 分路与包抄点来自地图描述（game.mapDesc.ai），坐标为潜伏者侧，保卫者取反

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const wrapPi = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export class Bot extends Actor {
  constructor(game, o) {
    super(game, o);
    this.diff = DIFF[o.diff] || DIFF.normal;
    this.recoilControl = this.diff.ctrl;
    this.path = null; this.pi = 0; this.goal = null;
    this.target = null; this.visible = false; this.lastSeen = null; this.lastSeenT = -99; this.reactUntil = 0;
    this.errY = 0; this.errP = 0; this.aimHead = false;
    this.strafeDir = 1; this.strafeT = 0; this.burst = 0; this.burstPauseUntil = 0;
    this.thinkT = Math.random() * 0.2; this.stuckT = 0; this.stuckN = 0; this.lastCheck = new THREE.Vector3();
    this.role = 'rush'; this.holdT = 0; this.crouchUntil = 0; this.nadeT = 20 + Math.random() * 20;
    this.heard = null; this.heardT = -99;
    this.enemyMemory = new Map(); // id -> {pos, time}：最后已知位置（带过期时间）
    this.bombMode = false; // 爆破目标层开关（onSpawn 按 Game.bomb 判定）
    this.visibleList = [];
    this.objGoal = null; this.objRole = null; this.objSite = null;
    this.objSig = null; this.objPlanAt = -99; this.planner = null; this.intelMaxAge = 12;
    this.holdUntil = 0; this.objCmdType = null; this.objCmdT = -99;
    this.fireHeld = false;
    this.wantJump = false;
    this.side = this.team === 'BL' ? 1 : -1; // 潜伏者坐标系转换
  }
  onSpawn() {
    this.path = null; this.goal = null; this.target = null; this.visible = false; this.lastSeen = null;
    this.enemyMemory.clear(); this.visibleList = [];
    this.bombMode = !!this.game.bomb;
    if (this.bombMode) {
      // 爆破：角色/目标由目标规划层按回合决定，不做 TDM 随机分路
      this.role = 'rush'; this.stage = 0; this.lane = undefined;
      this.objGoal = null; this.objRole = null; this.objSig = null; this.objPlanAt = -99;
      this.planner = null; this.holdYaw = undefined; this.holdUntil = 0;
      this.objCmdType = null; this.objCmdT = -99; this.holdT = 0;
      return;
    }
    const r = Math.random();
    this.role = this.primary === 'awm' ? 'hold' : r < 0.25 ? 'flank' : 'rush';
    const lanes = this.game.mapDesc.ai?.lanes;
    if (lanes) this.lane = lanes[(Math.random() * lanes.length) | 0];
    this.stage = 0;
    this.pickGoal();
  }
  L(x, z) { return [x * this.side, z * this.side]; } // 己方坐标 -> 世界（对称地图）
  // ---- 共享导航 API（findPath(start, goal, agent) / randomFree(rnd, bounds)）----
  navAgent() { return { radius: this.radius, height: this.height, canCrouch: true, canJump: true }; }
  // 兼容两种路径点形态：共享导航 [{x,y,z,requires?}] 与旧网格适配层的 [x,z]
  wp(wp) { return Array.isArray(wp) ? { x: wp[0], y: this.pos.y, z: wp[1] } : wp; }
  goal3D() {
    return Array.isArray(this.goal)
      ? { x: this.goal[0], y: this.pos.y, z: this.goal[1] }
      : { x: this.goal.x, y: this.goal.y, z: this.goal.z };
  }
  goalXZ() { return Array.isArray(this.goal) ? this.goal : [this.goal.x, this.goal.z]; }
  // 非对称地图（navGraph + teamGoals）：从己方目标节点池选目标
  // 潜伏者/保卫者各自有独立目标集与路线，不复用旧对称镜像假设
  pickGraphNode(rnd) {
    const g = this.game;
    const nodes = g.navNodes, tg = (g.map && g.map.teamGoals) || g.mapDesc.teamGoals;
    if (!nodes || !nodes.size || !tg || !tg[this.team] || !tg[this.team].length) return null;
    const pool = tg[this.team].map((id) => nodes.get(id)).filter(Boolean);
    if (!pool.length) return null;
    if (this.role === 'flank' && rnd() < 0.7) {
      // 侧翼：偏向离敌方目标节点最深（最远）的目标
      const enemyGoals = (tg[this.team === 'BL' ? 'GR' : 'BL'] || []).map((id) => nodes.get(id)).filter(Boolean);
      if (enemyGoals.length) {
        let best = null, bd = -1;
        for (const p of pool) {
          const d = Math.min(...enemyGoals.map((e) => Math.hypot(e.x - p.x, e.z - p.z)));
          if (d > bd) { bd = d; best = p; }
        }
        if (best) return best;
      }
    }
    return pool[(rnd() * pool.length) | 0];
  }
  // 架点朝向：面向离架点最近的敌方目标节点（公开的地图目标信息，不做全知透视）
  holdFaceYaw(node) {
    const g = this.game;
    const nodes = g.navNodes, tg = (g.map && g.map.teamGoals) || g.mapDesc.teamGoals;
    const enemy = tg && nodes ? (tg[this.team === 'BL' ? 'GR' : 'BL'] || []).map((id) => nodes.get(id)).filter(Boolean) : [];
    if (!enemy.length) return this.yaw;
    let best = enemy[0], bd = 1e9;
    for (const e of enemy) { const d = Math.hypot(e.x - node.x, e.z - node.z); if (d < bd) { bd = d; best = e; } }
    return Math.atan2(-(best.x - node.x), -(best.z - node.z));
  }
  pickGoal() {
    const g = this.game, nav = g.nav, rnd = Math.random, AI = g.mapDesc.ai;
    const node = this.pickGraphNode(rnd);
    if (node) {
      this.goal = { x: node.x, y: node.y, z: node.z };
      if (this.role === 'hold') this.holdYaw = this.holdFaceYaw(node);
    } else if (AI) {
      // 对称地图（运输船）：保留既有镜像 AI 坐标
      let gx, gz;
      if (this.role === 'hold') {
        const h = AI.holds[(rnd() * AI.holds.length) | 0];
        [gx, gz] = this.L(h[0], h[1]);
        this.holdYaw = this.side > 0 ? -Math.PI / 2 + h[2] : Math.PI / 2 + h[2];
      } else if (this.role === 'flank' && this.stage < 3) {
        [gx, gz] = this.L(...AI.flank[this.stage]);
      } else if (this.stage < 1) {
        [gx, gz] = this.L(AI.rushZone.x0 + rnd() * (AI.rushZone.x1 - AI.rushZone.x0), this.lane + (rnd() - 0.5) * 2);
      } else {
        const p = nav.randomFree(rnd, { x0: AI.roam.x0, z0: AI.roam.z0, x1: AI.roam.x1, z1: AI.roam.z1 });
        if (Array.isArray(p)) [gx, gz] = p;
        else if (p) { gx = p.x; gz = p.z; }
        else [gx, gz] = this.L(10, 0);
      }
      this.goal = [gx, gz];
    } else {
      // 无 AI 常量也无导航图时的兜底：在可玩边界内随机游走
      const B = g.mapDesc.bounds;
      this.goal = { x: B.x0 + rnd() * (B.x1 - B.x0), y: this.pos.y, z: B.z0 + rnd() * (B.z1 - B.z0) };
    }
    this.path = nav.findPath({ x: this.pos.x, y: this.pos.y, z: this.pos.z }, this.goal3D(), this.navAgent());
    this.pi = 1;
  }
  // ================= 爆破目标层 =================
  // 只消费公共契约：Game.bomb / objectiveView / objectiveCommand + 公开地图元数据。
  // 观察仅由自身/己方/可见敌人/声音/带时间戳的最后已知位置/公开 C4 构成，无全知。
  makePlanner() {
    const g = this.game;
    this.planner = createObjectivePlanner({
      seed: g.objectiveSeed ?? 0,
      map: { bombSites: (g.map && g.map.bombSites) || [] },
      intelMaxAge: this.intelMaxAge,
      attackerTeam: 'BL',
    });
  }
  c4FromView(bomb) {
    if (!bomb) return { state: 'none' };
    if (bomb.planted) return { state: 'planted', site: bomb.site ?? null, position: bomb.pos ? { ...bomb.pos } : null };
    if (bomb.dropped) return { state: 'dropped', position: bomb.pos ? { ...bomb.pos } : null };
    if (bomb.carrierId != null) return { state: 'carried', carrierId: bomb.carrierId };
    return { state: 'none' };
  }
  buildObjectiveObs(view) {
    const g = this.game, now = g.time;
    const team = [];
    for (const a of g.actors) {
      if (a.team !== this.team) continue;
      team.push({ id: a.id, position: { x: a.pos.x, y: a.pos.y, z: a.pos.z }, alive: !!a.alive });
    }
    const enemies = { visible: [], lastKnown: [], heard: [] };
    for (const e of this.visibleList) {
      enemies.visible.push({ id: e.id, position: { x: e.pos.x, y: e.pos.y, z: e.pos.z } });
    }
    for (const [id, rec] of this.enemyMemory) {
      if (now - rec.time <= this.intelMaxAge) {
        enemies.lastKnown.push({ id, position: { x: rec.pos.x, y: rec.pos.y, z: rec.pos.z }, time: rec.time });
      }
    }
    if (this.heard && now - this.heardT <= this.intelMaxAge) {
      enemies.heard.push({ position: { x: this.heard.x, y: this.heard.y, z: this.heard.z }, time: this.heardT });
    }
    return {
      now,
      round: (view && view.round) ?? 1,
      self: { id: this.id, team: this.team, position: { x: this.pos.x, y: this.pos.y, z: this.pos.z } },
      team,
      c4: this.c4FromView(view && view.bomb),
      enemies,
    };
  }
  repathObjective() {
    this.path = this.game.nav.findPath(
      { x: this.pos.x, y: this.pos.y, z: this.pos.z },
      { x: this.objGoal.x, y: this.objGoal.y ?? this.pos.y, z: this.objGoal.z },
      this.navAgent()
    );
    this.pi = 1; this.holdT = 0;
  }
  replanObjective(view) {
    const plan = this.planner.plan(this.buildObjectiveObs(view));
    this.objRole = plan.role; this.objIntent = plan.intent; this.objSite = plan.site;
    const hold = plan.role === 'anchor' || plan.role === 'guard' || plan.role === 'cover';
    this.role = hold ? 'hold' : 'rush';
    const goal = plan.goal;
    if (!goal) { // 规划器诚实降级：回退常规游走
      this.objGoal = null; this.holdYaw = undefined;
      if (!this.path || this.pi >= this.path.length) this.pickGoal();
      return;
    }
    const changed = !this.objGoal
      || Math.hypot(goal.x - this.objGoal.x, goal.z - this.objGoal.z) > 1.5;
    this.objGoal = goal;
    // 已在目标近旁时不重复寻路（守点/架点状态），避免每拍空耗 findPath
    const dNew = Math.hypot(goal.x - this.pos.x, goal.z - this.pos.z);
    if ((changed || !this.path || this.pi >= this.path.length) && dNew > 1.6) this.repathObjective();
    this.holdYaw = hold ? this.holdFaceYaw(goal) : undefined;
  }
  nearSitePoint() {
    const sites = (this.game.map && this.game.map.bombSites) || [];
    for (const s of sites) {
      if (Math.hypot(s.x - this.pos.x, s.z - this.pos.z) < (s.radius || 5) * 0.9) return true;
    }
    return false;
  }
  objCmd(type, pos) {
    const now = this.game.time;
    if (this.objCmdType === type && now - this.objCmdT < 0.8) return;
    this.objCmdType = type; this.objCmdT = now;
    this.game.objectiveCommand(type, this.id, pos);
  }
  objectiveThink() {
    const g = this.game, now = g.time;
    const view = g.objectiveView ? g.objectiveView(this.id) : null;
    if (!view) { // 非爆破回合阶段（如 idle）：回退常规游走
      if (!this.path || this.pi >= this.path.length) this.pickGoal();
      return;
    }
    if (!this.planner) this.makePlanner();
    const bomb = view.bomb || {};
    const sig = view.phase + '|'
      + (bomb.planted ? 'p' + (bomb.site ?? '') + (bomb.pos ? '1' : '0')
        : bomb.dropped ? 'd' : bomb.carrierId != null ? 'c' + bomb.carrierId : 'n');
    if (now - this.objPlanAt >= 0.5 || sig !== this.objSig) {
      this.objPlanAt = now; this.objSig = sig;
      this.replanObjective(view);
    }
    const c4 = this.c4FromView(bomb);
    const c4Pos = c4.state === 'planted' || c4.state === 'dropped' ? c4.position : null;
    const dC4 = c4Pos ? Math.hypot(c4Pos.x - this.pos.x, c4Pos.z - this.pos.z) : 1e9;
    // 到点后的目标动作：命令统一走 Game.objectiveCommand 公共路径
    if (this.objRole === 'carrier' && c4.state === 'carried' && c4.carrierId === this.id
        && !(view.plantProgress > 0)
        && (view.plantable === true || (view.plantable === undefined && this.nearSitePoint()))) {
      this.objCmd('startPlant');
      this.holdUntil = now + 0.3; // 安包期间站定（移动/受伤由引擎事实中断）
    } else if (c4.state === 'dropped' && c4Pos && dC4 < 1.7 && view.pickupable !== false) {
      this.objCmd('pickupBomb');
    } else if (this.objRole === 'defuser' && c4.state === 'planted'
        && !view.defuserId
        && (view.defusable === true || (view.defusable === undefined && dC4 < 1.8))) {
      this.objCmd('startDefuse');
      this.holdUntil = now + 0.3;
    }
    if ((view.plantProgress > 0 && c4.state === 'carried') || view.defuserId === this.id) {
      this.holdUntil = now + 0.3;
    }
    // 交战中不重算路径；脱离交战且无路可走时回到当前目标
    const dGoal = this.objGoal ? Math.hypot(this.objGoal.x - this.pos.x, this.objGoal.z - this.pos.z) : 1e9;
    if (!this.visible && this.objGoal && dGoal > 1.6 && (!this.path || this.pi >= this.path.length)) {
      this.repathObjective();
    }
    if (this.objGoal && dGoal < 1.6 && this.holdYaw === undefined) {
      this.holdYaw = this.holdFaceYaw(this.objGoal); // 到点守候朝向
    }
  }
  hear(pos, loud) {    if (!this.alive || this.visible) return;
    this.heard = pos.clone(); this.heardT = this.game.time; this.heardLoud = loud;
  }
  onDamaged(att) {
    if (!att || !this.alive) return;
    this.enemyMemory.set(att.id, { pos: { x: att.pos.x, y: att.pos.y, z: att.pos.z }, time: this.game.time });
    if (!this.visible || this.target !== att) {
      this.lastSeen = att.pos.clone(); this.lastSeenT = this.game.time;
      if (!this.visible) {
        this.target = att;
        // 朝攻击者方向扭头（带误差）
        const dx = att.pos.x - this.pos.x, dz = att.pos.z - this.pos.z;
        this.lookYaw = Math.atan2(-dx, -dz) + (Math.random() - 0.5) * 0.5;
      }
    }
  }
  canSee(t) {
    const g = this.game;
    const e = this.eye(_v);
    const dist = e.distanceTo(t.pos);
    if (dist > this.diff.see) return false;
    // 视野角
    const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z;
    const ang = Math.abs(wrapPi(Math.atan2(-dx, -dz) - this.yaw));
    if (ang > this.diff.fov / 2 && dist > 6) return false;
    for (const pt of [t.soldier.headWorld(_v2), t.soldier.chestWorld(_v3)]) {
      const d = pt.clone().sub(e); const L = d.length(); d.divideScalar(L);
      if (!g.world.raycast(e.x, e.y, e.z, d.x, d.y, d.z, L - 0.1, 'sight')) return true;
    }
    return false;
  }
  combatUpkeep(now) {
    // 换弹
    const w = this.weapon;
    if (w.def.mag > 1 && w.mag < w.def.mag * 0.5 && w.canReload() && now - this.lastSeenT > 1.2) this.startReload();
    // 手雷
    this.nadeT -= 0.15;
    if (this.nadeT <= 0 && this.lastSeen && now - this.lastSeenT < 3 && this.inv[3].mag > 0) {
      const d = this.lastSeen.distanceTo(this.pos);
      if (d > 7 && d < 24 && Math.random() < 0.35) { this.nadePlan = this.lastSeen.clone(); this.nadeT = 25 + Math.random() * 25; }
    }
  }
  think() {
    const g = this.game, now = g.time;
    // 感知
    let best = null, bestD = 1e9;
    const seen = [];
    for (const a of g.actors) {
      if (!a.alive || a.team === this.team) continue;
      if (!this.canSee(a)) continue;
      const d = a.pos.distanceTo(this.pos);
      if (d < bestD) { best = a; bestD = d; }
      seen.push(a);
      this.enemyMemory.set(a.id, { pos: { x: a.pos.x, y: a.pos.y, z: a.pos.z }, time: now });
    }
    this.visibleList = seen;
    if (best) {
      if (!this.visible || this.target !== best) {
        const [r0, r1] = this.diff.react;
        const surprise = this.target === best && now - this.lastSeenT < 1.5 ? 0.4 : 1;
        this.reactUntil = now + (r0 + Math.random() * (r1 - r0)) * surprise;
        const k = this.diff.aimErr * (0.8 + bestD / 28);
        const a = Math.random() * Math.PI * 2;
        this.errY = Math.cos(a) * k * 1.3; this.errP = Math.sin(a) * k * 0.8 - k * 0.1;
        this.aimHead = Math.random() < this.diff.headP;
        this.burst = 0;
      }
      this.target = best; this.visible = true; this.lastSeen = best.pos.clone(); this.lastSeenT = now;
      this.path = null;
    } else {
      this.visible = false;
      if (this.target && (!this.target.alive || now - this.lastSeenT > 5)) this.target = null;
    }
    // 移动决策
    if (this.bombMode) {
      // 爆破：目标规划层驱动移动与 C4 命令（听声/追LastSeen交给规划器情报，不额外追击）
      this.objectiveThink();
      if (!this.visible) this.combatUpkeep(now);
      else {
        // 狙击：开镜
        const w = this.weapon;
        if (w.def.type === 'sniper' && !this.scoped && bestD > 7 && now >= w.boltUntil) this.wantScope = true;
        if (Math.random() < 0.12 * this.diff.strafe) this.crouchUntil = now + 0.6 + Math.random() * 1.2;
      }
    } else if (!this.visible) {
      if (this.lastSeen && now - this.lastSeenT < 5 && this.role !== 'hold') {
        if (!this.path || this.huntFor !== this.lastSeenT) {
          this.path = g.nav.findPath({ x: this.pos.x, y: this.pos.y, z: this.pos.z }, { x: this.lastSeen.x, y: this.lastSeen.y, z: this.lastSeen.z }, this.navAgent());
          this.pi = 1; this.huntFor = this.lastSeenT;
        }
      } else if (this.heard && now - this.heardT < 3 && this.role !== 'hold' && Math.random() < 0.5) {
        this.path = g.nav.findPath({ x: this.pos.x, y: this.pos.y, z: this.pos.z }, { x: this.heard.x, y: this.pos.y, z: this.heard.z }, this.navAgent()); this.pi = 1;
        this.lookYaw = Math.atan2(-(this.heard.x - this.pos.x), -(this.heard.z - this.pos.z));
        this.heard = null;
      } else if (!this.path || this.pi >= this.path.length) {
        const [gx, gz] = this.goal ? this.goalXZ() : [this.pos.x, this.pos.z];
        const goalY = this.goal && !Array.isArray(this.goal) ? this.goal.y : this.pos.y;
        if (this.role === 'hold' && this.goal && this.pos.distanceTo(_v.set(gx, this.pos.y, gz)) < 1.2 && Math.abs(goalY - this.pos.y) < 2) {
          this.holdT += 0.15;
          if (this.holdT > 25 + Math.random() * 20) { this.holdT = 0; this.pickGoal(); }
        } else { this.stage++; this.pickGoal(); }
      }
      this.combatUpkeep(now);
    } else {
      // 狙击：开镜
      const w = this.weapon;
      if (w.def.type === 'sniper' && !this.scoped && bestD > 7 && now >= w.boltUntil) this.wantScope = true;
      if (Math.random() < 0.12 * this.diff.strafe) this.crouchUntil = now + 0.6 + Math.random() * 1.2;
    }
    // 卡住检测
    this.stuckT += 0.15;
    if (this.stuckT > 1.0) {
      const moved = this.lastCheck.distanceTo(this.pos);
      if (this.path && this.pi < this.path.length && moved < 0.35 && !this.visible && now >= this.holdUntil) {
        this.stuckN++; this.wantJump = true;
        if (this.stuckN > 2) {
          this.stuckN = 0;
          if (this.bombMode) { // 遇阻重规划：丢弃当前目标路径，下一拍重算（不传送）
            this.objGoal = null; this.objPlanAt = -99; this.path = null;
          } else { this.stage++; this.pickGoal(); }
        }
      } else this.stuckN = 0;
      this.lastCheck.copy(this.pos); this.stuckT = 0;
    }
  }
  update(dt) {
    const g = this.game, now = g.time;
    if (!this.alive) return;
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = 0.13 + Math.random() * 0.06; this.think(); }
    const D = this.diff;
    let wishX = 0, wishZ = 0, fire = false, firePressed = false, alt = false, crouch = now < this.crouchUntil, walk = false;
    let sw = null;
    // 手雷投掷流程
    if (this.nadePlan) {
      if (this.slot !== 3) sw = 3;
      else if (now >= this.readyAt && !this.pendingThrow) {
        const d = this.nadePlan.distanceTo(this.pos);
        this.lookYaw = Math.atan2(-(this.nadePlan.x - this.pos.x), -(this.nadePlan.z - this.pos.z));
        this.lookPitch = 0.25 + d * 0.012;
        firePressed = true; this.nadePlan = null;
      }
    } else if (this.slot === 3 && this.inv[3].mag <= 0 && !this.pendingThrow && !this.autoSwitchAt) sw = 0;
    // 瞄准
    let dYaw = this.yaw, dPitch = this.pitch;
    const tgt = this.target;
    if (tgt && tgt.alive && this.visible) {
      const e = this.eye(_v);
      const p = this.aimHead ? tgt.soldier.headWorld(_v2) : tgt.soldier.chestWorld(_v2);
      p.addScaledVector(tgt.vel, 0.08);
      const dx = p.x - e.x, dy = p.y - e.y, dz = p.z - e.z, hd = Math.hypot(dx, dz);
      const trueYaw = Math.atan2(-dx, -dz), truePitch = Math.atan2(dy, hd);
      const k = Math.exp(-D.track * dt);
      this.errY *= k; this.errP *= k;
      const wob = 0.004 * (1 + tgt.speed / 4);
      dYaw = trueYaw + this.errY + Math.sin(now * 3.1 + this.id) * wob;
      dPitch = truePitch + this.errP + Math.cos(now * 2.7 + this.id) * wob * 0.6 - this.punchP * D.comp;
      this.lookYaw = undefined; this.lookPitch = undefined;
      // 开火判断
      const aimErr = Math.hypot(wrapPi(this.yaw - trueYaw), this.pitch - truePitch);
      const tol = Math.atan2(0.32, hd) * 1.4 + 0.01;
      const w = this.weapon, d = w.def;
      if (now >= this.reactUntil && aimErr < tol && now >= this.readyAt && !this.nadePlan) {
        if (d.type === 'sniper') { if (this.scoped && this.scopeReady && aimErr < tol * 0.6) firePressed = true; }
        else if (d.type === 'pistol') { firePressed = Math.random() < dt * 5; }
        else if (now >= this.burstPauseUntil) {
          fire = true;
          if (hd > 14) {
            this.burst++;
            if (this.burst > 3 + Math.random() * 4) { this.burst = 0; this.burstPauseUntil = now + 0.18 + Math.random() * 0.3 * (hd / 30); }
          }
        }
      }
      if (this.wantScope) { alt = true; this.wantScope = false; }
      // 横移
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafeT = 0.25 + Math.random() * 0.7; this.strafeDir = Math.random() < 0.5 ? -1 : 1; if (Math.random() < 0.2) this.strafeDir = 0; }
      const moveK = d.type === 'sniper' ? 0 : D.strafe;
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      wishX = rx * this.strafeDir * moveK; wishZ = rz * this.strafeDir * moveK;
      if (hd > 22 && d.type !== 'sniper' && this.role !== 'hold') { wishX += -Math.sin(this.yaw) * 0.5; wishZ += -Math.cos(this.yaw) * 0.5; }
      if (Math.random() < D.bunny * dt && this.onGround && d.type !== 'sniper') this.wantJump = true;
    } else {
      if (this.scoped && !this.visible && now - this.lastSeenT > 2) alt = true; // 收镜
      // 沿路径行走（路径点带真实 y 与通过要求；移动始终经 World 物理，不跨高度瞬移）
      if (this.path && this.pi < this.path.length) {
        const wp = this.wp(this.path[this.pi]);
        const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z, dd = Math.hypot(dx, dz);
        if (dd < 0.55) this.pi++;
        else {
          wishX = dx / dd; wishZ = dz / dd;
          // 通过要求：蹲行通道压低身位；需要跳跃的连接在贴近时起跳
          if (wp.requires === 'crouch') crouch = true;
          else if (wp.requires === 'jump' && dd < 1.4 && this.onGround) this.wantJump = true;
        }
        if (this.lookYaw === undefined || now - this.heardT > 1.5) dYaw = Math.atan2(-dx, -dz);
        dPitch = 0;
        walk = this.role === 'flank' && this.stage === 1;
      } else if ((this.role === 'hold' || this.bombMode) && this.holdYaw !== undefined) {
        dYaw = this.holdYaw + Math.sin(now * 0.4 + this.id) * 0.35; dPitch = -0.02;
        crouch = crouch || Math.sin(now * 0.3 + this.id) > 0.3;
      }
      if (this.lookYaw !== undefined) { dYaw = this.lookYaw; if (this.lookPitch !== undefined) dPitch = this.lookPitch; }
    }
    // 队友分离
    for (const a of g.actors) {
      if (a === this || !a.alive) continue;
      const dx = this.pos.x - a.pos.x, dz = this.pos.z - a.pos.z, d2 = dx * dx + dz * dz;
      if (d2 < 1.2 && d2 > 1e-4) { const d = Math.sqrt(d2); wishX += dx / d * 0.6; wishZ += dz / d * 0.6; }
    }
    // 转向（限速）
    const turn = D.turn * dt * (this.visible ? 1 : 0.7);
    const ey = wrapPi(dYaw - this.yaw);
    this.yaw = wrapPi(this.yaw + THREE.MathUtils.clamp(ey, -turn, turn));
    this.pitch += THREE.MathUtils.clamp(dPitch - this.pitch, -turn * 0.6, turn * 0.6);
    // 移动 & 武器
    if (now < this.holdUntil) { wishX = 0; wishZ = 0; } // 安/拆包进行中站定
    this.move(dt, wishX, wishZ, this.wantJump, crouch, walk);
    this.wantJump = false;
    const w = this.weapon;
    this.weaponUpdate(dt, { fire, firePressed: firePressed || (fire && !this.fireHeld), alt, altPressed: alt, reload: false, sw });
    this.fireHeld = fire;
    void w;
  }
}
