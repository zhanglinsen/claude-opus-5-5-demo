// 经典 FPS 作战大厅浏览器验收（菜单重构任务）：
// 默认作战 tab 可见、其余面板 hidden、切 tab 内容可见且 #btnStart 始终可用、
// 地图/模式选择仍可操作、双语标签切换、品牌不含原作品牌词、
// 桌面 1600×900 与触屏横屏 844×390 无横向溢出/关键元素出界。
// 复用 playwright-core + 本机 Chrome（headless），串行单浏览器，只做 UI 边界检查。
// 用法：node scripts/accept-lobby.mjs [--out artifacts/lobby]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(arg('--out', path.join(ROOT, 'artifacts', 'lobby')));
const SHOTS = path.join(OUT, 'screenshots');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.LOBBY_E2E_PORT || 8966);
const BRAND_ZH = 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'src/assets/studio/infinity-zh-transparent.png')).toString('base64');
const BRAND_EN = 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'src/assets/studio/infinity-en-transparent.png')).toString('base64');

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
}

const results = { tool: 'accept-lobby', startedAt: new Date().toISOString(), checks: [], screenshots: [], consoleErrors: {} };
let failed = 0;

function ok(name, cond, detail = '') {
  results.checks.push({ name, pass: !!cond, detail: String(detail).slice(0, 300) });
  console.log(`  ${cond ? '✔' : '✘'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failed++;
}

async function newPage(browser, { viewport, touch, tag }) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  results.consoleErrors[tag] = errors;
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForSelector('#menu:not(.hidden)', { timeout: 60000 });
  await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
  page.__tag = tag;
  return { ctx, page };
}

async function shot(page, name) {
  const p = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: p });
  results.screenshots.push({ name, file: path.relative(OUT, p) });
  console.log(`  📸 ${name}.png`);
}

// 布局边界：页面无横向溢出；给定选择器全部可见且完整落在视口内
async function layoutOk(page, selectors) {
  return page.evaluate((sels) => {
    const out = { overflowX: document.documentElement.scrollWidth - window.innerWidth, misses: [] };
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (!el) { out.misses.push(`${sel}:missing`); continue; }
      const r = el.getBoundingClientRect();
      const visible = r.width > 0 && r.height > 0;
      const inside = r.left >= -1 && r.top >= -1 && r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 1;
      if (!visible || !inside) out.misses.push(`${sel}:rect=${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}`);
    }
    return out;
  }, selectors);
}

const CF_RE = /穿越火线|CROSSFIRE|CrossFire/i;

async function runLobbyChecks(page, { tag }) {
  // 1. 默认作战 tab 可见，其余面板 hidden
  ok(`${tag}: 默认作战面板可见`, await page.$eval('#panelBattle', (el) => !el.hidden && el.offsetParent !== null));
  for (const id of ['panelLoadout', 'panelSettings', 'panelControls']) {
    ok(`${tag}: ${id} 默认隐藏`, await page.$eval(`#${id}`, (el) => el.hidden));
  }
  ok(`${tag}: 作战 tab aria-selected`, await page.$eval('[data-tab="battle"]', (el) => el.getAttribute('aria-selected') === 'true'));

  // 2. 品牌：无原作品牌词；品牌图为当前语言图（切换语言后 src 变化）
  const logo = await page.$eval('#menu .logo', (el) => el.textContent);
  ok(`${tag}: 品牌 logo 不含原作品牌词`, !CF_RE.test(logo), logo);
  const title = await page.title();
  ok(`${tag}: 页面标题不含原作品牌词`, !CF_RE.test(title), title);
  const srcZh = await page.$eval('#brandMark', (el) => (el.classList.contains('hidden') ? '' : el.src));
  ok(`${tag}: 中文品牌图使用无黑底原图`, srcZh === BRAND_ZH, `len=${srcZh.length}`);
  ok(`${tag}: 网页标签使用无黑底工作室图标`, await page.$eval('link[rel="icon"]', (el, src) => el.href === src, BRAND_ZH));

  // 3. tab 切换：内容可见 + #btnStart 始终可用
  for (const [tab, probe] of [
    ['loadout', '#profileBox'],
    ['settings', '#langSeg'],
    ['controls', '#panelControls .keys kbd'],
  ]) {
    await page.click(`[data-tab="${tab}"]`);
    await page.waitForTimeout(60);
    const probeSel = tab === 'controls' ? '#panelControls .keys kbd' : probe;
    ok(`${tag}: 切到 ${tab} 后内容可见`, await page.$eval(probeSel, (el) => !el.hidden && el.offsetParent !== null));
    ok(`${tag}: ${tab} 页 #btnStart 仍可用`, await page.$eval('#btnStart', (el) => !el.hidden && !el.disabled && el.offsetParent !== null));
    if (tab === 'loadout') {
      ok(`${tag}: 装备页预设分段存在`, await page.$eval('#presetSeg', (el) => el.offsetParent !== null));
      await page.click('#panelLoadout [data-k="primary"] button[data-v="m4a1"]');
      ok(`${tag}: 主武器选择保存到本地`, await page.evaluate(() => JSON.parse(localStorage.getItem('cf_opts_v2')).primary === 'm4a1'));
    }
    if (tab === 'settings') {
      await page.click('#panelSettings [data-k="tod"] button[data-v="dusk"]');
      ok(`${tag}: 时间设置保存到本地`, await page.evaluate(() => JSON.parse(localStorage.getItem('cf_opts_v2')).tod === 'dusk'));
    }
  }
  ok(`${tag}: 操作页键位清单完整（≥17 行）`, await page.$$eval('#panelControls .keys kbd', (ks) => ks.length >= 17));
  ok(`${tag}: 旧 tab 面板互斥`, await page.$eval('#panelSettings', (el) => el.hidden) && await page.$eval('#panelBattle', (el) => el.hidden));

  // 4. 键盘：焦点在导航上，方向键/Home/End 可切换
  await page.focus('[data-tab="battle"]');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(60);
  ok(`${tag}: ArrowRight 切到装备`, await page.$eval('[data-tab="loadout"]', (el) => el.getAttribute('aria-selected') === 'true' && document.getElementById('panelLoadout').hidden === false));
  await page.keyboard.press('End');
  await page.waitForTimeout(60);
  ok(`${tag}: End 切到操作`, await page.$eval('[data-tab="controls"]', (el) => el.getAttribute('aria-selected') === 'true'));
  await page.keyboard.press('Home');
  await page.waitForTimeout(60);
  ok(`${tag}: Home 回到作战`, await page.$eval('[data-tab="battle"]', (el) => el.getAttribute('aria-selected') === 'true'));

  // 5. 地图/模式选择仍可操作：切到沙漠灰（页面按现有逻辑重载），模式随图默认
  await page.click('#mapSeg button[data-v=desert-grey]');
  await page.waitForSelector('#menu:not(.hidden)', { timeout: 60000 });
  await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
  ok(`${tag}: 沙漠灰选中`, await page.$eval('#mapSeg button[data-v=desert-grey]', (b) => b.classList.contains('on') && !b.disabled));
  ok(`${tag}: 运输船仍可点`, await page.$eval('#mapSeg button[data-v=transport-ship]', (b) => !b.disabled));
  await page.click('[data-tab="loadout"]');
  ok(`${tag}: 重载后主武器选择仍在`, await page.$eval('#panelLoadout [data-k="primary"] button[data-v="m4a1"]', (b) => b.classList.contains('on')));
  await page.click('[data-tab="settings"]');
  ok(`${tag}: 重载后时间设置仍在`, await page.$eval('#panelSettings [data-k="tod"] button[data-v="dusk"]', (b) => b.classList.contains('on')));
  await page.click('[data-tab="battle"]');
  // 沙漠灰默认爆破 → 仅 TDM 的击杀目标设置隐藏，不误导
  ok(`${tag}: 爆破模式下隐藏击杀目标`, await page.$eval('#goalOpt', (el) => el.hidden));
  await page.click('#modeSeg button[data-v=tdm]');
  await page.waitForTimeout(60);
  ok(`${tag}: TDM 下击杀目标可见`, await page.$eval('#goalOpt', (el) => !el.hidden));
  ok(`${tag}: TDM 高亮`, await page.$eval('#modeSeg button[data-v=tdm]', (b) => b.classList.contains('on')));

  // 6. 双语：设置页切英文，标签变化 + 品牌图换英文原图
  await page.click('[data-tab="settings"]');
  await page.click('#langSeg button[data-v=en]');
  await page.waitForTimeout(120);
  const startEn = await page.$eval('#btnStart', (el) => el.textContent);
  const tabEn = await page.$eval('[data-tab="battle"]', (el) => el.textContent);
  ok(`${tag}: 英文出击按钮文案`, /START/i.test(startEn), startEn);
  ok(`${tag}: 英文导航文案`, /BATTLE/i.test(tabEn), tabEn);
  const srcEn = await page.$eval('#brandMark', (el) => el.src);
  ok(`${tag}: 英文品牌图使用无黑底原图`, srcEn === BRAND_EN, `len=${srcEn.length}`);
  ok(`${tag}: 英文网页标签跟随工作室图标`, await page.$eval('link[rel="icon"]', (el, src) => el.href === src, BRAND_EN));
  const logoEn = await page.$eval('#menu .logo', (el) => el.textContent);
  ok(`${tag}: 英文 logo 为 INFINITY 工作室`, /INFINITY/i.test(logoEn), logoEn);
  await page.click('#langSeg button[data-v=zh]');
  await page.waitForTimeout(120);
  ok(`${tag}: 切回中文导航恢复`, await page.$eval('[data-tab="battle"]', (el) => /作战/.test(el.textContent)));
  ok(`${tag}: 切换语言保留当前设置页`, await page.$eval('#panelSettings', (el) => !el.hidden));
  await page.click('[data-tab="battle"]');
  ok(`${tag}: 返回作战页后面板可见`, await page.$eval('#panelBattle', (el) => !el.hidden));
}

