// 沙漠灰地图构建：几何/碰撞完全由 desert-grey-layout.js 数据驱动，
// 材质来自 desert-grey-materials.js；本文件只负责实例化与纯装饰（屋顶檐口/远景/包点喷漆/灯具）。
// 坡道调用契约 API world.addRamp（由 physics/navigation 提供）；缺失时退化为浅台阶碰撞体，
// 保证白盒阶段即使导航模块未就位也可通行。
import * as THREE from 'three';
import { DESERT_LAYOUT } from './desert-grey-layout.js';
import { createDesertMaterials } from './desert-grey-materials.js';

const FACE = {
  px: { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  nx: { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  py: { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  ny: { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  pz: { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  nz: { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
};

// 共享贴花几何：全部地面贴花复用一片单位面片（尺寸经 mesh.scale），省 geometries 计数
const UNIT_GROUND = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2); // 水平贴花，法线 +Y

// 按材质合批（与运输船构建器同思路的轻量版）
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

export function buildDesertGrey(scene, T, world, opts = {}) {
  const L = DESERT_LAYOUT;
  // game.js 不向构建器透传 opts；画质档经 buildTextures 的 T.quality 传入（见 textures.js）
  const { def: matDefs, siteA, siteB, bridgeMark, dropScuff, sillPaint } =
    createDesertMaterials({ quality: opts.quality || (T && T.quality) || 'medium' });
  const batches = new Map();
  const batch = (key) => { let b = batches.get(key); if (!b) { b = new Batch(); batches.set(key, b); } return b; };
  // 材质兜底：lane M（plasterBase/stoneTrim/sandPath）未交付时回退现有键，装饰不得因缺键崩溃
  const mat = (k, fb = 'plaster') => matDefs[k] || matDefs[fb];
  const K = {
    base: matDefs.plasterBase ? 'plasterBase' : 'plaster',
    trim: matDefs.stoneTrim ? 'stoneTrim' : 'stone',
    path: matDefs.sandPath ? 'sandPath' : 'sand',
  };
  // 本地图构建的 AO 遮片材质（与 paint() 同约定：transparent + depthWrite:false + polygonOffset -2）。
  // 单张 u 向渐变贴图同时服务两类遮片：地面条带 u=0(墙侧)→1 渐隐；竖直遮片 uv 反转使 u=0 落在顶部。
  const aoTex = () => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 8;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 64, 0);
    g.addColorStop(0, 'rgba(14,13,11,0.30)');
    g.addColorStop(1, 'rgba(14,13,11,0.04)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 8);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const localMats = {
    ao: new THREE.MeshBasicMaterial({ map: aoTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide }),
  };
  const lampSpots = [];
  const meshes = [];

  // ---------- 盒子（六面，UV 按面尺寸 / def.uv 平铺） ----------
  function box(key, cx, cy, cz, sx, sy, sz, yaw = 0) {
    const d = matDefs[key.split('#')[0]];   // 远景拆分批次键带 #n 后缀
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
    // 顶边四角：P 端 = 轴负端(y0)，Q 端 = 轴正端(y1)
    const P = zAxis ? [[-w, y0, -d], [w, y0, -d]] : [[-w, y0, -d], [-w, y0, d]];
    const Q = zAxis ? [[w, y1, d], [-w, y1, d]] : [[w, y1, d], [w, y1, -d]];
    const B = [[P[0][0], yb, P[0][2]], [P[1][0], yb, P[1][2]], [Q[0][0], yb, Q[0][2]], [Q[1][0], yb, Q[1][2]]];
    const quad = (v0, v1, v2, v3, want) => {
      // P/Q/B 是坡道局部坐标；合批前必须落到地图世界坐标。
      const world = (v) => [v[0] + r.x, v[1], v[2] + r.z];
      [v0, v1, v2, v3] = [world(v0), world(v1), world(v2), world(v3)];
      const ux = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
      const vx = [v3[0] - v0[0], v3[1] - v0[1], v3[2] - v0[2]];
      let n = [ux[1] * vx[2] - ux[2] * vx[1], ux[2] * vx[0] - ux[0] * vx[2], ux[0] * vx[1] - ux[1] * vx[0]];
      const cen = [(v0[0] + v2[0]) / 2, (v0[1] + v2[1]) / 2, (v0[2] + v2[2]) / 2];
      const ref = [cen[0] - r.x, cen[1] - (y0 + y1) / 2, cen[2] - r.z];
      // 顶面的中心恰落在坡体中心，外向点积为 0；必须显式保证 +Y 朝上，
      // 否则单面材质会把整条可走斜面剔掉，只剩侧墙。
      if ((want === 'top' && n[1] < 0) ||
          (want !== 'top' && n[0] * ref[0] + n[1] * ref[1] + n[2] * ref[2] < 0)) {
        n = [-n[0], -n[1], -n[2]];
        [v1, v3] = [v3, v1];
      }
      // 以坡道左下角为 UV 原点；对中心取绝对值会令四角 UV 相同，贴图整面坍缩成单色。
      const u = (vv) => [(vv[0] - r.x + w) / tu, (vv[2] - r.z + d) / tu];
      b.quad(v0, v1, v2, v3, n, [...u(v0), ...u(v1), ...u(v2), ...u(v3)]);
    };
    quad(P[0], P[1], Q[0], Q[1], 'top');       // 顶斜面
    quad(B[0], B[1], P[1], P[0], 'endN');      // 负端立面
    quad(Q[0], Q[1], B[2], B[3], 'endP');      // 正端立面
    quad(B[3], B[2], P[1], P[0], 'sideA');     // 侧面（梯形）
    quad(B[0], B[1], Q[0], Q[1], 'sideB');     // 侧面
    // 底面不渲染（贴地或被坑底遮挡）
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
      // 退化路径：8 级浅台阶近似坡面（导航模块就位后不会走到）
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

  // ---------- 3. 纯装饰：建筑檐口屋顶 ----------
  for (const so of L.solids) {
    if (so.role !== 'struct' || so.sy < 4) continue;
    const top = so.y + so.sy / 2;
    box('roofTile', so.x, top + 0.12, so.z, so.sx + 0.7, 0.24, so.sz + 0.7, 0);
  }
  // 中央大厅（原 bldMidW 实心楼）掏空为壳体后无 sy≥4 的 struct，手补与原檐口同位的屋顶盖板
  // （原 struct x[-20,-6] z[-24,2] top 5.5 → roofTile y=5.62, 外扩 0.7），保持外轮廓不变。
  box('roofTile', -13, 5.62, -11, 14.7, 0.24, 26.7, 0);

  // ---------- 3.5 D1 墙基 + D5 墙地交界 AO（纯 scene 附加，零碰撞；唯一外扩 6cm 条带） ----------
  const aoG = batch('ao');
  // 地面 AO 条带：沿墙面铺 0.4m，渐变沿 dx/dz 向外渐隐（贴图 u=0 为墙侧）
  const aoStrip = (x, z, dx, dz, len) => {
    const cx = x + dx * 0.2, cz = z + dz * 0.2;
    const px = -dz, pz = dx, y = 0.012;
    const c = (a, b) => [cx + px * a + dx * b, y, cz + pz * a + dz * b];
    aoG.quad(c(-len / 2, -0.2), c(-len / 2, 0.2), c(len / 2, 0.2), c(len / 2, -0.2), [0, 1, 0],
      [0, 0, 1, 0, 1, 1, 0, 1]);
  };
  for (const so of L.solids) {
    if ((so.role !== 'wall' && so.role !== 'struct') || so.sy < 2 || so.m === 'stone') continue;
    if (so.y - so.sy / 2 > 0.06) continue;   // 只做落地墙基，悬空楣/窗间墙不加
    box(K.base, so.x, so.y - so.sy / 2 + 0.25, so.z, so.sx + 0.12, 0.5, so.sz + 0.12, so.yaw || 0);
    aoStrip(so.x, so.z - so.sz / 2, 0, -1, so.sx + 0.3);
    aoStrip(so.x, so.z + so.sz / 2, 0, 1, so.sx + 0.3);
    aoStrip(so.x - so.sx / 2, so.z, -1, 0, so.sz + 0.3);
    aoStrip(so.x + so.sx / 2, so.z, 1, 0, so.sz + 0.3);
  }

  // ---------- 4. 包点地面喷漆 + 通行/跳落视觉指引（纯贴花，不参与碰撞/导航） ----------
  for (const bs of L.bombSites) {
    const mesh = new THREE.Mesh(UNIT_GROUND, bs.id === 'A' ? siteA : siteB);
    mesh.scale.set(5, 1, 5);
    mesh.position.set(bs.x, bs.y + 0.02, bs.z);
    mesh.renderOrder = 1;
    scene.add(mesh);
    meshes.push(mesh);
  }
  const decal = (m, x, y, z, w, h, rotY = 0) => {
    const mesh = new THREE.Mesh(UNIT_GROUND, m);   // 纹理上方 → 世界 -Z（北）
    mesh.scale.set(w, 1, h);
    if (rotY) mesh.rotation.y = rotY;
    mesh.position.set(x, y, z);
    mesh.renderOrder = 1;
    scene.add(mesh);
    meshes.push(mesh);
  };
  // 桥面（B 洞上层地板）行进标识：箭头朝北指向 B 区，同时标注下方桥下通道
  decal(bridgeMark, -29, 2.615, -3, 3.4, 3.4);
  // B 窗跳落暗示：窗外 B 区地面落地磨痕 + 窗台磨蚀漆条（提示可从此处翻越/跳落）
  decal(dropScuff, -27.4, 0.02, -21, 2.8, 2.6);
  decal(sillPaint, -26, 3.615, -20.5, 0.55, 14);

  // ---------- 4.5 D2 门框/拱缘 + D3 窗檐 + D4 横梁 + D5 洞内 AO（纯 scene 附加，零碰撞） ----------
  // 中门：双木门两侧 jamb + 压顶（贴 woodDoor 色），jamb 内缘与门洞边缘齐平不缩通道
  const frameK = matDefs.woodDoor ? 'woodDoor' : 'wood';
  box(frameK, -0.775, 1.3, -24, 0.15, 2.6, 0.5);
  box(frameK, 0.775, 1.3, -24, 0.15, 2.6, 0.5);
  box(frameK, 0, 2.675, -24, 1.9, 0.15, 0.5);
  // A 门：石作 jamb + 压顶 + 双坡拱缘（两段斜面近似石拱）
  box(K.trim, 26.925, 1.6, -10, 0.15, 3.2, 0.5);
  box(K.trim, 31.075, 1.6, -10, 0.15, 3.2, 0.5);
  box(K.trim, 29, 3.275, -10, 4.5, 0.15, 0.5);
  {
    const b = batch(K.trim), tu = mat(K.trim).uv;
    // 拱缘斜面：法线朝上，v0→v1 沿坡向（同向 uv 平铺）
    b.quad([26.75, 3.35, -9.75], [29, 3.65, -9.75], [29, 3.65, -10.25], [26.75, 3.35, -10.25],
      [-0.13, 0.99, 0], [0, 0, 2.26 / tu, 0, 2.26 / tu, 0.5 / tu, 0, 0.5 / tu]);
    b.quad([29, 3.65, -9.75], [31.25, 3.35, -9.75], [31.25, 3.35, -10.25], [29, 3.65, -10.25],
      [0.13, 0.99, 0], [0, 0, 2.26 / tu, 0, 2.26 / tu, 0.5 / tu, 0, 0.5 / tu]);
  }
  // B 门：石作 jamb + 压顶（墙沿 z 向，jamb 嵌入墙缘）
  box(K.trim, -26, 1.5, -35.075, 0.5, 3.0, 0.15);
  box(K.trim, -26, 1.5, -31.925, 0.5, 3.0, 0.15);
  box(K.trim, -26, 3.075, -33.5, 0.5, 0.15, 3.45);
  // D3 B 窗房两扇窗檐：0.15m 厚、外挑 0.3m（西侧立面外）
  box(K.trim, -26.275, 4.875, -24, 0.45, 0.15, 4.6);
  box(K.trim, -26.275, 4.875, -16, 0.45, 0.15, 4.6);
  // D4 横梁：桥下与 B 洞上层顶板下沿，木梁 0.15×0.12，梁底 2.18m（≥2.15m 净空约束）
  for (let x = -37.25; x <= -6.75; x += 2.5) box('wood', x, 2.24, 4, 0.15, 0.12, 4);
  for (let z = -12.75; z <= 7.25; z += 2.5) box('wood', -29, 5.14, z, 6, 0.12, 0.15);
  // D5 洞内/窗洞 AO 竖直遮片（双面，v=1 顶部最深）
  const aoS = batch('ao');
  // 竖直遮片 uv：底边 u=1、顶边 u=0（贴图 u=0 最深 → 顶部投影感）
  const vqZ = (x0, x1, y0, y1, z) => aoS.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [0, 0, 1], [1, 0, 1, 0, 0, 1, 0, 1]);
  const vqX = (z0, z1, y0, y1, x) => aoS.quad([x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0], [1, 0, 0], [1, 0, 1, 0, 0, 1, 0, 1]);
  vqZ(-2.7, 2.7, 0, 2.6, -23.795); vqZ(-2.7, 2.7, 0, 2.6, -24.205);      // 中门洞内
  vqZ(26.9, 31.1, 0, 3.2, -9.795); vqZ(26.9, 31.1, 0, 3.2, -10.205);     // A 门洞内
  vqX(-35.1, -31.9, 0, 3.0, -26.205); vqX(-35.1, -31.9, 0, 3.0, -25.795); // B 门洞内
  vqX(-26.1, -21.9, 3.6, 4.8, -26.205); vqX(-18.1, -13.9, 3.6, 4.8, -26.205); // B 窗洞内
  vqX(-26.1, -21.9, 3.3, 3.6, -26.205); vqX(-18.1, -13.9, 3.3, 3.6, -26.205); // 窗台下积尘

  // ---------- 4.6 旧城立面：封闭木窗、石窗套、转角扶壁（纯视觉，不改变掩体或射线） ----------
  // 窗面沿实体墙向外偏 3cm；所有细节都在角色头顶，保持 A 大/B 区的交火净宽。
  const shutterX = (x, z, side, centerY = 3.12) => {
    const face = x + side * 0.025;
    box(frameK, face, centerY, z, 0.06, 1.35, 1.05);
    box(K.trim, face + side * 0.045, centerY - 0.74, z, 0.18, 0.13, 1.35); // 窗台
    box(K.trim, face + side * 0.045, centerY + 0.74, z, 0.18, 0.18, 1.42); // 压顶
    for (const dz of [-0.61, 0.61]) box(K.trim, face + side * 0.045, centerY - 0.02, z + dz, 0.17, 1.45, 0.12);
    box('wood', face + side * 0.08, centerY, z, 0.07, 1.22, 0.025); // 中央木榫
  };
  const shutterZ = (x, z, side, centerY = 3.12) => {
    const face = z + side * 0.025;
    box(frameK, x, centerY, face, 1.05, 1.35, 0.06);
    box(K.trim, x, centerY - 0.74, face + side * 0.045, 1.35, 0.13, 0.18);
    box(K.trim, x, centerY + 0.74, face + side * 0.045, 1.42, 0.18, 0.18);
    for (const dx of [-0.61, 0.61]) box(K.trim, x + dx, centerY - 0.02, face + side * 0.045, 0.12, 1.45, 0.17);
  };
  // A 大西墙面朝东、东侧楼面朝西：错列木窗打断连续水泥墙，同时保留坑区低墙轮廓。
  for (const z of [14, 21, 28]) shutterX(24.22, z, 1);
  for (const z of [12, 19, 27]) shutterX(33.98, z, -1);
  for (const z of [11, 18, 25, 31]) {
    box(K.trim, 24.27, 2.45, z, 0.13, 4.6, 0.22);
    box(K.trim, 33.93, 2.45, z + 2, 0.13, 4.6, 0.22);
  }
  box(K.trim, 24.26, 4.55, 19, 0.22, 0.18, 20);
  box(K.trim, 33.94, 4.55, 20, 0.22, 0.18, 24);
  // B 区北侧旧楼：封窗和连续窗台，与 B 窗房可通行的真实开口明确区分。
  for (const x of [-41, -36, -31]) shutterZ(x, -37.38, 1);
  box(K.trim, -36, 4.58, -37.28, 15, 0.2, 0.24);
  for (const x of [-43, -38, -33, -28]) box(K.trim, x, 2.55, -37.25, 0.23, 4.8, 0.18);
  // A 平台上缘的封窗和檐口，墙仍是不可通行的边界，玩家在高台能看见旧城外立面。
  for (const x of [35.9, 40.4]) shutterZ(x, -37.38, 1, 5.12);
  for (const z of [-34.5, -27.5]) shutterX(43.38, z, -1, 5.12);
  box(K.trim, 39, 6.72, -37.24, 10, 0.22, 0.26);
  box(K.trim, 43.24, 6.72, -28, 0.26, 0.22, 20);

  // 经典 B 区是夹在连片建筑里的半露天场地：高木梁和不连续屋面
  // 将天空切成几块，而不是四面直墙围出一整块露天矩形。全部在 5.8m
  // 以上且只参与渲染，不改变枪线、投掷物、碰撞或 AI 导航。
  for (const z of [-35, -29, -23, -17, -11.5]) {
    box('wood', -35.2, 6.05, z, 16.6, 0.25, 0.22);
  }
  for (const x of [-42.5, -36.5, -30.5]) {
    box('wood', x, 6.08, -23.4, 0.22, 0.26, 25.4);
  }
  for (const [x, z, sx, sz] of [
    [-39.5, -32.2, 7.7, 4.8], [-31.7, -32.2, 6.2, 4.8],
    [-40.2, -20.2, 6.3, 5.0], [-31.0, -15.0, 7.0, 3.1],
  ]) {
    box('roofTile', x, 6.28, z, sx, 0.15, sz);
    box(K.trim, x, 6.17, z + sz / 2, sx + 0.2, 0.12, 0.18);
  }
  // B 洞口和 A 斜坡只加墙缘，不在可走截面内放视觉挡板。
  for (const x of [-37.9, -32.1]) box(K.trim, x, 1.15, -10.04, 0.18, 2.3, 0.28);
  box(K.trim, -35, 2.32, -10.04, 6.0, 0.18, 0.30);
  for (const x of [37.8, 42.2]) box(K.trim, x, 1.30, -15.5, 0.22, 2.6, 5.1);

  // 旧地图里辨识度很高的褪色包点指引。只贴在实体墙上，不作为可交互目标。
  const routePaint = (label, x, y, z, yaw) => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const cx = c.getContext('2d');
    cx.font = '900 80px Arial Black, sans-serif';
    cx.fillStyle = 'rgba(147,46,34,0.76)';
    cx.fillText(label, 18, 91);
    let seed = label.charCodeAt(0) * 1723;
    for (let i = 0; i < 90; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const px = seed % 250;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      cx.clearRect(px, 12 + seed % 100, 2 + seed % 5, 1 + seed % 3);
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), m);
    sign.position.set(x, y, z); sign.rotation.y = yaw; sign.renderOrder = 2;
    scene.add(sign); meshes.push(sign);
  };
  routePaint('A →', 33.93, 2.0, 14, -Math.PI / 2);
  routePaint('B →', -26.23, 2.1, -21, -Math.PI / 2);

  // ---------- 5. D6 远景成组街镇（rad≥58 不可达区，纯装饰零碰撞；按 x 象限拆 2 个 batch） ----------
  {
    let seed = 20260927;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const put = (x, z, sx, sy, sz, q) => box('plasterB' + q, x, sy / 2 - 0.5, z, sx, sy, sz, 0);
    const cap = (x, z, sx, sy, sz) => box('roofTile', x, sy - 0.35, z, sx + 1.4, 0.3, sz + 1.4, 0);
    for (let g = 0; g < 9; g++) {
      const a = (g / 9) * Math.PI * 2 + (rnd() - 0.5) * 0.3;
      const rad = 62 + rnd() * 30;
      const gx = Math.cos(a) * rad, gz = Math.sin(a) * rad * 0.92;
      const q = '#' + (gx < 0 ? 0 : 1);
      const n = 3 + ((rnd() * 4) | 0);                       // 每组 3–6 幢
      // 组内建筑沿近切向成排贴邻（共享墙，缝 0–0.5m），高 5–20m 错落
      const ta = a + Math.PI / 2 * (rnd() > 0.5 ? 1 : -1) + (rnd() - 0.5) * 0.4;
      const dx = Math.cos(ta), dz = Math.sin(ta);
      const items = [];
      for (let i = 0; i < n; i++) items.push({ w: 6 + rnd() * 7, d: 6 + rnd() * 7, h: 5 + rnd() * 15 });
      let cur = -items.reduce((s, it) => s + it.w, 0) / 2;
      for (const it of items) {
        const bx = gx + dx * (cur + it.w / 2), bz = gz + dz * (cur + it.w / 2);
        cur += it.w + rnd() * 0.5;
        if (Math.abs(bx) < 46 && Math.abs(bz) < 40) continue; // 不可达区兜底（bounds 外）
        put(bx, bz, it.w, it.h, it.d, q);
        if (rnd() > 0.45) cap(bx, bz, it.w, it.h, it.d);      // 部分加 roofTile 顶 + 0.7m 出檐
      }
    }
    // 两座标志塔（方位参照，保留）
    put(-58, -50, 7, 17, 7, '#0'); cap(-58, -50, 7, 17, 7);
    put(52, 46, 6, 14, 6, '#1'); cap(52, 46, 6, 14, 6);
  }

  // ---------- 5.2 贴墙裙楼环（纯装饰零碰撞）：参考俯视图里场地四周是直接
  // 贴住围墙的连片屋顶群，而上面的 D6 远景环在 rad≥58 处与场地脱开，
  // 总览呈“孤岛”。在边界墙外侧成排补齐贴边楼块，行内段首尾共享边缘
  // 形成连片轮廓；南行压低高度，避免总览机位遮住潜伏者出生区。
  {
    // [cx, cz, sx, sz, h]；南北行沿 x 贯通覆盖四角，东西行填 z[-38,38]
    const cap = (x, z, sx, sy, sz) => box('roofTile', x, sy - 0.35, z, sx + 1.4, 0.3, sz + 1.4, 0);
    const skirt = [
      // 北行（z -43..-38）
      [-41.5, -40.5, 15, 5, 11], [-27, -40.5, 14, 5, 13], [-14, -40.5, 12, 5, 9.5],
      [-1, -40.5, 14, 5, 12], [13, -40.5, 14, 5, 10], [27, -40.5, 14, 5, 13], [41.5, -40.5, 15, 5, 11],
      // 南行（z 38..43，低矮）
      [-41, 40.5, 16, 5, 6.5], [-25, 40.5, 16, 5, 7], [-9, 40.5, 16, 5, 5.5],
      [7, 40.5, 16, 5, 6.5], [23, 40.5, 16, 5, 7], [40, 40.5, 18, 5, 6],
      // 西行（x -49..-44）
      [-46.5, -31, 5, 14, 10], [-46.5, -17, 5, 14, 8.5], [-46.5, -2, 5, 16, 12],
      [-46.5, 14, 5, 16, 9.5], [-46.5, 30, 5, 16, 11],
      // 东行（x 44..49）
      [46.5, -30, 5, 16, 11], [46.5, -14, 5, 16, 9], [46.5, 2, 5, 16, 12.5],
      [46.5, 18, 5, 16, 10], [46.5, 32, 5, 12, 11.5],
    ];
    skirt.forEach(([x, z, sx, sz, h], i) => {
      const q = '#' + (x < 0 ? 0 : 1);
      box('plasterB' + q, x, h / 2 - 0.5, z, sx, h, sz, 0);
      if (i % 2 === 0) cap(x, z, sx, h, sz);   // 隔栋加 roofTile 顶 + 0.7m 出檐
    });
  }

  // ---------- 5.5 D7 道路磨损薄面（sandPath，顶面 0.015m，纯装饰零碰撞） ----------
  box(K.path, 0, 0, -8, 4.5, 0.03, 28);       // 中路
  box(K.path, 29, 0, -7.5, 3.6, 0.03, 3);     // A 大北段（坑北缘→A 门）
  box(K.path, 29, 0, 19, 3.6, 0.03, 18);      // A 大南段（坑南缘→A 大入口）
  box(K.path, -31, 0, -33.5, 9, 0.03, 4.5);   // B 门内通道
  box(K.path, -35.5, 0, -12.5, 5, 0.03, 9);   // B 区洞口外

  // ---------- 6. 灯具（点光源锚点由 game.lampLights 消费） ----------
  // game.lampLights 只为前 4 个锚点创建真实点光源（low 档为 0）；
  // 顺序按洞内优先级排列：B 洞下层 → B 洞上层 → 桥下，保证受限空间优先获得补光。
  for (const p of [
    [-35, 2.1, -4],                        // B 洞下层
    [-29, 4.9, 0], [-29, 4.9, -8],         // B 洞上层
    [-30, 2.1, 4], [-16, 2.1, 4],          // 桥下
    [-23, 5.0, -19],                       // B 窗房
    [0, 3.9, -25.2],                       // 中门
  ]) {
    box('lamp', p[0], p[1], p[2], 0.24, 0.1, 0.24, 0);
    lampSpots.push(new THREE.Vector3(p[0], p[1] - 0.15, p[2]));
  }

  // ---------- 合批输出 ----------
  for (const [key, b] of batches) {
    if (!b.count) continue;
    const base = key.split('#')[0];
    const mesh = new THREE.Mesh(b.build(), localMats[base] || matDefs[base].mat);
    mesh.castShadow = !key.startsWith('ao');   // AO 遮片不投影
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.name = 'dg-' + key;
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
    update() { /* 沙漠灰为静态地图 */ },
  };
}
