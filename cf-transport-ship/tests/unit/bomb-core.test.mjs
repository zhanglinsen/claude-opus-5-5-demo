// 爆破规则核心边界测试（node --test，纯引擎，不依赖 DOM/Three/时钟/随机）
import test from 'node:test';
import assert from 'node:assert/strict';
import { BombMatch, BOMB_DEFAULTS } from '../../src/modes/bomb.js';

const ROSTER = [
  { id: 'b1', team: 'BL' }, { id: 'b2', team: 'BL' }, { id: 'b3', team: 'BL' },
  { id: 'b4', team: 'BL' }, { id: 'b5', team: 'BL' },
  { id: 'g1', team: 'GR' }, { id: 'g2', team: 'GR' }, { id: 'g3', team: 'GR' },
  { id: 'g4', team: 'GR' }, { id: 'g5', team: 'GR' },
];
const BL_IDS = ['b1', 'b2', 'b3', 'b4', 'b5'];
const GR_IDS = ['g1', 'g2', 'g3', 'g4', 'g5'];

// 构造一帧外部事实：默认全员存活、不在包点、静止、未受伤
function facts(overrides = {}) {
  return {
    actors: [...BL_IDS, ...GR_IDS].map((id) => ({
      id, alive: true, inSite: false, moving: false, damaged: false,
      pos: { x: 0, y: 0, z: 0 }, ...(overrides[id] || {}),
    })),
  };
}
const allDead = (ids) => Object.fromEntries(ids.map((id) => [id, { alive: false }]));

// 生产 Game 玩家 id 为数值 0：引擎任何环节都不得把 0 当缺失
const ROSTER_ZERO = [
  { id: 0, team: 'BL' }, { id: 1, team: 'BL' },
  { id: 2, team: 'GR' }, { id: 3, team: 'GR' },
];
function factsZero(overrides = {}) {
  return {
    actors: ROSTER_ZERO.map((r) => ({
      id: r.id, alive: true, inSite: false, moving: false, damaged: false, ...(overrides[r.id] || {}),
    })),
  };
}

function newMatch() { return new BombMatch({ roster: ROSTER }); }

// 标准安包流程：开局 b1 持包 → 准备 5s → 交战 → A 点按住安包 5s
function plantBomb(m) {
  m.startRound('b1');
  m.update(5, facts());
  m.command({ type: 'startPlant', actorId: 'b1' });
  return m.update(5, facts({ b1: { inSite: 'A' } }));
}

test('默认规则参数符合批准规格：5v5、先赢7、5/150/5/7/40 秒', () => {
  assert.deepEqual(BOMB_DEFAULTS, {
    teamSize: 5, winsNeeded: 7, prepTime: 5, roundTime: 150,
    plantHold: 5, defuseHold: 7, fuseTime: 40,
  });
});

test('开局先发 roundStart，准备 5 秒后进入交战且回合计时 150 秒', () => {
  const m = newMatch();
  assert.deepEqual(m.startRound('b1'), [{ type: 'roundStart', round: 1, carrierId: 'b1' }]);
  assert.equal(m.snapshot().phase, 'prep');
  assert.deepEqual(m.update(5, facts()), [{ type: 'phaseLive' }]);
  const s = m.snapshot();
  assert.equal(s.phase, 'live');
  assert.ok(Math.abs(s.timeLeft - 150) < 1e-9);
});

test('准备期不可安包：命令被忽略，进入交战后才可安放', () => {
  const m = newMatch();
  m.startRound('b1');
  m.command({ type: 'startPlant', actorId: 'b1' });
  const ev = m.update(1, facts({ b1: { inSite: 'A' } }));
  assert.equal(ev.some((e) => e.type === 'plantStarted' || e.type === 'bombPlanted'), false);
  assert.equal(m.snapshot().phase, 'prep');
});

test('未安包超时：GR 得胜并记分，比赛未结束', () => {
  const m = newMatch();
  m.startRound('b1');
  m.update(5, facts());
  const ev = m.update(150, facts());
  const end = ev.find((e) => e.type === 'roundEnded');
  assert.deepEqual(end, { type: 'roundEnded', winner: 'GR', reason: 'timeout' });
  assert.equal(ev.some((e) => e.type === 'matchEnded'), false);
  assert.deepEqual(m.snapshot().score, { BL: 0, GR: 1 });
});

