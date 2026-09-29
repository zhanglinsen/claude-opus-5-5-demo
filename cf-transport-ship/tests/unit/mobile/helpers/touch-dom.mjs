// TouchControls 端到端测试桩（L2a/L2b 共用）：在 fake-env 之上一站式构造 TouchControls。
// 关键点：Event.target 是只读的，无法用真实 Event 指定为画布或 .screen，所以在构造前包装 window.addEventListener，
// 记录 TouchControls 注册的处理函数，测试里用朴素对象事件直接调用它们。
import { installEnv, makeFakeGame } from './fake-env.mjs';
import { TouchControls } from '../../../../src/touch.js';

// 既有按钮在 data-act 落地前的文本回退（zh 默认文案）
const TEXT_ACT = { 开火: 'fire', 跳: 'jump', 蹲: 'crouch', 切: 'swap', 镜: 'scope', R: 'reload', C4: 'c4', E: 'e', G: 'g' };

export const touchPoint = (identifier, clientX, clientY) => ({ identifier, clientX, clientY });
// 画布：触屏对局时手指点在这上面（#ui 为 pointer-events:none）
export const canvasTarget = () => ({ id: 'c' });
// 暂停/大厅/结算等 .screen 内的元素：closest('.screen') 命中
export const screenTarget = () => ({ id: 'btnResume', closest: (sel) => (sel === '.screen' ? {} : null) });

function walk(el, visit) {
  visit(el);
  for (const child of el.children || []) walk(child, visit);
}

/**
 * @param {object} [opts]
 * @param {number} [opts.width=844] @param {number} [opts.height=390]
 * @param {boolean} [opts.coarse=true] @param {object} [opts.gameOver] 覆盖 makeFakeGame 的字段
 * @param {(env:object)=>void} [opts.prepare] 构造 TouchControls 之前调用
 * @returns 见下方返回对象
 */
export function makeTouchControls({ width = 844, height = 390, coarse = true, search = '', gameOver = {}, prepare } = {}) {
  const env = installEnv({ width, height, coarse, search });
  const root = env.register('touch');
  if (prepare) prepare(env); // 构造 TouchControls 之前的钩子（例如设置 document.fullscreenEnabled）
  const handlers = [];
  const origAdd = env.win.addEventListener.bind(env.win);
  env.win.addEventListener = (type, fn, options) => {
    handlers.push({ type, fn, options });
    origAdd(type, fn, options);
  };
  const game = makeFakeGame(gameOver);
  const touch = new TouchControls(game);

  // 直接调用 TouchControls 注册在 window 上的处理函数；返回事件对象便于断言 defaultPrevented
  function fireWindow(type, props = {}) {
    const e = {
      type, target: env.win, changedTouches: [], cancelable: true, defaultPrevented: false, propagationStopped: false,
      preventDefault() { e.defaultPrevented = true; },
      stopPropagation() { e.propagationStopped = true; },
      ...props,
    };
    for (const h of handlers.filter((x) => x.type === type)) h.fn(e);
    return e;
  }

  const buttons = () => { const out = []; walk(root, (el) => { if (el !== root && el.dataset && el.dataset.act) out.push(el); }); return out; };
  const byAct = (act) => {
    const hit = buttons().find((b) => b.dataset.act === act);
    if (hit) return hit;
    // data-act 落地前的回退：按文本找既有按钮
    let found = null;
    walk(root, (el) => { if (!found && el !== root && TEXT_ACT[el.textContent] === act) found = el; });
    return found;
  };
  const byText = (text) => { let found = null; walk(root, (el) => { if (!found && el !== root && el.textContent === text) found = el; }); return found; };

  return {
    env, game, player: game.player, touch, root, handlers, fireWindow, byAct, byText, buttons,
    // 窗口监听里第一个给定类型的 options（用于断言 passive）
    optionsOf: (type) => (handlers.find((h) => h.type === type) || {}).options,
    // 按钮内联样式 → 视口矩形（端到端地校验 applyLayout 的结果，而不是读内部 layout 对象）
    rectOf(el) {
      const num = (v) => (v === '' || v == null ? null : parseFloat(v));
      const w = num(el.style.width); const h = num(el.style.height);
      const left = num(el.style.left); const right = num(el.style.right);
      const top = num(el.style.top); const bottom = num(el.style.bottom);
      const x = left != null ? left : env.win.innerWidth - right - w;
      const y = top != null ? top : env.win.innerHeight - bottom - h;
      return { x, y, w, h };
    },
    // 先 destroy（撤销 src/mobile/* 模块：清除轮询定时器与遮罩），再还原全局；否则遗留的 setInterval 会让 node 进程退不出去
    // 不吞异常：destroy 若抛错应让测试失败，而不是被清理逻辑掩盖。env.restore 放 finally，保证全局一定还原
    cleanup() { try { touch.destroy(); } finally { env.restore(); } },
  };
}
