// 赤霞集市地图构建：几何/碰撞完全由 platform-desert/layout.js 数据驱动，
// 材质来自 platform-desert/materials.js；本文件只负责实例化与纯装饰
// （檐口/渠沿压顶/遮阳篷/棕榈/远景沙丘/包点喷漆/灯具）。
// 坡道调用契约 API world.addRamp（由 physics 提供）；缺失时退化为浅台阶碰撞体。
import * as THREE from 'three';
import { PLATFORM_DESERT_LAYOUT } from './layout.js';
import { createPlatformDesertMaterials } from './materials.js';

const FACE = {
  px: { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  nx: { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  py: { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  ny: { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  pz: { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  nz: { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
};

// 共享贴花几何：全部地面贴花复用一片单位面片（尺寸经 mesh.scale），省 geometries 计数
const UNIT_GROUND = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

// 按材质合批（与沙漠灰构建器同思路）
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
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

export function buildPlatformDesert(scene, T, world, opts = {}) {
  const L = PLATFORM_DESERT_LAYOUT;
  const { def: matDefs, siteA, siteB, canalMark } =
    createPlatformDesertMaterials({ quality: opts.quality || (T && T.quality) || 'medium' });
  const batches = new Map();
  const batch = (key) => { let b = batches.get(key); if (!b) { b = new Batch(); batches.set(key, b); } return b; };
  const meshes = [];

  // ---------- 盒子（六面，UV 按面尺寸 / def.uv 平铺） ----------
  function box(key, cx, cy, cz, sx, sy, sz, yaw = 0) {
    const d = matDefs[key.split('#')[0]];
    const tu = d ? d.uv : 2;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const half = [sx / 2, sy / 2, sz / 2], size = [sx, sy, sz];
    for (const fk in FACE) {
      const F = FACE[fk];
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
      const u1 = su / tu, v1 = sv / tu;
      batch(key).quad(corner(-0.5, -0.5), corner(0.5, -0.5), corner(0.5, 0.5), corner(-0.5, 0.5), n,
        [0, 0, u1, 0, u1, v1, 0, v1]);
    }
  }

  // ---------- 楔形坡面视觉（顶面 y0(轴负端)→y1(轴正端)，底面 min-厚度） ----------
  function wedge(key, r) {
    const b = batch(key), tu = (matDefs[key] || {}).uv || 2;
    const w = r.sx / 2, d = r.sz / 2;
    const y0 = r.y0, y1 = r.y1, yb = Math.min(y0, y1) - (r.thickness || 0.3);
    const zAxis = r.axis !== 'x';
    const P = zAxis ? [[-w, y0, -d], [w, y0, -d]] : [[-w, y0, -d], [-w, y0, d]];
    const Q = zAxis ? [[w, y1, d], [-w, y1, d]] : [[w, y1, d], [w, y1, -d]];
    const B = [[P[0][0], yb, P[0][2]], [P[1][0], yb, P[1][2]], [Q[0][0], yb, Q[0][2]], [Q[1][0], yb, Q[1][2]]];
    const quad = (v0, v1, v2, v3, want) => {
      const wpos = (v) => [v[0] + r.x, v[1], v[2] + r.z];
      [v0, v1, v2, v3] = [wpos(v0), wpos(v1), wpos(v2), wpos(v3)];
      const ux = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
      const vx = [v3[0] - v0[0], v3[1] - v0[1], v3[2] - v0[2]];
      let n = [ux[1] * vx[2] - ux[2] * vx[1], ux[2] * vx[0] - ux[0] * vx[2], ux[0] * vx[1] - ux[1] * vx[0]];
      const cen = [(v0[0] + v2[0]) / 2, (v0[1] + v2[1]) / 2, (v0[2] + v2[2]) / 2];
      const ref = [cen[0] - r.x, cen[1] - (y0 + y1) / 2, cen[2] - r.z];
      // 顶面的中心恰落在坡体中心，外向点积为 0；必须显式保证 +Y 朝上
      if ((want === 'top' && n[1] < 0) ||
          (want !== 'top' && n[0] * ref[0] + n[1] * ref[1] + n[2] * ref[2] < 0)) {
        n = [-n[0], -n[1], -n[2]];
        [v1, v3] = [v3, v1];
      }
      const u = (vv) => [(vv[0] - r.x + w) / tu, (vv[2] - r.z + d) / tu];
      b.quad(v0, v1, v2, v3, n, [...u(v0), ...u(v1), ...u(v2), ...u(v3)]);
    };
    quad(P[0], P[1], Q[0], Q[1], 'top');
    quad(B[0], B[1], P[1], P[0], 'endN');
    quad(Q[0], Q[1], B[2], B[3], 'endP');
    quad(B[3], B[2], P[1], P[0], 'sideA');
    quad(B[0], B[1], Q[0], Q[1], 'sideB');
  }

  // ---------- 1. 布局实体：碰撞 + 视觉一一对应 ----------
  for (const so of L.solids) {
    world.add({
      x: so.x, y: so.y, z: so.z, sx: so.sx, sy: so.sy, sz: so.sz, yaw: so.yaw || 0,
      mat: so.mat, surface: so.surface, bullet: so.bullet, sight: so.sight, solid: so.solid,
      tag: so.tag || so.role,
    });
    box(so.m, so.x, so.y, so.z, so.sx, so.sy, so.sz, so.yaw || 0);
  }

  // ---------- 2. 坡道：契约 API + 楔形视觉 ----------
  for (const r of L.ramps) {
    if (typeof world.addRamp === 'function') {
      world.addRamp(r);
    } else {
      const n = 8, ax = r.axis === 'x';
      const span = ax ? r.sx : r.sz, step = span / n;
      for (let i = 0; i < n; i++) {
        const t0 = -span / 2 + (i + 0.5) * step;
        const hh = r.y0 + (r.y1 - r.y0) * ((i + 0.5) / n + 0.5 / n);
        const base = Math.min(r.y0, r.y1);
        const cx = ax ? r.x + t0 : r.x, cz = ax ? r.z : r.z + t0;
        world.add({
          x: cx, y: (base + hh) / 2 + 0.01, z: cz, sx: ax ? step : r.sx, sy: hh - base + 0.02, sz: ax ? r.sz : step,
          mat: r.mat, surface: r.surface, tag: r.tag || 'rampStep',
        });
      }
    }
    wedge(r.m || 'concrete', r);
  }

  // ---------- 3. 纯装饰：建筑檐口 + 渠沿压顶 ----------
  for (const so of L.solids) {
    if (so.role !== 'struct' || so.sy < 4) continue;
    const top = so.y + so.sy / 2;
    box('roofTile', so.x, top + 0.12, so.z, so.sx + 0.7, 0.24, so.sz + 0.7, 0);
  }
  // 渠沿压顶：暗渠两帮顶部石条（纯视觉，不收窄可站立面）
  for (const s of L.solids) {
    if (s.id !== 'canalWallS' && s.id !== 'canalWallN') continue;
    box('stoneTrim', s.x, s.y + s.sy / 2 + 0.09, s.z, s.sx, 0.18, s.sz + 0.24, 0);
  }

  // ---------- 4. 市场遮阳篷（货摊上方 0.06m 薄板，纯视觉零碰撞） ----------
  for (const so of L.solids) {
    if (so.tag !== 'stall') continue;
    box('roofTile', so.x, so.y + so.sy / 2 + 0.14, so.z, so.sx + 1.1, 0.08, so.sz + 1.2, 0);
  }

  // ---------- 5. 棕榈（枣椰大道/渠首广场，装饰用独立网格，不参与碰撞） ----------
  const palmMat = new THREE.MeshStandardMaterial({ color: 0x6f8f3e, roughness: 0.9 });
  const trunkMat = matDefs.woodDark.mat;
  const palmSpots = [[39, 6], [39, 22], [39, -18], [-40, 4], [-40, 20], [-40, -14], [-24, 8], [22, 8], [-8, -8.6], [20, -8.6]];
  for (const [px, pz] of palmSpots) {
    const g = new THREE.Group();
    const h = 4.2 + ((px * 7 + pz * 3) % 3);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, h, 6), trunkMat);
    trunk.position.y = h / 2;
    trunk.castShadow = true;
    g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.34, 2.3, 4), palmMat);
      frond.position.set(Math.cos(i * 1.05) * 0.9, h + 0.15, Math.sin(i * 1.05) * 0.9);
      frond.rotation.set(Math.sin(i * 1.05) * 1.25, -i * 1.05, -Math.cos(i * 1.05) * 1.25);
      frond.castShadow = true;
      g.add(frond);
    }
    g.position.set(px, 0, pz);
    g.name = 'pd-palm';
    scene.add(g);
    meshes.push(g);
  }

  // ---------- 6. 远景沙丘天际线（界外低多边形沙脊，总览遮地平线） ----------
  {
    const dunes = [
      [-46, -30, 10, 14], [-47, -10, 12, 17], [-46, 12, 9, 12], [-47, 30, 11, 15],
      [46, -28, 10, 15], [47, -6, 12, 18], [46, 16, 9, 12], [47, 32, 10, 14],
      [-24, -43, 14, 12], [0, -44, 16, 14], [24, -43, 14, 12],
      [-24, 43, 14, 9], [0, 44, 16, 10], [24, 43, 14, 9],
    ];
    for (const [x, z, sx, h] of dunes) {
      box('sandRed', x, h / 2 - 0.6, z, sx, h, sx * 0.9, 0);
    }
  }

  // ---------- 7. 包点喷漆 + 暗渠坡道通行标识（纯贴花，不参与碰撞/导航） ----------
  for (const bs of L.bombSites) {
    const mesh = new THREE.Mesh(UNIT_GROUND, bs.id === 'A' ? siteA : siteB);
    mesh.scale.set(5, 1, 5);
    mesh.position.set(bs.x, bs.y + 0.02, bs.z);
    mesh.renderOrder = 1;
    scene.add(mesh);
    meshes.push(mesh);
  }
  const decal = (m, x, y, z, w, h, rotY = 0) => {
    const mesh = new THREE.Mesh(UNIT_GROUND, m);
    mesh.scale.set(w, 1, h);
    if (rotY) mesh.rotation.y = rotY;
    mesh.position.set(x, y, z);
    mesh.renderOrder = 1;
    scene.add(mesh);
    meshes.push(mesh);
  };
  // 两处渠坡道口：箭头指向北（-Z）下渠
  decal(canalMark, -28, 0.02, 4.6, 3, 3, Math.PI);   // 西坡口朝南（+Z 下渠）
  decal(canalMark, 28, 0.02, 4.6, 3, 3, Math.PI);

  // ---------- 8. 灯具（点光源锚点由 game.lampLights 消费，前 4 个生效） ----------
  const lampSpots = [];
  for (const p of [
    [-24, 2.4, 12.5], [-30, 2.4, 12.5],    // 市场棚厅（优先：室内最暗）
    [-12, 2.2, 16], [-12, 2.2, 28],        // 市场两门洞
    [-22, -0.4, 0], [10, -0.4, 0],         // 暗渠渠底
    [0, 3.6, -19],                         // 驼门巷石拱
  ]) {
    box('lamp', p[0], p[1], p[2], 0.24, 0.1, 0.24, 0);
    lampSpots.push(new THREE.Vector3(p[0], p[1] - 0.15, p[2]));
  }

  // ---------- 合批输出 ----------
  for (const [key, b] of batches) {
    if (!b.count) continue;
    const base = key.split('#')[0];
    const mesh = new THREE.Mesh(b.build(), matDefs[base].mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.name = 'pd-' + key;
    scene.add(mesh);
    meshes.push(mesh);
  }

  world.build();

  return {
    spawns: L.spawns,
    regions: L.regions,
    bombSites: L.bombSites,
    navGraph: L.navGraph,
    bounds: L.bounds,
    teamGoals: L.teamGoals,
    landmarkViews: L.landmarkViews,
    lampSpots,
    meshes,
    materials: matDefs,
    layout: L,
    update() { /* 赤霞集市为静态地图 */ },
  };
}
