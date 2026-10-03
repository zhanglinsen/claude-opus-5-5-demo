import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ViewModel } from '../../src/viewmodel.js';
import { WEAPONS } from '../../src/weapons.js';

// Canvas 是 Node 不具备的系统边界；枪模型、材质、场景、动画与装配均使用真实代码。
globalThis.document = {
  createElement(tag) {
    assert.equal(tag, 'canvas');
    return {
      width: 0, height: 0,
      getContext() {
        return {
          createImageData(width, height) {
            return { width, height, data: new Uint8ClampedArray(width * height * 4) };
          },
          putImageData() {},
        };
      },
    };
  },
};

const textures = {
  flash: [new THREE.Texture(), new THREE.Texture(), new THREE.Texture()],
  flashSide: new THREE.Texture(),
};
const idle = { speed: 0, onGround: true, crouch: false, lookDX: 0, lookDY: 0, light: 1, indoor: false };

function freshViewModel() {
  const scene = new THREE.Scene();
  const vm = new ViewModel(scene, textures, 'BL');
  return { scene, vm };
}

function runFor(vm, seconds, dt) {
  const step = dt || 1 / 60;
  let elapsed = 0;
  while (elapsed + step <= seconds + 1e-9) { vm.update(step, idle); elapsed += step; }
  const rem = seconds - elapsed;
  if (rem > 1e-9) { vm.update(rem, idle); elapsed += rem; }
  return elapsed;
}

function equipAndSettle(vm, id, drawTime) {
  vm.equip(id, drawTime);
  runFor(vm, (drawTime || 0.5) + 0.25);
}

function partSnapshot(scene, name) {
  const part = scene.getObjectByName(name);
  assert.ok(part, '场景中应存在真实部件 ' + name);
  return {
    position: part.position.clone(),
    quaternion: part.quaternion.clone(),
    visible: part.visible,
  };
}

function partVertexWorld(scene, name) {
  const part = scene.getObjectByName(name);
  let mesh = null;
  part.traverse((o) => { if (!mesh && o.isMesh) mesh = o; });
  assert.ok(mesh && mesh.geometry.getAttribute('position'), name + ' 下应有真实可绘制顶点');
  scene.updateMatrixWorld(true);
  return new THREE.Vector3()
    .fromBufferAttribute(mesh.geometry.getAttribute('position'), 0)
    .applyMatrix4(mesh.matrixWorld);
}

test('AK 装弹 36% 时切到手枪再切回，弹匣必须回到原始静止位姿、可见且几何不变', (t) => {
  const scenevm = freshViewModel();
  const scene = scenevm.scene, vm = scenevm.vm;
  equipAndSettle(vm, 'ak47', WEAPONS.ak47.draw);
  const rest = partSnapshot(scene, 'mag');
  const restVertex = partVertexWorld(scene, 'mag');

  vm.reload(WEAPONS.ak47.reload, false);
  runFor(vm, 0.36 * WEAPONS.ak47.reload); // 生产触发点：装弹约 36% 时被打断
  const driftDuringReload = scene.getObjectByName('mag').position.distanceTo(rest.position);
  t.diagnostic(JSON.stringify({ driftDuringReload }));

  equipAndSettle(vm, 'deagle', WEAPONS.deagle.draw);
  equipAndSettle(vm, 'ak47', WEAPONS.ak47.draw);

  const mag = scene.getObjectByName('mag');
  const drift = mag.position.distanceTo(rest.position);
  const rotDrift = mag.quaternion.angleTo(rest.quaternion);
  const vertexDrift = partVertexWorld(scene, 'mag').distanceTo(restVertex);
  t.diagnostic(JSON.stringify({ drift, rotDrift, vertexDrift, visible: mag.visible }));

  assert.ok(drift < 1e-6, '切回后弹匣应回到原始静止位置，残余 ' + drift + 'm');
  assert.ok(Math.abs(rotDrift) < 1e-6, '切回后弹匣应回到原始静止姿态，残余 ' + rotDrift + 'rad');
  assert.equal(mag.visible, true, '切回后弹匣不应停留在装弹动画的隐藏状态');
  assert.ok(vertexDrift < 0.01, '真实弹匣顶点应回到原始渲染位置，残余 ' + vertexDrift + 'm');
});

