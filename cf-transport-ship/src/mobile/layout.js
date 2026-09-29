// 触屏布局：纯函数，无 DOM 依赖，单位均为 CSS px。
// 由 .ultra/mobile-adaptation 计划的任务 3/8 使用；契约见 .ultra/mobile-adaptation/dispatch/contract.md。
//
// 横屏基准为 844×390：既有按钮的偏移与 touch.js 原有硬编码完全一致（副开火键由 right:W-250
// 换算为等价的 left:186），已工作的横屏体验不变。新增按钮放在顶部右侧栏与底部槽位条。
// 竖屏对局由任务 7 强制暂停，因此竖屏只保证“都在视口内”，不保证互不重叠。
// 已知缺口（任务 8）：视口高度 < 360（如带地址栏的 Android，约 320–340）时，右侧“装弹/切枪”键会与顶部栏重叠，
// 需要紧凑布局；本文件当前只保证 h ≥ 360（无安全区）与 h ≥ 375（含刘海/横条安全区）的横屏。
// 顶部栏 top 取 6 而非 12：812×375 且底部安全区 21 时，装弹/切枪键顶边 y=54，顶部栏底边 y=50，留 4px 间隙。

export const MIN_TARGET = 44; // 触控目标最小边长（CSS px）
export const SLOT_COUNT = 4;

// act → 锚点与边长。锚点偏移不含安全区；安全区在 computeLayout 中叠加。
const SPEC = {
  // 摇杆底座（左下）
  pad: { left: 28, bottom: 40, size: 140 },
  // 右下动作区（与旧 touch.js 一致）
  fire: { right: 40, bottom: 150, size: 84 },
  fire2: { left: 186, bottom: 250, size: 64 },
  jump: { right: 140, bottom: 60, size: 60 },
  crouch: { right: 210, bottom: 40, size: 54 },
  reload: { right: 40, bottom: 250, size: 50 },
  swap: { right: 100, bottom: 250, size: 50 },
  scope: { right: 40, bottom: 60, size: 60 },
  // 爆破模式目标按钮（仅爆破模式显示，几何上始终预留）
  c4: { right: 160, bottom: 150, size: 54 },
  e: { right: 160, bottom: 212, size: 54 },
  g: { right: 222, bottom: 155, size: 50 },
  // 顶部右侧栏（新增）
  menu: { right: 12, top: 6, size: 44 },
  board: { right: 64, top: 6, size: 44 },
  loadout: { right: 116, top: 6, size: 44 },
  inspect: { right: 168, top: 6, size: 44 },
  fullscreen: { right: 220, top: 6, size: 44 },
};
// 底部槽位条（新增）：紧邻摇杆右侧，横向排列。
for (let i = 1; i <= SLOT_COUNT; i++) {
  SPEC['slot' + i] = { left: 184 + (i - 1) * 52, bottom: 8, size: 44 };
}

export const ACTS = Object.freeze(Object.keys(SPEC));

const NO_SAFE = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

// 把 spec 与安全区、视口合成为绝对矩形 {x, y, w, h}（视口坐标，左上为原点）。
function place(spec, w, h, safe) {
  const out = { size: spec.size };
  let x;
  let y;
  if (spec.left != null) { out.left = spec.left + safe.left; x = out.left; }
  else { out.right = spec.right + safe.right; x = w - out.right - spec.size; }
  if (spec.top != null) { out.top = spec.top + safe.top; y = out.top; }
  else { out.bottom = spec.bottom + safe.bottom; y = h - out.bottom - spec.size; }
  out.x = x; out.y = y; out.w = spec.size; out.h = spec.size;
  return out;
}

/**
 * 计算所有触屏控件的位置。
 * @param {number} w 视口宽（通常 window.innerWidth）
 * @param {number} h 视口高
 * @param {{top?:number,right?:number,bottom?:number,left?:number}} [safe] 安全区，缺省全 0
 * @returns {{w:number,h:number,portrait:boolean,safe:object,center:{cx:number,cy:number,r:number},items:Object<string,object>}}
 *   items[act] = { left|right, top|bottom, size, x, y, w, h }，left/right、top/bottom 各只会出现一个，
 *   调用方应用样式时须清除另一侧，避免残留旧锚点。
 */
export function computeLayout(w, h, safe = NO_SAFE) {
  const s = {
    top: Number(safe && safe.top) || 0,
    right: Number(safe && safe.right) || 0,
    bottom: Number(safe && safe.bottom) || 0,
    left: Number(safe && safe.left) || 0,
  };
  const items = {};
  for (const act of ACTS) items[act] = place(SPEC[act], w, h, s);
  return {
    w,
    h,
    portrait: h > w,
    safe: s,
    // 准星视野区：HUD 与触控区都应避开的中央圆形区域
    center: { cx: w / 2, cy: h / 2, r: Math.round(h * 0.15) },
    items,
  };
}

// 摇杆有效起始区：屏幕左侧 40%（与旧 touch.js 的 clientX < 0.4W 一致）。
export function padZoneWidth(w) {
  return w * 0.4;
}
