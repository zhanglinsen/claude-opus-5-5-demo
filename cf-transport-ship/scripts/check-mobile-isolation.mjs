// 手机端适配的性能隔离守卫（任务 1）。只读 git；不写文件、不联网、不构建、不开浏览器。
//
// 用法（在仓库任意位置运行）：
//   node cf-transport-ship/scripts/check-mobile-isolation.mjs [--base <ref>] [--head <ref>] [--lane <L>] [--json]
//
//   --base  比较基线，缺省 perf-integration-20260929；ref 不存在退出码 2。
//   --head  被检查的分支/提交。缺省检查当前工作区：merge-base(base,HEAD) 到工作区的全部改动，含未提交与未跟踪。
//           协调者验收某个 lane 分支时传 --head，只看 merge-base(base,head)..head 的提交差异。
//   --lane  再按契约 §1 的文件所有权检查；style.css 还要落在该 lane 的哨兵分区内。
//
// 退出码：0 通过；1 有违规；2 参数或 git 错误。
//
// 规则来源：.ultra/specs/mobile-adaptation-20260930.md 的 US-M06（白名单与禁区）与
// .ultra/mobile-adaptation/dispatch/contract.md §1（lane 所有权）。两处保持一致，改一处必须同步另一处。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CF = 'cf-transport-ship/';
export const DEFAULT_BASE = 'perf-integration-20260929';

const exact = (p) => (x) => x === p;
const prefix = (p) => (x) => x.startsWith(p);
const regex = (r) => (x) => r.test(x);

// 规格 US-M06 第 1 条：全局白名单
const ALLOWED = [
  exact(`${CF}src/touch.js`),
  prefix(`${CF}src/mobile/`),
  exact(`${CF}src/i18n/catalogs.js`),
  exact(`${CF}src/style.css`),
  exact(`${CF}src/index.html`),
  prefix(`${CF}tests/`),
  exact(`${CF}scripts/accept-mobile.mjs`),
  exact(`${CF}scripts/check-mobile-isolation.mjs`),
  exact(`${CF}README.md`),
  prefix('.ultra/mobile-adaptation/'),
  regex(/^\.ultra\/specs\/mobile-adaptation-[^/]+\.md$/),
];

// 规格 US-M06 第 2 条：禁区（性能任务的热路径与归属文件）
const FORBIDDEN = [
  ...['hud', 'effects', 'physics', 'game', 'render', 'env', 'player', 'actor', 'weapons', 'bots', 'audio'].map((n) => exact(`${CF}src/${n}.js`)),
  prefix(`${CF}src/ai/`),
  prefix(`${CF}src/combat/`),
  prefix('.ultra/tasks/'),
  regex(/^\.ultra\/specs\/performance-/),
  prefix('pelican-bike/'),
  prefix('qq-speed/'),
];

const MOBILE_TESTS = `${CF}tests/unit/mobile/`;
const T = (n) => exact(`${MOBILE_TESTS}${n}`);

// 契约 §1：lane → 该 lane 可以改的文件（另外每个 lane 都可以写自己的报告）
export const LANES = {
  L1: [exact(`${CF}scripts/check-mobile-isolation.mjs`), T('isolation.test.mjs'), T('desktop-equivalence.test.mjs')],
  L2: [T('helpers/touch-dom.mjs'), T('touch-input.test.mjs'), T('touch-menu.test.mjs'), T('touch-lifecycle.test.mjs')],
  L3b: [exact(`${CF}src/touch.js`), exact(`${CF}src/style.css`)],
  L4: [exact(`${CF}src/mobile/menu.js`), exact(`${CF}src/style.css`), T('menu-module.test.mjs')],
  L5: [exact(`${CF}src/mobile/lifecycle.js`), T('lifecycle-module.test.mjs')],
  L6: [exact(`${CF}src/index.html`), exact(`${CF}src/style.css`), T('shell.test.mjs')],
  L7: [exact(`${CF}src/mobile/orientation.js`), exact(`${CF}src/mobile/fullscreen.js`), exact(`${CF}src/style.css`),
    T('orientation-module.test.mjs'), T('fullscreen-module.test.mjs')],
  L8: [exact(`${CF}src/style.css`), T('hud-geometry.test.mjs'), exact(`${CF}src/mobile/layout.js`)],
  L9: [exact(`${CF}scripts/accept-mobile.mjs`), T('accept-mobile-gate.test.mjs')],
  L10a: [exact(`${CF}README.md`), exact('.ultra/mobile-adaptation/device-checklist.md')],
};
LANES.L2a = LANES.L2;
LANES.L2b = LANES.L2;
// style.css 是分区共享文件：lane → 哨兵分区名
export const LANE_SECTION = { L3b: 'input', L4: 'menu', L6: 'shell', L7: 'orientation', L8: 'hud' };

