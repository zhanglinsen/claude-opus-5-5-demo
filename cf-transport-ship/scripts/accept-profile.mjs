// 验收 7：Profile 浏览器最终验收（规格 #profile 最终验收清单）。
// 全新档案 → TDM 完赛加 XP → 军衔进度变化 → 重载持久化 → 损坏存档恢复 →
// 预设切换出生装备生效 → 练习局不加 XP。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ART = path.join(ROOT, 'artifacts');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 8924;
const results = [];

function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond, detail });
  console.log(`  ${cond ? '✔' : '✖'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) process.exitCode = 1;
}

const BASE = `http://127.0.0.1:${PORT}/index.html`;

async function freshPage(ctx, query) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}?${query}`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.profileAdapter, null, { timeout: 60000 });
  return { page, errors };
}

const run = async () => {
  fs.mkdirSync(ART, { recursive: true });
  const srv = await startServer(PORT);
  const browser = await chromium.launch({
    executablePath: CHROME, headless: true,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const ctx = await browser.newContext({ viewport: { width: 960, height: 600 } });
  try {
    // 全新档案：清空存储后加载
    let { page, errors } = await freshPage(ctx, 'map=transport-ship&nolock=1&q=low');
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__game && window.__game.profileAdapter, null, { timeout: 60000 });
    let r = await page.evaluate(() => {
      const a = window.__game.profileAdapter;
      return { rank: a.rankView(), persistence: a.persistence(), presets: a.presets().list.length };
    });
    check('全新档案：XP 0 / Lv.1 / 三套预设 / persisted', r.rank.xp === 0 && r.rank.level === 1 && r.presets === 3 && r.persistence === 'persisted',
      `rank=${r.rank.rankName} xp=${r.rank.xp}`);

    // TDM 完赛加 XP（到时结束 → endMatch → awardMatch 恰好一次）
    await page.evaluate(() => window.__game.startMatch());
    await page.waitForFunction(() => window.__game.player && window.__game.player.alive, null, { timeout: 60000 });
    await page.evaluate(() => { window.__game.timeLeft = 0.05; });
    await page.waitForFunction(() => window.__game.ended && window.__game.lastAward, null, { timeout: 60000 });
    const awarded = await page.evaluate(() => {
      const g = window.__game, a = g.profileAdapter;
      return { last: g.lastAward, rankAfter: a.rankView(), ledger: (a.presets(), JSON.parse(localStorage.getItem('cf_profile_v1'))).ledger.length };
    });
    check('TDM 完赛：awardMatch 恰好一次发分（awarded/xp>0）', awarded.last && awarded.last.awarded && awarded.last.xp > 0,
      `xp=+${awarded.last.xp} ledger=${awarded.ledger}`);
    check('军衔进度变化：发分后 rankView 进度提升', awarded.rankAfter.xp === awarded.last.xp && awarded.rankAfter.progress > 0,
      `xp=${awarded.rankAfter.xp} progress=${(awarded.rankAfter.progress * 100).toFixed(0)}%`);

    // 重载持久化
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__game && window.__game.profileAdapter, null, { timeout: 60000 });
    const persisted = await page.evaluate(() => window.__game.profileAdapter.rankView());
    check('重载持久化：XP/军衔跨刷新保持', persisted.xp === awarded.rankAfter.xp && persisted.rankName === awarded.rankAfter.rankName,
      `xp=${persisted.xp} rank=${persisted.rankName}`);

    // 损坏存档恢复：垃圾 JSON → 归一化为合法档案，游戏不中断
    await page.evaluate(() => localStorage.setItem('cf_profile_v1', 'corrupt{{{not-json'));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__game && window.__game.profileAdapter, null, { timeout: 60000 });
    const recovered = await page.evaluate(() => {
      const g = window.__game;
      return { rank: g.profileAdapter.rankView(), persistence: g.profileAdapter.persistence(), playing: !!g.hud, errors: 0 };
    });
    check('损坏存档恢复：垃圾存档归一化为合法档案、游戏可玩',
      recovered.rank && Number.isFinite(recovered.rank.xp) && recovered.rank.level >= 1 && recovered.persistence === 'persisted',
      `rank=${recovered.rank.rankName} xp=${recovered.rank.xp}`);

    // 预设切换出生装备生效：预设 2 换闪光弹和 AWM；旧菜单偏好仍为 AK-47。
    // （adapter.setPresetSlot 签名为 (index, slotName, id) 三参）
    await page.evaluate(() => {
      const g = window.__game;
      g.profileAdapter.setPresetSlot(1, 'grenade', 'flash');
      g.profileAdapter.setPresetSlot(1, 'primary', 'awm');
      g.profileAdapter.switchPreset(1);
    });
    await page.evaluate(() => window.__game.startMatch());
    await page.waitForFunction(() => window.__game.player && window.__game.player.alive, null, { timeout: 60000 });
    const presetSpawn = await page.evaluate(() => {
      const g = window.__game;
      return { bag: [...g.player.grenadeBag], inv3: g.player.inv[3].def.id,
        primary: g.player.primary, inv0: g.player.inv[0].def.id,
        active: g.profileAdapter.presets().active };
    });
    check('预设切换出生装备生效：激活预设 2（闪光弹）→ 出生雷包首位/手持 = flash',
      presetSpawn.active === 1 && presetSpawn.bag[0] === 'flash' && presetSpawn.inv3 === 'flash',
      `active=${presetSpawn.active} bag=${presetSpawn.bag.join(',')} inv3=${presetSpawn.inv3}`);
    check('预设切换出生主武器生效：旧菜单偏好不能覆盖激活预设的 AWM',
      presetSpawn.primary === 'awm' && presetSpawn.inv0 === 'awm',
      `primary=${presetSpawn.primary} inv0=${presetSpawn.inv0}`);
    const xpBeforePractice = await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem('cf_profile_v1'));
      return { xp: window.__game.profileAdapter.rankView().xp, ledger: saved.ledger.length };
    });

    // 练习局不加 XP：练习 mode 白名单外，endMatch 不发分（相对断言：XP/账本零变化）
    await page.evaluate(() => { const g = window.__game; g.opts.mode = 'practice'; g.startMatch(); });
    await page.waitForFunction(() => window.__game.player && window.__game.player.alive, null, { timeout: 60000 });
    await page.evaluate(() => { window.__game.timeLeft = 0.05; });
    await page.waitForFunction(() => window.__game.ended, null, { timeout: 60000 });
    const practice = await page.evaluate(() => {
      const g = window.__game, a = g.profileAdapter;
      const saved = JSON.parse(localStorage.getItem('cf_profile_v1'));
      return { lastAward: g.lastAward, xp: a.rankView().xp, ledger: saved.ledger.length };
    });
    check('练习局不加 XP：无发分/账本零增长/XP 保持（相对损坏恢复后的档案状态）',
      practice.lastAward === null && practice.xp === xpBeforePractice.xp && practice.ledger === xpBeforePractice.ledger,
      `lastAward=${practice.lastAward} xp=${xpBeforePractice.xp}→${practice.xp} ledger=${xpBeforePractice.ledger}→${practice.ledger}`);
    check('全程无页面异常', errors.length === 0, `errors=${errors.length}`);
    await page.close();
  } finally {
    await browser.close();
    srv.close();
  }
  fs.writeFileSync(path.join(ART, 'accept-profile.json'), JSON.stringify(results, null, 2));
  const pass = results.filter((r) => r.pass).length;
  console.log(`[accept-profile] ${pass}/${results.length} 通过`);
  if (pass !== results.length) process.exit(1);
};

run().catch((e) => { console.error(e); process.exit(1); });
