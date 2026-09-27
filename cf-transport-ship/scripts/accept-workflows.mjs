// 验收 4 + 5：双地图 × 双工作流（HTTP / file://）离线自包含冒烟 + 桌面/手机横屏触屏冒烟。
// 每个页面记录全部网络请求：HTTP 下只允许本机 127.0.0.1；file:// 下只允许 file:/data:/blob:。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ART = path.join(ROOT, 'artifacts');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 8923;
const DIST = path.join(ROOT, 'dist', 'index.html');
const results = [];

function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond, detail });
  console.log(`  ${cond ? '✔' : '✖'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) process.exitCode = 1;
}

async function smoke(ctx, url, allowed) {
  const page = await ctx.newPage();
  const requests = [];
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => requests.push(r.url()));
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.player && window.__game.player.alive, null, { timeout: 90000 });
  const external = requests.filter((u) => !allowed(u));
  const state = await page.evaluate(() => ({ map: window.__game.mapDesc.id, mode: window.__game.mode.id, alive: window.__game.player.alive }));
  page.close();
  return { requests, external, errors, state };
}

const run = async () => {
  fs.mkdirSync(ART, { recursive: true });
  const srv = await startServer(PORT);
  const browser = await chromium.launch({
    executablePath: CHROME, headless: true,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  try {
    const localAllowed = (u) => u.startsWith(`http://127.0.0.1:${PORT}`) || u.startsWith('data:') || u.startsWith('blob:');
    const fileAllowed = (u) => u.startsWith('file://') || u.startsWith('data:') || u.startsWith('blob:');

    // ---- 4. 双地图 × 双工作流 ----
    for (const map of ['transport-ship', 'desert-grey']) {
      const http = await smoke(await browser.newContext({ viewport: { width: 960, height: 600 } }),
        `http://127.0.0.1:${PORT}/index.html?map=${map}&nolock=1&q=low&autostart=1`, localAllowed);
      check(`HTTP 开局冒烟：${map}`, http.state.map === map && http.state.alive, `mode=${http.state.mode}`);
      check(`HTTP 离线自包含：${map}（全部请求本机）`, http.external.length === 0,
        `requests=${http.requests.length} external=${JSON.stringify(http.external.slice(0, 3))}`);
      results.push({ map, workflow: 'http', requests: http.requests });

      const file = await smoke(await browser.newContext({ viewport: { width: 960, height: 600 } }),
        `file://${DIST}?map=${map}&nolock=1&q=low&autostart=1`, fileAllowed);
      check(`file:// 开局冒烟：${map}`, file.state.map === map && file.state.alive, `mode=${file.state.mode}`);
      check(`file:// 离线自包含：${map}（全部请求本地文件/data）`, file.external.length === 0,
        `requests=${file.requests.length} external=${JSON.stringify(file.external.slice(0, 3))}`);
      results.push({ map, workflow: 'file', requests: file.requests });
    }

    // ---- 5. 手机横屏触屏冒烟（844×390 landscape + 触屏 UA + hasTouch）----
    const iPhoneUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    const mctx = await browser.newContext({
      viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, userAgent: iPhoneUA,
    });
    const mpage = await mctx.newPage();
    const merrors = [];
    mpage.on('pageerror', (e) => merrors.push(String(e)));
    await mpage.goto(`http://127.0.0.1:${PORT}/index.html?map=transport-ship&nolock=1&q=low&autostart=1&touch=1`, { waitUntil: 'load', timeout: 60000 });
    await mpage.waitForFunction(() => window.__game && window.__game.player && window.__game.player.alive, null, { timeout: 90000 });
    const touch = await mpage.evaluate(() => {
      const g = window.__game;
      const btns = [...document.querySelectorAll('#touch .btn')].map((b) => b.textContent);
      const visible = !document.getElementById('touch').classList.contains('hidden');
      return { enabled: g.touch.enabled, visible, btns, shots: g.player.stats.shots, y0: g.player.pos.y };
    });
    check('手机横屏：触屏模式启用且虚拟控件可见（844×390 landscape）',
      touch.enabled && touch.visible && touch.btns.length >= 6, `btns=${touch.btns.join('/')} viewport=844x390`);
    // 开火：真实 touchstart/touchend 派发到「开火」按钮
    // 软渲染帧率低：先等模拟时间越过出生 readyAt（0.3s），否则点按落在 readyAt 前不算产品缺陷
    await mpage.waitForFunction(() => window.__game.time > window.__game.player.readyAt + 0.5, null, { timeout: 60000 });
    await mpage.evaluate(() => {
      const b = [...document.querySelectorAll('#touch .btn')].find((x) => x.textContent === '开火');
      b.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true }));
    });
    await mpage.waitForTimeout(1500); // 跨多个渲染帧保持开火
    await mpage.evaluate(() => {
      const b = [...document.querySelectorAll('#touch .btn')].find((x) => x.textContent === '开火');
      b.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true }));
    });
    await mpage.waitForTimeout(300);
    // 移动：真实 touchstart/touchend 派发到「跳」按钮（移动性冒烟）
    const jump = await mpage.evaluate(async () => {
      const g = window.__game;
      const b = [...document.querySelectorAll('#touch .btn')].find((x) => x.textContent === '跳');
      const y0 = g.player.pos.y;
      b.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 500));
      return { jumped: g.player.pos.y > y0 + 0.05 || !g.player.onGround || g.player.vel.y !== 0 };
    });
    const afterFire = await mpage.evaluate(() => ({ shots: window.__game.player.stats.shots, errors: 0 }));
    check('手机触屏开火：开火按钮 → 实际射击（stats.shots 增加）', afterFire.shots > touch.shots,
      `shots ${touch.shots} → ${afterFire.shots}`);
    check('手机触屏移动：跳跃按钮 → 角色离地', jump.jumped, '');
    check('手机横屏：无页面异常', merrors.length === 0, `errors=${merrors.length}`);
    await mpage.close();
    await mctx.close();
  } finally {
    await browser.close();
    srv.close();
  }
  fs.writeFileSync(path.join(ART, 'accept-workflows.json'), JSON.stringify(results, null, 2));
  const fails = results.filter((r) => r.pass === false).length;
  console.log(`[accept-workflows] ${results.filter((r) => r.pass).length}/${results.filter((r) => r.pass !== undefined).length} 通过`);
  if (fails) process.exit(1);
};

run().catch((e) => { console.error(e); process.exit(1); });
