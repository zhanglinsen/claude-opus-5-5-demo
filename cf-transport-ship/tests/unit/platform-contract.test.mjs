// 平台合同单元测试（node --test）：US-03 PlatformAdapter 最小接口、语言回退、
// 自然断点校验、事件总线与离线适配器（无 window 的 Node 环境构造）。
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AD_BREAKS, AD_STATUS, PLATFORM_EVENTS,
  normalizeLanguage, isAdBreak, createEmitter, validateAdapter,
  createBreakPolicy, createLanguagePolicy,
} from '../../src/platform/contract.js';
import { OfflinePlatformAdapter } from '../../src/platform/offline.js';
import { makeControls } from './helpers/ad-controls.js';

test('normalizeLanguage：平台语言归一化与安全回退', () => {
  assert.equal(normalizeLanguage('zh-CN'), 'zh-cn');
  assert.equal(normalizeLanguage('EN_us'), 'en');
  assert.equal(normalizeLanguage('zh'), 'zh-cn');
  assert.equal(normalizeLanguage('fr-FR'), 'en');           // 未支持 → 默认回退
  assert.equal(normalizeLanguage('fr-FR', 'zh-cn'), 'zh-cn'); // 未支持 → 指定回退
  assert.equal(normalizeLanguage(''), 'en');
  assert.equal(normalizeLanguage(null), 'en');
  assert.equal(normalizeLanguage(42), 'en');
  assert.equal(normalizeLanguage('not a lang!'), 'en');
});

test('isAdBreak：仅整场结束与返回菜单是合法自然断点', () => {
  assert.equal(isAdBreak(AD_BREAKS.MATCH_END), true);
  assert.equal(isAdBreak(AD_BREAKS.MENU_RETURN), true);
  assert.equal(isAdBreak('combat'), false);
  assert.equal(isAdBreak('page-load'), false);
  assert.equal(isAdBreak(undefined), false);
  assert.equal(isAdBreak(42), false);
});

test('createEmitter：订阅、退订与处理器异常隔离', () => {
  const bus = createEmitter();
  const seen = [];
  const boom = () => { throw new Error('handler bug'); };
  const ha = (p) => seen.push(['a', p]);
  const hb = (p) => seen.push(['b', p]);
  bus.on('ev', ha);
  bus.on('ev', boom);         // 抛异常的处理器不得阻断其他处理器
  bus.on('ev', hb);
  bus.emit('ev', { n: 1 });
  assert.deepEqual(seen, [['a', { n: 1 }], ['b', { n: 1 }]]);
  bus.off('ev', boom);
  seen.length = 0;
  bus.emit('ev', { n: 2 });
  assert.deepEqual(seen, [['a', { n: 2 }], ['b', { n: 2 }]]);
  bus.off('ev', ha);
  bus.off('ev', hb);
  seen.length = 0;
  bus.emit('ev', { n: 3 });
  assert.deepEqual(seen, []); // 无订阅者时安全空转
});

test('validateAdapter：离线适配器满足合同，空对象列出缺失项', () => {
  const offline = new OfflinePlatformAdapter();
  assert.equal(validateAdapter(offline).ok, true);
  const bad = validateAdapter({});
  assert.equal(bad.ok, false);
  assert.ok(bad.missing.includes('id') && bad.missing.includes('init'));
});

test('F7 validateAdapter：缺 off 的适配器不合合同（退订入口必须存在）', () => {
  const bad = validateAdapter({
    id: 'x', language: 'en', init() {}, requestAd() {}, on() {},
  });
  assert.equal(bad.ok, false);
  assert.ok(bad.missing.includes('off'));
});

test('F1 断点策略：默认两点不变，其他游戏可注入自己的自然断点集', () => {
  assert.equal(createBreakPolicy(null)(AD_BREAKS.MATCH_END), true);   // 默认策略
  const custom = createBreakPolicy(['level-up', 'shop-open']);
  assert.equal(custom('level-up'), true);
  assert.equal(custom('shop-open'), true);
  assert.equal(custom(AD_BREAKS.MATCH_END), false); // 默认两点在自定义策略下不再合法
  const pred = createBreakPolicy((v) => v === 'wave-end');
  assert.equal(pred('wave-end'), true);
  assert.equal(pred('combat'), false);
});

