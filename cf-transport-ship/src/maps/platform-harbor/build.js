// 雾港码头场景构建：几何/碰撞完全由 layout.js 数据驱动（视觉与碰撞一一对应），
// 本文件只负责材质实例化、合批网格与纯装饰（龙门吊梁/桅灯/护舷/驳船/水面/标线）。
// 不引用 SIGN_UV 运输船标识图集；纹理全部复用共享纹理集 T，不新增纹理。
import * as THREE from 'three';
import { LEVELS, SOLIDS, LAMPS, SPAWNS, NAV_GRAPH, REGIONS, META } from './layout.js';

const FACE = {
  px: { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  nx: { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  py: { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  ny: { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  pz: { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  nz: { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
};

// 按材质合批的几何缓冲（与运输船构建器同思路）
class Batch {
  constructor() { this.p = []; this.n = []; this.uv = []; this.idx = []; this.count = 0; }
  quad(v0, v1, v2, v3, nrm, uvs) {
    const b = this.count;
    this.p.push(...v0, ...v1, ...v2, ...v3);
    for (let i = 0; i < 4; i++) this.n.push(nrm[0], nrm[1], nrm[2]);
    this.uv.push(...uvs);
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    this.count += 4;
  }
  geom(g, m4) {
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    const b = this.count;
    const v = new THREE.Vector3(), nn = new THREE.Vector3();
    const nm = new THREE.Matrix3().getNormalMatrix(m4);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m4);
      this.p.push(v.x, v.y, v.z);
      nn.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      this.n.push(nn.x, nn.y, nn.z);
      if (uv) this.uv.push(uv.getX(i), uv.getY(i)); else this.uv.push(0, 0);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) this.idx.push(b + g.index.getX(i));
    else for (let i = 0; i < pos.count; i++) this.idx.push(b + i);
    this.count += pos.count;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

export function buildPlatformHarbor(scene, T, world, opts = {}) {
  const batches = new Map();
  const matDefs = {};
  const meshes = [];
  const anim = [];
  const disposables = [];

  // ---------- 材质（全部复用共享纹理 T；每种键一个合批网格 = 一次 draw call） ----------
  const std = (p) => new THREE.MeshStandardMaterial(p);
  function defMat(key, mat, uv = 2, flags = {}) { matDefs[key] = { mat, uv, ...flags }; }
  defMat('concrete', std({ map: T.deck.map, normalMap: T.deck.normalMap, roughnessMap: T.deck.roughnessMap, color: 0x879190, roughness: 0.95, metalness: 0.08, normalScale: new THREE.Vector2(0.7, 0.7), envMapIntensity: 0.45 }), 4, { shadow: false });
  defMat('kerb', std({ map: T.bulkhead.map, normalMap: T.bulkhead.normalMap, color: 0x9aa1a4, roughness: 0.8, metalness: 0.15 }), 2);
  defMat('shedWall', std({ map: T.bulkhead.map, normalMap: T.bulkhead.normalMap, roughness: 0.6, metalness: 0.25 }), 3);
  defMat('shedRoof', std({ map: T.darkSteel.map, normalMap: T.darkSteel.normalMap, roughness: 0.6, metalness: 0.4 }), 3);
  defMat('steel', std({ map: T.darkSteel.map, normalMap: T.darkSteel.normalMap, roughness: 0.55, metalness: 0.5 }), 3);
  defMat('dock', std({ map: T.deck.map, normalMap: T.deck.normalMap, color: 0x9aa2a0, roughness: 0.85, metalness: 0.12, envMapIntensity: 0.5 }), 4);
  defMat('wood', std({ map: T.crates[0].map, normalMap: T.crates[0].normalMap, roughness: 0.85, metalness: 0 }), 1);
  defMat('yellow', std({ map: T.yellowSteel.map, normalMap: T.yellowSteel.normalMap, roughness: 0.5, metalness: 0.25 }), 3);
  defMat('black', std({ color: 0x1d1e1f, roughness: 0.8, metalness: 0.1 }), 1);
  defMat('white', std({ color: 0xd8dcd8, roughness: 0.6, metalness: 0.1 }), 1);
  defMat('orange', std({ color: 0xd86a1c, roughness: 0.55, metalness: 0.1 }), 1);
  defMat('lamp', std({ color: 0xfff2d0, emissive: 0xffe2a8, emissiveIntensity: 3.5, roughness: 0.3 }), 1, { shadow: false });
  defMat('redLamp', std({ color: 0xff3020, emissive: 0xff2010, emissiveIntensity: 4, roughness: 0.3 }), 1, { shadow: false });
  defMat('hull', std({ map: T.hull.map, normalMap: T.hull.normalMap, color: 0x8a4a3a, roughness: 0.7, metalness: 0.25 }), 'custom');
  defMat('paint', std({ color: 0xd8b23a, roughness: 0.75, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), 1, { shadow: false });
  for (let i = 0; i < 4; i++) {
    const c = T.containers[i];
    defMat(`c${i}s20`, std({ map: c.side20, normalMap: c.n20, roughness: 0.62, metalness: 0.3, normalScale: new THREE.Vector2(1.1, 1.1) }), 'unit');
    defMat(`c${i}s40`, std({ map: c.side40, normalMap: c.n40, roughness: 0.62, metalness: 0.3, normalScale: new THREE.Vector2(1.1, 1.1) }), 'unit');
    defMat(`c${i}door`, std({ map: c.door, normalMap: c.doorN, roughness: 0.6, metalness: 0.3 }), 'unit');
    defMat(`c${i}roof`, std({ map: c.roof, normalMap: c.roofN, roughness: 0.75, metalness: 0.25 }), 2);
  }

  const batch = (key) => { let b = batches.get(key); if (!b) { b = new Batch(); batches.set(key, b); } return b; };
  const rnd = mulberryLite(20260927);

  // ---------- 几何工具 ----------
  function box(key, cx, cy, cz, sx, sy, sz, yaw = 0, faces) {
    const fset = faces === undefined ? key : faces; // 缺省整箱同材质；传对象则按面指定
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const half = [sx / 2, sy / 2, sz / 2], size = [sx, sy, sz];
    const off = [rnd(), rnd()];
    for (const fk in FACE) {
      const mk = typeof fset === 'string' ? fset : fset[fk];
      if (!mk) continue;
      const F = FACE[fk], def = matDefs[mk];
      if (!def) throw new Error(`[platform-harbor] 未知材质键 ${mk} (solid ${key})`);
      const su = Math.abs(F.u[0] * size[0] + F.u[1] * size[1] + F.u[2] * size[2]);
      const sv = Math.abs(F.v[0] * size[0] + F.v[1] * size[1] + F.v[2] * size[2]);
      const ctr = [F.n[0] * half[0], F.n[1] * half[1], F.n[2] * half[2]];
      const corner = (a, b) => {
        const lx = ctr[0] + F.u[0] * su * a + F.v[0] * sv * b;
        const ly = ctr[1] + F.u[1] * su * a + F.v[1] * sv * b;
        const lz = ctr[2] + F.u[2] * su * a + F.v[2] * sv * b;
        return [cx + c * lx + s * lz, cy + ly, cz - s * lx + c * lz];
      };
      const n = [c * F.n[0] + s * F.n[2], F.n[1], -s * F.n[0] + c * F.n[2]];
      let u0 = 0, v0 = 0, u1 = 1, v1 = 1;
      if (def.uv !== 'unit' && def.uv !== 'custom') {
        u0 = off[0]; v0 = off[1];
        u1 = u0 + su / def.uv; v1 = v0 + sv / def.uv;
      }
      batch(mk).quad(corner(-0.5, -0.5), corner(0.5, -0.5), corner(0.5, 0.5), corner(-0.5, 0.5), n, [u0, v0, u1, v0, u1, v1, u0, v1]);
    }
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), vs = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  function geom(key, g, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    e.set(rx, ry, rz); q.setFromEuler(e); vs.set(sx, sy, sz);
    m4.compose(new THREE.Vector3(x, y, z), q, vs);
    batch(key).geom(g, m4);
  }
  function rod(key, x0, y0, z0, x1, y1, z1, r) {
    const d = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0); const L = d.length(); d.normalize();
    q.setFromUnitVectors(up, d); vs.set(r, L, r);
    m4.compose(new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), q, vs);
    batch(key).geom(cylG8, m4);
  }
  // 地面标线（水平薄片，只画顶面）
  function paintQuad(cx, cz, sx, sz) {
    batch('paint').quad(
      [cx - sx / 2, 0.006, cz - sz / 2], [cx + sx / 2, 0.006, cz - sz / 2],
      [cx + sx / 2, 0.006, cz + sz / 2], [cx - sx / 2, 0.006, cz + sz / 2],
      [0, 1, 0], [0, 0, sx / 2, 0, sx / 2, sz / 2, 0, sz / 2]);
  }

  const cylG = new THREE.CylinderGeometry(1, 1, 1, 16, 1);
  const cylG8 = new THREE.CylinderGeometry(1, 1, 1, 8, 1);
  const sphG = new THREE.SphereGeometry(1, 10, 8);
  disposables.push(cylG, cylG8, sphG);

  // ---------- 布局实体 → 视觉 + 碰撞（一一对应） ----------
  for (const s of SOLIDS) {
    // 碰撞：全部实体进入碰撞世界（含不可见边界）
    world.add({
      x: s.x, y: s.y, z: s.z, sx: s.sx, sy: s.sy, sz: s.sz, yaw: s.yaw,
      mat: s.mat, surface: s.surface, bullet: s.bullet, sight: s.sight, solid: s.solid, tag: s.tag,
    });
    if (s.m === 'none') continue; // 不可见边界墙
    if (s.cont) {
      const ci = s.cont.colorIdx;
      const side = `c${ci}${s.cont.len === 40 ? 's40' : 's20'}`;
      box('cont', s.x, s.y, s.z, s.sx, s.sy, s.sz, s.yaw, { px: `c${ci}door`, nx: `c${ci}door`, py: `c${ci}roof`, pz: side, nz: side });
    } else {
      box(s.m, s.x, s.y, s.z, s.sx, s.sy, s.sz, s.yaw);
    }
  }

  // ---------- 纯装饰：跨码头龙门吊（梁/小车/吊具；腿已在布局实体中） ----------
  for (const bz of [-10, 10]) {
    box('yellow', 0, LEVELS.crane + 0.45, bz, 52, 0.9, 1.4, 0);           // 主梁
    box('steel', 0, LEVELS.crane - 0.35, bz, 50, 0.5, 0.5, 0);            // 下弦
  }
  for (const bx of [-24, 24]) box('yellow', bx, LEVELS.crane + 0.45, 0, 1.2, 0.9, 21.4, 0); // 端梁
  // 小车 + 吊具（静止，避免复刻运输船摆动集装箱）
  box('yellow', 8, LEVELS.crane + 1.15, 10, 2.2, 0.7, 2.2, 0);
  for (const dx of [-0.7, 0.7]) rod('black', 8 + dx, LEVELS.crane + 0.8, 10, 8 + dx, LEVELS.crane - 3.4, 10, 0.035);
  box('yellow', 8, LEVELS.crane - 3.7, 10, 3.4, 0.35, 2.2, 0);            // 吊具横梁
  for (const dx of [-18, 18]) for (const bz of [-10, 10]) {
    geom('redLamp', sphG, dx, LEVELS.crane + 1.2, bz, 0, 0, 0, 0.14, 0.14, 0.14);
  }

  // ---------- 桅灯与棚内灯 ----------
  const lampSpots = [];
  for (const L of LAMPS) {
    if (L.mast) {
      geom('steel', cylG, L.x, (LEVELS.quay + L.y) / 2, L.z, 0, 0, 0, 0.09, L.y, 0.09);
      geom('steel', cylG8, L.x, L.y + 0.12, L.z, 0, 0, 0, 0.34, 0.1, 0.34);
    } else {
      rod('black', L.x, L.y + 0.35, L.z, L.x, L.y + 0.1, L.z, 0.03);
    }
    geom('lamp', sphG, L.x, L.y - 0.06, L.z, 0, 0, 0, 0.12, 0.12, 0.12);
    lampSpots.push(new THREE.Vector3(L.x, L.y - 0.2, L.z));
  }

  // ---------- 护舷/系缆桩（纯装饰，贴码头边缘） ----------
  for (const sx of [-1, 1]) {
    for (let z = -30; z <= 30; z += 7.5) {
      geom('black', cylG, sx * 27.9, 0.28, z, 0, 0, 0, 0.17, 0.55, 0.17);
      geom('steel', cylG8, sx * 27.9, 0.03, z, 0, 0, 0, 0.3, 0.06, 0.3);
    }
    box('black', sx * 28.65, -0.55, 0, 0.35, 0.9, 69, 0); // 码头胸墙前护舷
  }

  // ---------- 箱顶步道护栏（纯装饰，无碰撞） ----------
  for (const sgn of [-1, 1]) {
    for (const zz of [16 + sgn * 1.18]) {
      rod('orange', -3.5, 3.15, zz, 8.695, 3.15, zz, 0.025);
      rod('orange', 8.805, 3.15, zz, 20.995, 3.15, zz, 0.025);
      for (const px of [-3.2, 0, 5, 12, 18, 20.7]) rod('orange', px, 2.59, zz, px, 3.15, zz, 0.02);
    }
  }

  // ---------- 港池水面（地图自建：静态水线 + 潮汐起伏；不用共享海面） ----------
  const waterGeo = new THREE.PlaneGeometry(260, 260);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = std({ color: 0x1d4a52, roughness: 0.12, metalness: 0.72, envMapIntensity: 1.1 });
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.position.y = LEVELS.water;
  water.receiveShadow = false;
  scene.add(water);
  meshes.push(water);
  anim.push((dt, t) => { water.position.y = LEVELS.water + Math.sin(t * 0.12) * 0.05; });
  disposables.push(waterGeo);

  // ---------- 驳船（港池装饰，无碰撞、不可达） ----------
  for (const [bx, bz, yaw] of [[44, -16, 0], [-44, 16, 0]]) {
    box('hull', bx, -0.5, bz, 19, 1.8, 7.4, yaw);
    box('steel', bx, 0.42, bz, 18.2, 0.16, 6.8, yaw);
    box('white', bx - 6.4, 1.5, bz, 3.2, 2.2, 4.6, yaw);   // 艉楼
    box('orange', bx + 2, 0.62, bz, 4.4, 0.35, 3.4, yaw);  // 舱口围板
  }

  // ---------- 地面标线 ----------
  paintQuad(26, 18, 0.14, 22);      // 东南吊道中心线
  paintQuad(-26, -18, 0.14, 22);
  paintQuad(0, 6.4, 20, 0.14);      // 中场南横向斑马线
  paintQuad(0, -6.4, 20, 0.14);
  paintQuad(0, 3.72, 13.4, 0.12);   // 站台南缘
  paintQuad(0, -3.72, 13.4, 0.12);

  // ---------- 合批输出 ----------
  for (const [key, b] of batches) {
    if (!b.count) continue;
    const def = matDefs[key];
    const g = b.build();
    const mesh = new THREE.Mesh(g, def.mat);
    mesh.castShadow = def.shadow !== false;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    mesh.name = 'ph-' + key;
    scene.add(mesh);
    meshes.push(mesh);
  }
  for (const g of disposables) g.dispose(); // 原型几何即时释放

  world.build();

  return {
    spawns: { BL: SPAWNS.BL.map((p) => ({ ...p })), GR: SPAWNS.GR.map((p) => ({ ...p })) },
    lampSpots,
    meshes,
    materials: matDefs,
    navGraph: NAV_GRAPH,
    regions: REGIONS,
    meta: META,
    update(dt, t) { for (const f of anim) f(dt, t); },
    dispose() {
      for (const m of meshes) {
        scene.remove(m);
        if (m.geometry) m.geometry.dispose();
      }
      for (const k in matDefs) matDefs[k].mat.dispose();
    },
  };
}

// 确定性伪随机（不依赖 textures.js 的 mulberry32，保持本目录自包含）
function mulberryLite(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
