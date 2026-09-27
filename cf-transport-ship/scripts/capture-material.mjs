// 聚焦画面检查：在离线构建上截图沙漠灰关键机位，避免重复跑路线/规则验收。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'artifacts', 'visual-candidate');
fs.mkdirSync(output, { recursive: true });
const server = await startServer(8943);
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('http://127.0.0.1:8943/index.html?map=desert-grey&q=medium&nolock=1&autostart=1');
  try {
    await page.waitForFunction(() => window.__game?.player?.alive, null, { timeout: 90000 });
  } catch (e) {
    console.error('startup state', await page.evaluate(() => ({
      hasGame: !!window.__game, playing: window.__game?.playing,
      hasPlayer: !!window.__game?.player, loading: document.querySelector('#loading')?.className,
    })), errors);
    throw e;
  }
  await page.waitForFunction(() => {
    const materials = window.__game?.map?.materials;
    return ['plaster', 'sand'].every((key) => {
      const image = materials?.[key]?.mat?.map?.image;
      return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
    });
  }, null, { timeout: 90000 });
  await page.evaluate(() => {
    const g = window.__game; g.paused = true; g.player.alive = false;
    document.querySelector('#ui').style.display = 'none'; // 场景对照图只看地图本身
  });
  for (const id of (process.env.CAPTURE_IDS || 'aLong,bSite,bTunnelLower').split(',')) {
    await page.evaluate((viewId) => {
      const g = window.__game;
      const v = g.map.landmarkViews.find((x) => x.id === viewId);
      const c = g.renderer.camera;
      c.position.set(v.position.x, v.position.y, v.position.z);
      c.lookAt(v.lookAt.x, v.lookAt.y, v.lookAt.z);
      c.fov = 70; c.updateProjectionMatrix();
    }, id);
    const t0 = await page.evaluate(() => window.__game.realTime);
    await page.waitForFunction((t) => window.__game.realTime > t + 0.3, t0);
    await page.screenshot({ path: path.join(output, `${id}.png`) });
  }
  const stats = await page.evaluate(() => {
    const g = window.__game;
    return { fps: g.fps, drawCalls: g.renderer.renderer.info.render.calls,
      triangles: g.renderer.renderer.info.render.triangles,
      textures: g.renderer.renderer.info.memory.textures };
  });
  fs.writeFileSync(path.join(output, 'stats.json'), JSON.stringify({ ...stats, errors }, null, 2));
  console.log(JSON.stringify({ ...stats, errors }));
} finally {
  await browser.close();
  await server.close();
}