test('弹匣完全离位（隐藏阶段）时被打断切枪，切回后弹匣必须可见', (t) => {
  const scenevm = freshViewModel();
  const scene = scenevm.scene, vm = scenevm.vm;
  equipAndSettle(vm, 'ak47', WEAPONS.ak47.draw);
  const rest = partSnapshot(scene, 'mag');

  vm.reload(WEAPONS.ak47.reload, false);
  runFor(vm, 61 / 60); // f≈0.415，弹匣处于完全隐藏阶段
  const during = scene.getObjectByName('mag');
  assert.equal(during.visible, false, '前置：此阶段弹匣应在动画中隐藏');
  assert.ok(during.position.distanceTo(rest.position) > 0.2, '前置：此阶段弹匣应已离位');

  equipAndSettle(vm, 'deagle', WEAPONS.deagle.draw);
  equipAndSettle(vm, 'ak47', WEAPONS.ak47.draw);

  const mag = scene.getObjectByName('mag');
  const drift = mag.position.distanceTo(rest.position);
  t.diagnostic(JSON.stringify({ drift, visible: mag.visible }));
  assert.equal(mag.visible, true, '切回后弹匣不得停留在隐藏状态');
  assert.ok(drift < 1e-6, '切回后弹匣应回到静止位置，残余 ' + drift + 'm');
});

test('五种枪各经历 10 次合法装弹打断后，部件回到最初静止姿态、数值有限且无几何溢出', (t) => {
  // ViewModel 层无弹药业务（Actor/Weapon 不在本次所有权内，装弹合法性由 Actor 保证）；
  // 本回归验证视图层在重复合法打断下无部件漂移累积，且可见几何不溢出。
  const firearms = ['ak47', 'm4a1', 'awm', 'mp5', 'deagle'];
  const perGun = {};
  for (const id of firearms) {
    const scenevm = freshViewModel();
    const scene = scenevm.scene, vm = scenevm.vm;
    equipAndSettle(vm, id, WEAPONS[id].draw);
    const originals = {};
    for (const part of ['mag', 'bolt', 'slide']) {
      const p = scene.getObjectByName(part);
      if (p) originals[part] = { position: p.position.clone(), rotation: p.rotation.clone() };
    }
    assert.ok(originals.mag, id + ' 应有弹匣部件');
    const gunRoot = scene.getObjectByName('muzzle').parent;
    assert.ok(gunRoot, id + ' 应有真实枪根节点');
    vm.fire(); // 模拟前次射击的视图回调；弹药业务由 Actor/Weapon 管理
    for (let i = 0; i < 10; i++) {
      vm.reload(WEAPONS[id].reload, false);
      runFor(vm, 0.36 * WEAPONS[id].reload);
      equipAndSettle(vm, 'knife', WEAPONS.knife.draw);
      equipAndSettle(vm, id, WEAPONS[id].draw);
    }
    vm.reload(WEAPONS[id].reload, false); // 最后一次完整装弹仍应合法且完成
    runFor(vm, WEAPONS[id].reload + 0.3);
    const report = {};
    for (const part in originals) {
      const p = scene.getObjectByName(part);
      const d = p.position.distanceTo(originals[part].position);
      const r = Math.abs(p.rotation.x - originals[part].rotation.x)
        + Math.abs(p.rotation.y - originals[part].rotation.y)
        + Math.abs(p.rotation.z - originals[part].rotation.z);
      assert.ok(Number.isFinite(d) && Number.isFinite(r), id + ' 部件 ' + part + ' 数值应有限');
      assert.ok(d < 1e-6, id + ' 十次打断并完整装弹后 ' + part + ' 应回到最初静止位置，残余 ' + d + 'm');
      assert.ok(r < 1e-6, id + ' 十次打断并完整装弹后 ' + part + ' 应回到最初静止姿态，残余 ' + r + 'rad');
      report[part] = { position: d, rotation: r };
    }
    scene.updateMatrixWorld(true);
    const extent = new THREE.Box3().setFromObject(gunRoot).getSize(new THREE.Vector3()).length();
    // 正常值：整枪（含枪口焰面片）静置约 1.30–1.55m；缺陷态实测 3.61m，阈值取 2.0m 可明确区分。
    assert.ok(Number.isFinite(extent) && extent < 2.0, id + ' 可见武器包围盒不得异常放大，峰值 ' + extent + 'm');
    perGun[id] = { parts: report, gunExtent: extent };
  }
  t.diagnostic(JSON.stringify(perGun));
});

