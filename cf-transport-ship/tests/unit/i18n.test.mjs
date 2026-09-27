// 语言服务（可移植插件核心 + 本游戏目录接入）单元测试（node --test）
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocaleService, normalizeTag, matchLocale, validateCatalogs } from '../../src/i18n/locale-service.js';
import { CATALOGS, createGameLocale } from '../../src/i18n/index.js';
import { createOptsLangAdapter } from '../../src/i18n/adapter-settings.js';
import { LEGACY_KEY, SETTINGS_KEY } from '../../src/settings.js';

const MINI = {
  en: { 'hi.text': 'Hello {name}!', 'only.en': 'EN only' },
  zh: { 'hi.text': '你好，{name}！' },
};

function fakeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    dump: () => Object.fromEntries(m),
  };
}
// 模拟隐私模式等 storage 访问抛 SecurityError 的环境
function throwingStorage() {
  return {
    getItem: () => { throw new DOMException('denied', 'SecurityError'); },
    setItem: () => { throw new DOMException('denied', 'SecurityError'); },
  };
}

// ── 纯工具 ──────────────────────────────────────────────

test('normalizeTag：大小写/空白归一，非法输入返回 null', () => {
  assert.equal(normalizeTag('  ZH-Hans-CN '), 'zh-hans-cn');
  assert.equal(normalizeTag('EN'), 'en');
  assert.equal(normalizeTag(''), null);
  assert.equal(normalizeTag(null), null);
  assert.equal(normalizeTag(42), null);
});

test('matchLocale：精确匹配优先，再回退主子标签', () => {
  const cats = { en: {}, zh: {} };
  assert.equal(matchLocale(cats, 'zh-CN'), 'zh');
  assert.equal(matchLocale(cats, 'en-US'), 'en');
  assert.equal(matchLocale(cats, 'zh-hans-cn'), 'zh');
  assert.equal(matchLocale(cats, 'pt-BR'), null);
  assert.equal(matchLocale(cats, 'garbage!'), null);
  assert.equal(matchLocale(cats, null), null);
});

// ── 语言来源优先级：保存 > 平台 > 浏览器 > 构建默认 ──

test('优先级：保存的选择最高，平台语言其次', () => {
  const s = createLocaleService({ catalogs: MINI, storage: fakeStorage({ lang: 'zh' }), platformLocale: 'en-US', browserLocale: 'en', defaultLocale: 'en' });
  assert.equal(s.getLocale(), 'zh');
  assert.equal(s.isAuto(), false);
});

test('优先级：lang 为空表示自动 → 平台语言生效', () => {
  const s = createLocaleService({ catalogs: MINI, storage: fakeStorage({ lang: '' }), platformLocale: () => 'zh-CN', browserLocale: 'en', defaultLocale: 'en' });
  assert.equal(s.getLocale(), 'zh');
  assert.equal(s.isAuto(), true);
});

test('优先级：无平台语言时用浏览器语言，最终回构建默认', () => {
  const b = createLocaleService({ catalogs: MINI, storage: fakeStorage(), browserLocale: 'zh-CN', defaultLocale: 'en' });
  assert.equal(b.getLocale(), 'zh');
  const d = createLocaleService({ catalogs: MINI, storage: fakeStorage(), defaultLocale: 'en' });
  assert.equal(d.getLocale(), 'en');
  assert.equal(d.isAuto(), true);
});

test('未知/无效语言安全回退：逐级跳过，不落到不存在的目录', () => {
  // 保存的垃圾语言被跳过 → 平台语言生效
  const s = createLocaleService({ catalogs: MINI, storage: fakeStorage({ lang: 'xx-YY' }), platformLocale: 'en', defaultLocale: 'en' });
  assert.equal(s.getLocale(), 'en');
  // 平台语言也未知 → 浏览器
  const b = createLocaleService({ catalogs: MINI, platformLocale: 'fr', browserLocale: 'zh', defaultLocale: 'en' });
  assert.equal(b.getLocale(), 'zh');
  // 全部未知 → 构建默认；默认也不在目录 → 目录首个键
  const d = createLocaleService({ catalogs: MINI, platformLocale: 'fr', browserLocale: 'de', defaultLocale: 'ja' });
  assert.equal(d.getLocale(), 'en'); // MINI 的第一个目录键
});

