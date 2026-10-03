// 曳光弹公共行为测试（node --test，真实 Effects + 真实 three）。
// 只通过公共场景渲染面观察：向场景添加的 InstancedMesh 绘制数量与实例矩阵，
// 不读私有 tracers 数组，不 mock 粒子内部。
// 说明：贴图在构造时才访问 canvas，测试先装 DOM stub 再动态导入 src 模块。
const document = globalThis.document = {
  createElement(tag) {
    if (tag !== 'canvas') return {};
    const canvas = { width: 0, height: 0 };
    const grad = { addColorStop() {} };
    const ctx = new Proxy({}, {
      get(t, k) {
        if (k === 'canvas') return canvas;
        if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
        return () => {};
      },
      set(t, k, v) { t[k] = v; return true; },
    });
    canvas.getContext = () => ctx;
    return canvas;
  },
};
globalThis.window = { innerHeight: 900, devicePixelRatio: 1 };

const { test } = await import('node:test');
const assert = (await import('node:assert/strict')).default;
const THREE = await import('three');
const { Effects } = await import('../../src/effects.js');

function makeTex() { return new THREE.CanvasTexture(document.createElement('canvas')); }
const T = {
  glow: makeTex(), puff: makeTex(), holeMetal: makeTex(), holeWood: makeTex(),
  blood: makeTex(), scorch: makeTex(), flash: [makeTex(), makeTex(), makeTex()],
};
const v = (x, y, z) => new THREE.Vector3(x, y, z);

function makeFx({ camPos = [5, 3, 0] } = {}) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, 1.6, 0.1, 500);
  camera.position.set(...camPos);
  const fx = new Effects(scene, T, camera);
  return { scene, camera, fx };
}

// 场景内实际进入绘制流程的实例总数（公共场景图遍历，不引用私有字段）
function drawnInstances(scene) {
  let n = 0;
  scene.traverse((o) => { if (o.isInstancedMesh) n += o.count; });
  return n;
}

test('曳光弹飞行中可见，飞过命中点后不再绘制（及时消亡）', () => {
  const { scene, camera, fx } = makeFx();
  fx.tracer(v(0, 1, 40), v(0, 1, -40)); // 80m，约 0.21s 飞行 + 尾迹
  fx.update(0.05, 0, camera, 0);
  assert.ok(drawnInstances(scene) >= 1, '飞行中应绘制曳光实例');
  fx.update(0.3, 0, camera, 0); // 一大步跨过命中点与尾迹消散
  assert.equal(drawnInstances(scene), 0, '越过命中点后曳光应消亡，不再绘制');
});

// 取场景中曳光实例的世界矩阵（公共 InstancedMesh API）
function firstTracerMatrix(scene) {
  const m = new THREE.Matrix4();
  scene.traverse((o) => { if (o.isInstancedMesh && o.count > 0) o.getMatrixAt(0, m); });
  return m;
}

test('曳光面板法线朝向摄像机（正面可见，不被背面剔除）', () => {
  const { scene, camera, fx } = makeFx({ camPos: [5, 3, 0] });
  fx.tracer(v(0, 1, 40), v(0, 1, -40));
  fx.update(0.05, 0, camera, 0);
  const m = firstTracerMatrix(scene);
  const pos = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  m.decompose(pos, q, s);
  // PlaneGeometry 面片法线是局部 +Z；z 缩放为 1，矩阵第三列即世界法线
  const nrm = new THREE.Vector3(m.elements[8], m.elements[9], m.elements[10]).normalize();
  const toCam = camera.position.clone().sub(pos);
  const facing = nrm.dot(toCam);
  assert.ok(facing > 0, `面片法线应朝向摄像机（dot=${facing.toFixed(4)}），否则 FrontSide 被背面剔除`);
});

// 共线几何探针：摄像机严格在弹道轴线上。
// 矩阵有限还不够——退化基会 silently 扭曲几何，须断言真实 PlaneGeometry 顶点
// 经实例矩阵变换后的世界几何：纵向平行弹道且长 3.8（speed380×dt0.01），横向有正宽度。
function tracerQuadWorldVerts(scene) {
  let mesh;
  scene.traverse((o) => { if (!mesh && o.isInstancedMesh && o.count > 0) mesh = o; });
  assert.ok(mesh, '场景中应有进入绘制流程的曳光实例');
  const m = new THREE.Matrix4();
  mesh.getMatrixAt(0, m);
  mesh.updateWorldMatrix(true, false);
  m.premultiply(mesh.matrixWorld);
  const attr = mesh.geometry.getAttribute('position');
  const p = new THREE.Vector3();
  const verts = [];
  for (let i = 0; i < attr.count; i++) verts.push(p.fromBufferAttribute(attr, i).clone().applyMatrix4(m));
  return verts;
}

