// 广告会话单元测试（node --test）：区分请求/实际开始/结束/失败/无填充/重复回调；
// 只有实际开始才暂停模拟与临时静音；结束后恢复广告前暂停状态；临时静音不写玩家设置。
import test from 'node:test';
import assert from 'node:assert/strict';

import { AD_BREAKS, AD_STATUS, PLATFORM_EVENTS } from '../../src/platform/contract.js';
import { AdSession } from '../../src/platform/ad-session.js';
import { makeControls } from './helpers/ad-controls.js';

test('完整播放周期：只有实际开始才暂停模拟与临时静音，结束后成对恢复', async () => {
  const ctrl = makeControls();
  const events = [];
  let resolveAd;
  const session = new AdSession({
    requestAd: () => new Promise((r) => { resolveAd = r; }),
    controls: ctrl.api,
    onEvent: (type, p) => events.push([type, p]),
  });

  const pending = session.request(AD_BREAKS.MATCH_END);
  assert.equal(session.state, 'requested');
  assert.equal(ctrl.simPaused, false); // 请求 ≠ 播放，不暂停
  assert.deepEqual(events, [[PLATFORM_EVENTS.AD_REQUEST, { breakpoint: AD_BREAKS.MATCH_END }]]);

  session.adStarted(); // Y8 beforeAd / GM SDK_GAME_PAUSE
  assert.equal(session.state, 'playing');
  assert.equal(ctrl.simPaused, true);
  assert.equal(ctrl.s.muted, true);

  session.adEnded(); // Y8 afterAd / GM SDK_GAME_START
  assert.equal(session.state, 'idle');
  assert.equal(ctrl.simPaused, false);
  assert.equal(ctrl.s.muted, false);
  assert.equal(ctrl.s.pauseCalls, 1); // 成对、幂等：进/出各一次
  assert.equal(ctrl.s.persistedVolume, 0.8); // 临时静音绝不写玩家设置

  assert.equal((await pending).status, AD_STATUS.PLAYED);
  assert.deepEqual(events.map((e) => e[0]),
    [PLATFORM_EVENTS.AD_REQUEST, PLATFORM_EVENTS.AD_START, PLATFORM_EVENTS.AD_COMPLETE]);
});

test('无填充：不暂停、不静音，直接收口', async () => {
  const ctrl = makeControls();
  const events = [];
  const session = new AdSession({
    requestAd: async () => AD_STATUS.NO_FILL,
    controls: ctrl.api,
    onEvent: (type) => events.push(type),
  });
  const result = await session.request(AD_BREAKS.MENU_RETURN);
  assert.equal(result.status, AD_STATUS.NO_FILL);
  assert.equal(session.state, 'idle');
  assert.equal(ctrl.simPaused, false);
  assert.equal(ctrl.s.muted, false);
  assert.ok(events.includes(PLATFORM_EVENTS.AD_NO_FILL));
  assert.ok(!events.includes(PLATFORM_EVENTS.AD_START));
});

test('平台错误：请求被拒绝不触碰游戏与音频', async () => {
  const ctrl = makeControls();
  const session = new AdSession({
    requestAd: async () => { throw new Error('sdk down'); },
    controls: ctrl.api,
  });
  const result = await session.request(AD_BREAKS.MATCH_END);
  assert.equal(result.status, AD_STATUS.ERROR);
  assert.equal(ctrl.simPaused, false);
  assert.equal(ctrl.s.muted, false);
  assert.equal(session.state, 'idle');
});

test('同步回调：requestAd 内同步 adStarted/adEnded 也正确收口', async () => {
  const ctrl = makeControls();
  let session;
  session = new AdSession({
    requestAd: () => { session.adStarted(); session.adEnded(); return Promise.resolve(AD_STATUS.OK); },
    controls: ctrl.api,
  });
  const result = await session.request(AD_BREAKS.MATCH_END);
  assert.equal(result.status, AD_STATUS.PLAYED);
  assert.equal(session.state, 'idle');
  assert.equal(ctrl.simPaused, false); // 同步走完一整轮，最终已恢复
  assert.equal(ctrl.s.pauseCalls, 1);
});

test('播放中平台才 resolve(ok)：请求等待 adEnded 才收口', async () => {
  const ctrl = makeControls();
  let release;
  const session = new AdSession({
    requestAd: () => new Promise((r) => { release = r; }),
    controls: ctrl.api,
  });
  const pending = session.request(AD_BREAKS.MATCH_END);
  session.adStarted();
  release(AD_STATUS.OK); // 平台 resolve(ok) 时仍在播放
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(session.state, 'playing'); // resolve(ok) 不提前收口，仍等 adEnded
  assert.equal(ctrl.simPaused, true);
  session.adEnded();
  assert.equal((await pending).status, AD_STATUS.PLAYED);
});

