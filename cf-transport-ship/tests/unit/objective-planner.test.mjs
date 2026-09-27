// 目标型 AI 策略核心边界测试（node --test，纯策略，不依赖 DOM/Three/时钟）
// 只用公共 API 与公开观察构造断言，不读私有常量、不镜像实现公式。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createObjectivePlanner } from '../../src/ai/objective-planner.js';

const MAP = {
  bombSites: [
    { id: 'A', name: 'A区', x: 39, y: 2.3, z: -28 },
    { id: 'B', name: 'B区', x: -36, y: 0, z: -24 },
  ],
};
function sitePos(id) {
  const { x, y, z } = MAP.bombSites.find((s) => s.id === id);
  return { x, y, z };
}

const ATK_TEAM = [
  { id: 'a1', position: { x: 0, y: 0, z: 32 }, alive: true },
  { id: 'a2', position: { x: 2, y: 0, z: 32 }, alive: true },
];

// 进攻方观察：只含许可信息（自身/己方小队/C4 公开状态/敌方感知通道/回合计时）
function atkObs(id, over = {}) {
  const known = ATK_TEAM.find((m) => m.id === id);
  return {
    now: 10,
    round: 1,
    self: known ? { id, team: 'BL', position: known.position } : { id, team: 'BL' },
    team: ATK_TEAM,
    c4: { state: 'carried', carrierId: 'a1' },
    enemies: { visible: [], lastKnown: [], heard: [] },
    ...over,
  };
}

const newPlanner = () => createObjectivePlanner({ seed: 7, map: MAP });

test('持包者前往有效包点：intent=plant，goal 为该包点坐标', () => {
  const plan = newPlanner().plan(atkObs('a1'));
  assert.equal(plan.role, 'carrier');
  assert.equal(plan.intent, 'plant');
  assert.ok(plan.site === 'A' || plan.site === 'B');
  assert.deepEqual(plan.goal, sitePos(plan.site));
});

test('两名进攻方分路：非持包者走另一条路线（另一包点）', () => {
  const p = newPlanner();
  const carrier = p.plan(atkObs('a1'));
  const flank = p.plan(atkObs('a2'));
  assert.equal(flank.role, 'flank');
  assert.equal(flank.site, carrier.site === 'A' ? 'B' : 'A');
  assert.deepEqual(flank.goal, sitePos(flank.site));
});

test('C4 掉落：最近的可行动进攻方转为拾取，目标是掉落位置', () => {
  const bomb = { x: -20, y: 0, z: 10 };
  const team = [
    { id: 'a1', position: { x: 0, y: 0, z: 32 }, alive: true },
    { id: 'a2', position: { x: -18, y: 0, z: 12 }, alive: true },
  ];
  const p = newPlanner();
  const near = p.plan(atkObs('a2', {
    team,
    self: { id: 'a2', team: 'BL', position: team[1].position },
    c4: { state: 'dropped', position: bomb },
  }));
  assert.equal(near.role, 'retriever');
  assert.equal(near.intent, 'retrieve');
  assert.deepEqual(near.goal, bomb);
  const far = p.plan(atkObs('a1', {
    team,
    self: { id: 'a1', team: 'BL', position: team[0].position },
    c4: { state: 'dropped', position: bomb },
  }));
  assert.notEqual(far.role, 'retriever');
});

test('C4 已安放：进攻方转为守包，目标是安放位置', () => {
  const planted = sitePos('A');
  const plan = newPlanner().plan(atkObs('a2', {
    c4: { state: 'planted', site: 'A', position: planted },
  }));
  assert.equal(plan.role, 'guard');
  assert.equal(plan.intent, 'defend');
  assert.deepEqual(plan.goal, planted);
});

const DEF_TEAM = [
  { id: 'd1', position: { x: -8, y: 0, z: -34 }, alive: true },
  { id: 'd2', position: { x: -2, y: 0, z: -34 }, alive: true },
  { id: 'd3', position: { x: 4, y: 0, z: -34 }, alive: true },
  { id: 'd4', position: { x: 10, y: 0, z: -34 }, alive: true },
  { id: 'd5', position: { x: 12, y: 0, z: -32 }, alive: true },
];

function defObs(id, over = {}) {
  const self = DEF_TEAM.find((m) => m.id === id);
  return {
    now: 10,
    round: 1,
    self: { id, team: 'GR', position: self.position },
    team: DEF_TEAM,
    c4: { state: 'carried', carrierId: 'a1' },
    enemies: { visible: [], lastKnown: [], heard: [] },
    ...over,
  };
}

test('防守方默认分守 A/B：各自架点，goal 为所守包点', () => {
  const p = newPlanner();
  const held = new Set();
  for (const d of DEF_TEAM) {
    const plan = p.plan(defObs(d.id));
    assert.equal(plan.role, 'anchor');
    assert.equal(plan.intent, 'hold');
    assert.ok(plan.site === 'A' || plan.site === 'B');
    assert.deepEqual(plan.goal, sitePos(plan.site));
    held.add(plan.site);
  }
  assert.deepEqual([...held].sort(), ['A', 'B']);
});

