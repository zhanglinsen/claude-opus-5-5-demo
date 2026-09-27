// 战斗文案与显示名本地化（Task 10 / US-02）：node --test 可跑，不依赖 DOM/浏览器。
// 覆盖：战斗消息/报点/模式提示的双语输出、语言服务注入与中文回退、
// 军衔稳定键与旧档案回归（存档不含译文、数值不受语言影响）。
import test from 'node:test';
import assert from 'node:assert/strict';

import { validateCatalogs, createLocaleService } from '../../src/i18n/locale-service.js';
import { CATALOGS } from '../../src/i18n/catalogs.js';
import { MODES, getMode } from '../../src/modes/index.js';
import { MAPS, mapDisplayKeys } from '../../src/maps/registry.js';
import { DESERT_LAYOUT } from '../../src/maps/desert-grey-layout.js';
import { RANKS, RANK_TIER_KEYS, rankKeyAt } from '../../src/profile/rank.js';
import { createProfileService } from '../../src/profile/service.js';
import { PROFILE_KEY } from '../../src/profile/repository.js';
import { Game, killBadgeText, killedByText } from '../../src/game.js';

// —— 语言服务：storage 置空、来源全部显式，defaultLocale 即生效语言 ——
function locale(tag) {
  return createLocaleService({
    catalogs: CATALOGS, storage: null, platformLocale: null, browserLocale: null, defaultLocale: tag,
  });
}
const zh = locale('zh');
const en = locale('en');

test('目录体检通过（Task 10 新增键中英成对）', () => {
  assert.deepEqual(validateCatalogs(CATALOGS), []);
  for (const k of [
    'player.self', 'mode.tdm.toast', 'mode.bomb.toast', 'mode.practice.toast',
    'callout.multi2', 'callout.multi8', 'callout.knife',
    'hud.weaponEquipped', 'hud.weaponOnRespawn', 'hud.rankUpToast', 'hud.fpsHint',
    'bomb.roundEndReason', 'bomb.reason.timeout', 'bomb.reason.blWiped',
    'load.step.renderer', 'load.step.done',
  ]) {
    assert.ok(CATALOGS.zh[k], `zh 缺键 ${k}`);
    assert.ok(CATALOGS.en[k], `en 缺键 ${k}`);
  }
});

test('地图报点：desert-grey 全部 region id 有双语键，且与注册表中文名一致', () => {
  for (const r of DESERT_LAYOUT.regions) {
    const key = `map.desert-grey.region.${r.id}`;
    assert.equal(CATALOGS.zh[key], r.name, `zh ${key} 应与注册表 name 一致`);
    assert.ok(CATALOGS.en[key], `en 缺键 ${key}`);
  }
});

test('Game.t 未注入语言服务时安全保留中文；tf 对缺键回退 fallback', () => {
  const g = Object.create(Game.prototype);
  g.localeService = null;
  assert.equal(g.t('hud.dead'), '你阵亡了');
  assert.equal(g.t('callout.kill', { name: 'Bot' }), '击杀 Bot');
  assert.equal(g.tf('no.such.key', null, '回退文案'), '回退文案');
});

test('setLocaleService 注入后战斗文案即时切换语言', () => {
  const g = Object.create(Game.prototype);
  g.localeService = null;
  assert.equal(g.t('hud.dead'), '你阵亡了');
  g.setLocaleService(en);
  assert.equal(g.t('hud.dead'), 'YOU DIED');
  assert.equal(g.t('bomb.reason.timeout'), 'Time up');
  assert.equal(g.weaponName('deagle'), 'Desert Eagle');
  assert.equal(g.weaponName('unknown-gun'), 'unknown-gun');
  // 非语言服务输入被拒绝，回退中文
  g.setLocaleService(null);
  assert.equal(g.t('hud.dead'), '你阵亡了');
});

test('击杀徽章：多杀/爆头/刀杀副标随语言变化，横幅保持现役英文风格', () => {
  assert.deepEqual(killBadgeText(zh.t, { multi: 2, victimName: 'Bot' }),
    { text: 'DOUBLE KILL', sub: '双杀 · 击杀 Bot' });
  assert.equal(killBadgeText(en.t, { multi: 2, victimName: 'Bot' }).sub, 'Double kill · Killed Bot');
  assert.equal(killBadgeText(zh.t, { headshot: true, victimName: 'Bot' }).sub, '爆头 · 击杀 Bot');
  assert.equal(killBadgeText(zh.t, { weaponId: 'knife', victimName: 'Bot' }).sub, '刀杀 · 击杀 Bot');
  assert.equal(killBadgeText(zh.t, { weaponId: 'he', victimName: 'Bot' }).sub, '手雷击杀 · 击杀 Bot');
  assert.equal(killBadgeText(zh.t, { wall: true, victimName: 'Bot' }).sub, '穿墙击杀 · 击杀 Bot');
  assert.equal(killBadgeText(zh.t, { victimName: 'Bot' }).text, 'KILL');
  assert.equal(killBadgeText(en.t, { multi: 9, victimName: 'Bot' }).text, 'GODLIKE');
});

