// Task 12 定向浏览器验收（平台扩展）：离线 file:// 冒烟、平台 HTTP mock、双语截图、
// 语言切换即时性/持久化、平台图短程实走与碰撞冒烟、广告自然断点 mock 冒烟。
// 与 e2e.mjs 的差异：headed Chrome + 真 GPU（与 accept-gpu-pair 同参）、串行单浏览器、
// 覆盖三构建目标；本结果不作为性能/帧率证据（性能走 accept-gpu-pair.mjs）。
// 用法：node scripts/accept-platform-browser.mjs [--out artifacts/platform-expansion]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.resolve(arg('--out', path.join(ROOT, 'artifacts', 'platform-expansion')));
const SHOTS = path.join(OUT, 'screenshots');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.PLATFORM_E2E_PORT || 8952);

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
}

const results = { tool: 'accept-platform-browser', startedAt: new Date().toISOString(), headless: false, checks: [], screenshots: [], externalRequests: {}, consoleErrors: {} };

function ok(name, cond, detail = '') {
  results.checks.push({ name, pass: !!cond, detail: String(detail).slice(0, 300) });
  if (!cond) throw new Error(`ACCEPT FAIL: ${name} ${detail}`);
  console.log(`  ✔ ${name}${detail ? ' — ' + detail : ''}`);
}

async function newPage(ctx, url, tag) {
  const page = await ctx.newPage();
  const consoleErrors = [];
  const external = [];
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith('http://127.0.0.1') && !u.startsWith('file:') && !u.startsWith('data:') && !u.startsWith('blob:')) {
      external.push(u);
    }
  });
  await page.goto(url, { waitUntil: 'load', timeout: 90000 });
  page.__accept = { consoleErrors, external, tag };
  results.consoleErrors[tag] = consoleErrors;
  results.externalRequests[tag] = external;
  return page;
}

async function waitMenu(page) {
  await page.waitForSelector('#menu:not(.hidden)', { timeout: 60000 });
  await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
}

async function waitPlaying(page) {
  await page.waitForFunction(() => window.__game && window.__game.playing, null, { timeout: 60000 });
  await page.waitForFunction(() => window.__game.player && window.__game.player.alive, null, { timeout: 60000 });
  await page.waitForTimeout(1800); // 场景稳定后截图（含 HUD/武器视图模型）
}

async function shot(page, name) {
  const p = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: p });
  results.screenshots.push({ name, file: path.relative(OUT, p) });
  console.log(`  📸 ${name}.png`);
}

const LANG_LABEL = '[data-i18n="menu.team"]';
async function uiLang(page) {
  return page.evaluate((sel) => ({
    docLang: document.documentElement.lang,
    label: document.querySelector(sel)?.textContent ?? null,
  }), LANG_LABEL);
}

async function mockInfo(page) {
  return page.evaluate(() => ({
    winMarker: window.__PLATFORM_MOCK__ ?? null,
    htmlMock: document.documentElement.getAttribute('data-platform-mock'),
    adapterId: window.__game?.platform?.adapter?.id ?? window.__game?.platform?.id ?? null,
  }));
}

// 短程实走：前进 durMs 后采样位移与越界/坠落检查（headed 真 GPU，实帧率走完全流程）
async function walkSmoke(page, durMs) {
  const before = await page.evaluate(() => {
    const p = window.__game.player.pos;
    return { x: p.x, y: p.y, z: p.z };
  });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(durMs);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => {
    const g = window.__game, p = g.player.pos, B = g.mapDesc.bounds;
    return { x: p.x, y: p.y, z: p.z, B, alive: g.player.alive };
  });
  const d = Math.hypot(after.x - before.x, after.z - before.z);
  const inBounds = after.x >= after.B.x0 - 1 && after.x <= after.B.x1 + 1 && after.z >= after.B.z0 - 1 && after.z <= after.B.z1 + 1;
  return { d: +d.toFixed(2), dy: +(after.y - before.y).toFixed(2), y: +after.y.toFixed(2), inBounds, alive: after.alive };
}

// 广告断点冒烟：菜单返回断点请求（mock/离线适配器无填充），断言不暂停不静音
async function adSmoke(page, tag) {
  const r = await page.evaluate(async () => {
    const g = window.__game;
    const res = await g.requestPlatformAd('menu-return');
    return {
      status: res && res.status, paused: !!g.paused, adPaused: !!g.adPaused,
      muted: g.audio ? (g.audio.adMuted ?? g.audio._adMuted ?? null) : null,
      platformKeys: g.platform ? Object.keys(g.platform) : null,
    };
  });
  ok(`[${tag}] 自然断点广告请求收口为 no-fill（mock 不播广告）`, r.status === 'no-fill', `status=${r.status}`);
  ok(`[${tag}] 广告收口后游戏未暂停、无广告暂停残留`, !r.paused && !r.adPaused, `paused=${r.paused} adPaused=${r.adPaused}`);
  ok(`[${tag}] 广告收口后无临时静音残留`, r.muted !== true, `muted=${r.muted}`);
  return r;
}

