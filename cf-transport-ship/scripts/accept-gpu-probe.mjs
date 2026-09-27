// E 波收口修复探针：运输船 1080p 中画质瓶颈定位（删减法，每态 20s 真实渲染）。
// 只读测量：通过运行时状态开关（ocean 可见性 / pixelRatio / 阴影 / 指数雾），不改产品代码。
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const srv = await startServer(8933);
const browser = await chromium.launch({ executablePath: CHROME, headless: false, args: ['--window-size=1920,1080'] });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:8933/index.html?map=transport-ship&nolock=1&q=medium&autostart=1', { waitUntil: 'load' });
await page.waitForFunction(() => window.__game && window.__game.player && window.__game.player.alive, null, { timeout: 120000 });
await page.evaluate(() => { const g = window.__game; g.goal = 1e9; g.timeLeft = 1e9; });

const trials = [
  { label: 'baseline', apply: () => {} },
  { label: 'oceanHidden', apply: () => { window.__game.env.ocean.visible = false; } },
  { label: 'pixelRatio1', apply: () => { window.__game.renderer.renderer.setPixelRatio(1); } },
  { label: 'noShadow', apply: () => { window.__game.renderer.renderer.shadowMap.enabled = false; window.__game.env.sun.castShadow = false; } },
  { label: 'baselineAgain', apply: () => { window.__game.env.ocean.visible = true; window.__game.renderer.renderer.shadowMap.enabled = true; window.__game.env.sun.castShadow = true; } },
];
const out = [];
for (const t of trials) {
  await page.evaluate(t.apply);
  await page.waitForTimeout(2500); // 切换沉降
  const samples = [];
  for (let i = 0; i < 10; i++) {
    samples.push(await page.evaluate(() => window.__game.fps || 0));
    await page.waitForTimeout(1000);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  out.push({ label: t.label, median: med, min: sorted[0], max: sorted[sorted.length - 1] });
  console.log(`  ${t.label}: median=${med} min=${sorted[0]} max=${sorted[sorted.length - 1]} samples=${samples.join(',')}`);
}
await browser.close(); srv.close();
console.log('[accept-gpu-probe]', JSON.stringify(out));
