// build:configured 轻量浏览器验证（SDK 脚本路由替身，无真实网络、无截图、headless）：
// 确认配置包真的走非 mock 适配器路径——Y8 init 收到正确 appId/gameId、GM 的
// window.SDK_OPTIONS 收到正确 gameId；加载期不自动请求广告（showAd/showBanner 计数为 0）。
// 官方 SDK 地址被路由拦截并以本地替身脚本应答（Y8: y8.sdk()/y8sdk.ready 语义；
// GM: SDK_OPTIONS.onEvent SDK_READY 语义），替身只记录调用，不模拟广告内容。
// 用法：node scripts/accept-configured-browser.mjs [--out artifacts/configured-platform]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(arg('--out', path.join(ROOT, 'artifacts', 'configured-platform')));
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.CONFIGURED_E2E_PORT || 8954);

// 与 platform-ids.json 一致（公开客户端 ID）
const REAL = {
  y8App: '6aba62bc25efe452cfc6c1b2',
  y8Game: '284915',
  gmGame: '6ju85rfh4ie5stg3q5xpw52cftpwcqsa',
};

const Y8_STUB = `
window.__Y8_INIT__ = null;
window.__Y8_SHOWAD_CALLS__ = 0;
window.y8 = {
  sdk: function () {
    return {
      init: function (appConfig, adConfig) { window.__Y8_INIT__ = { appConfig: appConfig, adConfig: adConfig }; return Promise.resolve(); },
      showAd: function () { window.__Y8_SHOWAD_CALLS__ += 1; return Promise.resolve({ breakStatus: 'no_fill' }); },
      getPlatformLocale: function () { return Promise.resolve('en'); },
    };
  },
  emitReadyEvent: function () { window.dispatchEvent(new Event('y8sdk.ready')); },
};
window.y8.emitReadyEvent();
`;

const GM_STUB = `
window.__GM_OPTIONS_SEEN__ = window.SDK_OPTIONS ? { gameId: window.SDK_OPTIONS.gameId || null } : null;
window.__GM_SHOWBANNER_CALLS__ = 0;
window.sdk = { showBanner: function () { window.__GM_SHOWBANNER_CALLS__ += 1; } };
if (window.SDK_OPTIONS && typeof window.SDK_OPTIONS.onEvent === 'function') {
  window.SDK_OPTIONS.onEvent({ name: 'SDK_READY' });
}
`;

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
}

const results = { tool: 'accept-configured-browser', startedAt: new Date().toISOString(), headless: true, checks: [], externalRequests: {}, consoleErrors: {} };

function ok(name, cond, detail = '') {
  results.checks.push({ name, pass: !!cond, detail: String(detail).slice(0, 300) });
  if (!cond) throw new Error(`ACCEPT FAIL: ${name} ${detail}`);
  console.log(`  ✔ ${name}${detail ? ' — ' + detail : ''}`);
}

// routes：[[urlPattern, stubBody]]，必须在 goto 前注册——保证官方 SDK 地址只被本地
// 替身应答，页面从不触达真实平台（也不拿测试流量打平台）。
async function newPage(ctx, url, tag, routes = []) {
  const page = await ctx.newPage();
  const log = { consoleErrors: [], external: [] };
  page.on('pageerror', (e) => log.consoleErrors.push('pageerror: ' + String(e)));
  page.on('console', (m) => { if (m.type() === 'error') log.consoleErrors.push(m.text()); });
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith('http://127.0.0.1') && !u.startsWith('data:') && !u.startsWith('blob:')) log.external.push(u);
  });
  for (const [pattern, body] of routes) {
    await page.route(pattern, (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body }));
  }
  await page.goto(url, { waitUntil: 'load', timeout: 90000 });
  results.consoleErrors[tag] = log.consoleErrors;
  results.externalRequests[tag] = log.external;
  return { page, log };
}

async function waitMenu(page) {
  await page.waitForSelector('#menu:not(.hidden)', { timeout: 60000 });
  await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
}

// 平台句柄就绪后采样：适配器身份（mock 路径是 offline）、mock 标记、替身记录的 ID/调用
async function sample(page) {
  return page.evaluate(async () => {
    const ready = await Promise.resolve(window.__game.platform.ready).catch(() => 'rejected');
    const a = window.__game.platform.adapter;
    return {
      platformReady: ready,
      adapterId: a && a.id,
      gmAdapterReady: a && typeof a.ready === 'boolean' ? a.ready : null,
      mockMarker: window.__PLATFORM_MOCK__ ?? null,
      htmlMock: document.documentElement.getAttribute('data-platform-mock'),
      y8Init: window.__Y8_INIT__ ?? null,
      y8ShowAds: window.__Y8_SHOWAD_CALLS__ ?? null,
      gmOptionsSeen: window.__GM_OPTIONS_SEEN__ ?? null,
      gmShowBanner: window.__GM_SHOWBANNER_CALLS__ ?? null,
    };
  });
}

