// HUD 结算军衔行 + 投掷物背包行单元测试（node --test）
// 契约（phase-5-profile-adapter §4 / phase-5-wiring §4.3/4.4）：
//  - s.award = { awarded, xp, rankUp, rank } 发分后快照，awarded:false 静默；
//  - slot 3 展示 he/flash/smoke 名称与剩余量，当前型号高亮。
import test from 'node:test';
import assert from 'node:assert/strict';
import { awardLine, nadeSummary } from '../../src/hud.js';

const rank = (over = {}) => ({ rankName: '列兵', level: 2, xp: 120, nextThreshold: 300, progress: 0.4, ...over });

test('awardLine：无结算/未发分（去重重放）→ 空串', () => {
  assert.equal(awardLine(null), '');
  assert.equal(awardLine(undefined), '');
  assert.equal(awardLine({ awarded: false, xp: 0, rankUp: false, rank: rank() }), '');
});

test('awardLine：发分 → 含 XP、军衔名与级别', () => {
  const s = awardLine({ awarded: true, xp: 120, rankUp: false, rank: rank() });
  assert.ok(s.includes('+120'), `line=${s}`);
  assert.ok(s.includes('列兵'), `line=${s}`);
  assert.ok(s.includes('2'), `line=${s}`);
});

test('awardLine：rankUp → 明确的晋升标识', () => {
  const s = awardLine({ awarded: true, xp: 80, rankUp: true, rank: rank() });
  assert.ok(s.includes('晋升'), `line=${s}`);
});

test('awardLine：rank 缺失（防御）→ 仍给出 XP，不抛异常', () => {
  const s = awardLine({ awarded: true, xp: 30, rankUp: false, rank: null });
  assert.ok(s.includes('+30'), `line=${s}`);
});

test('nadeSummary：按背包顺序输出剩余量与当前高亮', () => {
  const rows = nadeSummary(['he', 'flash', 'smoke'], {}, 'flash');
  assert.deepEqual(rows.map((r) => r.id), ['he', 'flash', 'smoke']);
  assert.deepEqual(rows.map((r) => r.count), [1, 1, 1]);
  assert.deepEqual(rows.map((r) => r.current), [false, true, false]);
  assert.ok(rows.every((r) => r.name && r.name.length > 0));
});

test('nadeSummary：已用掉的型号不再显示；当前指针跟随轮换', () => {
  const rows = nadeSummary(['he', 'flash', 'smoke'], { he: 1 }, 'smoke');
  assert.deepEqual(rows.map((r) => r.id), ['flash', 'smoke']);
  assert.equal(rows.find((r) => r.id === 'smoke').current, true);
});

test('nadeSummary：空背包/空数据安全', () => {
  assert.deepEqual(nadeSummary([], {}, 'he'), []);
  assert.deepEqual(nadeSummary(null, null, null), []);
});