test('AWM 拉栓动画中被打断切枪，切回后枪栓恢复静止且下一发拉栓无累积漂移', (t) => {
  const scenevm = freshViewModel();
  const scene = scenevm.scene, vm = scenevm.vm;
  equipAndSettle(vm, 'awm', WEAPONS.awm.draw);
  const bolt = scene.getObjectByName('bolt');
  const restPos = bolt.position.clone();
  const restRotZ = bolt.rotation.z;

  vm.fire(); // AWM 开火触发 1.3s 拉栓动画
  runFor(vm, 0.6); // 动画进行到约 46%
  t.diagnostic(JSON.stringify({ rotZDuring: bolt.rotation.z, posZDuring: bolt.position.z }));
  assert.ok(Math.abs(bolt.rotation.z) > 0.1, '前置：打断时拉栓应处于旋转动画中');

  equipAndSettle(vm, 'deagle', WEAPONS.deagle.draw);
  equipAndSettle(vm, 'awm', WEAPONS.awm.draw);

  const posDrift = bolt.position.distanceTo(restPos);
  const rotDrift = Math.abs(bolt.rotation.z - restRotZ);
  assert.ok(posDrift < 1e-6, '切回后枪栓应回到静止位置，残余 ' + posDrift + 'm');
  assert.ok(rotDrift < 1e-6, '切回后枪栓应回到静止姿态，残余 ' + rotDrift + 'rad');

  let maxSwing = 0;
  vm.fire(); // 下一发：开火触发新的拉栓动画
  for (let i = 0; i < 100; i++) { // 完整拉栓周期，逐帧记录真实位移
    vm.update(1 / 60, idle);
    maxSwing = Math.max(maxSwing, Math.abs(bolt.position.z - restPos.z), Math.abs(bolt.rotation.z - restRotZ));
  }
  const finalDrift = bolt.position.distanceTo(restPos) + Math.abs(bolt.rotation.z - restRotZ);
  t.diagnostic(JSON.stringify({ maxSwing, finalDrift }));
  assert.ok(maxSwing > 0.05, '下一次拉栓仍应有真实动画位移，峰值 ' + maxSwing);
  assert.ok(finalDrift < 1e-6, '完整拉栓后不得累积漂移，残余 ' + finalDrift);
});

test('手雷投掷被打断切枪再切回，保险销必须复原且可再次完整投掷', (t) => {
  const scenevm = freshViewModel();
  const scene = scenevm.scene, vm = scenevm.vm;
  equipAndSettle(vm, 'he', WEAPONS.he.draw);
  const pin = scene.getObjectByName('pin');
  assert.ok(pin, '手雷应有保险销部件');
  const restPos = pin.position.clone();

  vm.throwNade();
  runFor(vm, 0.3); // f=0.4，销已拔出隐藏且未脱手
  assert.equal(pin.visible, false, '前置：投掷中段保险销应已隐藏');

  equipAndSettle(vm, 'knife', WEAPONS.knife.draw);
  equipAndSettle(vm, 'he', WEAPONS.he.draw);
  assert.equal(pin.visible, true, '切回后保险销必须复原可见');
  assert.ok(pin.position.distanceTo(restPos) < 1e-6, '切回后保险销应回到静止位置');

  vm.throwNade(); // 再次完整投掷
  runFor(vm, 1.0);
  assert.equal(pin.visible, true, '完整投掷结束后保险销应复位可见');
  assert.ok(pin.position.distanceTo(restPos) < 1e-6, '完整投掷结束后保险销应回到静止位置');
  equipAndSettle(vm, 'he', WEAPONS.he.draw);
  assert.equal(vm.cur.visible, true, '投掷后再次拔枪应恢复可见');
});

