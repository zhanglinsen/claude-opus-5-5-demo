// 枪模后坐弹簧：低帧率下不得发散（旧实现 ≤16 FPS 时连续开火枪模会飞出画面）
import test from 'node:test';
import assert from 'node:assert/strict';
import { stepKickSpring } from '../../src/viewmodel.js';

function fireAt(fps, seconds, rpm = 600) {
  const s = { kick: 0, kickV: 0, kickRot: 0, kickRotV: 0 };
  const dt = 1 / fps, shotEvery = 60 / rpm;
  let t = 0, nextShot = 0, peak = 0;
  for (let i = 0; i < fps * seconds; i++) {
    while (t >= nextShot && t < 3) { s.kickV += 0.05 * 38; s.kickRotV += 0.08 * 38; nextShot += shotEvery; } // 前 3 秒连射
    stepKickSpring(s, dt); t += dt;
    peak = Math.max(peak, Math.abs(s.kick), Math.abs(s.kickRot));
  }
  return { s, peak };
}

test('13/15/16 FPS 连射时后坐有界，停火后回到原位', () => {
  for (const fps of [10, 13, 15, 16]) {
    const { s, peak } = fireAt(fps, 6);
    assert.ok(peak < 0.5, `${fps} FPS 后坐峰值应有界，实际 ${peak}`);
    assert.ok(Math.abs(s.kick) < 1e-3 && Math.abs(s.kickRot) < 1e-3, `${fps} FPS 停火后应回位`);
  }
});

test('60 FPS 及以上与原单步积分逐位一致（手感不变）', () => {
  for (const fps of [60, 120, 144]) {
    const dt = 1 / fps, a = { kick: 0, kickV: 1.9, kickRot: 0, kickRotV: 3 }, b = { ...a };
    for (let i = 0; i < fps; i++) {
      stepKickSpring(a, dt);
      b.kickV += (-260 * b.kick - 26 * b.kickV) * dt; b.kick += b.kickV * dt;
      b.kickRotV += (-260 * b.kickRot - 26 * b.kickRotV) * dt; b.kickRot += b.kickRotV * dt;
    }
    assert.deepEqual(a, b, `${fps} FPS`);
  }
});
