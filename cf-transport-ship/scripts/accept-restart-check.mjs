// 验收 3 复查：10 次同页重开的 GPU 资源计数（phase-6-acceptance §3 纹理泄漏定向复查）。
// headless 即可：texture 计数在 startMatch 资源分配时产生，不依赖 rAF 帧率。
// 判定 v2（依据 20 次重开实测校准，见 .ultra/reports/flagship-c4.md）：
//  - 泄漏签名是「上行棘轮」而非双向抖动：普通抖动带宽实测 ±4（97↔101），GC/懒上传掉计数
//    后的回补（88→98）不越过历史高点，均非泄漏；故单步判据改为「超历史高点 +5 的跳变」。
//  - 缓慢阶梯泄漏（每回 +1~+3）由趋势捕捉：首尾 3 均差 |drift| ≤ 6（实测 −3.7 / 0.0）。
//  - geometries 同步分配、无抖动，但存在一次性惰性残留（实测 restart 4 起 +1 后连续 6 次恒定，
//    且基线随视觉 lane 改动漂移 154→150/151）；泄漏签名是逐次上行棘轮（每回 +1 → 9 个上行步、
//    极差 9）。判据：上行步 ≤2 且极差 ≤3。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ART = path.join(ROOT, 'artifacts');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 8930;

const run = async () => {
  const srv = await startServer(PORT);
  const browser = await chromium.launch({
    executablePath: CHROME, headless: true,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const ctx = await browser.newContext({ viewport: { width: 960, height: 600 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${PORT}/index.html?map=transport-ship&nolock=1&q=low&autostart=1`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.player && window.__game.player.alive, null, { timeout: 60000 });

  const restarts = [];
  for (let i = 1; i <= 10; i++) {
    await page.evaluate(() => window.__game.startMatch());
    await page.waitForTimeout(2500);
    const r = await page.evaluate(() => {
      const info = window.__game.renderer.renderer.info;
      return { textures: info.memory.textures, geometries: info.memory.geometries };
    });
    restarts.push({ i, ...r });
    console.log(`  restart ${i}: textures=${r.textures} geometries=${r.geometries}`);
  }
  await browser.close();
  srv.close();

  const tex = restarts.map((r) => r.textures);
  const geo = restarts.map((r) => r.geometries);
  // 跳变式增长：超出此前历史高点 +5 才计（回补/抖动不越过高点，不算）
  let growthSteps = 0, runningMax = -Infinity;
  for (let i = 0; i < tex.length; i++) {
    if (i > 0 && tex[i] > runningMax + 5) growthSteps++;
    runningMax = Math.max(runningMax, tex[i]);
  }
  // geometries 无累积棘轮：允许一次性惰性残留（≤2 个上行步、极差 ≤3），逐次 +1 的泄漏必触
  let geoUpSteps = 0;
  for (let i = 1; i < geo.length; i++) if (geo[i] > geo[i - 1]) geoUpSteps++;
  const geoRange = Math.max(...geo) - Math.min(...geo);
  const first3 = tex.slice(0, 3).reduce((a, b) => a + b) / 3;
  const last3 = tex.slice(-3).reduce((a, b) => a + b) / 3;
  const summary = {
    textures: tex, geometries: geo, geoUpSteps, geoRange, growthSteps,
    first3Avg: +first3.toFixed(1), last3Avg: +last3.toFixed(1), drift: +(last3 - first3).toFixed(1),
    pageErrors: errors.length,
    pass: growthSteps === 0 && geoUpSteps <= 2 && geoRange <= 3 && Math.abs(last3 - first3) <= 6 && errors.length === 0,
  };
  fs.mkdirSync(ART, { recursive: true });
  fs.writeFileSync(path.join(ART, 'accept-restart-check.json'), JSON.stringify({ summary, restarts, errors }, null, 2));
  console.log('[accept-restart-check]', JSON.stringify(summary));
  if (!summary.pass) process.exit(1);
};

run().catch((e) => { console.error(e); process.exit(1); });
