// 档案适配层单元测试（node --test）：只测公开行为，service/storage 全部注入。
// 覆盖：loadout 映射与回退、awardMatch 透传语义、rankView 进度边界、
// switchPreset 防护、事件通知，以及 service.js stats/存档归一化回归（P3-1/P3-2）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createProfileAdapter } from '../../src/profile/adapter.js';
import { createProfileService } from '../../src/profile/service.js';
import { CATALOG, SLOT_DEFAULTS } from '../../src/profile/equipment.js';
import { PROFILE_KEY } from '../../src/profile/repository.js';

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

function makeAdapter(storage = memoryStorage()) {
  const service = createProfileService({ storage });
  return { service, storage, adapter: createProfileAdapter({ service }) };
}

// ---------- loadout：预设 → 出生装备 ----------

test('loadout：激活预设映射为全部目录内的出生装备', () => {
  const { service, adapter } = makeAdapter();
  service.switchPreset(1);
  service.setPresetSlot(1, { primary: 'mp5', grenade: 'smoke' });
  const lo = adapter.loadout();
  assert.deepEqual(lo, {
    primary: 'mp5',
    sidearm: 'deagle',
    melee: 'knife',
    grenades: ['smoke'],
    armor: 'standard',
  });
  // 每个槽位都在真实目录内，绝不产出目录外装备
  assert.ok(CATALOG.primary.includes(lo.primary));
  assert.ok(CATALOG.sidearm.includes(lo.sidearm));
  assert.ok(CATALOG.melee.includes(lo.melee));
  for (const g of lo.grenades) assert.ok(CATALOG.grenade.includes(g));
  assert.ok(CATALOG.armor.includes(lo.armor));
});

test('loadout：损坏/目录外槽位值逐槽回退 SLOT_DEFAULTS，不整包作废', () => {
  const { service, adapter } = makeAdapter();
  service.setPresetSlot(0, { primary: 'bfg-9999', grenade: null, sidearm: 42 });
  const lo = adapter.loadout();
  assert.equal(lo.primary, SLOT_DEFAULTS.primary);
  assert.equal(lo.sidearm, SLOT_DEFAULTS.sidearm);
  assert.equal(lo.melee, SLOT_DEFAULTS.melee);
  assert.deepEqual(lo.grenades, [SLOT_DEFAULTS.grenade]);
  assert.equal(lo.armor, SLOT_DEFAULTS.armor);
  // 合法槽位（本例 melee 之前的 he 已被 null 破坏，这里验证合法值原样保留）
  service.setPresetSlot(0, { grenade: 'flash' });
  assert.deepEqual(adapter.loadout().grenades, ['flash']);
});

test('loadout：weapons 注入自定义目录时按注入目录解析与回退', () => {
  const service = createProfileService();
  const customDefaults = { primary: 'laser', sidearm: 'pistol', melee: 'fists', grenade: 'flashbang', armor: 'light' };
  const adapter = createProfileAdapter({
    service,
    weapons: {
      CATALOG: {
        primary: ['laser', 'railgun'], sidearm: ['pistol'], melee: ['fists'],
        grenade: ['flashbang'], armor: ['light'],
      },
      SLOT_DEFAULTS: customDefaults,
    },
  });
  assert.equal(adapter.loadout().primary, 'laser');
  service.setPresetSlot(0, { primary: 'ak47' }); // 真实目录 id，但不在注入目录内
  assert.equal(adapter.loadout().primary, 'laser'); // 回退到注入目录默认
});

// ---------- awardMatch：applyResult 薄封装 ----------

test('awardMatch：tdm 胜场发 XP（硬编码 5*10+100=150），rank 反映发后进度', () => {
  const { adapter } = makeAdapter();
  const r = adapter.awardMatch({ key: 'tdm:m1', mode: 'tdm', outcome: 'win', kills: 5, objectiveActions: 0 });
  assert.equal(r.awarded, true);
  assert.equal(r.xp, 150);
  assert.deepEqual([r.rank.rankName, r.rank.level, r.rank.xp], ['列兵', 1, 150]);
});

test('awardMatch：bomb 结果计入，objectiveActions 映射为安/拆包目标分', () => {
  const { service, adapter } = makeAdapter();
  const r = adapter.awardMatch({ key: 'bomb:m1', mode: 'bomb', outcome: 'win', kills: 2, objectiveActions: 3 });
  assert.equal(r.awarded, true);
  assert.equal(r.xp, 2 * 10 + 3 * 50 + 100);
  assert.equal(service.profile.stats.bomb.matches, 1);
  assert.equal(service.profile.stats.bomb.objectives, 3);
});

test('awardMatch：练习拒绝、重复键拒绝——adapter 不重复发、不绕过 service 白名单', () => {
  const { service, adapter } = makeAdapter();
  const pr = adapter.awardMatch({ key: 'practice:p1', mode: 'practice', outcome: 'win', kills: 99, objectiveActions: 9 });
  assert.equal(pr.awarded, false);
  assert.equal(pr.xp, 0);
  assert.equal(service.profile.stats.practice, undefined);

  const ev = { key: 'tdm:m1', mode: 'tdm', outcome: 'draw', kills: 1, objectiveActions: 0 };
  assert.equal(adapter.awardMatch(ev).awarded, true);
  const again = adapter.awardMatch(ev);
  assert.equal(again.awarded, false);
  assert.equal(again.xp, 0);
  assert.equal(service.profile.xp, 35); // 1*10 + 平局 25，只发了一次
});

