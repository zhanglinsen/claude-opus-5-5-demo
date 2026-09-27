// 高度感知导航适配层（阶段 2 契约）
// createNavigation(world, descriptor, map) 返回共享导航对象：
// - findPath(start, goal, agent) : [{x,y,z,nodeId?,requires?}]，不可达返回 []
//   start/goal 为 {x,y,z}（脚底高度）；agent = {radius,height,canCrouch,canJump}
//   requires 标注「到达该路径点所走的那条边」的通过要求（walk/crouch/jump），
//   供寻路者在接近该段时蹲下/起跳（见 bots.js 的用法）。
// - randomFree(rnd, bounds?) : {x,y,z} 落在真实可站立面上；无可站位置返回 null
// 有 navGraph 的地图（沙漠灰）走高度感知图搜索；运输船沿用原 NavGrid 并适配同一接口；
// 两者都没有时返回空实现（地图几何尚未接入时保持可构建）。
import { NavGrid } from './physics.js';

// 各通过要求的几何容差：单步爬升/跌落（每 0.3m 步长）与允许的悬空段长（米）
// walk 爬升 0.45 与 Actor.stepHeight(0.42) 对齐：台阶/坡面逐段可真正走上
const TRAVERSAL = {
  walk: { climb: 0.45, drop: 0.65, gap: 0 },
  crouch: { climb: 0.45, drop: 0.65, gap: 0 },
  jump: { climb: 1.15, drop: 3.0, gap: 1.7 },
};
const CROUCH_HEIGHT = 1.1;  // 蹲姿通行所需净空（导航校验用，非角色实际蹲高）
const LEVEL_TOL = 1.2;      // 端点与图结点视为同一可达层的高度差上限
const LINK_RADIUS = 12;     // 端点向图结点投影的最大水平距离
const LINK_MAX = 6;         // 每个端点最多尝试直连的候选结点数
const SAMPLE_STEP = 0.3;    // 边几何校验采样步长
const ENDPOINT_TOL = 1.0;   // 终点处地形高度与结点 y 的允许偏差

function profileOf(agent = {}) {
  return {
    radius: agent.radius !== undefined ? agent.radius : 0.42,
    height: agent.height !== undefined ? agent.height : 1.75,
    canCrouch: agent.canCrouch === true,
    canJump: agent.canJump === true,
  };
}

function profileKey(prof) {
  return prof.radius.toFixed(2) + ',' + prof.height.toFixed(2) + ',' + (prof.canCrouch ? 1 : 0) + (prof.canJump ? 1 : 0);
}

