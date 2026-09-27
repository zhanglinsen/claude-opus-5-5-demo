/**
 * 离线平台适配器（US-03/US-05）：零网络、零 window 依赖，可在 Node 直接构造。
 * 离线单文件 HTML 与无 SDK 环境共用；广告一律无填充，不发任何网络请求。
 */
import { AD_STATUS, PLATFORM_EVENTS, normalizeLanguage, validateAdapter, createEmitter } from './contract.js';

export class OfflinePlatformAdapter {
  /** options: { language? } —— 覆盖离线默认语言（经归一化与回退） */
  constructor(options = {}) {
    this.id = 'offline';
    // 离线默认中文（US-02）
    this._language = normalizeLanguage(options.language, 'zh-cn');
    this._bus = createEmitter();
    this._ready = false;
  }

  get language() { return this._language; }

  /** 幂等初始化：无需 SDK，就绪即发 READY；重复调用不重复发事件。 */
  async init() {
    if (this._ready) return true;
    this._ready = true;
    this._bus.emit(PLATFORM_EVENTS.READY, { id: this.id, language: this._language });
    return true;
  }

  /** 离线版永不播广告：不发网络请求，任何自然断点直接无填充收口。 */
  async requestAd(_breakpoint) {
    return AD_STATUS.NO_FILL;
  }

  on(event, handler) { return this._bus.on(event, handler); }
  off(event, handler) { this._bus.off(event, handler); }

  /** 合同自检（与 Y8/GM 适配器同一入口）。 */
  validate() { return validateAdapter(this); }
}
