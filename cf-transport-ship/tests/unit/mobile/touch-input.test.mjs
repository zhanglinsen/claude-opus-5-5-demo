// 触屏输入层端到端测试（任务 2 用例 1–5、8，加 L3b 契约 API）。
// 通过 new TouchControls(game) 工作；Node 桩，不依赖浏览器/GPU。
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { makeTouchControls, touchPoint, canvasTarget, screenTarget } from './helpers/touch-dom.mjs';

let ctx = null;
const setup = (opts) => { ctx = makeTouchControls(opts); return ctx; };
afterEach(() => { if (ctx) { ctx.cleanup(); ctx = null; } });

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// ---------- 用例 1：touchcancel 释放按钮（E3） ----------

test('用例1：开火按钮被 touchcancel 打断后释放 fire', () => {
  const { byAct, player } = setup();
  const fire = byAct('fire');
  fire.dispatch('touchstart');
  assert.equal(player.touch.fire, true, '按下后应开火');
  fire.dispatch('touchcancel');
  assert.equal(player.touch.fire, false, 'touchcancel 后 fire 仍为 true：按钮未监听 touchcancel');
});

test('用例1：touchend 仍然释放；副开火键同理', () => {
  const { byAct, player } = setup();
  for (const act of ['fire', 'fire2']) {
    const b = byAct(act);
    b.dispatch('touchstart');
    assert.equal(player.touch.fire, true, act);
    b.dispatch('touchend');
    assert.equal(player.touch.fire, false, act);
  }
});

// ---------- 用例 2：失焦清状态（E4） ----------

test('用例2：window blur 清零全部触屏状态', () => {
  const { fireWindow, player } = setup();
  Object.assign(player.touch, { fire: true, firePressed: true, jump: true, crouch: true, mx: 0.7, mz: -0.3 });
  player.touchLook.x = 5; player.touchLook.y = -4;
  player.mouse.r = true;
  fireWindow('blur');
  assert.deepEqual(player.touch, { mx: 0, mz: 0, fire: false, jump: false, crouch: false, firePressed: false },
    'blur 后 touch.* 未清零：只清了键盘/鼠标');
  assert.deepEqual(player.touchLook, { x: 0, y: 0 });
  assert.equal(player.mouse.r, false);
});

test('用例2：blur 后旧的摇杆触点不再驱动移动', () => {
  const { fireWindow, player } = setup();
  fireWindow('touchstart', { target: canvasTarget(), changedTouches: [touchPoint(1, 300, 100)] });
  fireWindow('blur');
  fireWindow('touchmove', { changedTouches: [touchPoint(1, 340, 100)] });
  assert.equal(player.touch.mx, 0);
});

test('用例2：orientationchange 也清状态并按新尺寸重排', () => {
  const { fireWindow, player, env, touch } = setup();
  player.touch.fire = true;
  env.win.innerWidth = 932; env.win.innerHeight = 430;
  fireWindow('orientationchange');
  assert.equal(player.touch.fire, false);
  assert.equal(touch.layout.w, 932);
});

// ---------- 用例 3：旋转/缩放后按钮重排且不出屏（E5） ----------

test('用例3：视口 844×390 → 390×844 → 932×430，所有按钮仍在视口内，且无残留旧锚点', () => {
  const { env, touch, buttons, rectOf, byAct } = setup();
  for (const [w, h] of [[844, 390], [390, 844], [932, 430]]) {
    env.setViewport(w, h);
    for (const b of [...buttons(), touch._pad]) {
      const r = rectOf(b);
      assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h,
        `${w}x${h}: ${b.dataset && b.dataset.act || 'pad'} 出屏 (${JSON.stringify(r)})：按钮未随视口重排`);
    }
    const f2 = byAct('fire2');
    assert.equal(f2.style.left, '186px', '副开火键应为 left 锚点（旧实现的 right:W-250 会在旋转后错位）');
    assert.equal(f2.style.right, '', '不应残留 right 锚点');
  }
});

