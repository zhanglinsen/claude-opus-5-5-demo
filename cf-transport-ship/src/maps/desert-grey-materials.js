// 沙漠灰材质（阶段 4 画面升级）：程序化 Canvas 漫反射 + 法线 + 粗糙度贴图组。
// 全部离线自包含（无网络资源）；uv 为「每块纹理覆盖的米数」，构建器按面尺寸平铺。
// 画质分档：low=128px 且无贴图；medium=256px；high=512px。种子固定，截图可复现。
// 照片增强（medium/high）：打包石墙/地面照片烘入 2x2 镜像拼贴合成画布（medium 512 / high 1024），
// 污渍 fbm 打破镜像对称，三通道（map/roughness/normal）同一过程派生；texture.repeat=0.5 守恒世界尺度。
// 风化/磨损（水渍、裂缝、锈蚀、磨光）与参考图一致：暖沙灰砌块墙 + 强日照硬阴影。
// lane M（对照 visual-plan.md §3.1）：M1 底色暖化（蓝通道 ×0.96 抵消冷光）、M2 砌块行缝/竖缝、
// M3 sandPath 道路面、M4 plasterBase 墙基、M5 stoneTrim 规整石作；新增种子固定在 92xx 段。
import * as THREE from 'three';
import wallTextureUrl from '../assets/desert-grey-wall.png';
import groundTextureUrl from '../assets/desert-grey-ground.png';
import { mulberry32, fbm, normalFromHeight } from '../textures.js';

function mkCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function tex(c, { srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
}
// 在半径 r 内向高度场加锥形凸起（dv>0 凸 / <0 凹）
function stamp(hgt, S, x, y, r, dv) {
  const x0 = Math.max(0, (x - r) | 0), x1 = Math.min(S - 1, (x + r) | 0);
  const y0 = Math.max(0, (y - r) | 0), y1 = Math.min(S - 1, (y + r) | 0);
  for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
    const dd = Math.hypot(xx - x, yy - y);
    if (dd < r) hgt[yy * S + xx] += dv * (1 - dd / r);
  }
}
// 组装最终贴图组：albedo canvas + 高度场→法线 + 粗糙度场→灰度图
function finish(c, hgt, rough, S, useNormal) {
  const out = { map: tex(c) };
  if (useNormal) out.normalMap = tex(normalFromHeight(hgt, S, S, 2.2), { srgb: false });
  const rc = mkCanvas(S), rctx = rc.getContext('2d');
  const img = rctx.createImageData(S, S), d = img.data;
  for (let i = 0; i < S * S; i++) {
    const v = Math.max(0, Math.min(1, rough[i])) * 255;
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
  }
  rctx.putImageData(img, 0, 0);
  out.roughnessMap = tex(rc, { srgb: false });
  return out;
}
// 粗糙度 Float32 场 → 灰度画布（0-1 直接编码）
function roughCanvasOf(rough, S) {
  const rc = mkCanvas(S), rctx = rc.getContext('2d');
  const img = rctx.createImageData(S, S), d = img.data;
  for (let i = 0; i < S * S; i++) {
    const v = Math.max(0, Math.min(1, rough[i])) * 255;
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
  }
  rctx.putImageData(img, 0, 0);
  return rc;
}

