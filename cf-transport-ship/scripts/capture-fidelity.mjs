// 本轮质感提升的固定机位采集：file:// 离线冒烟 + 基线/候选同机位截图 + 渲染统计。
// 与 capture-material.mjs 的差异：支持两张地图、第一人称枪械机位（向阳/背光）、
// file:// 冒烟、vmScene.environment 绑定状态取证（B1a 前后对照）。
// 用法：
//   node scripts/capture-fidelity.mjs --out artifacts/fidelity-baseline --map desert-grey --views spawn,gunback,overview,blSpawn,aLong,bTunnelLower
//   node scripts/capture-fidelity.mjs --out artifacts/fidelity-ship-base --map transport-ship --views spawn,gunback
//   node scripts/capture-fidelity.mjs --filesmoke --out artifacts/fidelity-filesmoke
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(root, 'dist', 'index.html');

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
}
const OUT = path.resolve(arg('--out', path.join(root, 'artifacts', 'fidelity-baseline')));
const MAP = arg('--map', 'desert-grey');
const Q = arg('--quality', 'medium');
const VIEWS = (arg('--views', 'spawn,gunback') || '').split(',').map((s) => s.trim()).filter(Boolean);
const FILESMOKE = process.argv.includes('--filesmoke');
const PORT = Number(arg('--port', '8945'));
fs.mkdirSync(OUT, { recursive: true });

// 有头 Chrome + 防节流参数：与 accept-gpu-pair 同参，保证截图与测量同环境。
const CHROME_ARGS = [
  '--window-size=1920,1080',
  '--window-position=0,0',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
];

function statsExpr() {
  return () => {
    const g = window.__game;
    const info = g?.renderer?.renderer?.info || {};
    return {
      fps: g?.fps ?? null,
      drawCalls: info.render?.calls ?? null,
      triangles: info.render?.triangles ?? null,
      textures: info.memory?.textures ?? null,
      geometries: info.memory?.geometries ?? null,
      vmEnvBound: !!g?.renderer?.vmScene?.environment,
      vmEnvIntensity: g?.renderer?.vmScene?.environmentIntensity ?? null,
      sceneEnvBound: !!g?.renderer?.scene?.environment,
      tod: g?.opts?.tod ?? null,
      map: g?.mapDesc?.id ?? null,
      quality: g?.opts?.quality ?? null,
      pageErrors: window.__pageErrors?.length ?? 0,
    };
  };
}

async function newPage(browser, url, viewport) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => {
    (page.__errors ||= []).push(String(e));
    // 同步进页面侧，便于 stats 一并带出
    page.evaluate((n) => { (window.__pageErrors ||= []).push(n); }, String(e)).catch(() => {});
  });
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  return page;
}

async function waitAlive(page, timeout = 90000) {
  await page.waitForFunction(() => window.__game?.player?.alive && window.__game?.playing, null, { timeout });
  // 沙漠灰等图片贴图就绪，避免开场白闪截图
  await page.waitForFunction(() => {
    const mats = window.__game?.map?.materials;
    if (!mats) return true;
    return ['plaster', 'sand'].every((k) => {
      const img = mats[k]?.mat?.map?.image;
      return !img || (img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0);
    });
  }, null, { timeout: 90000 }).catch(() => {});
  await page.waitForFunction(() => window.__game.realTime > 1.2, null, { timeout: 30000 });
}

async function waitFrame(page) {
  const t0 = await page.evaluate(() => window.__game.realTime);
  await page.waitForFunction((t) => window.__game.realTime > t + 0.3, t0, { timeout: 10000 });
}

