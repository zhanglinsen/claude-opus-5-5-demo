// 小屏 HUD 与触控区避让的几何测试（任务 8）。纯静态：解析 style.css 的 hud 分区里**声明**的位置与尺寸，
// 与 src/mobile/layout.js 的触控矩形、准星区做相交检查。不启动浏览器。
//
// 局限（务必知道）：这只验证“声明的盒子”彼此不重叠；真实内容（文字/图标）是否溢出这些盒子、
// 击杀信息实际行高等，必须由 scripts/accept-mobile.mjs 在真实页面里量包围盒确认。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { computeLayout, ACTS } from '../../../src/mobile/layout.js';

const css = fs.readFileSync(fileURLToPath(new URL('../../../src/style.css', import.meta.url)), 'utf8');

// ---- 取 hud 分区并解析（极简解析：够用于本分区的写法）----
function hudSection(text) {
  const b = text.indexOf('/* mobile:hud:begin');
  const e = text.indexOf('/* mobile:hud:end */');
  assert.ok(b >= 0 && e > b, '缺少 hud 分区哨兵');
  return text.slice(b, e);
}
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '');

function parseCss(text, media = null) {
  const rules = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open < 0) break;
    const prelude = text.slice(i, open).trim();
    let depth = 1; let j = open + 1;
    while (j < text.length && depth > 0) { if (text[j] === '{') depth++; else if (text[j] === '}') depth--; j++; }
    const body = text.slice(open + 1, j - 1);
    if (prelude.startsWith('@media')) rules.push(...parseCss(body, prelude));
    else rules.push({ selectors: prelude.split(',').map((s) => s.trim()), decls: parseDecls(body), media });
    i = j;
  }
  return rules;
}
function parseDecls(body) {
  const out = {};
  for (const d of body.split(';')) {
    const k = d.indexOf(':');
    if (k < 0) continue;
    out[d.slice(0, k).trim()] = d.slice(k + 1).trim();
  }
  return out;
}

const RULES = parseCss(stripComments(hudSection(css)));

// 媒体条件：只支持 (pointer:coarse) 与 (max-width:Npx)
const mediaApplies = (media, w) => {
  if (!media) return true;
  const m = /max-width\s*:\s*(\d+)px/.exec(media);
  return m ? w <= Number(m[1]) : true;
};

// 合并某个 HUD 块在给定宽度下的声明（按源码顺序，后者覆盖前者）
function declsOf(id, w) {
  const target = `html.is-touch #${id}`;
  const merged = {};
  for (const r of RULES) {
    if (!mediaApplies(r.media, w)) continue;
    if (r.selectors.includes(target)) Object.assign(merged, r.decls);
  }
  return merged;
}

// 值求解：Npx 或 calc(var(--saX,0px) + Npx)；auto/缺省 → null
function evalLen(value, safe) {
  if (value == null || value === 'auto') return null;
  let m = /^(-?\d+(?:\.\d+)?)px$/.exec(value);
  if (m) return Number(m[1]);
  m = /^calc\(\s*var\(--sa([trbl]),\s*0px\)\s*\+\s*(-?\d+(?:\.\d+)?)px\s*\)$/.exec(value);
  if (m) return safe[{ t: 'top', r: 'right', b: 'bottom', l: 'left' }[m[1]]] + Number(m[2]);
  throw new Error(`hud 分区里有测试不认识的长度写法：${value}`);
}

const HUD_BLOCKS = ['radarWrap', 'score', 'feed', 'vitals', 'ammo', 'nadeInfo', 'slotC4'];

function hudRects(w, h, safe) {
  const rects = {};
  for (const id of HUD_BLOCKS) {
    const d = declsOf(id, w);
    if (d.display === 'none') continue;
    const bw = evalLen(d.width, safe);
    const bh = evalLen(d.height ?? d['max-height'], safe);
    assert.ok(bw != null && bh != null, `${id} 必须显式声明 width 与 height（或 max-height），否则无法静态求矩形`);
    const left = evalLen(d.left, safe); const right = evalLen(d.right, safe);
    const top = evalLen(d.top, safe); const bottom = evalLen(d.bottom, safe);
    assert.ok(left != null || right != null, `${id} 缺少水平锚点`);
    assert.ok(top != null || bottom != null, `${id} 缺少垂直锚点`);
    rects[id] = {
      x: left != null ? left : w - right - bw,
      y: top != null ? top : h - bottom - bh,
      w: bw, h: bh,
    };
  }
  return rects;
}

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
function distToCircle(r, c) {
  const dx = Math.max(r.x - c.cx, 0, c.cx - (r.x + r.w));
  const dy = Math.max(r.y - c.cy, 0, c.cy - (r.y + r.h));
  return Math.hypot(dx, dy);
}

