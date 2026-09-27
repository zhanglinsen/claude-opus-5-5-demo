// 平台语言宿主桥接单测（node --test）：集成审核 P1——Y8 正式 ID 场景下，
// SDK init 前适配器内部 fallback（'zh-cn'）被当作真实平台语言，浏览器 en 的玩家
// 初始显示 zh，且 SDK 就绪后平台语言不再触发自动档重解析。
// 覆盖（全部走真实接线：Y8PlatformAdapter + installPlatform + createGameLocale + bridge）：
//   1. SDK 就绪前 platformLocale 为 null，语言落到浏览器（不泄漏内部 fallback）；
//   2. ready 成功后自动档以真实平台语言重解析并通知订阅者；
//   3. ready 失败保持浏览器语言，内部 fallback 不外泄；
//   4. 玩家在 ready 前显式选择的语言不被覆盖。
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

function makeFakeSdk(locale) {
  return {
    init() {},
    async getPlatformLocale() { return locale; },
    showAd() { return Promise.resolve({ breakStatus: 'viewed' }); },
  };
}

// SDK 已就位（先到路径）：adapter.init() 直接 _startSdk
function attachSdk(win, sdk) {
  win.y8 = {
    sdk: () => sdk,
    emitReadyEvent: () => win.dispatch('y8sdk.ready'),
  };
}

// 与 src/main.js 相同的接线（Y8 正式 ID 场景：平台构建默认 en）
function wireScene({ win, browserLocale = 'en' } = {}) {
  const adapter = new Y8PlatformAdapter({
    window: win,
    appId: 'app-id',
    gameId: 'game-id',
    initTimeoutMs: 20,
  });
  const bridge = createPlatformLocaleBridge({ getLanguage: () => adapter.language });
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
