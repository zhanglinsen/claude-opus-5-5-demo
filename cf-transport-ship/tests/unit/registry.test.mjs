// 地图注册表单元测试（node --test）
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, getMapDescriptor, resolveMapId, firstAvailableMapId, inSpawnZone } from '../../src/maps/registry.js';

test('注册表包含运输船与沙漠灰（阶段 2 起均可用）', () => {
  assert.equal(MAPS['transport-ship'].available, true);
  assert.equal(MAPS['desert-grey'].available, true);
  assert.deepEqual(MAPS['desert-grey'].supportedModes, ['bomb', 'tdm', 'practice']);
  // 阶段 3：沙图默认进入 5v5 爆破；团队竞技仍显式可选
  assert.equal(MAPS['desert-grey'].defaultMode, 'bomb');
});

test('resolveMapId：新玩家默认沙漠灰（NEW_PLAYER_DEFAULT_MAP）', () => {
  assert.equal(resolveMapId(null, null), 'desert-grey');
});

test('resolveMapId：URL 参数优先', () => {
  assert.equal(resolveMapId('transport-ship', 'transport-ship'), 'transport-ship');
  assert.equal(resolveMapId('desert-grey', null), 'desert-grey');
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

test('沙漠灰描述：约定坐标 / 边界 / 小地图 / 菜单镜头 / 阵营出生区自洽', () => {
  const d = getMapDescriptor('desert-grey');
  // 阶段 2 契约：沙图走高度感知导航图（map.navGraph），注册表不再提供平面寻路网格
  assert.equal(d.nav, null);
  assert.equal(typeof d.spawnYFallback, 'number');
  assert.equal(typeof d.killY, 'number');
  assert.ok(d.bounds.x0 < d.bounds.x1 && d.bounds.z0 < d.bounds.z1);
  assert.equal(typeof d.radar.widthM, 'number');
  assert.equal(typeof d.menu.orbit.r, 'number');
  assert.equal(typeof d.menu.blurb, 'string');
  assert.equal(d.env.ocean, false); // 沙漠地图不创建海面
  assert.equal(d.ambientKey, null); // 无烟囱等船用氛围
  // 南北端出生区（axis z）：BL 南（+Z）、GR 北（-Z）
  assert.equal(inSpawnZone(d, 'BL', { z: 40 }), true);
  assert.equal(inSpawnZone(d, 'BL', { z: 0 }), false);
  assert.equal(inSpawnZone(d, 'GR', { z: -40 }), true);
  assert.equal(inSpawnZone(d, 'GR', { z: 0 }), false);
});

test('firstAvailableMapId 返回可用地图', () => {
  assert.equal(firstAvailableMapId(), 'transport-ship');
});
