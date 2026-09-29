// 性能路 B：特效逐帧分配与曳光生命周期回归（node --test，真实 Three math + 受控场景 stub）。
// 锁定：tracer 寿命必须完全退出（短/长轨迹）、存活矩阵与基线一致、多实例不串用、
// 无 NaN、粒子原位紧缩与透明度/尺寸语义、贴花矩阵语义；renderFrame 太阳方向复用不污染持久对象。
//
// 分配微基准（显式触发，不随 --test 运行）：
//   PERF_EFFECTS_BENCH=1 node tests/unit/perf-effects.test.mjs
// 把 three 核心类注入构造计数器，对比基线 c40d4bd 与当前 effects.js 在同一混合负载下的每帧构造次数。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// ---- 受控环境 stub：只覆盖 effects.js / game.js 触到的浏览器 API ----
const canvas2d = () => ({
  createLinearGradient: () => ({ addColorStop() {} }),
  fillRect() {},
  fillStyle: null,
  globalCompositeOperation: null,
});
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => canvas2d() }), querySelector: () => null };
globalThis.window = { innerHeight: 900, devicePixelRatio: 1 };

const { Effects } = await import('../../src/effects.js');

const flatTex = () => {
  const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
};
const TEX = { glow: flatTex(), puff: flatTex(), holeMetal: flatTex(), holeWood: flatTex(), blood: flatTex(), scorch: flatTex(), flash: [flatTex(), flatTex(), flatTex()] };

function makeFx() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
  return { fx: new Effects(scene, TEX, camera), scene, camera };
}

const TRACER_SPEED = 380;
const dtStep = 1 / 60;
// 从头跑到完全退出所需时间：头部越过末端再让尾部(7m)追过去
const exitTime = (len) => (len + 7) / TRACER_SPEED + 0.2;

function drain(fx, seconds, dt = dtStep) {
  for (let t = 0; t < seconds; t += dt) fx.update(dt, t, fx.camera || null, 0);
}

function mat16(fx, i = 0) {
  return fx.tracerMesh.instanceMatrix.array.slice(i * 16, i * 16 + 16);
}
function allFinite(fx, count) {
  for (let i = 0; i < count; i++) for (const v of mat16(fx, i)) assert.ok(Number.isFinite(v), `instanceMatrix[${i}] 出现非有限值`);
}

// ---- 曳光寿命 ----

test('长曳光在头部到端点、尾部越过末端后完全退出（数组与 draw count 归零）', () => {
  const { fx, camera } = makeFx();
  camera.position.set(50, 3, 0);
  fx.tracer(new THREE.Vector3(0, 1, 0), new THREE.Vector3(100, 1, 0));
  assert.equal(fx.tracers.length, 1);
  drain(fx, exitTime(100));
  assert.equal(fx.tracers.length, 0, '曳光数组应完全清空');
  assert.equal(fx.tracerMesh.count, 0, '渲染实例数应归零');
});

test('短曳光同样退出：寿命为 (len+7)/380 而非永久存活', () => {
  const { fx, camera } = makeFx();
  camera.position.set(0, 3, 20);
  fx.tracer(new THREE.Vector3(0, 1, 0), new THREE.Vector3(3, 1, 0));
  // 寿命内仍存活
  for (let t = 0; t < (3 + 7) / TRACER_SPEED - dtStep; t += dtStep) fx.update(dtStep, t, camera, 0);
  assert.equal(fx.tracers.length, 1, '寿命内应存活');
  fx.update(dtStep, 99, camera, 0);
  assert.equal(fx.tracers.length, 0, '超过寿命应退出');
  assert.equal(fx.tracerMesh.count, 0);
});

test('大帧跨度（一帧覆盖全寿命）无 NaN 且最终退出', () => {
  const { fx, camera } = makeFx();
  camera.position.set(50, 3, 10);
  fx.tracer(new THREE.Vector3(0, 1, 0), new THREE.Vector3(60, 1, 0));
  fx.update(2, 0, camera, 0);
  allFinite(fx, fx.tracerMesh.count);
  fx.update(2, 2, camera, 0);
  assert.equal(fx.tracers.length, 0);
  assert.equal(fx.tracerMesh.count, 0);
});