test('C4 已安放：距离最近的可行动防守方去拆包，其余回防掩护', () => {
  const planted = sitePos('B');
  const team = [
    { id: 'd1', position: { x: -34, y: 0, z: -22 }, alive: true },   // 距包点最近
    { id: 'd2', position: { x: 10, y: 0, z: -34 }, alive: true },
    { id: 'd3', position: { x: -36, y: 0, z: -24 }, alive: false },  // 更近但已阵亡：不可拆包
    { id: 'd4', position: { x: 12, y: 0, z: -32 }, alive: true },
    { id: 'd5', position: { x: 8, y: 0, z: -30 }, alive: true },
  ];
  const p = newPlanner();
  const defuser = p.plan(defObs('d1', {
    team,
    self: { id: 'd1', team: 'GR', position: team[0].position },
    c4: { state: 'planted', site: 'B', position: planted },
  }));
  assert.equal(defuser.role, 'defuser');
  assert.equal(defuser.intent, 'defuse');
  assert.deepEqual(defuser.goal, planted);
  const other = p.plan(defObs('d2', {
    team,
    self: { id: 'd2', team: 'GR', position: team[1].position },
    c4: { state: 'planted', site: 'B', position: planted },
  }));
  assert.equal(other.role, 'cover');
  assert.equal(other.intent, 'retake');
});

// 用基线计划读出各防守方所守包点（公共 API），再按真实位置构造情报场景
function defenseSquad() {
  const p = createObjectivePlanner({ seed: 7, map: MAP, intelMaxAge: 10 });
  const base = Object.fromEntries(DEF_TEAM.map((d) => [d.id, p.plan(defObs(d.id))]));
  const aHolders = DEF_TEAM.filter((d) => base[d.id].site === 'A');
  const bHolders = DEF_TEAM.filter((d) => base[d.id].site === 'B');
  return { p, base, aHolders, bHolders };
}

test('新鲜敌情在另一包点：离情报最近的可行动防守方转点支援，目标为情报位置', () => {
  const { p, aHolders, bHolders } = defenseSquad();
  assert.ok(aHolders.length && bHolders.length);
  const info = { id: 'a1', position: sitePos('A'), time: 10 };
  // 让一名非 A 区守卫就站在情报旁（比所有 A 区守卫更近），另一名 B 区守卫留在远处
  const [near, far] = bHolders;
  const team = DEF_TEAM.map((d) => {
    if (d.id === near.id) return { id: d.id, position: { x: 37, y: 2, z: -27 }, alive: true };
    if (d.id === far.id) return { id: d.id, position: { x: 12, y: 0, z: -32 }, alive: true };
    return d;
  });
  const obsFor = (id) => defObs(id, {
    team,
    self: { id, team: 'GR', position: team.find((m) => m.id === id).position },
    enemies: { visible: [], lastKnown: [info], heard: [] },
  });
  const rotator = p.plan(obsFor(near.id));
  assert.equal(rotator.role, 'rotator');
  assert.equal(rotator.intent, 'rotate');
  assert.deepEqual(rotator.goal, info.position);
  const holder = p.plan(obsFor(far.id));
  assert.equal(holder.intent, 'hold');
});

test('过期情报失效：超出情报时限的最后已知位置不再触发转点', () => {
  const { p, bHolders } = defenseSquad();
  const near = bHolders[0];
  const team = DEF_TEAM.map((d) => (
    d.id === near.id ? { id: d.id, position: { x: 37, y: 2, z: -27 }, alive: true } : d
  ));
  const stale = { id: 'a1', position: sitePos('A'), time: 10 };
  const over = {
    team,
    self: { id: near.id, team: 'GR', position: team.find((m) => m.id === near.id).position },
  };
  const baseline = p.plan(defObs(near.id, over));
  const withStale = p.plan(defObs(near.id, {
    ...over,
    enemies: { visible: [], lastKnown: [{ ...stale, time: -1 }], heard: [] }, // now=10，情报龄 11s > intelMaxAge=10
  }));
  assert.deepEqual(withStale, baseline);
});

test('计划只依赖许可观察：未通过许可通道提供的隐藏敌人信息不影响计划', () => {
  const p = newPlanner();
  const clean = p.plan(defObs('d1'));
  const withHidden = p.plan({ ...defObs('d1'), hiddenEnemies: [{ id: 'a1', position: sitePos('A') }] });
  assert.deepEqual(withHidden, clean);
});