// ---------- rankView：进度边界 ----------

test('rankView：全新档案为列兵第 1 级，progress=0，nextThreshold=300', () => {
  const { adapter } = makeAdapter();
  const v = adapter.rankView();
  assert.deepEqual(v, { rankName: '列兵', level: 1, xp: 0, nextThreshold: 300, progress: 0 });
});

test('rankView：跨阈值后级别与进度重新计；满级 nextThreshold=null 且 progress=1', () => {
  const storage = memoryStorage();
  storage.setItem(PROFILE_KEY, JSON.stringify({ v: 1, xp: 299, presets: [], activePreset: 0, stats: {}, ledger: [] }));
  const service = createProfileService({ storage });
  const adapter = createProfileAdapter({ service });

  assert.equal(adapter.rankView().xp, 299);
  assert.equal(adapter.rankView().rankName, '列兵');
  assert.ok(adapter.rankView().progress > 0.98 && adapter.rankView().progress < 1);

  service.applyResult({ key: 'tdm:push', mode: 'tdm', outcome: 'draw', kills: 0, objectives: 0 });
  const crossed = adapter.rankView();
  assert.deepEqual([crossed.rankName, crossed.level], ['下士', 2]);
  assert.equal(crossed.xp, 324);
  assert.ok(crossed.progress >= 0 && crossed.progress < 1);

  storage.setItem(PROFILE_KEY, JSON.stringify({ v: 1, xp: 99000, presets: [], activePreset: 0, stats: {}, ledger: [] }));
  const maxed = createProfileAdapter({ service: createProfileService({ storage }) }).rankView();
  assert.equal(maxed.nextThreshold, null);
  assert.equal(maxed.progress, 1);
});

// ---------- switchPreset / presets ----------

test('switchPreset：合法切换生效，破坏性输入（NaN/负数/越界/非数值）夹紧不崩溃', () => {
  const { adapter } = makeAdapter();
  assert.equal(adapter.switchPreset(2), 2);
  assert.equal(adapter.presets().active, 2);
  assert.equal(adapter.switchPreset(9), 2);   // 越界 → 夹紧 2
  assert.equal(adapter.switchPreset(-5), 0);  // 负数 → 0
  assert.equal(adapter.switchPreset(NaN), 0);
  assert.equal(adapter.switchPreset('garbage'), 0);
  assert.equal(adapter.switchPreset(1.7), 1); // 小数 → 向下取整
  const p = adapter.presets();
  assert.equal(p.list.length, 3);
  assert.equal(p.active, 1);
  assert.ok(CATALOG.primary.includes(p.list[1].primary));
});

// ---------- setPresetSlot 透传（接线报告 §4.7：菜单↔预设双向同步的收敛点） ----------

test('setPresetSlot 透传：合法修改生效，返回值与 service 语义一致（归一化冻结预设），发 preset 事件', () => {
  const { service, adapter } = makeAdapter();
  const events = [];
  adapter.onProfileChanged((e) => events.push(e));

  const ret = adapter.setPresetSlot(1, 'primary', 'awm');
  // 返回值语义与 service 一致：该索引归一化后的冻结预设
  assert.equal(Object.isFrozen(ret), true);
  assert.equal(ret.primary, 'awm');
  assert.deepEqual(ret, service.profile.presets[1]);
  assert.equal(service.profile.presets[1].grenade, SLOT_DEFAULTS.grenade); // 未触碰槽位不变
  assert.equal(service.profile.activePreset, 0); // 不改变激活索引

  adapter.setPresetSlot(1, 'grenade', 'flash');
  assert.equal(service.profile.presets[1].grenade, 'flash');

  // 切到该预设后 loadout 反映修改
  adapter.switchPreset(1);
  assert.equal(adapter.loadout().primary, 'awm');
  assert.deepEqual(adapter.loadout().grenades, ['flash']);

  assert.equal(events.filter((e) => e.reason === 'preset').length, 3);
});