test('用例3：844×390 下既有按钮位置与旧硬编码一致（横屏体验不变）', () => {
  const { byAct } = setup();
  const s = (act) => byAct(act).style;
  assert.deepEqual([s('fire').right, s('fire').bottom, s('fire').width], ['40px', '150px', '84px']);
  assert.deepEqual([s('jump').right, s('jump').bottom, s('jump').width], ['140px', '60px', '60px']);
  assert.deepEqual([s('scope').right, s('scope').bottom, s('scope').width], ['40px', '60px', '60px']);
  assert.deepEqual([s('crouch').right, s('crouch').bottom, s('crouch').width], ['210px', '40px', '54px']);
});

test('onLayout：每次重排通知订阅者，退订后不再通知', () => {
  const { env, touch } = setup();
  let n = 0; let lastW = 0;
  const off = touch.onLayout((l) => { n++; lastW = l.w; });
  env.setViewport(800, 360);
  assert.equal(n, 1); assert.equal(lastW, 800);
  off();
  env.setViewport(844, 390);
  assert.equal(n, 1);
});

// ---------- 用例 4：浮动摇杆（E6） ----------

test('用例4：左侧区任意位置按下，起始零偏移；位移相对按下点', () => {
  const { fireWindow, player, touch } = setup();
  fireWindow('touchstart', { target: canvasTarget(), changedTouches: [touchPoint(1, 300, 100)] });
  assert.equal(player.touch.mx, 0); assert.equal(player.touch.mz, 0);
  assert.equal(touch._pad.style.left, '230px', '底座应跟随按下点（300-70）');
  assert.equal(touch._pad.style.top, '30px');
  fireWindow('touchmove', { changedTouches: [touchPoint(1, 330, 100)] });
  assert.ok(near(player.touch.mx, 0.5), `mx=${player.touch.mx}：位移应相对按下点，而不是相对固定底座中心`);
  assert.ok(near(player.touch.mz, 0));
  fireWindow('touchmove', { changedTouches: [touchPoint(1, 300, 40)] });
  assert.ok(near(player.touch.mz, 1), '向上推满 mz=1（最大偏移 60px）');
});

test('用例4：抬起后归零并复位底座', () => {
  const { fireWindow, player, touch } = setup();
  fireWindow('touchstart', { target: canvasTarget(), changedTouches: [touchPoint(1, 300, 100)] });
  fireWindow('touchmove', { changedTouches: [touchPoint(1, 330, 100)] });
  fireWindow('touchend', { target: canvasTarget(), changedTouches: [touchPoint(1, 330, 100)] });
  assert.equal(player.touch.mx, 0); assert.equal(player.touch.mz, 0);
  assert.equal(touch._pad.style.left, '28px'); assert.equal(touch._pad.style.bottom, '40px');
  assert.equal(touch._pad.style.top, '');
});

test('用例4：偏移超过 60px 被夹到 1', () => {
  const { fireWindow, player } = setup();
  fireWindow('touchstart', { target: canvasTarget(), changedTouches: [touchPoint(1, 200, 200)] });
  fireWindow('touchmove', { changedTouches: [touchPoint(1, 500, 200)] });
  assert.ok(near(player.touch.mx, 1));
});

test('视角：右侧滑动累积 touchLook，增益 1.6', () => {
  const { fireWindow, player } = setup();
  fireWindow('touchstart', { target: canvasTarget(), changedTouches: [touchPoint(2, 600, 200)] });
  fireWindow('touchmove', { changedTouches: [touchPoint(2, 610, 190)] });
  assert.ok(near(player.touchLook.x, 16)); assert.ok(near(player.touchLook.y, -16));
});

