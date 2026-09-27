// 爆破目标型 AI 行为测试（node --test）
// 只观察公共契约面：Game.bomb / objectiveView / objectiveCommand + 机器人真实移动方向。
// 不读 bots.js 私有字段，不断言纯 planner 返回值。
// 说明：Soldier/枪械贴图在构造时才访问 canvas，测试先装 DOM stub 再动态导入 src 模块。
const document = globalThis.document = {
  createElement(tag) {
    if (tag !== 'canvas') return {};
    const canvas = { width: 0, height: 0 };
    const grad = { addColorStop() {} };
    const ctx = new Proxy({}, {
      get(t, k) {
        if (k === 'canvas') return canvas;
        if (k === 'createImageData' || k === 'getImageData') {
          return (a, b, w, h) => {
            const W = k === 'createImageData' ? a : w, H = k === 'createImageData' ? b : h;
            return { width: W, height: H, data: new Uint8ClampedArray(W * H * 4) };
          };
        }
        if (k === 'measureText') return () => ({ width: 0 });
        if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
        if (k in t) return t[k];
        return () => {};
      },
      set(t, k, v) { t[k] = v; return true; },
    });
    canvas.getContext = () => ctx;
    return canvas;
  },
};
const { test } = await import('node:test');
const assert = (await import('node:assert/strict')).default;
const { Bot } = await import('../../src/bots.js');
const { Vector3 } = await import('three');

// 公开地图元数据（与 desert-grey 一致的两包点）
const SITES = [
  { id: 'A', x: 39, y: 2.3, z: -28, radius: 5.5 },
  { id: 'B', x: -36, y: 0, z: -24, radius: 5.5 },
];
const sitePos = (id) => SITES.find((s) => s.id === id);

// —— 测试用 Game：只实现 Bot 依赖的公共接口 + 契约方法 objectiveView/objectiveCommand ——
function makeGame({ bomb = {}, phase = 'live', round = 1, freeze = null, seed = 0 } = {}) {
  const game = {
    bomb, // 契约：爆破模式下为真值（BombMatch 由 RULES lane 提供），null 为非爆破
    time: 0,
    actors: [],
    renderer: { scene: { add() {}, remove() {} } },
    mapDesc: { bounds: { x0: -44, z0: -38, x1: 44, z1: 38 }, spawnYFallback: 0.02 },
    map: { bombSites: SITES },
    navNodes: new Map(),
    findPathCalls: 0,
    viewCalls: 0,
    commands: [],
    action: null, // {kind, actor, start}：模拟规则引擎中的一次安/拆动作
    state: { bomb, phase, round },
    freeze,
    objectiveSeed: seed,
    nav: {
      findPath(start, goal) {
        game.findPathCalls++;
        return [{ x: start.x, y: start.y, z: start.z }, { x: goal.x, y: goal.y, z: goal.z }];
      },
    },
    world: {
      raycast: () => false, // 测试中无遮挡
      blocked: () => false,
      move(a, dt) {
        if (game.freeze && game.freeze.has(a.id)) return;
        a.pos.x += a.vel.x * dt; a.pos.y += a.vel.y * dt; a.pos.z += a.vel.z * dt;
        if (a.pos.y < a._ground) { a.pos.y = a._ground; a.vel.y = 0; }
        a.onGround = true;
      },
    },
    objectiveView(actorId) {
      game.viewCalls++;
      const self = game.actors.find((a) => a.id === actorId);
      if (!self) return null;
      const st = game.state;
      const bomb2 = st.bomb && st.bomb.state === 'carried' ? { carrierId: st.bomb.carrierId }
        : st.bomb && st.bomb.state === 'dropped' ? { dropped: true, pos: st.bomb.pos }
        : st.bomb && st.bomb.state === 'planted' ? { planted: true, site: st.bomb.site, pos: st.bomb.pos }
        : null;
      const d2 = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
      let plantable = false, defusable = false, pickupable = false;
      if (bomb2 && bomb2.carrierId === actorId && st.phase === 'live'
          && SITES.some((s) => d2(s, self.pos) < s.radius)) plantable = true;
      if (bomb2 && bomb2.planted && self.team === 'GR' && self.alive && bomb2.pos
          && d2(bomb2.pos, self.pos) < 5.5) defusable = true;
      if (bomb2 && bomb2.dropped && self.team === 'BL' && bomb2.pos
          && d2(bomb2.pos, self.pos) < 1.6) pickupable = true;
      return {
        phase: st.phase, round: st.round, bomb: bomb2,
        plantable, defusable, pickupable,
        plantProgress: game.action && game.action.kind === 'plant'
          ? Math.min(5, game.time - game.action.start) : 0,
        defuserId: game.action && game.action.kind === 'defuse' ? game.action.actor : null,
      };
    },
    objectiveCommand(type, actorId, pos) {
      game.commands.push({ type, actorId, pos, t: game.time });
      // 模拟规则引擎的最小命令结算（范围/归属校验 + 进度推进），供 view 提示回读
      const self = game.actors.find((a) => a.id === actorId);
      if (!self) return;
      const st = game.state;
      const nearSite = SITES.some((s) => Math.hypot(s.x - self.pos.x, s.z - self.pos.z) < s.radius);
      if (type === 'startPlant' && st.phase === 'live' && st.bomb.state === 'carried'
          && st.bomb.carrierId === actorId && nearSite && !game.action) {
        game.action = { kind: 'plant', actor: actorId, start: game.time };
      }
      if (type === 'startDefuse' && st.phase === 'planted' && self.team === 'GR'
          && st.bomb.pos && Math.hypot(st.bomb.pos.x - self.pos.x, st.bomb.pos.z - self.pos.z) < 5.5
          && !game.action) {
        game.action = { kind: 'defuse', actor: actorId, start: game.time };
      }
    },
    onJump() {}, onFootstep() {}, onLand() {}, onSwitch() {}, onScope() {},
    onReloadStart() {}, onReloadDone() {}, onGrenadeStart() {}, onDryFire() {},
    onReload() {}, fireWeapon() {}, melee() {}, throwGrenade() {}, onScopeChange() {},
  };
  return game;
}

