// 平台语言宿主桥接单测（node --test）：集成审核 P1——Y8 正式 ID 场景下，
// SDK init 前适配器内部 fallback（'zh-cn'）被当作真实平台语言，浏览器 en 的玩家
// 初始显示 zh，且 SDK 就绪后平台语言不再触发自动档重解析。
// P1 后续边界：Y8 SDK ready 成功但 getPlatformLocale 缺失/抛错/返回空时，内部
// fallback（'zh-cn'）仍会经 adapter.language 泄漏成"平台语言"压过浏览器 en——
// 适配器新增 resolvedPlatformLocale（SDK 真实返回，无则 null），接线只取该信号。
// 覆盖（全部走真实接线：Y8PlatformAdapter + installPlatform + createGameLocale + bridge）：
//   1. SDK 就绪前 platformLocale 为 null，语言落到浏览器（不泄漏内部 fallback）；
//   2. ready 成功后自动档以真实平台语言重解析并通知订阅者；
//   3. ready 失败保持浏览器语言，内部 fallback 不外泄；
//   4. 玩家在 ready 前显式选择的语言不被覆盖；
//   5. ready 成功但 SDK 无 getPlatformLocale / 抛错 / 返回空：浏览器 en 不被内部
//      fallback 压过；
//   6. SDK 返回未支持语言（'pt'）：经语言目录安全回退落到浏览器 en，而非目录
//      内的 'zh-cn'。
import test from 'node:test';
import assert from 'node:assert/strict';

import { Y8PlatformAdapter } from '../../src/platform/y8.js';
import { installPlatform } from '../../src/platform/index.js';
import { createPlatformLocaleBridge } from '../../src/platform/locale-bridge.js';
import { createGameLocale } from '../../src/i18n/index.js';

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

// locale 传 undefined 表示 SDK 缺 getPlatformLocale 方法（新边界：接口面不完整）
function makeFakeSdk(locale) {
  const sdk = {
    init() {},
    showAd() { return Promise.resolve({ breakStatus: 'viewed' }); },
  };
  if (locale !== undefined) {
    sdk.getPlatformLocale = async () => locale;
  }
  return sdk;
}

// SDK 已就位（先到路径）：adapter.init() 直接 _startSdk
function attachSdk(win, sdk) {
  win.y8 = {
    sdk: () => sdk,
    emitReadyEvent: () => win.dispatch('y8sdk.ready'),
  };
}

// 与 src/main.js 相同的接线（Y8 正式 ID 场景：平台构建默认 en）；
// 只取 resolvedPlatformLocale：SDK 真实返回，无真实语言时为 null（内部 fallback 不算数）
function wireScene({ win, browserLocale = 'en' } = {}) {
  const adapter = new Y8PlatformAdapter({
    window: win,
    appId: 'app-id',
    gameId: 'game-id',
    initTimeoutMs: 20,
  });
  const bridge = createPlatformLocaleBridge({
    getLanguage: () => adapter.resolvedPlatformLocale,
  });
  const locale = createGameLocale({
    platformLocale: bridge.platformLocale,
    browserLocale,
    defaultLocale: 'en',
  });
  const platform = installPlatform({ adapter, breaks: ['match-end'] });
  bridge.attach(platform, locale);
  return { adapter, bridge, locale, platform };
}

test('SDK 就绪前不把适配器内部 fallback 当平台语言：浏览器 en 生效', async () => {
  const win = makeFakeWindow(); // SDK 暂不入位：模拟 y8.min.js 仍在加载
  const { adapter, bridge, locale } = wireScene({ win });

  assert.equal(adapter.language, 'zh-cn'); // 合同现状：内部 fallback（修复对象是接线，不是适配器）
  assert.equal(bridge.platformLocale(), null); // 就绪前 getter 不得暴露任何平台语言
  assert.equal(locale.getLocale(), 'en'); // 修复前此处为 'zh'：内部 fallback 泄漏
  assert.equal(locale.t('menu.start'), 'START GAME'); // 浏览器 en 实际取词
});

