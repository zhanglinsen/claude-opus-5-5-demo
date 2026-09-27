// Y8 平台适配器单元测试（node --test）：全部经注入的 fake window / fake SDK（mock），
// 无真实 App ID / Game ID，不构成正式平台验证。覆盖：SDK 先后到达竞态与幂等、
// 缺 SDK 安全回退、自然断点 showAd 生命周期接线（只有 beforeAd 暂停静音）、
// 无填充/拒绝不挂起、启动不请求广告、getPlatformLocale 安全回退。
import test from 'node:test';
import assert from 'node:assert/strict';

import { AD_BREAKS, AD_STATUS, PLATFORM_EVENTS } from '../../src/platform/contract.js';
import { Y8PlatformAdapter } from '../../src/platform/y8.js';
import { AdSession } from '../../src/platform/ad-session.js';
import { makeControls } from './helpers/ad-controls.js';

function makeFakeWindow() {
  const listeners = new Map();
  return {
    y8: null,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      const s = listeners.get(type);
      if (s) s.delete(fn);
    },
    dispatch(type) {
      const s = listeners.get(type);
      if (!s) return;
      for (const fn of [...s]) fn({ type });
    },
  };
}

function makeFakeSdk({ locale = 'zh', showAdImpl = null } = {}) {
  const calls = [];
  const sdk = {
    calls,
    init(appConfig, adConfig) {
      calls.push(['init', appConfig, adConfig]);
      if (adConfig && typeof adConfig.onReady === 'function') adConfig.onReady();
    },
    async getPlatformLocale() {
      calls.push(['locale']);
      if (locale instanceof Error) throw locale;
      return locale;
    },
    showAd(opts) {
      calls.push(['showAd', opts]);
      return showAdImpl ? showAdImpl(opts) : Promise.resolve({ breakStatus: 'viewed' });
    },
  };
  return sdk;
}

