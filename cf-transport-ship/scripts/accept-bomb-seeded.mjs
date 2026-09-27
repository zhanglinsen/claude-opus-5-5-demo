// 验收 1：固定种子爆破回合 ≥20（规格 verification：固定种子至少 20 爆破回合）。
// 方法：g.objectiveSeed 注入目标规划器 + fastForward 确定性模拟推进（非渲染证据，如实标记 sim）；
// 记录每回合胜方/原因/模拟时长；断言无页面异常、无卡死（每块推进的墙上时间有界）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ART = path.join(ROOT, 'artifacts');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 8921;
const SEEDS = (process.env.ACCEPT_SEEDS || '11,23,37,59').split(',').map((s) => parseInt(s, 10));
const TARGET_ROUNDS = 20;
const results = { rounds: [], matches: [], pageErrors: [], consoleErrors: [] };

const run = async () => {
  fs.mkdirSync(ART, { recursive: true });
  const srv = await startServer(PORT);
  const browser = await chromium.launch({
    executablePath: CHROME, headless: true,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const ctx = await browser.newContext({ viewport: { width: 960, height: 600 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => results.pageErrors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') results.consoleErrors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/index.html?map=desert-grey&nolock=1&q=low`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.hud, null, { timeout: 60000 });

  for (const seed of SEEDS) {
    if (results.rounds.length >= TARGET_ROUNDS) break;
    const m = await page.evaluate((seed) => {
      const g = window.__game;
      if (!g.__accWrapped) {
        g.__accWrapped = true;
        const orig = g.onBombEvents.bind(g);
        g.onBombEvents = (evs) => {
          for (const ev of evs) {
            if (ev.type === 'roundEnded') g.__accRounds.push({ winner: ev.winner, reason: ev.reason, simTime: +g.time.toFixed(1) });
            if (ev.type === 'matchEnded') g.__accMatchEnd = true;
          }
          orig(evs);
        };
      }
      g.__accRounds = [];
      g.__accMatchEnd = false;
      g.objectiveSeed = seed;
      g.startMatch();
      return { mode: g.mode.id, bots: g.actors.length - 1 };
    }, seed);
    const chunks = [];
    let ended = false, wall = 0;
    for (let i = 0; i < 60 && !ended; i++) {
      const t0 = Date.now();
      const r = await page.evaluate(() => {
        const g = window.__game;
        const t = performance.now();
        for (let k = 0; k < 40 && !g.__accMatchEnd; k++) g.fastForward(10); // 400s 模拟/块
        return { ended: g.__accMatchEnd, rounds: g.__accRounds.length, score: { ...g.score }, simTime: +g.time.toFixed(0) };
      });
      const dt = Date.now() - t0;
      chunks.push(dt);
      wall += dt;
      ended = r.ended;
      if (r.rounds >= 30) break; // 单场回合数保险
    }
    const rounds = await page.evaluate(() => window.__game.__accRounds.slice());
    results.matches.push({
      seed, mode: m.mode, bots: m.bots, roundsInMatch: rounds.length,
      matchEnded: ended, wallMs: wall, maxChunkMs: Math.max(...chunks, 0),
      rounds,
    });
    results.rounds.push(...rounds.map((r, i) => ({ seed, match: results.matches.length, idx: i + 1, ...r })));
    // 回到菜单，准备下一局（终止可能挂着的会话/计时）
    await page.evaluate(() => window.__game.quitToMenu());
  }

  await browser.close();
  srv.close();

  const reasons = [...new Set(results.rounds.map((r) => r.reason))];
  const stalls = results.matches.filter((m) => m.maxChunkMs > 30000);
  const summary = {
    totalRounds: results.rounds.length,
    matches: results.matches.length,
    reasons,
    pageErrors: results.pageErrors.length,
    consoleErrors: results.consoleErrors.length,
    stall: stalls.length > 0,
    allEnded: results.matches.every((m) => m.matchEnded),
  };
  fs.writeFileSync(path.join(ART, 'accept-bomb-seeded.json'), JSON.stringify({ summary, ...results }, null, 2));
  console.log('[accept-bomb-seeded]', JSON.stringify(summary));
  if (results.rounds.length < TARGET_ROUNDS || results.pageErrors.length || stalls.length || !summary.allEnded) process.exit(1);
};

run().catch((e) => { console.error(e); process.exit(1); });
