// GameMonetize 平台适配器单元测试（node --test，纯 mock，无网络/无真实 SDK）。
// 官方依据 https://github.com/GameMonetize/GameMonetize.com-SDK：
//   window.SDK_OPTIONS = { gameId, onEvent(a) { switch (a.name) { ... } } }
//   注入 <script id="gamemonetize-sdk" src="https://api.gamemonetize.com/sdk.js">
//   SDK_READY 后全局 sdk.showBanner() 触发一次广告（非游戏常驻横幅）；
//   广告开始发 SDK_GAME_PAUSE、结束发 SDK_GAME_START、失败发 SDK_ERROR。
// 本文件不连接正式平台：全部经注入 env（window/document）与 mock sdk 模拟，不能作为正式平台验证。
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AD_STATUS, PLATFORM_EVENTS, validateAdapter,
} from '../../src/platform/contract.js';
import { GameMonetizePlatformAdapter } from '../../src/platform/gamemonetize.js';
import { installPlatform } from '../../src/platform/index.js';
import { makeControls } from './helpers/ad-controls.js';

// ---------------------------------------------------------------------------
// 测试替身：可注入的 env（官方 loader 的最小 document/window 面）+ mock SDK。
// ---------------------------------------------------------------------------
function makeEnv({ preloaded = false } = {}) {
  const injected = [];
  const existing = preloaded
    ? [{ id: 'gamemonetize-sdk', src: 'https://api.gamemonetize.com/sdk.js', async: true }]
    : [];
  const document = {
    getElementById(id) { return existing.find((s) => s.id === id) || null; },
    createElement(tag) { return { tagName: tag, setAttribute(k, v) { this[k] = v; } }; },
    head: { appendChild(el) { injected.push(el); } },
  };
  const window = { SDK_OPTIONS: undefined, sdk: undefined };
  return { window, document, injected };
}

/** 经官方 onEvent 通道向适配器派发 SDK 事件。 */
function sdkEvent(env, name, extra = {}) {
  const onEvent = env.window.SDK_OPTIONS && env.window.SDK_OPTIONS.onEvent;
  assert.equal(typeof onEvent, 'function', `SDK event "${name}" before SDK_OPTIONS wired`);
  onEvent({ name, ...extra });
}

async function readyAdapter({ gameId = 'mock-game-id', env = makeEnv(), readyTimeoutMs = 5000 } = {}) {
  const adapter = new GameMonetizePlatformAdapter({ gameId, env, readyTimeoutMs });
  env.window.sdk = { showBannerCalls: 0, showBanner() { this.showBannerCalls++; } };
  const initPromise = adapter.init();
  sdkEvent(env, 'SDK_READY');                    // mock 通道：init 等待期间派发官方就绪事件
  assert.equal(await initPromise, true, 'mock SDK_READY must resolve init');
  return { adapter, env };
}

// ---------------------------------------------------------------------------
// 合同与安全退化
// ---------------------------------------------------------------------------
test('validateAdapter：GM 适配器满足 PlatformAdapter 合同', () => {
  const { adapter } = { adapter: new GameMonetizePlatformAdapter({ env: makeEnv() }) };
  assert.equal(adapter.id, 'gamemonetize');
  assert.equal(validateAdapter(adapter).ok, true);
});

test('无 Game ID：init 安全退化返回 false，不写 SDK_OPTIONS、不注入脚本，广告无填充', async () => {
  const env = makeEnv();
  const adapter = new GameMonetizePlatformAdapter({ env, readyTimeoutMs: 20 });
  assert.equal(await adapter.init(), false);
  assert.equal(env.window.SDK_OPTIONS, undefined);          // 不触碰官方接线点
  assert.equal(env.injected.length, 0);                     // 不加载 sdk.js
  assert.equal(
    await adapter.requestAd('match-end', { started() {}, ended() {} }),
    AD_STATUS.NO_FILL,
  );
});

test('SDK 就绪前请求：无填充收口，不调用 showBanner、不暂停', async () => {
  const env = makeEnv();
  const adapter = new GameMonetizePlatformAdapter({ gameId: 'g', env, readyTimeoutMs: 20 });
  env.window.sdk = { showBanner() { throw new Error('must not be called'); } };
  await adapter.init(); // 等待 READY，此处尚未派发 SDK_READY
  assert.equal(
    await adapter.requestAd('menu-return', { started() {} }),
    AD_STATUS.NO_FILL,
  );
  assert.equal(adapter.ready, false);
});