test('存活曳光的实例矩阵与解析基线一致：位置=可见段中点、x 轴=方向、尺度=可见长度', () => {
  const { fx, camera } = makeFx();
  camera.position.set(50, 3, 0);
  fx.tracer(new THREE.Vector3(0, 1, 0), new THREE.Vector3(100, 1, 0));
  const dt = 0.1; // head=38, tail=31, mid.x=34.5
  fx.update(dt, dt, camera, 0);
  assert.equal(fx.tracerMesh.count, 1);
  const m = mat16(fx);
  allFinite(fx, 1);
  // compose 列主序：0..2 = x 轴基（=dir×scaleX），12..14 = 平移
  assert.ok(Math.abs(m[1]) < 1e-5 && Math.abs(m[2]) < 1e-5, `x 轴基方向应等于 dir(1,0,0)，得 ${m[0]},${m[1]},${m[2]}`);
  assert.ok(Math.abs(m[12] - 34.5) < 1e-4, `中点 x 应为 34.5，得 ${m[12]}`);
  assert.ok(Math.abs(m[13] - 1) < 1e-4, `中点 y 应为 1，得 ${m[13]}`);
  assert.ok(m[3] === 0 && m[7] === 0 && m[11] === 0, '平移行应为 0');
  // 逐列模长即缩放：sx 应为可见长度 7
  const colLen = (i) => Math.hypot(m[i], m[i + 1], m[i + 2]);
  assert.ok(Math.abs(colLen(0) - 7) < 1e-4, `x 列模长应为可见长度 7，得 ${colLen(0)}`);
  const dist = Math.hypot(34.5 - 50, 1 - 3, 0);
  assert.ok(Math.abs(colLen(4) - (0.018 + dist * 0.0012)) < 1e-6, `y 列模长应为厚度基线，得 ${colLen(4)}`);
  assert.ok(Math.abs(colLen(8) - 1) < 1e-5, `z 列应保持单位长度，得 ${colLen(8)}`);
});

test('相机在射线正上/正后方（叉积退化）不产生 NaN，姿态退化为稳定垂直基', () => {
  for (const camPos of [[34.5, 1, 0], [-10, 1, 0], [110, 1, 0]]) {
    const { fx, camera } = makeFx();
    camera.position.set(...camPos);
    fx.tracer(new THREE.Vector3(0, 1, 0), new THREE.Vector3(100, 1, 0));
    fx.update(0.1, 0.1, camera, 0);
    assert.equal(fx.tracerMesh.count, 1);
    allFinite(fx, 1);
    const m = mat16(fx);
    const colLen = (i) => Math.hypot(m[i], m[i + 1], m[i + 2]);
    assert.ok(Math.abs(colLen(0) - 7) < 1e-4, `退化姿态下可见长度仍应为 7，得 ${colLen(0)}`);
    // 厚度列 = 单位 up × (0.018 + dist*0.0012)；dt=0.1 → mid=(34.5,1,0)
    const dist = Math.hypot(camPos[0] - 34.5, camPos[1] - 1, camPos[2]);
    assert.ok(Math.abs(colLen(4) - (0.018 + dist * 0.0012)) < 1e-6, `厚度列应保持基线，得 ${colLen(4)}`);
    assert.ok(Math.abs(colLen(8) - 1) < 1e-4, `法向列应单位化，得 ${colLen(8)}`);
  }
});

test('无效向量：起点终点重合的 tracer 不入队，也不产生 NaN', () => {
  const { fx, camera } = makeFx();
  camera.position.set(0, 3, 10);
  fx.tracer(new THREE.Vector3(5, 1, 0), new THREE.Vector3(5, 1, 0));
  fx.tracer(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0.5, 1, 0)); // L<2 同样拒绝
  assert.equal(fx.tracers.length, 0);
  fx.update(0.016, 0.016, camera, 0);
  assert.equal(fx.tracerMesh.count, 0);
});

test('超过 tracerMax 的同帧爆发：数组封顶 48，渲染数不越界', () => {
  const { fx, camera } = makeFx();
  camera.position.set(0, 3, 10);
  for (let i = 0; i < 60; i++) fx.tracer(new THREE.Vector3(i, 1, 0), new THREE.Vector3(i + 200, 1, 0));
  fx.update(dtStep, dtStep, camera, 0);
  assert.ok(fx.tracers.length <= fx.tracerMax, `数组应封顶 ${fx.tracerMax}，得 ${fx.tracers.length}`);
  assert.equal(fx.tracerMesh.count, fx.tracers.length);
  allFinite(fx, fx.tracerMesh.count);
});

