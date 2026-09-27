// 爆破模式运行时集成测试（node --test）
// 只测公共接缝行为：模式适配器装配、BombSession 回合流转、包点/安拆边界与视图契约。
// 纯 BombMatch 引擎边界已在 bomb-core.test.mjs 覆盖，此处不重复。
import test from 'node:test';
import assert from 'node:assert/strict';
import { getMode } from '../../src/modes/index.js';
import { BombSession } from '../../src/modes/bomb-session.js';

// ---------- 测试夹具：4 人小队 + 双包点（沙漠灰布局量级，纯数据） ----------
const SITES = [
  { id: 'A', x: 39, y: 2.6, z: -28, radius: 5.5 },
  { id: 'B', x: -36, y: 0, z: -24, radius: 5.5 },
];
function makeSession() {
  const spawned = []; // 每次 spawnAll 记录当时回合数
  const events = [];
  const s = new BombSession({
    roster: [
      { id: 1, team: 'BL', name: '我' },
      { id: 2, team: 'BL', name: 'b1' },
      { id: 3, team: 'GR', name: 'g1' },
      { id: 4, team: 'GR', name: 'g2' },
    ],
    bombSites: SITES,
    hooks: {
      spawnAll: () => spawned.push(s.match.round),
      onEvents: (ev) => events.push(...ev),
    },
  });
  return { s, spawned, events };
}
// 站桩事实：pos 不在包点（y 之外），moving/damaged 默认 false
const stand = (id, x, z, extra = {}) => ({ id, pos: { x, y: 0, z }, alive: true, moving: false, damaged: false, ...extra });
const SPAWN_FACTS = () => [stand(1, 0, 33), stand(2, -5, 33), stand(3, 0, -33), stand(4, 5, -33)];
const STEP = 1 / 30;
function run(s, seconds, factsOf = SPAWN_FACTS) {
  const all = [];
  for (let t = 0; t < seconds - 1e-9; t += STEP) all.push(...s.update(STEP, factsOf()));
  return all;
}

test('开局装配：先统一复活再开始首回合，C4 由 BL 携带，准备期 5 秒后进入交战', () => {
  const { s, spawned, events } = makeSession();
  s.start();
  assert.deepEqual(spawned, [0]); // spawnAll 恰在 startRound 之前调用一次
  assert.equal(s.match.round, 1);
  assert.equal(s.match.phase, 'prep');
  const rs = events.find((e) => e.type === 'roundStart');
  assert.ok(rs && s.match.roster.find((r) => r.id === rs.carrierId).team === 'BL');
  assert.equal(s.match.bomb.carrierId, rs.carrierId);
  // 准备期（5s）内不进入交战
  run(s, 4.9);
  assert.equal(s.match.phase, 'prep');
  run(s, 0.2);
  assert.equal(s.match.phase, 'live');
});

test('回合结束 → 延迟 4 秒统一复活 → 下一回合；比分来自规则引擎；对局中不自动复活', () => {
  const { s, spawned, events } = makeSession();
  s.start();
  run(s, 5.2); // 进入交战
  // 保卫者全灭 → BL 胜（歼灭），死亡者也不复活
  const wipe = [stand(1, 0, 33, { alive: false }), stand(2, -5, 33), stand(3, 0, -33, { alive: false }), stand(4, 5, -33, { alive: false })];
  const endEvents = run(s, 0.2, () => wipe);
  const re = endEvents.find((e) => e.type === 'roundEnded');
  assert.ok(re && re.winner === 'BL' && re.reason === 'grWiped');
  assert.equal(s.match.score.BL, 1);
  // 延迟 4 秒内不复活、不开下一回合（延迟自 roundEnded 起算）
  run(s, 3.7, () => wipe);
  assert.deepEqual(spawned, [0]);
  assert.equal(s.match.phase, 'roundEnd');
  // 跨过 4 秒：全员统一复活并开始第 2 回合（复活后事实恢复为存活，与 Game 行为一致）
  for (let t = 0; t < 0.3; t += STEP) s.update(STEP, s.match.round >= 2 ? SPAWN_FACTS() : wipe);
  assert.deepEqual(spawned, [0, 1]);
  assert.equal(s.match.round, 2);
  assert.equal(s.match.phase, 'prep');
  assert.ok(Object.values(s.match.alive).every((v) => v === true));
  assert.ok(events.some((e) => e.type === 'roundStart' && e.round === 2));
});

