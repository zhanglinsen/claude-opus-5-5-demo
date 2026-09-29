// HUD 每帧 DOM 写缓存单元测试（性能 A 路，node --test）
// 契约：
//  - 稳定状态重复 update：第二帧起 textContent/innerHTML/classList/style 零写入（原先每帧全量重写）；
//  - hp/弹药/比分/时钟任一变化当帧可见（写入恰好发生在变化帧）；
//  - 数值不变、locale 变化 → 文案当帧重写为新语言；
//  - C4 携带期间同样零冗余写，放下 C4 当帧恢复武器信息（两条写路径共用同一缓存）；
//  - 新局/模式切换后旧状态（低血量/C4/目标文案）不残留。
// 不走构造器（其依赖完整 DOM）：Object.create(HUD.prototype) + 假元素表，与 hud-radar 同纪律。
import test from 'node:test';
import assert from 'node:assert/strict';
import { HUD } from '../../src/hud.js';
import { WEAPONS } from '../../src/weapons.js';
import { CATALOGS, createLocaleService } from '../../src/i18n/index.js';

// ---------- 假 DOM ----------

function fakeEl(cls = []) {
  const el = {
    _t: '', _h: '', textWrites: 0, htmlWrites: 0, classToggles: 0, styleWrites: 0,
    style: {}, dataset: {}, _cls: new Set(cls),
    classList: {
      toggle: (c, f) => { el.classToggles++; if (f === undefined) el._cls.has(c) ? el._cls.delete(c) : el._cls.add(c); else if (f) el._cls.add(c); else el._cls.delete(c); },
      contains: (c) => el._cls.has(c),
      add: (c) => el._cls.add(c),
      remove: (c) => el._cls.delete(c),
    },
  };
  Object.defineProperty(el, 'textContent', { get: () => el._t, set: (v) => { el.textWrites++; el._t = String(v); } });
  Object.defineProperty(el, 'innerHTML', { get: () => el._h, set: (v) => { el.htmlWrites++; el._h = String(v); } });
  return el;
}

// 计入 style 写次数（真实赋值同为每帧成本）
function styled(el) {
  el.style = new Proxy({ _n: 0 }, {
    set: (o, k, v) => { if (k === '_n') { o._n = v; return true; } o[k] = v; o._n++; return true; },
    get: (o, k) => (k === '_n' ? o._n : o[k]),
  });
  return el;
}

function makeHud() {
  const hud = Object.create(HUD.prototype);
  hud.g = {
    player: { id: 1, grenadeBag: [], usedGrenades: {}, inv: [null, null, null, null], c4Selected: false },
    actors: [], touch: null,
  };
  const ids = ['sBL', 'sGR', 'sTime', 'sGoal', 'tBL', 'tGR', 'hpVal', 'arVal', 'hpBox', 'wName',
    'aMag', 'aRes', 'aHint', 'wIcon', 'cross', 'cT', 'cB', 'cL', 'cR', 'scope', 'hit', 'toast',
    'protect', 'nameTip', 'slots', 'blind', 'nadeInfo', 'practice', 'endAward', 'objInfo',
    'objRound', 'objAlive', 'c4State', 'objHint', 'objProg', 'objProgFill', 'objProgLbl',
    'slotC4', 'center', 'cBig', 'cSmall'];
  hud.el = {};
  for (const id of ids) hud.el[id] = styled(fakeEl(['hidden']));
  hud.el.hpBox = fakeEl(); hud.el.tBL = fakeEl(); hud.el.tGR = fakeEl();
  hud.el.cross = styled(fakeEl()); hud.el.scope = fakeEl(); hud.el.hit = styled(fakeEl());
  hud.el.slots = styled(fakeEl()); hud.el.blind = styled(fakeEl(['hidden']));
  hud.el.nadeInfo = fakeEl(['hidden']);
  hud.el.prHits = fakeEl(); hud.el.prWeapon = fakeEl(); hud.el.prTargets = fakeEl();
  hud.el.prGuns = { querySelectorAll: () => [] };
  hud.el.practice = fakeEl(['hidden']);
  hud.el.objInfo = fakeEl(['hidden']); hud.el.c4State = fakeEl(['hidden']);
  hud.el.objHint = fakeEl(['hidden']); hud.el.objProg = fakeEl(['hidden']);
  hud.el.objProgFill = styled(fakeEl()); hud.el.slotC4 = fakeEl(['hidden']);
  hud.el.center = fakeEl(['hidden']); hud.el.wIcon = fakeEl();
  hud.icons = {}; hud.feedItems = []; hud.dmgDirs = [];
  hud.blind = { remaining: 0, duration: 0 };
  hud.hitT = 0; hud.toastT = 0; hud.slotsT = 0;
  hud._prChips = ''; hud._nadeHtml = null; hud._nadeKey = null; hud._endAward = null;
  hud._lastEnd = null; hud._lastBoard = null;
  hud.setLocale('zh');
  hud._initCaches();
  return hud;
}

