/**
 * 广告会话（US-03）：把平台 SDK 的原始回调收口为统一生命周期，
 * 区分"请求 → SDK 接手 → 实际开始 → 结束/失败/无填充"，并过滤同步、迟到与重复回调。
 * 任何游戏可复用：断点集（F1）、看门狗（F6）均可配置，不绑定本游戏的模式/地图/音频。
 *
 * 状态机：idle → requested → (handshake) → playing → idle
 *   - request(breakpoint)：仅在配置的自然断点；进行中的请求去重（复用同一 Promise）。
 *   - handshake：requestAd 已 resolve('ok')（SDK 接手机会）但 beforeAd 尚未到达（F4）。
 *     等待真实开始信号或握手超时（默认 8s）；超时视为机会消耗、无播放收口。
 *     超时后 SDK 仍迟到开始真实播放的，仍施加暂停/静音（迟到窗口）——
 *     最高优先级是"真实播放必暂停静音、游戏不挂起"。
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
 * controls 抛错被逐个隔离（F3）：暂停/静音仍成对施加与清除，Promise 绝不挂起。
 *
 * 回调接线（F5）：requestAd(breakpoint, callbacks) 的第二参是请求作用域句柄
 *   { epoch, started(), ended(), failed(reason), noFill() }，新请求开始后失效；
 *   握手超时收口（Promise 已结算）不使句柄失效——迟到窗口内的真实开始/结束仍
 *   作用于同一请求（F4：真实播放必暂停静音，结束/看门狗/销毁必恢复）；
 *   兼容公开 API session.adStarted() 等继续可用（作用于当前活动请求）。
 *
 * 看门狗（F6，默认开启）：handshakeMs（默认 8000）覆盖 SDK 接手后从不回调 beforeAd 的行为；
 *   playingMs（默认 60000，覆盖最长贴片时长）覆盖 SDK 播放后从不回调 afterAd/SDK_GAME_START
 *   的行为——到点恢复暂停静音并按 PLAYED(watchdog) 收口，游戏绝不永久挂起。
 *   watchdog:false 关闭（兼容旧行为：resolve('ok') 且无开始信号立即按无播放收口，
 *   迟到的真实播放仍会被暂停——宁误暂停不漏暂停）。
 *
 * requestAd 约定（contract.js）：resolve 'ok' | 'no-fill' | 'error'，或 reject。
 * 最终 Promise：{ status, wasUserPaused?, started?, reason?, watchdog? }。
 */
import { AD_STATUS, PLATFORM_EVENTS, createBreakPolicy, createEmitter } from './contract.js';

const STATE = { IDLE: 'idle', REQUESTED: 'requested', HANDSHAKE: 'handshake', PLAYING: 'playing', CLOSED: 'closed' };

const DEFAULT_WATCHDOG = Object.freeze({ handshakeMs: 8000, playingMs: 60000 });

/** F3：controls/平台质量不可控，逐个调用隔离异常，不得中断生命周期或挂起 Promise。 */
function safeCall(fn, ...args) {
  if (typeof fn !== 'function') return undefined;
  try { return fn(...args); } catch (_) { return undefined; }
}

function pickMs(v, def) {
  return typeof v === 'number' && v >= 0 ? v : def;
}

export class AdSession {
  /** options: { requestAd?, controls?, onEvent?, breaks?, watchdog? } */
  constructor({ requestAd = null, controls = {}, onEvent = null, breaks = null, watchdog } = {}) {
    this._requestAd = typeof requestAd === 'function' ? requestAd : null;
    this._controls = controls || {};
    this._onEvent = typeof onEvent === 'function' ? onEvent : null;
    this._bus = createEmitter();
    this._isBreak = createBreakPolicy(breaks); // F1：断点策略注入，默认保持原两点
    const w = watchdog === undefined || watchdog === null || watchdog === true
      ? DEFAULT_WATCHDOG
      : (watchdog === false ? null : watchdog);
    this._watchdogOn = !!w;
    this._handshakeMs = w ? pickMs(w.handshakeMs, DEFAULT_WATCHDOG.handshakeMs) : 0;
    this._playingMs = w ? pickMs(w.playingMs, DEFAULT_WATCHDOG.playingMs) : 0;
    this._state = STATE.IDLE;
    this._pending = null;         // { id, deferred, callbacks, done }
    this._epoch = 0;              // F5：请求代次，旧请求句柄随之失效
    this._adPaused = false;       // 本会话是否已施加广告暂停（enterAdPause 的对账）
    this._wasUserPaused = false;
    this._lateStartUntil = null;  // F4：握手超时后仍接受真实开始的窗口
    this._timer = null;
  }

