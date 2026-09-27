// 渲染卡顿诊断：运行时包裹调用计时，不改游戏行为或保存设置。
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

const server = await startServer(8944);
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: false,
  args: ['--window-size=1920,1080'],
});
const results = [];
try {
  for (const map of (process.env.DIAGNOSE_MAPS || 'desert-grey,transport-ship').split(',')) {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:8944/index.html?map=${map}&q=medium&nolock=1&autostart=1`);
    await page.waitForFunction(() => window.__game?.player?.alive, null, { timeout: 120000 });
    await page.evaluate(() => {
      const g = window.__game;
      const times = window.__frameCost = { simulate: [], renderFrame: [], composer: [] };
      for (const key of ['simulate', 'renderFrame']) {
        const original = g[key].bind(g);
        g[key] = (...args) => {
          const t = performance.now();
          const value = original(...args);
          times[key].push(performance.now() - t);
          return value;
        };
      }
      const original = g.renderer.render.bind(g.renderer);
      g.renderer.render = (...args) => {
        const t = performance.now();
        const value = original(...args);
        times.composer.push(performance.now() - t);
        return value;
      };
    });
    await page.waitForTimeout(12000);
    const result = await page.evaluate(() => {
      const stats = (a) => {
        const s = a.slice().sort((x, y) => x - y);
        return { count: s.length, median: +(s[Math.floor(s.length / 2)] || 0).toFixed(2),
          p95: +(s[Math.floor(s.length * 0.95)] || 0).toFixed(2) };
      };
      return { fps: window.__game.fps, simulate: stats(window.__frameCost.simulate),
        renderFrame: stats(window.__frameCost.renderFrame), composer: stats(window.__frameCost.composer) };
    });
    results.push({ map, ...result });
    console.log(JSON.stringify(results.at(-1)));
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
