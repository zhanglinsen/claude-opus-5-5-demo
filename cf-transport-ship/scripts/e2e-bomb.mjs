// e2e-bomb：爆破模式运行时集成验收（playwright-core + 本机 Chrome，对构建产物做真实浏览器检查）
// 覆盖：沙漠灰默认进入 5v5 爆破、Game.bomb/objectiveCommand/objectiveView 公共接缝、
// 真实事实管线（真实地图包点几何 → inSite）下的安包/拆包/引爆结算、回合流转与统一复活、
// 死亡无复活、暂停冻结、重开清理、运输船回归（Game.bomb 恒为 null）。
// 驱动标记：ui = 真实用户操作；sim = fastForward/受控推进（规则验证；最终真实渲染证据
// 由 B/C lane 完成后的集成验收另行承担，不以 fastForward 冒充渲染证据）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ART = path.join(ROOT, 'artifacts');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 8903;
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
    // ---- 1. 真实菜单开局：新玩家默认沙漠灰，直接进入默认爆破模式 ----
    console.log('1. 默认装配（真实点击 Start，新玩家无已存设置）');
    const ctx = await browser.newContext({ viewport: { width: 800, height: 500 } });
    const page = await newPage(ctx, `${URL_BASE}?q=low&nolock=1`);
    await page.waitForSelector('#menu:not(.hidden)', { timeout: 60000 });
    await page.click('#btnStart');
    await page.waitForFunction(() => window.__game && window.__game.playing && window.__game.player, null, { timeout: 60000 });
    const assembled = await page.evaluate(() => {
      const g = window.__game;
      const teams = {};
      for (const a of g.actors) teams[a.team] = (teams[a.team] || 0) + 1;
      return {
        mode: g.mode.id, map: g.mapDesc.id, hasBomb: !!g.bomb && typeof g.bomb.snapshot === 'function',
        hasSession: !!g.bombSession, round: g.bomb ? g.bomb.round : 0, phase: g.bomb ? g.bomb.phase : null,
        teams, playerTeam: g.player.team, rules: g.bomb ? { ...g.bomb.rules } : null,
        viewNull: g.objectiveView === undefined,
      };
    });
    ok('沙漠灰默认进入爆破模式（无需 URL/设置指定）', assembled.map === 'desert-grey' && assembled.mode === 'bomb', `mode=${assembled.mode}`, 'ui');
    ok('Game.bomb 为规则引擎（仅爆破模式非空）且会话已装配', assembled.hasBomb && assembled.hasSession, '', 'ui');
    ok('5v5 固定阵营（含玩家共 10 人）', assembled.teams.BL === 5 && assembled.teams.GR === 5, JSON.stringify(assembled.teams), 'sim');
    ok('首回合准备期开始（5v5/先赢 7/150s/安 5s/拆 7s/引爆 40s）',
      assembled.round === 1 && assembled.phase === 'prep'
      && assembled.rules.teamSize === 5 && assembled.rules.winsNeeded === 7
      && assembled.rules.roundTime === 150 && assembled.rules.plantHold === 5
      && assembled.rules.defuseHold === 7 && assembled.rules.fuseTime === 40, '', 'sim');
    await page.waitForFunction(() => document.getElementById('sGoal')?.textContent.includes('先赢 7 局'), null, { timeout: 15000 });
    const header = await page.evaluate(() => ({
      clock: document.getElementById('sTime').textContent,
      goal: document.getElementById('sGoal').textContent,
    }));
    ok('爆破主 HUD 显示回合时钟和先赢 7 局，不沿用 TDM 的目标 50',
      /^\d+:\d{2}$/.test(header.clock) && header.clock !== '0:00' && header.goal.includes('先赢 7 局') && !header.goal.includes('目标 50'),
      JSON.stringify(header), 'ui');
    await page.screenshot({ path: path.join(ART, 'bomb-round-prep.png') });

    // ---- 2. 公共接缝契约：视图可序列化 + 提示字段齐全 ----
    const seam = await page.evaluate(() => {
      const g = window.__game;
      const v = JSON.parse(JSON.stringify(g.objectiveView(g.player.id)));
      return {
        keys: ['phase', 'round', 'score', 'timeLeft', 'bomb', 'plantable', 'defusable', 'pickupable', 'inSite', 'spectate']
          .filter((k) => !(k in v)),
        inSite: v.inSite, phase: v.phase, spectateN: v.spectate.length,
        nullOutside: true, // 对照组：运输船页面单独验证 objectiveView() === null
      };
    });
    ok('objectiveView 可 JSON 序列化且含 plantable/defusable/pickupable/inSite/spectate', seam.keys.length === 0, `缺:${seam.keys}`, 'sim');
    ok('出生点不在包点（inSite=null）且观战列表只含同队', seam.inSite === null && seam.spectateN === 4, `spectate=${seam.spectateN}`, 'sim');

    // ---- 3. 真实事实管线：安包 → 拆包 → 一次性结算 → 下一回合统一复活 ----
    console.log('2. 安包/拆包/结算边界（玩家改打 GR，携带者为机器人，走 objectiveCommand）');
    await page.evaluate(() => {
      const g = window.__game;
      g.paused = false;
      // 受控确定性：冻结全部机器人决策与路径（不编辑 bots.js，仅运行时置位）
      for (const a of g.actors) {
        if (a.isPlayer) continue;
        a.thinkT = 1e9; a.path = null; a.goal = null; a.vel.set(0, 0, 0);
      }
      g.opts.team = 'GR'; // 场景确定性：玩家在 GR 阵营观察，BL 携带者为机器人（id 5）走安包链路
      g.startMatch();
      for (const a of g.actors) { if (!a.isPlayer) { a.thinkT = 1e9; a.path = null; a.goal = null; a.vel.set(0, 0, 0); } }
    });
    await page.waitForFunction(() => window.__game.bomb && window.__game.bomb.round === 1, null, { timeout: 15000 });
    const live = await page.evaluate(() => { window.__game.fastForward(5.5); return window.__game.bomb.phase; });
    ok('准备期 5 秒后进入交战', live === 'live', `phase=${live}`, 'sim');

    const plant = await page.evaluate(() => {
      const g = window.__game;
      const carrier = g.bomb.bomb.carrierId;
      const siteA = g.map.bombSites.find((s) => s.id === 'A');
      const v0 = g.objectiveView(carrier);
      const wasPlantableAtSite = (() => {
        g.__bombPlace(carrier, siteA.x, siteA.y, siteA.z);
        g.fastForward(0.1); // 泵一帧模拟刷新事实（视图来自最近一帧 facts）
        const v = g.objectiveView(carrier);
        return v.inSite === 'A' && v.plantable === true;
      })();
      const queued = g.objectiveCommand('startPlant', carrier);
      g.fastForward(2);
      const notYet = g.bomb.phase === 'live' && !g.bomb.bomb.planted;
      g.fastForward(3.5); // 累计按住 ≥5s
      return { carrier, wasPlantableAtSite, queued, notYet, phase: g.bomb.phase, bomb: g.bomb.bomb, siteA };
    });
    ok('携带者在 A 点通过共享命令入口开始安包（inSite 为包点 ID 字符串）',
      plant.queued && plant.wasPlantableAtSite && plant.carrier != null, `carrier=${plant.carrier}`, 'sim');
    ok('按住不足 5 秒不生效（真实事实管线：移动中不误判完成）', plant.notYet, '', 'sim');
    ok('安包完成：phase=planted、site=A、世界 C4 标记可见',
      plant.phase === 'planted' && plant.bomb && plant.bomb.planted && plant.bomb.site === 'A', '', 'sim');
    const c4 = await page.evaluate((siteA) => {
      const g = window.__game, r = g.c4.root;
      return { visible: r.visible, near: Math.hypot(r.position.x - siteA.x, r.position.z - siteA.z) };
    }, plant.siteA);
    ok('C4 世界标记位于 A 包点', c4.visible && c4.near < 2, `距离=${c4.near.toFixed(2)}m`, 'sim');

    const wrongDefuse = await page.evaluate(() => {
      const g = window.__game;
      const gr = g.actors.find((a) => a.team === 'GR' && a.alive && !a.isPlayer);
      const siteB = g.map.bombSites.find((s) => s.id === 'B');
      g.__bombPlace(gr.id, siteB.x, siteB.y, siteB.z);
      gr.vel.set(0, 0, 0);
      g.fastForward(0.1);
      const offered = g.objectiveView(gr.id).defusable;
      g.objectiveCommand('startDefuse', gr.id);
      g.fastForward(0.1);
      return { offered, action: g.bomb.action?.kind || null, phase: g.bomb.phase };
    });
    ok('A 点已安包时，B 点保卫者既无拆包提示也无法开始拆包',
      wrongDefuse.offered === false && wrongDefuse.action === null && wrongDefuse.phase === 'planted',
      JSON.stringify(wrongDefuse), 'sim');

    const defuse = await page.evaluate(() => {
      const g = window.__game;
      const gr = g.actors.find((a) => a.team === 'GR' && a.alive && !a.isPlayer);
      const siteA = g.map.bombSites.find((s) => s.id === 'A');
      // 在包点内选一个真实物理上站得稳的点（不与碰撞体重叠、静止后 speed≈0）
      const OFFSETS = [[0, 0], [1.5, 0], [0, 1.5], [-1.5, 0], [0, -1.5], [2.5, 0], [0, 2.5], [-2.5, 0], [0, -2.5]];
      let spot = null;
      for (const [dx, dz] of OFFSETS) {
        g.__bombPlace(gr.id, siteA.x + dx, siteA.y, siteA.z + dz);
        gr.vel.set(0, 0, 0);
        g.fastForward(0.15);
        if (gr.speed < 0.2 && g.objectiveView(gr.id).inSite === 'A') { spot = [dx, dz]; break; }
      }
      const canDefuse = spot != null && g.objectiveView(gr.id).defusable === true;
      const queued = canDefuse ? g.objectiveCommand('startDefuse', gr.id) : false;
      g.fastForward(6.5); // 7 秒未满
      const notYet = g.bomb.phase === 'planted' && !g.bomb.roundWinner;
      g.fastForward(1); // 完成 7 秒
      return { grId: gr.id, spot, canDefuse, queued, notYet, phase: g.bomb.phase, winner: g.bomb.roundWinner, score: { ...g.bomb.score } };
    });
    ok('GR 到位可拆包（E 拆包优先的共享命令入口）', defuse.canDefuse && defuse.queued, `gr=${defuse.grId} spot=${JSON.stringify(defuse.spot)}`, 'sim');
    ok('拆包 7 秒未满不结算', defuse.notYet, '', 'sim');
    ok('拆除完成：GR 胜、回合只结算一次、比分来自引擎', defuse.phase === 'roundEnd' && defuse.winner === 'GR' && defuse.score.GR === 1, JSON.stringify(defuse.score), 'sim');
    await page.screenshot({ path: path.join(ART, 'bomb-round-end.png') });

    const next = await page.evaluate(() => {
      const g = window.__game;
      g.fastForward(4.2); // 跨过 4 秒回合间隔
      const round = g.bomb.round, phase = g.bomb.phase;
      const allAlive = g.actors.every((a) => a.alive);
      const playerAlive = g.player.alive;
      return { round, phase, allAlive, playerAlive };
    });
    ok('延迟后下一回合开始且全员统一复活（含玩家）', next.round === 2 && next.allAlive && next.playerAlive, `round=${next.round}`, 'sim');

    // ---- 4. 死亡无复活 + 观战入口（玩家 BL 默认队伍由本页 startMatch 已改 GR，此节用击杀验证） ----
    const death = await page.evaluate(() => {
      const g = window.__game;
      g.player.protectT = 0;
      const enemy = g.actors.find((a) => !a.isPlayer && a.team !== g.player.team && a.alive);
      g.player.hp = 100;
      g.damage(g.player, enemy, 999, 'chest', 'ak47', { x: 1, z: 0 }, false, false);
      const deadNow = !g.player.alive && g.player.respawnT === null;
      g.fastForward(3);
      const stillDead = !g.player.alive; // 爆破无个体复活
      const spec = g.objectiveView(g.player.id).spectate;
      return { deadNow, stillDead, specN: spec.length, specIds: spec.map((s) => s.id) };
    });
    ok('爆破模式下死亡无个体复活（respawnT=null）', death.deadNow && death.stillDead, '', 'sim');
    ok('观战入口：视图提供存活队友列表（不泄露敌方）', death.specN > 0, `spectate=${death.specIds}`, 'sim');

    // ---- 5. 引爆结算：安包后 BL 全灭仍等待引爆/拆除 ----
    const explode = await page.evaluate(() => {
      const g = window.__game;
      if (!g.player.alive) return { skip: '玩家阵亡回合未结束，等下一回合' };
      return {};
    });
    // 等玩家复活（回合超时后统一复活），再走一遍安包 → 杀光 BL → 引爆
    await page.evaluate(() => { window.__game.fastForward(160); }); // 本回合超时 GR 胜 + 间隔 → 第 3 回合
    const round3 = await page.evaluate(() => {
      const g = window.__game;
      for (const a of g.actors) { if (!a.isPlayer) { a.thinkT = 1e9; a.path = null; a.goal = null; a.vel.set(0, 0, 0); } }
      const round = g.bomb.round;
      const carrier = g.bomb.bomb && g.bomb.bomb.carrierId;
      return { round, carrier };
    });
    ok('超时判 GR 胜后进入第 3 回合', round3.round === 3 && round3.carrier != null, `round=${round3.round} carrier=${round3.carrier}`, 'sim');
    const boom = await page.evaluate(() => {
      const g = window.__game;
      g.fastForward(5.5); // 进入交战
      const carrier = g.bomb.bomb.carrierId;
      const siteB = g.map.bombSites.find((s) => s.id === 'B');
      // 包点内选站得稳的点再安包（避免摆进碰撞体被推出 → moving 打断）
      const OFFSETS = [[0, 0], [1.5, 0], [0, 1.5], [-1.5, 0], [0, -1.5], [2.5, 0], [0, 2.5], [-2.5, 0], [0, -2.5]];
      let placed = false;
      for (const [dx, dz] of OFFSETS) {
        g.__bombPlace(carrier, siteB.x + dx, siteB.y, siteB.z + dz);
        g.actors.find((a) => a.id === carrier).vel.set(0, 0, 0);
        g.fastForward(0.15);
        if (g.objectiveView(carrier).inSite === 'B') {
          const v = g.actors.find((a) => a.id === carrier);
          if (v.speed < 0.2) { placed = true; break; }
        }
      }
      g.objectiveCommand('startPlant', carrier);
      g.fastForward(5.2);
      const plantedSite = g.bomb.bomb && g.bomb.bomb.planted ? g.bomb.bomb.site : null;
      // 安包后 BL 全灭：回合不得立即结束，等待拆除或引爆
      for (const a of g.actors) {
        if (a.team === 'BL' && a.alive) { a.protectT = 0; g.damage(a, g.player, 999, 'chest', 'ak47', { x: 1, z: 0 }, false, false); }
      }
      const blWipedStillPlanted = g.bomb.phase === 'planted' && g.bomb.roundWinner === null;
      const before = g.bomb.now;
      g.fastForward(41); // 跨过 40 秒引爆倒计时
      return { plantedSite, blWipedStillPlanted, phase: g.bomb.phase, winner: g.bomb.roundWinner, score: { ...g.bomb.score }, advanced: g.bomb.now > before };
    });
    ok('B 点安包成功（跨包点几何校验）', boom.plantedSite === 'B', `site=${boom.plantedSite}`, 'sim');
    ok('安包后 BL 全灭回合不结束（继续等待拆除/引爆）', boom.blWipedStillPlanted, '', 'sim');
    ok('40 秒引爆：BL 胜（引爆优先）', boom.phase === 'roundEnd' && boom.winner === 'BL' && boom.score.BL === 1, JSON.stringify(boom.score), 'sim');
    await page.screenshot({ path: path.join(ART, 'bomb-exploded.png') });

    // ---- 6. 暂停冻结与重开清理 ----
    const pause = await page.evaluate(async () => {
      const g = window.__game;
      g.fastForward(4.2); // 回到第 4 回合准备期
      g.paused = true;
      const now0 = g.bomb.now, r0 = g.bomb.round;
      await new Promise((res) => setTimeout(res, 300)); // 真实墙钟流逝（渲染循环继续）
      const frozen = g.bomb.now === now0 && g.bomb.round === r0;
      g.paused = false;
      return { frozen, now0, now1: g.bomb.now };
    });
    ok('暂停冻结规则时间（墙钟流逝但模拟时钟不动）', pause.frozen, `now=${pause.now0}`, 'sim');

    const restart = await page.evaluate(() => {
      const g = window.__game;
      const oldRound = g.bomb.round;
      g.startMatch(); // 重开：旧会话销毁、新建控制器/花名册
      const fresh = { round: g.bomb.round, score: { ...g.bomb.score }, c4Hidden: !g.c4.root.visible, playing: g.playing };
      return { oldRound, fresh };
    });
    ok('重开清理：新会话从第 1 回合/0 比分开始，C4 标记复位',
      restart.oldRound >= 4 && restart.fresh.round === 1 && restart.fresh.score.BL === 0 && restart.fresh.score.GR === 0 && restart.fresh.c4Hidden, '', 'sim');

    // ---- 7. 先赢 7 局对局结束（winsNeeded 经确定性接缝缩到 1 验证 matchEnded → endMatch）----
    const matchEnd = await page.evaluate(() => {
      const g = window.__game;
      for (const a of g.actors) { if (!a.isPlayer) { a.thinkT = 1e9; a.path = null; a.goal = null; a.vel.set(0, 0, 0); } }
      g.bomb.rules.winsNeeded = 1; // 确定性测试接缝：规则参数本来就是可注入接缝
      g.fastForward(5.5);
      for (const a of g.actors) {
        if (a.team === (g.player.team === 'BL' ? 'GR' : 'BL') && a.alive) { a.protectT = 0; g.damage(a, g.player, 999, 'chest', 'ak47', { x: 1, z: 0 }, false, false); }
      }
      g.fastForward(0.5);
      return { ended: g.ended, playing: g.playing, phase: g.bomb.phase, matchWinner: g.bomb.matchWinner };
    });
    ok('先赢 N 局后 matchEnded → 对局结束结算', matchEnd.ended && !matchEnd.playing && matchEnd.matchWinner != null, `winner=${matchEnd.matchWinner}`, 'sim');
    await ctx.close();

    // ---- 8. 玩家 id 0 为 BL 携包者的完整闭环（真实移动走到包点 + 真实输入/HUD）----
    console.log('4. 玩家(id 0) BL 携包 → 真实走到 A 点 → 5 号槽 + 按住安放 → HUD 提示/进度 → 结算');
    const ctx3 = await browser.newContext({ viewport: { width: 800, height: 500 } });
    const p3 = await newPage(ctx3, `${URL_BASE}?q=low&nolock=1`);
    await p3.waitForSelector('#menu:not(.hidden)', { timeout: 60000 });
    await p3.click('#btnStart');
    await p3.waitForFunction(() => window.__game && window.__game.playing && window.__game.player && window.__game.player.alive, null, { timeout: 60000 });
    // 开局携包：原失败是观察竞态——startMatch() 同步装配会话（objectiveView 的 carrierId
    // 立即为 0），而 player.carryingC4 是 Player.update() 每帧从 objectiveView 派生的缓存，
    // 首个 rAF 模拟帧之前必为构造值 false。这里等稳定条件（原失败谓词 + frame>0），
    // 再逐帧采样证明首个模拟帧之后引擎视图与玩家缓存帧帧一致（无真实状态不一致）。
    await p3.evaluate(() => {
      const g = window.__game;
      for (const a of g.actors) { if (!a.isPlayer) { a.thinkT = 1e9; a.path = null; a.goal = null; a.vel.set(0, 0, 0); } }
    });
    await p3.waitForFunction(() => {
      const g = window.__game;
      if (!g || !g.playing || g.frame === 0) return false;
      const b = g.objectiveView(0).bomb;
      return g.player.id === 0 && g.player.team === 'BL' && b && b.carrierId === 0 && g.player.carryingC4 === true;
    }, null, { timeout: 15000 });
    const carry0 = await p3.evaluate(() => new Promise((res) => {
      const g = window.__game;
      const frames = [];
      let n = 0;
      const tick = () => {
        const v = g.objectiveView(g.player.id);
        frames.push({ n, frame: g.frame, carrier: v.bomb ? v.bomb.carrierId : null, carrying: g.player.carryingC4 });
        if (++n < 8) requestAnimationFrame(tick);
        else res({ pid: g.player.id, team: g.player.team, frames });
      };
      tick();
    }));
    const badFrames = carry0.frames.filter((f) => f.frame > 0 && f.carrying !== (f.carrier === carry0.pid));
    const last0 = carry0.frames[carry0.frames.length - 1];
    ok('默认开局：玩家 id 0 在 BL 且经规则引擎拿到 C4（稳定条件达成 + 逐帧一致）',
      carry0.pid === 0 && carry0.team === 'BL' && last0.carrier === 0 && last0.carrying && badFrames.length === 0,
      `不一致帧=${JSON.stringify(badFrames)}`, 'sim');
    await p3.screenshot({ path: path.join(ART, 'bomb-player0-carry.png') });

    // 真实按 5 选中 C4（键盘事件走真实输入管线），HUD 5 号槽点亮
    await p3.keyboard.press('5');
    await p3.waitForFunction(() => window.__game.player.c4Selected === true, null, { timeout: 5000 });
    const slot5 = await p3.evaluate(() => ({
      selected: window.__game.player.c4Selected,
      slotOn: document.getElementById('slotC4').classList.contains('on'),
      slotShown: !document.getElementById('slotC4').classList.contains('hidden'),
    }));
    ok('按 5 选中 C4：输入状态机选中且 HUD 5 号槽高亮可见', slot5.selected && slot5.slotOn && slot5.slotShown, JSON.stringify(slot5), 'ui');

    // 真实掉包/拾取（G/E 键走真实输入管线 → BombInput → objectiveCommand → 引擎校验）：
    // 携包者可主动掉包（进入 dropped 态、原地可拾、5 号槽自动退出），再按 E 拾回
    await p3.keyboard.press('g');
    await p3.waitForFunction(() => {
      const g = window.__game, v = g.objectiveView(0);
      return v.bomb && v.bomb.dropped === true && v.pickupable === true && g.player.carryingC4 === false;
    }, null, { timeout: 5000 });
    const dropped0 = await p3.evaluate(() => {
      const g = window.__game, v = g.objectiveView(0);
      return { dropped: !!v.bomb.dropped, pickupable: v.pickupable, carrying: g.player.carryingC4, c4Selected: g.player.c4Selected };
    });
    ok('按 G 主动掉包：引擎进入 dropped 态、原地可拾取、玩家携包缓存清空且 5 号槽自动退出',
      dropped0.dropped && dropped0.pickupable && !dropped0.carrying && !dropped0.c4Selected, JSON.stringify(dropped0), 'ui');
    await p3.keyboard.press('e');
    await p3.waitForFunction(() => {
      const g = window.__game, v = g.objectiveView(0);
      return v.bomb && v.bomb.carrierId === 0 && g.player.carryingC4 === true;
    }, null, { timeout: 5000 });
    const picked0 = await p3.evaluate(() => {
      const g = window.__game, v = g.objectiveView(0);
      return { carrierId: v.bomb ? v.bomb.carrierId : null, carrying: g.player.carryingC4 };
    });
    ok('按 E 拾回 C4：引擎 carrierId 复归 id 0、玩家携包缓存恢复',
      picked0.carrierId === 0 && picked0.carrying, JSON.stringify(picked0), 'ui');
    await p3.keyboard.press('5'); // 掉包时 5 号槽已自动退出，重新选中进入行走安放流程
    await p3.waitForFunction(() => window.__game.player.c4Selected === true, null, { timeout: 5000 });

    // 真实移动：共享导航寻路 + 触屏摇杆输入接口逐帧驱动（真实 World.move，无传送）
    const walk = await p3.evaluate(() => {
      const g = window.__game, p = g.player;
      const goal = g.navNodes.get('pf2'); // BL→A平台阵营目标节点（包点所在上层）
      const path = g.nav.findPath({ x: p.pos.x, y: p.pos.y, z: p.pos.z }, { x: goal.x, y: goal.y, z: goal.z }, { radius: 0.36, height: 1.8, canCrouch: true, canJump: true });
      if (!path || !path.length) return { ok: false, err: '寻路为空' };
      let frames = 0, maxStep = 0;
      for (let i = 1; i < path.length; i++) {
        const wp = path[i];
        for (let k = 0; k < 2400; k++) {
          const dx = wp.x - p.pos.x, dz = wp.z - p.pos.z, d = Math.hypot(dx, dz);
          if (d < 0.6) break;
          const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
          p.touch.mz = Math.max(-1, Math.min(1, (-sy * dx - cy * dz) / d));
          p.touch.mx = Math.max(-1, Math.min(1, (cy * dx - sy * dz) / d));
          if (wp.requires === 'jump' && d < 1.4 && p.onGround) p.touch.jump = true;
          p.touch.crouch = wp.requires === 'crouch';
          const px = p.pos.x, pz = p.pos.z;
          g.simulate(1 / 60);
          maxStep = Math.max(maxStep, Math.hypot(p.pos.x - px, p.pos.z - pz));
          frames++;
          if (!p.alive) return { ok: false, err: '途中阵亡' };
        }
      }
      p.touch.mx = p.touch.mz = 0; p.touch.crouch = false;
      const siteA = g.map.bombSites.find((s) => s.id === 'A');
      return { ok: true, frames, maxStep, distToA: Math.hypot(p.pos.x - siteA.x, p.pos.z - siteA.z), inSite: g.objectiveView(p.id).inSite };
    });
    ok('玩家从出生点真实走到 A 包点（导航寻路 + 逐帧物理驱动，无传送）',
      walk.ok && walk.inSite === 'A' && walk.distToA < 5.5, `frames=${walk.frames} dist=${walk.distToA?.toFixed(1)}m`, 'sim');
    ok('行走为真实物理位移（单帧水平位移 ≤ 0.35m）', walk.ok && walk.maxStep <= 0.35, `maxStep=${walk.maxStep?.toFixed(3)}`, 'sim');
    const hint0 = await p3.evaluate(() => {
      const g = window.__game;
      g.fastForward(0.2); // 刷新事实帧
      return { plantable: g.objectiveView(g.player.id).plantable, hint: document.getElementById('objHint').textContent };
    });
    ok('站上包点后 HUD 出现「按住左键安放」提示', hint0.plantable && hint0.hint.includes('安放'), JSON.stringify(hint0), 'ui');
    await p3.screenshot({ path: path.join(ART, 'bomb-player0-at-site.png') });

    // 真实鼠标按住安放（mousedown/up 走真实事件；首击先取得指针锁定），
    // 冻结模拟后等一个真实渲染帧再读 HUD（headless rAF 慢，不猜固定毫秒）
    await p3.mouse.move(400, 250);
    await p3.mouse.down(); await p3.mouse.up(); // 首击：nolock 下仅取得 locked
    await p3.mouse.down();
    await p3.waitForFunction(() => window.__game.bomb.action && window.__game.bomb.action.kind === 'plant', null, { timeout: 5000 });
    const t0 = await p3.evaluate(() => {
      const g = window.__game;
      g.fastForward(2.5); // 安放进行到一半（模拟时钟）
      g.paused = true;    // 冻结模拟，下一真实渲染帧即当前状态
      return g.realTime;
    });
    await p3.waitForFunction((t) => window.__game.realTime > t, t0, { timeout: 15000 });
    const progDom = await p3.evaluate(() => ({
      shown: !document.getElementById('objProg').classList.contains('hidden'),
      lbl: document.getElementById('objProgLbl').textContent,
      frac: parseFloat(document.getElementById('objProgFill').style.width),
    }));
    ok('按住左键安放中：HUD 进度条出现且比例随进度推进（plantHold 为分母）',
      progDom.shown && progDom.lbl.includes('安放') && progDom.frac > 20 && progDom.frac < 90, JSON.stringify(progDom), 'ui');
    await p3.screenshot({ path: path.join(ART, 'bomb-player0-planting.png') });
    await p3.evaluate(() => { const g = window.__game; g.paused = false; g.fastForward(3); });
    await p3.mouse.up();
    const t1 = await p3.evaluate(() => { const g = window.__game; g.paused = true; return g.realTime; });
    await p3.waitForFunction((t) => window.__game.realTime > t, t1, { timeout: 15000 });
    const planted0 = await p3.evaluate(() => {
      const g = window.__game; g.paused = false;
      return { planted: g.bomb.phase === 'planted' && g.bomb.bomb.planted && g.bomb.bomb.site === 'A', c4State: document.getElementById('c4State').textContent, c4Visible: g.c4.root.visible };
    });
    ok('安放成功：引擎 planted/site=A、世界 C4 标记可见、HUD 显示已安放',
      planted0.planted && planted0.c4Visible && planted0.c4State.includes('安放'), JSON.stringify(planted0), 'ui');
    await p3.mouse.up();
    await p3.screenshot({ path: path.join(ART, 'bomb-player0-planted.png') });

    // GR 全灭结算 → 下一回合玩家统一复活；随后观战 HUD（真实死亡镜头跟随队友）
    await p3.evaluate(() => {
      const g = window.__game;
      for (const a of g.actors) {
        if (a.team === 'GR' && a.alive) { a.protectT = 0; g.damage(a, g.player, 999, 'chest', 'ak47', { x: 1, z: 0 }, false, false); }
      }
      g.fastForward(0.5);
    });
    await p3.evaluate(() => window.__game.fastForward(4.3));
    const after0 = await p3.evaluate(() => {
      const g = window.__game;
      return { round: g.bomb.round, scoreBL: g.bomb.score.BL, alive: g.player.alive, carrying: g.player.carryingC4 };
    });
    ok('灭队结算 BL 胜后统一复活：玩家重新存活（C4 按回合轮转到下一名 BL）',
      after0.round === 2 && after0.scoreBL === 1 && after0.alive, JSON.stringify(after0), 'sim');

    const spectate = await p3.evaluate(() => {
      const g = window.__game;
      g.player.protectT = 0;
      const enemy = g.actors.find((a) => !a.isPlayer && a.team !== g.player.team && a.alive);
      g.damage(g.player, enemy, 999, 'chest', 'ak47', { x: 1, z: 0 }, false, false);
      g.fastForward(0.5);
      g.paused = true; // 冻结模拟，等真实渲染帧刷新 HUD 后再读 DOM
      return { realTime: g.realTime, mateName: g.player.spectateName };
    });
    await p3.waitForFunction((t) => window.__game.realTime > t, spectate.realTime, { timeout: 15000 });
    const specDom = await p3.evaluate(() => {
      const g = window.__game; g.paused = false;
      const mate = g.player.spectating;
      return {
        dead: !g.player.alive, name: g.player.spectateName,
        hud: document.getElementById('cBig').textContent,
        followed: mate ? Math.hypot(g.renderer.camera.position.x - mate.pos.x, g.renderer.camera.position.z - mate.pos.z) < 2.5 : false,
        noLeak: g.objectiveView(g.player.id).spectate.every((s) => g.actors.find((a) => a.id === s.id).team === g.player.team),
      };
    });
    ok('死亡观战：HUD 显示「观战中 · 队友名」且镜头真实跟随存活队友', specDom.dead && specDom.hud.includes('观战中') && specDom.followed, JSON.stringify({ name: specDom.name, hud: specDom.hud }), 'ui');
    ok('观战列表不泄露敌方（视图与实际阵营一致）', specDom.noLeak, '', 'sim');
    await p3.screenshot({ path: path.join(ART, 'bomb-player0-spectate.png') });
    await ctx3.close();

    // ---- 9. 运输船回归：TDM 保持、Game.bomb 恒为 null、objectiveView 恒为 null ----
    console.log('3. 运输船冒烟回归（爆破不得泄漏到 TDM）');
    const ctx2 = await browser.newContext({ viewport: { width: 640, height: 400 } });
    const p2 = await newPage(ctx2, `${URL_BASE}?map=transport-ship&q=low&nolock=1`);
    await p2.waitForSelector('#menu:not(.hidden)', { timeout: 60000 });
    await p2.click('#btnStart');
    await p2.waitForFunction(() => window.__game && window.__game.playing && window.__game.player && window.__game.player.alive, null, { timeout: 60000 });
    const ship = await p2.evaluate(() => {
      const g = window.__game;
      g.fastForward(6);
      const killsBefore = g.score.BL + g.score.GR;
      const enemy = g.actors.find((a) => !a.isPlayer && a.team !== g.player.team);
      return {
        id: g.mapDesc.id, mode: g.mode.id, bombNull: g.bomb === null, sessionNull: g.bombSession === null,
        viewNull: g.objectiveView() === null, ocean: !!g.env.ocean, respawn: g.mode.defaults.respawn,
        killScores: killsBefore >= 0, c4Absent: g.c4 === null,
      };
    });
    ok('运输船仍为团队竞技：海面保留、4 秒复活、无爆破会话/C4 标记/目标视图',
      ship.id === 'transport-ship' && ship.mode === 'tdm' && ship.bombNull && ship.sessionNull && ship.viewNull && ship.ocean && ship.respawn === 4 && ship.c4Absent,
      `mode=${ship.mode}`, 'ui');
    await p2.screenshot({ path: path.join(ART, 'ship-bomb-regression.png') });
    await ctx2.close();
  } finally {
    await browser.close();
    srv.close();
  }

  ok('无页面脚本异常', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 500), 'ui');

  const passed = results.filter((r) => r.pass).length;
  fs.writeFileSync(path.join(ART, 'e2e-bomb-results.json'), JSON.stringify({
    date: new Date().toISOString(),
    chrome: CHROME,
    note: 'driver=ui 真实用户操作；sim = fastForward/受控推进（规则验证）。最终真实渲染证据由 B/C lane 完成后的集成验收承担',
    results, consoleErrors, pageErrors,
  }, null, 2));
  console.log(`\ne2e-bomb: ${passed}/${results.length} 通过；结果与截图见 artifacts/`);
  if (passed !== results.length) process.exit(1);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
