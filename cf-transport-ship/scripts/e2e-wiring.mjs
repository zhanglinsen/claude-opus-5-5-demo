// e2e-wiring：D 波接线浏览器冒烟（练习模式 / 投掷物效果 / 档案军衔）。
// 驱动标记同 e2e.mjs：ui=真实用户操作；sim=fastForward/确定性模拟；setup=直接调游戏 API 构造场景。
// 投掷物几何断言：暂停 simulate，手动按 1/60s 推进 updateNades/updateSmokes，
// 用注册表 ai 可站立区（运输船 lane z=-6.8）做确定性摆放。本结果不作为性能/帧率证据。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ART = path.join(ROOT, 'artifacts');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 8907;
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
    // ---- 1. 练习模式（沙漠灰）：URL 进模式、无敌军、靶场运行时、实弹打靶、换枪同步 ----
    console.log('1. 练习模式（沙漠灰）：?mode=practice 进得去、靶点就绪、打靶计分、换枪同步');
    const ctx = await browser.newContext({ viewport: { width: 800, height: 500 } });
    let page = await newPage(ctx, `${URL_BASE}?map=desert-grey&mode=practice&nolock=1&q=low&autostart=1`);
    await waitForPlaying(page);
    const p1 = await page.evaluate(() => {
      const g = window.__game;
      return {
        mode: g.mode.id, actors: g.actors.length,
        targets: g.practice ? g.practice.states.length : 0,
        meshes: g.practiceMeshes.length,
        shot: (() => {
          const g2 = window.__game;
          g2.__bombPlace(g2.player.id, 0, 0.02, 4);
          g2.player.yaw = 0;
          g2.player.pitch = Math.asin((1.2 - (0.02 + 1.62)) / 6.016); // 瞄准靶心 (0,1.2,-2)
          g2.player.readyAt = 0;
          g2.fireWeapon(g2.player, g2.player.weapon, 0); // 零散布实弹路径（含练习 hitScan 接缝）
          const snap = g2.practice.snapshot();
          const t = snap.targets.find((x) => x.id === 'dg-mid');
          return { total: snap.totalHits, flash: t ? t.flash : -1 };
        })(),
        reset: (() => {
          const g3 = window.__game;
          g3.practice.reset();
          const s = g3.practice.snapshot();
          return { total: s.totalHits, targets: s.targets.length };
        })(),
      };
    });
    ok('URL ?mode=practice 进入练习模式且无敌军（仅玩家）', p1.mode === 'practice' && p1.actors === 1,
      `mode=${p1.mode} actors=${p1.actors}`, 'ui');
    ok('靶场运行时就绪：7 个靶点 + 7 个可视靶体（两图注册表元数据）', p1.targets === 7 && p1.meshes === 7,
      `targets=${p1.targets} meshes=${p1.meshes}`, 'sim');
    ok('实弹打靶：命中登记经 fireWeapon→hitScan 接缝，靶受击 flash', p1.shot.total >= 1 && p1.shot.flash > 0,
      `totalHits=${p1.shot.total} flash=${p1.shot.flash.toFixed(2)}`, 'sim');
    ok('重开一局 reset：统计清零、靶子结构保留', p1.reset.total === 0 && p1.reset.targets === 7,
      `total=${p1.reset.total} targets=${p1.reset.targets}`, 'sim');
    const sw = await page.evaluate(() => {
      const g = window.__game;
      g.player.weaponUpdate(0.05, { sw: 2 }); // 切刀（真实 weaponUpdate 路径 → onSwitch 同步）
      return g.practice.snapshot().weapon;
    });
    ok('任意换枪同步进运行时快照（weaponUpdate→onSwitch→selectWeapon）', sw.current === 'knife' && sw.slots['2'] === 'knife',
      JSON.stringify(sw), 'sim');
    await page.close();
    await ctx.close();

    // ---- 2. 投掷物接线（运输船 TDM）：真实出手路径 + 确定性手动推进 ----
    console.log('2. 投掷物（运输船）：背包轮换 / HE 伤害 / 闪光致盲 AI / 烟雾挡 AI 视线');
    const ctx2 = await browser.newContext({ viewport: { width: 800, height: 500 } });
    page = await newPage(ctx2, `${URL_BASE}?map=transport-ship&nolock=1&q=low&autostart=1`);
    await waitForPlaying(page);
    const t2 = await page.evaluate(() => {
      const g = window.__game;
      const out = {};
      g.paused = true; // 手动确定性推进（注册表 ai lane z=-6.8 可站立走廊）
      const place = (a, x, z) => {
        g.__bombPlace(a.id, x, 0, z); a.protectT = 0; a.hp = 100; a.vel.set(0, 0, 0);
        // 暂停期 simulate 不同步表现层：手动同步 soldier root，chestWorld/headWorld 才与逻辑位一致
        a.soldier.root.position.copy(a.pos); a.soldier.root.rotation.y = a.yaw;
      };
      const face = (a, yaw) => { a.yaw = yaw; a.soldier.root.rotation.y = yaw; };
      const enemies = g.actors.filter((a) => a !== g.player && a.team !== g.player.team);
      const P = g.player;
      const throwCur = (pitch) => { // 真实出手路径：firePressed → pendingThrow → throwGrenade → advance/autoSwitch
        P.slot = 3; P.readyAt = 0; P.pitch = pitch; P.yaw = -Math.PI / 2; // 面向 +x
        P.autoSwitchAt = 0; P.pendingThrow = 0; // 手动时间推进（g.time += 5）会让旧 autoSwitchAt 立即触发，先清掉
        P.weaponUpdate(0.05, { firePressed: true });
        for (let i = 0; i < 12; i++) P.weaponUpdate(0.1, {});
      };
      out.bag = [...P.grenadeBag];
      // HE：玩家 (-26,-6.8) 平投。滚翻落点不定，引信临近到期时把 bot1 确定性摆到爆点旁
      //（setup 干预只锁定几何，不干预结算），保证断言的是 投掷→运动→引信→explode 机制本身
      const b1 = enemies[0];
      b1.alive = true; b1.hp = 100;
      place(b1, -16, -6.8);
      place(P, -26, -6.8);
      throwCur(-0.02);
      out.heSlotAfter = P.inv[3].def.id; // 出手后自动轮换
      for (let i = 0; i < 400 && g.nades.length; i++) {
        const n = g.nades[0];
        if (n.proj.fuse < 0.25) place(b1, n.proj.pos.x + 1.5, n.proj.pos.z);
        g.updateNades(1 / 60);
      }
      out.heHp = b1.hp; out.heDead = !b1.alive;

      // 闪光：跳投（滚翻落点不定，临爆前把 bot2/bot3 相对爆点摆放：正对闪光 5m/3m）
      place(P, -14, -6.8);
      const b2 = enemies[1], b3 = enemies[2];
      const t0 = g.time;
      throwCur(0.6);
      for (let i = 0; i < 400 && g.nades.length; i++) {
        const n = g.nades[0];
        if (n.proj.fuse < 0.25) {
          place(b2, n.proj.pos.x - 5, n.proj.pos.z);
          place(b3, n.proj.pos.x - 3, n.proj.pos.z);
          face(b2, -Math.PI / 2); face(b3, -Math.PI / 2); // 面向 +x 的爆点
          b2.pitch = 0; b3.pitch = 0;
        }
        g.updateNades(1 / 60);
      }
      out.flash = {
        b2: { until: Math.max(0, b2.blindUntil - t0), int: b2.blindIntensity },
        b3: { until: Math.max(0, b3.blindUntil - t0), int: b3.blindIntensity },
      };
      // 致盲影响 AI canSee：bot3 面向 4m 内的玩家（无遮挡、super.canSee 本应 true），被闪期间必须 false
      face(b3, Math.PI / 2); // 面向 -x
      place(P, b3.pos.x - 4, b3.pos.z);
      out.blindCanSee = b3.canSee(P);
      g.time += 5; // 闪光消退
      out.recoverCanSee = b3.canSee(P);

      // 烟雾：跳投 → 烟心即爆点；bot4 与玩家视线段穿过烟球（相对实际爆点构造）
      const b4 = enemies[3];
      throwCur(0.6);
      for (let i = 0; i < 400 && g.nades.length; i++) g.updateNades(1 / 60);
      const cloud = g.smokes[0] ? { ...g.smokes[0].cloud.pos } : null;
      if (cloud) { place(b4, cloud.x - 2, cloud.z); face(b4, Math.PI / 2); b4.pitch = 0; }
      place(P, cloud ? cloud.x - 6 : -14, cloud ? cloud.z : -6.8); // bot4↔玩家 4m 近距视线（穿烟球边缘）
      out.smokes = g.smokes.length;
      out.crossBlocked = cloud ? g.smokeBlocked({ x: cloud.x - 20, y: 1.62, z: cloud.z }, { x: cloud.x + 20, y: 1.62, z: cloud.z }) : false;
      out.sideBlocked = cloud ? g.smokeBlocked({ x: cloud.x - 20, y: 1.62, z: cloud.z + 6.8 }, { x: cloud.x + 20, y: 1.62, z: cloud.z + 6.8 }) : true;
      out.smokeCanSee = b4.canSee(P);
      g.updateSmokes(12); // 烟散（12s 时长 + fade）
      out.afterFade = { smokes: g.smokes.length, canSee: b4.canSee(P) };

      // 4 号键轮换（记账防复制）：清账后 slot3 内再按 4 逐个轮换
      P.usedGrenades = {};
      P.autoSwitchAt = 0; P.pendingThrow = 0; // 清掉冻结时间里永不触发的旧自动切枪标记
      P.slot = 3;
      P.weaponUpdate(0.05, { sw: 3 }); // slot 已在 3（autoSwitch 后实际在 1，此处先确保切回）
      const seq = [];
      for (let i = 0; i < 3; i++) {
        P.weaponUpdate(0.05, { sw: 3 }); // 持弹再按 4 → 轮换
        seq.push(P.inv[3].def.id + ':' + P.inv[3].mag);
      }
      out.cycle = seq;
      out.slot3 = P.inv[3].def.id;
      out.botBag = JSON.stringify([...enemies[0].grenadeBag]);
      return out;
    });
    ok('出生投掷物背包 = 档案雷种 + CATALOG 补齐（he/flash/smoke）',
      JSON.stringify(t2.bag) === JSON.stringify(['he', 'flash', 'smoke']), JSON.stringify(t2.bag), 'sim');
    ok('P2-2 bots 雷包收窄：非玩家只带 he（不投闪光/烟雾，无队伍豁免语义）',
      t2.botBag === '["he"]', `bot bag=${t2.botBag}`, 'sim');
    ok('HE 实投→引信事件→现役 explode 结算：近点敌 bot 实际受伤', t2.heHp < 90 || t2.heDead,
      `hp=${t2.heHp.toFixed(1)} dead=${t2.heDead}`, 'sim');
    ok('HE 出手后槽位自动轮换到下一枚（flash）', t2.heSlotAfter === 'flash', `inv[3]=${t2.heSlotAfter}`, 'sim');
    ok('闪光实投→computeFlashEffect 接线：面向闪光的 bot 被致盲（until/intensity 置位）',
      t2.flash.b3.until > 0.3 && t2.flash.b3.int > 0,
      `b2(${t2.flash.b2.until.toFixed(2)}s/${t2.flash.b2.int.toFixed(2)}) b3(${t2.flash.b3.until.toFixed(2)}s/${t2.flash.b3.int.toFixed(2)})`, 'sim');
    ok('被闪 bot 短暂失明：blinded 期间 canSee=false，闪光消退后恢复', t2.blindCanSee === false && t2.recoverCanSee === true,
      `blind=${t2.blindCanSee} recover=${t2.recoverCanSee}`, 'sim');
    ok('烟雾实投→SmokeCloud 接线：穿越视线阻挡、旁路视线畅通', t2.smokes === 1 && t2.crossBlocked === true && t2.sideBlocked === false,
      `n=${t2.smokes} cross=${t2.crossBlocked} side=${t2.sideBlocked}`, 'sim');
    ok('烟雾挡 AI 视线（与玩家同一 smokeBlocksSight 语义）：视线穿烟 canSee=false，烟散后恢复',
      t2.smokeCanSee === false && t2.afterFade.smokes === 0 && t2.afterFade.canSee === true,
      `smoke=${t2.smokeCanSee} after(smokes=${t2.afterFade.smokes},see=${t2.afterFade.canSee})`, 'sim');
    ok('4 号键持弹轮换：清账后轮换序 he→flash→smoke 各剩余 1（防复制的本体由 makeGrenadeState 剩余量语义与 heSlotAfter 断言覆盖）',
      t2.cycle.length === 3 && t2.cycle.every((s) => s.endsWith(':1')) && new Set(t2.cycle.map((s) => s.split(':')[0])).size === 3,
      t2.cycle.join(' → '), 'sim');
    await page.close();

    // ---- 3. 档案接线：adapter 装配 / loadout / matchEnded 恰好一次发分（独立页面，避免软渲染长会话崩溃） ----
    console.log('3. 档案接线：guarded storage、loadout、endMatch 发分一次 + 去重');
    const ctx3 = await browser.newContext({ viewport: { width: 800, height: 500 } });
    page = await newPage(ctx3, `${URL_BASE}?map=transport-ship&nolock=1&q=low&autostart=1`);
    await waitForPlaying(page);
    const p3 = await page.evaluate(() => {
      const g = window.__game;
      const out = { persistence: g.profileAdapter ? g.profileAdapter.persistence() : null };
      if (g.profileAdapter) {
        const lo = g.profileAdapter.loadout();
        out.loadout = lo;
        out.rankView = g.profileAdapter.rankView();
      }
      const res = g.awardProfileResult(true); // endMatch 内部同路径（setup 直接驱动）
      out.award = res ? { awarded: res.awarded, xp: res.xp, rankKeys: Object.keys(res.rank || {}) } : null;
      out.replay = g.awardProfileResult(true); // 同 key 重放 → 去重拒绝
      return out;
    });
    ok('档案适配层接线：guarded localStorage（persisted）、loadout 全目录内、rankView 可渲染',
      p3.persistence === 'persisted' && p3.loadout && p3.rankView && typeof p3.rankView.rankName === 'string',
      `persistence=${p3.persistence} rank=${p3.rankView && p3.rankView.rankName}`, 'sim');
    ok('endMatch→awardMatch 恰好一次发分（tdm）+ 同 key 重放去重拒绝',
      p3.award && p3.award.awarded === true && p3.award.xp > 0 && p3.replay && p3.replay.awarded === false,
      `award=${JSON.stringify(p3.award)} replay=${p3.replay && p3.replay.awarded}`, 'sim');
    await page.close();
    await ctx3.close();
    await ctx2.close();
  } finally {
    await browser.close();
    srv.close();
  }

  if (pageErrors.length || consoleErrors.length) {
    console.error('页面错误:', pageErrors, '控制台错误:', consoleErrors);
    throw new Error('存在页面/控制台异常');
  }
  const passed = results.filter((r) => r.pass).length;
  fs.writeFileSync(path.join(ART, 'e2e-wiring-results.json'), JSON.stringify(results, null, 2));
  console.log(`\ne2e-wiring: ${passed}/${results.length} 通过；结果见 artifacts/`);
  if (passed !== results.length) process.exit(1);
};

run().catch((e) => { console.error(e); process.exit(1); });