const run = async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Google Chrome.app/Contents/MacOS/Google Chrome'.replace('Google Google', 'Google'),
    headless: false,
    args: CHROME_ARGS,
  });
  const results = { out: OUT, captures: [], filesmoke: null };
  try {
    if (FILESMOKE) {
      // file:// 离线打开冒烟：两图各一次，记录存活/错误/VM 绑定
      for (const map of ['desert-grey', 'transport-ship']) {
        const page = await newPage(browser, `file://${DIST}?map=${map}&q=medium&nolock=1&autostart=1`, { width: 1280, height: 720 });
        let ok = true;
        try { await waitAlive(page); } catch { ok = false; }
        await waitFrame(page).catch(() => {});
        const stats = await page.evaluate(statsExpr());
        const shot = path.join(OUT, `filesmoke-${map}.png`);
        await page.screenshot({ path: shot });
        results.filesmoke = results.filesmoke || [];
        results.filesmoke.push({ map, ok, ...stats, url: `file://${DIST}` });
        await page.close();
      }
    } else {
      const server = await startServer(PORT);
      try {
        const page = await newPage(browser, `http://127.0.0.1:${PORT}/index.html?map=${MAP}&q=${Q}&nolock=1&autostart=1`, { width: 1920, height: 1080 });
        await waitAlive(page);
        const stats = await page.evaluate(statsExpr());
        results.captures.push({ view: '__page__', ...stats });

        const isDesert = MAP === 'desert-grey';
        // 第一人称机位：暂停模拟但保持存活，UI 可见（与用户原图同构）
        await page.evaluate(() => { window.__game.paused = true; });
        await waitFrame(page);
        if (VIEWS.includes('spawn')) {
          await page.screenshot({ path: path.join(OUT, `${MAP}-spawn.png`) });
          results.captures.push({ view: 'spawn', done: true });
        }
        if (VIEWS.includes('gunback')) {
          // 暂停状态下 vm 相机不随 yaw 更新：利用出生保护窗口短暂恢复模拟让偏航传播
          await page.evaluate(() => { const g = window.__game; g.paused = false; g.player.yaw += Math.PI; });
          await waitFrame(page);
          await page.evaluate(() => { window.__game.paused = true; });
          await waitFrame(page);
          await page.screenshot({ path: path.join(OUT, `${MAP}-gunback.png`) });
          results.captures.push({ view: 'gunback', done: true });
          await page.evaluate(() => { const g = window.__game; g.paused = false; g.player.yaw -= Math.PI; });
          await waitFrame(page);
          await page.evaluate(() => { window.__game.paused = true; });
          await waitFrame(page);
        }
        // 场景机位：隐藏 UI（与 capture-material 同构）
        await page.evaluate(() => { document.querySelector('#ui').style.display = 'none'; });
        const landmarks = await page.evaluate(() => {
          const g = window.__game;
          const byId = new Map((g.map.landmarkViews || []).map((v) => [v.id, v]));
          return [...byId.keys()].map((id) => byId.get(id)).filter(Boolean)
            .map((v) => ({ id: v.id, position: v.position, lookAt: v.lookAt }));
        });
        for (const id of VIEWS) {
          if (id === 'spawn' || id === 'gunback') continue;
          const lm = landmarks.find((v) => v.id === id);
          if (!lm) { results.captures.push({ view: id, skipped: 'no landmark' }); continue; }
          await page.evaluate((v) => {
            const g = window.__game;
            const c = g.renderer.camera;
            c.position.set(v.position.x, v.position.y, v.position.z);
            c.lookAt(v.lookAt.x, v.lookAt.y, v.lookAt.z);
            c.fov = 70; c.updateProjectionMatrix();
          }, lm);
          await waitFrame(page);
          await page.screenshot({ path: path.join(OUT, `${MAP}-${id}.png`) });
          results.captures.push({ view: id, done: true });
        }
        // 结束后再取一次 stats（含截图过程中的累计 draw calls）
        const stats2 = await page.evaluate(statsExpr());
        results.captures.push({ view: '__final__', ...stats2 });
        await page.close();
      } finally {
        await server.close();
      }
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(OUT, `capture-fidelity-${MAP}${FILESMOKE ? '-filesmoke' : ''}.json`), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
};

run().catch((e) => { console.error(e); process.exit(1); });