// SDK 装载完成（先到）：y8.sdk() 工厂 + emitReadyEvent 兜底入口（官方接口面）
function attachSdk(win, sdk) {
  win.y8 = {
    sdk: () => sdk,
    emitReadyEvent: () => win.dispatch('y8sdk.ready'),
  };
  return win.y8;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

test('Y8 init：SDK 先到时初始化一次、重复调用幂等，平台语言归一化', async () => {
  const win = makeFakeWindow();
  const sdk = makeFakeSdk({ locale: 'zh' });
  attachSdk(win, sdk);
  const ready = [];
  const adapter = new Y8PlatformAdapter({ window: win, appId: 'A1', gameId: 'G1' });
  adapter.on(PLATFORM_EVENTS.READY, (p) => ready.push(p));

  assert.equal(await adapter.init(), true);
  assert.equal(await adapter.init(), true); // 幂等：不重复 init SDK、不重复发 READY
  assert.equal(sdk.calls.filter((c) => c[0] === 'init').length, 1);
  assert.equal(ready.length, 1);

  const [, appConfig, adConfig] = sdk.calls.find((c) => c[0] === 'init');
  assert.equal(appConfig.appId, 'A1');
  assert.equal(appConfig.autoLogin, false); // 首版不做登录
  assert.equal(adConfig.gameId, 'G1');
  assert.equal(adapter.language, 'zh-cn');  // 平台 'zh' → 支持集归一化
  assert.equal(adapter.validate().ok, true);
});

test('Y8 init：SDK 后到经 loadScript 注入加载，ready 事件错过由 emitReadyEvent 兜底', async () => {
  const win = makeFakeWindow();
  const sdk = makeFakeSdk();
  let scriptLoads = 0;
  const adapter = new Y8PlatformAdapter({
    window: win,
    appId: 'A', gameId: 'G',
    initTimeoutMs: 200,
    loadScript: async (src) => {
      scriptLoads += 1;
      assert.match(src, /y8\.min\.js/);
      attachSdk(win, sdk); // 脚本就绪但 y8sdk.ready 已被错过
      return true;
    },
  });
  assert.equal(await adapter.init(), true);
  assert.equal(scriptLoads, 1);
  assert.equal(sdk.calls[0][0], 'init');
});

test('Y8 init：监听 y8sdk.ready 后到事件完成初始化', async () => {
  const win = makeFakeWindow();
  const sdk = makeFakeSdk();
  const adapter = new Y8PlatformAdapter({
    window: win, appId: 'A', gameId: 'G',
    initTimeoutMs: 500,
    loadScript: async () => false, // 不经加载器：纯事件路径
  });
  const pending = adapter.init();
  await tick();
  attachSdk(win, sdk);
  win.dispatch('y8sdk.ready');
  assert.equal(await pending, true);
  assert.equal(sdk.calls[0][0], 'init');
});

test('Y8 init：缺 SDK 时安全返回 false、不发 READY，游戏可继续', async () => {
  const win = makeFakeWindow();
  const ready = [];
  const adapter = new Y8PlatformAdapter({
    window: win,
    initTimeoutMs: 10,
    loadScript: async () => false, // SDK 永远不到
  });
  adapter.on(PLATFORM_EVENTS.READY, (p) => ready.push(p));
  assert.equal(await adapter.init(), false);
  assert.equal(ready.length, 0);

  const noWin = new Y8PlatformAdapter({}); // Node 无 window 直构
  assert.equal(await noWin.init(), false);
});

test('Y8 不在页面启动时请求广告：init 完成后没有任何 showAd 调用', async () => {
  const win = makeFakeWindow();
  const sdk = makeFakeSdk();
  attachSdk(win, sdk);
  const adapter = new Y8PlatformAdapter({ window: win, appId: 'A', gameId: 'G' });
  await adapter.init();
  assert.equal(sdk.calls.some((c) => c[0] === 'showAd'), false);
});

test('Y8 requestAd：type next 自然断点；只有 beforeAd 暂停静音，结束成对恢复，重复回调安全', async () => {
  const win = makeFakeWindow();
  let adOpts = null;
  let pausedDuringAd = null;
  let mutedDuringAd = null;
  const sdk = makeFakeSdk();
  attachSdk(win, sdk);
  const ctrl = makeControls();
  const adapter = new Y8PlatformAdapter({ window: win, appId: 'A', gameId: 'G' });
  await adapter.init();
  const session = new AdSession({
    requestAd: (bp, cb) => adapter.requestAd(bp, cb),
    controls: ctrl.api,
  });

  sdk.showAd = (o) => {
    adOpts = o;
    o.beforeAd();
    pausedDuringAd = ctrl.simPaused;
    mutedDuringAd = ctrl.s.muted;
    o.afterAd();
    o.afterAd(); // 重复结束回调
    o.adBreakDone({ breakStatus: 'viewed' }); // breakDone 迟到/重复
    return Promise.resolve({ breakStatus: 'viewed' });
  };

  const result = await session.request(AD_BREAKS.MATCH_END);
  assert.equal(adOpts.type, 'next');
  assert.equal(adOpts.name, AD_BREAKS.MATCH_END);
  assert.equal(result.status, AD_STATUS.PLAYED);
  assert.equal(result.started, true);
  assert.equal(pausedDuringAd, true);  // 只有 beforeAd 才暂停
  assert.equal(mutedDuringAd, true);   // 且临时静音
  assert.equal(ctrl.simPaused, false); // 结束后成对恢复
  assert.equal(ctrl.s.muted, false);
  assert.equal(ctrl.s.pauseCalls, 1);  // 重复回调不重复施加
  assert.equal(ctrl.s.persistedVolume, 0.8); // 不写玩家设置
});

test('Y8 requestAd：无填充不暂停不静音；showAd 拒绝按失败收口，游戏不挂起', async () => {
  // 无填充：breakStatus 非 viewed/dismissed
  const winA = makeFakeWindow();
  const sdkA = makeFakeSdk({ showAdImpl: () => Promise.resolve({ breakStatus: 'no-fill' }) });
  attachSdk(winA, sdkA);
  const ctrlA = makeControls();
  const adapterA = new Y8PlatformAdapter({ window: winA, appId: 'A', gameId: 'G' });
  await adapterA.init();
  const sessionA = new AdSession({
    requestAd: (bp, cb) => adapterA.requestAd(bp, cb),
    controls: ctrlA.api,
  });
  const resA = await sessionA.request(AD_BREAKS.MENU_RETURN);
  assert.equal(resA.status, AD_STATUS.NO_FILL);
  assert.equal(ctrlA.simPaused, false);
  assert.equal(ctrlA.s.muted, false);

  // 拒绝：官方未初始化即请求时 showAd 拒绝字符串
  const winB = makeFakeWindow();
  const sdkB = makeFakeSdk({ showAdImpl: () => Promise.reject('Ads not initialized. Call init() before requesting ad breaks') });
  attachSdk(winB, sdkB);
  const ctrlB = makeControls();
  const adapterB = new Y8PlatformAdapter({ window: winB, appId: 'A', gameId: 'G' });
  await adapterB.init();
  const sessionB = new AdSession({
    requestAd: (bp, cb) => adapterB.requestAd(bp, cb),
    controls: ctrlB.api,
  });
  const resB = await sessionB.request(AD_BREAKS.MATCH_END);
  assert.equal(resB.status, AD_STATUS.ERROR);
  assert.equal(ctrlB.simPaused, false);
  assert.equal(sessionB.state, 'idle'); // 收口，不挂起
});

test('Y8 getPlatformLocale：缺 SDK/SDK 抛错返回 null，语言安全回退', async () => {
  const noSdk = new Y8PlatformAdapter({});
  assert.equal(await noSdk.getPlatformLocale(), null);

  const win = makeFakeWindow();
  const badSdk = makeFakeSdk({ locale: new Error('locale unavailable') });
  attachSdk(win, badSdk);
  const adapter = new Y8PlatformAdapter({ window: win, appId: 'A', gameId: 'G' });
  await adapter.init();
  assert.equal(await adapter.getPlatformLocale(), null);
  assert.equal(adapter.language, 'zh-cn'); // 回退保持默认

  // 未支持语言回退：'pt' → 支持集内无基础匹配 → 默认回退
  const win2 = makeFakeWindow();
  const sdk2 = makeFakeSdk({ locale: 'pt' });
  attachSdk(win2, sdk2);
  const adapter2 = new Y8PlatformAdapter({ window: win2, appId: 'A', gameId: 'G' });
  await adapter2.init();
  assert.equal(await adapter2.getPlatformLocale(), 'pt');
  assert.equal(adapter2.language, 'zh-cn');
});

// 双轨语义（P1 边界）：合同字段 language 保持内部默认（独立插件消费者不变），
// 另以 resolvedPlatformLocale / hasPlatformLocale 上报 SDK 真实返回（无则 null/false），
// 供本游戏 locale bridge 区分"真实平台语言"与内部 fallback。
test('Y8 resolvedPlatformLocale：只反映 SDK 真实返回，language 合同默认不变', async () => {
  // 就绪前：信号为 null/false（内部 fallback 不得伪装成真实平台语言）
  const win0 = makeFakeWindow(); // SDK 永不到达
  const adapter0 = new Y8PlatformAdapter({
    window: win0, appId: 'A', gameId: 'G', initTimeoutMs: 10,
    loadScript: async () => false,
  });
  await adapter0.init();
  assert.equal(adapter0.resolvedPlatformLocale, null);
  assert.equal(adapter0.hasPlatformLocale, false);
  assert.equal(adapter0.language, 'zh-cn'); // 合同默认值行为不变

  // SDK 返回 'zh'：信号为原始 'zh'（不做支持集归一化），language 仍归一化 'zh-cn'
  const win1 = makeFakeWindow();
  attachSdk(win1, makeFakeSdk({ locale: 'zh' }));
  const adapter1 = new Y8PlatformAdapter({ window: win1, appId: 'A', gameId: 'G' });
  await adapter1.init();
  assert.equal(adapter1.resolvedPlatformLocale, 'zh');
  assert.equal(adapter1.hasPlatformLocale, true);
  assert.equal(adapter1.language, 'zh-cn');

  // 抛错/空串：信号保持 null/false，language 内部默认
  for (const locale of [new Error('locale unavailable'), '']) {
    const winE = makeFakeWindow();
    attachSdk(winE, makeFakeSdk({ locale }));
    const adapterE = new Y8PlatformAdapter({ window: winE, appId: 'A', gameId: 'G' });
    await adapterE.init();
    assert.equal(adapterE.resolvedPlatformLocale, null);
    assert.equal(adapterE.hasPlatformLocale, false);
    assert.equal(adapterE.language, 'zh-cn');
  }

  // 未支持语言 'pt'：信号原样上报，language 经支持集归一化落内部默认
  const win2 = makeFakeWindow();
  attachSdk(win2, makeFakeSdk({ locale: 'pt' }));
  const adapter2 = new Y8PlatformAdapter({ window: win2, appId: 'A', gameId: 'G' });
  await adapter2.init();
  assert.equal(adapter2.resolvedPlatformLocale, 'pt');
  assert.equal(adapter2.hasPlatformLocale, true);
  assert.equal(adapter2.language, 'zh-cn');
});

test('Y8 destroy：幂等销毁，销毁后不再请求广告', async () => {
  const win = makeFakeWindow();
  const sdk = makeFakeSdk();
  attachSdk(win, sdk);
  const adapter = new Y8PlatformAdapter({ window: win, appId: 'A', gameId: 'G' });
  await adapter.init();
  assert.equal(adapter.destroy(), true);
  assert.equal(adapter.destroy(), true);
  const res = await adapter.requestAd(AD_BREAKS.MATCH_END, {
    started() {}, ended() {}, failed() {}, noFill() {},
  });
  assert.equal(res, AD_STATUS.ERROR);
  assert.equal(sdk.calls.some((c) => c[0] === 'showAd'), false);
});