async function layoutChecks(page, { tag, extraSelectors }) {
  const sel = ['#btnStart', '[data-tab="battle"]', '[data-tab="controls"]', '#mapSeg button.on', ...extraSelectors];
  const lay = await layoutOk(page, sel);
  ok(`${tag}: 无页面横向溢出`, lay.overflowX <= 0, `scrollWidth-innerWidth=${lay.overflowX}`);
  ok(`${tag}: 关键元素完整在视口内`, lay.misses.length === 0, lay.misses.join('; '));
}

const server = await startServer(PORT);
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
fs.mkdirSync(SHOTS, { recursive: true });
try {
  // ---------- 桌面 16:9（1600×900） ----------
  console.log('— 桌面 1600×900 —');
  const desk = await newPage(browser, { viewport: { width: 1600, height: 900 }, touch: false, tag: 'desktop-zh' });
  await runLobbyChecks(desk.page, { tag: 'desktop' });
  await layoutChecks(desk.page, { tag: 'desktop', extraSelectors: ['#panelBattle', '#mapTitle'] });
  await shot(desk.page, 'desktop-zh');
  // 英文桌面截图（沿用当前沙漠灰/TDM 状态）
  await desk.page.click('[data-tab="settings"]');
  await desk.page.click('#langSeg button[data-v=en]');
  await desk.page.waitForTimeout(120);
  await desk.page.click('[data-tab="battle"]');
  await layoutChecks(desk.page, { tag: 'desktop-en', extraSelectors: ['#panelBattle', '#mapTitle'] });
  await shot(desk.page, 'desktop-en');
  const deskErrs = results.consoleErrors['desktop-zh'];
  ok('desktop: 无页面脚本异常', deskErrs.length === 0, deskErrs.join(' | ').slice(0, 300));
  await desk.page.click('#btnStart');
  await desk.page.waitForSelector('#hud:not(.hidden)', { timeout: 60000 });
  ok('desktop: 从大厅出击进入对局', await desk.page.$eval('#menu', (el) => el.classList.contains('hidden')));
  await desk.ctx.close();

  // ---------- 触屏横屏（844×390） ----------
  console.log('— 触屏横屏 844×390 —');
  const touch = await newPage(browser, { viewport: { width: 844, height: 390 }, touch: true, tag: 'touch-zh' });
  await runLobbyChecks(touch.page, { tag: 'touch' });
  await layoutChecks(touch.page, { tag: 'touch', extraSelectors: ['#panelBattle', '#mapTitle'] });
  await shot(touch.page, 'touch-zh');
  await touch.page.click('[data-tab="settings"]');
  await touch.page.click('#langSeg button[data-v=en]');
  await touch.page.waitForTimeout(120);
  await touch.page.click('[data-tab="battle"]');
  await layoutChecks(touch.page, { tag: 'touch-en', extraSelectors: ['#panelBattle', '#mapTitle'] });
  await shot(touch.page, 'touch-en');
  const touchErrs = [...results.consoleErrors['touch-zh']];
  ok('touch: 无页面脚本异常', touchErrs.length === 0, touchErrs.join(' | ').slice(0, 300));
  await touch.ctx.close();
} finally {
  await browser.close();
  server.close();
  fs.writeFileSync(path.join(OUT, 'accept-lobby-result.json'), JSON.stringify(results, null, 2));
}

console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项失败`);
process.exit(failed === 0 ? 0 : 1);
