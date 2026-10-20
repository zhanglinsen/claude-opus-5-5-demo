// Y8 上架媒体采集：用本机 Chrome 真实驱动 y8 构建包，产出提审所需的
// 五档规定尺寸截图（JPEG）与一段 ≥15s 的 1280×720 实机对局视频（webm 录制，
// ffmpeg 转 H.264 MP4）。用法：node scripts/capture-y8-media.mjs [--out artifacts/y8-media]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.resolve(arg('--out', path.join(ROOT, 'artifacts', 'y8-media')));
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.Y8_MEDIA_PORT || 8956);
const GAME = `http://127.0.0.1:${PORT}/y8/index.html?map=transport-ship&nolock=1&autostart=1&q=high`;

// Y8 提审槽位的精确尺寸（developer.y8.com Media 标签页要求）
const SHOTS = [
  { id: 'thumb', w: 760, h: 570 },           // Standard Screenshot
  { id: 'widescreen', w: 1280, h: 720 },     // Widescreen Screenshot
  { id: 'promo_landscape', w: 1920, h: 1080 }, // Landscape Promo
  { id: 'promo_portrait', w: 1080, h: 1920 },  // Portrait Promo (9:16)
  { id: 'promo_card', w: 760, h: 570 },      // Game Card Promo
];
const VIDEO = { w: 1280, h: 720, seconds: 36 }; // 16:9，远超 15s 下限

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
}

async function waitPlaying(page) {
  await page.waitForSelector('#menu:not(.hidden)', { timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.playing, null, { timeout: 60000 });
  await page.waitForFunction(() => window.__game.player && window.__game.player.alive, null, { timeout: 60000 });
}

// 让画面进入交战状态： bots 互相交火，玩家小幅移动/转视角/开火让画面有生命感
async function action(page, ms) {
  const until = Date.now() + ms;
  await page.keyboard.down('KeyW');
  while (Date.now() < until) {
    await page.mouse.move(200 + Math.random() * 300, 300 + Math.random() * 120);
    await page.mouse.down();
    await page.waitForTimeout(350);
    await page.mouse.up();
    await page.keyboard.down(Math.random() < 0.5 ? 'KeyA' : 'KeyD');
    await page.waitForTimeout(500);
    await page.keyboard.up(Math.random() < 0.5 ? 'KeyA' : 'KeyD');
  }
  await page.keyboard.up('KeyW');
}

const run = async () => {
  fs.mkdirSync(OUT, { recursive: true });
  if (!fs.existsSync(CHROME)) throw new Error(`未找到 Chrome：${CHROME}`);
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: false, // 真 GPU 渲染，商店图才有代表性（与 accept-* 脚本同参）
    args: ['--window-size=1920,1080', '--window-position=0,0',
      '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling'],
  });
  const srv = await startServer(PORT);
  try {
    // ---- 截图（每档尺寸独立 context，保证视口即输出分辨率）----
    for (const s of SHOTS) {
      const ctx = await browser.newContext({
        viewport: { width: s.w, height: s.h }, deviceScaleFactor: 1, locale: 'en-US',
      });
      const page = await ctx.newPage();
      await page.goto(GAME, { waitUntil: 'load', timeout: 90000 });
      await waitPlaying(page);
      await page.waitForTimeout(7000); // 等 bots 交火，画面有动作与特效
      const file = path.join(OUT, `${s.id}.jpg`);
      await page.screenshot({ path: file, type: 'jpeg', quality: 88 });
      console.log(`📸 ${s.id} ${s.w}x${s.h} -> ${file} (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
      await ctx.close();
    }
    // ---- 实机视频（recordVideo 输出 webm，ffmpeg 转 MP4）----
    const vctx = await browser.newContext({
      viewport: { width: VIDEO.w, height: VIDEO.h }, deviceScaleFactor: 1, locale: 'en-US',
      recordVideo: { dir: path.join(OUT, '_video'), size: { width: VIDEO.w, height: VIDEO.h } },
    });
    const vpage = await vctx.newPage();
    await vpage.goto(GAME, { waitUntil: 'load', timeout: 90000 });
    await waitPlaying(vpage);
    await action(vpage, VIDEO.seconds * 1000);
    await vpage.waitForTimeout(800);
    const vfile = await vpage.video().path();
    await vctx.close();
    const mp4 = path.join(OUT, 'gameplay.mp4');
    execFileSync('ffmpeg', ['-y', '-i', vfile, '-c:v', 'libx264', '-preset', 'medium',
      '-crf', '27', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4], { stdio: 'pipe' });
    const mb = fs.statSync(mp4).size / 1024 / 1024;
    console.log(`🎬 gameplay.mp4 (${mb.toFixed(1)} MB) -> ${mp4}`);
    fs.rmSync(path.join(OUT, '_video'), { recursive: true, force: true });
    console.log(`完成：媒体文件在 ${OUT}`);
  } finally {
    await browser.close().catch(() => {});
    await new Promise((r) => srv.close(r));
  }
};

run().catch((e) => { console.error(e); process.exit(1); });
