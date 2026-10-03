import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ViewModel } from '../../src/viewmodel.js';
import { WEAPONS } from '../../src/weapons.js';

// Canvas 是 Node 不具备的系统边界；枪模型、材质、场景与动画均使用真实代码。
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

function equippedWeapon(id) {
  const scene = new THREE.Scene();
  const vm = new ViewModel(scene, textures, 'BL');
  vm.equip(id);
  for (let i = 0; i < 60; i++) vm.update(1 / 60, idle);
  const gun = scene.getObjectByName('muzzle')?.parent;
  assert.ok(gun, 'equip 应将真实枪模型及枪口加入场景');
  const body = gun.children.find((o) => o.isMesh);
  assert.ok(body?.geometry.getAttribute('position'), '枪身应有真实可绘制顶点');
  return { scene, vm, gun, body };
}

function weaponPose({ scene, gun, body }) {
  scene.updateMatrixWorld(true);
  return {
    position: gun.getWorldPosition(new THREE.Vector3()),
    orientation: gun.getWorldQuaternion(new THREE.Quaternion()),
    vertex: new THREE.Vector3().fromBufferAttribute(body.geometry.getAttribute('position'), 0).applyMatrix4(body.matrixWorld),
  };
}

function shotMotion(id, frameTimes, shotTimes = [0]) {
  const fixture = equippedWeapon(id);
  const rest = weaponPose(fixture);
  const motion = { maxPosition: 0, maxAngle: 0, maxVertex: 0 };
  let elapsed = 0, fired = 0;
  for (const dt of frameTimes) {
    if (fired < shotTimes.length && elapsed + 1e-12 >= shotTimes[fired]) {
      fixture.vm.fire(); fired++;
    }
    fixture.vm.update(dt, idle);
    elapsed += dt;
    const pose = weaponPose(fixture);
    motion.maxPosition = Math.max(motion.maxPosition, pose.position.distanceTo(rest.position));
    motion.maxAngle = Math.max(motion.maxAngle, pose.orientation.angleTo(rest.orientation));
    motion.maxVertex = Math.max(motion.maxVertex, pose.vertex.distanceTo(rest.vertex));
    motion.finalPosition = pose.position.distanceTo(rest.position);
    motion.finalAngle = pose.orientation.angleTo(rest.orientation);
    motion.finalVertex = pose.vertex.distanceTo(rest.vertex);
  }
  return { ...motion, shots: fired };
}

function assertSettledMotion(motion) {
  assert.ok(motion.maxPosition < 0.25, `枪模型应保持在静止位置 0.25m 内，最大位移 ${motion.maxPosition}m`);
  assert.ok(motion.maxAngle < 0.5, `枪模型后坐应保持有限姿态，最大转角 ${motion.maxAngle}rad`);
  assert.ok(motion.maxVertex < 0.25, `真实枪身顶点应保持在静止位置附近，最大位移 ${motion.maxVertex}m`);
  assert.ok(motion.finalPosition < 0.005, `停止开火后枪模型应回到静止位置附近，残余 ${motion.finalPosition}m`);
  assert.ok(motion.finalAngle < 0.005, `停止开火后枪模型应恢复姿态，残余 ${motion.finalAngle}rad`);
  assert.ok(motion.finalVertex < 0.005, `停止开火后真实枪身顶点应恢复，残余 ${motion.finalVertex}m`);
}

test('AK 单发后在 15FPS 保持枪模型稳定，并在两秒内恢复静止姿态', (t) => {
  const motion = shotMotion('ak47', Array(30).fill(1 / 15));
  t.diagnostic(JSON.stringify(motion));
  assertSettledMotion(motion);
});

test('允许的 100ms 帧间隔保持枪模型稳定，并完整推进后坐时间', (t) => {
  const slow = equippedWeapon('ak47');
  const normal = equippedWeapon('ak47');
  slow.vm.fire(); normal.vm.fire();
  slow.vm.update(0.1, idle);
  for (let i = 0; i < 6; i++) normal.vm.update(1 / 60, idle);
  const coarsePose = weaponPose(slow), reference = weaponPose(normal);
  assert.ok(coarsePose.position.distanceTo(reference.position) < 1e-8, '100ms 应与六个 60FPS 帧推进相同时间，不得丢弃帧时间');
  assert.ok(coarsePose.orientation.angleTo(reference.orientation) < 1e-6, '两组后坐均应完整推进，枪模型姿态应一致');
  assert.ok(coarsePose.vertex.distanceTo(reference.vertex) < 1e-8, '真实枪身顶点应与完整推进的参考场景一致');
  const motion = shotMotion('ak47', Array(20).fill(0.1));
  t.diagnostic(JSON.stringify(motion));
  assertSettledMotion(motion);
});

