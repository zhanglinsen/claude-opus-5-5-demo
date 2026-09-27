// 练习模式运行时单元测试（node --test）：靶点布局元数据由测试注入（地图文件不在本测试范围）
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTargetStates, raySphere, pickTarget } from '../../src/modes/practice-targets.js';
import { PracticeRuntime } from '../../src/modes/practice-runtime.js';

const SPOTS = [
  { id: 't1', pos: { x: 5, y: 1.5, z: 0 }, radius: 0.5 },
  { id: 't2', pos: { x: -2, y: 1.2, z: 8 } },            // 用默认半径/可见性
  { id: 't3', pos: { x: 10, y: 1.5, z: 0 }, visible: false }, // 隐蔽靶：不可被射线选中
];

test('createTargetStates：校验并去重布局元数据，radius/visible 提供默认值', () => {
  const states = createTargetStates([
    ...SPOTS,
    { id: 't1', pos: { x: 0, y: 0, z: 0 } }, // 重复 ID：取首个
    { id: '', pos: { x: 0, y: 0, z: 0 } },   // 非法 ID
    { id: 42, pos: { x: 0, y: 0, z: 0 } },   // 非法 ID
    { id: 't4', pos: { x: 'x', y: 1, z: 2 } }, // pos 非数值
    { id: 't5' },                              // 缺 pos
    null,
  ]);
  assert.deepEqual(states.map((s) => s.id), ['t1', 't2', 't3']);
  assert.equal(states[0].radius, 0.5);
  assert.ok(states[1].radius > 0, '缺省半径应为正数');
  assert.equal(states[1].visible, true);
  assert.equal(states[2].visible, false);
  // 可序列化纯对象
  assert.doesNotThrow(() => JSON.stringify(states));
  assert.deepEqual(createTargetStates(), []);
});

test('raySphere：返回沿射线的最近正交命中距离；未命中/背后/零向量返回 -1', () => {
  const origin = { x: 0, y: 1.5, z: 0 };
  const center = { x: 5, y: 1.5, z: 0 };
  assert.ok(Math.abs(raySphere(origin, { x: 1, y: 0, z: 0 }, center, 0.5) - 4.5) < 1e-9);
  // 斜向射线命中（方向未归一化；球心放在该斜射线的轴上，距原点 5m）
  const d = raySphere(origin, { x: 3, y: 0, z: 4 }, { x: 3, y: 1.5, z: 4 }, 0.5);
  assert.ok(d > 0 && Math.abs(d - 4.5) < 1e-6, `斜向命中距离应仍为 4.5，得到 ${d}`);
  // 未命中
  assert.equal(raySphere(origin, { x: 0, y: 1, z: 0 }, center, 0.5), -1);
  // 球在射线背后
  assert.equal(raySphere(origin, { x: -1, y: 0, z: 0 }, center, 0.5), -1);
  // 原点在球内：返回离开球面的距离
  const inside = raySphere({ x: 5, y: 1.5, z: 0 }, { x: 1, y: 0, z: 0 }, center, 0.5);
  assert.ok(Math.abs(inside - 0.5) < 1e-9);
  // 零向量方向安全
  assert.equal(raySphere(origin, { x: 0, y: 0, z: 0 }, center, 0.5), -1);
});

