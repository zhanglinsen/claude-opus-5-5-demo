// e2e-desert：沙漠灰集成验收（playwright-core + 本机 Chrome，对构建产物做真实浏览器检查）
// 覆盖：真实菜单开局、地图元数据契约、共享导航接口、双方出生点→阵营目标的
// 「真实 World.move 步进」路线走通（验证坡道/高低层可达且无跨障碍瞬移）、
// 机器人物理驱动的活跃度、无海面/烟囱泄漏、报点区域 HUD、地标截图与运输船冒烟。
// 驱动标记：ui = 真实用户操作；sim = fastForward/受控推进；setup = 直接调用游戏 API 构造场景。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ART = path.join(ROOT, 'artifacts');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 8901;
// 日常地图几何修复只验证真实路线；全量截图和运输船冒烟留给候选版验收。
const ROUTE_ONLY = process.env.E2E_ROUTE_ONLY === '1';
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
    // ---- 1. 真实菜单开局：全新用户（无 URL map=、无已存设置）默认选中沙漠灰，点击 Start 进入对局 ----
    console.log('1. 菜单开局（真实点击 Start，新用户默认地图）');
    const ctx = await browser.newContext({ viewport: { width: 800, height: 500 } });
    const page = await newPage(ctx, `${URL_BASE}?q=low&nolock=1`);
    await page.waitForSelector('#menu:not(.hidden)', { timeout: 60000 });
    ok('新用户菜单默认沙漠灰且可用（运输船仍可选）',
      await page.$eval('#mapSeg button[data-v=desert-grey]', (b) => b.classList.contains('on') && !b.disabled) &&
      await page.$eval('#mapSeg button[data-v=transport-ship]', (b) => !b.disabled), '', 'ui');
    await page.screenshot({ path: path.join(ART, 'desert-menu.png') });
    await page.click('#btnStart');
    await page.waitForFunction(() => window.__game && window.__game.playing && window.__game.player && window.__game.player.alive, null, { timeout: 60000 });
    ok('点击 Start 后进入沙漠灰对局且玩家存活', true, '', 'ui');

    // ---- 2. 地图元数据契约：出生点/边界/导航图/阵营目标/区域/灯塔 ----
    const meta = await page.evaluate(() => {
      const g = window.__game, B = g.mapDesc.bounds;
      const pts = [...g.map.spawns.BL, ...g.map.spawns.GR];
      const okPts = pts.every((p) => [p.x, p.y, p.z].every(Number.isFinite) && typeof p.yaw === 'number' &&
        p.x >= B.x0 && p.x <= B.x1 && p.z >= B.z0 && p.z <= B.z1);
      const tg = g.map.teamGoals || null;
      return {
        id: g.mapDesc.id, okPts, nBL: g.map.spawns.BL.length, nGR: g.map.spawns.GR.length,
        navNodes: g.map.navGraph ? g.map.navGraph.nodes.length : 0,
        navEdges: g.map.navGraph ? g.map.navGraph.edges.length : 0,
        teamGoals: tg ? { BL: tg.BL.length, GR: tg.GR.length } : null,
        regions: g.map.regions ? g.map.regions.length : 0,
        landmarks: g.map.landmarkViews ? g.map.landmarkViews.length : 0,
        lampSpots: Array.isArray(g.map.lampSpots),
        noOcean: g.env.ocean === null || g.env.ocean === undefined,
        noFunnel: !g.fx.funnelTop,
        navApi: typeof g.nav.findPath === 'function' && typeof g.nav.randomFree === 'function',
        py: g.player.pos.y, spawnY: g.map.spawns[g.player.team][0].y,
      };
    });
    ok('地图为沙漠灰且出生点 xyz+yaw 齐全并在边界内', meta.id === 'desert-grey' && meta.okPts,
      `BL=${meta.nBL} GR=${meta.nGR}`, 'sim');
    ok('玩家脚底高度来自出生点 y', Math.abs(meta.py - meta.spawnY) < 0.05, `py=${meta.py}`, 'sim');
    ok('导航图非空（节点/边）', meta.navNodes > 0 && meta.navEdges > 0, `nodes=${meta.navNodes} edges=${meta.navEdges}`, 'sim');
    ok('阵营目标非对称提供（BL/GR 各有目标节点）', !!meta.teamGoals && meta.teamGoals.BL > 0 && meta.teamGoals.GR > 0, JSON.stringify(meta.teamGoals), 'sim');
    ok('报点区域数据可用', meta.regions > 0, `regions=${meta.regions}`, 'sim');
    ok('共享导航接口就绪（findPath/randomFree）', meta.navApi, '', 'sim');
    ok('沙漠地图无海面且无烟囱氛围泄漏', meta.noOcean && meta.noFunnel, '', 'sim');
    ok('构建结果含 lampSpots 数组', meta.lampSpots, '', 'sim');

    // ---- 3. 导航图在真实装配下 0 拒绝边 / 全节点可达 ----
    console.log('2. 导航图完整性（真实 World + canTraverse）');
    const graphCheck = await page.evaluate(() => {
      const g = window.__game;
      const agent = { radius: 0.36, height: 1.8, canCrouch: true, canJump: true };
      const edges = g.map.navGraph.edges;
      const rejected = [];
      for (const e of edges) if (!g.nav.canTraverse(e.from, e.to, agent)) rejected.push(`${e.from}->${e.to}`);
      // 从 BL 出生区结点出发、经碰撞校验边的可达节点数
      const adj = new Map();
      for (const e of edges) {
        if (!g.nav.canTraverse(e.from, e.to, agent)) continue;
        if (!adj.has(e.from)) adj.set(e.from, []);
        if (!adj.has(e.to)) adj.set(e.to, []);
        adj.get(e.from).push(e.to);
        adj.get(e.to).push(e.from);
      }
      const start = g.map.navGraph.nodes.find((n) => n.region === 'blSpawn').id;
      const seen = new Set([start]);
      const queue = [start];
      while (queue.length) {
        const id = queue.pop();
        for (const to of adj.get(id) || []) if (!seen.has(to)) { seen.add(to); queue.push(to); }
      }
      return { edges: edges.length, rejected, reachable: seen.size, total: g.map.navGraph.nodes.length };
    });
    ok(`碰撞校验后被拒边为 0（${graphCheck.edges} 条边）`, graphCheck.rejected.length === 0, `rejected=${graphCheck.rejected.join(',')}`, 'sim');
    ok(`全部导航节点可达（${graphCheck.reachable}/${graphCheck.total}）`, graphCheck.reachable === graphCheck.total, `reachable=${graphCheck.reachable}`, 'sim');

    // ---- 4. 双方队伍 A/B 进攻与回防路线：真实 World.move 物理走通 ----
    console.log('3. 集成路线走通（真实 World.move，无瞬移）');
    // 每条腿：从该队出生点出发，经共享导航寻路到目标节点并逐步物理走完。
    // viaAny/minY 用于证明走的是预期拓扑（桥下/上层坑道/平台），而非任意直穿。
    const LEGS = [
      { id: 'BL→A平台包点', team: 'BL', goal: 'pf2', viaAny: ['aPlatform', 'aShort', 'aLedge'], minY: 2.5 },
      { id: 'BL→B包点', team: 'BL', goal: 'bs3', viaAny: ['underpass', 'bTunnelLower', 'bSite'] },
      { id: 'GR→A连接', team: 'GR', goal: 'ac2' },
      { id: 'GR→中门北', team: 'GR', goal: 'md2' },
      { id: 'GR→B连接', team: 'GR', goal: 'bc1' },
      { id: 'GR回防→A平台', team: 'GR', goal: 'plt2', viaAny: ['aPlatform', 'aConnect'], minY: 2.5 },
      { id: 'GR回防→B窗', team: 'GR', goal: 'wr3', viaAny: ['bWindow', 'bTunnelUpper', 'grStairs'], minY: 2.5 },
      { id: 'GR→B洞下层', team: 'GR', goal: 'lo2', viaAny: ['bTunnelLower', 'bConnect', 'bSite'] },
    ];
    for (const leg of LEGS) {
      const r = await page.evaluate((leg) => {
        const g = window.__game;
        const regionOf = new Map(g.map.navGraph.nodes.map((n) => [n.id, n.region]));
        const goalNode = g.navNodes.get(leg.goal);
        if (!goalNode) return { pathOk: false, err: '无此节点' };
        const sp = g.map.spawns[leg.team][0];
        const path = g.nav.findPath({ x: sp.x, y: sp.y, z: sp.z }, { x: goalNode.x, y: goalNode.y, z: goalNode.z }, { radius: 0.36, height: 1.8, canCrouch: true, canJump: true });
        if (!path || !path.length) return { pathOk: false, err: '寻路为空' };
        const regions = path.filter((p) => p.nodeId && regionOf.get(p.nodeId)).map((p) => regionOf.get(p.nodeId));
        // 真实 World.move 步进行走体（无渲染、纯物理）：单帧位移必须连续（无瞬移）
        const W = g.world, speed = 5.7, dt = 1 / 60;
        const ent = {
          pos: { x: path[0].x, y: path[0].y + 0.02, z: path[0].z }, vel: { x: 0, y: 0, z: 0 },
          radius: 0.36, height: 1.8, onGround: true, stepHeight: 0.42,
        };
        let maxStepXZ = 0, maxUp = 0, total = 0, stuckAt = -1;
        for (let wi = 1; wi < path.length; wi++) {
          const wp = path[wi];
          let frames = 0;
          for (;;) {
            const dx = wp.x - ent.pos.x, dz = wp.z - ent.pos.z;
            const dd = Math.hypot(dx, dz);
            if (dd < 0.6 || frames > 1200) break;
            ent.vel.x = (dx / dd) * speed; ent.vel.z = (dz / dd) * speed;
            if (wp.requires === 'jump' && dd < 1.4 && ent.onGround) ent.vel.y = 6.6;
            const px = ent.pos.x, py = ent.pos.y, pz = ent.pos.z;
            W.move(ent, dt);
            const sxz = Math.hypot(ent.pos.x - px, ent.pos.z - pz);
            maxStepXZ = Math.max(maxStepXZ, sxz);
            maxUp = Math.max(maxUp, ent.pos.y - py);
            total += sxz;
            frames++;
            if (ent.pos.y < (g.mapDesc.killY ?? -3)) break;
          }
          if (frames > 1200) { stuckAt = wi; break; }
        }
        const goal = path[path.length - 1];
        const reached = stuckAt < 0 &&
          Math.hypot(ent.pos.x - goal.x, ent.pos.z - goal.z) < 1.2 && Math.abs(ent.pos.y - goal.y) < 1.2;
        return {
          pathOk: true, reached, maxStepXZ, maxUp, total, stuckAt, pos: { ...ent.pos },
          maxY: Math.max(...path.map((p) => p.y)), regions,
        };
      }, leg);
      const viaOk = !leg.viaAny || (r.regions || []).some((rg) => leg.viaAny.includes(rg));
      const yOk = leg.minY === undefined || r.maxY >= leg.minY;
      ok(`${leg.id} 物理走通${leg.viaAny ? '（经预期区域）' : ''}${leg.minY !== undefined ? '且抵达上层' : ''}`,
        r.pathOk && r.reached && viaOk && yOk,
        r.pathOk === false ? r.err : `行程=${r.total?.toFixed(1)}m 终点y=${r.pos?.y?.toFixed(2)} 区域=${[...new Set(r.regions || [])].join('/')}`,
        'sim');
      ok(`${leg.id} 无瞬移（单帧水平位移 ≤ 0.35m、单帧抬升 ≤ 0.55m）`,
        r.maxStepXZ <= 0.35 && r.maxUp <= 0.55, `maxStep=${r.maxStepXZ?.toFixed(3)} maxUp=${r.maxUp?.toFixed(3)}`, 'sim');
    }

    // ---- 5. 机器人由物理驱动在图上真实活动（非传送） ----
    console.log('4. 机器人物理活跃度');
    const bots0 = await page.evaluate(() => {
      const g = window.__game;
      return g.actors.filter((a) => a !== g.player).map((a) => ({ id: a.id, x: a.pos.x, y: a.pos.y, z: a.pos.z, alive: a.alive }));
    });
    await page.evaluate(() => window.__game.fastForward(12));
    const bots1 = await page.evaluate((before) => {
      const g = window.__game, B = g.mapDesc.bounds, killY = g.mapDesc.killY ?? -3;
      const list = g.actors.filter((a) => a !== g.player).map((a) => ({ id: a.id, x: a.pos.x, y: a.pos.y, z: a.pos.z }));
      const inWorld = list.every((p) => p.x >= B.x0 - 2 && p.x <= B.x1 + 2 && p.z >= B.z0 - 2 && p.z <= B.z1 + 2 && p.y > killY);
      const moved = list.filter((p, i) => Math.hypot(p.x - before[i].x, p.z - before[i].z) > 2).length;
      return { inWorld, moved, n: list.length };
    }, bots0);
    ok('模拟 12s 后所有机器人仍在可玩范围内（未掉出/未穿墙瞬移）', bots1.inWorld, `n=${bots1.n}`, 'sim');
    ok('多数机器人发生了真实位移（AI 在导航图上行进）', bots1.moved >= Math.ceil(bots1.n * 0.6), `${bots1.moved}/${bots1.n}`, 'sim');

    // ---- 5. 报点区域 HUD ----
    const region = await page.evaluate(() => window.__game.regionAt(window.__game.player.pos));
    ok('玩家所在位置解析出报点区域', !!region, `region=${region}`, 'sim');

    // ---- 6. 地标截图（暂停模拟，逐地标摆相机；sim 驱动，截图机位传送仅用于视觉检查） ----
    if (!ROUTE_ONLY) {
    console.log('5. 地标/总览截图（相机直摆，仅作视觉证据）');
    // 冻结模拟并临时隐藏第一人称武器/准星（alive=false 时 renderFrame 不再强制显示 vm）
    await page.evaluate(() => { const g = window.__game; g.paused = true; g.player.alive = false; });
    await page.screenshot({ path: path.join(ART, 'desert-game-hud.png') });
    const lms = await page.evaluate(() => {
      const g = window.__game;
      // 关键机位优先：总览 + 双方出生/A/B + 高低层地标
      const PRIORITY = ['overview', 'blSpawn', 'aLong', 'aPit', 'aPlatform', 'mid', 'underpass', 'bTunnelUpper', 'bTunnelLower', 'bSite'];
      const byId = new Map((g.map.landmarkViews || []).map((v) => [v.id, v]));
      const picked = PRIORITY.map((id) => byId.get(id)).filter(Boolean);
      if (!picked.length) picked.push(...(g.map.landmarkViews || []).slice(0, 10));
      return picked.slice(0, 10).map((v) => ({ id: v.id, name: v.name, position: v.position, lookAt: v.lookAt }));
    });
    ok('地标视图数据可用', lms.length > 0, `landmarks=${lms.length}`, 'sim');
    for (const lm of lms) {
      await page.evaluate((v) => {
        const cam = window.__game.renderer.camera;
        cam.position.set(v.position.x, v.position.y, v.position.z);
        cam.lookAt(v.lookAt.x, v.lookAt.y, v.lookAt.z);
        cam.fov = 70; cam.updateProjectionMatrix();
      }, lm);
      // 等一帧真实渲染（等待 realTime 推进，不用固定毫秒猜测渲染速度）
      const t0 = await page.evaluate(() => window.__game.realTime);
      await page.waitForFunction((t) => window.__game.realTime > t, t0, { timeout: 10000 });
      await page.screenshot({ path: path.join(ART, `desert-landmark-${lm.id}.png`) });
      console.log(`    📷 ${lm.id}${lm.name ? ' · ' + lm.name : ''}`);
    }
    // 总览：高角度俯瞰整图
    await page.evaluate(() => {
      const g = window.__game, B = g.mapDesc.bounds;
      const cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2, span = Math.max(B.x1 - B.x0, B.z1 - B.z0);
      const cam = g.renderer.camera;
      cam.position.set(cx, span * 0.9, cz + span * 0.55);
      cam.lookAt(cx, 0, cz); cam.fov = 60; cam.updateProjectionMatrix();
    });
    await page.screenshot({ path: path.join(ART, 'desert-overview.png') });
    await page.evaluate(() => { window.__game.player.alive = true; });
    }
    await ctx.close();

    // ---- 7. 运输船冒烟回归 ----
    if (!ROUTE_ONLY) {
    console.log('6. 运输船冒烟回归');
    const ctx2 = await browser.newContext({ viewport: { width: 640, height: 400 } });
    const p2 = await newPage(ctx2, `${URL_BASE}?map=transport-ship&q=low&nolock=1`);
    await p2.waitForSelector('#menu:not(.hidden)', { timeout: 60000 });
    await p2.click('#btnStart');
    await p2.waitForFunction(() => window.__game && window.__game.playing && window.__game.player && window.__game.player.alive, null, { timeout: 60000 });
    const ship = await p2.evaluate(() => {
      const g = window.__game;
      g.fastForward(6);
      return {
        id: g.mapDesc.id, ocean: !!g.env.ocean, ambient: !!g.fx.funnelTop,
        bots: g.actors.length - 1, py: g.player.pos.y,
      };
    });
    ok('运输船仍可开局、海面/烟囱氛围保留、机器人正常', ship.id === 'transport-ship' && ship.ocean && ship.ambient && ship.bots > 0,
      `bots=${ship.bots} py=${ship.py}`, 'ui');
    await p2.screenshot({ path: path.join(ART, 'ship-smoke.png') });
    await ctx2.close();
    }
  } finally {
    await browser.close();
    srv.close();
  }

  ok('无页面脚本异常', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 500), 'ui');

  const passed = results.filter((r) => r.pass).length;
  fs.writeFileSync(path.join(ART, 'e2e-desert-results.json'), JSON.stringify({
    date: new Date().toISOString(),
    chrome: CHROME,
    note: `${ROUTE_ONLY ? '仅路线（跳过截图与运输船）' : '完整地标截图与运输船'}；低画质/小视口软渲染；driver=ui 真实用户操作，sim = fastForward/受控推进，setup = 直接场景构造`,
    results, consoleErrors, pageErrors,
  }, null, 2));
  console.log(`\ne2e-desert: ${passed}/${results.length} 通过；结果与截图见 artifacts/`);
  if (passed !== results.length) process.exit(1);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