test('多指：摇杆 + 视角 + 开火同时进行互不影响，抬起其一不影响其余', () => {
  const { fireWindow, player, byAct } = setup();
  fireWindow('touchstart', { target: canvasTarget(), changedTouches: [touchPoint(1, 300, 100)] });
  fireWindow('touchstart', { target: canvasTarget(), changedTouches: [touchPoint(2, 600, 200)] });
  byAct('fire').dispatch('touchstart');
  fireWindow('touchmove', { changedTouches: [touchPoint(1, 330, 100), touchPoint(2, 610, 200)] });
  assert.ok(player.touch.mx > 0.4 && player.touch.fire && player.touchLook.x > 0);
  fireWindow('touchend', { target: canvasTarget(), changedTouches: [touchPoint(2, 610, 200)] });
  fireWindow('touchmove', { changedTouches: [touchPoint(1, 360, 100)] });
  assert.ok(near(player.touch.mx, 1), '抬起视角手指后摇杆应继续工作');
  assert.equal(player.touch.fire, true, '抬起视角手指不应释放开火');
  byAct('fire').dispatch('touchend');
  assert.equal(player.touch.fire, false);
});

// ---------- 用例 5：画布触摸 preventDefault，.screen 内不拦（E14） ----------

test('用例5：画布上的 touchstart/touchend 调用 preventDefault，且监听为非 passive', () => {
  const { fireWindow, optionsOf } = setup();
  const start = fireWindow('touchstart', { target: canvasTarget(), changedTouches: [touchPoint(1, 600, 200)] });
  const end = fireWindow('touchend', { target: canvasTarget(), changedTouches: [touchPoint(1, 600, 200)] });
  assert.equal(start.defaultPrevented, true, '画布 touchstart 未 preventDefault：浏览器会合成 mousedown 误开火');
  assert.equal(end.defaultPrevented, true, '画布 touchend 未 preventDefault：合成鼠标事件在 touchend 之后触发');
  assert.equal(optionsOf('touchstart').passive, false, 'touchstart 必须是非 passive 才能 preventDefault');
  assert.equal(optionsOf('touchend').passive, false);
  assert.equal(optionsOf('touchmove').passive, true, 'touchmove 保持 passive');
});

test('用例5：.screen 内的触摸不拦截（否则吞掉暂停/大厅按钮的 click），也不驱动摇杆', () => {
  const { fireWindow, player } = setup();
  const start = fireWindow('touchstart', { target: screenTarget(), changedTouches: [touchPoint(5, 100, 100)] });
  const end = fireWindow('touchend', { target: screenTarget(), changedTouches: [touchPoint(5, 100, 100)] });
  assert.equal(start.defaultPrevented, false, '.screen 内 touchstart 被拦截了');
  assert.equal(end.defaultPrevented, false, '.screen 内 touchend 被拦截了');
  fireWindow('touchmove', { changedTouches: [touchPoint(5, 160, 100)] });
  assert.equal(player.touch.mx, 0);
});

test('不在对局中（大厅/暂停/结算）触摸不驱动摇杆与视角', () => {
  const { fireWindow, player, game } = setup();
  game.paused = true;
  fireWindow('touchstart', { target: canvasTarget(), changedTouches: [touchPoint(1, 300, 100), touchPoint(2, 600, 200)] });
  fireWindow('touchmove', { changedTouches: [touchPoint(1, 340, 100), touchPoint(2, 620, 200)] });
  assert.equal(player.touch.mx, 0);
  assert.deepEqual(player.touchLook, { x: 0, y: 0 });
});

test('iOS 捏合缩放 gesturestart 被拦截（非 passive）', () => {
  const { fireWindow, optionsOf } = setup();
  assert.equal(fireWindow('gesturestart').defaultPrevented, true);
  assert.equal(optionsOf('gesturestart').passive, false);
});

// ---------- 用例 8：镜像鼠标（E8） ----------

test('用例8：“镜”镜像右键——按下 r+rp，抬起/取消释放 r', () => {
  const { byAct, player } = setup();
  const scope = byAct('scope');
  scope.dispatch('touchstart');
  assert.equal(player.mouse.r, true, '按下未置 mouse.r：近战重击依赖按住的 alt'); assert.equal(player.mouse.rp, true);
  scope.dispatch('touchend');
  assert.equal(player.mouse.r, false);
  scope.dispatch('touchstart'); scope.dispatch('touchcancel');
  assert.equal(player.mouse.r, false, 'touchcancel 后 mouse.r 未释放');
});

