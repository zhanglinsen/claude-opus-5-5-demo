/**
 * 广告会话（US-03）：把平台 SDK 的原始回调收口为统一生命周期，
 * 区分"请求 → 实际开始 → 结束/失败/无填充"，并过滤同步、迟到与重复回调。
 *
 * 状态机：idle → requested → playing → idle
 *   - request(breakpoint)：仅在自然断点；进行中的请求去重（复用同一 Promise）。
 *   - adStarted()：平台"广告实际开始"信号（Y8 beforeAd / GM SDK_GAME_PAUSE）。
 *     只有此信号才暂停模拟与临时静音；请求、resolve 均不触碰游戏。
 *   - adEnded()：平台"广告结束"信号（Y8 afterAd / GM SDK_GAME_START）。
 *   - adFailed(reason) / noFill()：失败与无填充，绝不暂停。
 *
 * 暂停与音频全部经 controls 依赖注入（本模块绝不 import game.js / audio.js）：
 *   isUserPaused()  : 玩家在广告前是否已暂停（用于恢复判断与事件载荷）
 *   enterAdPause()  : 暂停模拟——广告是独立暂停原因，成对、幂等，由游戏侧合并
 *   exitAdPause(wasUserPaused) : 清除广告暂停原因；若玩家此前已暂停则保持其暂停
 *   setAdMuted(on)  : 临时静音/恢复——不得写入玩家已保存音量（settings 持久层不可达）
 *
 * requestAd 约定（contract.js）：resolve 'ok' | 'no-fill' | 'error'，或 reject。
 * 'ok' 且已 adStarted → 等 adEnded 收口；'ok' 但从未开始 → 机会消耗、无播放。
 */
import { AD_STATUS, PLATFORM_EVENTS, isAdBreak, createEmitter } from './contract.js';

const STATE = { IDLE: 'idle', REQUESTED: 'requested', PLAYING: 'playing' };

export class AdSession {
  /** options: { requestAd?, controls?, onEvent? } */
  constructor({ requestAd = null, controls = {}, onEvent = null } = {}) {
    this._requestAd = typeof requestAd === 'function' ? requestAd : null;
    this._controls = controls || {};
    this._onEvent = typeof onEvent === 'function' ? onEvent : null;
    this._bus = createEmitter();
    this._state = STATE.IDLE;
    this._pending = null;      // { resolve, done }
    this._adPaused = false;    // 本会话是否已施加广告暂停（enterAdPause 的对账）
    this._wasUserPaused = false;
  }

  get state() { return this._state; }
  get active() { return this._state !== STATE.IDLE; }

  /** 订阅状态事件（除 onEvent 外的补充订阅口），返回退订函数。 */
  on(event, handler) { return this._bus.on(event, handler); }
  off(event, handler) { this._bus.off(event, handler); }

  /**
   * 在自然断点请求广告。进行中的请求去重：返回同一 Promise，不重复触发平台调用。
   * Promise 以最终状态收口：{ status, wasUserPaused?, started?, reason? }。
   */
  request(breakpoint) {
    if (this._state !== STATE.IDLE) {
      return this._pending ? this._pending.promise
        : Promise.resolve({ status: AD_STATUS.PLAYED, started: true });
    }
    if (!isAdBreak(breakpoint)) {
      // 交战期间/页面加载等非法断点：直接拒绝，绝不调用平台
      this._emit(PLATFORM_EVENTS.AD_ERROR, { reason: 'invalid-break', breakpoint });
      return Promise.resolve({ status: AD_STATUS.ERROR, reason: 'invalid-break' });
    }
    if (!this._requestAd) {
      this._emit(PLATFORM_EVENTS.AD_ERROR, { reason: 'unavailable', breakpoint });
      return Promise.resolve({ status: AD_STATUS.UNAVAILABLE, reason: 'unavailable' });
    }
    const entry = this._pending = makeDeferred();
    this._state = STATE.REQUESTED;
    this._emit(PLATFORM_EVENTS.AD_REQUEST, { breakpoint });
    let result;
    try {
      result = this._requestAd(breakpoint); // 平台可能同步回调 adStarted/adEnded
    } catch (e) {
      this._adFailed(reasonOf(e));
      return entry.promise;
    }
    Promise.resolve(result).then(
      (r) => this._onPlatformResolved(entry, r),
      (e) => { if (!entry.done) this._adFailed(reasonOf(e)); },
    );
    return entry.promise;
  }

