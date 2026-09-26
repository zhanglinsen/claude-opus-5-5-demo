// 地图注册表单元测试（node --test）
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, getMapDescriptor, resolveMapId, firstAvailableMapId, inSpawnZone } from '../../src/maps/registry.js';

test('注册表包含运输船（可用）与沙漠灰（阶段 2 前不可用）', () => {
  assert.equal(MAPS['transport-ship'].available, true);
  assert.equal(MAPS['desert-grey'].available, false);
  assert.deepEqual(MAPS['desert-grey'].supportedModes, ['bomb', 'tdm', 'practice']);
});

test('resolveMapId：新玩家在沙漠灰开放前回退到运输船', () => {
  assert.equal(resolveMapId(null, null), 'transport-ship');
});

test('resolveMapId：URL 参数优先，且不可用的地图被跳过', () => {
  assert.equal(resolveMapId('transport-ship', 'transport-ship'), 'transport-ship');
  assert.equal(resolveMapId('desert-grey', null), 'transport-ship'); // 未开放 → 回退
  assert.equal(resolveMapId('nonsense', 'transport-ship'), 'transport-ship'); // 非法 id → 忽略
});

test('resolveMapId：无 URL 参数时使用已存设置', () => {
  assert.equal(resolveMapId(null, 'transport-ship'), 'transport-ship');
});

test('运输船描述：模式 / 寻路 / 小地图 / 菜单镜头 / AI 常量齐全且自洽', () => {
  const d = getMapDescriptor('transport-ship');
  assert.ok(d.supportedModes.includes('tdm'));
  assert.equal(d.defaultMode, 'tdm');
  for (const k of ['x0', 'z0', 'x1', 'z1', 'cell', 'agentR']) assert.equal(typeof d.nav[k], 'number');
  assert.ok(d.nav.x0 < d.nav.x1 && d.nav.z0 < d.nav.z1);
  // 边界契约：寻路范围不超出可玩边界
  assert.ok(d.bounds.x0 <= d.nav.x0 && d.nav.x1 <= d.bounds.x1 && d.bounds.z0 <= d.nav.z0 && d.nav.z1 <= d.bounds.z1, 'bounds 包住 nav 范围');
  assert.equal(typeof d.spawnYFallback, 'number');
  assert.equal(d.radar.widthM, 74);
  assert.equal(d.radar.overlays.length, 2);
  assert.equal(typeof d.menu.orbit.r, 'number');
  assert.ok(Array.isArray(d.ai.holds) && d.ai.holds.length > 0);
  assert.ok(Array.isArray(d.ai.lanes) && d.ai.lanes.length > 0);
  assert.ok(Array.isArray(d.ai.flank) && d.ai.flank.length >= 3);
  assert.equal(typeof d.menu.blurb, 'string');
});

test('inSpawnZone：双方出生区判定（潜伏者左舷 / 保卫者右舷）', () => {
  const d = getMapDescriptor('transport-ship');
  assert.equal(inSpawnZone(d, 'BL', { x: -30 }), true);
  assert.equal(inSpawnZone(d, 'BL', { x: 0 }), false);
  assert.equal(inSpawnZone(d, 'GR', { x: 30 }), true);
  assert.equal(inSpawnZone(d, 'GR', { x: 0 }), false);
});

test('firstAvailableMapId 返回可用地图', () => {
  assert.equal(firstAvailableMapId(), 'transport-ship');
});
