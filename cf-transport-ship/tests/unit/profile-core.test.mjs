// 档案核心单元测试（node --test）：只测公开行为，storage 注入
import test from 'node:test';
import assert from 'node:assert/strict';
import { createProfileService } from '../../src/profile/service.js';
import { CATALOG } from '../../src/profile/equipment.js';
import { PROFILE_KEY } from '../../src/profile/repository.js';
import { resultXp } from '../../src/profile/rank.js';

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

test('新档案：三套预设齐全，默认激活第 0 套，旧武器偏好迁移进第 0 套', () => {
  const svc = createProfileService({ storage: memoryStorage(), legacyPrimary: 'awm' });
  const p = svc.profile;
  assert.equal(p.presets.length, 3);
  assert.equal(p.activePreset, 0);
  for (const preset of p.presets) {
    assert.ok(CATALOG.primary.includes(preset.primary), 'primary 来自真实武器库');
    assert.ok(CATALOG.sidearm.includes(preset.sidearm));
    assert.ok(CATALOG.melee.includes(preset.melee));
    assert.ok(CATALOG.grenade.includes(preset.grenade));
    assert.ok(CATALOG.armor.includes(preset.armor));
  }
  assert.equal(p.presets[0].primary, 'awm');   // 迁移旧的 primary 偏好
  assert.equal(p.presets[1].primary, 'ak47');  // 其余槽位用默认
});

test('全新玩家（无旧偏好）：第 0 套用默认主武器 ak47', () => {
  const svc = createProfileService({ storage: memoryStorage() });
  assert.equal(svc.profile.presets[0].primary, 'ak47');
});

test('切换激活预设并修改槽位：非法值归一化，不影响其他预设', () => {
  const svc = createProfileService({ storage: memoryStorage() });
  assert.equal(svc.switchPreset(2), 2);
  assert.equal(svc.profile.activePreset, 2);
  // 非法槽位值回默认，越界索引被夹紧
  svc.setPresetSlot(2, { primary: '刀', grenade: 'he' });
  assert.equal(svc.profile.presets[2].primary, 'ak47');
  assert.equal(svc.profile.presets[2].grenade, 'he');
  assert.equal(svc.switchPreset(9), 2);
  assert.equal(svc.profile.presets[0].primary, 'ak47'); // 别的预设未被波及
});

test('保存/重载往返：同一 storage 的新服务实例恢复预设与激活索引', () => {
  const storage = memoryStorage();
  const svc = createProfileService({ storage });
  svc.switchPreset(1);
  svc.setPresetSlot(1, { primary: 'mp5' });
  const reloaded = createProfileService({ storage });
  assert.equal(reloaded.profile.activePreset, 1);
  assert.equal(reloaded.profile.presets[1].primary, 'mp5');
});

test('损坏档案恢复：坏 JSON 回到全新档案而非崩溃，且可重新持久化', () => {
  const storage = memoryStorage();
  storage.setItem(PROFILE_KEY, '{oops');
  const svc = createProfileService({ storage });
  assert.equal(svc.profile.xp, 0);
  assert.equal(svc.profile.presets.length, 3);
  assert.equal(svc.persistence, 'persisted');
});

test('存储失败退化：写入抛错时保留内存档案并暴露 memory 状态', () => {
  const failing = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
  const svc = createProfileService({ storage: failing });
  svc.switchPreset(1);
  assert.equal(svc.persistence, 'memory');
  assert.equal(svc.profile.activePreset, 1); // 内存档案仍可用
});

test('未注入 storage：persistence 如实报告 memory，不谎报已落盘', () => {
  assert.equal(createProfileService().persistence, 'memory');
  assert.equal(createProfileService({}).persistence, 'memory');
  assert.equal(createProfileService({ storage: null }).persistence, 'memory');
});

test('持久化状态可恢复：写失败降级 memory 后，后续写成功回到 persisted 且数据确实落盘', () => {
  let failing = true;
  const m = new Map();
  const storage = {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      if (failing) throw new Error('quota');
      m.set(k, String(v));
    },
    removeItem: (k) => { m.delete(k); },
  };
  const svc = createProfileService({ storage });
  svc.switchPreset(1);
  assert.equal(svc.persistence, 'memory'); // 瞬时写失败 → memory

  failing = false;
  svc.switchPreset(2);
  assert.equal(svc.persistence, 'persisted'); // 后续写成功 → 反映真实状态
  const reloaded = createProfileService({ storage });
  assert.equal(reloaded.profile.activePreset, 2); // 不是空话：数据确实写入成功
});