// ---------------------------------------------------------------------------
// SDK_OPTIONS / sdk.js 接线幂等（官方 loader 语义）
// ---------------------------------------------------------------------------
test('init：按官方约定写 SDK_OPTIONS{gameId,onEvent} 并注入 id/src 正确的脚本', async () => {
  const env = makeEnv();
  const adapter = new GameMonetizePlatformAdapter({ gameId: 'gid-1', env, readyTimeoutMs: 20 });
  await adapter.init();
  const opts = env.window.SDK_OPTIONS;
  assert.equal(opts.gameId, 'gid-1');
  assert.equal(typeof opts.onEvent, 'function');
  assert.equal(env.injected.length, 1);
  assert.equal(env.injected[0].id, 'gamemonetize-sdk');
  assert.equal(env.injected[0].src, 'https://api.gamemonetize.com/sdk.js');
});

test('init 幂等：重复调用不重复注入脚本、不重复包装 onEvent', async () => {
  const env = makeEnv();
  const adapter = new GameMonetizePlatformAdapter({ gameId: 'g', env, readyTimeoutMs: 20 });
  await adapter.init();
  const first = env.window.SDK_OPTIONS;
  const firstScriptCount = env.injected.length;
  await adapter.init();
  await adapter.init();
  assert.equal(env.window.SDK_OPTIONS, first);              // 同一对象，未二次包装
  assert.equal(env.window.SDK_OPTIONS.onEvent, first.onEvent);
  assert.equal(env.injected.length, firstScriptCount);      // 脚本只注入一次
});

test('sdk.js 已存在（宿主先行加载）：再次 init 不重复注入脚本', async () => {
  const env = makeEnv({ preloaded: true });
  const adapter = new GameMonetizePlatformAdapter({ gameId: 'g', env, readyTimeoutMs: 20 });
  await adapter.init();
  assert.equal(env.injected.length, 0);
  assert.equal(typeof env.window.SDK_OPTIONS.onEvent, 'function');
});

test('加载失败：READY 超时后 init 返回 false，后续广告无填充', async () => {
  const env = makeEnv();
  const adapter = new GameMonetizePlatformAdapter({ gameId: 'g', env, readyTimeoutMs: 15 });
  const t0 = Date.now();
  assert.equal(await adapter.init(), false);
  assert.ok(Date.now() - t0 >= 10, 'must wait out the ready timeout');
  assert.equal(
    await adapter.requestAd('match-end', { started() {} }),
    AD_STATUS.NO_FILL,
  );
});

test('宿主已有 onEvent：被保留并在 GM 事件后继续收到派发', async () => {
  const env = makeEnv();
  const hostEvents = [];
  env.window.SDK_OPTIONS = { gameId: 'host-id', onEvent(a) { hostEvents.push(a.name); } };
  const adapter = new GameMonetizePlatformAdapter({ gameId: 'ours', env, readyTimeoutMs: 20 });
  await adapter.init();
  assert.equal(env.window.SDK_OPTIONS.gameId, 'host-id');   // 宿主配置优先，不覆盖
  sdkEvent(env, 'SDK_GAME_PAUSE');
  assert.deepEqual(hostEvents, ['SDK_GAME_PAUSE']);         // 宿主处理器未被吞掉
});

// ---------------------------------------------------------------------------
// 自然断点广告生命周期（mock SDK 全流程）
// ---------------------------------------------------------------------------
test('自然断点 mock 全流程：requestAd→ok、showBanner 恰一次、PAUSE 暂停静音、START 恢复', async () => {
  const { adapter, env } = await readyAdapter();
  const c = makeControls(false);
  const handle = installPlatform({ adapter, controls: c.api });
  await handle.ready;

  const requestPromise = handle.session.request('match-end');   // 合法自然断点
  await new Promise((r) => setTimeout(r, 0));                    // 让 requestAd 的 'ok' resolve 落地
  assert.notEqual(handle.session.state, 'idle',
    'showBanner 已接手机会，须停在握手等待，不得在 PAUSE 前按无播放收口');
  assert.equal(env.window.sdk.showBannerCalls, 1);              // 官方 showBanner = 触发广告

  sdkEvent(env, 'SDK_GAME_PAUSE');                              // 官方"广告实际开始"
  assert.equal(c.s.adPaused, true, 'SDK_GAME_PAUSE 必须暂停模拟');
  assert.equal(c.s.muted, true, '广告期间必须临时静音');
  assert.equal(c.s.persistedVolume, 0.8, '玩家已保存音量不得被污染');

  sdkEvent(env, 'SDK_GAME_START');                              // 官方"广告结束"
  const result = await requestPromise;
  assert.equal(result.status, AD_STATUS.PLAYED);
  assert.equal(result.started, true);
  assert.equal(c.s.adPaused, false, '恢复先前状态：模拟继续');
  assert.equal(c.s.muted, false, '静音解除');
  assert.equal(c.s.persistedVolume, 0.8);
  handle.destroy();
});