test('两个 Effects 实例互不污染：各自 scratch 与曳光状态独立', () => {
  const a = makeFx(), b = makeFx();
  a.camera.position.set(50, 3, 0);
  b.camera.position.set(20, 5, 30);
  a.fx.tracer(new THREE.Vector3(0, 1, 0), new THREE.Vector3(100, 1, 0)); // len 100
  b.fx.tracer(new THREE.Vector3(0, 1, 0), new THREE.Vector3(10, 1, 0)); // len 10
  a.fx.update(0.1, 0.1, a.camera, 0);
  a.fx.update(0.1, 0.2, a.camera, 0);
  b.fx.update(0.01, 0.01, b.camera, 0);
  assert.equal(a.fx.tracers[0].t > 0.19, true);
  assert.ok(Math.abs(b.fx.tracers[0].t - 0.01) < 1e-9, 'b 实例的 t 不应被 a 的步进污染');
  assert.equal(b.fx.tracerMesh.count, 1);
  const mb = mat16(b.fx);
  const colLen = (i) => Math.hypot(mb[i], mb[i + 1], mb[i + 2]);
  // b 的可见段：head=min(10, 3.8)=3.8, tail=0 → 3.8
  assert.ok(Math.abs(colLen(0) - 3.8) < 1e-4, `b 实例可见长度应为 3.8，得 ${colLen(0)}`);
  allFinite(a.fx, a.fx.tracerMesh.count);
  allFinite(b.fx, b.fx.tracerMesh.count);
});

// ---- 粒子：原位紧缩与语义 ----

const puff = (o) => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, s0: 1, s1: 1, r: 1, g: 1, b: 1, a0: 1, a1: 1, grav: 0, drag: 0, ...o });

test('粒子退场后计数归零；存活粒子顺序稳定原位紧缩且属性按生命插值', () => {
  const { fx } = makeFx();
  const P = fx.add;
  P.emit(puff({ x: 1, max: 1, s0: 2, s1: 4, r: 1, a0: 1, a1: 0 })); // A
  P.emit(puff({ x: 2, max: 0.25 })); // B：0.25s 退场
  P.emit(puff({ x: 3, max: 1, r: 0.5 })); // C
  const posVer = P.geo.attributes.position.version;
  P.update(0.25);
  assert.ok(P.geo.attributes.position.version > posVer, '缓冲版本应递增（每帧 needsUpdate 语义保持）');
  assert.equal(P.p.length, 2, '退场粒子应被紧缩掉');
  assert.equal(P.geo.drawRange.count, 2);
  assert.ok(P.p[0].x === 1 && P.p[1].x === 3, '存活粒子相对顺序应保持 A 在前 C 在后');
  // 属性缓冲与插值语义：A 的 alpha = a0+(a1-a0)*t = 0.75，size = 2+(4-2)*0.25 = 2.5
  const alphas = Array.from(P.col).filter((_, i) => i % 4 === 3);
  assert.ok(Math.abs(alphas[0] - 0.75) < 1e-6, `A alpha 应为 0.75，得 ${alphas[0]}`);
  assert.ok(Math.abs(P.size[0] - 2.5) < 1e-6, `A size 应为 2.5，得 ${P.size[0]}`);
  // 全部到寿：计数与 drawRange 归零
  P.update(1);
  assert.equal(P.p.length, 0);
  assert.equal(P.geo.drawRange.count, 0);
});

test('粒子参数合法性：位移/重力/阻尼作用于存活粒子，死亡粒子不参与模拟', () => {
  const { fx } = makeFx();
  const P = fx.add;
  P.emit(puff({ x: 0, y: 10, vy: 0, grav: 10, drag: 0, max: 1 }));
  P.emit(puff({ x: 100, max: 0.05 }));
  P.update(0.1);
  assert.equal(P.p.length, 1);
  // 半隐式欧拉：vy = -grav*dt，y += vy*dt → y = 10 - grav*dt²
  assert.ok(Math.abs(P.p[0].y - 9.9) < 1e-9, `重力积分应为 9.9，得 ${P.p[0].y}`);
  assert.ok(P.p[0].x === 0, '死亡粒子的位置不应写入存活槽位');
});

// ---- 贴花：矩阵语义与环形覆盖（事件路径的临时分配去除不改变结果） ----