const canonicalLane = (lane) => (lane === 'L2a' || lane === 'L2b' ? 'L2' : lane);

/**
 * 判定单个改动路径。
 * @param {string} p 相对仓库根的 POSIX 路径
 * @param {{lane?:string,status?:'A'|'M'|'D'}} [opt]
 * @returns {{verdict:'ok'|'forbidden'|'foreign'|'lane'|'contract',reason?:string}}
 */
export function classify(p, { lane, status = 'M' } = {}) {
  if (FORBIDDEN.some((f) => f(p))) return { verdict: 'forbidden', reason: '性能任务的禁区文件（规格 US-M06 第 2 条）' };
  if (!ALLOWED.some((f) => f(p))) return { verdict: 'foreign', reason: '不在白名单内（规格 US-M06 第 1 条）' };
  // 现有测试是兼容契约：只能新增，不能改/删。tests/unit/mobile/ 是本计划自己的目录，不受此限
  if (p.startsWith(`${CF}tests/`) && !p.startsWith(MOBILE_TESTS) && status !== 'A') {
    return { verdict: 'contract', reason: '现有测试是兼容契约，不得修改或删除' };
  }
  if (lane) {
    const key = canonicalLane(lane);
    if (!LANES[key]) return { verdict: 'lane', reason: `未知 lane：${lane}` };
    const own = LANES[key].some((f) => f(p));
    const report = new RegExp(`^\\.ultra/mobile-adaptation/reports/${lane}-[^/]+\\.md$`).test(p)
      || new RegExp(`^\\.ultra/mobile-adaptation/reports/${key}-[^/]+\\.md$`).test(p);
    if (!own && !report) return { verdict: 'lane', reason: `不属于 ${lane} 的所有权（契约 §1）` };
  }
  return { verdict: 'ok' };
}

// ---------------- git 输出解析（纯函数，便于单测） ----------------

/** 解析 `git diff --name-status -M` 输出。重命名拆成 旧路径 D + 新路径 A。 */
export function parseNameStatus(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    const code = parts[0][0];
    if (code === 'R') { out.push({ status: 'D', path: parts[1] }); out.push({ status: 'A', path: parts[2] }); }
    else if (code === 'C') out.push({ status: 'A', path: parts[2] });
    else out.push({ status: code === 'A' || code === 'D' ? code : 'M', path: parts[1] });
  }
  return out;
}

/** 解析 `git diff -U0` 的 hunk 头。 */
export function parseHunks(diffText) {
  const hunks = [];
  const re = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
  for (const line of diffText.split('\n')) {
    const m = re.exec(line);
    if (!m) continue;
    hunks.push({
      oldStart: +m[1], oldCount: m[2] === undefined ? 1 : +m[2],
      newStart: +m[3], newCount: m[4] === undefined ? 1 : +m[4],
    });
  }
  return hunks;
}