test('无开始信号的 resolve(ok)：握手超时按机会消耗收口，无播放、无暂停', async () => {
  const ctrl = makeControls();
  const session = new AdSession({
    requestAd: async () => AD_STATUS.OK,
    controls: ctrl.api,
    watchdog: { handshakeMs: 10 },
  });
  const result = await session.request(AD_BREAKS.MATCH_END);
  assert.equal(result.status, AD_STATUS.PLAYED);
  assert.equal(result.started, false);
  assert.equal(ctrl.simPaused, false);
  assert.equal(ctrl.s.muted, false);
});

test('F4 竞态：resolve(ok) 后 beforeAd 异步迟到，真实播放仍必暂停静音并等收口', async () => {
  const ctrl = makeControls();
  const session = new AdSession({
    requestAd: () => Promise.resolve(AD_STATUS.OK),
    controls: ctrl.api,
    watchdog: { handshakeMs: 30 },
  });
  const pending = session.request(AD_BREAKS.MATCH_END);
  await new Promise((r) => setTimeout(r, 0)); // 平台 resolve 落地 → 进入握手等待
  assert.equal(session.state, 'handshake');
  session.adStarted(); // Y8 beforeAd 在 resolve(ok) 之后才到
  assert.equal(session.state, 'playing');
  assert.equal(ctrl.simPaused, true);   // 绝不漏暂停
  assert.equal(ctrl.s.muted, true);     // 绝不漏静音
  session.adEnded();
  const result = await pending;
  assert.equal(result.status, AD_STATUS.PLAYED);
  assert.equal(result.started, true);
  assert.equal(ctrl.simPaused, false);
  assert.equal(ctrl.s.muted, false);
});

test('F3 controls 抛错：暂停/静音仍成对施加与清除，Promise 不挂起', async () => {
  const s = { muted: false };
  const session = new AdSession({
    requestAd: () => new Promise(() => {}), // 回调驱动
    controls: {
      isUserPaused: () => false,
      enterAdPause() { throw new Error('pause bug'); },
      exitAdPause() { throw new Error('exit bug'); },
      setAdMuted(on) { s.muted = !!on; },
    },
  });
  const pending = session.request(AD_BREAKS.MATCH_END);
  assert.equal(session.adStarted(), true);
  assert.equal(s.muted, true);   // enterAdPause 抛错不阻断静音
  assert.equal(session.adEnded(), true);
  assert.equal(s.muted, false);  // exitAdPause 抛错不阻断恢复
  const result = await pending;  // 不挂起
  assert.equal(result.status, AD_STATUS.PLAYED);
  assert.equal(session.state, 'idle');
});

test('F5 旧请求回调不得污染新请求：epoch 句柄在新请求开始后失效', async () => {
  const ctrl = makeControls();
  const captured = [];
  const session = new AdSession({
    requestAd: (_bp, cb) => { captured.push(cb); return Promise.resolve(AD_STATUS.OK); },
    controls: ctrl.api,
    watchdog: { handshakeMs: 10 },
  });
  const first = await session.request(AD_BREAKS.MATCH_END); // 握手超时收口
  assert.equal(first.started, false);
  const second = session.request(AD_BREAKS.MENU_RETURN);
  assert.equal(captured[0].started(), false); // 旧请求句柄已失效：不暂停、不静音
  assert.equal(ctrl.simPaused, false);
  assert.equal(session.adStarted(), true);  // 当前请求的全局入口仍有效
  assert.equal(ctrl.simPaused, true);
  session.adEnded();
  assert.equal((await second).status, AD_STATUS.PLAYED);
  assert.equal(ctrl.s.pauseCalls, 1);
});

test('F6 看门狗：SDK 播放后永不回调结束时，恢复暂停静音并收口，游戏不挂起', async () => {
  const ctrl = makeControls();
  const events = [];
  const session = new AdSession({
    requestAd: () => new Promise(() => {}), // 永不 resolve、永不回调
    controls: ctrl.api,
    watchdog: { handshakeMs: 10, playingMs: 20 },
    onEvent: (type, p) => events.push([type, p]),
  });
  const pending = session.request(AD_BREAKS.MATCH_END);
  session.adStarted();
  assert.equal(ctrl.simPaused, true);
  const result = await pending;
  assert.equal(result.status, AD_STATUS.PLAYED);
  assert.equal(result.started, true);
  assert.equal(result.watchdog, true);
  assert.equal(ctrl.simPaused, false); // 看门狗兜底恢复
  assert.equal(ctrl.s.muted, false);
  assert.equal(session.state, 'idle');
});