test('用例8：开火按下同时置 mouse.lp（死亡观战切队友只认 mouse.lp）', () => {
  const { byAct, player } = setup();
  byAct('fire').dispatch('touchstart');
  assert.equal(player.mouse.lp, true, '开火按下未置 mouse.lp');
  assert.equal(player.touch.fire, true); assert.equal(player.touch.firePressed, true);
});

// ---------- L3b 契约 API ----------

test('契约：is-touch 类加到 documentElement；既有 10 个按钮都带 data-act', () => {
  const { env, buttons } = setup();
  assert.equal(env.doc.documentElement.classList.contains('is-touch'), true);
  const acts = buttons().map((b) => b.dataset.act);
  for (const act of ['c4', 'crouch', 'e', 'fire', 'fire2', 'g', 'jump', 'reload', 'scope', 'swap']) {
    assert.ok(acts.includes(act), `既有按钮缺少 data-act=${act}`);
  }
});

test('契约：requestPause 守卫与状态清零', () => {
  const { touch, game, player } = setup();
  player.touch.fire = true;
  assert.equal(touch.requestPause('t'), true);
  assert.deepEqual(game.calls.filter((c) => c === 'pause'), ['pause']);
  assert.equal(player.touch.fire, false, '暂停前应先清触屏状态');
  assert.equal(touch.requestPause('t'), false, '已暂停不重复暂停');
});

test('契约：requestPause 不覆盖广告暂停、不在非对局/已结束时暂停', () => {
  for (const patch of [{ adPaused: true }, { playing: false }, { ended: true }]) {
    const { touch, game } = setup({ gameOver: patch });
    assert.equal(touch.requestPause('t'), false, JSON.stringify(patch));
    assert.equal(game.calls.includes('pause'), false);
    ctx.cleanup(); ctx = null;
  }
});

test('契约：resetTouchState 释放被按住的按钮（含 E 键的 keys）', () => {
  const { touch, byAct, player } = setup();
  byAct('fire').dispatch('touchstart');
  byAct('e').dispatch('touchstart');
  assert.equal(player.touch.fire, true); assert.equal(player.keys.has('KeyE'), true);
  touch.resetTouchState();
  assert.equal(player.touch.fire, false); assert.equal(player.keys.has('KeyE'), false);
});

test('契约：addButton 按 layout 定位，labelKey 进 _labeledExtra 而不进 _labeled，语言切换即时刷新', () => {
  const { touch } = setup();
  let prefix = 'X'; const subs = new Set();
  touch.setLocaleService({ t: (k) => `${prefix}:${k}`, subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); } });
  const before = touch._labeled.length;
  const beforeExtra = touch._labeledExtra.length; // 菜单模块已挂接，其本地化按钮已在其中
  // 用 fullscreen：默认环境不支持全屏，所以没有别的模块占用这个 act
  const b = touch.addButton({ act: 'fullscreen', labelKey: 'touch.fullscreen', down() {} });
  assert.equal(b.dataset.act, 'fullscreen');
  assert.equal(b.textContent, 'X:touch.fullscreen');
  assert.equal(touch._labeled.length, before, '新按钮不得进入 _labeled（touch-i18n 测试对其做完整 deepEqual）');
  assert.equal(touch._labeledExtra.length, beforeExtra + 1);
  assert.equal(b.style.right, '220px'); assert.equal(b.style.top, '6px'); assert.equal(b.style.width, '44px');
  prefix = 'Y'; for (const fn of subs) fn();
  assert.equal(b.textContent, 'Y:touch.fullscreen');
});

test('契约：addButton 的 down/up/cancel 语义，重复按下不重复触发', () => {
  const { touch } = setup();
  const log = [];
  const b = touch.addButton({ act: 'menu', label: '☰', down: () => log.push('down'), up: () => log.push('up'), cancel: () => log.push('cancel') });
  b.dispatch('touchstart'); b.dispatch('touchstart'); b.dispatch('touchend');
  b.dispatch('touchstart'); b.dispatch('touchcancel');
  b.dispatch('touchend'); // 已释放，忽略
  assert.deepEqual(log, ['down', 'up', 'down', 'cancel']);
});