/** 找出 style.css 里的 mobile 哨兵块与各分区的行号范围（1 起，含哨兵行）。 */
export function sectionRanges(lines) {
  const block = { begin: 0, end: 0 };
  const sections = {};
  const open = {};
  lines.forEach((text, i) => {
    const n = i + 1;
    if (/\/\*\s*mobile:begin\b/.test(text)) block.begin = n;
    else if (/\/\*\s*mobile:end\s*\*\//.test(text)) block.end = n;
    let m = /\/\*\s*mobile:(\w+):begin\b/.exec(text);
    if (m) { open[m[1]] = n; return; }
    m = /\/\*\s*mobile:(\w+):end\s*\*\//.exec(text);
    if (m && open[m[1]]) sections[m[1]] = { begin: open[m[1]], end: n };
  });
  return { block: block.begin && block.end ? block : null, sections };
}

const isBlank = (lines, start, count) => {
  for (let i = start; i < start + count; i++) if ((lines[i - 1] || '').trim() !== '') return false;
  return true;
};

/**
 * style.css：所有改动必须落在 mobile 哨兵块内；带 lane 时必须落在该 lane 的分区内容行内（不含哨兵行）。
 * 基线 CSS 不得被删改（全局模式下任何删除/修改都算违规）。
 */
export function checkStyle({ hunks, headLines, lane }) {
  const errors = [];
  if (!hunks.length) return errors;
  const { block, sections } = sectionRanges(headLines);
  if (!block) return ['style.css 有改动，但找不到 mobile 哨兵块（/* mobile:begin … /* mobile:end */）'];
  let from = block.begin;
  let to = block.end;
  let where = 'mobile 哨兵块';
  if (lane) {
    const name = LANE_SECTION[canonicalLane(lane)];
    if (!name) return [`${lane} 不拥有 style.css 的任何分区，却修改了它`];
    const sec = sections[name];
    if (!sec) return [`找不到 ${name} 分区的哨兵`];
    from = sec.begin + 1; to = sec.end - 1; where = `${name} 分区`;
  }
  for (const hunk of hunks) {
    let h = hunk;
    if (h.oldCount === 0 && h.newCount > 0) {
      // 新增 hunk 首尾的空行不算内容（追加哨兵块时 diff 会带上块前的空行）：裁掉后再判断范围；全是空行则忽略
      let start = h.newStart;
      let end = h.newStart + h.newCount - 1;
      while (start <= end && isBlank(headLines, start, 1)) start++;
      while (end >= start && isBlank(headLines, end, 1)) end--;
      if (start > end) continue;
      h = { ...h, newStart: start, newCount: end - start + 1 };
    }
    if (h.oldCount > 0 && !lane) { errors.push(`删除或修改了基线 CSS（旧第 ${h.oldStart} 行起 ${h.oldCount} 行）`); continue; }
    const lo = h.newStart;
    const hi = h.newCount > 0 ? h.newStart + h.newCount - 1 : h.newStart;
    const okRange = h.newCount > 0 ? lo >= from && hi <= to : lo >= from - 1 && hi <= to;
    if (!okRange) errors.push(`style.css 第 ${lo}${hi > lo ? `–${hi}` : ''} 行的改动落在 ${where}（${from}–${to} 行）之外`);
  }
  return errors;
}

/** catalogs.js：只允许新增 touch.* 键与注释；不允许任何删除。 */
export function checkCatalog(diffText) {
  const errors = [];
  for (const line of diffText.split('\n')) {
    if (/^(diff |index |--- |\+\+\+ |@@ )/.test(line) || line === '') continue;
    if (line.startsWith('-')) { errors.push(`catalogs.js 删除/修改了既有内容：${line.slice(1).trim().slice(0, 60)}`); continue; }
    if (!line.startsWith('+')) continue;
    const body = line.slice(1);
    if (body.trim() === '' || /^\s*\/\/.*$/.test(body) || /^\s*'touch\.[A-Za-z]+':\s*'.*',\s*$/.test(body)) continue;
    errors.push(`catalogs.js 新增了 touch.* 键与注释以外的内容：${body.trim().slice(0, 60)}`);
  }
  return errors;
}

/** index.html：改动行必须全部是 <meta 行。 */
export function checkIndexHtml(diffText) {
  const errors = [];
  for (const line of diffText.split('\n')) {
    if (/^(diff |index |--- |\+\+\+ |@@ )/.test(line) || line === '') continue;
    if (line.startsWith('+') || line.startsWith('-')) {
      if (!/^[+-]\s*<meta\b/.test(line)) errors.push(`index.html 的改动不是 <meta> 行：${line.slice(1).trim().slice(0, 60)}`);
    }
  }
  return errors;
}

// ---------------- git 调用 ----------------

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

class UsageError extends Error {}

/** 运行全部检查，返回 { violations: string[], files: [...] }。cwd 为仓库内任意目录。 */
export function run({ base = DEFAULT_BASE, head = null, lane = null, cwd = process.cwd() } = {}) {
  let root;
  try { root = git(['rev-parse', '--show-toplevel'], cwd).trim(); } catch (e) { throw new UsageError('不在 git 仓库内'); }
  const ver = (ref) => { try { return git(['rev-parse', '--verify', `${ref}^{commit}`], root).trim(); } catch (e) { throw new UsageError(`ref 不存在：${ref}`); } };
  ver(base);
  if (head) ver(head);
  const mergeBase = git(['merge-base', base, head || 'HEAD'], root).trim();
  const range = head ? [mergeBase, head] : [mergeBase];

  const entries = parseNameStatus(git(['diff', '--name-status', '-M', ...range], root));
  if (!head) {
    for (const p of git(['ls-files', '--others', '--exclude-standard'], root).split('\n').filter(Boolean)) entries.push({ status: 'A', path: p });
  }
  // 同一路径多条记录时，非 A 优先（改/删比新增更严格）
  const byPath = new Map();
  for (const e of entries) { const prev = byPath.get(e.path); if (!prev || (prev.status === 'A' && e.status !== 'A')) byPath.set(e.path, e); }

  const violations = [];
  const files = [];
  for (const { status, path: p } of [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path))) {
    const v = classify(p, { lane, status });
    files.push({ path: p, status, verdict: v.verdict });
    if (v.verdict !== 'ok') violations.push(`${p}：${v.reason}`);
  }

  const diffOf = (rel) => git(['diff', '-U0', ...range, '--', rel], root);
  const textOf = (rel) => (head ? git(['show', `${head}:${rel}`], root) : fs.readFileSync(path.join(root, rel), 'utf8'));
  const touched = (rel) => byPath.has(rel) && byPath.get(rel).status !== 'D';
  if (touched(`${CF}src/style.css`)) {
    for (const e of checkStyle({ hunks: parseHunks(diffOf(`${CF}src/style.css`)), headLines: textOf(`${CF}src/style.css`).split('\n'), lane })) violations.push(e);
  }
  if (touched(`${CF}src/i18n/catalogs.js`)) for (const e of checkCatalog(diffOf(`${CF}src/i18n/catalogs.js`))) violations.push(e);
  if (touched(`${CF}src/index.html`)) for (const e of checkIndexHtml(diffOf(`${CF}src/index.html`))) violations.push(e);
  return { violations, files, mergeBase };
}

function parseArgs(argv) {
  const opts = { json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--base' || a === '--head' || a === '--lane') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) throw new UsageError(`${a} 需要一个参数`);
      opts[a.slice(2)] = v;
    } else throw new UsageError(`未知参数：${a}`);
  }
  return opts;
}

function main() {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); return 2; }
  let result;
  try { result = run(opts); } catch (e) {
    if (e instanceof UsageError) { console.error(`错误：${e.message}`); return 2; }
    console.error(`git 调用失败：${e.message}`); return 2;
  }
  if (opts.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`基线 ${opts.base || DEFAULT_BASE}${opts.head ? `，检查 ${opts.head}` : '，检查当前工作区'}${opts.lane ? `，lane ${opts.lane}` : ''}：共 ${result.files.length} 个改动文件`);
    if (result.violations.length) { console.log('违规：'); for (const v of result.violations) console.log(`  ✖ ${v}`); }
    else console.log('通过：改动全部落在白名单与所有权之内，未触碰性能任务的禁区文件。');
  }
  return result.violations.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main());