// ---------- 照片合成管线：2x2 镜像拼贴 + 固定种子大尺度污渍（打破镜像“蝴蝶”伪影） ----------
// 打包照片烘入 2x2 镜像拼贴画布，污渍 fbm 跨拼块连续、破坏 MirroredRepeat 的对称可辨识性；
// 颜色/粗糙度/法线三通道在同一合成过程派生（污渍同时驱动颜色 multiply 与粗糙度场）。
// 世界尺度守恒：画布含 2x2 拼块 → texture.repeat=0.5，画布覆盖 2*uv 米，单拼块仍占 uv 米。
function compositePhoto(srcImg, CS, o = {}) {
  const T = CS >> 1;
  const color = mkCanvas(CS), cctx = color.getContext('2d');
  cctx.drawImage(srcImg, 0, 0, T, T);
  cctx.save(); cctx.translate(CS, 0); cctx.scale(-1, 1); cctx.drawImage(srcImg, 0, 0, T, T); cctx.restore();
  cctx.save(); cctx.translate(0, CS); cctx.scale(1, -1); cctx.drawImage(srcImg, 0, 0, T, T); cctx.restore();
  cctx.save(); cctx.translate(CS, CS); cctx.scale(-1, -1); cctx.drawImage(srcImg, 0, 0, T, T); cctx.restore();

  const seed = o.seed ?? 9250;
  const stainA = fbm(CS, CS, 3, 3, 4, seed);      // 大尺度污渍（拼贴缝两侧连续）
  const stainB = fbm(CS, CS, 7, 7, 3, seed + 7);  // 中尺度色斑
  const img = cctx.getImageData(0, 0, CS, CS), d = img.data;
  const hgt = new Float32Array(CS * CS), rough = new Float32Array(CS * CS);
  const stainMul = o.stainMul ?? 0.16, eo = o.edge ?? 0.05, bo = o.bottom ?? 0;
  const roughMid = o.roughMid ?? 0.96, roughVar = o.roughVar ?? 0.08, roughLo = o.roughLo ?? 0.93;
  for (let y = 0; y < CS; y++) for (let x = 0; x < CS; x++) {
    const i = y * CS + x, i4 = i * 4, sa = stainA[i], sb = stainB[i];
    // 污渍 multiply（围绕 1.0 的低幅度调制）
    let m = 1 - (sa - 0.5) * stainMul - (sb - 0.5) * stainMul * 0.6;
    // 画布边缘 + 底部 env-occlusion 式轻微加深（底部权重更大，仿墙脚积尘）
    const eb = Math.min(x, CS - 1 - x, y, CS - 1 - y);
    m *= 1 - eo * Math.max(0, 1 - eb / (CS * 0.15));
    if (bo > 0) m *= 1 - bo * Math.max(0, 1 - y / (CS * 0.35));
    let rr = d[i4] * m, gg = d[i4 + 1] * m, bb = d[i4 + 2] * m, ruts = 0;
    if (o.ruts) { // 车辙/磨损带（噪声扰动横带，种子固定；同一污渍场驱动，位置与颜色污渍呼应）
      const band = Math.sin((y / CS) * Math.PI * 3 + sa * 4) * 0.5 + 0.5;
      ruts = Math.max(0, band - 0.6) * 1.5;
      rr *= 1 - ruts * 0.16; gg *= 1 - ruts * 0.16; bb *= 1 - ruts * 0.14;
    }
    d[i4] = rr; d[i4 + 1] = gg; d[i4 + 2] = bb; d[i4 + 3] = 255;
    hgt[i] = (rr * 0.3 + gg * 0.45 + bb * 0.25) / 255; // 亮度场→弱强度法线
    // 粗糙度与颜色同一污渍驱动：污渍处更糙、车辙压实处更光滑
    rough[i] = Math.max(roughLo, Math.min(1, roughMid + (sa - 0.5) * roughVar - ruts * 0.1));
  }
  cctx.putImageData(img, 0, 0);
  const out = {
    map: tex(color),
    normalMap: tex(normalFromHeight(hgt, CS, CS, 1.3), { srgb: false }),
    roughnessMap: tex(roughCanvasOf(rough, CS), { srgb: false }),
  };
  for (const t of [out.map, out.normalMap, out.roughnessMap]) t.repeat.set(0.5, 0.5);
  return out;
}