test('先赢 7 局：第 7 轮 GR 超时胜后发出 matchEnded，之后无法再开局', () => {
  const m = newMatch();
  let last = [];
  for (let r = 1; r <= 7; r++) {
    m.startRound('b1');
    m.update(5, facts());
    last = m.update(150, facts());
  }
  assert.deepEqual(last.find((e) => e.type === 'matchEnded'), { type: 'matchEnded', winner: 'GR' });
  assert.deepEqual(m.snapshot().score, { BL: 0, GR: 7 });
  assert.deepEqual(m.startRound('b1'), []);
  assert.equal(m.snapshot().phase, 'matchEnd');
});

test('安包 5 秒完成进入引爆阶段，40 秒后爆炸判 BL 得胜', () => {
  const m = newMatch();
  const ev = plantBomb(m);
  assert.deepEqual(
    ev.find((e) => e.type === 'bombPlanted'),
    { type: 'bombPlanted', actorId: 'b1', site: 'A' },
  );
  const s = m.snapshot();
  assert.equal(s.phase, 'planted');
  assert.ok(Math.abs(s.timeLeft - 40) < 1e-9);
  const ev2 = m.update(40, facts());
  assert.deepEqual(ev2.find((e) => e.type === 'bombExploded'), { type: 'bombExploded', site: 'A' });
  assert.deepEqual(ev2.find((e) => e.type === 'roundEnded'), { type: 'roundEnded', winner: 'BL', reason: 'exploded' });
  assert.deepEqual(m.snapshot().score, { BL: 1, GR: 0 });
});

test('拆包 7 秒完成判 GR 得胜', () => {
  const m = newMatch();
  plantBomb(m);
  m.command({ type: 'startDefuse', actorId: 'g1' });
  const ev = m.update(7, facts({ g1: { inSite: 'A' } }));
  assert.deepEqual(ev.find((e) => e.type === 'bombDefused'), { type: 'bombDefused', actorId: 'g1' });
  assert.deepEqual(ev.find((e) => e.type === 'roundEnded'), { type: 'roundEnded', winner: 'GR', reason: 'defused' });
  assert.deepEqual(m.snapshot().score, { BL: 0, GR: 1 });
});

test('拆包必须靠近实际安放的 C4：错误包点与同包点远端均不可拆，离开时中断', () => {
  const m = newMatch();
  m.startRound('b1');
  m.update(5, facts());
  m.command({ type: 'startPlant', actorId: 'b1' });
  m.update(5, facts({ b1: { inSite: 'A', pos: { x: 0, y: 0, z: 0 } } }));
  assert.equal(m.snapshot().bomb.site, 'A');

  const wrongSite = facts({ g1: { inSite: 'B', pos: { x: 75, y: 0, z: 0 } } });
  m.update(0, wrongSite);
  assert.equal(m.defusable('g1'), false);
  m.command({ type: 'startDefuse', actorId: 'g1' });
  assert.equal(m.update(0, wrongSite).some((e) => e.type === 'defuseStarted'), false);

  const farInA = facts({ g1: { inSite: 'A', pos: { x: 5, y: 0, z: 0 } } });
  m.update(0, farInA);
  assert.equal(m.defusable('g1'), false);
  m.command({ type: 'startDefuse', actorId: 'g1' });
  assert.equal(m.update(0, farInA).some((e) => e.type === 'defuseStarted'), false);

  const nearC4 = facts({ g1: { inSite: 'A', pos: { x: 1, y: 0, z: 0 } } });
  m.update(0, nearC4);
  assert.equal(m.defusable('g1'), true);
  m.command({ type: 'startDefuse', actorId: 'g1' });
  assert.equal(m.update(3, nearC4).some((e) => e.type === 'defuseStarted'), true);
  const interrupted = m.update(4, farInA);
  assert.equal(interrupted.some((e) => e.type === 'defuseCancelled'), true);
  assert.equal(interrupted.some((e) => e.type === 'bombDefused'), false);
  assert.equal(m.snapshot().phase, 'planted');
});

