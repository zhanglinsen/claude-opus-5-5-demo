// 枪械/投掷物模型注册表完整性测试（node --test，仅查表，不建几何）。
// 背景：Game.makeIcons() 启动时遍历 Object.keys(WEAPONS) 调 buildGunMerged(id)，
// builders 缺项会让 Game.init 中断、所有地图无法开局（见 .ultra/reports/guns-builders-fix.md）。
// 这条测试封死"weapons.js 新增武器忘建模型"的回归；建不出几何/渲染由浏览器 e2e 兜底。
import test from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS } from '../../src/weapons.js';
import { builders } from '../../src/guns.js';

test('WEAPONS 的每个 id 都有对应模型 builder（icons 与第一人称模型依赖此表）', () => {
  const missing = Object.keys(WEAPONS).filter((id) => typeof builders[id] !== 'function');
  assert.deepEqual(missing, [], `builders 缺少: ${missing.join(', ')}`);
});