// ---------- 沙地：风蚀波纹 + 沙粒 + 碎石（o: tone 整体明度 / rough 粗糙度基线 / pebbles 碎石数 / ruts 车辙带 / seed） ----------
function sand(S, useNormal, o = {}) {
  const tone = o.tone ?? 1, roughBase = o.rough ?? 0.92, pebbles = o.pebbles ?? 30;
  const seed = o.seed ?? 9101, ruts = o.ruts || false;
  const c = mkCanvas(S), ctx = c.getContext('2d');
  const n1 = fbm(S, S, 4, 4, 5, seed), n2 = fbm(S, S, 16, 16, 3, seed + 1);
  const img = ctx.createImageData(S, S), d = img.data;
  const hgt = new Float32Array(S * S), rough = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, v = n1[i], f = n2[i];
    const rip = Math.sin((x / S) * Math.PI * 6 + v * 5) * 0.5 + 0.5;
    let k = 0.84 + v * 0.26 + (f - 0.5) * 0.1; // M1：色斑幅度 0.2→0.26
    let h = rip * 0.45 + f * 0.35;
    let rr = 201 * k, gg = 183 * k, bb = 140 * k;
    if (ruts) { // M3：车辙/脚印横向暗条带（噪声扰动的正弦带）
      const band = Math.sin((y / S) * Math.PI * 4 + v * 3) * 0.5 + 0.5;
      const rut = Math.max(0, band - 0.62) * 1.6;
      rr *= 1 - rut * 0.22; gg *= 1 - rut * 0.22; bb *= 1 - rut * 0.2;
      h -= rut * 0.18;
    }
    d[i * 4] = rr * tone; d[i * 4 + 1] = gg * tone; d[i * 4 + 2] = bb * tone; d[i * 4 + 3] = 255;
    hgt[i] = h;
    rough[i] = Math.min(1, roughBase + (f - 0.5) * 0.12);
  }
  ctx.putImageData(img, 0, 0);
  const rnd = mulberry32(seed + 2);
  for (let i = 0; i < pebbles; i++) { // 碎石：略凸、更粗糙
    const x = rnd() * S, y = rnd() * S, r = 1 + rnd() * 2.5;
    ctx.fillStyle = `rgba(96,84,62,${0.2 + rnd() * 0.25})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    stamp(hgt, S, x, y, r + 1, 0.25);
  }
  return finish(c, hgt, rough, S, useNormal);
}

// ---------- 灰泥墙：弱化砌块行缝 + 水渍/裂缝/起皮露底（M1 暖化 M2 行缝） ----------
function plaster(S, useNormal, base = [206, 194, 170], wear = 1.4, seed = 9110, roughBase = 0.86) {
  const c = mkCanvas(S), ctx = c.getContext('2d');
  const n1 = fbm(S, S, 4, 4, 5, seed), n2 = fbm(S, S, 16, 16, 3, seed + 1);
  const img = ctx.createImageData(S, S), d = img.data;
  const hgt = new Float32Array(S * S), rough = new Float32Array(S * S);
  const rows = 4, rh = S / rows; // uv=3m 内约 4 行砌块
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, v = n1[i], f = n2[i];
    const k = 0.88 + v * 0.16 + (f - 0.5) * 0.06;
    // 弱化版行缝（仿 stone 错缝，缝色差 8%、凹 0.1）
    const r = Math.min(rows - 1, (y / rh) | 0);
    const bw = rh * 2, off = (r % 2) * rh;
    const bx = (x + off) - (((x + off) / bw) | 0) * bw;
    const ey = Math.min(y - r * rh, (r + 1) * rh - y);
    const edge = Math.min(bx, bw - bx, ey);
    const jk = edge < 1.5 ? 0.92 : 1;
    d[i * 4] = base[0] * k * jk; d[i * 4 + 1] = base[1] * k * jk; d[i * 4 + 2] = base[2] * k * jk * 0.96; d[i * 4 + 3] = 255;
    hgt[i] = v * 0.4 + f * 0.15 - (edge < 1.5 ? 0.1 : 0);
    rough[i] = Math.min(1, roughBase + v * 0.1 + (edge < 1.5 ? 0.06 : 0));
  }
  ctx.putImageData(img, 0, 0);
  const rnd = mulberry32(seed + 2);
  // 水渍/风化斑（自上而下的浅色渐变污带）
  for (let i = 0; i < 8 * wear; i++) {
    const g = ctx.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(90,80,60,0.5)');
    ctx.globalAlpha = 0.08 + rnd() * 0.12;
    ctx.fillStyle = g;
    ctx.fillRect(rnd() * S, rnd() * S * 0.4, 8 + rnd() * 26, S);
    ctx.globalAlpha = 1;
  }
  // 裂缝（凹入高度场）
  ctx.strokeStyle = 'rgba(60,55,45,0.28)';
  for (let i = 0; i < 4 * wear; i++) {
    ctx.beginPath();
    let x = rnd() * S, y = rnd() * S * 0.5;
    ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (rnd() - 0.5) * 22; y += 10 + rnd() * 18;
      ctx.lineTo(x, y);
      stamp(hgt, S, x, y, 1.6, -0.3);
    }
    ctx.stroke();
  }
  // 起皮露底（更粗糙的深色斑）
  for (let i = 0; i < 5 * wear; i++) {
    const x = rnd() * S, y = rnd() * S, r = 3 + rnd() * 9;
    ctx.fillStyle = `rgba(150,140,120,${0.25 + rnd() * 0.2})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    stamp(hgt, S, x, y, r, -0.12);
  }
  return finish(c, hgt, rough, S, useNormal);
}