test('引爆与拆包同一精确时刻完成：平手判引爆，只结算一次', () => {
  const m = newMatch();
  plantBomb(m); // 安包完成于绝对时刻 10，引爆期限 50
  m.update(33, facts()); // 现在时刻 43
  m.command({ type: 'startDefuse', actorId: 'g1' });
  const ev = m.update(7, facts({ g1: { inSite: 'A' } })); // 拆包期限 43+7=50，与引爆重合
  assert.equal(ev.some((e) => e.type === 'bombDefused'), false);
  assert.deepEqual(ev.find((e) => e.type === 'bombExploded'), { type: 'bombExploded', site: 'A' });
  assert.deepEqual(ev.find((e) => e.type === 'roundEnded'), { type: 'roundEnded', winner: 'BL', reason: 'exploded' });
});

test('安包后 BL 全灭仍继续等待拆除或引爆', () => {
  const m = newMatch();
  plantBomb(m);
  const ev = m.update(1, facts(allDead(BL_IDS)));
  assert.equal(ev.some((e) => e.type === 'roundEnded'), false);
  assert.equal(m.snapshot().phase, 'planted');
  const ev2 = m.update(39, facts());
  assert.ok(ev2.some((e) => e.type === 'bombExploded'));
  assert.deepEqual(ev2.find((e) => e.type === 'roundEnded'), { type: 'roundEnded', winner: 'BL', reason: 'exploded' });
});

test('安包后 GR 全灭立即判 BL 胜', () => {
  const m = newMatch();
  plantBomb(m);
  const ev = m.update(0.1, facts(allDead(GR_IDS)));
  assert.deepEqual(ev.find((e) => e.type === 'roundEnded'), { type: 'roundEnded', winner: 'BL', reason: 'grWiped' });
});

test('未安包 BL 全灭判 GR 胜', () => {
  const m = newMatch();
  m.startRound('b1');
  m.update(5, facts());
  const ev = m.update(0.1, facts(allDead(BL_IDS)));
  assert.deepEqual(ev.find((e) => e.type === 'roundEnded'), { type: 'roundEnded', winner: 'GR', reason: 'blWiped' });
});

test('未安包 GR 全灭判 BL 胜', () => {
  const m = newMatch();
  m.startRound('b1');
  m.update(5, facts());
  const ev = m.update(0.1, facts(allDead(GR_IDS)));
  assert.deepEqual(ev.find((e) => e.type === 'roundEnded'), { type: 'roundEnded', winner: 'BL', reason: 'grWiped' });
});

test('携包者死亡掉包；GR 不能拾取，存活 BL 可以', () => {
  const m = newMatch();
  m.startRound('b1');
  m.update(5, facts());
  const ev = m.update(0.1, facts({ b1: { alive: false, pos: { x: 1, y: 2, z: 3 } } }));
  assert.deepEqual(
    ev.find((e) => e.type === 'bombDropped'),
    { type: 'bombDropped', actorId: 'b1', reason: 'death', pos: { x: 1, y: 2, z: 3 } },
  );
  assert.equal(m.snapshot().bomb.dropped, true);
  m.command({ type: 'pickupBomb', actorId: 'g1' });
  const ev2 = m.update(0.1, facts());
  assert.equal(ev2.some((e) => e.type === 'bombPickedUp'), false);
  assert.equal(m.snapshot().bomb.carrierId, undefined);
  m.command({ type: 'pickupBomb', actorId: 'b2' });
  // 拾取受交互半径约束（P2 修复）：b2 需走到掉点 (1,2,3) 旁（0.5m）才可拾
  const ev3 = m.update(0.1, facts({ b2: { pos: { x: 1.5, y: 2, z: 3 } } }));
  assert.deepEqual(ev3.find((e) => e.type === 'bombPickedUp'), { type: 'bombPickedUp', actorId: 'b2' });
  assert.equal(m.snapshot().bomb.carrierId, 'b2');
});

