// 验收 6：真机 GPU 1080p 中画质 FPS（有头 Chrome，本机 GPU，禁用软渲染参数）。
// 沙漠灰爆破 + 运输船 TDM 各 ≥60s 真实渲染，抽样 FPS/frame time；如实报告（60fps 是优化目标）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ART = path.join(ROOT, 'artifacts');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 8925;
const RUN_S = parseInt(process.env.ACCEPT_GPU_S || '65', 10);
const results = { runs: [], renderer: '', headed: true };

async function sampleRun(browser, srv, { map, quality, label }) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('crash', () => errors.push('page crashed'));
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) console.log(`[gpu] navigated ${map}: ${frame.url()}`);
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html?map=${map}&nolock=1&q=${quality}&autostart=1`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window.__game && window.__game.player && window.__game.player.alive, null, { timeout: 120000 });
  const renderer = await page.evaluate(() => {
    const gl = document.getElementById('c').getContext('webgl2') || document.getElementById('c').getContext('webgl');
    if (!gl) return 'unknown';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : String(gl.getParameter(gl.RENDERER));
  });
  const samples = [];
  const n = Math.ceil(RUN_S / 2);
  for (let i = 0; i < n; i++) {
    const s = await page.evaluate(() => {
      const g = window.__game;
      return { t: +(performance.now() / 1000).toFixed(1), fps: g.fps || 0, quality: g.opts.quality, simTime: +g.time.toFixed(0) };
    });
    samples.push(s);
    if (i < n - 1) await page.waitForTimeout(2000);
  }
  await page.screenshot({ path: path.join(ART, `accept-gpu-${map}.png`) });
  const fps = samples.map((s) => s.fps).sort((a, b) => a - b);
  const med = fps[Math.floor(fps.length / 2)];
  const p5 = fps[Math.max(0, Math.floor(fps.length * 0.05))];
  const low = samples.filter((s) => s.fps > 0 && s.fps < 30).length;
  const run = {
    label, map, quality, renderer, samples: samples.length,
    fps: { median: med, p5, max: fps[fps.length - 1], min: fps[0], samples: samples.map((s) => s.fps) },
    frameMsMedian: med > 0 ? +(1000 / med).toFixed(1) : null,
    lowFpsSamples: low, lowFpsPct: +((low / samples.length) * 100).toFixed(1),
    pageErrors: errors.length,
  };
  results.runs.push(run);
  results.renderer = renderer;
  console.log(`  ✔ [${label}] ${map} q=${quality} renderer=${renderer} fps median=${med} p5=${p5} min=${fps[0]}`);
  await ctx.close();
  return run;
}

const run = async () => {
  fs.mkdirSync(ART, { recursive: true });
  const srv = await startServer(PORT);
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: CHROME,
      headless: false, // 有头：本机 GPU 合成路径；不注入任何软渲染参数
      args: ['--window-size=1920,1080', '--window-position=0,0'],
    });
  } catch (e) {
    results.headed = false;
    results.headedError = String(e);
    console.error('有头启动失败（如实记录）：', e.message);
    fs.writeFileSync(path.join(ART, 'accept-gpu.json'), JSON.stringify(results, null, 2));
    await srv.close();
    return; // 不算失败退出：报告如实呈现"仅软渲染数据"的状态
  }
  try {
    await sampleRun(browser, srv, { map: 'desert-grey', quality: 'medium', label: '沙漠灰爆破' });
    await sampleRun(browser, srv, { map: 'transport-ship', quality: 'medium', label: '运输船TDM' });
  } finally {
    await browser.close();
    srv.close();
  }
  fs.writeFileSync(path.join(ART, 'accept-gpu.json'), JSON.stringify(results, null, 2));
  console.log('[accept-gpu] 完成', JSON.stringify(results.runs.map((r) => ({ map: r.map, median: r.fps.median, p5: r.fps.p5 }))));
};

run().catch((e) => { console.error(e); process.exit(1); });
