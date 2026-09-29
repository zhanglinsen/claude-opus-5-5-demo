// 射线宽阶段微基准：真实地图（港口构建器 + 两张沙漠 layout），基线 c40d4bd 的 World 与当前 World 对比。
// 指标：每条射线的格子访问（grid.get）、候选数、真实 World.raycast 耗时。
// 用法：node scripts/bench-raycast.mjs（需在 git 仓库内，基线实现经 git show 取出到临时文件）
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { World } from '../src/physics.js';

const BASE = process.env.BASE || 'c40d4bd';
const basePath = join(mkdtempSync(join(tmpdir(), 'bench-raycast-')), 'physics.mjs');
writeFileSync(basePath, execFileSync('git', ['show', `${BASE}:cf-transport-ship/src/physics.js`], { encoding: 'utf8' }));
const { World: OldWorld } = await import(pathToFileURL(basePath).href);
import { DESERT_LAYOUT } from '../src/maps/desert-grey-layout.js';
import { PLATFORM_DESERT_LAYOUT } from '../src/maps/platform-desert/layout.js';
import { buildPlatformHarbor } from '../src/maps/platform-harbor/build.js';

function oldCands(w, ox, oz, dx, dz, maxT) { // c40d4bd 的 raycast 宽阶段（仅计数用）
  const ex = ox + dx * maxT, ez = oz + dz * maxT;
  return w.query(Math.min(ox, ex) - 0.1, Math.min(oz, ez) - 0.1, Math.max(ox, ex) + 0.1, Math.max(oz, ez) + 0.1);
}
function layoutWorld(L, Wc) {
  const w = new Wc();
  for (const s of L.solids) w.add({ ...s, yaw: s.yaw || 0 });
  for (const r of L.ramps || []) w.addRamp(r);
  w.build(); return w;
}
function harborWorld(Wc) {
  const t = () => ({ map: {}, normalMap: {}, roughnessMap: {} });
  const w = new Wc();
  buildPlatformHarbor({ add() {}, remove() {} }, { deck: t(), bulkhead: t(), darkSteel: t(), yellowSteel: t(), hull: t(),
    crates: [t(), t(), t(), t()], containers: Array.from({ length: 4 }, () => ({ side20: {}, n20: {}, side40: {}, n40: {}, door: {}, doorN: {}, roof: {}, roofN: {} })) }, w);
  return w;
}
function rng(seed) { let a = seed; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function rays(w, kind, n, seed) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const c of w.colliders) if (c.maxX - c.minX < 150 && c.maxZ - c.minZ < 150) { x0 = Math.min(x0, c.minX); x1 = Math.max(x1, c.maxX); z0 = Math.min(z0, c.minZ); z1 = Math.max(z1, c.maxZ); }
  const r = rng(seed), out = [];
  for (let i = 0; i < n; i++) {
    const ox = x0 + r() * (x1 - x0), oz = z0 + r() * (z1 - z0), oy = 1.6;
    if (kind === 'ai-sight') { // 两点连线（AI 视线/射击）
      const tx = x0 + r() * (x1 - x0), tz = z0 + r() * (z1 - z0), ty = 0.4 + r() * 1.6;
      let dx = tx - ox, dy = ty - oy, dz = tz - oz; const L = Math.hypot(dx, dy, dz) || 1;
      out.push([ox, oy, oz, dx / L, dy / L, dz / L, L]);
    } else if (kind === 'short-axial') { // 手雷步进/头顶检测等短轴向射线
      const a = [[1, 0, 0], [0, 0, 1], [0, 1, 0], [-1, 0, 0]][i & 3];
      out.push([ox, oy, oz, a[0], a[1], a[2], 0.2 + r() * 3]);
    } else { // 远距离太阳/墙透视（maxT=80）
      let dx = r() * 2 - 1, dz = r() * 2 - 1, dy = 0.3 + r() * 0.5; const L = Math.hypot(dx, dy, dz);
      out.push([ox, oy, oz, dx / L, dy / L, dz / L, 80]);
    }
  }
  return out;
}

function measure(w, R, fn) {
  const g = w.grid, get = g.get; let cells = 0;
  g.get = (k) => { cells++; return get.call(g, k); };
  let cands = 0;
  for (const q of R) cands += fn.cands(q).length;
  g.get = get;
  const t0 = performance.now();
  for (let rep = 0; rep < 20; rep++) for (const q of R) fn.cast(q);
  const us = (performance.now() - t0) * 1000 / (20 * R.length);
  return { cells: cells / R.length, cands: cands / R.length, us };
}

const worlds = [
  ['platform-harbor', harborWorld(OldWorld), harborWorld(World)],
  ['desert-grey', layoutWorld(DESERT_LAYOUT, OldWorld), layoutWorld(DESERT_LAYOUT, World)],
  ['platform-desert', layoutWorld(PLATFORM_DESERT_LAYOUT, OldWorld), layoutWorld(PLATFORM_DESERT_LAYOUT, World)],
];
const out = {};
console.log('| 地图 | 射线类型 | 格子访问 旧→新 | 候选数 旧→新 | raycast 耗时 µs/条 旧→新 |');
console.log('|---|---|---|---|---|');
for (const [name, wo, wn] of worlds) {
  for (const kind of ['ai-sight', 'long-80', 'short-axial']) {
    const R = rays(wn, kind, 2000, 7);
    const oldF = { cands: (q) => oldCands(wo, q[0], q[2], q[3], q[5], q[6]), cast: (q) => wo.raycast(q[0], q[1], q[2], q[3], q[4], q[5], q[6], 'sight', out) };
    const newF = { cands: (q) => wn._rayCands(q[0], q[2], q[3], q[5], q[6]), cast: (q) => wn.raycast(q[0], q[1], q[2], q[3], q[4], q[5], q[6], 'sight', out) };
    for (let i = 0; i < 3; i++) { measure(wo, R, oldF); measure(wn, R, newF); } // 预热
    let o = measure(wo, R, oldF), n = measure(wn, R, newF);
    const o2 = measure(wo, R, oldF), n2 = measure(wn, R, newF); // 交替两轮取较小耗时
    o.us = Math.min(o.us, o2.us); n.us = Math.min(n.us, n2.us);
    const f = (a, b, d = 1) => `${a.toFixed(d)} → ${b.toFixed(d)}`;
    console.log(`| ${name} | ${kind} | ${f(o.cells, n.cells)} | ${f(o.cands, n.cands)} | ${f(o.us, n.us, 2)} |`);
  }
}