  /** 广告实际开始（Y8 beforeAd / GM SDK_GAME_PAUSE）。返回是否被接受。 */
  adStarted() {
    if (this._state !== STATE.REQUESTED) return false; // 迟到/重复开始
    this._state = STATE.PLAYING;
    const c = this._controls;
    this._wasUserPaused = typeof c.isUserPaused === 'function' ? !!c.isUserPaused() : false;
    this._adPaused = true;
    if (typeof c.enterAdPause === 'function') c.enterAdPause();
    if (typeof c.setAdMuted === 'function') c.setAdMuted(true);
    this._emit(PLATFORM_EVENTS.AD_START, { wasUserPaused: this._wasUserPaused });
    return true;
  }

  /** 广告结束（Y8 afterAd / GM SDK_GAME_START）。返回是否被接受。 */
  adEnded() {
    if (this._state !== STATE.PLAYING) return false; // 无开始不得误恢复；重复结束忽略
    this._state = STATE.IDLE;
    this._restore();
    const was = this._wasUserPaused;
    this._emit(PLATFORM_EVENTS.AD_COMPLETE, { wasUserPaused: was });
    this._resolvePending({ status: AD_STATUS.PLAYED, wasUserPaused: was });
    return true;
  }

  /** 平台错误。播放中失败等价"先结束再报错"，恢复必须先行。返回是否被接受。 */
  adFailed(reason) { return this._adFailed(reason); }

  /** 无填充。绝不暂停、不触碰音频。返回是否被接受。 */
  noFill() {
    if (this._state !== STATE.REQUESTED) return false; // 与播放互斥；迟到无填充忽略
    this._state = STATE.IDLE;
    this._emit(PLATFORM_EVENTS.AD_NO_FILL, {});
    this._resolvePending({ status: AD_STATUS.NO_FILL });
    return true;
  }

  // -------------------------------------------------------------------------
  _onPlatformResolved(entry, raw) {
    if (entry.done || entry !== this._pending) return; // 回调已收口：迟到 resolve 忽略
    if (raw === AD_STATUS.NO_FILL) return void this.noFill();
    if (raw === AD_STATUS.OK) {
      if (this._state === STATE.PLAYING) return; // 等 adEnded 收口
      // 平台接手了机会但未给出开始信号：无播放、无暂停
      this._state = STATE.IDLE;
      this._emit(PLATFORM_EVENTS.AD_COMPLETE, { started: false });
      this._resolvePending({ status: AD_STATUS.PLAYED, started: false });
      return;
    }
    this._adFailed(typeof raw === 'string' ? raw : 'error');
  }

  _adFailed(reason) {
    const was = this._wasUserPaused;
    if (this._state === STATE.PLAYING) {
      this._state = STATE.IDLE;
      this._restore();
      this._emit(PLATFORM_EVENTS.AD_ERROR, { reason, afterStart: true });
      this._resolvePending({ status: AD_STATUS.ERROR, wasUserPaused: was });
      return true;
    }
    if (this._state !== STATE.REQUESTED) return false; // 结束后的迟到失败
    this._state = STATE.IDLE;
    this._emit(PLATFORM_EVENTS.AD_ERROR, { reason });
    this._resolvePending({ status: AD_STATUS.ERROR });
    return true;
  }

  // 成对恢复：清除广告暂停原因（玩家自身暂停由游戏侧独立保留），并撤销临时静音。
  // setAdMuted 只作用于临时层，settings 持久层经 controls 不可达，玩家已存音量不可能被污染。
  _restore() {
    if (!this._adPaused) return;
    this._adPaused = false;
    const c = this._controls;
    if (typeof c.exitAdPause === 'function') c.exitAdPause(this._wasUserPaused);
    if (typeof c.setAdMuted === 'function') c.setAdMuted(false);
  }

  _resolvePending(result) {
    const entry = this._pending;
    if (entry && !entry.done) {
      entry.done = true;
      entry.resolve(result);
    }
  }

  _emit(type, payload) {
    if (this._onEvent) {
      try { this._onEvent(type, payload); } catch (_) { /* 处理器异常不得中断生命周期 */ }
    }
    this._bus.emit(type, payload);
  }
}

function makeDeferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve, done: false };
}

function reasonOf(e) {
  if (e && typeof e === 'object' && typeof e.message === 'string' && e.message) return e.message;
  return typeof e === 'string' && e ? e : 'error';
}