const NOTCH = { top: 0, right: 47, bottom: 21, left: 47 };
const NONE = { top: 0, right: 0, bottom: 0, left: 0 };
const VIEWPORTS = [
  [844, 390, NONE, '844×390'], [932, 430, NONE, '932×430'], [800, 360, NONE, '800×360'],
  [667, 375, NONE, '667×375（宽度 <800 的紧凑档）'],
  [844, 390, NOTCH, '844×390 含刘海/横条'], [812, 375, NOTCH, '812×375 含刘海/横条'],
];

for (const [w, h, safe, label] of VIEWPORTS) {
  test(`HUD 与触控区：${label} —— 都在视口内、互不重叠、避开准星区`, () => {
    const layout = computeLayout(w, h, safe);
    const hud = hudRects(w, h, safe);
    for (const id of ['radarWrap', 'score', 'feed', 'vitals', 'ammo']) assert.ok(hud[id], `${id} 应可见`);
    // 1) 在视口内
    for (const [id, r] of Object.entries(hud)) {
      assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h, `${label}: ${id} 出屏 ${JSON.stringify(r)}`);
    }
    // 2) 与全部触控矩形（含摇杆底座、顶部栏、槽位条、含未必出现的全屏键）不相交
    for (const [id, r] of Object.entries(hud)) {
      for (const act of ACTS) {
        assert.ok(!overlaps(r, layout.items[act]), `${label}: HUD ${id} ${JSON.stringify(r)} 与触控件 ${act} ${JSON.stringify({ x: layout.items[act].x, y: layout.items[act].y, w: layout.items[act].w, h: layout.items[act].h })} 重叠`);
      }
    }
    // 3) HUD 块之间互不重叠
    const ids = Object.keys(hud);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) assert.ok(!overlaps(hud[ids[i]], hud[ids[j]]), `${label}: HUD ${ids[i]} 与 ${ids[j]} 重叠`);
    }
    // 4) 不进入准星视野区
    for (const [id, r] of Object.entries(hud)) {
      assert.ok(distToCircle(r, layout.center) >= layout.center.r, `${label}: HUD ${id} 进入准星视野区（r=${layout.center.r}）`);
    }
  });
}

test('宽度 <800 的紧凑档：投掷物/C4 槽位隐藏，血量竖排到雷达下', () => {
  const compact = hudRects(667, 375, NONE);
  assert.equal(compact.nadeInfo, undefined);
  assert.equal(compact.slotC4, undefined);
  assert.ok(compact.vitals.h > compact.vitals.w * 0.6, '紧凑档血量应为竖排（高度接近宽度）');
  const wide = hudRects(844, 390, NONE);
  assert.ok(wide.nadeInfo && wide.slotC4, '宽档应保留投掷物/C4 槽位');
});

test('#slots 在触屏下隐藏（与触屏 1–4 槽位键重复，弹药块也显示武器名）', () => {
  assert.equal(declsOf('slots', 844).display, 'none');
});

test('hud 分区没有覆盖英文文案弹性规则（html[lang="en"] 的 white-space:normal 等）', () => {
  const section = stripComments(hudSection(css));
  assert.doesNotMatch(section, /html\[lang=/, 'hud 分区不应触碰 html[lang=…] 的规则');
  // 比分的 goal 在英文下允许换行（基线 white-space:normal）；本分区对它设了 nowrap，需要确认英文下不会撑破 34px 高度：
  // 这是已知风险，留给浏览器校准，这里只把它显式记录下来，防止被悄悄忘记。
  assert.match(section, /#score \.mid \.goal\{[^}]*white-space:nowrap/);
});

test.todo('英文文案下比分/击杀信息/弹药块的真实包围盒是否溢出声明的盒子——需 accept-mobile.mjs 在浏览器里量');