  get state() { return this._state; }
  get active() { return this._state !== STATE.IDLE && this._state !== STATE.CLOSED; }

  /** 订阅状态事件（除 onEvent 外的补充订阅口），返回退订函数。 */
  on(event, handler) { return this._bus.on(event, handler); }
  off(event, handler) { this._bus.off(event, handler); }

  /**
   * 在自然断点请求广告。进行中的请求去重：返回同一 Promise，不重复触发平台调用。
   * Promise 以最终状态收口：{ status, wasUserPaused?, started?, reason?, watchdog? }。
   */
  request(breakpoint) {
    if (this._state === STATE.CLOSED) {
      return Promise.resolve({ status: AD_STATUS.ERROR, reason: 'destroyed' });
    }
    if (this._state !== STATE.IDLE) {
      if (this._pending && !this._pending.done) return this._pending.deferred.promise;
      return Promise.resolve({ status: AD_STATUS.ERROR, reason: 'busy' }); // 迟到播放进行中
    }
    if (!this._isBreak(breakpoint)) {
      // 交战期间/页面加载等非法断点：直接拒绝，绝不调用平台
      this._emit(PLATFORM_EVENTS.AD_ERROR, { reason: 'invalid-break', breakpoint });
      return Promise.resolve({ status: AD_STATUS.ERROR, reason: 'invalid-break' });
    }
    if (!this._requestAd) {
      this._emit(PLATFORM_EVENTS.AD_ERROR, { reason: 'unavailable', breakpoint });
      return Promise.resolve({ status: AD_STATUS.UNAVAILABLE, reason: 'unavailable' });
    }
    const entry = this._pending = { id: ++this._epoch, deferred: makeDeferred(), callbacks: null, done: false };
    // F5：请求作用域回调句柄——旧请求的 SDK 回调在新请求开始后自动失效。
    entry.callbacks = {
      epoch: entry.id,
      started: () => this._started(entry),
      ended: () => this._ended(entry),
      failed: (reason) => this._failed(reason, entry),
      noFill: () => this._noFill(entry),
    };
    this._state = STATE.REQUESTED;
    this._lateStartUntil = null;
    this._emit(PLATFORM_EVENTS.AD_REQUEST, { breakpoint });
    let result;
    try {
      result = this._requestAd(breakpoint, entry.callbacks); // 平台可能同步回调 started/ended
    } catch (e) {
      this._failed(reasonOf(e), entry);
      return entry.deferred.promise;
    }
    Promise.resolve(result).then(
      (r) => this._onPlatformResolved(entry, r),
      (e) => this._failed(reasonOf(e), entry),
    );
    return entry.deferred.promise;
  }

  /** 广告实际开始（Y8 beforeAd / GM SDK_GAME_PAUSE），作用于当前活动请求。返回是否被接受。 */
  adStarted() { return this._started(this._pending); }

  /** 广告结束（Y8 afterAd / GM SDK_GAME_START），作用于当前活动请求。返回是否被接受。 */
  adEnded() { return this._ended(this._pending); }

  /** 平台错误。播放中失败等价"先结束再报错"，恢复必须先行。返回是否被接受。 */
  adFailed(reason) { return this._failed(reason, this._pending); }

  /** 无填充。绝不暂停、不触碰音频。返回是否被接受。 */
  noFill() { return this._noFill(this._pending); }