test('同一回合内重复决策稳定：位置小幅移动不引起角色/包点振荡', () => {
  const p = newPlanner();
  const s1 = p.plan(atkObs('a1'));
  const moved = atkObs('a1', { self: { id: 'a1', team: 'BL', position: { x: 3, y: 0, z: 30 } } });
  const s2 = p.plan(moved);
  const s3 = p.plan(atkObs('a1'));
  assert.deepEqual(s3, s1);
  assert.equal(s2.site, s1.site);
  assert.equal(s2.role, s1.role);
});

test('多回合不扎堆同一条路：进攻方逐回合包点选择覆盖 A 与 B', () => {
  const p = newPlanner();
  const seen = new Set();
  for (let r = 1; r <= 8; r++) seen.add(p.plan(atkObs('a1', { round: r })).site);
  assert.deepEqual([...seen].sort(), ['A', 'B']);
});

test('C4 已安放仅有包点无坐标：进攻方守包、最近防守方赴该包点拆包；掉落无坐标时诚实回退', () => {
  const p = newPlanner();
  const atk = p.plan(atkObs('a2', { c4: { state: 'planted', site: 'A' } }));
  assert.equal(atk.role, 'guard');
  assert.equal(atk.intent, 'defend');
  assert.deepEqual(atk.goal, sitePos('A'));
  const def = p.plan(defObs('d1', { c4: { state: 'planted', site: 'B' } }));
  assert.equal(def.role, 'defuser');
  assert.equal(def.intent, 'defuse');
  assert.deepEqual(def.goal, sitePos('B'));
  // 掉落但队内无任何已知坐标：不得臆造位置，回退常规分路
  const drop = p.plan(atkObs('a2', { c4: { state: 'dropped' } }));
  assert.notEqual(drop.role, 'retriever');
  assert.equal(drop.goal === null || typeof drop.goal.x === 'number', true);
});

test('回合内 obs.team 顺序打乱：每个防守方所守包点保持不变', () => {
  const p = newPlanner();
  const base = Object.fromEntries(DEF_TEAM.map((d) => [d.id, p.plan(defObs(d.id)).site]));
  const shuffled = [...DEF_TEAM].reverse();
  for (const d of shuffled) {
    const plan = p.plan(defObs(d.id, {
      team: shuffled,
      self: { id: d.id, team: 'GR', position: d.position },
    }));
    assert.equal(plan.site, base[d.id], `${d.id} 的包点因数组顺序改变`);
  }
});

test('回合内队友阵亡：幸存进攻方的包点与角色保持不变', () => {
  const team4 = [
    { id: 'a1', position: { x: 0, y: 0, z: 32 }, alive: true },
    { id: 'a2', position: { x: 2, y: 0, z: 32 }, alive: true },
    { id: 'a3', position: { x: 4, y: 0, z: 32 }, alive: true },
    { id: 'a4', position: { x: 6, y: 0, z: 32 }, alive: true },
  ];
  const p = newPlanner();
  const base = {};
  for (const m of team4) {
    const plan = p.plan(atkObs(m.id, { team: team4, self: { id: m.id, team: 'BL', position: m.position } }));
    base[m.id] = { site: plan.site, role: plan.role };
  }
  const wounded = team4.map((m) => (m.id === 'a2' ? { ...m, alive: false } : m));
  for (const m of wounded.filter((x) => x.alive)) {
    const plan = p.plan(atkObs(m.id, { team: wounded, self: { id: m.id, team: 'BL', position: m.position } }));
    assert.equal(plan.site, base[m.id].site, `${m.id} 的包点因队友阵亡改变`);
    assert.equal(plan.role, base[m.id].role, `${m.id} 的角色因队友阵亡改变`);
  }
});

test('C4 已安放但包点标注非法且无坐标：防守计划诚实降级（goal:null）而非抛错', () => {
  const p = newPlanner();
  for (const d of DEF_TEAM) {
    const plan = p.plan(defObs(d.id, { c4: { state: 'planted', site: 'C' } }));
    assert.equal(plan.role, 'cover');
    assert.equal(plan.intent, 'retake');
    assert.equal(plan.goal, null);
  }
});

test('两名防守方与 C4 等距：defuser 指派与 obs.team 传入顺序无关', () => {
  const planted = { x: 39, y: 0, z: -28 };
  const c4 = { state: 'planted', site: 'A', position: planted };
  const d1 = { id: 'd1', position: { x: 38, y: 0, z: -28 }, alive: true };
  const d2 = { id: 'd2', position: { x: 40, y: 0, z: -28 }, alive: true };
  const p = newPlanner();
  const planIn = (id, team) => p.plan(defObs(id, {
    team,
    self: { id, team: 'GR', position: team.find((m) => m.id === id).position },
    c4,
  }));
  const first = planIn('d1', [d1, d2]);
  assert.equal(first.role, 'defuser');
  assert.equal(first.goal, planted);
  const flipped = planIn('d1', [d2, d1]);
  assert.equal(flipped.role, 'defuser', '逆序传入后 defuser 翻转');
  assert.equal(planIn('d2', [d2, d1]).role, 'cover');
});
