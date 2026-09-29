// 手机端浏览器验收（任务 9）。在真实页面里复核前面各任务用 Node 桩与静态几何验证过的结论：
// 触控件与 HUD 的真实包围盒、暂停入口、touchcancel、旋转遮罩、后台暂停、点按视角区是否误开火（E14）。
//
// ⚠️ 运行前提（三者缺一不可）：
//   1. 用户同意；
//   2. 性能优化任务的集成者已释放浏览器/GPU（它按“同机、同质量、同种子”对比帧耗时，你的浏览器会污染它的数据）；
//   3. 设置环境变量 MOBILE_E2E_GPU_FREE=1。
// 缺任一即拒绝运行（退出码 3），且发生在导入 playwright、起服务、构建之前。
//
// 用法：MOBILE_E2E_GPU_FREE=1 node cf-transport-ship/scripts/accept-mobile.mjs [--out artifacts/mobile]
// 需要已构建的 dist/index.html（`npm run build:offline`；构建也占用 CPU，同属这道门）。缺失时退出码 4。
// 串行单浏览器、一次一个页面、q=low、本机 Chrome 软渲染（沿用 accept-lobby/accept-workflows 的约定）。
// 现有 accept-*/e2e* 脚本一律不改（性能任务也在使用它们）。
//
// 无法在 headless Chromium 里验证、必须真机确认的项见文件末尾 UNCOVERED，运行结束时会打印。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const GATE_ENV = 'MOBILE_E2E_GPU_FREE';

// 横屏矩阵与一个竖屏；与 layout-geometry / hud-geometry 静态测试的视口一致
export const VIEWPORTS = [
  { w: 844, h: 390, tag: 'l844x390' },
  { w: 932, h: 430, tag: 'l932x430' },
  { w: 667, h: 375, tag: 'l667x375' },
  { w: 800, h: 360, tag: 'l800x360' },
];
export const PORTRAIT = { w: 390, h: 844, tag: 'p390x844' };
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const GAME_URL = (port) => `http://127.0.0.1:${port}/index.html?map=transport-ship&nolock=1&q=low&autostart=1&touch=1`;

// ---------------- 纯函数（可在 Node 里单测，不需要浏览器）----------------

export const rectsOverlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
export function distToCircle(r, c) {
  const dx = Math.max(r.x - c.cx, 0, c.cx - (r.x + r.w));
  const dy = Math.max(r.y - c.cy, 0, c.cy - (r.y + r.h));
  return Math.hypot(dx, dy);
}

/**
 * 复核真实页面里量到的包围盒。
 * @param {{innerWidth:number,innerHeight:number,scrollWidth:number,touch:Array<{id:string,x:number,y:number,w:number,h:number,button?:boolean}>,hud:Array<{id:string,x:number,y:number,w:number,h:number}>}} data
 * @returns {string[]} 问题列表，空数组表示通过
 */
export function checkLayout(data, { tolerance = 1 } = {}) {
  const problems = [];
  const { innerWidth: W, innerHeight: H } = data;
  if (data.scrollWidth > W + tolerance) problems.push(`页面横向溢出：scrollWidth ${data.scrollWidth} > innerWidth ${W}`);
  const inside = (r) => r.x >= -tolerance && r.y >= -tolerance && r.x + r.w <= W + tolerance && r.y + r.h <= H + tolerance;
  const center = { cx: W / 2, cy: H / 2, r: Math.round(H * 0.15) };
  for (const r of [...data.touch, ...data.hud]) {
    if (!inside(r)) problems.push(`${r.id} 出屏：(${Math.round(r.x)},${Math.round(r.y)}) ${Math.round(r.w)}×${Math.round(r.h)}`);
  }
  for (const r of data.touch) {
    if (r.button && Math.min(r.w, r.h) < 44 - tolerance) problems.push(`${r.id} 触控目标过小：${Math.round(r.w)}×${Math.round(r.h)} < 44`);
  }
  const all = [...data.touch.map((r) => ({ ...r, kind: '触控件' })), ...data.hud.map((r) => ({ ...r, kind: 'HUD' }))];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i]; const b = all[j];
      if (a.kind === 'HUD' && b.kind === 'HUD') continue; // HUD 块之间的关系由 hud-geometry 的声明盒子保证，这里只关心与触控的冲突
      if (rectsOverlap(a, b)) problems.push(`${a.kind} ${a.id} 与 ${b.kind} ${b.id} 重叠`);
    }
  }
  for (const r of all) {
    if (distToCircle(r, center) < center.r) problems.push(`${r.kind} ${r.id} 进入准星视野区（r=${center.r}）`);
  }
  return problems;
}