test('F2 支持语言可配置：核心不锁死中英表，默认策略保持不变', () => {
  const policy = createLanguagePolicy({ supported: ['fr', 'de'], fallback: 'fr' });
  assert.deepEqual(policy.supported, ['fr', 'de']);
  assert.equal(policy.normalize('de-DE'), 'de');
  assert.equal(policy.normalize('zh-CN'), 'fr'); // 中英不在该游戏支持集内
  assert.equal(normalizeLanguage('fr', 'fr', ['fr', 'de']), 'fr');
  assert.equal(normalizeLanguage('zh-CN'), 'zh-cn'); // 默认策略不受影响
});

test('离线适配器：无 window 依赖、幂等初始化、默认中文', async () => {
  // 本测试运行于 Node（无 window/document），能构造即证明无浏览器依赖
  const a = new OfflinePlatformAdapter();
  assert.equal(a.id, 'offline');
  assert.equal(a.language, 'zh-cn'); // 离线默认中文（US-02）
  assert.equal(typeof a.requestAd, 'function');

  const ready = [];
  a.on(PLATFORM_EVENTS.READY, (p) => ready.push(p));
  assert.equal(await a.init(), true);
  assert.equal(await a.init(), true); // 幂等：重复初始化不重复发 ready
  assert.equal(ready.length, 1);
});

test('离线适配器：自定义语言经归一化，不发网络请求直接无填充', async () => {
  const a = new OfflinePlatformAdapter({ language: 'ZH' });
  assert.equal(a.language, 'zh-cn');
  const net = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = (...args) => { net.push(args); return Promise.resolve({ ok: true }); };
  try {
    assert.equal(await a.requestAd(AD_BREAKS.MATCH_END), AD_STATUS.NO_FILL);
    assert.equal(await a.requestAd(AD_BREAKS.MENU_RETURN), AD_STATUS.NO_FILL);
  } finally {
    globalThis.fetch = origFetch;
  }
  assert.equal(net.length, 0); // 离线适配器绝不发网络请求
});

test('离线适配器接入 AdSession：无填充请求不触碰暂停与音频', async () => {
  const { AdSession } = await import('../../src/platform/ad-session.js');
  const adapter = new OfflinePlatformAdapter();
  await adapter.init();
  const ctrl = makeControls();
  const session = new AdSession({ requestAd: (bp) => adapter.requestAd(bp), controls: ctrl.api });
  const result = await session.request(AD_BREAKS.MATCH_END);
  assert.equal(result.status, AD_STATUS.NO_FILL);
  assert.equal(ctrl.s.adPaused, false);
  assert.equal(ctrl.s.muted, false);
  assert.equal(session.state, 'idle');
});

test('F8 installPlatform：一行安装即插即用，destroy 收口、幂等并释放监听', async () => {
  const { installPlatform } = await import('../../src/platform/index.js');
  const ctrl = makeControls();
  const lifecycle = [];
  const handle = installPlatform({
    controls: ctrl.api,
    onEvent: (type) => lifecycle.push(type),
  });
  assert.equal(validateAdapter(handle.adapter).ok, true);
  assert.equal(await handle.ready, true);

  const seen = [];
  const unsub = handle.on(PLATFORM_EVENTS.READY, (p) => seen.push(p));
  assert.equal(typeof unsub, 'function'); // 统一退订入口

  const result = await handle.session.request(AD_BREAKS.MATCH_END); // offline → no-fill
  assert.equal(result.status, AD_STATUS.NO_FILL);
  assert.equal(ctrl.simPaused, false);

  assert.equal(handle.destroy(), true);
  assert.equal(handle.destroyed, true);
  assert.equal(handle.destroy(), false); // 幂等
  const after = await handle.session.request(AD_BREAKS.MATCH_END);
  assert.equal(after.status, AD_STATUS.ERROR); // 销毁后请求安全收口
  assert.equal(after.reason, 'destroyed');
});

test('F8 installPlatform：注入不合合同的自定义适配器在安装期即报错', async () => {
  const { installPlatform } = await import('../../src/platform/index.js');
  assert.throws(
    () => installPlatform({ adapter: { id: 'bad', init() {}, requestAd() {}, on() {} } }),
    /missing/,
  );
});