test('玩家此前已暂停：广告结束保持用户暂停，不越权恢复', async () => {
  const { adapter, env } = await readyAdapter();
  const c = makeControls(true);
  const handle = installPlatform({ adapter, controls: c.api });
  await handle.ready;
  const p = handle.session.request('menu-return');
  sdkEvent(env, 'SDK_GAME_PAUSE');
  sdkEvent(env, 'SDK_GAME_START');
  const result = await p;
  assert.equal(result.status, AD_STATUS.PLAYED);
  assert.equal(result.wasUserPaused, true);
  assert.equal(c.s.userPaused, true);   // 用户暂停独立保留
  assert.equal(c.s.muted, false);
  handle.destroy();
});

test('重复与迟到事件：PAUSE×2 只暂停一次，START×2 只恢复一次，迟到 PAUSE 不再触碰', async () => {
  const { adapter, env } = await readyAdapter();
  const c = makeControls(false);
  const handle = installPlatform({ adapter, controls: c.api });
  await handle.ready;
  const p = handle.session.request('match-end');
  sdkEvent(env, 'SDK_GAME_PAUSE');
  sdkEvent(env, 'SDK_GAME_PAUSE');           // 重复开始
  assert.equal(c.s.pauseCalls, 1);
  sdkEvent(env, 'SDK_GAME_START');
  await p;
  assert.equal(c.s.adPaused, false);
  sdkEvent(env, 'SDK_GAME_START');           // 重复结束
  sdkEvent(env, 'SDK_GAME_PAUSE');           // 无活动请求的迟到 PAUSE：不得暂停/静音
  assert.equal(c.s.adPaused, false);
  assert.equal(c.s.muted, false);
  handle.destroy();
});

test('SDK_ERROR：按错误收口，绝不暂停、绝不静音', async () => {
  const { adapter, env } = await readyAdapter();
  const c = makeControls(false);
  const handle = installPlatform({ adapter, controls: c.api });
  await handle.ready;
  const p = handle.session.request('match-end');
  assert.equal(env.window.sdk.showBannerCalls, 1);
  sdkEvent(env, 'SDK_ERROR', { message: 'no fill' });
  const result = await p;
  assert.equal(result.status, AD_STATUS.ERROR);
  assert.equal(c.s.adPaused, false);
  assert.equal(c.s.muted, false);
  handle.destroy();
});

test('showBanner 同步抛错：请求按错误收口，不进入握手等待', async () => {
  const env = makeEnv();
  const adapter = new GameMonetizePlatformAdapter({ gameId: 'g', env, readyTimeoutMs: 20 });
  env.window.sdk = { showBanner() { throw new Error('sdk exploded'); } };
  await adapter.init();
  sdkEvent(env, 'SDK_READY');
  assert.equal(
    await adapter.requestAd('match-end', { started() {}, ended() {} }),
    AD_STATUS.ERROR,
  );
});

test('非法断点：适配器防御性拒绝，绝不调用 showBanner', async () => {
  const { adapter, env } = await readyAdapter();
  assert.equal(
    await adapter.requestAd('page-load', { started() {} }),
    AD_STATUS.ERROR,
  );
  assert.equal(env.window.sdk.showBannerCalls, 0);
});

test('destroy：销毁后广告无填充收口；幂等（重复销毁为无害空操作）', async () => {
  const { adapter, env } = await readyAdapter();
  assert.equal(adapter.destroy(), true);
  assert.equal(adapter.destroy(), false);   // 与 AdSession.close 同语义：已销毁返回 false
  assert.equal(
    await adapter.requestAd('match-end', { started() {} }),
    AD_STATUS.NO_FILL,
  );
  assert.equal(env.window.sdk.showBannerCalls, 0);
});

test('READY 经统一事件面广播一次（installPlatform 转发）', async () => {
  const env = makeEnv();
  const adapter = new GameMonetizePlatformAdapter({ gameId: 'g', env, readyTimeoutMs: 20 });
  const handle = installPlatform({ adapter, controls: {} });
  const readyEvents = [];
  handle.on(PLATFORM_EVENTS.READY, (p) => readyEvents.push(p));
  await handle.ready;
  sdkEvent(env, 'SDK_READY');
  sdkEvent(env, 'SDK_READY');   // 重复 READY 只广播一次
  assert.equal(readyEvents.length, 1);
  assert.equal(readyEvents[0].id, 'gamemonetize');
  handle.destroy();
});
