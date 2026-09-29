// 视口与页面壳的静态测试（任务 6）：纯文本检查，不启动浏览器。
// 守住三件事：桌面渲染零变化（块外 CSS 与基线逐字相同、块内规则全部限定在 html.is-touch / pointer:coarse 下）、
// touch-action:none 只出现在画布与触控层、index.html 只多了 <meta>。
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const CF_SRC = fileURLToPath(new URL('../../../src/', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const BASE = process.env.MOBILE_BASE || 'perf-integration-20260929';
const css = fs.readFileSync(CF_SRC + 'style.css', 'utf8');
const html = fs.readFileSync(CF_SRC + 'index.html', 'utf8');

function baseline(rel) {
  try {
    return execFileSync('git', ['show', `${BASE}:cf-transport-ship/src/${rel}`], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) { return null; }
}
const SKIP_REASON = `git 或基线 ${BASE} 不可用（源码包/浅克隆）`;

// ---- 极简 CSS 解析：够用于本仓库的样式（无嵌套 @supports/@keyframes 之外的复杂结构）----
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '');

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
    else if (prelude.startsWith('@')) rules.push({ selectors: [prelude], body, media, at: true });
    else rules.push({ selectors: prelude.split(',').map((s) => s.trim()), body, media });
    i = j;
  }
  return rules;
}

// mobile 块（含哨兵注释），不含块前空行
function blockOf(text) {
  const b = text.indexOf('/* mobile:begin');
  const e = text.indexOf('/* mobile:end */');
  return b >= 0 && e > b ? { b, e: e + '/* mobile:end */'.length } : null;
}

test('mobile 哨兵块存在，且 5 个分区哨兵成对', () => {
  assert.ok(blockOf(css), '缺少 /* mobile:begin … /* mobile:end */');
  for (const name of ['shell', 'input', 'menu', 'orientation', 'hud']) {
    const b = css.indexOf(`/* mobile:${name}:begin`);
    const e = css.indexOf(`/* mobile:${name}:end */`);
    assert.ok(b >= 0 && e > b, `分区 ${name} 的哨兵缺失或顺序错误`);
  }
});

test('块内每条规则的选择器以 html.is-touch 开头，或位于 @media (pointer:coarse) 内（桌面渲染零变化）', () => {
  const { b, e } = blockOf(css);
  const rules = parseCss(stripComments(css.slice(b, e)));
  assert.ok(rules.length > 0, 'shell 分区至少应有规则');
  for (const r of rules) {
    if (r.media) {
      assert.match(r.media, /\(\s*pointer\s*:\s*coarse\s*\)/, `@media 必须是 (pointer:coarse)：${r.media}`);
      continue;
    }
    for (const s of r.selectors) assert.ok(s.startsWith('html.is-touch'), `选择器未限定在 html.is-touch 下：${s}`);
  }
});

test('touch-action:none 只出现在 #c 与 #touch 的规则上（大厅/暂停等 .screen 需要触摸滚动）', () => {
  const rules = parseCss(stripComments(css));
  const noneRules = rules.filter((r) => /touch-action\s*:\s*none/.test(r.body));
  assert.ok(noneRules.length >= 1, '应有 touch-action:none 的规则');
  for (const r of noneRules) {
    for (const s of r.selectors) {
      assert.match(s, /#(c|touch)(?![\w-])/, `touch-action:none 出现在不该出现的选择器上：${s}`);
    }
  }
});

test('shell 分区：安全区变量、overscroll、100dvh 与回退、点击高亮', () => {
  const { b, e } = blockOf(css);
  const text = stripComments(css.slice(b, e));
  for (const v of ['--sat:env(safe-area-inset-top', '--sar:env(safe-area-inset-right', '--sab:env(safe-area-inset-bottom', '--sal:env(safe-area-inset-left']) {
    assert.ok(text.includes(v), `缺少安全区变量 ${v}`);
  }
  assert.match(text, /height:100%;height:100dvh/, '100dvh 之前必须先写 100% 作为回退');
  assert.match(text, /overscroll-behavior:none/);
  assert.match(text, /-webkit-touch-callout:none/);
  assert.match(text, /-webkit-tap-highlight-color:transparent/);
});

test('块外 CSS 与基线逐字相同（忽略末尾空白）', (t) => {
  const base = baseline('style.css');
  if (base === null) return t.skip(SKIP_REASON);
  const { b, e } = blockOf(css);
  const outside = (css.slice(0, b) + css.slice(e)).trimEnd();
  assert.equal(outside, base.trimEnd(), '块外内容被改动：桌面渲染可能变化');
});

test('index.html：含移动端 meta，且相对基线只多了 <meta> 行；未擅自启用 viewport-fit=cover（决策 D2）', (t) => {
  assert.match(html, /<meta name="theme-color" content="#05070a">/);
  assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes">/);
  assert.match(html, /<meta name="mobile-web-app-capable" content="yes">/);
  assert.match(html, /<meta name="apple-mobile-web-app-status-bar-style" content="black">/);
  assert.doesNotMatch(html, /viewport-fit/, 'viewport-fit=cover 是需用户确认的决策，未确认前不得加入');
  const base = baseline('index.html');
  if (base === null) return t.skip(SKIP_REASON);
  const baseLines = new Set(base.split('\n'));
  const added = html.split('\n').filter((l) => l && !baseLines.has(l));
  assert.ok(added.length >= 4);
  // 必须是单个 <meta …> 元素：只看行首会被同一行里夹带的 <script> 等绕过
  for (const l of added) assert.match(l, /^<meta\b[^<>]*>$/, `新增了非单个 <meta> 元素的行：${l}`);
  const nowLines = new Set(html.split('\n'));
  for (const l of base.split('\n')) if (l) assert.ok(nowLines.has(l), `基线行被删改：${l}`);
});