// ============ 图导航（沙漠灰） ============
function createGraphNav(world, graph) {
  const nodeList = graph.nodes.filter((n) => n && isFinite(n.x) && isFinite(n.y) && isFinite(n.z));
  const nodeById = new Map(nodeList.map((n) => [n.id, n]));
  const adj = new Map(); // id -> [{ to, edge }]
  const edges = [];
  (graph.edges || []).forEach((raw, i) => {
    const a = nodeById.get(raw.from), b = nodeById.get(raw.to);
    if (!a || !b || a === b) return;
    const e = {
      index: i, a, b,
      requires: raw.requires === 'crouch' || raw.requires === 'jump' ? raw.requires : 'walk',
      width: typeof raw.width === 'number' ? raw.width : undefined,
      bidirectional: raw.bidirectional !== false,
    };
    edges.push(e);
    const link = (from, to) => {
      let list = adj.get(from.id);
      if (!list) adj.set(from.id, list = []);
      list.push({ to: to.id, edge: e });
    };
    link(a, b);
    if (e.bidirectional) link(b, a);
  });

  const cache = new Map(); // 边几何/能力校验缓存

  function edgeCapable(e, prof) {
    if (e.requires === 'crouch' && !prof.canCrouch) return false;
    if (e.requires === 'jump' && !prof.canJump) return false;
    if (e.width !== undefined && prof.radius * 2 > e.width + 0.12) return false;
    if (e.a.clearance !== undefined && prof.radius > e.a.clearance + 0.05) return false;
    if (e.b.clearance !== undefined && prof.radius > e.b.clearance + 0.05) return false;
    return true;
  }

  // 沿 a→b 直线采样：每步必须有真实支撑面，相邻步的爬升/跌落在容差内（台阶/坡道逐段可走），
  // 且净空检查从「脚底 + 单步爬升」起算——低于爬升容差的下一级台阶不算墙，墙与低顶仍然阻断。
  // 终点地形高度必须与 b.y 收敛，防止把跨层伪边当平地直连。
  function straightWalk(a, b, prof, lim, head) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1e-6) return Math.abs(b.y - a.y) <= lim.climb + 1e-6;
    const steps = Math.max(1, Math.ceil(dist / SAMPLE_STEP));
    const stepLen = dist / steps;
    const sr = prof.radius * 0.9;
    const br = prof.radius * 0.85;
    let gap = 0;
    let lastY = a.y;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = a.x + dx * t, z = a.z + dz * t;
      const sup = world.support(x, z, sr, lastY + lim.climb + 0.05);
      if (!sup) {
        gap += stepLen;
        if (gap > lim.gap + 1e-6) return false;
        continue;
      }
      gap = 0;
      if (sup.y > lastY + lim.climb + 1e-6) return false;   // 单步爬升过高（墙/高台）
      if (sup.y < lastY - lim.drop - 1e-6) return false;    // 单步落差过深（悬崖）
      const baseY = sup.y + lim.climb + 0.05;
      if (world.blocked(x, baseY, z, br, Math.max(0.3, head - lim.climb))) return false; // 墙体/净空
      lastY = sup.y;
    }
    return Math.abs(lastY - b.y) <= ENDPOINT_TOL;
  }

  function traversable(e, from, to, prof) {
    const key = e.index + '>' + from.id + '|' + profileKey(prof);
    let v = cache.get(key);
    if (v === undefined) {
      v = false;
      if (edgeCapable(e, prof)) {
        const lim = TRAVERSAL[e.requires];
        const head = e.requires === 'crouch' ? Math.min(CROUCH_HEIGHT, prof.height) : prof.height;
        v = straightWalk(from, to, prof, lim, head);
      }
      cache.set(key, v);
    }
    return v;
  }

  // 把实际位置投影到同层、直线可走到的图结点上
  function linkCandidates(p, prof) {
    const cands = [];
    for (const n of nodeList) {
      if (Math.abs(n.y - p.y) > LEVEL_TOL) continue;
      const d = Math.hypot(n.x - p.x, n.z - p.z);
      if (d > LINK_RADIUS) continue;
      cands.push([d, n]);
    }
    cands.sort((a, b) => a[0] - b[0]);
    const out = [];
    for (const [d, n] of cands) {
      if (out.length >= LINK_MAX) break;
      if (d < 0.3) { out.push({ node: n, cost: 0 }); continue; }
      if (straightWalk(p, n, prof, TRAVERSAL.walk, prof.height)) out.push({ node: n, cost: d });
    }
    return out;
  }

  // 端点吸附到真实支撑面：给定 y 附近找不到面则放宽向下找（位置必须真站得住）
  function resolveEndpoint(p, prof) {
    if (!p || !isFinite(p.x) || !isFinite(p.y) || !isFinite(p.z)) return null;
    const r = prof.radius * 0.9;
    let sup = world.support(p.x, p.z, r, p.y + 0.6);
    if (sup && Math.abs(sup.y - p.y) <= 1.0) return { x: p.x, y: sup.y, z: p.z };
    sup = world.support(p.x, p.z, r, p.y + 2.0);
    if (sup && p.y - sup.y <= 2.0) return { x: p.x, y: sup.y, z: p.z };
    return null;
  }

  function findPath(start, goal, agent) {
    const prof = profileOf(agent);
    const s = resolveEndpoint(start, prof);
    const g = resolveEndpoint(goal, prof);
    if (!s || !g) return [];
    const ds = Math.hypot(s.x - g.x, s.z - g.z);
    if (ds < 0.3 && Math.abs(s.y - g.y) < 0.7) return [{ x: s.x, y: s.y, z: s.z }];
    // 同层直连捷径
    if (ds < 28 && straightWalk(s, g, prof, TRAVERSAL.walk, prof.height)) {
      return [{ x: s.x, y: s.y, z: s.z }, { x: g.x, y: g.y, z: g.z }];
    }
    const sLinks = linkCandidates(s, prof);
    if (!sLinks.length) return [];
    const gLinks = linkCandidates(g, prof);
    if (!gLinks.length) return [];

    // Dijkstra（图规模小，二叉堆足够）
    const dist = new Map(), prev = new Map(), closed = new Set();
    const heap = [];
    const push = (id, c) => {
      heap.push([c, id]);
      let i = heap.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
        }
      }
      return top;
    };
    const gSet = new Set(gLinks.map((l) => l.node.id));
    for (const l of sLinks) {
      if (!dist.has(l.node.id) || l.cost < dist.get(l.node.id)) {
        dist.set(l.node.id, l.cost); prev.set(l.node.id, null); push(l.node.id, l.cost);
      }
    }
    let endId = null;
    while (heap.length) {
      const [c, id] = pop();
      if (closed.has(id)) continue;
      closed.add(id);
      if (gSet.has(id)) { endId = id; break; }
      const list = adj.get(id);
      if (!list) continue;
      const from = nodeById.get(id);
      for (const l of list) {
        if (closed.has(l.to)) continue;
        const to = nodeById.get(l.to);
        if (!traversable(l.edge, from, to, prof)) continue;
        const nd = c + Math.hypot(to.x - from.x, to.z - from.z) + 0.01;
        if (!dist.has(l.to) || nd < dist.get(l.to)) {
          dist.set(l.to, nd); prev.set(l.to, { from: id, edge: l.edge }); push(l.to, nd);
        }
      }
    }
    if (!endId) return [];
    const chain = [];
    for (let id = endId; id !== null; ) {
      chain.push(nodeById.get(id));
      const p = prev.get(id);
      id = p ? p.from : null;
    }
    chain.reverse();
    const pts = [{ x: s.x, y: s.y, z: s.z }];
    for (let i = 0; i < chain.length; i++) {
      const n = chain[i];
      const wp = { x: n.x, y: n.y, z: n.z, nodeId: n.id };
      if (i > 0) {
        const e = prev.get(n.id).edge;
        if (e.requires !== 'walk') wp.requires = e.requires;
      }
      pts.push(wp);
    }
    pts.push({ x: g.x, y: g.y, z: g.z });
    return pts;
  }

  function randomFree(rnd, bounds) {
    let pool = nodeList;
    if (bounds) {
      const inb = nodeList.filter((n) => n.x >= bounds.x0 && n.x <= bounds.x1 && n.z >= bounds.z0 && n.z <= bounds.z1);
      if (!inb.length) return null;
      pool = inb;
    }
    if (!pool.length) return null;
    for (let t = 0; t < 10; t++) {
      const n = pool[(rnd() * pool.length) | 0];
      const x = n.x + (rnd() * 2 - 1) * 0.7, z = n.z + (rnd() * 2 - 1) * 0.7;
      const r = Math.max(0.25, (n.clearance || 0.45) * 0.8);
      const sup = world.support(x, z, r, n.y + 0.8);
      if (sup && Math.abs(sup.y - n.y) < 0.7 && !world.blocked(x, sup.y + 0.05, z, r * 0.85, 1.6)) {
        return { x, y: sup.y, z };
      }
    }
    const n = pool[(rnd() * pool.length) | 0];
    return { x: n.x, y: n.y, z: n.z };
  }

  // 供集成层/调试：某条有向边对给定 agent 是否真的可走
  function canTraverse(fromId, toId, agent) {
    const prof = profileOf(agent);
    const from = nodeById.get(fromId), to = nodeById.get(toId);
    if (!from || !to) return false;
    const list = adj.get(from.id);
    if (!list) return false;
    for (const l of list) if (l.to === to.id && traversable(l.edge, from, to, prof)) return true;
    return false;
  }

  return { kind: 'graph', nodes: nodeList, edges, findPath, randomFree, canTraverse };
}