test('竞技结果 XP：同一结果键只发一次（重试/重载都不重复），练习场不发', () => {
  const storage = memoryStorage();
  const svc = createProfileService({ storage });
  const ev = { key: 'tdm:m1', mode: 'tdm', outcome: 'win', kills: 5, objectives: 0 };
  const first = svc.applyResult(ev);
  assert.equal(first.awarded, true);
  assert.equal(first.xp, resultXp(ev));
  assert.equal(svc.profile.stats.tdm.matches, 1); // 模式统计只记竞技结果
  assert.equal(svc.profile.stats.tdm.wins, 1);

  assert.equal(svc.applyResult(ev).awarded, false); // 同键重试不重复
  const reloaded = createProfileService({ storage });
  assert.equal(reloaded.applyResult(ev).awarded, false); // 重载后同键仍不重复（账本已持久化）

  const pr = reloaded.applyResult({ key: 'practice:p1', mode: 'practice', outcome: 'win', kills: 99, objectives: 9 });
  assert.equal(pr.awarded, false);
  assert.equal(pr.xp, 0);
  assert.equal(reloaded.profile.stats.practice, undefined);
});

test('缺失/未知/空串 mode：一律不发 XP、不记统计、不加账本', () => {
  const svc = createProfileService({ storage: memoryStorage() });
  const xpBefore = svc.profile.xp;
  const ledgerBefore = svc.profile.ledger.length;

  const missing = svc.applyResult({ key: 'ghost:m1', outcome: 'win', kills: 3, objectives: 1 });
  assert.equal(missing.awarded, false);
  assert.equal(missing.xp, 0);
  const unknown = svc.applyResult({ key: 'ctf:m1', mode: 'ctf', outcome: 'win', kills: 3, objectives: 1 });
  assert.equal(unknown.awarded, false);
  assert.equal(unknown.xp, 0);
  assert.equal(svc.applyResult({ key: 'tdm:m0', mode: '', outcome: 'win' }).awarded, false);

  assert.equal(svc.profile.xp, xpBefore);                      // 没有加 XP
  assert.equal(svc.profile.stats['undefined'], undefined);     // 没有制造 undefined 桶
  assert.equal(svc.profile.stats.ctf, undefined);              // 没有制造未知模式桶
  assert.equal(svc.profile.ledger.length, ledgerBefore);       // 没有占用结果键
});

test('profile 快照只读：外部篡改不改服务内存，重载与磁盘不分叉', () => {
  const storage = memoryStorage();
  const svc = createProfileService({ storage });
  const ev = { key: 'tdm:s1', mode: 'tdm', outcome: 'win', kills: 2, objectives: 0 };
  svc.applyResult(ev);
  const snap = svc.profile;

  // 外部绕过 service 直接改快照（只读实现下会抛 TypeError，两种实现都不应改变服务状态）
  try { snap.xp = 99999; } catch {}
  try { snap.stats.tdm.matches = 42; } catch {}
  try { snap.ledger.push('tdm:fake'); } catch {}
  try { snap.presets[0].primary = 'awm'; } catch {}

  // 服务内存状态不变
  assert.equal(svc.profile.xp, resultXp(ev));
  assert.equal(svc.profile.stats.tdm.matches, 1);
  assert.equal(svc.profile.ledger.includes('tdm:fake'), false);
  assert.equal(svc.profile.presets[0].primary, 'ak47');
  // 去重仍由 service 掌管，同键不重复发
  assert.equal(svc.applyResult(ev).awarded, false);
  // 内存与磁盘不分叉：重载后的档案与篡改无关
  const reloaded = createProfileService({ storage });
  assert.equal(reloaded.profile.xp, resultXp(ev));
  assert.equal(reloaded.profile.ledger.includes('tdm:fake'), false);
  assert.equal(reloaded.profile.presets[0].primary, 'ak47');
});

test('军衔跨越：击杀按上限夹紧，XP 越过阈值晋级且进度重新从零计', () => {
  const svc = createProfileService({ storage: memoryStorage() });
  assert.equal(svc.rank.name, '列兵');
  // 单场 kills=30 超上限被夹紧：20*10 + 胜 100 = 300，恰好跨过「下士」300 阈值
  const r = svc.applyResult({ key: 'tdm:m2', mode: 'tdm', outcome: 'win', kills: 30, objectives: 0 });
  assert.equal(r.xp, 300);
  assert.equal(r.rankUp, true);
  assert.equal(svc.rank.name, '下士');
  assert.equal(svc.rank.index, 1);
  assert.ok(svc.rank.progress >= 0 && svc.rank.progress < 1);
});
