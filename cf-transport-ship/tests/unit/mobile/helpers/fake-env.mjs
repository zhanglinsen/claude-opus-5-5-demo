// 移动端模块测试共用桩（任务 3/4/5/7）。纯 Node，不依赖浏览器/GPU。
// 提供：最小 window/document/matchMedia 全局、假 game、假 player、以及契约（dispatch/contract.md）里 touch 对象的假实现。
// 用法：const env = installEnv({ width: 844, height: 390 }); ...测试...; env.restore();

export function makeEl(tag = 'div') {
  const listeners = new Map();
  const cls = new Set();
  const el = {
    tag, id: '', className: '', textContent: '', hidden: false, style: {}, dataset: {}, attrs: {}, children: [],
    classList: {
      add: (c) => cls.add(c),
      remove: (c) => cls.delete(c),
      contains: (c) => cls.has(c),
      toggle: (c, force) => { const on = force === undefined ? !cls.has(c) : !!force; if (on) cls.add(c); else cls.delete(c); return on; },
    },
    setAttribute(k, v) { el.attrs[k] = String(v); },
    getAttribute(k) { return k in el.attrs ? el.attrs[k] : null; },
    addEventListener(type, fn, opts) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push({ fn, opts });
    },
    removeEventListener(type, fn) {
      const list = listeners.get(type);
      if (list) listeners.set(type, list.filter((x) => x.fn !== fn));
    },
    // 派发并返回事件对象，便于断言 defaultPrevented
    dispatch(type, props = {}) {
      const e = {
        type, target: el, defaultPrevented: false, propagationStopped: false,
        preventDefault() { e.defaultPrevented = true; },
        stopPropagation() { e.propagationStopped = true; },
        ...props,
      };
      for (const { fn } of [...(listeners.get(type) || [])]) fn(e);
      return e;
    },
    listenerCount(type) { return (listeners.get(type) || []).length; },
    // 记录监听选项，便于断言是否 passive
    listenerOptions(type) { return (listeners.get(type) || []).map((x) => x.opts); },
    append(...kids) { el.children.push(...kids); },
    appendChild(child) { el.children.push(child); return child; },
    remove() { el.removed = true; },
    closest() { return null; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; },
  };
  return el;
}

function emitOn(target, type, props = {}) {
  const e = new Event(type, { cancelable: true });
  Object.assign(e, props);
  target.dispatchEvent(e);
  return e;
}

export function installEnv({ width = 844, height = 390, coarse = true, search = '' } = {}) {
  const prev = {
    window: globalThis.window,
    document: globalThis.document,
    matchMedia: globalThis.matchMedia,
    location: globalThis.location,
  };
  const win = new EventTarget();
  win.innerWidth = width;
  win.innerHeight = height;
  const doc = new EventTarget();
  doc.hidden = false;
  doc.visibilityState = 'visible';
  doc.fullscreenEnabled = false;
  doc.documentElement = makeEl('html');
  doc.body = makeEl('body');
  const byId = new Map();
  doc.getElementById = (id) => byId.get(id) || null;
  doc.createElement = (tag) => makeEl(tag);

  const media = new Map(); // query -> { matches, listeners }
  const defaultMatch = (q) => {
    if (q.includes('pointer:coarse') || q.includes('pointer: coarse')) return coarse;
    if (q.includes('orientation:portrait') || q.includes('orientation: portrait')) return win.innerHeight > win.innerWidth;
    if (q.includes('orientation:landscape') || q.includes('orientation: landscape')) return win.innerHeight <= win.innerWidth;
    return false;
  };
  const getMedia = (q) => {
    if (!media.has(q)) media.set(q, { matches: defaultMatch(q), listeners: new Set() });
    return media.get(q);
  };
  globalThis.matchMedia = (q) => {
    const m = getMedia(q);
    return {
      media: q,
      get matches() { return m.matches; },
      addEventListener: (t, fn) => { if (t === 'change') m.listeners.add(fn); },
      removeEventListener: (t, fn) => { if (t === 'change') m.listeners.delete(fn); },
      addListener: (fn) => m.listeners.add(fn),
      removeListener: (fn) => m.listeners.delete(fn),
    };
  };
  globalThis.window = win;
  globalThis.document = doc;
  globalThis.location = { search };

  const env = {
    win, doc,
    // 注册 #id 元素，供 document.getElementById 返回
    register(id, el = makeEl()) { el.id = id; byId.set(id, el); return el; },
    emit: emitOn,
    // 改变视口并联动 orientation 媒体查询，触发 resize 与 change 事件
    setViewport(w, h) {
      win.innerWidth = w;
      win.innerHeight = h;
      for (const [q, m] of media) {
        if (!q.includes('orientation')) continue;
        const now = defaultMatch(q);
        if (now !== m.matches) { m.matches = now; for (const fn of [...m.listeners]) fn({ matches: now, media: q }); }
      }
      emitOn(win, 'resize');
    },
    setMedia(q, matches) {
      const m = getMedia(q);
      m.matches = !!matches;
      for (const fn of [...m.listeners]) fn({ matches: m.matches, media: q });
    },
    setHidden(hidden) {
      doc.hidden = !!hidden;
      doc.visibilityState = hidden ? 'hidden' : 'visible';
      emitOn(doc, 'visibilitychange');
    },
    restore() {
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete globalThis[k]; else globalThis[k] = v;
      }
    },
  };
  return env;
}