test('阵亡提示：双语模板 + 攻击者阵营色名牌，无攻击者回退「你阵亡了」', () => {
  const dead = killedByText(zh.t, {});
  assert.equal(dead, '你阵亡了');
  const zhMsg = killedByText(zh.t, { attackerName: 'Bot7', attackerTeam: 'GR', weapon: 'AWM', headshot: true });
  assert.ok(zhMsg.includes('被 <span style="color:#8cc8ff">Bot7</span> 用 AWM 爆头击杀'), zhMsg);
  const enMsg = killedByText(en.t, { attackerName: 'Bot7', attackerTeam: 'BL', weapon: 'AWM', headshot: false });
  assert.ok(enMsg.includes('Killed by <span style="color:#ff9b70">Bot7</span> with AWM'), enMsg);
});

test('模式开局提示：缺省中文（含目标数），注入 en 后走英文键', () => {
  assert.ok(getMode('tdm').toast(30).includes('30'));
  assert.ok(getMode('tdm').toast(30).includes('团队竞技'));
  assert.ok(getMode('tdm').toast(30, en.t).includes('30'));
  assert.ok(getMode('tdm').toast(30, en.t).includes('Team Deathmatch'));
  assert.ok(getMode('bomb').toast(0, en.t).includes('Bomb Defuse'));
  assert.ok(getMode('practice').toast(0, en.t).includes('Practice'));
  for (const id of ['tdm', 'bomb', 'practice']) assert.equal(MODES[id].name, CATALOGS.zh[`mode.${id}.name`]);
});

test('地图注册表：原 name/en 数据保持不动，公开显示名走翻译键', () => {
  assert.equal(MAPS['transport-ship'].name, '运输船');
  assert.equal(MAPS['desert-grey'].en, 'DESERT GREY');
  for (const id of ['transport-ship', 'desert-grey']) {
    const keys = mapDisplayKeys(id);
    for (const k of Object.values(keys)) {
      assert.ok(CATALOGS.zh[k], `zh 缺键 ${k}`);
      assert.ok(CATALOGS.en[k], `en 缺键 ${k}`);
    }
  }
});

test('军衔稳定键与 RANKS 档位顺序一一对应，译文键齐全', () => {
  assert.equal(RANK_TIER_KEYS.length, RANKS.length);
  RANKS.forEach((tier, i) => {
    const key = rankKeyAt(i);
    assert.ok(key);
    assert.equal(CATALOGS.zh[`rank.${key}.name`], tier.name, `rank.${key}.name 应为 ${tier.name}`);
    assert.ok(CATALOGS.en[`rank.${key}.name`]);
  });
  assert.equal(rankKeyAt(-1), null);
  assert.equal(rankKeyAt(RANKS.length), null);
});

test('旧档案回归：存档只含 ID/数值，发分后 xp 增量与预设 ID 不受语言影响', () => {
  function memoryStorage() {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
  }
  const storage = memoryStorage();
  const seed = createProfileService({ storage });
  seed.setPresetSlot(0, { primary: 'awm', grenade: 'flash' });
  const before = JSON.parse(storage.getItem(PROFILE_KEY));

  const svc = createProfileService({ storage });
  const res = svc.applyResult({ key: 'tdm:old-save-regression', mode: 'tdm', outcome: 'win', kills: 5, objectives: 1 });
  const after = JSON.parse(storage.getItem(PROFILE_KEY));

  assert.equal(res.xp, 5 * 10 + 1 * 50 + 100); // 规则数值与语言无关
  assert.equal(after.xp, before.xp + res.xp);
  assert.deepEqual(after.presets, before.presets); // 装备 ID 原值不变
  assert.deepEqual(Object.keys(after), Object.keys(before)); // 无新增/丢失字段
  assert.ok(!Object.keys(CATALOGS.en).some((k) => JSON.stringify(after).includes(CATALOGS.en[k])), '存档不得包含译文');
});