test('贴花实例矩阵：位置=命中点+法向偏移，+z 对齐法线，缩放=尺寸；超过 max 环形覆盖', () => {
  const { fx } = makeFx();
  const d = fx.decals.scorch; // max=12
  d.add({ x: 1, y: 2, z: 3 }, { x: 0, y: 0, z: 1 }, 0.5);
  assert.equal(d.mesh.count, 1);
  const m = new THREE.Matrix4();
  d.mesh.getMatrixAt(0, m);
  const pos = new THREE.Vector3(), q = new THREE.Quaternion(), scl = new THREE.Vector3();
  m.decompose(pos, q, scl);
  assert.ok(Math.abs(pos.x - 1) < 1e-6 && Math.abs(pos.y - 2) < 1e-6 && Math.abs(pos.z - 3.004) < 1e-6, `位置应含法向偏移，得 ${pos.toArray()}`);
  assert.ok(Math.abs(scl.x - 0.5) < 1e-6 && Math.abs(scl.z - 0.5) < 1e-6);
  const zOut = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  assert.ok(Math.abs(zOut.z - 1) < 1e-5, '旋转应把 +z 对齐法线（随机自旋绕 z 不改变 z 轴）');
  for (let i = 0; i < 14; i++) d.add({ x: i, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 0.3);
  assert.equal(d.mesh.count, 12, 'count 不应超过 max');
  allFiniteFallback(d.mesh);
});
function allFiniteFallback(mesh) {
  const arr = mesh.instanceMatrix.array;
  for (let i = 0; i < mesh.count * 16; i++) assert.ok(Number.isFinite(arr[i]));
}

// ---- game.js renderFrame：太阳方向/相机四元数复用临时对象，不修改持久对象 ----

test('renderFrame 太阳方向到相机空间：逐帧重算且不修改 env.sunDir / 相机四元数', async () => {
  globalThis.location = { search: '' };
  const { Game } = await import('../../src/game.js');
  const g = new Game();
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
  const sunDir = new THREE.Vector3(0.5, 0.8, -0.3).normalize();
  const captured = [];
  g.renderer = {
    camera,
    fx: { uniforms: { uTime: { value: 0 }, uDamage: { value: 0 }, uLowHP: { value: 0 }, uDeath: { value: 0 }, uProtect: { value: 0 }, uVignette: { value: 0 } } },
    vmScene: { environmentIntensity: 0 },
    render() {},
  };
  g.env = { sunDir, shipSpeed: 0, update() {} };
  g.map = {};
  g.fx = { update() {} };
  g.vm = { setVisible() {}, update(_dt, st) { captured.push({ sun: st.sunDirCam.clone() }); } };
  g.world = { raycast: () => null };
  g.hud = { update() {}, drawRadar() {}, scoreboard() {}, toast() {}, slots() {}, saveOpts() {} };
  g.player = {
    alive: true, hp: 100, armor: 0, team: 'BL', speed: 0, onGround: true, crouch: false, scoped: false,
    lookDX: 0, lookDY: 0, yaw: 0, pos: new THREE.Vector3(), keys: new Set(),
    weapon: { def: { type: 'pistol' } },
    eye: (out) => out.set(0, 1.6, 0),
  };
  g.playing = true; g.ended = false; g.realTime = 1; g.time = 5; g.timeLeft = 60; g.mode = { name: 't' }; g.goal = 0;
  const s0 = sunDir.clone();

  // 两帧不同相机朝向：临时对象必须逐帧重算，而非复用上一帧结果
  camera.quaternion.setFromEuler(new THREE.Euler(0.2, 0.5, 0));
  g.renderFrame(0.016);
  camera.quaternion.setFromEuler(new THREE.Euler(-0.3, -1.1, 0));
  g.renderFrame(0.016);

  const inv = new THREE.Quaternion();
  const expect = (euler) => {
    camera.quaternion.setFromEuler(euler);
    return sunDir.clone().applyQuaternion(inv.copy(camera.quaternion).invert());
  };
  const e1 = expect(new THREE.Euler(0.2, 0.5, 0));
  const e2 = expect(new THREE.Euler(-0.3, -1.1, 0));
  assert.equal(captured.length, 2);
  assert.ok(captured[0].sun.distanceTo(e1) < 1e-9, `第 1 帧太阳方向应与解析值一致：${captured[0].sun.toArray()} vs ${e1.toArray()}`);
  assert.ok(captured[1].sun.distanceTo(e2) < 1e-9, `第 2 帧应重算而非复用旧值：${captured[1].sun.toArray()} vs ${e2.toArray()}`);
  assert.ok(sunDir.distanceTo(s0) < 1e-12, 'env.sunDir 不得被修改');
  // 相机四元数只被测试自己改动，renderFrame 不得写入
  const s2 = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.3, -1.1, 0));
  assert.ok(camera.quaternion.equals(s2), '相机四元数不得被 renderFrame 修改');
});