test('拾取交互半径：远端 BL 不能隔空拾取（pickupable=false 且命令无效），近端 BL 可拾，GR 贴脸也不拾', () => {
  const m = newMatch();
  m.startRound('b1');
  m.update(5, facts());
  m.command({ type: 'dropBomb', actorId: 'b1' });
  m.update(0.1, facts({ b1: { pos: { x: 1, y: 2, z: 3 } } }));
  assert.equal(m.snapshot().bomb.dropped, true);
  // 远端 BL（距掉点 5m）：命令无效、C4 仍掉落、提示为不可拾
  m.command({ type: 'pickupBomb', actorId: 'b2' });
  const evFar = m.update(0.1, facts({ b2: { pos: { x: 6, y: 2, z: 3 } } }));
  assert.equal(evFar.some((e) => e.type === 'bombPickedUp'), false);
  assert.equal(m.snapshot().bomb.dropped, true);
  assert.equal(m.pickupable('b2'), false);
  // 近端 BL（距掉点 ~1.4m）：提示可拾且命令生效
  assert.equal(m.pickupable('b3'), false); // 还没走近时同样不可拾
  m.command({ type: 'pickupBomb', actorId: 'b3' });
  const evNear = m.update(0.1, facts({ b3: { pos: { x: 2, y: 2, z: 4 } } }));
  assert.deepEqual(evNear.find((e) => e.type === 'bombPickedUp'), { type: 'bombPickedUp', actorId: 'b3' });
  assert.equal(m.snapshot().bomb.carrierId, 'b3');
  // GR 站在掉点正上方也永不拾取
  m.command({ type: 'dropBomb', actorId: 'b3' });
  m.update(0.1, facts({ b3: { pos: { x: 2, y: 2, z: 4 } } }));
  m.command({ type: 'pickupBomb', actorId: 'g1' });
  const evGR = m.update(0.1, facts({ g1: { pos: { x: 2, y: 2, z: 4 } } }));
  assert.equal(evGR.some((e) => e.type === 'bombPickedUp'), false);
  assert.equal(m.pickupable('g1'), false);
  assert.equal(m.snapshot().bomb.dropped, true);
});

test('移动打断安包并重置进度，需重新按满 5 秒', () => {
  const m = newMatch();
  m.startRound('b1');
  m.update(5, facts());
  m.command({ type: 'startPlant', actorId: 'b1' });
  let ev = m.update(2, facts({ b1: { inSite: 'A' } }));
  assert.deepEqual(ev.filter((e) => e.type === 'plantStarted'), [{ type: 'plantStarted', actorId: 'b1' }]);
  assert.ok(Math.abs(m.snapshot().plantProgress - 2) < 1e-9);
  ev = m.update(0.1, facts({ b1: { inSite: 'A', moving: true } }));
  assert.deepEqual(ev.find((e) => e.type === 'plantCancelled'), { type: 'plantCancelled', actorId: 'b1', reason: 'moved' });
  m.command({ type: 'startPlant', actorId: 'b1' });
  ev = m.update(4, facts({ b1: { inSite: 'A' } }));
  assert.equal(ev.some((e) => e.type === 'bombPlanted'), false);
  ev = m.update(1, facts({ b1: { inSite: 'A' } }));
  assert.ok(ev.some((e) => e.type === 'bombPlanted'));
});

test('拆包者死亡打断拆包并重置进度', () => {
  const m = newMatch();
  plantBomb(m);
  m.command({ type: 'startDefuse', actorId: 'g1' });
  let ev = m.update(3, facts({ g1: { inSite: 'A' } }));
  assert.ok(ev.some((e) => e.type === 'defuseStarted'));
  ev = m.update(0.1, facts({ g1: { alive: false, inSite: 'A' } }));
  assert.deepEqual(ev.find((e) => e.type === 'defuseCancelled'), { type: 'defuseCancelled', actorId: 'g1', reason: 'died' });
  m.command({ type: 'startDefuse', actorId: 'g2' });
  ev = m.update(6, facts({ g2: { inSite: 'A' } }));
  assert.equal(ev.some((e) => e.type === 'bombDefused'), false);
  ev = m.update(1, facts({ g2: { inSite: 'A' } }));
  assert.ok(ev.some((e) => e.type === 'bombDefused'));
});

