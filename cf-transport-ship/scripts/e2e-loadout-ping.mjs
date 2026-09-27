// e2e-loadout-ping：Sol 终验四项中「装备预设决定出生主武器」与「伪造本地 ping」的定向浏览器场景。
// 复现原始缺陷条件：旧 opts.primary=M4A1、激活预设主武器=AK47 → 开局必须为 AK47；
// 计分板表头不得出现「延迟」列，角色对象不得携带伪造 ping。
// 驱动标记：ui=真实用户操作；sim=直接调游戏 API 构造场景（非性能证据）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ART = path.join(ROOT, 'artifacts');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 8913;
const results = [];
const consoleErrors = [];
const pageErrors = [];

function ok(name, cond, detail = '', driver = 'sim') {
  results.push({ name, pass: !!cond, driver, detail });
  if (!cond) throw new Error(`E2E FAIL: ${name} ${detail}`);
  console.log(`  ✔ [${driver}] ${name}${detail ? ' — ' + detail : ''}`);
}

const run = async () => {
  fs.mkdirSync(ART, { recursive: true });
  if (!fs.existsSync(CHROME)) throw new Error(`未找到 Chrome：${CHROME}`);
  const srv = await startServer(PORT);
  const browser = await chromium.launch({
    executablePath: CHROME, headless: true,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const URL_BASE = `http://127.0.0.1:${PORT}/index.html`;

  try {
    const ctx = await browser.newContext({ viewport: { width: 800, height: 500 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    await page.goto(`${URL_BASE}?map=desert-grey&q=low&nolock=1`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('#menu:not(.hidden)', { timeout: 60000 });
    await page.click('#btnStart');
    await page.waitForFunction(() => window.__game && window.__game.playing && window.__game.player, null, { timeout: 60000 });

    // ---- 1. Sol 原缺陷复现：旧 opts.primary=M4A1，预设 2 主武器=AK47，切到预设 2 后重开 ----
    const step1 = await page.evaluate(() => {
      const g = window.__game;
      g.opts.primary = 'm4a1';                       // 旧偏好 M4A1（曾优先生效的 legacy 值）
      const pa = g.profileAdapter;
      pa.setPresetSlot(2, 'primary', 'ak47');        // 预设 2 主武器 AK47
      pa.switchPreset(2);                            // 激活预设 2
      g.startMatch();                                // 重开 → 出生装备应由当前预设决定
      return { active: pa.presets().active, presetPrimary: pa.loadout().primary };
    });
    ok('预设 2 已激活且其主武器为 AK47', step1.active === 2 && step1.presetPrimary === 'ak47',
      JSON.stringify(step1), 'sim');
    await page.waitForFunction(() => window.__game && window.__game.playing && window.__game.player, null, { timeout: 60000 });
    const spawn = await page.evaluate(() => ({
      primary: window.__game.player.primary,
      nextPrimary: window.__game.player.nextPrimary || null,
      slot0: window.__game.player.inv[0]?.id || window.__game.player.inv[0]?.constructor?.name || null,
    }));
    ok('开局出生主武器 = 当前预设的 AK47（旧 opts.primary=M4A1 不再优先）',
      spawn.primary === 'ak47', JSON.stringify(spawn), 'sim');

    // ---- 2. 菜单改枪写入当前预设（chooseLoadout 双向同步）----
    const step2 = await page.evaluate(() => {
      const g = window.__game;
      g.chooseLoadout('awm');
      const pa = g.profileAdapter;
      const act = pa.presets().active;
      return { active: act, presetPrimary: pa.presets().list[act].primary, playerPrimary: g.player.primary };
    });
    ok('chooseLoadout(' + "'awm'" + ') 写入当前激活预设且出生区内立即生效',
      step2.presetPrimary === 'awm' && step2.playerPrimary === 'awm', JSON.stringify(step2), 'sim');

    // ---- 3. 计分板：无伪造「延迟」列，角色无 ping 字段 ----
    const step3 = await page.evaluate(() => {
      const g = window.__game;
      g.hud.scoreboard(true, g.actors, g.player.id, { BL: 0, GR: 0 });
      const board = document.getElementById('board');
      const html = board ? board.innerHTML : '';
      const pingField = g.actors.some((a) => 'ping' in a);
      return { hasBoard: !!board, hasDelayCol: html.includes('延迟'), hasPingField: pingField, hasKillCol: html.includes('击杀') };
    });
    ok('计分板表头无「延迟」列且保留击杀表头', step3.hasBoard && !step3.hasDelayCol && step3.hasKillCol,
      JSON.stringify(step3), 'ui');
    ok('所有角色对象不再携带伪造 ping 字段', !step3.hasPingField, '', 'sim');
    await page.screenshot({ path: path.join(ART, 'loadout-scoreboard.png') });

    ok('无页面脚本异常', pageErrors.length === 0 && consoleErrors.length === 0,
      `pageErrors=${pageErrors.length} consoleErrors=${consoleErrors.length}`, 'ui');
  } finally {
    await browser.close();
    srv.close();
    fs.writeFileSync(path.join(ART, 'e2e-loadout-ping-results.json'),
      JSON.stringify({ results, consoleErrors, pageErrors }, null, 2));
  }
  const passed = results.filter((r) => r.pass).length;
  console.log(`e2e-loadout-ping: ${passed}/${results.length} 通过；结果见 artifacts/`);
  if (passed !== results.length) process.exit(1);
};

run().catch((e) => { console.error(e); process.exit(1); });
