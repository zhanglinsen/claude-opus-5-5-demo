// HUD 本地化单元测试（Task 9 / US-02，node --test）
// 契约：
//  - matchHeader / objectiveHud / awardLine 接受可选翻译函数 t（LocaleService.t 形状），
//    缺省保持中文目录输出（既有 hud-mode / hud-award / bomb-input 测试锁定的行为不变）；
//  - HUD 新增的玩家可见文案键在 zh/en 两语言成对且非空（validateCatalogs 全量体检）；
//  - 军衔名按中文档位名反查稳定键翻译（adapter 只提供中文 rankName，不引入新存档字段）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGS, createLocaleService, validateCatalogs } from '../../src/i18n/index.js';
import { matchHeader, objectiveHud, awardLine } from '../../src/hud.js';

// 英文翻译函数：走真实 LocaleService（浏览器语言 en 解析），与 HUD 运行时同一 t 形状
const svc = createLocaleService({ catalogs: CATALOGS, storage: null, browserLocale: 'en-US', defaultLocale: 'zh' });
const enT = (k, p) => svc.t(k, p);
const zhT = (k, p) => CATALOGS.zh[k] !== undefined ? CATALOGS.zh[k].replace(/\{(\w+)\}/g, (m, n) => (p && p[n] != null ? String(p[n]) : m)) : k;

// ---------- 目录：HUD 新增键两语言成对 ----------

test('目录：HUD/菜单新增文案键 zh/en 成对且非空，全量体检通过', () => {
  const keys = [
    'menu.docTitle', 'menu.key.space', 'menu.key.lmb', 'menu.key.rmb', 'menu.key.wheel',
    'menu.linkGithub', 'menu.linkX', 'menu.loadoutSub',
    'menu.card.ak47', 'menu.card.m4a1', 'menu.card.awm', 'menu.card.mp5',
    'hud.slotPrimary', 'hud.slotPistol', 'hud.slotMelee', 'hud.slotThrow',
    'hud.prGrenades', 'hud.c4Item', 'hud.spectating', 'hud.spectatingName',
    'report.mvp', 'touch.fire', 'touch.jump', 'touch.crouch', 'touch.swap', 'touch.scope',
  ];
  for (const k of keys) {
    assert.ok(typeof CATALOGS.zh[k] === 'string' && CATALOGS.zh[k].length, `zh 缺键 ${k}`);
    assert.ok(typeof CATALOGS.en[k] === 'string' && CATALOGS.en[k].length, `en 缺键 ${k}`);
  }
  assert.deepEqual(validateCatalogs(CATALOGS), []);
});

// ---------- matchHeader：模式名经稳定键翻译，参数化目标文案 ----------

test('matchHeader：缺省中文输出不变（回归）', () => {
  assert.deepEqual(matchHeader({ modeName: '团队竞技', timeLeft: 540, goal: 50, objective: null }),
    { clock: '9:00', goal: '团队竞技 · 目标 50' });
  assert.deepEqual(matchHeader({ modeName: '爆破模式', timeLeft: Infinity, goal: 50,
    objective: { timeLeft: 145, winsNeeded: 7 } }),
  { clock: '2:25', goal: '爆破模式 · 先赢 7 局' });
});

test('matchHeader：传入英文 t → 模式名与目标文案即时切英文', () => {
  assert.equal(matchHeader({ modeName: '团队竞技', timeLeft: 540, goal: 50, objective: null }, enT).goal,
    'Team Deathmatch · Target 50');
  assert.equal(matchHeader({ modeName: '爆破模式', timeLeft: Infinity, goal: 50,
    objective: { timeLeft: 145, winsNeeded: 7 } }, enT).goal,
  'Bomb Defuse · First to win 7');
  // 未知模式名安全回落原样（不产生键名外泄）
  assert.equal(matchHeader({ modeName: 'X', timeLeft: 60, goal: 10, objective: null }, enT).goal, 'X · Target 10');
});

// ---------- objectiveHud：ctx.t 翻译爆破 HUD ----------

const view = (over = {}) => ({
  phase: 'live', round: 3, timeLeft: 100,
  bomb: { carrierId: 7 },
  plantable: false, defusable: false, pickupable: false,
  plantProgress: 0, defuseProgress: 0,
  alive: { BL: 5, GR: 5 }, score: { BL: 2, GR: 1 },
  ...over,
});