export function parseArgs(argv) {
  const opts = { out: path.join(ROOT, 'artifacts', 'mobile') };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) throw new Error('--out 需要一个目录参数');
      opts.out = path.resolve(v);
    } else throw new Error(`未知参数：${argv[i]}`);
  }
  return opts;
}

// 无法在 headless Chromium 里验证、必须真机确认的项
export const UNCOVERED = [
  'iOS Safari：双击/捏合缩放、下拉刷新、长按菜单（依赖 touch-action / gesturestart 的真实表现）',
  '刘海/横条安全区遮挡（Chrome 无法模拟 env(safe-area-inset-*)）',
  '地址栏伸缩与 100dvh；iPhone 无 Fullscreen API 时的“添加到主屏幕”流程',
  '来电/锁屏后 AudioContext 的 interrupted 状态与恢复（audio.init → _resume）',
  'screen.orientation.lock 与 requestFullscreen 在各浏览器的真实行为',
  '真实手指的多点触控手感、按钮热区、发热与帧率（帧率/发热只记录，不作通过条件）',
  '高度 < 360 的紧凑屏（带地址栏的 Android，约 320–340）布局：layout.js 已知缺口',
];

// ---------------- 页面内取包围盒（在浏览器里执行）----------------

function collectRectsInPage() {
  const rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
  const visible = (el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
  const touch = [];
  for (const el of document.querySelectorAll('#touch [data-act]')) if (visible(el)) touch.push({ id: 'btn:' + el.dataset.act, button: true, ...rect(el) });
  const pad = document.querySelector('#touch .pad');
  if (pad && visible(pad)) touch.push({ id: 'pad', button: false, ...rect(pad) });
  const hud = [];
  for (const id of ['radarWrap', 'score', 'feed', 'vitals', 'ammo', 'nadeInfo', 'slotC4']) {
    const el = document.getElementById(id);
    if (el && visible(el)) hud.push({ id, ...rect(el) });
  }
  return { innerWidth: window.innerWidth, innerHeight: window.innerHeight, scrollWidth: document.documentElement.scrollWidth, touch, hud };
}

// ---------------- 主流程（只在直接运行时执行）----------------

async function main() {
  // 门：必须最先检查，发生在导入 playwright、起服务之前
  if (process.env[GATE_ENV] !== '1') {
    console.error([
      '拒绝运行：手机端浏览器验收会占用浏览器/GPU，而性能优化任务正在独占它们做同机帧耗时实测。',
      '需要同时满足：① 用户同意；② 性能任务的集成者已释放浏览器/GPU；③ 设置环境变量 MOBILE_E2E_GPU_FREE=1。',
      `确认无误后重新运行：${GATE_ENV}=1 node cf-transport-ship/scripts/accept-mobile.mjs`,
    ].join('\n'));
    return 3;
  }
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); return 2; }
  const dist = path.join(ROOT, 'dist', 'index.html');
  if (!fs.existsSync(dist)) {
    console.error('缺少 dist/index.html：请先在 cf-transport-ship/ 下运行 npm run build:offline（构建也占用 CPU，同属这道门）。');
    return 4;
  }

  const { chromium } = await import('playwright-core');
  const { startServer } = await import('./serve.mjs');
  const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const PORT = Number(process.env.MOBILE_E2E_PORT || 8968);
  const SHOTS = path.join(opts.out, 'screenshots');
  fs.mkdirSync(SHOTS, { recursive: true });

  const results = { tool: 'accept-mobile', startedAt: new Date().toISOString(), checks: [], screenshots: [], consoleErrors: {}, uncovered: UNCOVERED };
  let failed = 0;
  const ok = (name, cond, detail = '') => {
    results.checks.push({ name, pass: !!cond, detail: String(detail).slice(0, 400) });
    console.log(`  ${cond ? '✔' : '✘'} ${name}${detail ? ' — ' + String(detail).slice(0, 200) : ''}`);
    if (!cond) failed++;
  };
  const shot = async (page, name) => {
    const p = path.join(SHOTS, `${name}.png`);
    await page.screenshot({ path: p });
    results.screenshots.push({ name, file: path.relative(opts.out, p) });
  };

  const server = await startServer(PORT);
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });

  // 真实触摸点按：Playwright 的 touchscreen.tap 走 CDP，Chromium 会像真机一样生成兼容鼠标事件（除非被 preventDefault）
  const tapEl = async (page, selector) => {
    const box = await page.locator(selector).first().boundingBox();
    if (!box) throw new Error(`找不到可点元素：${selector}`);
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  };
  async function openMatch(viewport, tag) {
    const ctx = await browser.newContext({ viewport: { width: viewport.w, height: viewport.h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, userAgent: IPHONE_UA });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    results.consoleErrors[tag] = errors;
    await page.goto(GAME_URL(PORT), { waitUntil: 'load', timeout: 90000 });
    await page.waitForFunction(() => window.__game && window.__game.player && window.__game.player.alive, null, { timeout: 90000 });
    // 软渲染帧率低：等模拟时间越过出生 readyAt，否则点按落在 readyAt 前不算产品缺陷
    await page.waitForFunction(() => window.__game.time > window.__game.player.readyAt + 0.5, null, { timeout: 60000 });
    return { ctx, page, errors };
  }

  try {
    // ---------- 横屏：布局、暂停、记分板、touchcancel、E14、旋转、后台 ----------
    for (const vp of VIEWPORTS) {
      console.log(`— 横屏 ${vp.w}×${vp.h} —`);
      const { ctx, page, errors } = await openMatch(vp, vp.tag);

      // 1) 触控件与 HUD 的真实包围盒（复核 layout-geometry / hud-geometry 的静态结论）
      const data = await page.evaluate(collectRectsInPage);
      const problems = checkLayout(data);
      ok(`${vp.tag}: 触控件与 HUD 的真实包围盒：视口内、≥44px、互不重叠、避开准星区`, problems.length === 0, problems.join('；'));
      await shot(page, `${vp.tag}-play`);

      // 2) 菜单 → 暂停界面 → 继续
      await tapEl(page, '[data-act="menu"]');
      await page.waitForFunction(() => window.__game.paused === true, null, { timeout: 5000 }).catch(() => {});
      ok(`${vp.tag}: 点菜单按钮暂停，并出现暂停界面`, await page.evaluate(() => window.__game.paused === true && !document.getElementById('pause').classList.contains('hidden')));
      await tapEl(page, '#btnResume');
      await page.waitForFunction(() => window.__game.paused === false, null, { timeout: 5000 }).catch(() => {});
      ok(`${vp.tag}: 点“继续”恢复对局`, await page.evaluate(() => window.__game.paused === false));

      // 只在两个代表性视口上跑行为检查，控制耗时
      if (vp.tag === 'l844x390' || vp.tag === 'l667x375') {
        // 3) 记分板切换
        await tapEl(page, '[data-act="board"]');
        await page.waitForTimeout(400);
        ok(`${vp.tag}: 记分板按钮开启后显示记分板`, await page.evaluate(() => !document.getElementById('board').classList.contains('hidden')));
        await tapEl(page, '[data-act="board"]');
        await page.waitForTimeout(400);
        ok(`${vp.tag}: 再点一次关闭记分板`, await page.evaluate(() => document.getElementById('board').classList.contains('hidden')));

        // 4) touchcancel 释放开火（不依赖真实手势：直接派发 TouchEvent，与 accept-workflows 一致）
        const cancelOk = await page.evaluate(() => {
          const b = document.querySelector('#touch [data-act="fire"]');
          const p = window.__game.player;
          b.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true }));
          const held = p.touch.fire === true;
          b.dispatchEvent(new TouchEvent('touchcancel', { bubbles: true, cancelable: true }));
          return { held, released: p.touch.fire === false };
        });
        ok(`${vp.tag}: 开火按钮被 touchcancel 打断后释放`, cancelOk.held && cancelOk.released, JSON.stringify(cancelOk));

        // 5) E14：点按视角区不应因合成鼠标事件开火；开火按钮是正对照
        await page.evaluate(() => { window.__mousedowns = 0; document.getElementById('c').addEventListener('mousedown', () => window.__mousedowns++); });
        const shots0 = await page.evaluate(() => window.__game.player.stats.shots);
        await page.touchscreen.tap(Math.round(vp.w * 0.62), Math.round(vp.h * 0.5));
        await page.waitForTimeout(800);
        const shots1 = await page.evaluate(() => window.__game.player.stats.shots);
        const mousedowns = await page.evaluate(() => window.__mousedowns);
        ok(`${vp.tag}: E14 点按视角区不开火（合成 mousedown 到达画布 ${mousedowns} 次）`, shots1 === shots0, `shots ${shots0} → ${shots1}`);
        await tapEl(page, '[data-act="fire"]');
        await page.waitForFunction((n) => window.__game.player.stats.shots > n, shots1, { timeout: 4000 }).catch(() => {});
        const shots2 = await page.evaluate(() => window.__game.player.stats.shots);
        ok(`${vp.tag}: E14 正对照——点开火按钮会开火`, shots2 > shots1, `shots ${shots1} → ${shots2}`);

        // 6) 旋转：竖屏遮罩 + 自动暂停；回横屏不自动继续
        await page.setViewportSize({ width: vp.h, height: vp.w });
        await page.waitForTimeout(500);
        const rotated = await page.evaluate(() => { const g = document.getElementById('rotateGuard'); return { shown: !!g && getComputedStyle(g).display !== 'none', paused: window.__game.paused }; });
        ok(`${vp.tag}: 对局中转竖屏：出现横屏遮罩并自动暂停`, rotated.shown && rotated.paused, JSON.stringify(rotated));
        await shot(page, `${vp.tag}-portrait-guard`);
        await page.setViewportSize({ width: vp.w, height: vp.h });
        await page.waitForTimeout(500);
        const back = await page.evaluate(() => { const g = document.getElementById('rotateGuard'); return { shown: !!g && getComputedStyle(g).display !== 'none', paused: window.__game.paused }; });
        ok(`${vp.tag}: 回到横屏：遮罩消失，且仍停留在暂停（不自动继续）`, !back.shown && back.paused, JSON.stringify(back));
        await tapEl(page, '#btnResume');
        await page.waitForFunction(() => window.__game.paused === false, null, { timeout: 5000 }).catch(() => {});

        // 7) 切后台：覆盖 document.hidden 后派发 visibilitychange
        await page.evaluate(() => {
          Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
          Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
          document.dispatchEvent(new Event('visibilitychange'));
        });
        await page.waitForTimeout(300);
        const bg = await page.evaluate(() => ({ paused: window.__game.paused, audio: window.__game.audio && window.__game.audio.ctx ? window.__game.audio.ctx.state : 'none' }));
        ok(`${vp.tag}: 切后台自动暂停并挂起音频`, bg.paused && bg.audio !== 'running', JSON.stringify(bg));
      }

      ok(`${vp.tag}: 无页面脚本异常`, errors.length === 0, errors.join(' | '));
      await ctx.close();
    }

    // ---------- 竖屏：大厅可用，点开始后被横屏遮罩拦下 ----------
    console.log(`— 竖屏 ${PORTRAIT.w}×${PORTRAIT.h}（大厅 → 开始）—`);
    {
      const ctx = await browser.newContext({ viewport: { width: PORTRAIT.w, height: PORTRAIT.h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, userAgent: IPHONE_UA });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
      results.consoleErrors[PORTRAIT.tag] = errors;
      await page.goto(`http://127.0.0.1:${PORT}/index.html?nolock=1&q=low&touch=1`, { waitUntil: 'load', timeout: 90000 });
      await page.waitForSelector('#menu:not(.hidden)', { timeout: 60000 });
      const lobby = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - window.innerWidth, start: (() => { const r = document.getElementById('btnStart').getBoundingClientRect(); return { ok: r.width > 0 && r.left >= -1 && r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 1 }; })() }));
      ok(`${PORTRAIT.tag}: 竖屏大厅无横向溢出，开始按钮可见且在视口内`, lobby.overflow <= 1 && lobby.start.ok, JSON.stringify(lobby));
      await shot(page, `${PORTRAIT.tag}-lobby`);
      await tapEl(page, '#btnStart');
      await page.waitForFunction(() => window.__game && window.__game.playing === true, null, { timeout: 90000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const guard = await page.evaluate(() => { const g = document.getElementById('rotateGuard'); return { shown: !!g && getComputedStyle(g).display !== 'none', paused: window.__game.paused }; });
      ok(`${PORTRAIT.tag}: 竖屏的大厅里点开始：被横屏遮罩拦下并暂停`, guard.shown && guard.paused, JSON.stringify(guard));
      await shot(page, `${PORTRAIT.tag}-start-guard`);
      ok(`${PORTRAIT.tag}: 无页面脚本异常`, errors.length === 0, errors.join(' | '));
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
    fs.writeFileSync(path.join(opts.out, 'accept-mobile-result.json'), JSON.stringify(results, null, 2));
  }

  console.log('\n以下项目 headless Chromium 无法验证，必须真机确认（未覆盖）：');
  for (const u of UNCOVERED) console.log(`  · ${u}`);
  console.log(failed === 0 ? '\n全部通过（仅限上面覆盖的部分）' : `\n${failed} 项失败`);
  return failed === 0 ? 0 : 1;
}

// 仅在直接运行时执行；被单测 import 时只暴露上面的纯函数
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => process.exit(code), (e) => { console.error(e); process.exit(1); });
}