  /**
   * 销毁会话（F8）：清定时器、挂起请求按错误安全收口、播放中先恢复暂停/静音、
   * 释放全部事件监听。之后 request 按错误收口、所有回调入口失效。幂等。
   */
  close(reason = 'destroyed') {
    if (this._state === STATE.CLOSED) return false;
    this._clearTimer();
    this._lateStartUntil = null;
    const wasPlaying = this._state === STATE.PLAYING;
    const was = this._wasUserPaused;
    this._state = STATE.CLOSED;
    if (wasPlaying) this._restore(); // 挂起收口前必须先撤销已施加的暂停/静音
    this._emit(PLATFORM_EVENTS.AD_ERROR, { reason, afterStart: wasPlaying });
    this._resolvePending(wasPlaying
      ? { status: AD_STATUS.ERROR, reason, wasUserPaused: was }
      : { status: AD_STATUS.ERROR, reason });
    this._onEvent = null;
    this._bus = createEmitter(); // 释放全部监听
    return true;
  }

  /** close 的别名：插件宿主语义。 */
  destroy() { return this.close('destroyed'); }

  // -------------------------------------------------------------------------
  _onPlatformResolved(entry, raw) {
    if (entry.done || entry !== this._pending) return; // 回调已收口：迟到 resolve 忽略
    if (raw === AD_STATUS.NO_FILL) return void this._noFill(entry);
    if (raw === AD_STATUS.OK) {
      if (this._state === STATE.PLAYING) return; // 等 adEnded 收口
      if (this._state === STATE.HANDSHAKE) return;
      // F4：SDK 接手了机会但尚未真实播放 → 握手等待，等 beforeAd 或握手超时收口
      this._state = STATE.HANDSHAKE;
      this._armHandshake();
      return;
    }
    this._failed(typeof raw === 'string' ? raw : 'error', entry);
  }

  _started(entry) {
    if (!entry || entry !== this._pending) return false; // 旧请求句柄失效（F5）
    if (this._state === STATE.PLAYING) return false;                    // 重复开始
    if (this._state === STATE.REQUESTED || this._state === STATE.HANDSHAKE) {
      return this._beginPlayback();
    }
    if (this._state === STATE.IDLE) {
      // F4：握手超时已按无播放结算的请求（entry.done）迟到真实开始，仍必暂停静音。
      // 有看门狗时仅限迟到窗口内；看门狗关闭时永远接受——宁误暂停，不漏暂停。
      // 其余 IDLE（正常收口后，_lateStartUntil 为 null）照旧拒绝。
      const dl = this._lateStartUntil;
      if (this._watchdogOn ? (dl !== null && Date.now() <= dl) : true) {
        return this._beginPlayback();
      }
    }
    return false;
  }

  _ended(entry) {
    if (!entry || entry !== this._pending) return false; // 旧请求句柄失效（F5）
    // 无开始不得误恢复；重复结束忽略。迟到播放（Promise 已结算）同样在此恢复。
    if (this._state !== STATE.PLAYING) return false;
    this._clearTimer();
    this._state = STATE.IDLE;
    this._restore();
    const was = this._wasUserPaused;
    this._emit(PLATFORM_EVENTS.AD_COMPLETE, { wasUserPaused: was });
    // 已结算的 Promise 不得二次结算：_resolvePending 对 done 条目是空操作。
    this._resolvePending({ status: AD_STATUS.PLAYED, wasUserPaused: was, started: true });
    return true;
  }

  _failed(reason, entry) {
    if (!entry || entry !== this._pending) return false; // 旧请求句柄失效（F5）
    // 结束后/旧收口的迟到失败由下方状态检查拒绝；迟到播放失败仍须先恢复。
    if (this._state === STATE.PLAYING) {
      this._clearTimer();
      this._state = STATE.IDLE;
      this._restore();
      this._emit(PLATFORM_EVENTS.AD_ERROR, { reason, afterStart: true });
      this._resolvePending({ status: AD_STATUS.ERROR, wasUserPaused: this._wasUserPaused, reason });
      return true;
    }
    if (this._state !== STATE.REQUESTED && this._state !== STATE.HANDSHAKE) return false;
    this._clearTimer();
    this._state = STATE.IDLE;
    this._emit(PLATFORM_EVENTS.AD_ERROR, { reason });
    this._resolvePending({ status: AD_STATUS.ERROR, reason });
    return true;
  }

