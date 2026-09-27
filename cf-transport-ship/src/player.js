// 玩家：输入、镜头
import * as THREE from 'three';
import { Actor } from './actor.js';

// 爆破输入命令状态机：Player.update 每帧归集输入与 objectiveView 公开视图，产出 objectiveCommand 队列。
// 只依据公开视图（plantable/defusable/pickupable/进度）判断；打断判定来自 BombMatch 事实，这里只保证"打断后需松开重按"。
export class BombInput {
  constructor() { this.reset(); }
  reset() {
    this.c4Selected = false; // 5号槽运行时输入状态（Player.c4Selected 委托至此）
    this.plantHeld = false; this.defuseHeld = false;
    this.blockPlant = false; this.blockDefuse = false;
    this.gracePlant = 0; this.graceDefuse = 0;
  }
  selectC4(on) { this.c4Selected = !!on; }
  update(view, inp, dt = 0) {
    const out = [];
    const live = !!view;
    if (!live || !inp.carrying) {
      // 失去C4（丢弃/掉落/阵亡/回合重置）：退出选中并不再维持安放动作
      this.c4Selected = false;
      if (this.plantHeld) { this.plantHeld = false; if (live) out.push({ type: 'stopPlant' }); }
      this.blockPlant = false;
    } else {
      const canPlant = this.c4Selected && view.plantable;
      if (canPlant && inp.fire && !this.plantHeld && !this.blockPlant) {
        this.plantHeld = true; this.gracePlant = 0.3;
        out.push({ type: 'startPlant' });
      } else if (this.plantHeld && !inp.fire) {
        this.plantHeld = false; this.blockPlant = false;
        out.push({ type: 'stopPlant' });
      } else if (this.plantHeld && this.gracePlant <= 0 && !(view.plantProgress > 0)) {
        // 进度归零 = 规则侧已打断；必须松开重按才可重新安放
        this.plantHeld = false; this.blockPlant = true;
        out.push({ type: 'stopPlant' });
      }
      if (!inp.fire) this.blockPlant = false;
      this.gracePlant -= dt;
    }
    const canDefuse = live && view.defusable;
    if (canDefuse && inp.eHeld && !this.defuseHeld && !this.blockDefuse) {
      this.defuseHeld = true; this.graceDefuse = 0.3;
      out.push({ type: 'startDefuse' });
    } else if (this.defuseHeld && !inp.eHeld) {
      this.defuseHeld = false; this.blockDefuse = false;
      out.push({ type: 'stopDefuse' });
    } else if (this.defuseHeld && this.graceDefuse <= 0 && !(view.defuseProgress > 0)) {
      this.defuseHeld = false; this.blockDefuse = true;
      out.push({ type: 'stopDefuse' });
    }
    if (!inp.eHeld) this.blockDefuse = false;
    this.graceDefuse -= dt;
    // E 拆包优先于拾取：拆包按住期间/可拆时不拾取
    if (live && inp.ePressed && view.pickupable && !canDefuse && !this.defuseHeld) out.push({ type: 'pickupBomb' });
    // G 丢C4（仅C4选中时；丢弃主武器无运行时接口，见 lane 报告）
    if (live && inp.gPressed && inp.carrying && this.c4Selected) {
      out.push({ type: 'dropBomb', pos: inp.pos });
      this.c4Selected = false;
    }
    return out;
  }
}

