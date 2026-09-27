// 定向功能验证（本轮质感提升）：首次白天开局 / day→dusk→day 往返 / 重开 / 两图切换 的
// VM 环境绑定状态 + 页面错误。只读断言 + 少量截图，不替代 e2e。
// 用法：node scripts/verify-fidelity.mjs --out artifacts/fidelity-verify.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(path.join(root, 'artifacts', 'fidelity-verify.json'));
const PORT = 8946;
const results = [];
const pageErrors = [];

function ok(name, cond, detail = '') {
  results.push({ name, pass: !!cond, detail });
  console.log(`  ${cond ? '✔' : '✘'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) process.exitCode = 1;
}

function bindState() {
  const g = window.__game;
  return {
    vmEnv: !!g?.renderer?.vmScene?.environment,
    sceneEnv: !!g?.renderer?.scene?.environment,
    vmTex: g?.renderer?.vmScene?.environment?.texture ? 'rt.texture' : (g?.renderer?.vmScene?.environment ? 'other' : null),
    mainTex: g?.renderer?.scene?.environment?.texture ? 'rt.texture' : (g?.renderer?.scene?.environment ? 'other' : null),
    playing: !!g?.playing,
    alive: !!g?.player?.alive,
  };
}

async function waitAlive(page) {
  await page.waitForFunction(() => window.__game?.player?.alive && window.__game?.playing, null, { timeout: 90000 });
}

async function openMap(browser, base, map) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto(`${base}?map=${map}&q=medium&nolock=1&autostart=1`, { waitUntil: 'load', timeout: 60000 });
  await waitAlive(page);
  await page.waitForFunction(() => window.__game.realTime > 1.2, null, { timeout: 30000 });
  return page;
}

const run = async () => {
  const srv = await startServer(PORT);
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const base = `http://127.0.0.1:${PORT}/index.html`;
  try {
    for (const map of ['desert-grey', 'transport-ship']) {
      console.log(`# ${map}`);
      const page = await openMap(browser, base, map);
      // 1. 首次白天开局（构造器 apply('day') + game.apply('day') 缓存命中路径）
      let s = await page.evaluate(bindState);
      ok(`${map} 首次白天开局 VM 环境绑定`, s.vmEnv && s.sceneEnv, JSON.stringify(s));
      // 2. day→dusk（envKey 变化 → buildEnvMap 重建路径）
      await page.evaluate(() => window.__game.onOption('tod', 'dusk'));
      await page.waitForFunction(() => true); // yield
      s = await page.evaluate(bindState);
      ok(`${map} 切黄昏后 VM 绑定保持`, s.vmEnv && s.sceneEnv, JSON.stringify(s));
      // 3. dusk→day（envKey 回到构造器相同键 → 缓存命中路径，绑定不得丢失）
      await page.evaluate(() => window.__game.onOption('tod', 'day'));
      s = await page.evaluate(bindState);
      ok(`${map} 切回白天（缓存命中）VM 绑定保持`, s.vmEnv && s.sceneEnv, JSON.stringify(s));
      // 4. 重开（startMatch 内再次 apply 同键 → 缓存命中路径）
      await page.evaluate(() => window.__game.startMatch());
      await page.waitForFunction(() => window.__game?.player?.alive, null, { timeout: 30000 });
      s = await page.evaluate(bindState);
      ok(`${map} 重开后 VM 绑定保持`, s.vmEnv && s.sceneEnv, JSON.stringify(s));
      await page.close();
    }
    // 5. 两图切换（menu → 另一张图）：用 location 导航模拟真实切换路径
    console.log('# map switch');
    const page = await openMap(browser, base, 'desert-grey');
    await page.evaluate(() => { window.__game.hud.saveOpts?.(); });
    await page.goto(`${base}?map=transport-ship&q=medium&nolock=1&autostart=1`, { waitUntil: 'load', timeout: 60000 });
    await waitAlive(page);
    let s = await page.evaluate(bindState);
    ok('两图切换（沙漠灰→运输船）VM 环境绑定', s.vmEnv && s.sceneEnv, JSON.stringify(s));
    await page.close();
  } finally {
    await browser.close();
    await srv.close();
  }
  ok('无页面错误', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  fs.writeFileSync(OUT, JSON.stringify({ results, pageErrors }, null, 2));
  const pass = results.filter((r) => r.pass).length;
  console.log(`[verify-fidelity] ${pass}/${results.length} pass`);
};

run().catch((e) => { console.error(e); process.exit(1); });