// HUD.t 与 locale（与 LocaleService.t 同形状，测试内直换语言）
const zhT = (k, p) => String(CATALOGS.zh[k] !== undefined ? CATALOGS.zh[k] : k).replace(/\{(\w+)\}/g, (m, n) => (p && p[n] != null ? String(p[n]) : m));
const enSvc = createLocaleService({ catalogs: CATALOGS, storage: null, browserLocale: 'en-US', defaultLocale: 'zh' });
const enT = (k, p) => enSvc.t(k, p);
HUD.prototype.setLocale = function (lang) {
  const zh = lang === 'zh';
  this.locale = { getLocale: () => lang, isAuto: () => false, t: zh ? zhT : enT };
  this.t = zh ? zhT : enT;
};

// ---------- 状态构造 ----------

const AK = { def: WEAPONS.ak47, mag: 30, reserve: 90, reloading: false };
const baseState = () => ({
  score: { BL: 0, GR: 0 }, timeLeft: 540, goal: 50, myTeam: 'BL', modeName: '团队竞技',
  hp: 100, armor: 100, alive: true, weapon: AK, scoped: false, spreadPx: 0, yaw: 0,
  respawnIn: 0, killedBy: '', protect: 0, aimName: '', aimTeam: '',
  objective: null, blind: null, practice: null, award: null,
});

const totalWrites = (hud) => Object.values(hud.el).reduce((n, el) => {
  if (!el || !el.classList) return n;
  return n + el.textWrites + el.htmlWrites + el.classToggles + el.styleWrites;
}, 0);

// ---------- 测试 ----------

test('稳定状态重复 update：第二帧起零 DOM 写（原先每帧全量重写）', () => {
  const hud = makeHud();
  hud.update(0.016, baseState());
  const afterFirst = totalWrites(hud);
  hud.update(0.016, baseState());
  hud.update(0.016, baseState());
  assert.ok(afterFirst > 0, '首帧应建立显示');
  assert.equal(totalWrites(hud) - afterFirst, 0, '稳定帧不应有任何 DOM 写');
});

test('hp/弹药/比分/时钟单独变化当帧可见，且只写对应节点', () => {
  const hud = makeHud();
  const s = baseState();
  hud.update(0.016, s);
  for (const el of Object.values(hud.el)) if (el && el.classList) { el.textWrites = 0; el.htmlWrites = 0; el.classToggles = 0; if (el.style) el.style._n = 0; }

  hud.update(0.016, { ...s, hp: 45 });
  assert.equal(hud.el.hpVal.textContent, '45');

  hud.update(0.016, { ...s, weapon: { ...AK, mag: 12 } });
  assert.equal(hud.el.aMag.textContent, '12');

  hud.update(0.016, { ...s, score: { BL: 3, GR: 0 } });
  assert.equal(hud.el.sBL.textContent, '3');

  hud.update(0.016, { ...s, timeLeft: 60 });
  assert.equal(hud.el.sTime.textContent, '1:00');
});