export class Player extends Actor {
  constructor(game, o) {
    super(game, { ...o, isPlayer: true });
    this.keys = new Set();
    this.mouse = { l: false, r: false, lp: false, rp: false, dx: 0, dy: 0, wheel: 0 };
    this.pressed = new Set();
    this.lookDX = 0; this.lookDY = 0;
    this.bobT = 0; this.land = 0; this.shakeT = 0;
    this.camRoll = 0;
    this.deathCam = null;
    this.touch = { mx: 0, mz: 0, fire: false, jump: false, crouch: false };
    this.bombInput = new BombInput();
    this.carryingC4 = false;
    this.spectating = null; this.spectateName = '';
  }
  // 5号槽C4选中（运行时输入状态），状态本体在 bombInput
  get c4Selected() { return this.bombInput.c4Selected; }
  set c4Selected(v) { this.bombInput.c4Selected = !!v; }
  // 输入监听只绑定一次，始终路由到当前玩家
  bind(canvas) {
    const g = this.game;
    if (g._inputBound) return;
    g._inputBound = true;
    const P = () => (g.playing ? g.player : null);
    window.addEventListener('keydown', (e) => {
      const p = P(); if (!p) return;
      if (['Tab', 'Space', 'KeyB', 'KeyE', 'KeyF', 'KeyQ', 'Digit5', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      p.keys.add(e.code); p.pressed.add(e.code);
    });
    window.addEventListener('keyup', (e) => { const p = g.player; if (p) p.keys.delete(e.code); });
    window.addEventListener('blur', () => { const p = g.player; if (p) { p.keys.clear(); p.mouse.l = p.mouse.r = false; } });
    canvas.addEventListener('mousedown', (e) => {
      const p = P(); if (!p) return;
      if (!g.locked && !g.touchMode) { g.lock(); return; }
      if (e.button === 0) { p.mouse.l = true; p.mouse.lp = true; }
      if (e.button === 2) { p.mouse.r = true; p.mouse.rp = true; }
    });
    window.addEventListener('mouseup', (e) => { const p = g.player; if (!p) return; if (e.button === 0) p.mouse.l = false; if (e.button === 2) p.mouse.r = false; });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      const p = P(); if (!p || !g.locked) return;
      // 过滤浏览器偶发的异常大位移
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      p.mouse.dx += e.movementX; p.mouse.dy += e.movementY;
    });
    window.addEventListener('wheel', (e) => { const p = P(); if (p && g.locked) p.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
  }
  consumePressed(code) { const p = this.pressed.has(code); this.pressed.delete(code); return p; }
  // C4 选中/退出：第一人称切换到 C4 模型
  setC4(on) {
    if (this.c4Selected === on) return;
    this.c4Selected = on;
    const g = this.game;
    if (on) g.vm.equip('c4', 0.4);
    else if (this.weapon) g.vm.equip(this.weapon.id, this.weapon.def.draw);
  }
  // 死亡观战：跟随己方存活队友（爆破模式）；左键/滚轮切换
  updateSpectate() {
    const mates = this.game.actors.filter((a) => a.team === this.team && a !== this && a.alive);
    if (!mates.length) { this.spectating = null; this.spectateName = ''; return; }
    if (!this.spectating || !this.spectating.alive || this.spectating.team !== this.team) {
      this.spectateIdx = 0; this.spectating = mates[0];
    } else if (this.mouse.lp || this.mouse.wheel) {
      this.mouse.lp = false; this.mouse.wheel = 0;
      this.spectateIdx = ((this.spectateIdx || 0) + 1) % mates.length;
      this.spectating = mates[this.spectateIdx];
    }
    this.spectateName = this.spectating ? this.spectating.name : '';
  }
  update(dt) {
    const g = this.game, K = this.keys;
    const sens = g.opts.sens * 0.0022;
    let dx = this.mouse.dx, dy = this.mouse.dy;
    this.mouse.dx = this.mouse.dy = 0;
    if (this.touchLook) { dx += this.touchLook.x; dy += this.touchLook.y; this.touchLook.x = this.touchLook.y = 0; }
    this.lookDX = dx; this.lookDY = dy;
    const fovK = this.scoped ? g.renderer.camera.fov / g.opts.fov : 1;
    // 爆破目标视图（非爆破模式为 null）；重生瞬间清理 C4 输入状态
    const oview = g.objectiveView ? g.objectiveView(this.id) : null;
    if (this.alive && !this._wasAlive) { this.bombInput.reset(); this.spectating = null; this.spectateName = ''; }
    this._wasAlive = this.alive;
    this.carryingC4 = !!(oview && oview.bomb && oview.bomb.carrierId === this.id);
    if (this.alive) {
      this.yaw -= dx * sens * fovK;
      this.pitch = THREE.MathUtils.clamp(this.pitch - dy * sens * fovK, -1.5, 1.5);
      // 移动
      let f = 0, s = 0;
      if (K.has('KeyW') || K.has('ArrowUp')) f += 1;
      if (K.has('KeyS') || K.has('ArrowDown')) f -= 1;
      if (K.has('KeyD') || K.has('ArrowRight')) s += 1;
      if (K.has('KeyA') || K.has('ArrowLeft')) s -= 1;
      f += this.touch.mz; s += this.touch.mx;
      const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
      const wx = -sy * f + cy * s, wz = -cy * f - sy * s;
      const jump = K.has('Space') || this.touch.jump;
      const crouch = K.has('KeyC') || this.touch.crouch;
      this.walk = K.has('ShiftLeft') || K.has('ShiftRight');
      this.move(dt, wx, wz, jump, crouch, this.walk);
      if (this.touch.jump) this.touch.jump = false;
      // 5号槽：携带C4时可选中的虚拟槽
      if (this.consumePressed('Digit5')) {
        if (this.carryingC4) this.setC4(true);
        else g.hud.toast(g.tf('hud.noC4', null, '未携带 C4'), 1);
      }
      // 武器
      let sw = null;
      for (let i = 1; i <= 4; i++) if (this.consumePressed('Digit' + i)) sw = i - 1;
      if (this.consumePressed('KeyQ')) sw = this.lastSlot;
      if (this.mouse.wheel && this.c4Selected) this.setC4(false);
      if (this.mouse.wheel) {
        const dir = this.mouse.wheel > 0 ? 1 : -1; this.mouse.wheel = 0;
        let n = this.slot;
        for (let k = 0; k < 4; k++) { n = (n + dir + 4) % 4; if (this.inv[n] && !(this.inv[n].def.type === 'grenade' && this.inv[n].mag <= 0)) break; }
        sw = n;
      }
      if (sw !== null && this.c4Selected) this.setC4(false);
      if (sw !== null && this.inv[sw] && this.inv[sw].def.type === 'grenade' && this.inv[sw].mag <= 0) { g.hud.toast(g.tf('hud.noGrenade', null, '没有手雷了'), 1.2); sw = null; }
      // 爆破交互：安放（按住开火）/ 拆包拾取（E，拆包优先）/ 丢C4（G），只经 objectiveCommand 下发
      const cmds = this.bombInput.update(oview, {
        carrying: this.carryingC4,
        fire: this.mouse.l || this.touch.fire,
        eHeld: K.has('KeyE'), ePressed: this.consumePressed('KeyE'), gPressed: this.consumePressed('KeyG'),
        pos: { x: this.pos.x, y: this.pos.y, z: this.pos.z },
      }, dt);
      for (const c of cmds) {
        if (g.objectiveCommand) g.objectiveCommand(c.type, this.id, c.pos);
        if (c.type === 'dropBomb') this.setC4(false);
      }
      const lp = this.mouse.lp || this.touch.firePressed, rp = this.mouse.rp;
      this.mouse.lp = this.mouse.rp = false; this.touch.firePressed = false;
      if (this.c4Selected) this.weaponUpdate(dt, {}); // C4在手：枪械/投掷输入全部旁路
      else this.weaponUpdate(dt, { fire: this.mouse.l || this.touch.fire, firePressed: lp, alt: this.mouse.r, altPressed: rp, reload: this.consumePressed('KeyR'), sw });
      if (this.consumePressed('KeyF')) g.vm.inspect();
    } else {
      this.pressed.delete('KeyR');
      // 爆破模式死亡观战己方队友；非爆破保持原死亡镜头
      if (oview) this.updateSpectate();
      this.mouse.lp = this.mouse.rp = false;
    }
    if (this.consumePressed('KeyB')) g.toggleLoadout();
    this.pressed.clear();
    this.updateCamera(dt);
  }
  updateCamera(dt) {
    const g = this.game, cam = g.renderer.camera;
    if (!this.alive) {
      // 爆破死亡观战：第一人称跟随己方存活队友
      const t = this.spectating;
      if (t && t.alive) {
        t.eye(cam.position);
        cam.rotation.order = 'YXZ';
        cam.rotation.set(t.pitch + t.punchP, t.yaw + t.punchY, 0);
        cam.fov += (g.opts.fov - cam.fov) * Math.min(1, dt * 8); cam.updateProjectionMatrix();
        return;
      }
      // 死亡镜头：抬高并看向击杀者
      const dc = this.deathCam;
      if (dc) {
        dc.t += dt;
        const k = Math.min(1, dc.t * 1.2);
        const e = 1 - (1 - k) * (1 - k);
        cam.position.lerpVectors(dc.from, dc.to, e);
        if (dc.killer && dc.killer.alive) dc.look.lerp(dc.killer.soldier.headWorld(new THREE.Vector3()), Math.min(1, dt * 3));
        cam.lookAt(dc.look);
      }
      cam.fov += (g.opts.fov - cam.fov) * Math.min(1, dt * 8); cam.updateProjectionMatrix();
      return;
    }
    // 晃动
    const sp = this.onGround ? this.speed : 0;
    this.bobT += dt * (sp > 0.5 ? 6 + sp * 0.9 : 0);
    const bobK = Math.min(1, sp / 6) * (this.scoped ? 0.2 : 1);
    const by = Math.abs(Math.sin(this.bobT)) * 0.028 * bobK, bx = Math.cos(this.bobT) * 0.012 * bobK;
    if (this.landed && this.landSpeed > 3) this.land = Math.min(0.14, this.landSpeed * 0.012);
    this.land *= Math.exp(-dt * 7);
    const shake = g.fx.shake * 0.06;
    this.eye(cam.position);
    cam.position.y += by - this.land + (Math.random() - 0.5) * shake;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    cam.position.x += cy * bx + (Math.random() - 0.5) * shake;
    cam.position.z += -sy * bx;
    this.camRoll += ((this.keys.has('KeyA') ? 0.008 : 0) - (this.keys.has('KeyD') ? 0.008 : 0) - this.camRoll) * Math.min(1, dt * 6);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(this.pitch + this.punchP * 0.75 + this.aimPunch, this.yaw + this.punchY * 0.75, this.camRoll);
    // FOV：狙击镜
    const w = this.weapon;
    let fov = g.opts.fov;
    if (w && w.def.type === 'sniper' && this.scoped) fov = w.def.zoom[this.scoped - 1];
    const fk = this.scoped ? 1 : Math.min(1, dt * 10);
    cam.fov += (fov - cam.fov) * fk;
    cam.updateProjectionMatrix();
  }
  startDeathCam(killer) {
    const cam = this.game.renderer.camera;
    const from = cam.position.clone();
    const head = this.pos.clone().add(new THREE.Vector3(0, 1.2, 0));
    const want = new THREE.Vector3(Math.sin(this.yaw) * 2.2, 1.4, Math.cos(this.yaw) * 2.2);
    const L = want.length(); want.divideScalar(L);
    const hit = this.game.world.raycast(head.x, head.y, head.z, want.x, want.y, want.z, L, 'move');
    const to = head.clone().addScaledVector(want, hit ? Math.max(0.2, hit.t - 0.35) : L);
    const look = this.pos.clone().add(new THREE.Vector3(0, 0.4, 0));
    this.deathCam = { t: 0, from, to, look, killer: killer && killer !== this ? killer : null };
    this.soldier.root.visible = true;
  }
}
