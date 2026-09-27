// 目标型 AI 纯策略核心（阶段 3 提前切片）
// 输入只接受许可观察：自身/己方小队、C4 公开状态、可见·声音·最后已知敌人（带时间戳）、
// 回合计时与地图包点元数据；输出 { role, intent, site, goal } 供共享导航（navigation.js）
// 执行真实寻路移动。本模块不做移动、不读完整 actor 列表、不接触隐藏敌人位置。
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

// options.seed: 确定性回合种子；options.map.bombSites: 包点元数据（必填才可规划包点目标）
// options.intelMaxAge: 最后已知位置/声音的有效时长（秒）；options.attackerTeam: 进攻方阵营
export function createObjectivePlanner({ seed = 0, map, intelMaxAge = 12, attackerTeam = 'BL' } = {}) {
  const sites = ((map && map.bombSites) || []).filter(
    (s) => s && s.id != null && isFinite(s.x) && isFinite(s.z)
  );
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const sitePoint = (id) => {
    const s = siteById.get(id);
    return s ? { x: s.x, y: s.y, z: s.z } : null;
  };
  const otherSite = (id) => {
    const s = sites.find((x) => x.id !== id);
    return s ? s.id : null;
  };
  const nearestSiteId = (pos) => {
    let best = null, bestD = Infinity;
    for (const s of sites) {
      const d = dist3(pos, s);
      if (d < bestD) { bestD = d; best = s.id; }
    }
    return best;
  };

  // 每回合每阵营的完整分配：主包点由种子确定性抽取（跨回合覆盖 A/B，避免每回合扎堆同一路），
  // 成员→包点按稳定身份（id 排序）一次性定死并缓存——obs.team 顺序与中途阵亡不影响幸存者，
  // 新回合换 key 重新分配。
  const rounds = new Map(); // 'team|round' -> { primary, secondary, attack: Map, defend: Map }
  function roundAssign(team, round, members) {
    const key = team + '|' + round;
    let a = rounds.get(key);
    if (a) return a;
    const rnd = mulberry32(hashStr(seed + '|' + team + '|' + round));
    let primary = null;
    if (sites.length === 1) primary = sites[0].id;
    else if (sites.length > 1) primary = (rnd() < 0.5 ? sites[0] : sites[1]).id;
    const secondary = primary != null ? otherSite(primary) : null;
    const ids = members.map((m) => m.id).sort();
    const atkEscorts = Math.floor(ids.length / 2);
    const defMain = Math.ceil(ids.length / 2);
    const attack = new Map(), defend = new Map();
    ids.forEach((id, i) => {
      attack.set(id, i < atkEscorts ? primary : secondary);
      defend.set(id, i < defMain ? primary : (secondary != null ? secondary : primary));
    });
    a = { primary, secondary, attack, defend };
    rounds.set(key, a);
    return a;
  }

  // 缓存未覆盖的迟到成员并入人少的一侧，不打乱已分配者
  function siteFor(map, a, id) {
    if (map.has(id)) return map.get(id);
    let main = 0, other = 0;
    for (const s of map.values()) {
      if (s === a.primary) main++;
      else if (s != null) other++;
    }
    const site = main <= other ? a.primary : a.secondary;
    map.set(id, site);
    return site;
  }

  function plan(obs) {
    const members = ((obs.team || []).map((m) => ({
      id: m.id, position: m.position, alive: m.alive !== false,
    })));
    if (obs.self && !members.some((m) => m.id === obs.self.id) && obs.self.position) {
      members.push({ id: obs.self.id, position: obs.self.position, alive: true });
    }
    const a = roundAssign(obs.self.team, obs.round, members);
    const c4 = obs.c4 || {};
    if (obs.self.team === attackerTeam) {
      return planAttacker(obs, members, c4, a);
    }
    return planDefender(obs, members, c4, a);
  }

  // 己方存活且带位置队员中，离目标点最近者（无则 null）；等距以 id 升序决胜，与传入顺序无关
  function nearestAlive(members, pos) {
    const alive = members.filter((m) => m.alive && m.position);
    if (!alive.length) return null;
    return alive.reduce((best, m) => {
      const d = dist3(m.position, pos);
      const bd = dist3(best.position, pos);
      return d < bd || (d === bd && m.id < best.id) ? m : best;
    });
  }

  // C4 关联包点：优先用公开标注，其次按已知位置归入最近包点；两者皆无则 null（不臆造）
  const siteOfC4 = (c4) => {
    if (c4.site != null) return c4.site;
    if (c4.position) return nearestSiteId(c4.position);
    return null;
  };

  function planAttacker(obs, members, c4, a) {
    // C4 已安放：全员转入守包，目标为安放坐标或包点本身（site 足够时不臆造坐标）
    if (c4.state === 'planted') {
      const site = siteOfC4(c4);
      if (site != null || c4.position) {
        return { role: 'guard', intent: 'defend', site, goal: c4.position || sitePoint(site) };
      }
      // 无包点也无坐标：诚实回退为常规分路
    } else if (c4.state === 'dropped' && c4.position) {
      // C4 掉落：最近的可行动队员去拾取（坐标未知则无人臆造目标），其余维持原分路
      const nearest = nearestAlive(members, c4.position);
      if (nearest && nearest.id === obs.self.id) {
        return { role: 'retriever', intent: 'retrieve', site: nearestSiteId(c4.position), goal: c4.position };
      }
    }
    const carrierId = c4.state === 'carried' ? c4.carrierId : null;
    if (obs.self.id === carrierId && a.primary != null) {
      return { role: 'carrier', intent: 'plant', site: a.primary, goal: sitePoint(a.primary) };
    }
    // 非持包者按回合缓存分路：护送去主包点，或走侧翼路线（另一包点）
    const site = siteFor(a.attack, a, obs.self.id);
    if (site == null) return { role: 'escort', intent: 'hold', site: null, goal: null };
    return { role: site === a.primary ? 'escort' : 'flank', intent: 'attack', site, goal: sitePoint(site) };
  }

  function planDefender(obs, members, c4, a) {
    // C4 已安放：最近的可行动队员去拆包（坐标未知时去包点），其余回防掩护
    if (c4.state === 'planted') {
      const site = siteOfC4(c4);
      const goal = c4.position || sitePoint(site);
      if (goal) {
        const nearest = nearestAlive(members, goal);
        if (nearest && nearest.id === obs.self.id) {
          return { role: 'defuser', intent: 'defuse', site, goal };
        }
        return { role: 'cover', intent: 'retake', site, goal };
      }
      // 包点标注非法且无坐标：诚实降级为回防意图但不指派拆包者（与进攻方同输入 goal:null 对称）
      return { role: 'cover', intent: 'retake', site, goal: null };
    }
    // 默认分守：按回合缓存的成员分配（前 ceil(n/2) 守主防区，其余守另一包点）
    const site = siteFor(a.defend, a, obs.self.id);
    if (site == null) return { role: 'anchor', intent: 'hold', site: null, goal: null };
    // 新鲜敌情（可见/声音/时限内的最后已知）指向另一包点时，
    // 距该情报最近的可行动队员转点支援，其余继续架点（单点支援，避免集体摇摆）
    const intel = freshIntelPoints(obs)
      .map((p) => ({ p, site: nearestSiteId(p) }))
      .filter((e) => e.site != null && e.site !== site);
    if (intel.length && obs.self.position) {
      const target = intel.reduce((x, y) => (dist3(y.p, obs.self.position) < dist3(x.p, obs.self.position) ? y : x));
      const nearest = nearestAlive(members, target.p);
      if (nearest && nearest.id === obs.self.id) {
        return { role: 'rotator', intent: 'rotate', site: target.site, goal: target.p };
      }
    }
    return { role: 'anchor', intent: 'hold', site, goal: sitePoint(site) };
  }

  // 许可感知通道内的有效情报点：可见敌人总是新鲜；最后已知/声音按 intelMaxAge 过期
  function freshIntelPoints(obs) {
    const now = typeof obs.now === 'number' ? obs.now : 0;
    const enemies = obs.enemies || {};
    const pts = [];
    for (const v of enemies.visible || []) {
      if (v && v.position) pts.push(v.position);
    }
    for (const lk of enemies.lastKnown || []) {
      if (lk && lk.position && now - lk.time <= intelMaxAge) pts.push(lk.position);
    }
    for (const h of enemies.heard || []) {
      if (h && h.position && now - h.time <= intelMaxAge) pts.push(h.position);
    }
    return pts;
  }

  return { plan };
}