// 生产 Game 玩家 id 为数值 0：引擎与运行时装配均不得把 0 当缺失（引擎侧边界见 bomb-core）
test('id 为 0 的 BL 携带者必须能拿到 C4（数值 0 不是缺失）', () => {
  const s = new BombSession({
    roster: [{ id: 0, team: 'BL', name: '我' }, { id: 3, team: 'GR' }],
    bombSites: SITES,
    hooks: {},
  });
  s.start();
  assert.ok(s.match.bomb && s.match.bomb.carrierId === 0);
});

test('siteAt 只返回包点 ID 字符串或 null（绝无布尔），并按半径/高度判定', () => {
  const { s } = makeSession();
  assert.equal(s.siteAt({ x: 39, y: 2.6, z: -28 }), 'A');
  assert.equal(s.siteAt({ x: -36, y: 0, z: -24 }), 'B');
  assert.equal(s.siteAt({ x: 0, y: 0, z: 0 }), null); // 中路不在任何包点
  assert.equal(s.siteAt({ x: 39, y: 20, z: -28 }), null); // 垂直方向远离包点平面
  const v = s.siteAt({ x: 37, y: 2.6, z: -27 });
  assert.ok(v === null || (typeof v === 'string' && v.length > 0), '返回值绝不能是布尔');
});

test('安包→拆包完整结算：开始/移动中断/完成、拆包完成、临界结果只结算一次', () => {
  const { s, events } = makeSession();
  s.start();
  // 携带者（BL id1，本回合首发 C4）站在 A 点，等进入交战
  const atSite = () => [stand(1, 39, -28), stand(2, -5, 33), stand(3, 36, -26), stand(4, 5, -33)];
  run(s, 5.2, atSite);
  assert.equal(s.command('startPlant', 1), true);
  run(s, 2, atSite);
  assert.ok(events.some((e) => e.type === 'plantStarted'));
  assert.ok(!events.some((e) => e.type === 'bombPlanted')); // 5 秒按住未满不生效
  // 移动打断安包，进度作废
  const moving = () => [stand(1, 39, -28, { moving: true }), stand(2, -5, 33), stand(3, 36, -26), stand(4, 5, -33)];
  run(s, 0.2, moving);
  const cancelled = events.find((e) => e.type === 'plantCancelled');
  assert.ok(cancelled && cancelled.reason === 'moved');
  // 重新按住，累计满 5 秒完成安放，包点 ID 为 'A'
  run(s, 0.2, atSite);
  s.command('startPlant', 1);
  run(s, 5.1, atSite);
  const planted = events.find((e) => e.type === 'bombPlanted');
  assert.ok(planted && planted.site === 'A');
  assert.equal(s.match.phase, 'planted');
  // GR 到位拆包：7 秒完成，roundEnded 只出现一次
  const defuseFacts = () => [stand(1, 39, -28), stand(2, -5, 33), stand(3, 38, -27), stand(4, 5, -33)];
  assert.equal(s.command('startDefuse', 3), true);
  run(s, 6.8, defuseFacts);
  assert.ok(!events.some((e) => e.type === 'bombDefused')); // 7 秒未满
  run(s, 0.4, defuseFacts);
  assert.ok(events.some((e) => e.type === 'bombDefused'));
  const ends = events.filter((e) => e.type === 'roundEnded');
  assert.equal(ends.length, 1);
  assert.equal(ends[0].winner, 'GR');
  assert.equal(ends[0].reason, 'defused');
  assert.equal(s.match.score.GR, 1);
});

test('未知命令类型拒绝排队；安包完成后同一 actor 的 startPlant 不再生效', () => {
  const { s } = makeSession();
  s.start();
  assert.equal(s.command('teleport', 1), false);
  assert.equal(s.command('startPlant', 3), true); // 非携带者命令照常排队，由引擎结算拒绝
  const atSite = () => [stand(1, 39, -28), stand(2, -5, 33), stand(3, 36, -26), stand(4, 5, -33)];
  run(s, 5.2, atSite);
  s.command('startPlant', 1);
  run(s, 5.1, atSite);
  assert.equal(s.match.phase, 'planted');
  s.command('startPlant', 1); // 已安放后再按安包无效
  run(s, 0.2, atSite);
  assert.equal(s.match.bomb.planted, true);
});