  _noFill(entry) {
    if (!entry || entry !== this._pending || entry.done) return false;
    if (this._state !== STATE.REQUESTED && this._state !== STATE.HANDSHAKE) return false; // 与播放互斥；迟到无填充忽略
    this._clearTimer();
    this._state = STATE.IDLE;
    this._emit(PLATFORM_EVENTS.AD_NO_FILL, {});
    this._resolvePending({ status: AD_STATUS.NO_FILL });
    return true;
  }

  _beginPlayback() {
    this._clearTimer();
    this._state = STATE.PLAYING;
    this._wasUserPaused = !!safeCall(this._controls.isUserPaused);
    this._adPaused = true; // 先记账再施加：即使 controls 抛错，_restore 仍会成对清除（F3）
    safeCall(this._controls.enterAdPause);
    safeCall(this._controls.setAdMuted, true);
    this._emit(PLATFORM_EVENTS.AD_START, { wasUserPaused: this._wasUserPaused });
    this._armPlaying(); // F6：SDK 播放后从不回调结束信号时兜底恢复
    return true;
  }

  _armHandshake() {
    if (this._handshakeMs > 0) {
      this._armTimer(this._handshakeMs, () => this._concludeHandshakeTimeout());
    } else {
      this._concludeHandshakeTimeout(); // watchdog:false：立即按旧语义收口，绝不挂起
    }
  }

  _concludeHandshakeTimeout() {
    if (this._state !== STATE.HANDSHAKE || !this._pending || this._pending.done) return;
    this._state = STATE.IDLE;
    this._emit(PLATFORM_EVENTS.AD_COMPLETE, { started: false, reason: 'handshake-timeout' });
    this._resolvePending({ status: AD_STATUS.PLAYED, started: false });
    // F4：此后 SDK 仍可能迟到开始真实播放——保留迟到窗口，保证必暂停静音
    this._lateStartUntil = this._playingMs > 0 ? Date.now() + this._playingMs : Infinity;
  }

  _concludePlayingWatchdog() {
    // 迟到播放（Promise 已结算）也必须兜底恢复；_resolvePending 对 done 条目空操作。
    if (this._state !== STATE.PLAYING || !this._pending) return;
    this._state = STATE.IDLE;
    this._restore();
    const was = this._wasUserPaused;
    this._emit(PLATFORM_EVENTS.AD_COMPLETE, { wasUserPaused: was, reason: 'watchdog-timeout' });
    this._resolvePending({ status: AD_STATUS.PLAYED, wasUserPaused: was, started: true, watchdog: true });
  }

  _armPlaying() {
    if (this._playingMs > 0) this._armTimer(this._playingMs, () => this._concludePlayingWatchdog());
  }

  // 成对恢复：清除广告暂停原因（玩家自身暂停由游戏侧独立保留），并撤销临时静音。
  // F3：两项各自隔离异常，无论 enter/exit 哪个抛错，另一项都会执行。
  // setAdMuted 只作用于临时层，settings 持久层经 controls 不可达，玩家已存音量不可能被污染。
  _restore() {
    if (!this._adPaused) return;
    this._adPaused = false;
    safeCall(this._controls.exitAdPause, this._wasUserPaused);
    safeCall(this._controls.setAdMuted, false);
  }

  _resolvePending(result) {
    const entry = this._pending;
    if (entry && !entry.done) {
      entry.done = true;
      entry.deferred.resolve(result);
    }
  }

  _armTimer(ms, fn) {
    this._clearTimer();
    const t = setTimeout(() => { this._timer = null; fn(); }, ms);
    if (typeof t.unref === 'function') t.unref(); // 不阻止 Node 进程退出
    this._timer = t;
  }

  _clearTimer() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
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