const run = async () => {
  fs.mkdirSync(OUT, { recursive: true });
  if (!fs.existsSync(CHROME)) throw new Error(`未找到 Chrome：${CHROME}`);
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const srv = await startServer(PORT);

  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US' });

    // ============ Y8 配置包 ============
    console.log('A. Y8 配置包：非 mock 适配器路径 + init 收到正确双 ID + 加载期无广告');
    const y8Route = 'https://cdn.y8.com/minimal-sdk/2-0/y8.min.js';
    let y8p = await newPage(ctx, `http://127.0.0.1:${PORT}/configured/y8/index.html?nolock=1`, 'y8-configured', [[y8Route, Y8_STUB]]);
    await waitMenu(y8p.page);
    let s = await sample(y8p.page);
    ok('[y8] 走非 mock 适配器路径（adapterId=y8，非 offline）', s.adapterId === 'y8', `adapterId=${s.adapterId}`);
    ok('[y8] 无 mock 标记（window.__PLATFORM_MOCK__ / data-platform-mock 均无）', !s.mockMarker && !s.htmlMock, JSON.stringify({ mockMarker: s.mockMarker, htmlMock: s.htmlMock }));
    ok('[y8] 平台适配器 init 成功就绪', s.platformReady === true, `ready=${JSON.stringify(s.platformReady)}`);
    ok('[y8] sdk.init 收到正确 App ID', s.y8Init?.appConfig?.appId === REAL.y8App, JSON.stringify(s.y8Init?.appConfig ?? null));
    ok('[y8] sdk.init 收到正确 Game ID（adConfig.gameId）', s.y8Init?.adConfig?.gameId === REAL.y8Game, JSON.stringify(s.y8Init?.adConfig ?? null));
    ok('[y8] 加载期未自动请求广告（showAd 调用数=0）', s.y8ShowAds === 0, `showAds=${s.y8ShowAds}`);
    ok('[y8] 无未处理控制台错误', y8p.log.consoleErrors.length === 0, y8p.log.consoleErrors.join(' | '));
    ok('[y8] 外部请求仅为被替身拦截的官方 SDK 脚本', y8p.log.external.length === 1 && y8p.log.external[0] === y8Route, JSON.stringify(y8p.log.external));
    await y8p.page.close();

    // ============ GameMonetize 配置包 ============
    console.log('B. GameMonetize 配置包：非 mock 适配器路径 + SDK_OPTIONS 收到正确 gameId + 加载期无广告');
    const gmRoute = 'https://api.gamemonetize.com/sdk.js';
    const gmp = await newPage(ctx, `http://127.0.0.1:${PORT}/configured/gamemonetize/index.html?nolock=1`, 'gm-configured', [[gmRoute, GM_STUB]]);
    await waitMenu(gmp.page);
    s = await sample(gmp.page);
    ok('[gm] 走非 mock 适配器路径（adapterId=gamemonetize，非 offline）', s.adapterId === 'gamemonetize', `adapterId=${s.adapterId}`);
    ok('[gm] 无 mock 标记', !s.mockMarker && !s.htmlMock, JSON.stringify({ mockMarker: s.mockMarker, htmlMock: s.htmlMock }));
    ok('[gm] SDK_READY 后适配器就绪', s.platformReady === true && s.gmAdapterReady === true, `ready=${JSON.stringify(s.platformReady)} adapterReady=${s.gmAdapterReady}`);
    ok('[gm] window.SDK_OPTIONS 收到正确 gameId', s.gmOptionsSeen?.gameId === REAL.gmGame, JSON.stringify(s.gmOptionsSeen));
    ok('[gm] 加载期未自动请求广告（showBanner 调用数=0）', s.gmShowBanner === 0, `showBanner=${s.gmShowBanner}`);
    ok('[gm] 无未处理控制台错误', gmp.log.consoleErrors.length === 0, gmp.log.consoleErrors.join(' | '));
    ok('[gm] 外部请求仅为被替身拦截的官方 SDK 脚本', gmp.log.external.length === 1 && gmp.log.external[0] === gmRoute, JSON.stringify(gmp.log.external));
    await gmp.page.close();
    await ctx.close();

    results.finishedAt = new Date().toISOString();
    results.allPass = results.checks.every((c) => c.pass);
    fs.writeFileSync(path.join(OUT, 'browser-check.json'), JSON.stringify(results, null, 2));
    console.log(`\n全部通过：${results.checks.filter((c) => c.pass).length}/${results.checks.length} 项检查`);
    console.log(`结果：${path.join(OUT, 'browser-check.json')}`);
  } finally {
    await browser.close().catch(() => {});
    await new Promise((r) => srv.close(r));
  }
};

run().catch((e) => {
  results.finishedAt = new Date().toISOString();
  results.fatal = String(e);
  results.allPass = false;
  try { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'browser-check.json'), JSON.stringify(results, null, 2)); } catch (_) {}
  console.error(e);
  process.exit(1);
});