// 顶点到弹道轴线的最大横向距离（面片应有正的横向宽度，而非零宽线）
function maxRadialFromBeam(verts, dir, mid) {
  let r = 0;
  const rel = new THREE.Vector3();
  for (const p of verts) {
    rel.copy(p).sub(mid);
    rel.addScaledVector(dir, -rel.dot(dir));
    r = Math.max(r, rel.length());
  }
  return r;
}

for (const [name, from, to] of [
  ['-Z 弹道', v(0, 0, -1), v(0, 0, -20)],
  ['旋转 +X 弹道', v(-1, 0, 0), v(20, 0, 0)],
  ['垂直 -Y 弹道', v(0, -1, 0), v(0, -20, 0)],
]) {
  test(`摄像机与弹道严格共线（${name}）：线段长 3.8、平行弹道、有正横向宽度`, () => {
    const { scene, camera, fx } = makeFx({ camPos: [0, 0, 0] }); // 摄像机在弹道轴线上
    fx.tracer(from, to);
    fx.update(0.01, 0, camera, 0);
    assert.ok(drawnInstances(scene) >= 1, '共线视角下曳光仍应绘制');
    const m = firstTracerMatrix(scene);
    assert.ok(m.elements.every(Number.isFinite), '实例矩阵应全部有限');
    const dir = to.clone().sub(from).normalize();
    const verts = tracerQuadWorldVerts(scene);
    const longEdge = verts[1].clone().sub(verts[0]);
    const longLen = longEdge.length();
    assert.ok(Math.abs(longLen - 3.8) < 0.01, `实际纵向边长应≈3.8（380×0.01），实际 ${longLen.toFixed(4)}`);
    const alignment = longEdge.normalize().dot(dir);
    assert.ok(alignment > 1 - 1e-6, `实际纵向边应平行 from→to，方向点积 ${alignment.toFixed(6)}`);
    const pos = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    m.decompose(pos, q, s);
    const radial = maxRadialFromBeam(verts, dir, pos);
    assert.ok(radial > 1e-3, `应有正的横向宽度（不得压成零宽线），实际 ${radial.toFixed(5)}`);
  });
}

test('命中端裁剪：曳光头部不越过命中点（到点即停，不穿墙）', () => {
  const { scene, camera, fx } = makeFx({ camPos: [5, 3, 0] });
  fx.tracer(v(0, 1, 0), v(0, 1, 10)); // 10m，飞行约 0.026s
  fx.update(0.035, 0, camera, 0); // 头部未裁剪会冲到 13.3m，已过命中点但尾迹仍在消散
  const verts = tracerQuadWorldVerts(scene);
  const farEnd = Math.max(...verts.map((p) => p.z));
  const nearEnd = Math.min(...verts.map((p) => p.z));
  assert.ok(farEnd <= 10.001, `实际曳光顶点最远 z=${farEnd.toFixed(3)} 不应越过命中点 z=10`);
  assert.ok(Math.abs(farEnd - 10) < 0.001, `实际曳光头部应到达命中点 z=10，实际 ${farEnd.toFixed(3)}`);
  assert.ok(nearEnd >= -0.001, `实际曳光顶点最近 z=${nearEnd.toFixed(3)} 不应越过起点 z=0`);
});

test('过短弹道（<2m）不生成曳光', () => {
  const { scene, camera, fx } = makeFx();
  fx.tracer(v(0, 1, 0), v(1.5, 1, 0));
  fx.update(0.01, 0, camera, 0);
  assert.equal(drawnInstances(scene), 0);
});

test('实例池上限 48：同帧大量曳光不突破池容量', () => {
  const { scene, camera, fx } = makeFx();
  for (let i = 0; i < 60; i++) fx.tracer(v(i * 3, 1, 0), v(i * 3, 1, 50));
  fx.update(0.01, 0, camera, 0);
  assert.equal(drawnInstances(scene), 48);
});

test('单帧大步长（dt 跨过整个生命周期）直接消亡，不残留实例', () => {
  const { scene, camera, fx } = makeFx();
  fx.tracer(v(0, 1, 40), v(0, 1, -40));
  fx.update(2, 0, camera, 0);
  assert.equal(drawnInstances(scene), 0);
});

test('远距离长弹道（400m）全程可见后才消亡', () => {
  const { scene, camera, fx } = makeFx({ camPos: [8, 6, 0] });
  fx.tracer(v(0, 5, -200), v(0, 5, 200)); // 飞行约 1.05s + 尾迹
  fx.update(0.5, 0, camera, 0);
  assert.ok(drawnInstances(scene) >= 1, '中段飞行应可见');
  fx.update(0.7, 0, camera, 0);
  assert.equal(drawnInstances(scene), 0, '全程飞完后应消亡');
});
