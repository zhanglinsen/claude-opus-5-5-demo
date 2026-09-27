// P 路配对测量：同机串行测量最终候选与基线工作树（如 c935ace 运输船旧基线）。
// 与 accept-gpu.mjs 的差异：多 root（各自 dist）、防节流 Chrome 参数、负载全程采样、
// 输出文件由 --out 指定（绝不写 accept-gpu.json / accept-gpu-*.png，避免覆盖既有证据）。
// 用法：
//   node scripts/accept-gpu-pair.mjs --out artifacts/xxx.json \
//     --roots '{"cand":"/path/cf-transport-ship","base":"/tmp/cf-ship-baseline-p/cf-transport-ship"}' \
//     --runs '[{"root":"cand","map":"desert-grey","label":"cand-desert","s":65}]'
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAIN_ART = path.join(HERE, '..', 'artifacts');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
}

function loadAvg() {
  try {
    const s = execSync('sysctl -n vm.loadavg', { encoding: 'utf8' });
    const m = s.match(/[\d.]+/g);
    return m ? m.slice(0, 3).map(Number) : null;
  } catch { return null; }
}

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon' };
function startServer(root, port) {
  const dist = path.join(root, 'dist');
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const f = path.join(dist, urlPath === '/' ? 'index.html' : urlPath);
      if (!f.startsWith(dist) || !fs.existsSync(f) || !fs.statSync(f).isFile()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(f).pipe(res);
    });
    srv.once('error', reject);
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

const OUT = path.resolve(arg('--out', ''));
if (!OUT || OUT.endsWith('accept-gpu.json')) {
  console.error('必须用 --out 指定新输出文件，且禁止写 accept-gpu.json');
  process.exit(1);
}
// 逐轮持久化：任一轮崩溃（如沙箱拦截 Chrome）都不丢已完成轮次的原始数据
function persist() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
}
const roots = JSON.parse(arg('--roots', '{}'));
const runs = JSON.parse(arg('--runs', '[]'));
const BASE_PORT = 8930;