// ---------- 石材：错缝砌块 + 凹缝（o: rows 行数 / tone 块面基色 / toneVar 明度差 / mortar 缝色 / seed） ----------
function stone(S, useNormal, o = {}) {
  const rows = o.rows ?? 6, tone = o.tone ?? 140, toneVar = o.toneVar ?? 40;
  const mortar = o.mortar ?? 118, seed = o.seed ?? 9120;
  const c = mkCanvas(S), ctx = c.getContext('2d');
  const n = fbm(S, S, 12, 12, 4, seed);
  const rnd = mulberry32(seed + 1);
  const rh = S / rows;
  const shade = [];
  for (let r = 0; r < rows; r++) {
    shade[r] = [];
    for (let b = 0; b < 4; b++) shade[r].push(tone + rnd() * toneVar);
  }
  const img = ctx.createImageData(S, S), d = img.data;
  const hgt = new Float32Array(S * S), rough = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    const r = Math.min(rows - 1, (y / rh) | 0);
    const bw = rh * 2, off = (r % 2) * rh;
    const cIdx = ((x + off) / bw) | 0;
    const bx = (x + off) - cIdx * bw; // 块内 x
    const ey = Math.min(y - r * rh, (r + 1) * rh - y);
    const ex = Math.min(bx, bw - bx);
    const edge = Math.min(ex, ey);
    const sh = shade[r][cIdx % 4];
    const k = 0.85 + n[i] * 0.24;
    let rr, gg, bb;
    if (edge < 2) { // 凹缝（砂浆）
      rr = mortar * k; gg = (mortar - 6) * k; bb = (mortar - 20) * k;
      hgt[i] = 0.12;
      rough[i] = 0.96;
    } else {
      rr = sh * k; gg = (sh - 6) * k; bb = (sh - 20) * k;
      hgt[i] = 0.5 + n[i] * 0.2 + Math.min(1, (edge - 2) / 3) * 0.15; // 边缘微倒角
      rough[i] = 0.82 + n[i] * 0.14;
    }
    d[i * 4] = rr; d[i * 4 + 1] = gg; d[i * 4 + 2] = bb; d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const rnd2 = mulberry32(seed + 2);
  for (let i = 0; i < 12; i++) { // 黑斑/苔痕
    const x = rnd2() * S, y = rnd2() * S, r = 2 + rnd2() * 6;
    ctx.fillStyle = `rgba(70,66,52,${0.12 + rnd2() * 0.15})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  return finish(c, hgt, rough, S, useNormal);
}

// ---------- 混凝土：模板缝 + 对拉螺栓孔 + 骨料 ----------
function concrete(S, useNormal) {
  const c = mkCanvas(S), ctx = c.getContext('2d');
  const n1 = fbm(S, S, 5, 5, 5, 9130), n2 = fbm(S, S, 20, 20, 3, 9131);
  const img = ctx.createImageData(S, S), d = img.data;
  const hgt = new Float32Array(S * S), rough = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    const k = 0.86 + n1[i] * 0.2 + (n2[i] - 0.5) * 0.08;
    // 模板缝：横缝居中 + 四条竖缝（五分点），缝缘微倒角
    let sd = Math.abs(y - S / 2);
    for (let vi = 1; vi <= 4; vi++) sd = Math.min(sd, Math.abs(x - (S * vi) / 5));
    let seamK = 1;
    if (sd < 1.5) { seamK = 0.93; }
    else if (sd < 3.5) { seamK = 1 - (3.5 - sd) * 0.012; }
    d[i * 4] = 176 * k * seamK; d[i * 4 + 1] = 166 * k * seamK; d[i * 4 + 2] = 146 * k * seamK; d[i * 4 + 3] = 255;
    hgt[i] = n1[i] * 0.3 + n2[i] * 0.15;
    rough[i] = Math.min(1, 0.88 + n2[i] * 0.1);
    if (sd < 1.5) hgt[i] = 0.05;
    else if (sd < 3.5) hgt[i] -= (3.5 - sd) * 0.03;
  }
  ctx.putImageData(img, 0, 0);
  const rnd = mulberry32(9132);
  // 对拉螺栓孔（四角凹点）
  for (const [px, py] of [[S * 0.22, S * 0.22], [S * 0.78, S * 0.22], [S * 0.22, S * 0.78], [S * 0.78, S * 0.78]]) {
    ctx.fillStyle = 'rgba(70,66,58,0.5)';
    ctx.beginPath(); ctx.arc(px, py, S * 0.012 + 1, 0, 7); ctx.fill();
    stamp(hgt, S, px, py, S * 0.02 + 1.5, -0.3);
  }
  // 雨水竖痕
  for (let i = 0; i < 6; i++) {
    const x = rnd() * S;
    const g = ctx.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, `rgba(80,76,66,${0.1 + rnd() * 0.1})`);
    g.addColorStop(1, 'rgba(80,76,66,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 2 + rnd() * 5, S * (0.4 + rnd() * 0.5));
  }
  return finish(c, hgt, rough, S, useNormal);
}

// ---------- 木板 / 木门：板缝 + 木纹凸筋 + 横撑 ----------
function wood(S, useNormal, base = [138, 106, 68], dark = 'rgba(60,42,22,0.6)', braces = false, seed = 9140) {
  const c = mkCanvas(S), ctx = c.getContext('2d');
  const grain = fbm(S, S, 3, 24, 4, seed), n2 = fbm(S, S, 14, 14, 3, seed + 1);
  const img = ctx.createImageData(S, S), d = img.data;
  const hgt = new Float32Array(S * S), rough = new Float32Array(S * S);
  const planks = 5, pw = S / planks;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    const p = (x / pw) | 0, px = x - p * pw;
    const g = grain[i], f = n2[i];
    const k = (0.82 + g * 0.28) * (0.94 + (f - 0.5) * 0.12);
    let hv = 0.4 + g * 0.35; // 木纹凸筋
    if (px < 1.5 || px > pw - 1.5) { hv = 0.05; } // 板缝
    hgt[i] = hv;
    rough[i] = Math.min(1, 0.76 + g * 0.14 + (px < 1.5 || px > pw - 1.5 ? 0.1 : 0));
    d[i * 4] = base[0] * k; d[i * 4 + 1] = base[1] * k; d[i * 4 + 2] = base[2] * k; d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const rnd = mulberry32(seed + 2);
  // 磨光磨损（长期触碰处粗糙度降低、颜色变浅）
  for (let i = 0; i < 6; i++) {
    const x = rnd() * S, y = rnd() * S, r = 4 + rnd() * 12;
    const g2 = ctx.createRadialGradient(x, y, 0, x, y, r);
    g2.addColorStop(0, 'rgba(190,160,120,0.28)');
    g2.addColorStop(1, 'rgba(190,160,120,0)');
    ctx.fillStyle = g2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    // 同遮罩降低粗糙度场（磨光处高光略强，P3-a：与报告声明对齐）
    for (let yy = Math.max(0, (y - r) | 0), ye = Math.min(S - 1, (y + r) | 0); yy <= ye; yy++)
      for (let xx = Math.max(0, (x - r) | 0), xe = Math.min(S - 1, (x + r) | 0); xx <= xe; xx++) {
        const dd = Math.hypot(xx - x, yy - y);
        if (dd < r) rough[yy * S + xx] = Math.max(0.5, rough[yy * S + xx] - 0.18 * (1 - dd / r));
      }
  }
  if (braces) { // 门板横撑 + 铆钉
    for (const by of [0.12, 0.79]) {
      const y0 = S * by, bh = S * 0.09;
      ctx.fillStyle = 'rgba(50,35,18,0.4)';
      ctx.fillRect(0, y0, S, bh);
      for (let y = y0 | 0; y < y0 + bh; y++) for (let x = 0; x < S; x++) hgt[y * S + x] = 0.62;
      for (let x = S * 0.08; x < S; x += S * 0.21) {
        ctx.fillStyle = 'rgba(35,30,25,0.8)';
        ctx.beginPath(); ctx.arc(x, y0 + bh / 2, 1.6, 0, 7); ctx.fill();
        stamp(hgt, S, x, y0 + bh / 2, 2.2, 0.2);
      }
    }
  }
  return finish(c, hgt, rough, S, useNormal);
}

// ---------- 屋顶瓦：横向瓦垄 ----------
function roofTile(S, useNormal) {
  const c = mkCanvas(S), ctx = c.getContext('2d');
  const n = fbm(S, S, 10, 10, 4, 9150);
  const img = ctx.createImageData(S, S), d = img.data;
  const hgt = new Float32Array(S * S), rough = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    const t = (y / S) * 10, f = t - Math.floor(t);
    const h = Math.sin(f * Math.PI);
    const k = (0.72 + h * 0.35) * (0.9 + n[i] * 0.18);
    d[i * 4] = 148 * k; d[i * 4 + 1] = 138 * k; d[i * 4 + 2] = 116 * k; d[i * 4 + 3] = 255;
    hgt[i] = h * 0.8 + n[i] * 0.1;
    rough[i] = 0.88 + n[i] * 0.1;
  }
  ctx.putImageData(img, 0, 0);
  const rnd = mulberry32(9151);
  for (let i = 0; i < 10; i++) { // 风化褪色斑
    ctx.fillStyle = `rgba(190,182,160,${0.1 + rnd() * 0.15})`;
    ctx.fillRect(rnd() * S, rnd() * S, 8 + rnd() * 24, 4 + rnd() * 10);
  }
  return finish(c, hgt, rough, S, useNormal);
}

// ---------- 包点地面喷漆（A/B，固定种子做旧） ----------
function siteTex(letter, S) {
  const c = mkCanvas(S), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(235,180,40,0.9)'; ctx.lineWidth = 10;
  ctx.strokeRect(14, 14, S - 28, S - 28);
  ctx.fillStyle = 'rgba(235,180,40,0.9)';
  ctx.font = `bold ${S * 0.62}px sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(letter, S / 2, S / 2 + 6);
  const rnd = mulberry32(9160 + letter.charCodeAt(0));
  for (let i = 0; i < 260; i++) ctx.clearRect(rnd() * S, rnd() * S, 3, 3);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- 通行标识贴花：双箭头 + 文字（箭头朝纹理上方 = 世界 -Z/北） ----------
function markerTex(text, S, seed) {
  const c = mkCanvas(S), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = 'rgba(228,176,48,0.92)';
  const chev = (cy, dir) => {
    ctx.beginPath();
    ctx.moveTo(S * 0.5, cy + dir * S * 0.09);
    ctx.lineTo(S * 0.32, cy - dir * S * 0.05);
    ctx.lineTo(S * 0.38, cy - dir * S * 0.11);
    ctx.lineTo(S * 0.5, cy + dir * 0);
    ctx.lineTo(S * 0.62, cy - dir * S * 0.11);
    ctx.lineTo(S * 0.68, cy - dir * S * 0.05);
    ctx.closePath(); ctx.fill();
  };
  chev(S * 0.2, 1); chev(S * 0.38, 1);
  ctx.font = `bold ${S * 0.15}px sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, S / 2, S * 0.62);
  ctx.font = `bold ${S * 0.1}px sans-serif`;
  ctx.fillText('UNDERPASS', S / 2, S * 0.76);
  const rnd = mulberry32(seed);
  for (let i = 0; i < 420; i++) ctx.clearRect(rnd() * S, rnd() * S, 2 + rnd() * 3, 2 + rnd() * 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// ---------- 跳落暗示：窗下地面磨痕 + 下落箭头 ----------
function dropScuffTex(S) {
  const c = mkCanvas(S), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  const rnd = mulberry32(9170);
  // 落地冲击磨痕（同心弧 + 溅点）
  for (let i = 0; i < 7; i++) {
    ctx.strokeStyle = `rgba(96,86,66,${0.16 + rnd() * 0.14})`;
    ctx.lineWidth = 2 + rnd() * 3;
    ctx.beginPath();
    ctx.arc(S * 0.5, S * 0.32, S * (0.12 + i * 0.07), Math.PI * (0.15 + rnd() * 0.2), Math.PI * (0.75 + rnd() * 0.2));
    ctx.stroke();
  }
  for (let i = 0; i < 40; i++) {
    const a = rnd() * Math.PI, r = S * (0.15 + rnd() * 0.35);
    ctx.fillStyle = `rgba(96,86,66,${0.1 + rnd() * 0.15})`;
    ctx.beginPath(); ctx.arc(S * 0.5 + Math.cos(a) * r, S * 0.32 + Math.sin(a) * r * 0.7, 1 + rnd() * 2.5, 0, 7); ctx.fill();
  }
  // 向下双箭头（跳落方向）
  ctx.fillStyle = 'rgba(228,176,48,0.8)';
  for (const cy of [S * 0.55, S * 0.72]) {
    ctx.beginPath();
    ctx.moveTo(S * 0.5, cy + S * 0.1);
    ctx.lineTo(S * 0.36, cy - S * 0.05);
    ctx.lineTo(S * 0.64, cy - S * 0.05);
    ctx.closePath(); ctx.fill();
  }
  for (let i = 0; i < 300; i++) ctx.clearRect(rnd() * S, rnd() * S, 2 + rnd() * 3, 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// ---------- 窗台磨蚀黄漆条（可翻越窗沿提示） ----------
function sillPaintTex(S) {
  const c = mkCanvas(S), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = 'rgba(228,176,48,0.85)';
  ctx.fillRect(0, S * 0.35, S, S * 0.3);
  ctx.fillStyle = 'rgba(60,54,40,0.35)';
  ctx.fillRect(0, S * 0.62, S, S * 0.05); // 下沿积尘线
  const rnd = mulberry32(9180);
  for (let i = 0; i < 380; i++) ctx.clearRect(rnd() * S, rnd() * S, 2 + rnd() * 4, 2 + rnd() * 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// uv = 每块纹理覆盖米数；构建器以面尺寸/uv 平铺
export function createDesertMaterials(opts = {}) {
  const q = opts.quality || 'medium';
  const S = q === 'low' ? 128 : q === 'high' ? 512 : 256;
  const useNormal = q !== 'low'; // 低档省一次法线采样，保底辨识度靠漫反射
  const std = (p, { rough = 1, normalScale = 1, extra = {} } = {}) => new THREE.MeshStandardMaterial({
    map: p.map,
    roughnessMap: p.roughnessMap || null,
    normalMap: p.normalMap || null,
    normalScale: new THREE.Vector2(normalScale, normalScale),
    roughness: rough, metalness: 0.02,
    ...extra,
  });
  const def = {
    sand: { mat: std(sand(S, useNormal), { normalScale: 0.5 }), uv: 3 },
    // M3：压实道路面（更深更光滑、碎石少、车辙带）——供 lane D 贴花/薄面铺主干道
    sandPath: { mat: std(sand(S, useNormal, { tone: 0.92, rough: 0.8, pebbles: 12, ruts: true, seed: 9201 }), { normalScale: 0.45 }), uv: 3 },
    plaster: { mat: std(plaster(S, useNormal), { normalScale: 0.55 }), uv: 3 },
    // M4：墙基条带（近地污渍/磕碰最多，更深更旧更糙）——供 lane D 墙脚装饰
    plasterBase: { mat: std(plaster(S, useNormal, [161, 151, 133], 1.8, 9220, 0.94), { normalScale: 0.55 }), uv: 3 },
    plasterB: { mat: std(plaster(S, useNormal, [184, 170, 144], 1.2, 9115), { normalScale: 0.4 }), uv: 3.4 },
    stone: { mat: std(stone(S, useNormal), { normalScale: 0.9 }), uv: 2.4 },
    // M5：规整石作（块大缝浅、暖灰）——供 lane D 门框/窗檐/压顶
    stoneTrim: { mat: std(stone(S, useNormal, { rows: 4, tone: 178, toneVar: 36, mortar: 126, seed: 9210 }), { normalScale: 0.8 }), uv: 2.4 },
    concrete: { mat: std(concrete(S, useNormal), { normalScale: 0.7 }), uv: 2.2 },
    wood: { mat: std(wood(S, useNormal), { normalScale: 0.7 }), uv: 1.6 },
    woodDoor: { mat: std(wood(S, useNormal, [111, 84, 52], 'rgba(45,30,14,0.65)', true, 9145), { rough: 0.95, normalScale: 0.7 }), uv: 2 },
    roofTile: { mat: std(roofTile(S, useNormal), { normalScale: 0.8 }), uv: 2.4 },
    lamp: { mat: new THREE.MeshStandardMaterial({ color: 0xfff1cf, emissive: 0xffdf9e, emissiveIntensity: 3.0, roughness: 0.4 }), uv: 1 },
  };
  // 离线打包的旧石墙贴图：只在均衡/精致档启用，低档继续用轻量程序纹理。
  // 图片解码完成后才合成替换程序贴图，避免开场白闪；合成失败退回照片直贴（标量粗糙度仍生效）。
  if (q !== 'low') {
    const CS = q === 'high' ? 1024 : 512; // 合成画布预算：medium ≤512px / high ≤1024px
    new THREE.TextureLoader().load(wallTextureUrl, (wall) => {
      wall.colorSpace = THREE.SRGBColorSpace;
      wall.wrapS = wall.wrapT = THREE.MirroredRepeatWrapping;
      wall.anisotropy = 4;
      wall.needsUpdate = true;
      let compositeOk = true;
      // plaster/plasterB 用不同污渍种子，A 大与 B 洞墙面污渍分布互相错开
      for (const [material, tint, seed] of [[def.plaster.mat, 0xf2ede4, 9252], [def.plasterB.mat, 0xe9e3d9, 9257]]) {
        const oldMap = material.map, oldNormal = material.normalMap, oldRough = material.roughnessMap;
        // B1b：程序粗糙度图按旧程序 albedo 生成、与照片石缝错位——解挂并改标量基线
        material.roughnessMap = null;
        material.roughness = 0.9;
        oldRough?.dispose();
        let comp = null;
        try { comp = compositePhoto(wall.image, CS, { seed, bottom: 0.1 }); } catch { compositeOk = false; }
        if (comp) { // 三通道来自同一合成过程（颜色 + 污渍驱动粗糙度 + 亮度派生弱法线）
          material.map = comp.map;
          material.color.setHex(tint);
          material.normalMap = comp.normalMap;
          material.roughnessMap = comp.roughnessMap;
        } else { // 退回照片直贴（无法线，粗糙度用标量）
          material.map = wall;
          material.color.setHex(tint);
          material.normalMap = null;
        }
        material.needsUpdate = true;
        oldMap?.dispose(); oldNormal?.dispose();
      }
      if (compositeOk) wall.dispose(); // 照片已烘入合成画布，释放源图显存
    });
    new THREE.TextureLoader().load(groundTextureUrl, (ground) => {
      ground.colorSpace = THREE.SRGBColorSpace;
      ground.wrapS = ground.wrapT = THREE.MirroredRepeatWrapping;
      ground.anisotropy = 4;
      ground.needsUpdate = true;
      let compositeOk = true;
      // sand 保亮沙基调只叠轻污渍；sandPath 叠固定种子车辙/磨损带，减轻地面均匀感
      for (const [material, tint, seed, o] of [
        [def.sand.mat, 0xffffff, 9262, { roughMid: 0.97, roughVar: 0.06, roughLo: 0.94, edge: 0.04 }],
        [def.sandPath.mat, 0xe6ded2, 9267, { roughMid: 0.97, roughVar: 0.06, roughLo: 0.94, edge: 0.04, ruts: true }],
      ]) {
        const oldMap = material.map, oldNormal = material.normalMap, oldRough = material.roughnessMap;
        // B1b：同墙面处理——解挂错位程序粗糙度图并定标量基线
        material.roughnessMap = null;
        material.roughness = 0.85;
        oldRough?.dispose();
        let comp = null;
        try { comp = compositePhoto(ground.image, CS, { seed, ...o }); } catch { compositeOk = false; }
        if (comp) {
          material.map = comp.map;
          material.color.setHex(tint);
          material.normalMap = comp.normalMap;
          material.roughnessMap = comp.roughnessMap;
        } else { // 退回照片直贴
          material.map = ground;
          material.color.setHex(tint);
          material.normalMap = null;
        }
        material.needsUpdate = true;
        oldMap?.dispose(); oldNormal?.dispose();
      }
      if (compositeOk) ground.dispose(); // 照片已烘入合成画布，释放源图显存
    });
  }
  const paint = (t) => {
    const m = new THREE.MeshBasicMaterial({
      map: t, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    return m;
  };
  return {
    def, siteA: paint(siteTex('A', S)), siteB: paint(siteTex('B', S)),
    bridgeMark: paint(markerTex('B洞下层', S, 9190)),
    dropScuff: paint(dropScuffTex(S)),
    sillPaint: paint(sillPaintTex(S)),
  };
}
