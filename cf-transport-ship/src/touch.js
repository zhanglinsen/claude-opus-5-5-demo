// 触屏控制：左侧浮动摇杆移动，右侧滑动视角，按钮开火/跳/蹲/换弹/切枪/开镜。
// 新增按钮、生命周期、横屏引导、全屏由 src/mobile/* 模块经统一挂接入口提供；
// 本类向它们暴露公开 API（契约见 .ultra/mobile-adaptation/dispatch/contract.md §2）。
// 桌面路径：enabled 为假时在构造早返回，不访问任何 DOM，不注册任何监听。
import { CATALOGS } from './i18n/catalogs.js';
import { attachMobile } from './mobile/index.js';
import { computeLayout, padZoneWidth } from './mobile/layout.js';

// 无语言服务时的中文兜底（与 CATALOGS.zh 的 touch.* 同源，缺键回落键名）
const zhLabel = (key) => (CATALOGS.zh && CATALOGS.zh[key]) || key;

const px = (v) => (v == null ? '' : v + 'px');
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const PAD_MAX = 60; // 摇杆最大偏移（CSS px），与旧实现一致
const KNOB = 56; // 摇杆头边长
const LOOK_GAIN = 1.6; // 视角增益；player.js 仍会再乘 game.opts.sens

export class TouchControls {
  constructor(game) {
    this.g = game;
    this._labeled = []; // 可本地化按钮：[{ el, key }]，C4/E/G/R 为语言无关符号不进此表
    this.locale = null;
    this._unsubLocale = null;
    this.enabled = matchMedia('(pointer:coarse)').matches || new URLSearchParams(location.search).has('touch');
    if (!this.enabled) return;
    // ---- 以下仅触屏模式执行 ----
    this._labeledExtra = []; // 模块经 addButton({ labelKey }) 登记的本地化按钮；不进 _labeled（touch-i18n 测试对其做完整 deepEqual）
    this._placed = new Map(); // act -> 按钮元素，重排时按 layout.items[act] 定位
    this._held = new Set(); // 当前被按住的按钮的释放函数
    this._layoutSubs = new Set();
    this._layoutPending = false;
    this._padId = null; this._lookId = null; this._origin = null; this._look = null;
    this._detachMobile = null;
    this._probe = null;
    this.layout = null;
    const root = this.root = document.getElementById('touch');
    root.classList.remove('hidden');
    // 供 CSS 作用域（style.css 的 mobile 块一律以 html.is-touch 开头）
    const de = document.documentElement;
    if (de && de.classList && de.classList.add) de.classList.add('is-touch');
    const pad = this._pad = document.createElement('div'); pad.className = 'pad';
    const knob = this._knob = document.createElement('div'); knob.className = 'pad';
    Object.assign(knob.style, { width: KNOB + 'px', height: KNOB + 'px', background: 'rgba(255,255,255,.25)', pointerEvents: 'none' });
    root.append(pad, knob);

    const P = () => this.player();
    const fireDown = () => { const p = P(); if (p) { p.touch.fire = true; p.touch.firePressed = true; if (p.mouse) p.mouse.lp = true; } };
    const fireUp = () => { const p = P(); if (p) p.touch.fire = false; };
    // 走 touch.* 稳定键的可本地化按钮：构造期即按当前语言取词，切换时由 applyLocale 原地改文本
    this._addLabeled({ act: 'fire', labelKey: 'touch.fire', down: fireDown, up: fireUp });
    this._addLabeled({ act: 'fire2', labelKey: 'touch.fire', down: fireDown, up: fireUp });
    this._addLabeled({ act: 'jump', labelKey: 'touch.jump', down: () => { const p = P(); if (p) p.touch.jump = true; } });
    this._addLabeled({ act: 'crouch', labelKey: 'touch.crouch', down: () => { const p = P(); if (p) p.touch.crouch = !p.touch.crouch; } });
    this.addButton({ act: 'reload', label: 'R', down: () => { const p = P(); if (p) p.pressed.add('KeyR'); } });
    this._addLabeled({ act: 'swap', labelKey: 'touch.swap', down: () => { const p = P(); if (p) p.pressed.add('KeyQ'); } });
    // 镜像右键：按下开镜（步枪）/ 按住重击（刀），抬起或被打断即释放
    this._addLabeled({
      act: 'scope',
      labelKey: 'touch.scope',
      down: () => { const p = P(); if (p && p.mouse) { p.mouse.r = true; p.mouse.rp = true; } },
      up: () => { const p = P(); if (p && p.mouse) p.mouse.r = false; },
    });
    // 爆破目标交互：C4（5号槽）/ E 拆包拾取（按住）/ G 丢C4；仅爆破模式由 HUD 控制显示
    this.objBtns = [];
    const objBtn = (spec) => { const b = this.addButton({ ...spec, hidden: true }); this.objBtns.push(b); return b; };
    objBtn({ act: 'c4', label: 'C4', down: () => { const p = P(); if (p) p.pressed.add('Digit5'); } });
    objBtn({
      act: 'e',
      label: 'E',
      down: () => { const p = P(); if (p) { p.pressed.add('KeyE'); p.keys.add('KeyE'); } },
      up: () => { const p = P(); if (p) p.keys.delete('KeyE'); },
    });
    objBtn({ act: 'g', label: 'G', down: () => { const p = P(); if (p) p.pressed.add('KeyG'); } });

    // 摇杆 / 视角。监听在 window 上；按钮自己 stopPropagation，不会进入这里。
    // 画布上的触摸必须 preventDefault：否则浏览器会对快速点按合成 mousedown，经 player.js 的 mousedown 误开火（E14）。
    // 只拦画布（#c）：不能拦 .screen 内的触摸，否则会吞掉暂停/大厅按钮的 click。
    const guard = (e) => { const t = e.target; if (t && t.id === 'c' && e.cancelable !== false && e.preventDefault) e.preventDefault(); };
    window.addEventListener('touchstart', (e) => { guard(e); this._touchStart(e); }, { passive: false });
    window.addEventListener('touchmove', (e) => this._touchMove(e), { passive: true });
    window.addEventListener('touchend', (e) => { guard(e); this._touchEnd(e); }, { passive: false });
    window.addEventListener('touchcancel', (e) => this._touchEnd(e));

    // 失焦/旋转/缩放：清输入、重排；iOS 的 gesturestart 是捏合缩放，直接拦掉
    window.addEventListener('blur', () => this.resetTouchState());
    window.addEventListener('orientationchange', () => { this.resetTouchState(); this._scheduleLayout(); });
    window.addEventListener('resize', () => this._scheduleLayout());
    if (window.visualViewport && window.visualViewport.addEventListener) {
      window.visualViewport.addEventListener('resize', () => this._scheduleLayout());
    }
    window.addEventListener('gesturestart', (e) => { if (e.preventDefault) e.preventDefault(); }, { passive: false });

    this.applyLayout();
    // 其它移动端模块（菜单、生命周期、横屏引导、全屏）在按钮与布局就绪后挂接
    this._detachMobile = attachMobile(this.g, this);
    // 与 HUD 同源接线：game 构造时已挂 game.locale（HUD 用的那个 LocaleService）则自动接上；
    // 未挂时保持中文兜底，集成者可事后 setLocaleService 补接（见下）。
    if (this.g && this.g.locale) this.setLocaleService(this.g.locale);
  }

