// e2e：playwright-core + 本机 Chrome，对构建产物做真实浏览器冒烟
// 场景驱动方式（每个断言带 driver 标记，见 artifacts/e2e-results.json）：
//   ui   = 真实用户操作（点击菜单按钮 / 键盘输入 / 界面内交互）
//   sim  = 游戏自带 fastForward 确定性模拟推进（跳过实时等待 / 出生保护）
//   setup= 直接调用游戏 API 构造场景（无头环境无法退出指针锁时的 pause 进入等）
// 正确性验证统一用低画质 + 小视口以降低软渲染开销；本结果不作为性能/帧率证据。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ART = path.join(ROOT, 'artifacts');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 8899;
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

// 等待一帧 HUD 刷新（软渲染帧率极低，不能固定 sleep）
const waitHud = (page, check) => page.waitForFunction(check, null, { timeout: 60000 });

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
    // ---- 1. 主流程：菜单 → 点击「开始游戏」→ 对局 → 载具/暂停/继续/退出 ----
    console.log('1. 主流程（全部经 UI）：Start 按钮 → 出生契约 → 载具 → 暂停/继续 → 机器人击杀/复活 → 退出');
    const ctx = await browser.newContext({ viewport: { width: 800, height: 500 } });
    const page = await newPage(ctx, `${URL_BASE}?nolock=1&q=low`);
    await page.waitForSelector('#menu:not(.hidden)', { timeout: 60000 });
    ok('菜单显示地图选择（运输船选中 / 沙漠灰待开放）',
      await page.$eval('#mapSeg button[data-v=transport-ship]', (b) => b.classList.contains('on')) &&
      await page.$eval('#mapSeg button[data-v=desert-grey]', (b) => b.disabled), '', 'ui');
    await page.click('#btnStart'); // 关键：经真实 Start 控件进入对局
    await waitForPlaying(page);
    ok('点击 #btnStart 后进入对局且玩家存活', true, '', 'ui');

    // 出生契约：xyz+yaw 齐全、落在边界内、玩家站在出生面高度
    const sc = await page.evaluate(() => {
      const g = window.__game, B = g.mapDesc.bounds;
      const teams = [...g.map.spawns.BL, ...g.map.spawns.GR];
      const okPts = teams.every((p) => [p.x, p.y, p.z].every(Number.isFinite) && typeof p.yaw === 'number' &&
        p.x >= B.x0 && p.x <= B.x1 && p.z >= B.z0 && p.z <= B.z1);
      return { okPts, n: teams.length, py: g.player.pos.y, spawnY: g.map.spawns[g.player.team][0].y, sy: g.player.pos.y === (g.map.spawns[g.player.team].find((p) => Math.abs(p.x - g.player.pos.x) < 3 && Math.abs(p.z - g.player.pos.z) < 3)?.y ?? g.mapDesc.spawnYFallback) };
    });
    ok(`出生点契约 xyz+yaw 且在边界内（${sc.n} 个点）`, sc.okPts && sc.n === 20, `py=${sc.py}`, 'ui');
    ok('玩家脚底高度来自出生点 y', sc.sy, `pos.y=${sc.py}`, 'ui');

    // 载具（B 键 → 点武器卡片 → 确定）：出生区内立即生效
    await page.keyboard.press('KeyB');
    await page.waitForSelector('#loadout:not(.hidden)', { timeout: 60000 });
    ok('按 B 打开更换武器面板', true, '', 'ui');
    await page.click('#loadCards .card[data-w=m4a1]');
    await page.click('#btnLoadClose');
    await waitHud(page, () => window.__game.player.weapon.id === 'm4a1');
    ok('出生区内换装立即生效（AK-47 → M4A1）', await page.evaluate(() => __game.player.weapon.id === 'm4a1'), '', 'ui');

    // 暂停/继续：无头环境无指针锁，暂停入口（浏览器 Esc 退出锁）用直接调用代替；
    // 恢复与退出走真实按钮。
    await page.evaluate(() => __game.pause());
    await page.waitForSelector('#pause:not(.hidden)', { timeout: 60000 });
    ok('进入暂停界面', true, '', 'setup');
    await page.click('#btnResume');
    await page.waitForSelector('#pause', { state: 'hidden', timeout: 60000 });
    ok('点击「继续」回到对局', await page.evaluate(() => __game.playing && !__game.paused), '', 'ui');

    // 特定机器人死亡 → 经过复活间隔（4s）后复活：先模拟跳过出生保护，再确定性击杀（场景构造）
    const rp = await page.evaluate(() => {
      const g = window.__game;
      g.fastForward(3.5); // 跳过出生保护（sim）
      const bot = g.actors.find((a) => a !== g.player && a.team !== g.player.team && a.alive);
      const dBefore = bot.stats.d;
      g.damage(bot, g.player, 500, 'chest', 'ak47', bot.pos.clone(), false);
      return { name: bot.name, deadNow: !bot.alive, dBefore, respawn: g.mode.defaults.respawn };
    });
    ok('目标机器人被确定性击杀倒地', rp.deadNow, `${rp.name}`, 'setup');
    // 只推进到复活点后 0.05s：复活后的角色不可能在这么短时间内再次阵亡（AI 反应下限 ~0.38s），
    // 断言因此是确定性的
    await page.evaluate((sec) => __game.fastForward(sec), rp.respawn + 0.05);
    const rp2 = await page.evaluate((name) => {
      const bot = __game.actors.find((a) => a.name === name);
      return { alive: bot.alive, d: bot.stats.d };
    }, rp.name);
    ok(`同一机器人 ${rp.respawn}s 复活间隔后重新存活`, rp2.alive && rp2.d === rp.dBefore + 1, `${rp.name} deaths=${rp2.d}`, 'sim');

    // 仅机器人的击杀在模拟窗口内净增长（不含玩家注入的击杀）
    const bk = await page.evaluate(() => {
      const g = window.__game;
      return g.actors.filter((a) => a !== g.player).reduce((s, a) => s + a.stats.k, 0);
    });
    await page.evaluate(() => __game.fastForward(8));
    const bk2 = await page.evaluate(() => {
      const g = window.__game;
      return g.actors.filter((a) => a !== g.player).reduce((s, a) => s + a.stats.k, 0);
    });
    ok('模拟窗口内机器人击杀数净增长', bk2 > bk, `${bk} → ${bk2}`, 'sim');

    // 退出到主菜单（退出按钮位于暂停界面：先经 pause 进入，再点真实按钮）
    await page.evaluate(() => __game.pause());
    await page.waitForSelector('#pause:not(.hidden)', { timeout: 60000 });
    await page.click('#btnQuit');
    await page.waitForSelector('#menu:not(.hidden)', { timeout: 60000 });
    ok('「退出到主菜单」返回菜单且对局结束', await page.evaluate(() => !__game.playing), '', 'ui');
    await page.screenshot({ path: path.join(ART, 'e2e-ui-flow.png') });
    await ctx.close();

    // ---- 2. 畸形 v2 设置：归一化后经 Start 按钮正常开局 ----
    console.log('2. 畸形设置经 Start 按钮开局');
    const ctx2 = await browser.newContext({ viewport: { width: 640, height: 400 } });
    await ctx2.addInitScript(() => {
      localStorage.setItem('cf_opts_v2', JSON.stringify({ v: 2, primary: 'invalid', sens: 'banana', fov: 1e9, team: 'xx', quality: 'ultra', diff: 'nightmare', goal: -5, size: 99 }));
    });
    const p2 = await newPage(ctx2, `${URL_BASE}?nolock=1&q=low`);
    await p2.waitForSelector('#menu:not(.hidden)', { timeout: 60000 });
    const norm = await p2.evaluate(() => ({ ...__game.opts }));
    ok('畸形 v2 设置被归一化', norm.primary === 'ak47' && norm.team === 'BL' && norm.diff === 'normal' && norm.sens === 1 && norm.fov === 100 &&
      norm.goal === 1 && norm.size === 16 && (norm.quality === 'low'), JSON.stringify(norm), 'ui');
    await p2.click('#btnStart');
    await waitForPlaying(p2);
    ok('畸形设置下点击 Start 正常开局且手持默认 AK-47',
      await p2.evaluate(() => __game.player.weapon.id === 'ak47' && __game.actors.length === __game.opts.size * 2), '', 'ui');
    await ctx2.close();

    // ---- 3. storage 抛错（隐私模式）：菜单与开局不受影响 ----
    console.log('3. storage 抛错');
    const ctx3 = await browser.newContext({ viewport: { width: 640, height: 400 } });
    await ctx3.addInitScript(() => {
      const err = () => { throw new DOMException('denied', 'SecurityError'); };
      Object.defineProperty(window, 'localStorage', { value: { getItem: err, setItem: err, removeItem: err, key: err, length: 0 }, configurable: true });
    });
    const p3 = await newPage(ctx3, `${URL_BASE}?nolock=1&q=low`);
    await p3.waitForSelector('#menu:not(.hidden)', { timeout: 60000 });
    ok('storage 抛错时菜单仍初始化', await p3.evaluate(() => !!__game.opts && Number.isFinite(__game.opts.sens)), '', 'ui');
    await p3.click('#btnStart');
    await waitForPlaying(p3);
    ok('storage 抛错时点击 Start 正常开局', true, '', 'ui');
    await ctx3.close();

    // ---- 4. 地图解析：URL 优先 / desert-grey 回退（菜单级，无需开局） ----
    console.log('4. 地图解析');
    const ctx4 = await browser.newContext({ viewport: { width: 640, height: 400 } });
    const p4 = await newPage(ctx4, `${URL_BASE}?map=desert-grey&q=low`);
    await p4.waitForSelector('#menu:not(.hidden)', { timeout: 60000 });
    const fb = await p4.evaluate(() => ({ id: __game.mapDesc.id, saved: JSON.parse(localStorage.getItem('cf_opts_v2')).map }));
    ok('不可用的 desert-grey 回退到运输船并写回设置', fb.id === 'transport-ship' && fb.saved === 'transport-ship', JSON.stringify(fb), 'ui');
    await ctx4.close();

    // ---- 5. 旧 cf_ship_opts 设置迁移（菜单级） ----
    console.log('5. 设置迁移');
    const ctx5 = await browser.newContext({ viewport: { width: 640, height: 400 } });
    await ctx5.addInitScript(() => {
      localStorage.setItem('cf_ship_opts', JSON.stringify({ sens: 1.7, vol: 0.5, quality: 'medium', primary: 'awm', team: 'GR' }));
    });
    const p5 = await newPage(ctx5, URL_BASE); // 不带 q= 覆盖，验证迁移后的画质原样保留
    await p5.waitForSelector('#menu:not(.hidden)', { timeout: 60000 });
    const mig = await p5.evaluate(() => JSON.parse(localStorage.getItem('cf_opts_v2')));
    ok('旧设置迁移：sens/vol/画质/武器保留，默认运输船',
      mig.sens === 1.7 && mig.vol === 0.5 && mig.quality === 'medium' && mig.primary === 'awm' && mig.map === 'transport-ship', '', 'ui');
    await ctx5.close();

    // ---- 6. file:// 单文件无网络加载 ----
    console.log('6. file:// 冒烟');
    const ctx6 = await browser.newContext({ viewport: { width: 640, height: 400 } });
    const p6 = await newPage(ctx6, `file://${path.join(ROOT, 'dist', 'index.html')}`);
    await p6.waitForSelector('#menu:not(.hidden)', { timeout: 60000 });
    ok('file:// 下菜单正常渲染', await p6.evaluate(() => !!document.querySelector('#c')), '', 'ui');
    await p6.screenshot({ path: path.join(ART, 'e2e-file-menu.png') });
    await ctx6.close();
  } finally {
    await browser.close();
    srv.close();
  }

  ok('无页面脚本异常', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 500), 'ui');

  const passed = results.filter((r) => r.pass).length;
  fs.writeFileSync(path.join(ART, 'e2e-results.json'), JSON.stringify({
    date: new Date().toISOString(),
    chrome: CHROME,
    note: '正确性场景使用低画质/小视口软渲染，帧率数据不代表性能；driver=ui 为真实用户操作，sim 为 fastForward 确定性推进，setup 为直接场景构造',
    results, consoleErrors, pageErrors,
  }, null, 2));
  console.log(`\ne2e: ${passed}/${results.length} 通过；结果与截图见 artifacts/`);
  if (passed !== results.length) process.exit(1);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