test('inSite 契约：布尔 true 或空串不算在包点，不得开始安包也不产生 planted 事件', () => {
  const m = newMatch();
  m.startRound('b1');
  m.update(5, facts());
  m.command({ type: 'startPlant', actorId: 'b1' });
  const ev = m.update(5, facts({ b1: { inSite: true } }));
  assert.equal(ev.some((e) => e.type === 'plantStarted'), false);
  assert.equal(ev.some((e) => e.type === 'bombPlanted'), false);
  assert.equal(m.snapshot().phase, 'live');
  assert.equal(m.snapshot().bomb.carrierId, 'b1'); // 炸弹仍在身上，未落点
  assert.equal(m.plantable('b1'), false); // 提示契约与命令门一致
  m.command({ type: 'startPlant', actorId: 'b1' });
  const ev2 = m.update(5, facts({ b1: { inSite: '' } }));
  assert.equal(ev2.some((e) => e.type === 'bombPlanted'), false);
  assert.equal(m.snapshot().phase, 'live');
});

test('inSite 契约：安包中失去合法 site（变布尔 true）中断并重置进度', () => {
  const m = newMatch();
  m.startRound('b1');
  m.update(5, facts());
  m.command({ type: 'startPlant', actorId: 'b1' });
  m.update(2, facts({ b1: { inSite: 'A' } })); // 已按住 2 秒
  const ev = m.update(3, facts({ b1: { inSite: true } })); // 完成帧失去合法 site
  assert.deepEqual(
    ev.find((e) => e.type === 'plantCancelled'),
    { type: 'plantCancelled', actorId: 'b1', reason: 'leftSite' },
  );
  assert.equal(ev.some((e) => e.type === 'bombPlanted'), false);
  assert.equal(m.snapshot().phase, 'live');
  assert.equal(m.snapshot().plantProgress, 0);
});

test('数值 id 0 的 BL 携带者：startRound(0) 能持包，缺省时也能落到首个 BL(id 0)', () => {
  const m = new BombMatch({ roster: ROSTER_ZERO });
  assert.deepEqual(m.startRound(0), [{ type: 'roundStart', round: 1, carrierId: 0 }]);
  assert.equal(m.snapshot().bomb.carrierId, 0);
  const m2 = new BombMatch({ roster: ROSTER_ZERO });
  assert.deepEqual(m2.startRound(), [{ type: 'roundStart', round: 1, carrierId: 0 }]);
  assert.equal(m2.snapshot().bomb.carrierId, 0);
});

test('数值 id 0 的事实被采信：id 0 可安包；其死亡掉包事件 actorId 为 0', () => {
  const m = new BombMatch({ roster: ROSTER_ZERO });
  m.startRound(0);
  m.update(5, factsZero());
  m.command({ type: 'startPlant', actorId: 0 });
  const ev = m.update(5, factsZero({ 0: { inSite: 'A' } }));
  assert.deepEqual(ev.find((e) => e.type === 'bombPlanted'), { type: 'bombPlanted', actorId: 0, site: 'A' });
  assert.equal(m.snapshot().bomb.site, 'A');
  m.restart();
  m.startRound(0);
  m.update(5, factsZero());
  const ev2 = m.update(0.1, factsZero({ 0: { alive: false, pos: { x: 1, y: 0, z: 2 } } }));
  assert.deepEqual(
    ev2.find((e) => e.type === 'bombDropped'),
    { type: 'bombDropped', actorId: 0, reason: 'death', pos: { x: 1, y: 0, z: 2 } },
  );
  assert.equal(m.snapshot().bomb.dropped, true);
});

test('暂停不推进时间；重开后状态干净且无旧事件回放', () => {
  const m = newMatch();
  m.startRound('b1');
  m.update(5, facts());
  m.command({ type: 'startPlant', actorId: 'b1' });
  m.update(2, facts({ b1: { inSite: 'A' } }));
  const s1 = JSON.stringify(m.snapshot());
  const s2 = JSON.stringify(m.snapshot()); // 暂停 = 不调用 update，快照不变
  assert.equal(s1, s2);
  m.restart();
  const s = m.snapshot();
  assert.equal(s.phase, 'idle');
  assert.deepEqual(s.score, { BL: 0, GR: 0 });
  assert.equal(s.bomb, null);
  assert.deepEqual(m.update(0, facts()), []); // idle 下不产生事件
  m.startRound('b1');
  assert.deepEqual(m.update(5, facts()), [{ type: 'phaseLive' }]); // 只有新事件，无回放
});