function addBot(game, id, team, x, z, yaw = 0) {
  const b = new Bot(game, { id, name: 'b' + id, team, diff: 'normal' });
  b._ground = 0.02;
  b.spawn({ x, y: 0.02, z, yaw });
  b.onSpawn();
  b.thinkT = 0;
  game.actors.push(b);
  return b;
}

function step(game, seconds, dt = 0.15) {
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    game.time += dt;
    for (const b of game.actors) if (b.alive) b.update(dt);
  }
}
const dist2 = (a, p) => Math.hypot(a.pos.x - p.x, a.pos.z - p.z);

test('分路：持包者与队友走向不同包点，持包者到点后安包并站定', () => {  const game = makeGame({ bomb: { state: 'carried', carrierId: 1 } });
  const a1 = addBot(game, 1, 'BL', -8, 32);
  const a2 = addBot(game, 2, 'BL', 8, 32);
  step(game, 4);
  // 两名进攻方朝相反的东西方向分路（A 在东 x=39，B 在西 x=-36）
  const dx1 = a1.pos.x + 8, dx2 = a2.pos.x - 8;
  assert(dx1 * dx2 < 0, `两人应分向不同包点（dx1=${dx1}, dx2=${dx2}）`);
  // 持包者最终走到某包点并下达安包命令，队友不下安包命令
  step(game, 20);
  const plants = game.commands.filter((c) => c.type === 'startPlant');
  assert(plants.some((c) => c.actorId === 1), '持包者应下达 startPlant');
  assert(!plants.some((c) => c.actorId === 2), '非持包者不得下达 startPlant');
  // 安放动作进行中（进度>0）：持包者站定，不因走动打断
  assert(game.action && game.action.kind === 'plant', '安包动作应已开始');
  step(game, 0.5); // 等待物理滑行减速
  const before = a1.pos.clone();
  step(game, 1);
  assert(before.distanceTo(a1.pos) < 0.15, `安包中不应移动（moved=${before.distanceTo(a1.pos)}）`);
});

test('掉包：最近的进攻方拾取 C4，其余维持分路', () => {
  const game = makeGame({ bomb: { state: 'dropped', pos: { x: 0, y: 0, z: 12 } } });
  const a1 = addBot(game, 1, 'BL', -2, 20); // 距掉落点约 8.2m，应为拾取者
  const a2 = addBot(game, 2, 'BL', 6, 20);
  const d0 = dist2(a1, { x: 0, z: 12 });
  step(game, 12);
  const picks = game.commands.filter((c) => c.type === 'pickupBomb');
  assert(picks.length > 0 && picks[0].actorId === 1, '最近的 a1 应最先尝试拾取');
  assert(dist2(a1, { x: 0, z: 12 }) < d0 - 5, `a1 应真实接近掉落点（${dist2(a1, { x: 0, z: 12 })} < ${d0 - 5}）`);
  assert(!game.commands.some((c) => c.type === 'startPlant' || c.type === 'startDefuse'), '无安/拆命令');
});