test('装弹打断切回后再次装弹，手臂几何不得被拉长且武器包围盒正常', (t) => {
  const scenevm = freshViewModel();
  const scene = scenevm.scene, vm = scenevm.vm;
  equipAndSettle(vm, 'ak47', WEAPONS.ak47.draw);
  const restMag = partSnapshot(scene, 'mag');
  const baseForeScale = { R: vm.arms.R.fore.scale.y, L: vm.arms.L.fore.scale.y };

  vm.reload(WEAPONS.ak47.reload, false);
  runFor(vm, 0.36 * WEAPONS.ak47.reload);
  equipAndSettle(vm, 'deagle', WEAPONS.deagle.draw);
  equipAndSettle(vm, 'ak47', WEAPONS.ak47.draw);

  const gunRoot = scene.getObjectByName('muzzle').parent;
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  let maxForeScale = 0, minForeScale = Infinity, maxExtent = 0, maxGunCoordinate = 0;
  vm.reload(WEAPONS.ak47.reload, false);
  for (let i = 0; i < 147; i++) { // 覆盖完整 2.45s 装弹，含 0.12–0.72 左手引导阶段
    vm.update(1 / 60, idle);
    maxForeScale = Math.max(maxForeScale, vm.arms.R.fore.scale.y, vm.arms.L.fore.scale.y);
    minForeScale = Math.min(minForeScale, vm.arms.R.fore.scale.y, vm.arms.L.fore.scale.y);
    scene.updateMatrixWorld(true);
    maxExtent = Math.max(maxExtent, box.setFromObject(gunRoot).getSize(size).length());
    maxGunCoordinate = Math.max(maxGunCoordinate, ...box.min.toArray().map(Math.abs), ...box.max.toArray().map(Math.abs));
  }
  runFor(vm, 0.3);
  const magDrift = scene.getObjectByName('mag').position.distanceTo(restMag.position);
  const foreResidual = Math.max(...['R', 'L'].map(side => Math.abs(vm.arms[side].fore.scale.y - baseForeScale[side])));
  t.diagnostic(JSON.stringify({ maxForeScale, minForeScale, maxExtent, maxGunCoordinate, magDrift, foreResidual }));
  assert.ok(maxForeScale < 1.5, '装弹全程前臂缩放不得拉长（正常峰值约 1.42），实测 ' + maxForeScale);
  // 正常值：整枪（含枪口焰面片）约 1.58m；缺陷态实测 3.61m，阈值取 2.0m 可明确区分。
  assert.ok(maxExtent < 2.0, '装弹全程枪根包围盒不得异常放大，实测 ' + maxExtent + 'm');
  assert.ok(maxGunCoordinate < 2.0, '装弹全程枪根顶点不得远离正常握持范围，实测 ' + maxGunCoordinate + 'm');
  assert.ok(minForeScale > 0, '装弹全程前臂不得出现零长或负缩放，实测 ' + minForeScale);
  assert.ok(foreResidual < 0.01, '装弹完成后前臂应恢复原长，残余 ' + foreResidual);
  assert.ok(magDrift < 1e-6, '完整装弹后弹匣应回到静止位置，残余 ' + magDrift + 'm');
});

test('Deagle 开火后立即切枪再切回，新拔出的枪不应播放旧的上膛动画', (t) => {
  const scenevm = freshViewModel();
  const scene = scenevm.scene, vm = scenevm.vm;
  equipAndSettle(vm, 'deagle', WEAPONS.deagle.draw);
  const slide = scene.getObjectByName('slide');
  const restPos = slide.position.clone();

  vm.fire(); // 触发 0.09s 滑套后坐瞬态
  equipAndSettle(vm, 'knife', WEAPONS.knife.draw); // 瞬态未结束即切走
  vm.equip('deagle', WEAPONS.deagle.draw); // 立即换回，监控新拔枪最初几帧

  let maxResidue = 0;
  for (let i = 0; i < 6; i++) { // 拔枪最初 0.1s：不得播放旧开火的滑套动画
    vm.update(1 / 60, idle);
    maxResidue = Math.max(maxResidue, Math.abs(slide.position.z - restPos.z));
  }
  runFor(vm, WEAPONS.deagle.draw); // 完成拔枪
  t.diagnostic(JSON.stringify({ maxResidue, final: Math.abs(slide.position.z - restPos.z) }));
  assert.ok(maxResidue < 1e-9, '切回后的新拔枪不得残留旧开火滑套位移，峰值 ' + maxResidue + 'm');
  assert.ok(Math.abs(slide.position.z - restPos.z) < 1e-9, '滑套最终应处于静止位置');
});
