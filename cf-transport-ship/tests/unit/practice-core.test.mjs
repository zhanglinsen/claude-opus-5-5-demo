// 练习模式纯核心单元测试（node --test）：只测公开行为，靶点由注入提供
import test from 'node:test';
import assert from 'node:assert/strict';
import { PracticeSession } from '../../src/modes/practice.js';

test('注入合法靶点数组：snapshot 返回可序列化靶子状态，命中数从 0 起', () => {
  const session = new PracticeSession({ targets: [{ id: 't1', pos: { x: 1, z: 2 } }, { id: 't2' }] });
  const snap = session.snapshot();
  assert.deepEqual(snap.targets.map((t) => t.id), ['t1', 't2']);
  assert.equal(snap.targets[0].pos.x, 1);
  assert.equal(snap.targets[0].hits, 0);
  assert.equal(snap.totalHits, 0);
  assert.doesNotThrow(() => JSON.stringify(snap)); // 可序列化
});

test('命中指定 ID：对应靶子命中数+1 并短暂反应；未知 ID 安全忽略且不新增状态', () => {
  const session = new PracticeSession({ targets: [{ id: 'a' }, { id: 'b' }] });
  assert.equal(session.hit('a'), true);
  assert.equal(session.hit('a'), true);
  assert.equal(session.hit('nope'), false);
  const snap = session.snapshot();
  assert.equal(snap.totalHits, 2);
  const a = snap.targets.find((t) => t.id === 'a');
  assert.equal(a.hits, 2);
  assert.ok(a.flash > 0, '受击后应有短暂反应');
  assert.equal(snap.targets.find((t) => t.id === 'b').hits, 0);
  assert.deepEqual(snap.targets.map((t) => t.id), ['a', 'b']); // 未知 ID 未新增靶子
});

test('update(dt) 按模拟时间衰减受击反应；不调用 update 即冻结，衰减量与 dt 累计一致', () => {
  const makeHit = () => {
    const s = new PracticeSession({ targets: [{ id: 'a' }] });
    s.hit('a');
    return s;
  };
  const paused = makeHit();
  const pausedFlash = paused.snapshot().targets[0].flash;
  const stepped = makeHit();
  stepped.update(0.1);
  const flashAfterStep = stepped.snapshot().targets[0].flash;
  assert.ok(flashAfterStep > 0 && flashAfterStep < pausedFlash);
  assert.equal(paused.snapshot().targets[0].flash, pausedFlash,
    '暂停者不调用 update，反应保持不变');
  // 衰减量与 dt 累计一致：两次 0.1 == 一次 0.2
  const twice = makeHit();
  twice.update(0.1);
  twice.update(0.1);
  const once = makeHit();
  once.update(0.2);
  assert.ok(Math.abs(twice.snapshot().targets[0].flash - once.snapshot().targets[0].flash) < 1e-9);
  // 衰减到 0 为止，不为负；now 随模拟时间累计
  stepped.update(10);
  assert.equal(stepped.snapshot().targets[0].flash, 0);
  assert.ok(Math.abs(stepped.snapshot().now - 10.1) < 1e-9);
});

test('reset 清除统计：命中归零、受击反应清零、模拟时间归零，靶子结构保留', () => {
  const session = new PracticeSession({ targets: [{ id: 'a' }, { id: 'b' }] });
  session.hit('a');
  session.hit('b');
  session.update(1.5);
  session.reset();
  const snap = session.snapshot();
  assert.equal(snap.totalHits, 0);
  assert.equal(snap.now, 0);
  assert.deepEqual(snap.targets.map((t) => t.id), ['a', 'b']);
  for (const t of snap.targets) {
    assert.equal(t.hits, 0);
    assert.equal(t.flash, 0);
  }
  // 重置后照常继续统计
  assert.equal(session.hit('a'), true);
  assert.equal(session.snapshot().totalHits, 1);
});

test('坏输入安全忽略：非法靶子条目去重过滤，非法 dt/命中 ID 不产生新状态', () => {
  const session = new PracticeSession({
    targets: [{ id: 'a' }, { id: 'a' }, { id: '' }, { id: 42 }, null, 'a'],
  });
  assert.deepEqual(session.snapshot().targets.map((t) => t.id), ['a']); // 只留首个合法条目
  // 非法命中输入：不抛错、不计数、不新增靶子
  assert.equal(session.hit(null), false);
  assert.equal(session.hit(3), false);
  assert.equal(session.hit({}), false);
  assert.equal(session.hit(), false);
  assert.equal(session.snapshot().totalHits, 0);
  assert.deepEqual(session.snapshot().targets.map((t) => t.id), ['a']);
  // 非法 dt：不推进时间、不影响衰减
  const flash = session.hit('a') && session.snapshot().targets[0].flash;
  session.update(NaN);
  session.update(-0.5);
  session.update('x');
  assert.equal(session.snapshot().now, 0);
  assert.equal(session.snapshot().targets[0].flash, flash);
  // 无参构造同样安全
  const empty = new PracticeSession();
  assert.deepEqual(empty.snapshot().targets, []);
  assert.equal(empty.hit('x'), false);
});