const results = {
  tool: 'accept-gpu-pair',
  startedAt: new Date().toISOString(),
  chromeArgs: ['--window-size=1920,1080', '--window-position=0,0',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
  viewport: '1920x1080', quality: 'medium', loadBeforeAll: loadAvg(), runs: [], renderer: '',
};

const browser = await chromium.launch({ executablePath: CHROME, headless: false, args: results.chromeArgs });
let lastRoot = null, srv = null, port = BASE_PORT;

try {
  for (const spec of runs) {
    const root = roots[spec.root];
    if (!root) throw new Error(`unknown root key: ${spec.root}`);
    if (root !== lastRoot) {
      if (srv) await new Promise((r) => srv.close(r));
      port += 1;
      srv = await startServer(root, port);
      lastRoot = root;
      await new Promise((r) => setTimeout(r, 300));
    }
    const s = spec.s || 65;
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('crash', () => errors.push('page crashed'));

    const loadSeries = [];
    const rec = () => { const l = loadAvg(); if (l) loadSeries.push({ t: +(performance.now() / 1000).toFixed(1), load: l }); };
    rec();
    const loadBefore = loadAvg();

    await page.goto(`http://127.0.0.1:${port}/index.html?map=${spec.map}&nolock=1&q=medium&autostart=1`, { waitUntil: 'load', timeout: 90000 });
    await page.waitForFunction(() => window.__game && window.__game.player && window.__game.player.alive, null, { timeout: 120000 });
    // B4：统一排除启动零帧——所有轮次 simTime>=1 才开始采样（否则启动 0 FPS 帧把 P5 打穿）
    await page.waitForFunction(() => window.__game && window.__game.time >= 1, null, { timeout: 60000 }).catch(() => {});
    const renderer = await page.evaluate(() => {
      const gl = document.getElementById('c').getContext('webgl2') || document.getElementById('c').getContext('webgl');
      if (!gl) return 'unknown';
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : String(gl.getParameter(gl.RENDERER));
    });

    const sampler = setInterval(rec, 10000);
    let navigations = 0;
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) navigations++; });
    const samples = [];
    const n = Math.ceil(s / 2);
    let i = 0;
    while (i < n && navigations <= 10) {
      let smp = null;
      try {
        smp = await page.evaluate(() => {
          const g = window.__game;
          // B4：renderer.info 在帧间读取时反映上一帧统计（autoReset），draw calls/三角形/纹理内存随帧率一并采样
          const info = g.renderer?.renderer?.info;
          return {
            t: +(performance.now() / 1000).toFixed(1), fps: g.fps || 0, quality: g.opts.quality, simTime: +g.time.toFixed(0),
            calls: info?.render?.calls ?? null, tris: info?.render?.triangles ?? null,
            textures: info?.memory?.textures ?? null, geometries: info?.memory?.geometries ?? null,
          };
        });
      } catch {
        // 页面导航（如回合重开整页 reload）销毁执行上下文：等游戏恢复后补采，不推进计数
        navigations++;
        rec();
        await page.waitForFunction(() => window.__game && window.__game.player && window.__game.player.alive, null, { timeout: 120000 }).catch(() => {});
        await page.waitForTimeout(1500);
        continue;
      }
      samples.push(smp);
      i++;
      if (i < n - 1) await page.waitForTimeout(2000);
    }
    clearInterval(sampler);
    const loadAfter = loadAvg();
    rec();

    const shot = path.join(MAIN_ART, `${path.basename(OUT, '.json')}-${spec.label || spec.map}.png`);
    await page.screenshot({ path: shot });
    await ctx.close();

    const fps = samples.map((x) => x.fps).sort((a, b) => a - b);
    const calls = samples.map((x) => x.calls).filter((x) => x != null).sort((a, b) => a - b);
    const med = fps[Math.floor(fps.length / 2)];
    const p5 = fps[Math.max(0, Math.floor(fps.length * 0.05))];
    const low = samples.filter((x) => x.fps > 0 && x.fps < 30).length;
    const run = {
      label: spec.label || spec.map, rootKey: spec.root, root, map: spec.map, seconds: s,
      renderer, samples: samples.length,
      simTimeStart: samples[0]?.simTime, simTimeEnd: samples[samples.length - 1]?.simTime,
      fps: { median: med, p5, max: fps[fps.length - 1], min: fps[0], series: samples.map((x) => x.fps) },
      drawCalls: calls.length ? { median: calls[Math.floor(calls.length / 2)], min: calls[0], max: calls[calls.length - 1] } : null,
      trisMedian: (() => { const t = samples.map((x) => x.tris).filter((x) => x != null).sort((a, b) => a - b); return t.length ? t[Math.floor(t.length / 2)] : null; })(),
      texturesMemory: samples[samples.length - 1]?.textures ?? null,
      geometriesMemory: samples[samples.length - 1]?.geometries ?? null,
      frameMsMedian: med > 0 ? +(1000 / med).toFixed(1) : null,
      lowFpsSamples: low, lowFpsPct: +((low / samples.length) * 100).toFixed(1),
      pageErrors: errors.length, errors: errors.slice(0, 5), navigations,
      loadBefore, loadDuring: loadSeries.map((x) => x.load[0]),
      loadAfter, screenshot: path.relative(path.dirname(OUT), shot),
    };
    results.runs.push(run);
    results.renderer = renderer;
    persist();
    console.log(`  ✔ [${run.label}] ${spec.map} renderer=${renderer} median=${med} p5=${p5} min=${fps[0]} load ${loadBefore?.[0]}→${loadAfter?.[0]}`);
  }
} finally {
  await browser.close().catch(() => {});
  if (srv) await new Promise((r) => srv.close(r));
}

results.finishedAt = new Date().toISOString();
results.loadAfterAll = loadAvg();
persist();
console.log('[accept-gpu-pair] 完成 →', OUT, JSON.stringify(results.runs.map((r) => ({ label: r.label, median: r.fps.median, p5: r.fps.p5 }))));
