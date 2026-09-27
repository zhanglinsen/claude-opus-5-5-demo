// 练习模式靶体组件：纯数据 + 几何查询，无 DOM/Three/存储/随机数。
// Game 与两幅地图共用；靶点布局元数据本身属于地图文件，这里只定义注入契约：
//  - spot: { id: 非空字符串, pos: {x,y,z} 数值, radius?: 正数, visible?: 布尔（缺省可见） }
//  - 校验失败的条目（重复 ID / 非法 pos 等）整体丢弃，绝不产生半残靶体。

export const TARGET_RADIUS = 0.55; // 缺省靶体半径（米），约标准靶板尺度

const isId = (v) => typeof v === 'string' && v.length > 0;
const isPos = (p) => p != null && typeof p === 'object'
  && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);

// 由地图注入的靶点元数据生成靶体状态列表：位置/半径/可见性 + 命中统计由会话侧维护。
// 重复 ID 取首个；radius 缺省 TARGET_RADIUS；visible 缺省 true（false 为隐蔽靶，射线不可选中）。
export function createTargetStates(spots) {
  const list = Array.isArray(spots) ? spots : [];
  const seen = new Set();
  const states = [];
  for (const spot of list) {
    const id = spot && spot.id;
    if (!isId(id) || !isPos(spot.pos) || seen.has(id)) continue;
    seen.add(id);
    const radius = Number.isFinite(spot.radius) && spot.radius > 0 ? spot.radius : TARGET_RADIUS;
    states.push({ id, pos: { x: spot.pos.x, y: spot.pos.y, z: spot.pos.z }, radius, visible: spot.visible !== false });
  }
  return states;
}

// 射线-球命中判定：返回沿方向的命中距离（原点在球内时为离开球面的距离），未命中返回 -1。
// 方向无需预归一化（内部归一化，便于调用方直接传视线向量）；零向量视为无效。
export function raySphere(origin, dir, center, radius) {
  if (!isPos(origin) || !isPos(center) || !isPos(dir) || !Number.isFinite(radius) || radius <= 0) return -1;
  const len = Math.hypot(dir.x, dir.y, dir.z);
  if (len === 0) return -1;
  const dx = dir.x / len, dy = dir.y / len, dz = dir.z / len;
  const ox = origin.x - center.x, oy = origin.y - center.y, oz = origin.z - center.z;
  const b = ox * dx + oy * dy + oz * dz;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  const tNear = -b - sq, tFar = -b + sq;
  if (tFar < 0) return -1; // 球整体在射线背后
  return tNear >= 0 ? tNear : tFar;
}

// 从靶体列表中选出射线命中的最近可见靶。返回 { id, dist, point } 或 null。
// maxDist 限制交战距离（弹道射程）；origin/dir 为 Game 的视线起点与方向（米 / 任意长度向量）。
export function pickTarget(states, origin, dir, maxDist = Infinity) {
  if (!isPos(dir)) return null;
  const len = Math.hypot(dir.x, dir.y, dir.z);
  if (len === 0) return null; // 与 raySphere 的零向量契约一致：无效射线
  const max = Number.isFinite(maxDist) ? maxDist : Infinity;
  const ux = dir.x / len, uy = dir.y / len, uz = dir.z / len;
  let best = null;
  for (const s of states) {
    if (s.visible === false) continue;
    const dist = raySphere(origin, { x: ux, y: uy, z: uz }, s.pos, s.radius);
    if (dist < 0 || dist > max) continue;
    if (!best || dist < best.dist) {
      best = {
        id: s.id,
        dist,
        point: { x: origin.x + ux * dist, y: origin.y + uy * dist, z: origin.z + uz * dist },
      };
    }
  }
  return best;
}