const run = async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  if (!fs.existsSync(CHROME)) throw new Error(`未找到 Chrome：${CHROME}`);
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: false, // 真 GPU（Radeon Pro 5500M），与性能测量同环境；截图才有代表性
    args: ['--window-size=1920,1080', '--window-position=0,0',
      '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling'],
  });
  const srv = await startServer(PORT);

  try {
    // ============ A. 离线构建（file://）============
    console.log('A. 离线 file:// 冒烟：默认中文、无外部请求、双语切换、装备/语言持久化、经典双图对照');
    // 显式指定浏览器语言，使「浏览器语言 > 构建默认」链路可确定性断言（本机系统语言为 zh-CN）
    const ctxOffline = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'zh-CN' });
    const fileUrl = 'file://' + path.join(DIST, 'index.html');
    let page = await newPage(ctxOffline, fileUrl, 'offline-menu');
    await waitMenu(page);
    ok('[offline] file:// 直接打开进入主菜单', true);
    let ui = await uiLang(page);
    ok('[offline] 全新玩家中文（浏览器 zh-CN > 构建默认，结果同为 zh）', (ui.docLang || '').startsWith('zh'), `docLang=${ui.docLang} label=${ui.label}`);
    let mi = await mockInfo(page);
    ok('[offline] 离线版无平台 mock 标记', !mi.winMarker && !mi.htmlMock, JSON.stringify(mi));
    ok('[offline] 无未处理控制台错误', page.__accept.consoleErrors.length === 0, page.__accept.consoleErrors.join(' | '));
    ok('[offline] 无运行时外部资源请求', page.__accept.external.length === 0, page.__accept.external.join(' | '));
    await shot(page, 'offline-menu-zh');

    // 语言切换即时更新菜单
    await page.click('#langSeg button[data-v=en]');
    await page.waitForTimeout(400);
    ui = await uiLang(page);
    ok('[offline] 菜单切英文即时生效（无需刷新）', (ui.docLang || '').startsWith('en') && ui.label !== '阵营', `docLang=${ui.docLang} label=${ui.label}`);
    await shot(page, 'offline-menu-en');

    // 换主武器 + 语言持久化：刷新后保持
    await page.click('.seg[data-k=primary] button[data-v=awm]');
    await page.waitForTimeout(200);
    await page.reload({ waitUntil: 'load' });
    await waitMenu(page);
    const persisted = await page.evaluate(() => {
      const opts = JSON.parse(localStorage.getItem('cf_opts_v2') || '{}');
      const profile = localStorage.getItem('cf_profile_v1');
      return { lang: opts.lang, primary: opts.primary, profileRaw: profile ? profile.slice(0, 120) : null };
    });
    ok('[offline] 刷新后语言选择保持（cf_opts_v2.lang=en）', persisted.lang === 'en', `lang=${persisted.lang}`);
    ok('[offline] 刷新后装备选择保持（cf_opts_v2.primary=awm）', persisted.primary === 'awm', `primary=${persisted.primary}`);
    ok('[offline] cf_profile_v1 军衔档案存在且可读', !!persisted.profileRaw, persisted.profileRaw ?? 'missing');
    ui = await uiLang(page);
    ok('[offline] 刷新后菜单仍为英文', (ui.docLang || '').startsWith('en'), `docLang=${ui.docLang}`);

    // 经典双图对照截图（离线保留经典图）
    for (const [mapId, shotName] of [['transport-ship', 'offline-classic-transport-ship'], ['desert-grey', 'offline-classic-desert-grey']]) {
      const p2 = await newPage(ctxOffline, `${fileUrl}?map=${mapId}&nolock=1`, `offline-${mapId}`);
      await waitMenu(p2);
      await p2.click('#btnStart');
      await waitPlaying(p2);
      ok(`[offline] 经典图 ${mapId} 进入对局且玩家存活`, true);
      await shot(p2, shotName);
      ok(`[offline] ${mapId} 无控制台错误/外部请求`, p2.__accept.consoleErrors.length === 0 && p2.__accept.external.length === 0,
        [...p2.__accept.consoleErrors, ...p2.__accept.external].join(' | '));
      await p2.close();
    }
    await ctxOffline.close();

    // ============ B. Y8 构建（HTTP mock）============
    console.log('B. Y8 HTTP mock：平台默认英文、mock 标记、无平台 SDK 外部请求、平台图限定、双语+触屏、短程实走、广告冒烟');
    // 浏览器语言 en-US：mock 无平台语言 → 浏览器 en 胜出（00f94f8 修复的空平台语言回退路径）
    const ctxY8 = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'en-US' });
    const y8Url = `http://127.0.0.1:${PORT}/y8/index.html`;
    page = await newPage(ctxY8, y8Url + '?nolock=1', 'y8-menu');
    await waitMenu(page);
    ui = await uiLang(page);
    ok('[y8] 浏览器 en-US + mock 无平台语言 → 英文（平台语言空缺回退浏览器）', (ui.docLang || '').startsWith('en'), `docLang=${ui.docLang}`);
    mi = await mockInfo(page);
    ok('[y8] mock 明示标记（window.__PLATFORM_MOCK__ + data-platform-mock）', mi.winMarker?.mock === true && mi.htmlMock === 'true', JSON.stringify(mi));
    ok('[y8] mock 目标为 y8、无真实 ID', mi.winMarker?.target === 'y8' && typeof mi.winMarker?.ids?.appId === 'string' && mi.winMarker.ids.appId.startsWith('mock-'), JSON.stringify(mi.winMarker?.ids ?? null));
    const maps = await page.evaluate(() => ({
      set: document.querySelector('meta[name="map-set"]')?.content || null,
      seg: [...document.querySelectorAll('#mapSeg button')].map((b) => ({ v: b.dataset.v, disabled: b.disabled })),
    }));
    // 期望地图集按包内 <meta name="map-set"> 推导（classic：运输船/沙漠灰；original：赤霞集市/雾港码头）
    const SET_MAPS = { classic: ['transport-ship', 'desert-grey'], original: ['platform-desert', 'platform-harbor'] };
    const setMaps = SET_MAPS[maps.set] || null;
    const [setMapA, setMapB] = setMaps || SET_MAPS.classic;
    ok('[y8] 图集元数据合法', !!setMaps, `map-set=${maps.set}`);
    ok('[y8] 地图菜单仅图集内双图', maps.seg.some((b) => b.v === setMapA && !b.disabled) && maps.seg.some((b) => b.v === setMapB && !b.disabled) &&
      maps.seg.every((b) => setMaps.includes(b.v)), JSON.stringify(maps.seg));
    ok('[y8] 无未处理控制台错误', page.__accept.consoleErrors.length === 0, page.__accept.consoleErrors.join(' | '));
    ok('[y8] 平台 mock 不加载真实 SDK / 无外部请求', page.__accept.external.length === 0, page.__accept.external.join(' | '));
    await shot(page, 'y8-menu-en');

    // 菜单切中文即时生效；刷新后保持（saved > platform）
    await page.click('#langSeg button[data-v=zh]');
    await page.waitForTimeout(400);
    ui = await uiLang(page);
    ok('[y8] 菜单切中文即时生效', (ui.docLang || '').startsWith('zh') && ui.label === '阵营', `docLang=${ui.docLang} label=${ui.label}`);
    await page.reload({ waitUntil: 'load' });
    await waitMenu(page);
    ui = await uiLang(page);
    ok('[y8] 刷新后中文保持（玩家选择 > 平台语言）', (ui.docLang || '').startsWith('zh'), `docLang=${ui.docLang}`);

    // 广告自然断点冒烟（mock → no-fill，不暂停）
    await adSmoke(page, 'y8');

    // 反向回退：浏览器 zh-CN + mock 无平台语言 → 中文（浏览器语言生效，而非内部 fallback 泄漏）
    const ctxY8Zh = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'zh-CN' });
    const pZh = await newPage(ctxY8Zh, y8Url + '?nolock=1', 'y8-menu-zhbrowser');
    await waitMenu(pZh);
    const uiZh = await uiLang(pZh);
    ok('[y8] 浏览器 zh-CN + mock 无平台语言 → 中文', (uiZh.docLang || '').startsWith('zh'), `docLang=${uiZh.docLang}`);
    await ctxY8Zh.close();

    // 图集默认图：触屏中文 + 短程实走 + 截图
    let p2 = await newPage(ctxY8, `${y8Url}?map=${setMapA}&nolock=1&touch=1&autostart=1`, 'y8-setA-zh');
    await waitPlaying(p2);
    const touchZh = await p2.evaluate(() => [...document.querySelectorAll('#touch .btn')].map((b) => b.textContent));
    ok('[y8] 触屏控件随语言即时本地化（中文 开火）', touchZh.includes('开火'), touchZh.join(','));
    const walk1 = await walkSmoke(p2, 2000);
    ok(`[y8] 图集默认图（${setMapA}）短程实走：位移>3 且未越界未坠落、保持存活`, walk1.d > 3 && walk1.inBounds && walk1.alive && Math.abs(walk1.dy) < 12, JSON.stringify(walk1));
    await shot(p2, `y8-${setMapA}-zh`);

    // 暂停菜单切英文：触屏/HUD 即时更新，恢复后截图。
    // nolock/touch 页无 pointer lock，Esc 暂停不可达（暂停由锁丢失触发）——经游戏 API 打开暂停（setup 驱动），
    // 语言切换与恢复仍走真实 UI 控件。
    await p2.evaluate(() => window.__game.pause());
    await p2.waitForSelector('#pause:not(.hidden)', { timeout: 60000 });
    await p2.click('#langSegPause button[data-v=en]');
    await p2.waitForTimeout(400);
    const touchEn = await p2.evaluate(() => [...document.querySelectorAll('#touch .btn')].map((b) => b.textContent));
    ui = await uiLang(p2);
    ok('[y8] 对局中切英文：触屏按钮即时更新（FIRE）', touchEn.includes('FIRE') && (ui.docLang || '').startsWith('en'), touchEn.join(','));
    await p2.click('#btnResume');
    await p2.waitForTimeout(1200);
    await shot(p2, `y8-${setMapA}-en`);
    ok('[y8] 图集默认图无控制台错误/外部请求', p2.__accept.consoleErrors.length === 0 && p2.__accept.external.length === 0,
      [...p2.__accept.consoleErrors, ...p2.__accept.external].join(' | '));
    await p2.close();

    // 图集第二张图：出生点视角截图（英文），实走冒烟移到截图后；另开一页取中文出生点视角
    p2 = await newPage(ctxY8, `${y8Url}?map=${setMapB}&nolock=1&autostart=1`, 'y8-setB');
    await waitPlaying(p2);
    await shot(p2, `y8-${setMapB}-en`);
    const walk2 = await walkSmoke(p2, 2000);
    ok(`[y8] 图集第二图（${setMapB}）短程实走：位移>3 且未越界未坠落、保持存活`, walk2.d > 3 && walk2.inBounds && walk2.alive && Math.abs(walk2.dy) < 12, JSON.stringify(walk2));
    await p2.close();
    p2 = await newPage(ctxY8, `${y8Url}?map=${setMapB}&nolock=1&autostart=1`, 'y8-setB-zh');
    await waitPlaying(p2);
    await p2.evaluate(() => window.__game.pause());
    await p2.waitForSelector('#pause:not(.hidden)', { timeout: 60000 });
    await p2.click('#langSegPause button[data-v=zh]');
    await p2.waitForTimeout(400);
    await p2.click('#btnResume');
    await p2.waitForTimeout(1200);
    await shot(p2, `y8-${setMapB}-zh`);
    await p2.close();
    await ctxY8.close();

    // ============ C. GameMonetize 构建（HTTP mock）============
    console.log('C. GameMonetize HTTP mock：mock 标记、平台图限定、无外部请求、广告冒烟');
    const ctxGM = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'en-US' });
    page = await newPage(ctxGM, `http://127.0.0.1:${PORT}/gamemonetize/index.html?nolock=1`, 'gm-menu');
    await waitMenu(page);
    ui = await uiLang(page);
    ok('[gm] 全新玩家平台默认英文', (ui.docLang || '').startsWith('en'), `docLang=${ui.docLang}`);
    mi = await mockInfo(page);
    ok('[gm] mock 明示标记且目标为 gamemonetize', mi.winMarker?.mock === true && mi.winMarker?.target === 'gamemonetize' && mi.htmlMock === 'true', JSON.stringify(mi));
    ok('[gm] 无未处理控制台错误', page.__accept.consoleErrors.length === 0, page.__accept.consoleErrors.join(' | '));
    ok('[gm] 平台 mock 不加载真实 SDK / 无外部请求', page.__accept.external.length === 0, page.__accept.external.join(' | '));
    await adSmoke(page, 'gm');
    await shot(page, 'gm-menu-en-mock');
    await ctxGM.close();

    results.finishedAt = new Date().toISOString();
    results.allPass = results.checks.every((c) => c.pass);
    fs.writeFileSync(path.join(OUT, 'browser-acceptance.json'), JSON.stringify(results, null, 2));
    console.log(`\n全部通过：${results.checks.filter((c) => c.pass).length}/${results.checks.length} 项检查，截图 ${results.screenshots.length} 张`);
    console.log(`结果：${path.join(OUT, 'browser-acceptance.json')}`);
  } finally {
    await browser.close().catch(() => {});
    await new Promise((r) => srv.close(r));
  }
};

run().catch((e) => {
  results.finishedAt = new Date().toISOString();
  results.fatal = String(e);
  results.allPass = false;
  try { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'browser-acceptance.json'), JSON.stringify(results, null, 2)); } catch (_) {}
  console.error(e);
  process.exit(1);
});
