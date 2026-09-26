// 定向 e2e：window.localStorage 的**属性 getter** 在页面代码执行前即抛 SecurityError，
// 验证菜单仍能初始化、点击 #btnStart 可进入可玩对局，且全程无页面脚本异常。
// 仅覆盖该定向场景（全文 20/20 证据见 artifacts/e2e-results.json，互不覆盖）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ART = path.join(ROOT, 'artifacts');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 8907;
const results = [];
const pageErrors = [];

const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond, detail, driver: 'ui' });
  if (!cond) throw new Error(`E2E FAIL: ${name} ${detail}`);
  console.log(`  ✔ [ui] ${name}${detail ? ' — ' + detail : ''}`);
};

const run = async () => {
  fs.mkdirSync(ART, { recursive: true });
  if (!fs.existsSync(CHROME)) throw new Error(`未找到 Chrome：${CHROME}`);
  const srv = await startServer(PORT);
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  try {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 400 } });
    // 在任何页面脚本之前把 window.localStorage 重定义为抛错 getter（真实场景：安全策略拦截属性读取）
    await ctx.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() { throw new DOMException('denied', 'SecurityError'); },
      });
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    await page.goto(`http://127.0.0.1:${PORT}/index.html?nolock=1&q=low`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('#menu:not(.hidden)', { timeout: 60000 });
    ok('getter 抛错时菜单正常初始化', await page.evaluate(() => !!window.__game && Number.isFinite(window.__game.opts.sens)));
    // 设置接口走内存兜底，会话内可读写
    ok('设置经内存兜底可用', await page.evaluate(() => { window.__game.opts.map = 'desert-grey'; window.__game.hud.saveOpts(); return window.__game.opts.map; }) === 'desert-grey');
    await page.click('#btnStart');
    await page.waitForFunction(() => window.__game.playing && window.__game.player && window.__game.player.alive, null, { timeout: 60000 });
    ok('点击 #btnStart 进入可玩对局且玩家存活', true);
    await page.screenshot({ path: path.join(ART, 'e2e-storage-getter.png') });
    await ctx.close();
  } finally {
    await browser.close();
    srv.close();
  }
  ok('无页面脚本异常', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 400));

  const passed = results.filter((r) => r.pass).length;
  fs.writeFileSync(path.join(ART, 'e2e-storage-getter-results.json'), JSON.stringify({
    date: new Date().toISOString(),
    chrome: CHROME,
    scope: '定向场景：window.localStorage 属性 getter 抛错的启动与开局（全文冒烟证据另见 e2e-results.json）',
    results, pageErrors,
  }, null, 2));
  console.log(`\n定向 e2e（storage getter）：${passed}/${results.length} 通过；证据见 artifacts/e2e-storage-getter-*`);
  if (passed !== results.length) process.exit(1);
};

run().catch((e) => { console.error(e); process.exit(1); });
