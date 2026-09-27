// 触屏控制：左侧虚拟摇杆移动，右侧滑动视角，按钮开火/跳/蹲/换弹/切枪/开镜
import { CATALOGS } from './i18n/catalogs.js';

// 无语言服务时的中文兜底（与 CATALOGS.zh 的 touch.* 同源，缺键回落键名）
const zhLabel = (key) => (CATALOGS.zh && CATALOGS.zh[key]) || key;

export class TouchControls {
  constructor(game) {
    this.g = game;
    this._labeled = []; // 可本地化按钮：[{ el, key }]，C4/E/G/R 为语言无关符号不进此表
    this.locale = null;
    this._unsubLocale = null;
    this.enabled = matchMedia('(pointer:coarse)').matches || new URLSearchParams(location.search).has('touch');
    if (!this.enabled) return;
    const root = document.getElementById('touch');
    root.classList.remove('hidden');
    const W = () => window.innerWidth, H = () => window.innerHeight;
    const pad = document.createElement('div'); pad.className = 'pad';
    const knob = document.createElement('div'); knob.className = 'pad';
    Object.assign(knob.style, { width: '56px', height: '56px', background: 'rgba(255,255,255,.25)', pointerEvents: 'none' });
    root.append(pad, knob);
    const place = () => {
      Object.assign(pad.style, { left: '28px', bottom: '40px', width: '140px', height: '140px' });
      Object.assign(knob.style, { left: '70px', bottom: '82px' });
    };
    place(); window.addEventListener('resize', place);
    const btn = (label, right, bottom, size, fn, up) => {
      const b = document.createElement('div'); b.className = 'btn'; b.textContent = label;
      Object.assign(b.style, { right: right + 'px', bottom: bottom + 'px', width: size + 'px', height: size + 'px' });
      b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); fn(); }, { passive: false });
      if (up) b.addEventListener('touchend', (e) => { e.preventDefault(); up(); }, { passive: false });
      root.appendChild(b); return b;
    };
    const P = () => this.g.player;
    // 走 touch.* 稳定键的可本地化按钮：构造期即按当前语言取词，切换时由 applyLocale 原地改文本
    const i18nBtn = (key, right, bottom, size, fn, up) => {
      const b = btn(this.labelText(key), right, bottom, size, fn, up);
      this._labeled.push({ el: b, key }); return b;
    };
    i18nBtn('touch.fire', 40, 150, 84, () => { const p = P(); if (p) { p.touch.fire = true; p.touch.firePressed = true; } }, () => { const p = P(); if (p) p.touch.fire = false; });
    i18nBtn('touch.fire', W() - 250, 250, 64, () => { const p = P(); if (p) { p.touch.fire = true; p.touch.firePressed = true; } }, () => { const p = P(); if (p) p.touch.fire = false; });
    i18nBtn('touch.jump', 140, 60, 60, () => { const p = P(); if (p) p.touch.jump = true; });
    i18nBtn('touch.crouch', 210, 40, 54, () => { const p = P(); if (p) p.touch.crouch = !p.touch.crouch; });
    btn('R', 40, 250, 50, () => { const p = P(); if (p) p.pressed.add('KeyR'); });
    i18nBtn('touch.swap', 100, 250, 50, () => { const p = P(); if (p) p.pressed.add('KeyQ'); });
    i18nBtn('touch.scope', 40, 60, 60, () => { const p = P(); if (p) { p.mouse.rp = true; } });
    // 爆破目标交互：C4（5号槽）/ E 拆包拾取（按住）/ G 丢C4；仅爆破模式由 HUD 控制显示
    this.objBtns = [];
    const objBtn = (label, right, bottom, size, down, up) => {
      const b = btn(label, right, bottom, size, down, up);
      b.style.display = 'none'; this.objBtns.push(b); return b;
    };
    objBtn('C4', 160, 150, 54, () => { const p = P(); if (p) p.pressed.add('Digit5'); });
    objBtn('E', 160, 212, 54, () => { const p = P(); if (p) { p.pressed.add('KeyE'); p.keys.add('KeyE'); } }, () => { const p = P(); if (p) p.keys.delete('KeyE'); });
    objBtn('G', 222, 155, 50, () => { const p = P(); if (p) p.pressed.add('KeyG'); });
    // 摇杆
    let padId = null, cx = 0, cy = 0, lookId = null, lx = 0, ly = 0;
    window.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (t.clientX < W() * 0.4 && padId === null) { padId = t.identifier; const r = pad.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
        else if (lookId === null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
      }
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      const p = P();
      for (const t of e.changedTouches) {
        if (t.identifier === padId && p) {
          let dx = t.clientX - cx, dy = t.clientY - cy; const L = Math.hypot(dx, dy), m = 60;
          if (L > m) { dx *= m / L; dy *= m / L; }
          knob.style.left = (70 + dx) + 'px'; knob.style.bottom = (82 - dy) + 'px';
          p.touch.mx = dx / m; p.touch.mz = -dy / m;
        } else if (t.identifier === lookId && p) {
          p.touchLook = p.touchLook || { x: 0, y: 0 };
          p.touchLook.x += (t.clientX - lx) * 1.6; p.touchLook.y += (t.clientY - ly) * 1.6;
          lx = t.clientX; ly = t.clientY;
        }
      }
    }, { passive: true });
    const end = (e) => {
      const p = P();
      for (const t of e.changedTouches) {
        if (t.identifier === padId) { padId = null; knob.style.left = '70px'; knob.style.bottom = '82px'; if (p) { p.touch.mx = 0; p.touch.mz = 0; } }
        if (t.identifier === lookId) lookId = null;
      }
    };
    window.addEventListener('touchend', end); window.addEventListener('touchcancel', end);
    // 与 HUD 同源接线：game 构造时已挂 game.locale（HUD 用的那个 LocaleService）则自动接上；
    // 未挂时保持中文兜底，集成者可事后 setLocaleService 补接（见下）。
    if (this.g && this.g.locale) this.setLocaleService(this.g.locale);
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
  // 退订语言服务；DOM 与事件保持现状（本组件随页面存活，无 DOM 拆除需求）
  destroy() {
    if (this._unsubLocale) { this._unsubLocale(); this._unsubLocale = null; }
    this.locale = null;
  }
}
