// HUD 闪光白屏状态机单元测试（node --test）
// 契约（phase-5-wiring §4.1）：s.blind = { remaining, intensity }；opacity ∝ intensity × remaining 归一；
// remaining ≤ 0 / 无数据时隐藏。跨帧 episode 状态由 HUD 持有，这里直接测纯函数。
import test from 'node:test';
import assert from 'node:assert/strict';
import { updateBlindState } from '../../src/hud.js';

const fresh = () => ({ remaining: 0, duration: 0 });

test('新闪光：可见，opacity = intensity × 1（满时长）', () => {
  const st = fresh();
  const r = updateBlindState(st, { remaining: 2, intensity: 0.8 });
  assert.equal(r.visible, true);
  assert.ok(Math.abs(r.opacity - 0.8) < 1e-9, `opacity=${r.opacity}`);
  assert.ok(Math.abs(st.duration - 2) < 1e-9);
});

test('衰减中：opacity ∝ remaining / 满时长', () => {
  const st = fresh();
  updateBlindState(st, { remaining: 2, intensity: 0.8 });
  const r = updateBlindState(st, { remaining: 1, intensity: 0.8 });
  assert.ok(Math.abs(r.opacity - 0.4) < 1e-9, `opacity=${r.opacity}`);
});

test('叠加更弱/更短的闪光：不重置满时长（原 episode 继续衰减）', () => {
  const st = fresh();
  updateBlindState(st, { remaining: 2, intensity: 0.8 });
  const r = updateBlindState(st, { remaining: 0.5, intensity: 0.3 });
  assert.ok(Math.abs(st.duration - 2) < 1e-9, `duration=${st.duration}`);
  assert.ok(r.opacity < 0.25, `opacity=${r.opacity}`);
});

test('更晚到期的更强闪光：重置满时长（重新起算）', () => {
  const st = fresh();
  updateBlindState(st, { remaining: 1, intensity: 0.4 });
  const r = updateBlindState(st, { remaining: 2.5, intensity: 0.9 });
  assert.ok(Math.abs(st.duration - 2.5) < 1e-9, `duration=${st.duration}`);
  assert.ok(Math.abs(r.opacity - 0.9) < 1e-9, `opacity=${r.opacity}`);
});

test('remaining ≤ 0 或无数据：隐藏且 opacity 0，状态清零', () => {
  const st = fresh();
  updateBlindState(st, { remaining: 2, intensity: 0.8 });
  for (const blind of [{ remaining: 0, intensity: 0.5 }, { remaining: -1, intensity: 0.5 }, null, undefined]) {
    const r = updateBlindState(st, blind);
    assert.equal(r.visible, false);
    assert.equal(r.opacity, 0);
  }
  assert.equal(st.remaining, 0);
  assert.equal(st.duration, 0);
});

test('intensity 缺失/越界：安全夹紧到 0..1', () => {
  const st = fresh();
  assert.equal(updateBlindState(st, { remaining: 1, intensity: 5 }).opacity, 1);
  assert.equal(updateBlindState(st, { remaining: 1 }).opacity, 0);
  assert.equal(updateBlindState(st, { remaining: 1, intensity: -2 }).opacity, 0);
});

test('重新起闪（上次已清零）：按新满时长渲染', () => {
  const st = fresh();
  updateBlindState(st, { remaining: 2, intensity: 0.8 });
  updateBlindState(st, null);
  const r = updateBlindState(st, { remaining: 1.5, intensity: 0.6 });
  assert.ok(Math.abs(r.opacity - 0.6) < 1e-9, `opacity=${r.opacity}`);
});