test('ready 成功后自动档以真实平台语言重解析并通知订阅者', async () => {
  const win = makeFakeWindow();
  attachSdk(win, makeFakeSdk('zh'));
  const { locale, platform } = wireScene({ win });

  assert.equal(locale.getLocale(), 'en'); // 就绪前：浏览器 en
  const seen = [];
  locale.subscribe((loc) => seen.push(loc));

  await platform.ready;
  await Promise.resolve(); // attach 的 .then 在 ready 之后微任务执行
  await Promise.resolve();

  assert.equal(locale.getLocale(), 'zh'); // 平台 zh 覆盖浏览器 en
  assert.equal(seen.includes('zh'), true); // HUD/触屏收到切换通知
  assert.equal(locale.isAuto(), true); // 仍是自动档（未被写成显式选择）
});

test('ready 失败保持浏览器语言，内部 fallback 不外泄', async () => {
  const win = makeFakeWindow(); // SDK 永不到达：init 超时 resolve false
  const { bridge, locale, platform } = wireScene({ win });

  await platform.ready;
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(platform.ready ? await platform.ready : null, false); // 就绪失败
  assert.equal(bridge.ready, false);
  assert.equal(bridge.platformLocale(), null); // 'zh-cn' 不得经 getter 外泄
  assert.equal(locale.getLocale(), 'en'); // 保持浏览器语言
});

test('玩家在 ready 前显式选择的语言不被平台覆盖', async () => {
  const win = makeFakeWindow();
  attachSdk(win, makeFakeSdk('zh'));
  const { locale, platform } = wireScene({ win });

  assert.equal(locale.setLocale('en'), true); // 显式选择（尽管浏览器同为 en）
  assert.equal(locale.isAuto(), false);

  await platform.ready;
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(locale.getLocale(), 'en'); // 平台 zh 不得覆盖显式选择
  assert.equal(locale.getSavedLocale(), 'en'); // 选择保持持久化语义
});

// 新边界：ready 成功 ≠ 有真实平台语言。SDK 无 getPlatformLocale / 抛错 / 返回空时，
// 适配器语言仍是内部 fallback（'zh-cn'），接线必须把它当 null 落到浏览器 en。
test('ready 成功但 SDK 无 getPlatformLocale/抛错/返回空：浏览器 en 不被内部 fallback 压过', async () => {
  const scenes = [
    { name: '无 getPlatformLocale', sdk: makeFakeSdk(undefined) },
    { name: 'getPlatformLocale 抛错', sdk: makeFakeSdk(new Error('locale unavailable')) },
    { name: '返回空串', sdk: makeFakeSdk('') },
  ];
  for (const { name, sdk } of scenes) {
    const win = makeFakeWindow();
    attachSdk(win, sdk);
    const { adapter, bridge, locale, platform } = wireScene({ win });

    await platform.ready;
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(platform.ready ? await platform.ready : null, true, name); // ready 成功
    assert.equal(bridge.ready, true, name);
    assert.equal(adapter.language, 'zh-cn', name); // 合同现状：内部 fallback 保持
    assert.equal(bridge.platformLocale(), null, name); // 无真实平台语言 → null
    assert.equal(locale.getLocale(), 'en', name); // 浏览器 en 生效（修复前此处为 'zh'）
    assert.equal(locale.t('menu.start'), 'START GAME', name);
  }
});

// 未支持语言：resolvedPlatformLocale 原样上报 'pt'，i18n 目录匹配不命中 →
// 安全回退到浏览器 en，绝不落成目录内的 'zh-cn' 冒充平台语言。
test('SDK 返回未支持语言 pt：经语言目录安全回退落到浏览器 en 而非 zh-cn', async () => {
  const win = makeFakeWindow();
  attachSdk(win, makeFakeSdk('pt'));
  const { bridge, locale, platform } = wireScene({ win });

  await platform.ready;
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(bridge.ready, true);
  assert.equal(locale.getLocale(), 'en'); // 修复前此处为 'zh'：'pt'→'zh-cn'→目录命中
  assert.equal(locale.t('menu.start'), 'START GAME');
});
