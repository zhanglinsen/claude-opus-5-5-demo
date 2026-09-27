// e2e-hud：D 波 lane 3 HUD 整合浏览器冒烟（菜单模式选择/军衔档案/练习面板/闪光白屏/投掷物背包条/结算军衔）。
// 驱动标记同 e2e.mjs：ui=真实用户操作；sim=fastForward/确定性模拟；setup=直接调游戏 API 构造场景。
// 本结果不作为性能/帧率证据。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ART = path.join(ROOT, 'artifacts');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 8909;
const results = [];
const consoleErrors = [];
const pageErrors = [];

function ok(name, cond, detail = '', driver = 'ui') {
  results.push({ name, pass: !!cond, driver, detail });
  if (!cond) throw new Error(`E2E FAIL: ${name} ${detail}`);
  console.log(`  ✔ [${driver}] ${name}${detail ? ' — ' + detail : ''}`);
}

async function newPage(ctx, url) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  return page;
}

async function waitForPlaying(page) {
  await page.waitForFunction(() => window.__game && window.__game.playing, null, { timeout: 60000 });
  await page.waitForFunction(() => window.__game.player && window.__game.player.alive, null, { timeout: 60000 });
}

const run = async () => {
  fs.mkdirSync(ART, { recursive: true });
  if (!fs.existsSync(CHROME)) throw new Error(`未找到 Chrome：${CHROME}`);
  const srv = await startServer(PORT);
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const URL_BASE = `http://127.0.0.1:${PORT}/index.html`;

  try {
    // ---- 1. 菜单：模式分段 / 军衔档案 / 预设切换 / 模式选择持久化 ----
    console.log('1. 菜单：模式分段（沙漠灰默认爆破）、军衔档案渲染、预设切换、模式持久化');
    const ctx = await browser.newContext({ viewport: { width: 900, height: 700 } });
    let page = await newPage(ctx, `${URL_BASE}?map=desert-grey&nolock=1&q=low`);
    await page.waitForSelector('#menu:not(.hidden)', { timeout: 60000 });
    await page.waitForFunction(() => window.__game && window.__game.profileAdapter, null, { timeout: 60000 });
    const m1 = await page.evaluate(() => {
      const seg = [...document.querySelectorAll('#modeSeg button')];
      return {
        ids: seg.map((b) => b.dataset.v),
        on: seg.filter((b) => b.classList.contains('on')).map((b) => b.dataset.v),
        rank: document.getElementById('rankName').textContent,
        rankLevel: document.getElementById('rankLevel').textContent,
        presets: [...document.querySelectorAll('#presetSeg button')].map((b) => b.classList.contains('on')),
        noteHidden: document.getElementById('profileNote').classList.contains('hidden'),
        rankFill: document.getElementById('rankFill').style.width,
      };
    });
    ok('菜单模式分段按 supportedModes 渲染（爆破/团队/练习）',
      JSON.stringify(m1.ids) === JSON.stringify(['bomb', 'tdm', 'practice']), m1.ids.join('/'), 'ui');
    ok('未显式设置模式时高亮地图默认（沙漠灰 = 爆破）', JSON.stringify(m1.on) === JSON.stringify(['bomb']), m1.on.join('/'), 'ui');
    ok('军衔档案渲染：军衔名/级别/进度条非空', m1.rank.length > 0 && /Lv\.\d/.test(m1.rankLevel) && /\d+%/.test(m1.rankFill),
      `${m1.rank} ${m1.rankLevel} ${m1.rankFill}`, 'ui');
    ok('三套装备预设枚举且激活套高亮，存档健康时无降级提示', m1.presets.length === 3 && m1.presets[0] === true && m1.noteHidden,
      `presets=${m1.presets.length}`, 'ui');
    // 点击预设 2 → 高亮迁移（switchPreset 经 adapter，事件刷新）
    await page.click('#presetSeg button:nth-child(2)');
    const p2on = await page.evaluate(() => ({
      on: [...document.querySelectorAll('#presetSeg button')].findIndex((b) => b.classList.contains('on')),
      active: window.__game.profileAdapter.presets().active,
    }));
    ok('点击预设 2：switchPreset 生效且高亮经 onProfileChanged 迁移', p2on.on === 1 && p2on.active === 1, `on=${p2on.on} active=${p2on.active}`, 'ui');
    // 点击「练习模式」→ 持久化进 cf_opts_v2
    await page.click('#modeSeg button[data-v="practice"]');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('cf_opts_v2')).mode);
    ok('点击模式分段：写入 cf_opts_v2 并落盘', saved === 'practice', `saved=${saved}`, 'ui');
    await page.close();

    // 重载（无 URL mode）→ 已存 practice 生效；练习面板渲染
    page = await newPage(ctx, `${URL_BASE}?map=desert-grey&nolock=1&q=low&autostart=1`);
    await waitForPlaying(page);
    await page.waitForFunction(() => !document.getElementById('practice').classList.contains('hidden'), null, { timeout: 60000 });
    const pr1 = await page.evaluate(() => ({
      mode: window.__game.mode.id,
      hits: document.getElementById('prHits').textContent,
      chips: document.querySelectorAll('#prTargets i').length,
      guns: document.querySelectorAll('#prGuns button').length,
      nade: [...document.querySelectorAll('#nadeInfo span')].map((s) => s.textContent),
      nadeCur: document.querySelector('#nadeInfo span.on')?.textContent || '',
    }));
    ok('切模式后重载开局：已存设置生效进入练习模式（URL 未指定时）', pr1.mode === 'practice', `mode=${pr1.mode}`, 'ui');
    ok('练习面板：命中计数、靶位列表（7 靶）、换枪按钮组渲染', pr1.hits.includes('命中') && pr1.chips === 7 && pr1.guns === 7,
      `${pr1.hits} chips=${pr1.chips} guns=${pr1.guns}`, 'ui');
    ok('投掷物背包条：he/flash/smoke 剩余量渲染且当前型号高亮',
      pr1.nade.length === 3 && pr1.nadeCur.includes('手雷'), pr1.nade.join('|'), 'ui');
    // 换枪：点击军刀按钮（真实 weaponUpdate 路径 → onSwitch → practice.selectWeapon）
    await page.click('#prGuns button[data-w="knife"]');
    await page.waitForFunction(() => document.getElementById('prWeapon').textContent.includes('军刀'), null, { timeout: 30000 });
    const pr2 = await page.evaluate(() => ({
      weapon: window.__game.player.weapon.id,
      snap: window.__game.practice.snapshot().weapon.current,
      label: document.getElementById('prWeapon').textContent,
      on: document.querySelector('#prGuns button.on')?.dataset.w || '',
    }));
    ok('练习面板换枪：点击军刀 → 玩家真实切刀 + 运行时快照同步 + 按钮高亮',
      pr2.weapon === 'knife' && pr2.snap === 'knife' && pr2.label.includes('军刀') && pr2.on === 'knife',
      `${pr2.weapon}/${pr2.snap}/${pr2.label}/${pr2.on}`, 'ui');
    // 主武器按钮（HUD-P2-1 修复）：chooseLoadout 出生区即时生效分支经 onSwitch 同步练习运行时
    // 前置：玩家在 BL 出生区（loadoutZone 立即生效）；先切回 AK 消除军刀用例的槽位残留
    await page.evaluate(() => {
      const g = window.__game;
      g.player.weaponUpdate(0.05, { sw: 0 });
    });
    await page.click('#prGuns button[data-slot="0"][data-w="m4a1"]');
    await page.waitForFunction(() => document.getElementById('prWeapon').textContent.includes('M4A1'), null, { timeout: 30000 });
    const pr2b = await page.evaluate(() => ({
      weapon: window.__game.player.weapon.id,
      snap: window.__game.practice.snapshot().weapon.current,
      label: document.getElementById('prWeapon').textContent,
      on: document.querySelector('#prGuns button.on')?.dataset.w || '',
    }));
    ok('练习面板主武器：点击 M4A1 → 出生区立即生效 + 运行时快照/面板名/高亮全同步（HUD-P2-1）',
      pr2b.weapon === 'm4a1' && pr2b.snap === 'm4a1' && pr2b.label.includes('M4A1') && pr2b.on === 'm4a1',
      `${pr2b.weapon}/${pr2b.snap}/${pr2b.label}/${pr2b.on}`, 'ui');
    // 实弹打靶 → 命中计数与靶位高亮经面板可见
    await page.evaluate(() => {
      const g = window.__game;
      g.player.weaponUpdate(0.05, { sw: 0 }); // 确保主武器在手
      g.__bombPlace(g.player.id, 0, 0.02, 4);
      g.player.yaw = 0;
      g.player.pitch = Math.asin((1.2 - (0.02 + 1.62)) / 6.016);
      g.player.readyAt = 0;
      g.fireWeapon(g.player, g.player.weapon, 0);
    });
    await page.waitForFunction(() => document.getElementById('prHits').textContent.includes('1'), null, { timeout: 60000 });
    const pr3 = await page.evaluate(() => ({
      hits: document.getElementById('prHits').textContent,
      hot: document.querySelectorAll('#prTargets i.on').length,
    }));
    ok('实弹打靶：面板命中计数 +1 且受击靶位高亮', pr3.hits.includes('命中 1') && pr3.hot === 1, `${pr3.hits} hot=${pr3.hot}`, 'sim');
    await page.close();
    await ctx.close();

    // ---- 2. 闪光白屏（练习模式无敌军干扰）：真实投掷 → 白屏出现 → 消退 ----
    console.log('2. 闪光白屏：真实闪光弹出手 → #blind 出现 → 消退隐藏');
    const ctx2 = await browser.newContext({ viewport: { width: 800, height: 500 } });
    page = await newPage(ctx2, `${URL_BASE}?map=desert-grey&mode=practice&nolock=1&q=low&autostart=1`);
    await waitForPlaying(page);
    const b0 = await page.evaluate(() => document.getElementById('blind').classList.contains('hidden'));
    ok('未被闪光时白屏隐藏', b0 === true, '', 'ui');
    await page.evaluate(() => {
      const g = window.__game, P = g.player;
      P.weaponUpdate(0.05, { sw: 3 }); // 切到投掷物槽（默认预设雷种 = he）
      P.weaponUpdate(0.05, { sw: 3 }); // 持弹再按 4 → 轮换到闪光弹（真实轮换路径）
      P.readyAt = 0; P.pendingThrow = 0; P.autoSwitchAt = 0;
      P.pitch = -1.5; P.yaw = 0; // 近脚垂直掷出：必被致盲
      P.weaponUpdate(0.05, { firePressed: true });
      for (let i = 0; i < 12; i++) P.weaponUpdate(0.1, {}); // 出手
    });
    await page.waitForFunction(() => {
      const b = document.getElementById('blind');
      return !b.classList.contains('hidden') && parseFloat(b.style.opacity || '0') > 0.05;
    }, null, { timeout: 30000 });
    const bPeak = await page.evaluate(() => ({
      op: parseFloat(document.getElementById('blind').style.opacity),
      int: window.__game.player.blindIntensity || 0,
    }));
    ok('闪光引爆后白屏出现（opacity ∝ intensity × 衰减，与玩家 blindIntensity 同源）',
      bPeak.op > 0.05 && bPeak.int > 0, `opacity=${bPeak.op.toFixed(2)} intensity=${bPeak.int.toFixed(2)}`, 'ui');
    await page.waitForFunction(() => document.getElementById('blind').classList.contains('hidden'), null, { timeout: 30000 });
    ok('闪光消退后白屏隐藏（remaining ≤ 0）', true, '', 'ui');
    // 出手消耗：闪光从背包条消失，he/smoke 保留
    const bNade = await page.evaluate(() => [...document.querySelectorAll('#nadeInfo span')].map((s) => s.textContent).join('|'));
    ok('投掷后背包条记账：闪光移除，手雷/烟雾保留', bNade.includes('手雷') && !bNade.includes('闪光') && bNade.includes('烟雾'), bNade, 'ui');
    await page.close();
    await ctx2.close();

    // ---- 3. 结算军衔行：TDM 到时结束 → 结算页消费 s.award（发分后快照） ----
    console.log('3. 结算页军衔行：对局到时结束 → endAward 渲染 XP/军衔（发分后快照）');
    const ctx3 = await browser.newContext({ viewport: { width: 800, height: 500 } });
    page = await newPage(ctx3, `${URL_BASE}?map=transport-ship&nolock=1&q=low&autostart=1`);
    await waitForPlaying(page);
    await page.evaluate(() => { window.__game.timeLeft = 0.01; }); // 对局到时（真实 endMatch 路径）
    await page.waitForFunction(() => !document.getElementById('end').classList.contains('hidden'), null, { timeout: 60000 });
    const a1 = await page.evaluate(() => ({
      text: document.getElementById('endAward').textContent,
      hidden: document.getElementById('endAward').classList.contains('hidden'),
      award: window.__game.lastAward,
    }));
    ok('结算页消费 s.award：+XP 与发分后军衔可见', a1.hidden === false && /\+\d+ XP/.test(a1.text) && a1.text.includes(a1.award.rank.rankName),
      `${a1.text}（awarded=${a1.award.awarded}）`, 'sim');
    ok('发分后快照与 HUD 渲染一致（xp > 0）', a1.award.awarded === true && a1.award.xp > 0, `xp=${a1.award.xp}`, 'sim');
    await page.close();

    // ---- 4. URL ?mode= 优先级：已存 practice + URL tdm → tdm ----
    console.log('4. URL ?mode= 优先于已存设置');
    const ctx4 = await browser.newContext({ viewport: { width: 800, height: 500 } });
    page = await newPage(ctx4, `${URL_BASE}?map=desert-grey&nolock=1&q=low`);
    await page.waitForSelector('#menu:not(.hidden)', { timeout: 60000 });
    await page.evaluate(() => {
      const o = JSON.parse(localStorage.getItem('cf_opts_v2') || '{"v":2}');
      o.mode = 'practice';
      localStorage.setItem('cf_opts_v2', JSON.stringify(o));
    });
    await page.close(); // 软渲染下避免双 WebGL 上下文抢占 CPU
    page = await newPage(ctx4, `${URL_BASE}?map=desert-grey&mode=tdm&nolock=1&q=low&autostart=1`);
    await waitForPlaying(page);
    const urlMode = await page.evaluate(() => window.__game.mode.id);
    ok('URL ?mode=tdm 覆盖已存 practice', urlMode === 'tdm', `mode=${urlMode}`, 'ui');
    await page.close();
    await ctx4.close();
  } finally {
    await browser.close();
    srv.close();
  }

  if (pageErrors.length || consoleErrors.length) {
    console.error('页面错误:', pageErrors, '控制台错误:', consoleErrors);
    throw new Error('存在页面/控制台异常');
  }
  const passed = results.filter((r) => r.pass).length;
  fs.writeFileSync(path.join(ART, 'e2e-hud-results.json'), JSON.stringify(results, null, 2));
  console.log(`\ne2e-hud: ${passed}/${results.length} 通过；结果见 artifacts/`);
  if (passed !== results.length) process.exit(1);
};

run().catch((e) => { console.error(e); process.exit(1); });
