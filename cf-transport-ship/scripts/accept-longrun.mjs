// 验收 2 + 3：≥600s 真实 rAF 渲染长跑（每 5s 抽样）+ 同页 10 次连续重开资源趋稳。
// 真实渲染：不调用 fastForward，rAF 自然推进；headless SwiftShader（渲染器如实记录，
// 不作为 GPU 性能证据——GPU 数据见 accept-gpu.mjs）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ART = path.join(ROOT, 'artifacts');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 8922;
const DURATION = parseInt(process.env.ACCEPT_LONGRUN_S || '600', 10);
const results = { renderer: '', samples: [], restarts: [], pageErrors: [], consoleErrors: [] };

const run = async () => {
  fs.mkdirSync(ART, { recursive: true });
  const srv = await startServer(PORT);
  // 有头运行：headless 页面在本机会被 rAF 节流到 ~1fps（两次实测，短窗口探针则正常），
  // 无法承载 600s 真实渲染长跑；改用有头真窗口（可见、GPU 合成），证据更强。
  const browser = await chromium.launch({
    executablePath: CHROME, headless: false,
    args: ['--window-size=1280,720'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => results.pageErrors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') results.consoleErrors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/index.html?map=transport-ship&nolock=1&q=low&autostart=1`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.player && window.__game.player.alive, null, { timeout: 60000 });

  results.renderer = await page.evaluate(() => {
    const gl = document.getElementById('c').getContext('webgl2') || document.getElementById('c').getContext('webgl');
    if (!gl) return 'unknown';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : String(gl.getParameter(gl.RENDERER));
  });
  // 长跑：关闭对局时限/目标，保持全程活跃模拟（不修改任何产品代码，仅运行时状态）；
  // 注入节流免疫的 rAF 真实帧计数（g.fps 按 clamp 后 dt 统计，页面被节流时会虚报）
  await page.evaluate(() => {
    const g = window.__game;
    g.goal = 1e9; g.timeLeft = 1e9;
    g.__rafCount = 0;
    const count = () => { g.__rafCount++; requestAnimationFrame(count); };
    requestAnimationFrame(count);
  });

  // ---- 600s 真实渲染抽样（每 5s）----
  const nSamples = Math.ceil(DURATION / 5) + 1;
  let lastRaf = 0;
  for (let i = 0; i < nSamples; i++) {
    const s = await page.evaluate((lastRaf) => {
      const g = window.__game;
      let meshes = 0;
      g.renderer.scene.traverse((o) => { if (o.isMesh) meshes++; });
      return {
        wall: +(performance.now() / 1000).toFixed(1),
        simTime: +g.time.toFixed(1),
        fps: g.fps || 0,
        rafPerSec: +((g.__rafCount - lastRaf) / 5).toFixed(1), // 真实每秒帧数（墙钟）
        heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
        alive: g.actors.filter((a) => a.alive).length,
        actors: g.actors.length,
        meshes,
      };
    }, lastRaf);
    lastRaf = await page.evaluate(() => window.__game.__rafCount);
    results.samples.push(s);
    if (i < nSamples - 1) await page.waitForTimeout(5000);
  }

  // ---- 同页 10 次连续重开资源趋稳 ----
  for (let i = 1; i <= 10; i++) {
    await page.evaluate(() => window.__game.startMatch());
    await page.waitForTimeout(2500); // 等若干真实帧 + 资源分配沉降
    const r = await page.evaluate(() => {
      const g = window.__game;
      let meshes = 0;
      g.renderer.scene.traverse((o) => { if (o.isMesh) meshes++; });
      const info = g.renderer.renderer.info;
      return {
        heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
        geometries: info.memory.geometries, textures: info.memory.textures,
        programs: info.programs ? info.programs.length : -1,
        meshes, playing: g.playing, alive: g.player && g.player.alive,
      };
    });
    results.restarts.push({ i, ...r });
  }

  await browser.close();
  srv.close();

  // ---- 断言与摘要 ----
  const heaps = results.samples.map((s) => s.heapMB).filter((v) => v != null);
  const n = heaps.length;
  const slope = (() => { // 最小二乘斜率 MB/样本（5s/样本）
    const xs = heaps.map((_, i) => i), ys = heaps;
    const mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
    return num / den;
  })();
  const seg = (a, b) => {
    const hs = heaps.slice(a, b);
    return +(hs.reduce((x, y) => x + y) / hs.length).toFixed(1);
  };
  const fpsVals = results.samples.map((s) => s.fps);
  const rafVals = results.samples.slice(1).map((s) => s.rafPerSec);
  const rafMedian = rafVals.slice().sort((a, b) => a - b)[Math.floor(rafVals.length / 2)];
  const textures = results.restarts.map((r) => r.textures);
  const texturesMonotonic = textures.every((v, i) => i === 0 || v >= textures[i - 1]);
  const summary = {
    renderer: results.renderer,
    durationS: DURATION,
    simTimeEnd: results.samples[results.samples.length - 1].simTime,
    samples: n,
    fpsMedian: fpsVals.slice().sort((a, b) => a - b)[Math.floor(n / 2)],
    rafPerSecMedian: rafMedian, // 真实墙钟帧率（节流免疫）
    heap: { head: seg(0, 5), mid: seg(Math.floor(n / 2) - 2, Math.floor(n / 2) + 3), tail: seg(n - 5, n), slopeMBPerSample: +slope.toFixed(4), slopeMBPerMin: +(slope * 12).toFixed(2) },
    pageErrors: results.pageErrors.length,
    consoleErrors: results.consoleErrors.length,
    simRan: results.samples[results.samples.length - 1].simTime > DURATION * 0.5, // 软渲染下 dt 0.1 封顶，允许 ≥0.5×
    renderingLive: rafMedian >= 5,
    restarts: results.restarts,
    restartHeapFirst3: +(results.restarts.slice(0, 3).reduce((a, r) => a + r.heapMB, 0) / 3).toFixed(1),
    restartHeapLast3: +(results.restarts.slice(-3).reduce((a, r) => a + r.heapMB, 0) / 3).toFixed(1),
    restartGeos: results.restarts.map((r) => r.geometries),
    restartTextures: textures,
    restartTexturesMonotonic: texturesMonotonic, // 已知发现：名牌 CanvasTexture 未 dispose，见报告
    restartMeshes: results.restarts.map((r) => r.meshes),
  };
  fs.writeFileSync(path.join(ART, 'accept-longrun.json'), JSON.stringify({ summary, samples: results.samples, restarts: results.restarts, pageErrors: results.pageErrors, consoleErrors: results.consoleErrors }, null, 2));
  console.log('[accept-longrun]', JSON.stringify(summary, null, 1));
  // 硬失败：页面异常 / 渲染未真实推进 / 内存持续线性增长 / 重开后未恢复
  const fail = results.pageErrors.length > 0 || !summary.simRan || !summary.renderingLive
    || summary.heap.slopeMBPerMin > 30
    || summary.restartHeapLast3 > summary.restartHeapFirst3 * 1.2 + 30
    || results.restarts.some((r) => !r.playing);
  if (fail) process.exit(1);
};

run().catch((e) => { console.error(e); process.exit(1); });