export function makeFakePlayer() {
  return {
    touch: { mx: 0, mz: 0, fire: false, jump: false, crouch: false, firePressed: false },
    touchLook: { x: 0, y: 0 },
    mouse: { l: false, r: false, lp: false, rp: false, dx: 0, dy: 0, wheel: 0 },
    keys: new Set(),
    pressed: new Set(),
  };
}

export function makeFakeGame(over = {}) {
  const calls = [];
  const ctx = {
    state: 'running',
    suspend() { calls.push('audio.suspend'); ctx.state = 'suspended'; return Promise.resolve(); },
    resume() { calls.push('audio.resume'); ctx.state = 'running'; return Promise.resolve(); },
  };
  const game = {
    playing: true, paused: false, ended: false, adPaused: false,
    player: makeFakePlayer(),
    audio: { ctx, init() { calls.push('audio.init'); if (ctx.state !== 'running') ctx.resume(); return true; } },
    hud: { scoreboard(on) { calls.push(['hud.scoreboard', on]); } },
    calls,
    pause() { calls.push('pause'); game.paused = true; },
    resume() { calls.push('resume'); game.paused = false; },
    quitToMenu() { calls.push('quitToMenu'); },
    ...over,
  };
  return game;
}

// 契约里 touch 对象公开 API 的假实现；模块（menu/lifecycle/orientation/fullscreen）用它做隔离测试。
export function makeFakeTouch(game) {
  const layoutSubs = new Set();
  const touch = {
    enabled: true,
    g: game,
    root: makeEl('div'),
    layout: null,
    buttons: [],
    resetCount: 0,
    pauseReasons: [],
    player: () => game.player || null,
    isPlaying: () => !!(game.playing && !game.paused && !game.ended),
    // 集中暂停守卫：模块不得直接调用 game.pause()
    requestPause(reason) {
      if (!(game.playing && !game.paused && !game.ended && !game.adPaused)) return false;
      touch.resetTouchState();
      game.pause();
      touch.pauseReasons.push(reason);
      return true;
    },
    resetTouchState() { touch.resetCount++; },
    addButton(spec) {
      const el = makeEl('div');
      el.dataset.act = spec.act;
      el.spec = spec;
      if (spec.label != null) el.textContent = spec.label;
      touch.buttons.push(el);
      return el;
    },
    button(act) { return touch.buttons.find((b) => b.dataset.act === act) || null; },
    labelText: (key) => key,
    onLayout(fn) { layoutSubs.add(fn); return () => layoutSubs.delete(fn); },
    emitLayout(layout) { touch.layout = layout; for (const fn of [...layoutSubs]) fn(layout); },
  };
  return touch;
}

// 模拟一次完整按压：按下 → 抬起
export function press(el) { el.spec.down && el.spec.down(); }
export function release(el) { el.spec.up && el.spec.up(); }
export function cancel(el) { (el.spec.cancel || el.spec.up || (() => {}))(); }
