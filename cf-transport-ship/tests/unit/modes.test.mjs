// 模式适配器单元测试（node --test）
import test from 'node:test';
import assert from 'node:assert/strict';
import { MODES, getMode } from '../../src/modes/index.js';

test('tdm 模式默认参数：600 秒、4 秒复活、目标 50 杀', () => {
  const m = getMode('tdm');
  assert.equal(m.defaults.time, 600);
  assert.equal(m.defaults.respawn, 4.0);
  assert.equal(m.defaults.goal, 50);
});

test('checkEnd：任一队伍达到目标即结束', () => {
  const m = getMode('tdm');
  assert.equal(m.checkEnd({ BL: 49, GR: 50 }, 50), true);
  assert.equal(m.checkEnd({ BL: 50, GR: 3 }, 50), true);
  assert.equal(m.checkEnd({ BL: 49, GR: 49 }, 50), false);
});

test('result：以玩家阵营视角判定胜负与平局', () => {
  const m = getMode('tdm');
  assert.equal(m.result({ BL: 51, GR: 49 }, 'BL'), true);
  assert.equal(m.result({ BL: 51, GR: 49 }, 'GR'), false);
  assert.equal(m.result({ BL: 50, GR: 50 }, 'BL'), null);
});

test('getMode：未知模式回退 tdm', () => {
  assert.equal(getMode('nonsense'), MODES.tdm);
});

test('toast 文案包含目标杀数', () => {
  assert.ok(getMode('tdm').toast(30).includes('30'));
});