test('F8 销毁：挂起请求安全收口、播放中先恢复暂停静音、回调与监听全部失效', async () => {
  const ctrl = makeControls();
  const events = [];
  const session = new AdSession({
    requestAd: () => new Promise(() => {}),
    controls: ctrl.api,
    onEvent: (type) => events.push(type),
  });
  const pending = session.request(AD_BREAKS.MATCH_END);
  session.adStarted();
  assert.equal(session.close('destroyed'), true);
  const result = await pending; // 挂起请求不悬挂
  assert.equal(result.status, AD_STATUS.ERROR);
  assert.equal(result.reason, 'destroyed');
  assert.equal(ctrl.simPaused, false); // 播放中销毁：先恢复
  assert.equal(ctrl.s.muted, false);
  const n = events.length;
  assert.equal(session.adEnded(), false);       // 销毁后回调入口全部失效
  assert.equal(session.adStarted(), false);
  assert.equal(events.length, n);               // 不再发事件（监听已释放）
  const after = await session.request(AD_BREAKS.MATCH_END);
  assert.equal(after.status, AD_STATUS.ERROR);
  assert.equal(after.reason, 'destroyed');
  assert.equal(session.close(), false);         // 幂等
});

test('原有用户暂停在广告期间与结束后都保持', async () => {
  const ctrl = makeControls(true); // 玩家在广告前已暂停
  const session = new AdSession({ requestAd: async () => AD_STATUS.OK, controls: ctrl.api });
  const pending = session.request(AD_BREAKS.MATCH_END);
  session.adStarted();
  assert.equal(ctrl.s.userPaused, true);
  session.adEnded();
  const result = await pending;
  assert.equal(result.wasUserPaused, true);
  assert.equal(ctrl.simPaused, true); // 广告结束不得替玩家恢复：用户暂停仍在
  assert.equal(ctrl.s.muted, false);
});

test('重复回调：二次 adStarted / 二次 adEnded / 迟到 noFill 均被忽略', async () => {
  const ctrl = makeControls();
  const events = [];
  const session = new AdSession({
    requestAd: () => new Promise(() => {}), // 永不 resolve：回调驱动
    controls: ctrl.api,
    onEvent: (type) => events.push(type),
  });
  const pending = session.request(AD_BREAKS.MATCH_END);
  assert.equal(session.adStarted(), true);
  assert.equal(session.adStarted(), false);       // 重复开始
  assert.equal(ctrl.s.pauseCalls, 1);
  assert.equal(session.noFill(), false);          // 播放中迟到无填充
  assert.equal(session.adEnded(), true);
  assert.equal(session.adEnded(), false);         // 重复结束
  assert.equal(session.adFailed('late'), false);  // 结束后迟到失败
  assert.equal(ctrl.simPaused, false);
  assert.equal(ctrl.s.muted, false);
  assert.equal(events.filter((e) => e === PLATFORM_EVENTS.AD_COMPLETE).length, 1);
  assert.equal(events.filter((e) => e === PLATFORM_EVENTS.AD_ERROR).length, 0);
  assert.equal((await pending).status, AD_STATUS.PLAYED);
});

test('重复请求去重：进行中再次请求复用同一会话，不重复触发平台', async () => {
  const ctrl = makeControls();
  let calls = 0;
  let release;
  const session = new AdSession({
    requestAd: () => { calls++; return new Promise((r) => { release = r; }); },
    controls: ctrl.api,
  });
  const p1 = session.request(AD_BREAKS.MATCH_END);
  const p2 = session.request(AD_BREAKS.MATCH_END); // 重复请求
  assert.equal(calls, 1);
  assert.equal(p2, p1); // 同一 Promise，不产生第二条广告流
  session.adStarted();
  release(AD_STATUS.OK);
  session.adEnded();
  assert.equal((await p1).status, AD_STATUS.PLAYED);
  assert.equal(ctrl.s.pauseCalls, 1);
});

test('播放中失败：先恢复暂停与静音，再按错误收口', async () => {
  const ctrl = makeControls();
  const session = new AdSession({ requestAd: () => new Promise(() => {}), controls: ctrl.api });
  const pending = session.request(AD_BREAKS.MATCH_END);
  session.adStarted();
  assert.equal(ctrl.simPaused, true);
  session.adFailed('network-drop');
  assert.equal(session.state, 'idle');
  assert.equal(ctrl.simPaused, false);
  assert.equal(ctrl.s.muted, false);
  const result = await pending;
  assert.equal(result.status, AD_STATUS.ERROR);
  assert.equal(result.wasUserPaused, false);
});

test('非法断点：不调用平台，按错误收口', async () => {
  const ctrl = makeControls();
  let calls = 0;
  const session = new AdSession({
    requestAd: () => { calls++; return Promise.resolve(AD_STATUS.OK); },
    controls: ctrl.api,
  });
  const result = await session.request('mid-combat');
  assert.equal(calls, 0); // 交战期间绝不请求广告
  assert.equal(result.status, AD_STATUS.ERROR);
  assert.equal(result.reason, 'invalid-break');
  assert.equal(ctrl.simPaused, false);
});

test('无平台能力：requestAd 缺失按不可用收口', async () => {
  const ctrl = makeControls();
  const session = new AdSession({ controls: ctrl.api });
  const result = await session.request(AD_BREAKS.MATCH_END);
  assert.equal(result.status, AD_STATUS.UNAVAILABLE);
  assert.equal(ctrl.simPaused, false);
});