  // ---------------- 契约 API（.ultra/mobile-adaptation/dispatch/contract.md §2）----------------

  player() { return (this.g && this.g.player) || null; }

  // 广告暂停（adPaused）只停循环、不置 paused（game.js enterAdPause）：期间注入的键会在广告结束后的第一帧补触发，
  // 所以“对局中”必须排除它，触屏输入才不会穿透到已冻结的对局
  isPlaying() { const g = this.g; return !!(g && g.playing && !g.paused && !g.ended && !g.adPaused); }

  // 唯一的暂停入口：广告暂停期间不覆盖；执行时先清触屏状态，避免恢复后“按住”状态残留
  requestPause(reason) {
    const g = this.g;
    if (!(g && g.playing && !g.paused && !g.ended && !g.adPaused)) return false;
    this.lastPauseReason = reason;
    this.resetTouchState();
    g.pause();
    return true;
  }

  // 清零全部触屏输入：释放被按住的按钮（会走各自的 up/cancel）、清 touch.*、touchLook、鼠标右键镜像，复位摇杆
  resetTouchState() {
    if (this._held) for (const release of [...this._held]) release();
    const p = this.player();
    if (p) {
      const t = p.touch;
      if (t) { t.fire = false; t.firePressed = false; t.jump = false; t.crouch = false; t.mx = 0; t.mz = 0; }
      if (p.touchLook) { p.touchLook.x = 0; p.touchLook.y = 0; }
      // lp/rp 由开火/“镜”按下时置位、每帧末才被消费；暂停期间循环停止无人消费，不清会在恢复后“走火一发”或误开镜
      if (p.mouse) { p.mouse.r = false; p.mouse.lp = false; p.mouse.rp = false; }
    }
    this._padId = null; this._lookId = null; this._origin = null; this._look = null;
    if (this.layout) this._placePad(this.layout.items.pad);
  }

