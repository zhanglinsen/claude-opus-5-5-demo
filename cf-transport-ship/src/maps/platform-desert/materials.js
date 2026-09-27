// 赤霞集市（平台原创沙漠图）材质：程序化 Canvas 漫反射 + 法线 + 粗糙度贴图组。
// 与沙漠灰的材质表完全独立（无共享纹理资产/照片合成），走「红沙 + 赭红土坯 + 暗渠湿石」的
// 原创配色；全部离线自包含（无网络资源）。uv 为「每块纹理覆盖的米数」，构建器按面尺寸平铺。
// 画质分档：low=128px 且无贴图；medium=256px；high=512px。种子固定在 93xx 段，截图可复现。
import * as THREE from 'three';
import { mulberry32, fbm, normalFromHeight } from '../../textures.js';

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
// 三通道输出：albedo canvas + 高度场→法线 + 粗糙度场→灰度图
function finish(c, hgt, rough, S, useNormal) {
  const out = { map: tex(c) };
  if (useNormal) out.normalMap = tex(normalFromHeight(hgt, S, S, 2.0), { srgb: false });
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

// ---------- 红沙地：风蚀波纹 + 碎石 + 赤铁矿染色斑（区别于沙漠灰的浅金沙） ----------
function sandRed(S, useNormal) {
  const seed = 9301;
  const c = mkCanvas(S), ctx = c.getContext('2d');
  const n1 = fbm(S, S, 4, 4, 5, seed), n2 = fbm(S, S, 16, 16, 3, seed + 1);
  const img = ctx.createImageData(S, S), d = img.data;
  const hgt = new Float32Array(S * S), rough = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, v = n1[i], f = n2[i];
    const rip = Math.sin((x / S) * Math.PI * 5 + v * 6) * 0.5 + 0.5;
    // 赤沙基色（约 #b06a48），波纹处提亮、色斑处加深
    const k = 0.78 + v * 0.3 + rip * 0.12;
    d[i * 4] = Math.min(255, 205 * k + f * 22);
    d[i * 4 + 1] = Math.min(255, 122 * k + f * 14);
    d[i * 4 + 2] = Math.min(255, 84 * k + f * 10);
    d[i * 4 + 3] = 255;
    hgt[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.45 + d[i * 4 + 2] * 0.25) / 255;
    rough[i] = 0.94 + f * 0.05;
  }
  ctx.putImageData(img, 0, 0);
  const rnd = mulberry32(seed + 2);
  for (let i = 0; i < 90; i++) { // 深色砾石
    const x = rnd() * S, y = rnd() * S, r = 0.6 + rnd() * 1.8;
    ctx.fillStyle = `rgba(58,34,24,${0.25 + rnd() * 0.3})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    hgt[(y | 0) * S + (x | 0)] += 0.05;
  }
  return finish(c, hgt, rough, S, useNormal);
}

// ---------- 土坯墙：水平坯行 + 竖缝 + 表面剥落（赭红/赭黄两版） ----------
function adobe(S, useNormal, base = [186, 122, 86], mortar = [142, 92, 64], seed = 9310, rows = 5) {
  const c = mkCanvas(S), ctx = c.getContext('2d');
  ctx.fillStyle = `rgb(${mortar[0]},${mortar[1]},${mortar[2]})`;
  ctx.fillRect(0, 0, S, S);
  const rh = S / rows, rnd = mulberry32(seed);
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * S * 0.09;
    for (let bx = -1; bx < 4; bx++) {
      const bw = S / 3.2;
      const x = bx * bw + off, y = r * rh;
      const t = 0.86 + rnd() * 0.24;
      ctx.fillStyle = `rgb(${Math.min(255, base[0] * t)},${Math.min(255, base[1] * t)},${Math.min(255, base[2] * t)})`;
      ctx.fillRect(x + 1.5, y + 1.5, bw - 3, rh - 3);
    }
  }
  const n = fbm(S, S, 9, 9, 3, seed + 1);
  const img = ctx.getImageData(0, 0, S, S), d = img.data;
  const hgt = new Float32Array(S * S), rough = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) {
    const i4 = i * 4, f = n[i];
    d[i4] *= 1 - f * 0.14; d[i4 + 1] *= 1 - f * 0.12; d[i4 + 2] *= 1 - f * 0.1;
    hgt[i] = (d[i4] * 0.3 + d[i4 + 1] * 0.45 + d[i4 + 2] * 0.25) / 255;
    rough[i] = 0.9 + f * 0.08;
  }
  ctx.putImageData(img, 0, 0);
  return finish(c, hgt, rough, S, useNormal);
}

// ---------- 规整石作（渠沿/门拱/喷泉：大块浅缝，暖灰带赤色包浆） ----------
function stoneTrim(S, useNormal, o = {}) {
  const rows = o.rows ?? 4, tone = o.tone ?? 168, seed = o.seed ?? 9320;
  const c = mkCanvas(S), ctx = c.getContext('2d');
  ctx.fillStyle = 'rgb(126,110,98)';
  ctx.fillRect(0, 0, S, S);
  const rh = S / rows, rnd = mulberry32(seed);
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * S * 0.07;
    for (let bx = -1; bx < 3; bx++) {
      const bw = S / 2.4, x = bx * bw + off, y = r * rh;
      const t = 0.9 + rnd() * 0.2;
      ctx.fillStyle = `rgb(${tone * t},${tone * 0.93 * t},${tone * 0.84 * t})`;
      ctx.fillRect(x + 2, y + 2, bw - 4, rh - 4);
    }
  }
  const n = fbm(S, S, 7, 7, 3, seed + 1);
  const img = ctx.getImageData(0, 0, S, S), d = img.data;
  const hgt = new Float32Array(S * S), rough = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) {
    const i4 = i * 4, f = n[i];
    d[i4] *= 1 - f * 0.12; d[i4 + 1] *= 1 - f * 0.12; d[i4 + 2] *= 1 - f * 0.12;
    hgt[i] = (d[i4] * 0.3 + d[i4 + 1] * 0.45 + d[i4 + 2] * 0.25) / 255;
    rough[i] = 0.86 + f * 0.08;
  }
  ctx.putImageData(img, 0, 0);
  return finish(c, hgt, rough, S, useNormal);
}

// ---------- 暗渠湿石：深青灰石板 + 暗红水渍线（渠底/渠帮，潮湿低粗糙度） ----------
function canalStone(S, useNormal) {
  const seed = 9330;
  const c = mkCanvas(S), ctx = c.getContext('2d');
  ctx.fillStyle = 'rgb(72,70,68)';
  ctx.fillRect(0, 0, S, S);
  const rnd = mulberry32(seed), rows = 6, rh = S / rows;
  for (let r = 0; r < rows; r++) {
    for (let bx = -1; bx < 4; bx++) {
      const bw = S / 3.6, x = bx * bw + (r % 2) * S * 0.08, y = r * rh;
      const t = 0.82 + rnd() * 0.36;
      ctx.fillStyle = `rgb(${78 * t},${80 * t},${82 * t})`;
      ctx.fillRect(x + 1, y + 1, bw - 2, rh - 2);
    }
  }
  // 竖向水渍：暗赤色矿物沉积自上而下拖尾
  for (let i = 0; i < 26; i++) {
    const x = rnd() * S, w = 1.5 + rnd() * 3, h = S * (0.2 + rnd() * 0.6);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(122,52,38,0.34)');
    g.addColorStop(1, 'rgba(122,52,38,0.05)');
    ctx.fillStyle = g;
    ctx.save(); ctx.translate(x, rnd() * S * 0.5); ctx.fillRect(0, 0, w, h); ctx.restore();
  }
  const n = fbm(S, S, 8, 8, 3, seed + 1);
  const img = ctx.getImageData(0, 0, S, S), d = img.data;
  const hgt = new Float32Array(S * S), rough = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) {
    const i4 = i * 4, f = n[i];
    hgt[i] = (d[i4] * 0.3 + d[i4 + 1] * 0.45 + d[i4 + 2] * 0.25) / 255;
    rough[i] = 0.62 + f * 0.2; // 潮湿面更光滑
  }
  return finish(c, hgt, rough, S, useNormal);
}

// ---------- 深色木（货摊/货箱/棚栈坡道：炭化木纹） ----------
function woodDark(S, useNormal) {
  const seed = 9340;
  const c = mkCanvas(S), ctx = c.getContext('2d');
  const n1 = fbm(S, S, 2, 14, 4, seed);
  const img = ctx.createImageData(S, S), d = img.data;
  const hgt = new Float32Array(S * S), rough = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, i4 = i * 4, v = n1[i];
    const grain = Math.sin((x / S) * Math.PI * 24 + v * 9) * 0.5 + 0.5;
    const k = 0.6 + grain * 0.25 + v * 0.2;
    d[i4] = 74 * k; d[i4 + 1] = 52 * k; d[i4 + 2] = 36 * k; d[i4 + 3] = 255;
    hgt[i] = grain * 0.6 + v * 0.4;
    rough[i] = 0.9;
  }
  ctx.putImageData(img, 0, 0);
  return finish(c, hgt, rough, S, useNormal);
}

// ---------- 混凝土（台体/桥面：平整灰面 + 收缩裂纹） ----------
function concrete(S, useNormal) {
  const seed = 9350;
  const c = mkCanvas(S), ctx = c.getContext('2d');
  const n1 = fbm(S, S, 6, 6, 4, seed), n2 = fbm(S, S, 20, 20, 2, seed + 1);
  const img = ctx.createImageData(S, S), d = img.data;
  const hgt = new Float32Array(S * S), rough = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) {
    const i4 = i * 4, v = n1[i], f = n2[i];
    const k = 0.86 + v * 0.2 + (f - 0.5) * 0.08;
    d[i4] = 152 * k; d[i4 + 1] = 146 * k; d[i4 + 2] = 138 * k; d[i4 + 3] = 255;
    hgt[i] = v;
    rough[i] = 0.88 + f * 0.08;
  }
  ctx.putImageData(img, 0, 0);
  const rnd = mulberry32(seed + 2);
  ctx.strokeStyle = 'rgba(70,66,60,0.5)'; // 收缩裂纹
  for (let i = 0; i < 5; i++) {
    ctx.lineWidth = 1 + rnd();
    ctx.beginPath();
    let x = rnd() * S, y = rnd() * S;
    ctx.moveTo(x, y);
    for (let s = 0; s < 5; s++) { x += (rnd() - 0.5) * S * 0.3; y += (rnd() - 0.5) * S * 0.3; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  return finish(c, hgt, rough, S, useNormal);
}

// ---------- 苇席/陶瓦屋顶条（檐口盖板，区别于沙漠灰的 roofTile 配色） ----------
function roofTile(S, useNormal) {
  const seed = 9360;
  const c = mkCanvas(S), ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S), d = img.data;
  const hgt = new Float32Array(S * S), rough = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, i4 = i * 4;
    const row = Math.sin((y / S) * Math.PI * 8) * 0.5 + 0.5;
    const k = 0.7 + row * 0.35;
    d[i4] = 172 * k; d[i4 + 1] = 108 * k; d[i4 + 2] = 62 * k; d[i4 + 3] = 255;
    hgt[i] = row;
    rough[i] = 0.92;
  }
  ctx.putImageData(img, 0, 0);
  const rnd = mulberry32(seed);
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(96,58,30,${0.1 + rnd() * 0.2})`;
    ctx.fillRect(rnd() * S, rnd() * S, 2 + rnd() * 4, 1 + rnd() * 2);
  }
  return finish(c, hgt, rough, S, useNormal);
}