// ================= 分配微基准（node tests/unit/perf-effects.test.mjs 直跑；--test 下不执行） =================
// 方法：把 three 核心类（Vector3/Matrix4/Quaternion）复制一份并注入构造计数器，再把基线/当前两版
// effects.js 重定向到该副本，统计同一混合负载下每帧真实构造次数。比堆采样更能反映短命对象。
import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const isDirectRun = process.env.PERF_EFFECTS_BENCH === '1' && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const BASELINE_COMMIT = 'c40d4bd';
  const PKG = new URL('../../', import.meta.url).pathname; // cf-transport-ship/
  const rel = (f) => new URL('../../' + f, import.meta.url).pathname;
  const FRAMES = 3000;
  const CLASSES = ['Vector3', 'Matrix4', 'Quaternion'];
  const tmpFiles = ['.bench-three.mjs', '.bench-three-core.mjs', '.bench-effects-base.js', '.bench-effects-cur.js'].map(rel);

  try {
    // 1) 复制 three 核心模块并注入构造计数（计数语句本身零分配）
    const corePath = rel('node_modules/three/build/three.core.js');
    let core = readFileSync(corePath, 'utf8');
    core = 'const __COUNT = (globalThis.__benchAlloc = globalThis.__benchAlloc || { Vector3: 0, Matrix4: 0, Quaternion: 0 });\n' + core;
    for (const cls of CLASSES) {
      const at = core.indexOf('class ' + cls + ' {');
      assert.ok(at > 0, 'three.core.js 中找不到 ' + cls);
      const ctor = core.indexOf('constructor(', at);
      const brace = core.indexOf('{', ctor);
      core = core.slice(0, brace + 1) + '\n\t__COUNT.' + cls + ' = (__COUNT.' + cls + '|0) + 1;' + core.slice(brace + 1);
    }
    writeFileSync(tmpFiles[1], core);
    // 2) module 入口重定向到计数版核心
    const mod = readFileSync(rel('node_modules/three/build/three.module.js'), 'utf8').replaceAll("'./three.core.js'", "'./.bench-three-core.mjs'");
    writeFileSync(tmpFiles[0], mod);
    // 3) 两版 effects 重定向到计数 three；基线从基线提交提取
    const curSrc = readFileSync(rel('src/effects.js'), 'utf8').replace("from 'three'", "from './.bench-three.mjs'");
    writeFileSync(tmpFiles[3], curSrc);
    const baseSrc = execFileSync('git', ['show', BASELINE_COMMIT + ':cf-transport-ship/src/effects.js'], { cwd: PKG, encoding: 'utf8' })
      .replace("from 'three'", "from './.bench-three.mjs'");
    writeFileSync(tmpFiles[2], baseSrc);

    const workload = async (moduleUrl) => {
      const { Effects } = await import(moduleUrl);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
      camera.position.set(30, 5, 25);
      const fx = new Effects(scene, TEX, camera);
      const from = new THREE.Vector3(), to = new THREE.Vector3();
      const pt = { x: 0, y: 0, z: 0 }, nrm = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(1, 0, 0);
      const frame = (i) => {
        if (i % 4 === 0) { from.set((i % 40) * 2, 1, 0); to.copy(from).setX(from.x + 120); fx.tracer(from, to); }
        if (i % 3 === 0) fx.impact(pt, nrm, 'metal', dir);
        if (i % 30 === 0) fx.muzzle(pt, dir, 1);
        camera.position.x = 30 + Math.sin(i / 50) * 10;
        fx.update(1 / 60, i / 60, camera, 0);
      };
      for (let i = 0; i < 200; i++) frame(i); // 预热 JIT + tracer 池进入稳态
      const C = globalThis.__benchAlloc;
      for (const k of CLASSES) C[k] = 0;
      for (let i = 0; i < FRAMES; i++) frame(i);
      return { ...C };
    };

    const base = await workload(pathToFileURL(tmpFiles[2]).href);
    const cur = await workload(pathToFileURL(tmpFiles[3]).href);
    console.log('[bench] 每帧构造次数（' + FRAMES + ' 帧混合负载，含 tracer/命中/枪口事件）：');
    console.log('[bench] 基线 ' + BASELINE_COMMIT + ':', JSON.stringify(base), '合计', (base.Vector3 + base.Matrix4 + base.Quaternion) / FRAMES, '/帧');
    console.log('[bench] 当前版     :', JSON.stringify(cur), '合计', (cur.Vector3 + cur.Matrix4 + cur.Quaternion) / FRAMES, '/帧');
  } finally {
    for (const f of tmpFiles) { try { unlinkSync(f); } catch {} }
  }
}