// ── t()：翻译、插值与缺键诊断 ──────────────────────────

test('t：插值 {name}，缺失参数保留占位符', () => {
  const s = createLocaleService({ catalogs: MINI, defaultLocale: 'en' });
  assert.equal(s.t('hi.text', { name: '无限' }), 'Hello 无限!');
  assert.equal(s.t('hi.text'), 'Hello {name}!');
});

test('t：缺键先回退默认语言，再回退键名并记录诊断', () => {
  const missing = [];
  const s = createLocaleService({ catalogs: MINI, defaultLocale: 'en', onMissing: (k, loc) => missing.push([loc, k]) });
  assert.equal(s.getLocale(), 'en');
  assert.equal(s.t('only.en'), 'EN only');
  s.setLocale('zh');
  // zh 目录没有 only.en → 回退默认语言 en
  assert.equal(s.t('only.en'), 'EN only');
  // 两种语言都没有 → 返回键名
  assert.equal(s.t('nope.key'), 'nope.key');
  assert.deepEqual(s.getMissingKeys().map((m) => m.key), ['nope.key']);
  assert.equal(missing.length, 1);
  assert.equal(missing[0][0], 'zh');
});

// ── 切换、订阅与销毁 ────────────────────────────────────

test('setLocale：即时切换（t 立即生效）并持久化', () => {
  const st = fakeStorage();
  const s = createLocaleService({ catalogs: MINI, storage: st, defaultLocale: 'en' });
  assert.equal(s.t('hi.text', { name: 'X' }), 'Hello X!');
  s.setLocale('zh');
  assert.equal(s.t('hi.text', { name: 'X' }), '你好，X！');
  assert.equal(st.dump().lang, 'zh'); // 原样持久化（不要求 JSON 编码）
});

test('subscribe：切换时收到新 locale；退订后不再收到', () => {
  const s = createLocaleService({ catalogs: MINI, defaultLocale: 'en' });
  const seen = [];
  const off = s.subscribe((loc) => seen.push(loc));
  s.setLocale('zh');
  off();
  s.setLocale('en');
  assert.deepEqual(seen, ['zh']);
});

test('setLocale("")：回到自动并按优先级重新解析；未知语言被拒绝', () => {
  const st = fakeStorage();
  const s = createLocaleService({ catalogs: MINI, storage: st, platformLocale: 'zh-CN', defaultLocale: 'en' });
  s.setLocale('en');
  assert.equal(s.getLocale(), 'en');
  s.setLocale('');
  assert.equal(s.getLocale(), 'zh'); // 自动 → 平台语言
  assert.equal(s.isAuto(), true);
  // 未知语言：不改变状态、不持久化
  assert.equal(s.setLocale('fr'), false);
  assert.equal(s.getLocale(), 'zh');
  assert.equal(st.dump().lang, '');
});

test('destroy：清空订阅，销毁后 setLocale/subscribe 不再生效', () => {
  const s = createLocaleService({ catalogs: MINI, defaultLocale: 'en' });
  const seen = [];
  s.subscribe((loc) => seen.push(loc));
  s.destroy();
  s.setLocale('zh');
  assert.deepEqual(seen, []); // 销毁前订阅的监听器被清空，切换不再通知
  assert.equal(s.subscribe(() => {}), null); // 销毁后订阅被拒绝
  assert.equal(s.t('hi.text', { name: 'Y' }), 'Hello Y!'); // 只读查询仍可用
});

test('storage 抛错：初始化/读取/保存均不异常，游戏可继续', () => {
  const s = createLocaleService({ catalogs: MINI, storage: throwingStorage(), platformLocale: 'zh', defaultLocale: 'en' });
  assert.equal(s.getLocale(), 'zh');
  assert.equal(s.getSavedLocale(), null);
  assert.doesNotThrow(() => s.setLocale('en'));
  assert.equal(s.t('hi.text', { name: 'Z' }), 'Hello Z!'); // 切换会话内即时生效，只是无法持久化
  assert.equal(s.getSavedLocale(), 'en'); // 会话内选择仍被记住（下次启动退回自动）
});

// ── 本游戏目录与接入层 ─────────────────────────────────

