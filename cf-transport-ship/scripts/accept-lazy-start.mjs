// 聚焦启动验收：大厅先显示且没有 WebGL/地图；点击出击后才建图；
// 首次切图不重载；返回大厅后停止世界渲染；再次开局复用已建世界。
// 用法：npm run build:offline && node scripts/accept-lazy-start.mjs
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const PORT = Number(process.env.LAZY_E2E_PORT || 8972);
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const server = await startServer(PORT);
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
let failures = 0;
function check(label, passed, details = '') {
  console.log(`${passed ? '✔' : '✘'} ${label}${details ? `: ${details}` : ''}`);
  if (!passed) failures++;
}

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${PORT}/?nolock=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && !document.querySelector('#menu').classList.contains('hidden'), null, { timeout: 15000 });

  const initial = await page.evaluate(() => ({
    menu: !document.querySelector('#menu').classList.contains('hidden'),
    loading: !document.querySelector('#loading').classList.contains('hidden'),
    renderer: !!window.__game.renderer,
    world: !!window.__game.world,
  }));
  check('大厅先于地图与 WebGL 出现', initial.menu && !initial.loading && !initial.renderer && !initial.world, JSON.stringify(initial));

  await page.evaluate(() => { window.__lazyProbe = true; });
  await page.click('#mapSeg button[data-v="transport-ship"]');
  const switched = await page.evaluate(() => ({
    samePage: window.__lazyProbe === true,
    map: window.__game?.mapDesc?.id,
    renderer: !!window.__game?.renderer,
  }));
  check('首次选图即时更新大厅且不建图/重载', switched.samePage && switched.map === 'transport-ship' && !switched.renderer, JSON.stringify(switched));

  await page.evaluate(() => {
    const g = window.__game;
    g.__loadCount = 0;
    const loadWorld = g.loadWorld.bind(g);
    g.loadWorld = () => { g.__loadCount++; return loadWorld(); };
    document.querySelector('#btnStart').click();
    document.querySelector('#btnStart').click();
  });
  const loading = await page.evaluate(() => ({
    visible: !document.querySelector('#loading').classList.contains('hidden'),
    menuHidden: document.querySelector('#menu').classList.contains('hidden'),
  }));
  check('点击出击后才显示加载进度', loading.visible && loading.menuHidden, JSON.stringify(loading));
  await page.waitForFunction(() => window.__game?.playing === true, null, { timeout: 60000 });
  const started = await page.evaluate(() => ({
    map: window.__game.mapDesc.id,
    renderer: !!window.__game.renderer,
    world: !!window.__game.world,
    nav: !!window.__game.nav,
    hud: !document.querySelector('#hud').classList.contains('hidden'),
  }));
  check('世界按所选地图加载并进入对局', started.map === 'transport-ship' && started.renderer && started.world && started.nav && started.hud, JSON.stringify(started));
  check('连续点击仅创建一次世界', await page.evaluate(() => window.__game.__loadCount === 1));

  const idle = await page.evaluate(async () => {
    const g = window.__game;
    g.quitToMenu();
    let draws = 0;
    const original = g.renderer.render.bind(g.renderer);
    g.renderer.render = (...args) => { draws++; return original(...args); };
    await new Promise((resolve) => setTimeout(resolve, 320));
    g.renderer.render = original;
    return { draws, menu: !document.querySelector('#menu').classList.contains('hidden') };
  });
  check('返回大厅后世界渲染暂停', idle.menu && idle.draws <= 1, JSON.stringify(idle));

  await page.click('#btnStart');
  await page.waitForFunction(() => window.__game?.playing === true, null, { timeout: 15000 });
  check('再次出击复用已加载地图', await page.evaluate(() => window.__game.mapDesc.id === 'transport-ship' && window.__game.actors.length > 0));
  check('无脚本异常', errors.length === 0, errors.join(' | '));
  await page.close();

  const desertPage = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await desertPage.goto(`http://127.0.0.1:${PORT}/?map=desert-grey&nolock=1`, { waitUntil: 'load' });
  await desertPage.waitForFunction(() => window.__game && !document.querySelector('#menu').classList.contains('hidden'), null, { timeout: 15000 });
  await desertPage.click('#btnStart');
  await desertPage.waitForFunction(() => window.__game?.playing === true, null, { timeout: 60000 });
  check('离线沙漠灰按需加载', await desertPage.evaluate(() => window.__game.mapDesc.id === 'desert-grey' && !!window.__game.map));
  await desertPage.close();

  // 共用启动主控还用于两种平台包；各用一次 mock 包验证大厅/原创图的冷启动。
  for (const [target, map] of [['y8', 'platform-desert'], ['gamemonetize', 'platform-harbor']]) {
    const platformPage = await browser.newPage({ viewport: { width: 960, height: 540 } });
    const platformErrors = [];
    platformPage.on('pageerror', (e) => platformErrors.push(String(e)));
    await platformPage.goto(`http://127.0.0.1:${PORT}/${target}/index.html?nolock=1`, { waitUntil: 'load' });
    await platformPage.waitForFunction(() => window.__game && !document.querySelector('#menu').classList.contains('hidden'), null, { timeout: 15000 });
    check(`${target}: 原创图大厅先显示且没有 WebGL`, await platformPage.evaluate(() => {
      const g = window.__game;
      return g.mapDesc.id === 'platform-desert' && !g.renderer && !g.world && !!window.__PLATFORM_MOCK__;
    }));
    if (map !== 'platform-desert') {
      await platformPage.click(`#mapSeg button[data-v="${map}"]`);
      check(`${target}: 未建图时切原创地图`, await platformPage.evaluate((id) => window.__game.mapDesc.id === id && !window.__game.renderer, map));
    }
    await platformPage.click('#btnStart');
    await platformPage.waitForFunction(() => window.__game?.playing === true, null, { timeout: 60000 });
    check(`${target}: 点击后加载原创图`, await platformPage.evaluate((id) => {
      const g = window.__game;
      return g.mapDesc.id === id && !!g.renderer && !!g.world;
    }, map));
    check(`${target}: 无脚本异常`, platformErrors.length === 0, platformErrors.join(' | '));
    await platformPage.close();
  }

  const filePage = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const fileErrors = [];
  filePage.on('pageerror', (e) => fileErrors.push(String(e)));
  await filePage.goto(`${pathToFileURL(resolve('dist/index.html')).href}?nolock=1`, { waitUntil: 'load' });
  await filePage.waitForFunction(() => window.__game && !document.querySelector('#menu').classList.contains('hidden'), null, { timeout: 15000 });
  check('离线 HTML 直接打开先显示大厅、不建 WebGL', await filePage.evaluate(() => !window.__game.renderer && !window.__game.world));
  await filePage.click('#btnStart');
  await filePage.waitForFunction(() => window.__game?.playing === true, null, { timeout: 60000 });
  check('离线 HTML 直接打开后可进入游戏', await filePage.evaluate(() => !!window.__game.map && !!window.__game.renderer));
  check('离线 HTML 无脚本异常', fileErrors.length === 0, fileErrors.join(' | '));
  await filePage.close();

  const failurePage = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await failurePage.goto(`http://127.0.0.1:${PORT}/?nolock=1`, { waitUntil: 'load' });
  await failurePage.waitForFunction(() => !!window.__game, null, { timeout: 15000 });
  await failurePage.evaluate(() => { window.__game.loadWorld = () => Promise.reject(new Error('test-load-failure')); });
  await failurePage.click('#btnStart');
  await failurePage.waitForFunction(() => !document.querySelector('#menu').classList.contains('hidden') && !document.querySelector('#menuError').classList.contains('hidden'));
  check('建图失败返回大厅并显示错误', await failurePage.evaluate(() =>
    document.querySelector('#menuError').textContent.includes('test-load-failure') && !window.__game.playing));
  await failurePage.close();
} finally {
  await browser.close();
  server.close();
}
console.log(failures ? `${failures} 项失败` : '全部通过');
process.exitCode = failures ? 1 : 0;