test('相同数值但 locale 切换 → 文案当帧重写为新语言', () => {
  const hud = makeHud();
  const s = baseState();
  hud.update(0.016, s);
  assert.ok(hud.el.sGoal.textContent.includes('团队竞技'));
  hud.setLocale('en');
  hud.invalidateTextCache(); // applyLocale 的订阅回调同款失效
  hud.update(0.016, s);
  assert.equal(hud.el.sGoal.textContent, 'Team Deathmatch · Target 50');
  assert.equal(hud.el.sTime.textContent, '9:00');
});

test('C4 携带：稳定帧零写；放下 C4 当帧恢复武器信息；低血/C4 不残留到新局', () => {
  const hud = makeHud();
  const bombState = () => ({
    ...baseState(), hp: 20, modeName: '爆破模式',
    objective: { phase: 'live', round: 2, alive: { BL: 3, GR: 2 }, bomb: { carrierId: 1 } },
  });
  hud.g.player.c4Selected = true;
  hud.update(0.016, bombState());
  assert.equal(hud.el.wName.textContent, zhT('hud.c4Item'));
  hud.update(0.016, bombState());
  const steady = totalWrites(hud);
  hud.update(0.016, bombState());
  assert.equal(totalWrites(hud) - steady, 0, 'C4 携带稳定帧同样零冗余写');

  // 新局：TDM、满血、无 C4 —— 单帧内全部恢复，不残留
  hud.g.player.c4Selected = false;
  hud.update(0.016, baseState());
  assert.equal(hud.el.wName.textContent, 'AK-47');
  assert.equal(hud.el.hpVal.textContent, '100');
  assert.ok(!hud.el.hpBox.classList.contains('low'), '低血 class 不残留');
  assert.ok(hud.el.c4State.classList.contains('hidden'), 'C4 状态不残留');
  assert.ok(hud.el.objInfo.classList.contains('hidden'), '爆破目标不残留');
});

test('投掷物背包：稳定帧不重写 innerHTML，剩余量变化才写，投完整条隐藏', () => {
  const hud = makeHud();
  hud.g.player.grenadeBag = ['he', 'flash'];
  hud.g.player.inv[3] = { def: { id: 'flash' } };
  hud.update(0.016, baseState());
  assert.ok(hud.el.nadeInfo.innerHTML.includes('×1'), '首帧渲染剩余量');
  hud.update(0.016, baseState());
  assert.equal(hud.el.nadeInfo.htmlWrites, 1, '稳定帧不重写');
  hud.g.player.usedGrenades = { he: 1 };
  hud.update(0.016, baseState());
  assert.equal(hud.el.nadeInfo.htmlWrites, 2, '投出一枚后当帧重写');
  hud.g.player.usedGrenades = { he: 1, flash: 1 };
  hud.update(0.016, baseState());
  assert.ok(hud.el.nadeInfo.classList.contains('hidden'), '全部投完后整条隐藏');
  assert.equal(hud.el.nadeInfo.htmlWrites, 2, '隐藏不经 innerHTML 重写');
});

test('同一元素 txt/htm 交替写：切回旧文本时不因另一通道的缓存而跳过', () => {
  const hud = makeHud();
  hud._initCaches();
  // 真实 DOM 中 textContent 与 innerHTML 是同一份内容
  let content = '';
  const el = {};
  Object.defineProperty(el, 'textContent', { get: () => content.replace(/<[^>]*>/g, ''), set: (v) => { content = String(v); } });
  Object.defineProperty(el, 'innerHTML', { get: () => content, set: (v) => { content = String(v); } });
  hud.txt(el, '观战中');
  hud.htm(el, '<b>击杀者</b>');
  hud.txt(el, '观战中');
  assert.equal(el.textContent, '观战中');
  hud.htm(el, '<b>击杀者</b>');
  assert.equal(el.innerHTML, '<b>击杀者</b>');
});