  // 位置由 layout.items[spec.act] 决定；label 为固定文本，labelKey 为本地化键（登记进 _labeledExtra）
  addButton(spec) {
    const b = document.createElement('div');
    b.className = 'btn';
    if (spec.label != null) b.textContent = spec.label;
    else if (spec.labelKey) { b.textContent = this.labelText(spec.labelKey); this._labeledExtra.push({ el: b, key: spec.labelKey }); }
    if (b.dataset) b.dataset.act = spec.act; else if (b.setAttribute) b.setAttribute('data-act', spec.act);
    if (spec.hidden) b.style.display = 'none';
    let held = false;
    const finish = (fn) => { if (!held) return; held = false; this._held.delete(release); if (fn) fn(); };
    const release = () => finish(spec.cancel || spec.up);
    b.addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (held) return;
      held = true; this._held.add(release);
      if (spec.down) spec.down();
    }, { passive: false });
    b.addEventListener('touchend', (e) => { e.preventDefault(); finish(spec.up); }, { passive: false });
    b.addEventListener('touchcancel', (e) => { e.preventDefault(); finish(spec.cancel || spec.up); }, { passive: false });
    this.root.appendChild(b);
    this._placed.set(spec.act, b);
    if (this.layout) this._place(b, this.layout.items[spec.act]);
    return b;
  }

  // 订阅重排；返回退订函数
  onLayout(fn) { this._layoutSubs.add(fn); return () => this._layoutSubs.delete(fn); }

  // ---------------- 布局 ----------------

  applyLayout() {
    const layout = computeLayout(window.innerWidth, window.innerHeight, this._safeInsets());
    this.layout = layout;
    for (const [act, el] of this._placed) this._place(el, layout.items[act]);
    if (this._padId === null) this._placePad(layout.items.pad); // 摇杆正被使用时不动它
    for (const fn of [...this._layoutSubs]) {
      try { fn(layout); } catch (e) { /* 订阅者异常不影响布局 */ }
    }
  }

  // 合并同一帧内的多次 resize/orientationchange/visualViewport；无 rAF 的环境（单测）直接执行
  _scheduleLayout() {
    if (this._destroyed || this._layoutPending) return; // destroy 之后不再重排（window 监听随页面存活，但不该再碰已卸载的元素）
    this._layoutPending = true;
    const run = () => { this._layoutPending = false; if (!this._destroyed) this.applyLayout(); };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run); else run();
  }

  // 安全区：用探针元素解析 env(safe-area-inset-*)；没有 viewport-fit=cover 时它们为 0。任何环节不可用都退回 0。
  _safeInsets() {
    try {
      if (typeof getComputedStyle !== 'function' || !document.body || !document.createElement) return null;
      if (!this._probe) {
        const probe = document.createElement('div');
        probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;'
          + 'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
        document.body.appendChild(probe);
        this._probe = probe;
      }
      const cs = getComputedStyle(this._probe);
      const n = (v) => parseFloat(v) || 0;
      return { top: n(cs.paddingTop), right: n(cs.paddingRight), bottom: n(cs.paddingBottom), left: n(cs.paddingLeft) };
    } catch (e) {
      return null;
    }
  }

  // 应用锚点：每个方向只设一个锚点，另一侧清空，避免旋转后残留旧锚点
  _place(el, it) {
    if (!it) return;
    Object.assign(el.style, {
      left: px(it.left), right: px(it.right), top: px(it.top), bottom: px(it.bottom),
      width: it.size + 'px', height: it.size + 'px',
    });
  }

  _setKnob(cx, cy) {
    Object.assign(this._knob.style, { left: px(cx - KNOB / 2), top: px(cy - KNOB / 2), right: '', bottom: '' });
  }

  _placePad(item) {
    if (!item || !this._pad) return;
    this._place(this._pad, item);
    this._setKnob(item.x + item.w / 2, item.y + item.h / 2);
  }

  // 浮动摇杆：底座跟随按下点（夹在视口内），摇杆位移始终以按下点为原点
  _floatPad(x, y) {
    const item = this.layout && this.layout.items.pad;
    const r = item ? item.size / 2 : 70;
    const cx = clamp(x, r, Math.max(r, window.innerWidth - r));
    const cy = clamp(y, r, Math.max(r, window.innerHeight - r));
    Object.assign(this._pad.style, { left: px(cx - r), top: px(cy - r), right: '', bottom: '' });
    this._base = { cx, cy };
    this._setKnob(cx, cy);
  }

  // ---------------- 触摸处理 ----------------

  _touchStart(e) {
    if (!this.isPlaying()) return; // 大厅/暂停/结算界面的触摸不驱动摇杆与视角
    const tgt = e.target;
    if (tgt && typeof tgt.closest === 'function' && tgt.closest('.screen')) return;
    for (const t of e.changedTouches) {
      if (t.clientX < padZoneWidth(window.innerWidth) && this._padId === null) {
        this._padId = t.identifier;
        this._origin = { x: t.clientX, y: t.clientY };
        this._floatPad(t.clientX, t.clientY);
      } else if (this._lookId === null) {
        this._lookId = t.identifier;
        this._look = { x: t.clientX, y: t.clientY };
      }
    }
  }

  _touchMove(e) {
    const p = this.player();
    for (const t of e.changedTouches) {
      if (t.identifier === this._padId && p) {
        let dx = t.clientX - this._origin.x, dy = t.clientY - this._origin.y;
        const L = Math.hypot(dx, dy);
        if (L > PAD_MAX) { dx *= PAD_MAX / L; dy *= PAD_MAX / L; }
        if (this._base) this._setKnob(this._base.cx + dx, this._base.cy + dy);
        p.touch.mx = dx / PAD_MAX; p.touch.mz = -dy / PAD_MAX;
      } else if (t.identifier === this._lookId && p) {
        p.touchLook = p.touchLook || { x: 0, y: 0 };
        p.touchLook.x += (t.clientX - this._look.x) * LOOK_GAIN;
        p.touchLook.y += (t.clientY - this._look.y) * LOOK_GAIN;
        this._look.x = t.clientX; this._look.y = t.clientY;
      }
    }
  }

  _touchEnd(e) {
    const p = this.player();
    for (const t of e.changedTouches) {
      if (t.identifier === this._padId) {
        this._padId = null; this._origin = null;
        if (p && p.touch) { p.touch.mx = 0; p.touch.mz = 0; }
        if (this.layout) this._placePad(this.layout.items.pad);
      }
      if (t.identifier === this._lookId) { this._lookId = null; this._look = null; }
    }
  }

  // ---------------- 本地化 ----------------

  // 走 touch.* 稳定键并登记进 _labeled（保持既有 6 个按钮的顺序，touch-i18n 测试依赖它）
  _addLabeled(spec) {
    const b = this.addButton({ ...spec, label: this.labelText(spec.labelKey) });
    this._labeled.push({ el: b, key: spec.labelKey });
    return b;
  }

  // 标签取词优先级：注入的 LocaleService > game.t（无订阅能力，仅构造/applyLocale 时生效）> 中文兜底
  labelText(key) {
    if (this.locale && typeof this.locale.t === 'function') return this.locale.t(key);
    if (this.g && typeof this.g.t === 'function') return this.g.t(key);
    return zhLabel(key);
  }
  // 即时切换：原地改文本，不重建 DOM、不重绑事件
  applyLocale() {
    for (const { el, key } of this._labeled) el.textContent = this.labelText(key);
    if (this._labeledExtra) for (const { el, key } of this._labeledExtra) el.textContent = this.labelText(key);
  }
  // 注入/替换语言服务。单一集成者接线路径（HUD 的 deps.locale 同一实例）：
  //   1. game.locale = createGameLocale(...)（若走此路径，TouchControls 构造时自动接上，无需调用）；
  //   2. 否则 new TouchControls(game) 之后任意时机：touchControls.setLocaleService(locale)；
  //   3. 语言销毁前先 touchControls.destroy()（或再次 setLocaleService(newLocale) 平滑替换），
  //      订阅由本方法/destroy 成对退订，不会重复或泄漏。
  setLocaleService(locale) {
    if (this._unsubLocale) { this._unsubLocale(); this._unsubLocale = null; }
    this.locale = locale && typeof locale.t === 'function' ? locale : null;
    if (this.locale && typeof this.locale.subscribe === 'function') {
      const unsub = this.locale.subscribe(() => this.applyLocale());
      if (typeof unsub === 'function') this._unsubLocale = unsub;
    }
    this.applyLocale();
  }
  // 退订语言服务并卸载移动端模块；DOM 与 window 监听保持现状（本组件随页面存活，无 DOM 拆除需求）
  destroy() {
    this._destroyed = true;
    if (this._unsubLocale) { this._unsubLocale(); this._unsubLocale = null; }
    if (this._detachMobile) { this._detachMobile(); this._detachMobile = null; }
    if (this._probe && this._probe.remove) { this._probe.remove(); this._probe = null; } // 安全区探针元素
    this.locale = null;
  }
}