test('快速帧与慢帧交替时，AK 单发枪模型仍有界并恢复', (t) => {
  const pattern = [1 / 120, 1 / 15, 0.1, 1 / 30, 1 / 60];
  const frameTimes = Array.from({ length: 8 }, () => pattern).flat().concat(0.1, 0.1);
  const motion = shotMotion('ak47', frameTimes); // 总时长 2 秒；含合法的连续慢帧与短帧。
  t.diagnostic(JSON.stringify(motion));
  assertSettledMotion(motion);
});


test('AK 按合法射速持续连发，在 10FPS 与 60FPS 均保持枪模型有界且停火后恢复', (t) => {
  const shotTimes = Array.from({ length: 20 }, (_, i) => i * 60 / WEAPONS.ak47.rpm);
  assert.ok(shotTimes.length <= WEAPONS.ak47.mag, '连发不得超过实际弹匣容量');
  const slow = shotMotion('ak47', Array(40).fill(0.1), shotTimes);
  const normal = shotMotion('ak47', Array(240).fill(1 / 60), shotTimes);
  t.diagnostic(JSON.stringify({ slow, normal }));
  assert.equal(slow.shots, 20); assert.equal(normal.shots, 20);
  assertSettledMotion(slow); assertSettledMotion(normal);
  assert.ok(slow.maxPosition > 0.01 && normal.maxPosition > 0.01, '连发仍应有实际可见的后坐位移');
  assert.ok(Math.abs(slow.maxPosition - normal.maxPosition) < 0.03, '低帧率连发位移应保持在正常帧率的运动范围附近');
  assert.ok(Math.abs(slow.finalPosition - normal.finalPosition) < 1e-8, '相同连发与停火时间后应回到同一位置');
  assert.ok(Math.abs(slow.finalAngle - normal.finalAngle) < 1e-6, '相同连发与停火时间后应恢复同一姿态');
});

test('M4A1 在 100ms 帧间隔下保持真实枪模型及顶点稳定并恢复', (t) => {
  const motion = shotMotion('m4a1', Array(20).fill(0.1));
  t.diagnostic(JSON.stringify(motion));
  assertSettledMotion(motion);
  assert.ok(motion.maxAngle > 0.01, '开火应保留实际后坐转角');
});

test('MP5 在 100ms 帧间隔下保持真实枪模型及顶点稳定并恢复', (t) => {
  const motion = shotMotion('mp5', Array(20).fill(0.1));
  t.diagnostic(JSON.stringify(motion));
  assertSettledMotion(motion);
  assert.ok(motion.maxAngle > 0.01, '开火应保留实际后坐转角');
});

test('AWM 高冲量 在 100ms 帧间隔下保持真实枪模型及顶点稳定并恢复', (t) => {
  const motion = shotMotion('awm', Array(20).fill(0.1));
  t.diagnostic(JSON.stringify(motion));
  assertSettledMotion(motion);
  assert.ok(motion.maxAngle > 0.01, '开火应保留实际后坐转角');
});

test('Deagle 高转角冲量 在 100ms 帧间隔下保持真实枪模型及顶点稳定并恢复', (t) => {
  const motion = shotMotion('deagle', Array(20).fill(0.1));
  t.diagnostic(JSON.stringify(motion));
  assertSettledMotion(motion);
  assert.ok(motion.maxAngle > 0.01, '开火应保留实际后坐转角');
});

test('正常 60FPS 保留已测得的 AK 单发后坐幅度并恢复', (t) => {
  const motion = shotMotion('ak47', Array(120).fill(1 / 60));
  t.diagnostic(JSON.stringify(motion));
  // 修复前真实 ViewModel 公共场景测得的正常 60FPS 峰值约 0.023926m。
  assert.ok(Math.abs(motion.maxPosition - 0.023926) < 0.00001, '正常 60FPS 应保持既有单发后坐幅度');
  assertSettledMotion(motion);
});