test('objectiveHud：缺省中文输出不变（回归）', () => {
  const o = objectiveHud(view({ phase: 'prep', timeLeft: 3 }), { myId: 7, myTeam: 'BL' });
  assert.match(o.round, /第 3 回合/);
  assert.match(o.hint, /准备期/);
  const prog = objectiveHud(view({ plantable: true, plantProgress: 2.5 }), { myId: 7, myTeam: 'BL' });
  assert.equal(prog.progress.label, '正在安放');
});

test('objectiveHud：ctx.t 传入英文 t → 回合/安放/拆除/掉落文案切英文', () => {
  const prep = objectiveHud(view({ phase: 'prep', timeLeft: 3 }), { myId: 7, myTeam: 'BL', t: enT });
  assert.equal(prep.round, 'Round 3');
  assert.match(prep.hint, /Prep phase/);
  const planted = objectiveHud(view({ phase: 'planted', bomb: { planted: true, site: 'B' }, defusable: true, timeLeft: 31 }),
    { myId: 9, myTeam: 'GR', t: enT });
  assert.match(planted.c4, /Site B/);
  assert.match(planted.hint, /Hold E/);
  const defusing = objectiveHud(view({ phase: 'planted', bomb: { planted: true, site: 'B' }, defuseProgress: 3.5 }),
    { myId: 9, myTeam: 'GR', t: enT });
  assert.equal(defusing.progress.label, 'DEFUSING');
  const dropped = objectiveHud(view({ bomb: { dropped: true, pos: null }, pickupable: true }), { myId: 7, myTeam: 'BL', t: enT });
  assert.match(dropped.c4, /DROPPED/);
  assert.match(dropped.hint, /pick up the C4/);
  const end = objectiveHud(view({ phase: 'roundEnd', bomb: null, roundWinner: 'GR' }), { myId: 7, myTeam: 'BL', t: enT });
  assert.equal(end.hint, 'Global Risk takes the round');
});

// ---------- awardLine：军衔名反查稳定键翻译 ----------

test('awardLine：缺省中文输出不变（回归）', () => {
  const s = awardLine({ awarded: true, xp: 120, rankUp: false, rank: { rankName: '列兵', level: 2, xp: 120, nextThreshold: 300, progress: 0.4 } });
  assert.ok(s.includes('+120'), `line=${s}`);
  assert.ok(s.includes('列兵'), `line=${s}`);
  const up = awardLine({ awarded: true, xp: 80, rankUp: true, rank: { rankName: '列兵', level: 2, xp: 80, nextThreshold: 300, progress: 0.4 } });
  assert.ok(up.includes('晋升'), `line=${up}`);
});

test('awardLine：传入英文 t → 军衔名按稳定键翻成英文，晋升标识切换', () => {
  const s = awardLine({ awarded: true, xp: 120, rankUp: false, rank: { rankName: '列兵', level: 2, xp: 120, nextThreshold: 300, progress: 0.4 } }, enT);
  assert.ok(s.includes('Private'), `line=${s}`);
  assert.ok(s.includes('Lv.2'), `line=${s}`);
  const up = awardLine({ awarded: true, xp: 80, rankUp: true, rank: { rankName: '列兵', level: 2, xp: 80, nextThreshold: 300, progress: 0.4 } }, enT);
  assert.ok(up.includes('RANK UP!'), `line=${up}`);
  // 满级行（rankMax）与 MVP 键参数化输出
  assert.equal(enT('hud.rankMax', { xp: 9999 }).includes('MAX'), true);
  assert.ok(enT('report.mvp', { name: 'A', k: 3, hs: 1 }).includes('MVP: A (3 kills / 1 headshots)'));
});

test('awardLine：英文下未知军衔名回落原样（不外泄键名）', () => {
  const s = awardLine({ awarded: true, xp: 10, rankUp: false, rank: { rankName: '神秘军衔', level: null, xp: 10, nextThreshold: 300, progress: 0 } }, enT);
  assert.ok(s.includes('神秘军衔'), `line=${s}`);
  assert.ok(!s.includes('rank.'), `line=${s}`);
});