test('安放后：进攻方全员转为守包，向安放点移动', () => {
  const game = makeGame({ bomb: { state: 'planted', site: 'A', pos: { x: 39, y: 2.3, z: -28 } } });
  const a1 = addBot(game, 1, 'BL', -6, 4);
  const a2 = addBot(game, 2, 'BL', -2, 8);
  const d1 = dist2(a1, sitePos('A')), d2 = dist2(a2, sitePos('A'));
  step(game, 5);
  assert(dist2(a1, sitePos('A')) < d1 - 8, 'a1 应向安放点移动');
  assert(dist2(a2, sitePos('A')) < d2 - 8, 'a2 应向安放点移动');
  assert(!game.commands.some((c) => c.type === 'startPlant' || c.type === 'startDefuse'), '进攻方不得拆包/重复安包');
});

test('回防：C4 已安放时最近的防守方拆包，其余回防掩护', () => {
  const game = makeGame({ bomb: { state: 'planted', site: 'A', pos: { x: 39, y: 2.3, z: -28 } }, phase: 'planted' });
  const g1 = addBot(game, 3, 'GR', 5, -10);  // 距 A 点较近，应为拆包者
  const g2 = addBot(game, 4, 'GR', -30, -20);
  step(game, 14);
  const defuses = game.commands.filter((c) => c.type === 'startDefuse');
  assert(defuses.some((c) => c.actorId === g1.id), '最近者应下达 startDefuse');
  assert(!defuses.some((c) => c.actorId === g2.id), '掩护者不得拆包');
  assert(game.action && game.action.kind === 'defuse', '拆包动作应已开始');
  step(game, 0.5);
  const before = g1.pos.clone();
  step(game, 1);
  assert(before.distanceTo(g1.pos) < 0.15, '拆包中应站定');
  assert(dist2(g2, sitePos('A')) < 20, `掩护者应回防到包点附近（d=${dist2(g2, sitePos('A'))}）`);
});

test('情报：己方听声指向另一包点时转点支援，情报过期后回防本点', () => {
  const game = makeGame({}); // C4 未出现（回合初期）
  const g1 = addBot(game, 3, 'GR', 0, 0);
  step(game, 8);
  // 单人防守：先确认其守在分配的包点（A/B 之一由种子确定性决定）
  const hold = SITES.find((s) => dist2(g1, s) < 6);
  assert(hold, `应先到达分配的防区（pos=${g1.pos.x.toFixed(1)},${g1.pos.z.toFixed(1)}）`);
  const other = SITES.find((s) => s !== hold);
  // 只有一条听声情报（公共感知通道），指向另一包点；情报 12s 过期前走出明显转点距离
  g1.hear(new Vector3(other.x, 0, other.z), true);
  step(game, 11);
  assert(dist2(g1, other) < 40, `应向情报方向转点（d=${dist2(g1, other).toFixed(1)}）`);
  // 情报过期（> intelMaxAge）且无新情报：回到本防区
  game.time += 15;
  step(game, 18);
  assert(dist2(g1, hold) < 6, `过期后应回防本点（d=${dist2(g1, hold).toFixed(1)}）`);
});

test('遇阻重规划：被卡住时重算路径，不传送', () => {
  const game = makeGame({ bomb: { state: 'carried', carrierId: 1 }, freeze: new Set([1]) });
  const a1 = addBot(game, 1, 'BL', -8, 32);
  step(game, 9);
  assert(game.findPathCalls >= 2, `卡住后应重算路径（findPathCalls=${game.findPathCalls}）`);
  assert(Math.hypot(a1.pos.x + 8, a1.pos.z - 32) < 0.5, '卡住重规划不得传送');
});

test('TDM 回归：非爆破模式不接入目标层，既有游走行为保持', () => {
  const game = makeGame({ bomb: null });
  game.map.teamGoals = { BL: ['n1'], GR: ['n2'] };
  game.navNodes = new Map([
    ['n1', { id: 'n1', x: 20, y: 0, z: 0 }],
    ['n2', { id: 'n2', x: -20, y: 0, z: 0 }],
  ]);
  const a1 = addBot(game, 1, 'BL', -10, 10);
  step(game, 3);
  assert(game.viewCalls === 0, '不得调用 objectiveView');
  assert(game.commands.length === 0, '不得下达目标命令');
  assert(Math.hypot(a1.pos.x + 10, a1.pos.z - 10) > 3, 'TDM 游走行为应保持');
});