// ============ 运输船适配：沿用 NavGrid，y 保持 0（甲板面） ============
function createGridNav(world, descriptor) {
  const N = descriptor.nav;
  const grid = new NavGrid(world, N.x0, N.z0, N.x1, N.z1, N.cell, N.agentR);
  return {
    kind: 'grid',
    grid,
    findPath(start, goal) {
      const raw = grid.findPath(start.x, start.z, goal.x, goal.z);
      if (!raw) return [];
      return raw.map(([x, z]) => ({ x, y: 0, z }));
    },
    randomFree(rnd, bounds) {
      const b = bounds || descriptor.bounds || { x0: N.x0, z0: N.z0, x1: N.x1, z1: N.z1 };
      const p = grid.randomFree(rnd, Math.max(b.x0, N.x0), Math.max(b.z0, N.z0), Math.min(b.x1, N.x1), Math.min(b.z1, N.z1));
      return p ? { x: p[0], y: 0, z: p[1] } : null;
    },
  };
}

const EMPTY_NAV = {
  kind: 'none',
  findPath() { return []; },
  randomFree() { return null; },
};

export function createNavigation(world, descriptor, map) {
  const graph = (map && map.navGraph) || (descriptor && descriptor.navGraph) || null;
  if (graph && Array.isArray(graph.nodes) && graph.nodes.length) return createGraphNav(world, graph);
  if (descriptor && descriptor.nav) return createGridNav(world, descriptor);
  return EMPTY_NAV;
}