test('游戏目录 zh/en 键完全一致且值非空', () => {
  assert.deepEqual(validateCatalogs(CATALOGS), []);
  for (const loc of ['zh', 'en']) {
    assert.ok(CATALOGS[loc], `缺少 ${loc} 目录`);
    const keys = Object.keys(CATALOGS[loc]);
    assert.ok(keys.length >= 80, `目录覆盖过少：${loc} 仅 ${keys.length} 键`);
    for (const k of keys) assert.ok(typeof CATALOGS[loc][k] === 'string' && CATALOGS[loc][k].length > 0, `${loc}.${k} 为空`);
  }
});

test('游戏目录覆盖十大领域的稳定键（不改动既有持久 ID）', () => {
  const zh = CATALOGS.zh;
  const samples = [
    'menu.start', 'menu.pause', // 菜单
    'hud.reload', 'hud.dead', // HUD
    'settings.language', 'settings.languageAuto', // 设置（画质/灵敏度等滑杆文案共用 menu.* 键）
    'report.victory', 'report.myScore', // 战报
    'callout.kill', 'callout.killedBy', // 报点
    'mode.tdm.name', 'mode.bomb.name', 'mode.practice.name', // 模式
    'weapon.ak47.name', 'weapon.deagle.name', // 武器
    'rank.private.name', 'rank.colonel.name', // 军衔
    'equip.preset', // 装备
    'error.storageUnavailable', // 错误
  ];
  for (const k of samples) {
    assert.ok(k in zh, `zh 缺键 ${k}`);
    assert.ok(k in CATALOGS.en, `en 缺键 ${k}`);
  }
  assert.equal(zh['weapon.deagle.name'], '沙漠之鹰');
  assert.equal(CATALOGS.en['mode.bomb.name'], 'Bomb Defuse');
  assert.equal(zh['rank.colonel.name'], '上校');
});

test('createGameLocale：离线默认中文，平台构建传英文默认', () => {
  // 显式置空浏览器语言：Node ≥21 也有 navigator.language，会干扰纯「构建默认」路径
  const off = createGameLocale({ storage: fakeStorage(), browserLocale: null });
  assert.equal(off.getLocale(), 'zh');
  assert.equal(off.t('mode.tdm.name'), '团队竞技');
  const plat = createGameLocale({ storage: fakeStorage(), defaultLocale: 'en', browserLocale: null });
  assert.equal(plat.getLocale(), 'en');
  assert.equal(plat.t('mode.tdm.name'), 'Team Deathmatch');
  // 平台语言（Y8 locale）优先于构建默认
  const y8 = createGameLocale({ storage: fakeStorage(), platformLocale: 'en-US', defaultLocale: 'zh', browserLocale: null });
  assert.equal(y8.getLocale(), 'en');
});

test('设置适配层：lang 读写走 cf_opts_v2，旧记录（v1/v2 无 lang 字段）兼容', () => {
  // 旧 v1 记录迁移后也有 lang 字段（默认 '' = 自动）
  const legacy = fakeStorage({ [LEGACY_KEY]: JSON.stringify({ sens: 1.7 }) });
  const a1 = createOptsLangAdapter({ storage: legacy });
  assert.equal(a1.getItem('lang'), '');
  // v2 记录读写
  const st = fakeStorage({ [SETTINGS_KEY]: JSON.stringify({ v: 2, primary: 'awm', map: 'transport-ship' }) });
  const a2 = createOptsLangAdapter({ storage: st });
  assert.equal(a2.getItem('lang'), '');
  a2.setItem('lang', 'en');
  const saved = JSON.parse(st.dump()[SETTINGS_KEY]);
  assert.equal(saved.lang, 'en');
  assert.equal(saved.primary, 'awm'); // 其余字段不被语言选择破坏
  assert.equal(a2.getItem('lang'), 'en');
});

test('createGameLocale + 设置适配层：端到端保存/恢复玩家语言选择', () => {
  const st = fakeStorage();
  const s = createGameLocale({ storage: createOptsLangAdapter({ storage: st }) });
  s.setLocale('en');
  const again = createGameLocale({ storage: createOptsLangAdapter({ storage: st }), platformLocale: 'zh' });
  assert.equal(again.getLocale(), 'en'); // 保存的选择 > 平台语言
  assert.equal(again.t('menu.start'), 'START GAME');
});