// ---------- 包点喷漆：赤色喷圈 + 双语地名（siteTex('A','粮仓高台')） ----------
function siteTex(site, label, S) {
  const c = mkCanvas(S), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(178,44,32,0.9)';
  ctx.lineWidth = S * 0.045;
  ctx.beginPath(); ctx.arc(S / 2, S * 0.44, S * 0.32, 0, Math.PI * 2); ctx.stroke();
  ctx.font = `bold ${S * 0.34}px sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(178,44,32,0.95)';
  ctx.fillText(site, S / 2, S * 0.44);
  ctx.font = `bold ${S * 0.11}px sans-serif`;
  ctx.fillStyle = 'rgba(40,24,16,0.85)';
  ctx.fillText(label, S / 2, S * 0.82);
  const rnd = mulberry32(9370 + site.charCodeAt(0));
  for (let i = 0; i < 420; i++) ctx.clearRect(rnd() * S, rnd() * S, 2 + rnd() * 3, 2 + rnd() * 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- 暗渠通行标识：向下台阶箭头 + 「赤水暗渠」（箭头朝纹理上方 = 世界 -Z/北） ----------
function canalMarkTex(S) {
  const c = mkCanvas(S), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = 'rgba(206,180,120,0.92)';
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
  ctx.font = `bold ${S * 0.13}px sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('赤水暗渠', S / 2, S * 0.62);
  const rnd = mulberry32(9380);
  for (let i = 0; i < 380; i++) ctx.clearRect(rnd() * S, rnd() * S, 2 + rnd() * 3, 2 + rnd() * 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// uv = 每块纹理覆盖米数；构建器以面尺寸/uv 平铺
export function createPlatformDesertMaterials(opts = {}) {
  const q = opts.quality || 'medium';
  const S = q === 'low' ? 128 : q === 'high' ? 512 : 256;
  const useNormal = q !== 'low';
  const std = (p, { rough = 1, normalScale = 1, extra = {} } = {}) => new THREE.MeshStandardMaterial({
    map: p.map,
    roughnessMap: p.roughnessMap || null,
    normalMap: p.normalMap || null,
    normalScale: new THREE.Vector2(normalScale, normalScale),
    roughness: rough, metalness: 0.02,
    ...extra,
  });
  const def = {
    sandRed: { mat: std(sandRed(S, useNormal), { normalScale: 0.5 }), uv: 3.2 },
    adobe: { mat: std(adobe(S, useNormal), { normalScale: 0.6 }), uv: 3 },
    plaster: { mat: std(adobe(S, useNormal, [214, 176, 134], [168, 132, 96], 9312, 6), { normalScale: 0.5 }), uv: 3 },
    stoneTrim: { mat: std(stoneTrim(S, useNormal), { normalScale: 0.8 }), uv: 2.4 },
    canalStone: { mat: std(canalStone(S, useNormal), { rough: 0.85, normalScale: 0.75 }), uv: 2.6 },
    concrete: { mat: std(concrete(S, useNormal), { normalScale: 0.7 }), uv: 2.2 },
    woodDark: { mat: std(woodDark(S, useNormal), { normalScale: 0.7 }), uv: 1.6 },
    roofTile: { mat: std(roofTile(S, useNormal), { normalScale: 0.8 }), uv: 2.4 },
    lamp: { mat: new THREE.MeshStandardMaterial({ color: 0xffe9c4, emissive: 0xffc873, emissiveIntensity: 3.0, roughness: 0.4 }), uv: 1 },
  };
  const paint = (t) => new THREE.MeshBasicMaterial({
    map: t, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  return {
    def,
    siteA: paint(siteTex('A', '粮仓高台', S)),
    siteB: paint(siteTex('B', '驼队市场', S)),
    canalMark: paint(canalMarkTex(S)),
  };
}