test('pickTarget：选最近可见靶、尊重 maxDist、返回命中点；隐蔽靶不可被选中', () => {
  // 朝 +x 看：t1 在 5m，t3 在 10m 但 visible:false
  const states = createTargetStates(SPOTS);
  const hit = pickTarget(states, { x: 0, y: 1.5, z: 0 }, { x: 1, y: 0, z: 0 }, 100);
  assert.equal(hit.id, 't1');
  assert.ok(Math.abs(hit.dist - 4.5) < 1e-9);
  assert.ok(Math.abs(hit.point.x - 4.5) < 1e-9);
  // maxDist 截断：t1 距离 4.5，4m 内无命中
  assert.equal(pickTarget(states, { x: 0, y: 1.5, z: 0 }, { x: 1, y: 0, z: 0 }, 4), null);
  // 隐蔽靶即使最近也不可选中
  const onlyHidden = createTargetStates([{ id: 'h', pos: { x: 1, y: 0, z: 0 }, visible: false }]);
  assert.equal(pickTarget(onlyHidden, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 100), null);
  // 非法输入安全
  assert.equal(pickTarget(states, { x: 0, y: 1.5, z: 0 }, { x: 0, y: 0, z: 0 }, 100), null);
  assert.equal(pickTarget([], { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 100), null);
});

test('PracticeRuntime：由布局元数据生成靶体并驱动 PracticeSession，弹道命中登记', () => {
  const rt = new PracticeRuntime({ spots: SPOTS });
  let snap = rt.snapshot();
  assert.deepEqual(snap.targets.map((t) => t.id), ['t1', 't2', 't3']);
  assert.equal(snap.totalHits, 0);
  // 弹道命中 t1：登记到会话
  const hit = rt.hitScan({ x: 0, y: 1.5, z: 0 }, { x: 1, y: 0, z: 0 }, 100);
  assert.equal(hit.id, 't1');
  snap = rt.snapshot();
  assert.equal(snap.totalHits, 1);
  assert.equal(snap.targets.find((t) => t.id === 't1').hits, 1);
  assert.ok(snap.targets.find((t) => t.id === 't1').flash > 0);
  // 落空：不登记
  assert.equal(rt.hitScan({ x: 0, y: 1.5, z: 0 }, { x: 0, y: 1, z: 0 }, 100), null);
  assert.equal(rt.snapshot().totalHits, 1);
  // 直接命中接缝（Game 用弹道结果调用）：已知/未知 ID
  assert.equal(rt.registerHit('t2'), true);
  assert.equal(rt.registerHit('nope'), false);
  assert.equal(rt.registerHit(null), false);
  assert.equal(rt.snapshot().totalHits, 2);
  // update 推进模拟时间；暂停 = 不调用
  rt.update(0.5);
  assert.ok(Math.abs(rt.snapshot().now - 0.5) < 1e-9);
  rt.update(-1);
  rt.update('x');
  assert.ok(Math.abs(rt.snapshot().now - 0.5) < 1e-9);
});

test('任意换枪：合法目录枪械全可选（含近战/投掷物），slot 3 投掷物轮换替换', () => {
  const rt = new PracticeRuntime({ spots: SPOTS });
  assert.equal(rt.selectWeapon('ak47'), true);
  assert.equal(rt.selectWeapon('deagle'), true);
  assert.equal(rt.selectWeapon('knife'), true); // 近战合法
  let snap = rt.snapshot();
  assert.equal(snap.weapon.current, 'knife');
  assert.equal(snap.weapon.slots[2], 'knife');
  // 投掷物槽位语义：slot 3 三选一，后选替换先选
  assert.equal(rt.selectWeapon('he'), true);
  assert.equal(rt.selectWeapon('flash'), true);
  snap = rt.snapshot();
  assert.equal(snap.weapon.slots[3], 'flash');
  assert.equal(snap.weapon.current, 'flash');
  assert.ok(!Object.values(snap.weapon.slots).includes('he'), '被替换的投掷物不应残留');
  // 非法输入：目录外/空串/非字符串，不改变当前选择
  assert.equal(rt.selectWeapon('b41'), false);
  assert.equal(rt.selectWeapon(''), false);
  assert.equal(rt.selectWeapon(null), false);
  assert.equal(rt.selectWeapon(42), false);
  assert.equal(rt.snapshot().weapon.current, 'flash');
  // 原型链成员名不算目录内枪械（P2-1）：不得通过校验，也不得成为当前选择
  assert.equal(rt.canSelectWeapon('toString'), false);
  assert.equal(rt.canSelectWeapon('constructor'), false);
  assert.equal(rt.selectWeapon('toString'), false);
  assert.equal(rt.selectWeapon('constructor'), false);
  assert.equal(rt.selectWeapon('hasOwnProperty'), false);
  assert.equal(rt.snapshot().weapon.current, 'flash');
  assert.ok(!Object.values(rt.snapshot().weapon.slots).includes('toString'),
    '继承名不得进入任何槽位');
  // canSelectWeapon 只读校验：合法/非法
  assert.equal(rt.canSelectWeapon('awm'), true);
  assert.equal(rt.canSelectWeapon('mp5'), true);
  assert.equal(rt.canSelectWeapon('b41'), false);
  assert.equal(rt.canSelectWeapon(undefined), false);
});

test('reset：清空命中统计与模拟时间，保留靶子结构与换枪选择；snapshot 透传会话字段', () => {
  const rt = new PracticeRuntime({ spots: SPOTS });
  rt.selectWeapon('awm');
  rt.registerHit('t1');
  rt.update(2);
  rt.reset();
  const snap = rt.snapshot();
  assert.equal(snap.totalHits, 0);
  assert.equal(snap.now, 0);
  assert.deepEqual(snap.targets.map((t) => t.id), ['t1', 't2', 't3']);
  for (const t of snap.targets) {
    assert.equal(t.hits, 0);
    assert.equal(t.flash, 0);
  }
  assert.equal(snap.weapon.current, 'awm', '换枪选择属于玩家偏好，重开不清除');
  // 重置后照常统计
  assert.equal(rt.registerHit('t3'), true);
  assert.equal(rt.snapshot().totalHits, 1);
});

test('坏输入：非法/缺省 spots 与无参构造安全，运行时不产生幽灵靶', () => {
  const rt = new PracticeRuntime({ spots: [null, { id: 'ok', pos: { x: 1, y: 1, z: 1 } }, 'junk'] });
  assert.deepEqual(rt.snapshot().targets.map((t) => t.id), ['ok']);
  assert.equal(new PracticeRuntime().snapshot().targets.length, 0);
  assert.equal(new PracticeRuntime({}).snapshot().totalHits, 0);
});