test('setPresetSlot 透传：非法 id 归一到槽默认、非法槽位名被 service 拒绝且状态不变', () => {
  const { service, adapter } = makeAdapter();
  const before = service.profile.presets[2];

  // 目录外 id：与 service 一致，回退该槽默认（归一化，而非报错）
  const badId = adapter.setPresetSlot(2, 'sidearm', 'bfg-9999');
  assert.equal(badId.sidearm, SLOT_DEFAULTS.sidearm);
  assert.equal(service.profile.presets[2].sidearm, SLOT_DEFAULTS.sidearm);

  // 非法槽位名：service 的 normalizePreset 忽略未知键，预设完全不变
  const snapshot = JSON.stringify(service.profile.presets[2]);
  const badSlot = adapter.setPresetSlot(2, 'blade', 'knife-x');
  assert.equal(badSlot.primary, SLOT_DEFAULTS.primary); // 返回值仍是合法归一化预设
  assert.equal(JSON.stringify(service.profile.presets[2]), snapshot); // 状态未变

  // 越界索引夹紧到 0..2（service clampIndex 语义）
  adapter.setPresetSlot(9, 'melee', 'knife');
  assert.equal(service.profile.presets[0].melee, 'knife');
  // 非字符串槽位同样被 service 忽略，不崩溃
  adapter.setPresetSlot(0, 42, 'awm');
  assert.equal(service.profile.presets[0].primary, SLOT_DEFAULTS.primary);
  assert.deepEqual(before && Object.keys(before), Object.keys(service.profile.presets[2]));
});

// ---------- onProfileChanged 事件通知 ----------

test('onProfileChanged：发分与切换预设时通知，拒绝/去重不通知，退订生效', () => {
  const { adapter } = makeAdapter();
  const events = [];
  const off = adapter.onProfileChanged((e) => events.push(e));

  adapter.awardMatch({ key: 'tdm:m1', mode: 'tdm', outcome: 'win', kills: 1, objectiveActions: 0 });
  adapter.awardMatch({ key: 'tdm:m1', mode: 'tdm', outcome: 'win', kills: 1, objectiveActions: 0 }); // 去重，不通知
  adapter.switchPreset(1);
  adapter.awardMatch({ key: 'practice:p1', mode: 'practice', outcome: 'win' }); // 拒绝，不通知

  assert.equal(events.length, 2);
  assert.equal(events[0].reason, 'award');
  assert.equal(events[1].reason, 'preset');
  assert.ok(events.every((e) => e.persistence === 'persisted'));

  off();
  adapter.switchPreset(2);
  assert.equal(events.length, 2); // 退订后不再收到
});

test('onProfileChanged：非函数输入安全忽略，异常监听器不阻断其他监听器', () => {
  const { adapter } = makeAdapter();
  assert.equal(typeof adapter.onProfileChanged(null), 'function');
  assert.equal(typeof adapter.onProfileChanged(42), 'function');
  let called = false;
  adapter.onProfileChanged(() => { throw new Error('listener boom'); });
  adapter.onProfileChanged(() => { called = true; });
  adapter.switchPreset(1);
  assert.equal(called, true);
});

// ---------- persistence 状态透出 ----------

test('persistence：随 service 如实透出（注入 storage / 未注入）', () => {
  assert.equal(makeAdapter().adapter.persistence(), 'persisted');
  assert.equal(createProfileAdapter({ service: createProfileService() }).persistence(), 'memory');
});

// ---------- service.js 归一化回归（P3-1 / P3-2） ----------

test('P3-1 回归：stats 桶垃圾值在归一化时清除，不再跨会话传播/拼接', () => {
  const storage = memoryStorage();
  storage.setItem(PROFILE_KEY, JSON.stringify({
    v: 1, xp: 0, presets: [], activePreset: 0,
    stats: { tdm: { matches: 'x', wins: -3, kills: 12.7, objectives: 'nope' }, bomb: 'garbage' },
    ledger: [],
  }));
  const service = createProfileService({ storage });
  assert.deepEqual(service.profile.stats.tdm, { matches: 0, wins: 0, kills: 12, objectives: 0 });
  assert.equal(service.profile.stats.bomb, undefined); // 非对象桶整个丢弃

  service.applyResult({ key: 'tdm:after', mode: 'tdm', outcome: 'win', kills: 1, objectives: 0 });
  assert.equal(service.profile.stats.tdm.matches, 1); // 数字累加而非 "x1"
  assert.equal(service.profile.stats.tdm.kills, 13);
});

test('P3-2 回归：无版本号存档按全新档案重建', () => {
  const storage = memoryStorage();
  storage.setItem(PROFILE_KEY, JSON.stringify({ xp: 5000, activePreset: 2, ledger: ['k'] }));
  const service = createProfileService({ storage });
  assert.equal(service.profile.xp, 0);
  assert.equal(service.profile.presets.length, 3);
  assert.equal(service.profile.activePreset, 0);
  assert.equal(service.profile.ledger.length, 0);
});

test('P3-2 回归：合法 JSON 但字段全垃圾的存档被字段级重建', () => {
  const storage = memoryStorage();
  storage.setItem(PROFILE_KEY, JSON.stringify({
    v: 1, xp: -5, presets: 'garbage', activePreset: 99, stats: 7, ledger: [1, 'k', null],
  }));
  const service = createProfileService({ storage });
  assert.equal(service.profile.xp, 0);
  assert.equal(service.profile.presets.length, 3);
  for (const p of service.profile.presets) {
    assert.ok(CATALOG.primary.includes(p.primary));
    assert.ok(CATALOG.grenade.includes(p.grenade));
  }
  assert.equal(service.profile.activePreset, 2); // 越界夹紧
  assert.deepEqual(service.profile.stats, {});
  assert.deepEqual(service.profile.ledger, ['k']); // 非字符串滤除
});