test('view：可序列化快照 + plantable/defusable/pickupable/inSite 提示 + 观战队友', () => {
  const { s } = makeSession();
  s.start();
  const v0 = s.view(1);
  assert.equal(JSON.parse(JSON.stringify(v0)).phase, 'prep'); // 纯数据可序列化
  assert.equal(v0.plantable, false); // 准备期不能安包
  assert.deepEqual(v0.spectate.map((t) => t.id).sort(), [2]); // 同队（BL）存活队友，不含敌方
  // 进入交战，携带者站上 A 点 → plantable 为真，inSite 为 'A'
  const atSite = () => [stand(1, 39, -28), stand(2, -5, 33), stand(3, 36, -26), stand(4, 5, -33)];
  run(s, 5.2, atSite);
  const v1 = s.view(1);
  assert.equal(v1.inSite, 'A');
  assert.equal(v1.plantable, true);
  assert.equal(v1.defusable, false); // 未安包，GR 不可拆
  assert.equal(s.view(3).plantable, false); // 非携带者
  // 进度分母来自规则引擎接缝（HUD 不回退硬编码默认）
  assert.equal(v1.plantHold, 5);
  assert.equal(v1.defuseHold, 7);
  // 掉包拾取受交互半径约束：远端 BL 不可拾（HUD 走「找回 C4」分支），近端 BL 可拾；GR 永不拾
  s.command('dropBomb', 1);
  run(s, 0.1, atSite);
  const vFar = s.view(2); // id2 在 (-5,33)，距掉点 (39,-28) 远超拾取半径
  assert.equal(vFar.pickupable, false);
  assert.equal(vFar.plantable, false);
  assert.equal(s.view(3).pickupable, false); // GR 不能拾包
  const nearBomb = () => [stand(1, 39, -28), stand(2, 40, -27), stand(3, 36, -26), stand(4, 5, -33)];
  run(s, 0.1, nearBomb);
  assert.equal(s.view(2).pickupable, true); // id2 走到掉点旁（~1.4m）
});

test('restart 清空比分/回合/流转计时；destroy 后不再发事件、命令与视图关闭', () => {
  const { s, spawned, events } = makeSession();
  s.start();
  run(s, 5.2);
  run(s, 0.2, () => [stand(1, 0, 33, { alive: false }), stand(2, -5, 33), stand(3, 0, -33, { alive: false }), stand(4, 5, -33, { alive: false })]);
  assert.equal(s.match.score.BL, 1);
  // 挂起一条命令后重开：不得在重开后的对局里生效
  s.command('dropBomb', 2);
  s.restart();
  assert.deepEqual(s.match.score, { BL: 0, GR: 0 });
  assert.equal(s.match.round, 0);
  assert.equal(s.match.phase, 'idle');
  s.start();
  assert.equal(s.match.round, 1);
  assert.equal(s.match.bomb.dropped, undefined); // 挂起命令未穿越重开
  // 销毁：update 返回空、不再派发事件、不再触发复活，命令与视图关闭
  s.destroy();
  const nEvents = events.length;
  const nSpawned = spawned.length;
  s.command('startPlant', 1);
  const ev = s.update(0.5, SPAWN_FACTS());
  assert.deepEqual(ev, []);
  assert.equal(events.length, nEvents);
  assert.equal(spawned.length, nSpawned);
  assert.equal(s.view(1), null);
});

test('bomb 模式适配器：无重生/无对局时限/击杀不计比分/击杀不触发结算/按回合比分判胜负', () => {
  const m = getMode('bomb');
  assert.equal(m.id, 'bomb');
  assert.equal(m.defaults.respawn, null); // 死亡无复活，统一回合复活
  assert.equal(m.defaults.time, Infinity); // 对局时限由回合规则引擎决定
  assert.equal(m.scoreKills, false); // 比分是回合数，不是击杀数
  assert.equal(m.checkEnd({ BL: 99, GR: 99 }, 50), false);
  assert.equal(m.result({ BL: 7, GR: 3 }, 'BL'), true);
  assert.equal(m.result({ BL: 3, GR: 7 }, 'BL'), false);
  assert.equal(m.result({ BL: 4, GR: 2 }, 'BL'), null); // 未到先赢 7
});
