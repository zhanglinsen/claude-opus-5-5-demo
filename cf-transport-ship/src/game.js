// 对局主控
import * as THREE from 'three';
import { Renderer } from './render.js';
import { buildTextures } from './textures.js';
// 纯解析函数来自 registry（无 three/资产依赖，node 可导入）；地图构建器含浏览器纹理资产，
// 在唯一使用点惰性动态导入，避免静态链把 .png 拉进 node 模块图
import { getMapDescriptor, resolveMapId, inSpawnZone, mapDisplayKeys, firstAvailableMapId } from './maps/registry.js';
import { getMode } from './modes/index.js';
import { BombSession } from './modes/bomb-session.js';
import { PracticeRuntime } from './modes/practice-runtime.js';
import { Environment } from './env.js';
import { World } from './physics.js';
import { createNavigation } from './navigation.js';
import { Effects } from './effects.js';
import { ViewModel } from './viewmodel.js';
import { HUD } from './hud.js';
import { audio } from './audio.js';
import { WEAPONS, jitterDir } from './weapons.js';
import { buildGunMerged } from './guns.js';
import { computeThrowVelocity, GrenadeProjectile } from './combat/projectile.js';
import { SmokeCloud, computeFlashEffect } from './combat/grenade-effects.js';
import { createProfileService } from './profile/service.js';
import { createProfileAdapter } from './profile/adapter.js';
import { CATALOG } from './profile/equipment.js';
import { rankKeyAt } from './profile/rank.js';
import { CATALOGS } from './i18n/catalogs.js';
import { acquireStorage } from './settings.js';
import { Player } from './player.js';
import { Bot, BOT_NAMES } from './bots.js';
import { TouchControls } from './touch.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const MULTI = ['', '', 'DOUBLE KILL', 'TRIPLE KILL', 'MULTI KILL', 'ULTRA KILL', 'RAMPAGE', 'UNSTOPPABLE', 'GODLIKE'];
// 爆破回合结束原因 → 翻译键（目录缺键时回退原始 reason 字符串）
const BOMB_REASON_KEYS = {
  timeout: 'bomb.reason.timeout',
  exploded: 'bomb.reason.exploded',
  defused: 'bomb.reason.defused',
  grWiped: 'bomb.reason.grWiped',
  blWiped: 'bomb.reason.blWiped',
};
// 缺省翻译（与 HUD 的 zhT 同一模式）：直接取中文目录，与历史输出逐字一致；
// 注入 LocaleService 后 t() 即切换语言，不另存第二套硬编码字符串。
const interp = (text, params) => (params ? text.replace(/\{(\w+)\}/g, (m, n) => (params[n] != null ? String(params[n]) : m)) : text);
const zhT = (k, params) => interp(CATALOGS.zh && CATALOGS.zh[k] !== undefined ? CATALOGS.zh[k] : k, params);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _d = new THREE.Vector3();

// 释放角色 GPU 独占资源：SkinnedMesh 的 skeleton.boneTexture 由渲染器首帧惰性分配
// （每士兵一张 DataTexture），scene.remove 不触发释放——不补 dispose 会随每局重开
// 单调泄漏 ~11 张纹理（E 波验收 §3 实测）。材质/几何为共享缓存，无需处理。
function disposeActorGpu(a) {
  const sk = a.soldier && a.soldier.mesh && a.soldier.mesh.skeleton;
  if (sk && sk.boneTexture && sk.boneTexture.isTexture) sk.boneTexture.dispose();
}

// 击杀徽章文案（纯函数，node 可测）：text 为双语通用的英文大字横幅（现役风格，zh 亦如此），
// sub 为当前语言副标。优先级与历史一致：多杀 > 爆头 > 刀杀 > 手雷 > 穿墙 > 普通击杀。
export function killBadgeText(t, { multi = 1, headshot = false, weaponId = '', wall = false, victimName = '' }) {
  const kill = t('callout.kill', { name: victimName });
  const m = Math.min(Math.max(1, multi | 0), 8);
  if (m >= 2) return { text: MULTI[m], sub: `${t(`callout.multi${m}`)} · ${kill}` };
  if (headshot) return { text: 'HEADSHOT', sub: `${t('callout.headshot')} · ${kill}` };
  if (weaponId === 'knife') return { text: 'KNIFE KILL', sub: `${t('callout.knife')} · ${kill}` };
  if (weaponId === 'he') return { text: 'GRENADE KILL', sub: `${t('callout.grenade')} · ${kill}` };
  if (wall) return { text: 'WALLBANG', sub: `${t('callout.wallbang')} · ${kill}` };
  return { text: 'KILL', sub: kill };
}

// 阵亡提示（纯函数，node 可测）：weapon 为调用方解析好的显示名；无攻击者（自杀/坠落）回退「你阵亡了」
export function killedByText(t, { attackerName = '', attackerTeam = 'GR', weapon = '', headshot = false }) {
  if (!attackerName) return t('hud.dead');
  const name = `<span style="color:${attackerTeam === 'BL' ? '#ff9b70' : '#8cc8ff'}">${attackerName}</span>`;
  return t(headshot ? 'callout.killedByHead' : 'callout.killedBy', { name, weapon });
}

// 感知接线层机器人：在 Bot 既有视线判定外叠加烟雾遮挡（唯一接缝 smokeBlocksSight 语义）
// 与闪光致盲；bots.js 本体不感知投掷物效果。
class WiredBot extends Bot {
  canSee(t) {
    const g = this.game;
    if (g.time < (this.blindUntil || 0)) return false; // 被闪光致盲：短暂失明
    if (g.smokes.length && g.smokeBlocked(this.eye(_v), t.pos)) return false; // 烟雾遮挡视线
    return super.canSee(t);
  }
}

export class Game {
  constructor() {
    this.time = 0; this.frame = 0;
    this.playing = false; this.paused = false; this.locked = false;
    this.actors = []; this.nades = []; this.timers = []; this.tags = [];
    this.smokes = []; this.practice = null; this.practiceMeshes = [];
    this.profileAdapter = null; this.matchId = null; this.playerObjectiveActions = 0; this.lastAward = null;
    this.score = { BL: 0, GR: 0 };
    this.bomb = null; this.bombSession = null; this.c4 = null; this.tick = 0;
    this.audio = audio;
    this.localeService = null; // Task 11 接线：setLocaleService 注入；缺省回退中文目录
    this.platform = null;      // Task 11 接线：installPlatform 句柄（主控注入；离线可为 null）
    this.adPaused = false;     // 广告暂停原因（独立于玩家暂停 this.paused，成对 enter/exit）
    this.qs = new URLSearchParams(location.search);
    this.worldReady = false;
    this._worldPromise = null;
    this._startPromise = null;
    this._loopRunning = false;
  }
  // ================= 本地化（Task 10 / US-02） =================
  // 注入点（Task 11 接线契约）：主控创建 createGameLocale()（src/i18n/index.js）后，
  // 在 game.init() 之前调用 game.setLocaleService(locale)。语言切换为即时取词：
  // 战斗播报/报点/结算文案在产生时用 game.t 取当前语言，无需订阅重绘。
  setLocaleService(service) {
    this.localeService = service && typeof service.t === 'function' ? service : null;
  }
  // 当前语言取词：未注入语言服务时回退中文目录（zhT 与历史输出逐字一致），旧调用安全
  t(key, params) {
    return this.localeService ? this.localeService.t(key, params) : zhT(key, params);
  }
  // ================= 平台广告断点（Task 11 / US-05） =================
  // 仅在自然断点（整场结束 / 返回菜单）请求；进行中重复请求由 session 去重。
  // 非法断点被 session 的 breaks 策略拒绝，绝不触发平台广告调用。
  requestPlatformAd(breakpoint) {
    const session = this.platform && this.platform.session;
    if (!session) return null;
    return Promise.resolve().then(() => session.request(breakpoint)).catch(() => null);
  }
  // AdSession controls（主控经 installPlatform({ controls }) 注入）：
  // 广告暂停是独立原因，与玩家暂停（pause 菜单）合并判定，退出后恢复玩家此前状态。
  isUserPaused() { return !!this.paused; }
  enterAdPause() { this.adPaused = true; this.stopLoop(); }
  exitAdPause(wasUserPaused) {
    this.adPaused = false;
    // 玩家此前已暂停（wasUserPaused）时保持其暂停：广告期间未改动 paused/HUD 状态，无需恢复动作
    if (this.playing && !this.paused) this.startLoop();
  }
  // 缺键回退：目录未覆盖的键返回 fallback（避免把键名本身渲染给玩家）
  tf(key, params, fallback) {
    const v = this.t(key, params);
    return v === key ? fallback : v;
  }
  // 武器显示名：稳定 ID 不变，译文走 weapon.<id>.name；目录外 id 回退武器表原名
  weaponName(id) {
    return WEAPONS[id] ? this.tf(`weapon.${id}.name`, null, WEAPONS[id].name) : id;
  }
  // 军衔显示名：level（1 起算）→ 稳定档位键；越界回退档案里的中文 rankName
  rankName(level, fallback) {
    const key = rankKeyAt((level | 0) - 1);
    return key ? this.t(`rank.${key}.name`) : fallback;
  }
  async init() {
    // HUD 收到主控注入的同一 LocaleService 实例（main.js: game.setLocaleService(locale)），
    // 触屏控件经 game.locale 也接同一实例——三处语言状态严格同源
    this.hud = new HUD(this, { locale: this.localeService });
    this.opts = this.hud.opts;
    if (this.qs.get('q')) this.opts.quality = this.qs.get('q');
    // 地图解析：URL map= 优先，其次已存设置；不可用的地图回退到第一张可用地图
    const mapId = resolveMapId(this.qs.get('map'), this.opts.map);
    this.mapDesc = getMapDescriptor(mapId);
    this.opts.map = mapId;
    this.hud.saveOpts();
    // 本地档案（军衔/装备预设）：guarded localStorage，隐私/配额/损坏自动降级；
    // legacyPrimary 迁移旧主武器偏好到新档案的默认预设。向下只暴露 adapter。
    this.profileAdapter = createProfileAdapter({
      service: createProfileService({ storage: acquireStorage(), legacyPrimary: this.opts.primary }),
    });
    this.hud.setMapInfo(this.mapDesc);
    this.hud.show('menu');
    const canvas = document.getElementById('c');
    canvas.style.visibility = 'hidden';
    // 异步建图后浏览器可能已结束按钮点击的用户激活；玩家点画面可重试锁鼠标。
    canvas.addEventListener('click', () => {
      if (this.playing && !this.paused && !this.locked && !this.touchMode) this.lock();
    });
    document.addEventListener('pointerlockchange', () => this.onLockChange());
    this.touch = new TouchControls(this);
    this.touchMode = this.touch.enabled;
    this.loop = this.loop.bind(this);
    window.__game = this;
    if (this.qs.has('autostart')) setTimeout(() => this.startMatch(), 300);
  }
  // 大厅只装配本地设置/档案/地图元数据；纹理、WebGL、几何、环境、导航
  // 以及逐帧渲染只在玩家点击出击后创建。同一场景后续重开复用已加载资源。
  async prepareWorld() {
    if (this.worldReady) return;
    if (this._worldPromise) return this._worldPromise;
    this._worldPromise = this.loadWorld()
      .then(() => { this.worldReady = true; })
      .finally(() => { this._worldPromise = null; });
    return this._worldPromise;
  }
  async loadWorld() {
    const mapId = this.mapDesc.id;
    this.hud.show('loading');
    this.hud.loading(0.05, this.t('load.step.renderer'));
    await nextFrame();
    this.renderer = new Renderer(document.getElementById('c'), this.opts.quality);
    this.renderer.camera.fov = this.opts.fov;
    this.hud.loading(0.12, this.t('load.step.textures'));
    await nextFrame(); await nextFrame();
    this.T = buildTextures(this.opts.quality);
    this.hud.loading(0.55, this.tf(mapDisplayKeys(mapId).loading, null, this.mapDesc.loadingLabel));
    await nextFrame();
    this.world = new World();
    const { getMapBuilder } = await import('./maps/index.js'); // 惰性加载：只执行当前图构建器
    const build = await getMapBuilder(mapId) || await getMapBuilder(firstAvailableMapId());
    this.map = build(this.renderer.scene, this.T, this.world);
    this.hud.loading(0.68, this.t(this.mapDesc.env?.ocean === false ? 'load.step.envSky' : 'load.step.envOcean'));
    await nextFrame();
    // 环境配置来自地图描述；阴影体积缺省时由可玩边界推导（运输船在注册表里显式给出以保留船体效果）
    const envOpts = { ...this.mapDesc.env };
    if (!envOpts.shadowBox && this.mapDesc.bounds) {
      const B = this.mapDesc.bounds;
      envOpts.shadowBox = { x0: B.x0 - 4, x1: B.x1 + 4, y0: -3, y1: 26, z0: B.z0 - 4, z1: B.z1 + 4 };
    }
    this.env = new Environment(this.renderer.renderer, this.renderer.scene, this.opts.quality, envOpts);
    this.env.registerExtraScene(this.renderer.vmScene); // 注册即绑定当前 PMREM：修复首局白天武器场景无环境反射（B1a）
    this.env.apply(this.opts.tod);
    this.fx = new Effects(this.renderer.scene, this.T, this.renderer.camera);
    // 船用氛围（烟囱排烟/海鸥）只对提供氛围锚点的地图启用
    const ambientAt = this.mapDesc.ambientKey ? this.map[this.mapDesc.ambientKey] : null;
    if (ambientAt) this.fx.initAmbient(ambientAt);
    this.vm = new ViewModel(this.renderer.vmScene, this.T, this.opts.team);
    this.hud.loading(0.8, this.t('load.step.nav'));
    await nextFrame();
    // 共享导航：图导航图走高度感知寻路，运输船由适配层保持原 NavGrid 行为
    this.nav = createNavigation(this.world, this.mapDesc, this.map);
    // 导航节点索引（id -> node），供阵营目标/架点选取使用
    this.navNodes = new Map();
    if (this.map.navGraph) for (const n of this.map.navGraph.nodes) this.navNodes.set(n.id, n);
    this.hud.buildRadar(this.world, this.mapDesc);
    this.hud.loading(0.88, this.t('load.step.icons'));
    await nextFrame();
    this.hud.setIcons(this.makeIcons());
    this.lampLights();
    this.renderer.camera.position.set(-20, 12, 30); this.renderer.camera.lookAt(0, 2, 0);
    try { this.renderer.renderer.compile(this.renderer.scene, this.renderer.camera); } catch (e) { /* 忽略 */ }
    this.hud.loading(1, this.t('load.step.done'));
    await nextFrame();
  }
  lampLights() {
    // 地图提供的少量真实点光源（隧道/管道内）
    for (const p of (this.map.lampSpots || []).slice(0, this.opts.quality === 'low' ? 0 : 4)) {
      const l = new THREE.PointLight(0xffd9a0, 5, 9, 1.8);
      l.position.copy(p);
      this.renderer.scene.add(l);
    }
  }
  // 玩家当前所处报点区域（来自地图 regions：id/name + XZ/Y 范围），用于小地图标签。
  // 返回 region 对象（id 稳定不变）；显示名经 regionName 走翻译键。
  regionAt(pos) {
    const rs = this.map && this.map.regions;
    if (!rs) return null;
    for (const r of rs) {
      const e = r.extents || r.bounds || r;
      if (e.x0 === undefined || e.x1 === undefined || e.z0 === undefined || e.z1 === undefined) continue;
      if (pos.x < e.x0 || pos.x > e.x1 || pos.z < e.z0 || pos.z > e.z1) continue;
      if (e.y0 !== undefined && (pos.y < e.y0 - 0.6 || pos.y > (e.y1 ?? e.y0) + 2.6)) continue;
      return r;
    }
    return null;
  }
  // 报点显示名：译文走 map.<mapId>.region.<regionId>；目录未覆盖的图/区域回退注册表原值
  regionName(region) {
    if (!region) return null;
    return this.tf(`map.${this.mapDesc.id}.region.${region.id}`, null, region.name || region.id);
  }
  // 地图显示名/加载文案：公开平台图走 map.<id>.name / .loading 翻译键（mapDisplayKeys），回退注册表原值
  mapName() {
    return this.tf(mapDisplayKeys(this.mapDesc.id).name, null, this.mapDesc.name);
  }
  makeIcons() {
    const r = this.renderer.renderer;
    const W = 256, H = 96;
    const rt = new THREE.WebGLRenderTarget(W, H);
    const scene = new THREE.Scene();
    scene.overrideMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
    const out = {};
    const prevColor = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha();
    r.setClearColor(0x000000, 0);
    const buf = new Uint8Array(W * H * 4);
    for (const id of Object.keys(WEAPONS)) {
      const m = buildGunMerged(id);
      scene.add(m);
      const box = new THREE.Box3().setFromObject(m);
      const cz = (box.min.z + box.max.z) / 2, cy = (box.min.y + box.max.y) / 2;
      const hw = (box.max.z - box.min.z) / 2 * 1.08, hh = (box.max.y - box.min.y) / 2 * 1.08;
      const ext = Math.max(hw, hh * W / H);
      cam.left = -ext; cam.right = ext; cam.top = ext * H / W; cam.bottom = -ext * H / W;
      cam.position.set(2, cy, cz); cam.lookAt(0, cy, cz); cam.updateProjectionMatrix();
      r.setRenderTarget(rt); r.clear(); r.render(scene, cam);
      r.readRenderTargetPixels(rt, 0, 0, W, H, buf);
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const ctx = c.getContext('2d'); const img = ctx.createImageData(W, H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const s = ((H - 1 - y) * W + x) * 4, d = (y * W + x) * 4;
        img.data[d] = img.data[d + 1] = img.data[d + 2] = 245; img.data[d + 3] = buf[s + 3] > 10 ? 235 : 0;
      }
      ctx.putImageData(img, 0, 0);
      out[id] = c.toDataURL();
      scene.remove(m);
    }
    r.setRenderTarget(null); r.setClearColor(prevColor, prevAlpha);
    rt.dispose();
    return out;
  }

  // ================= 投掷物效果 / 烟雾 / 练习 / 档案（纯模块接线层） =================
  // 出生投掷物背包：玩家按档案预设排最前 + 目录补齐（he/flash/smoke，顺序即 CATALOG）；
  // bots 只带 he（协调者决策：AI 无投掷型号意识且闪光无队伍豁免，全雷包会造成自闪/自烟漂移）
  grenadeBagFor(a) {
    if (!a.isPlayer) return ['he'];
    const bag = [];
    if (this.profileAdapter) {
      for (const id of this.profileAdapter.loadout().grenades) if (!bag.includes(id)) bag.push(id);
    }
    for (const id of CATALOG.grenade) if (!bag.includes(id)) bag.push(id);
    return bag;
  }
  // 练习靶体可视网格：立杆 + 靶球（命中判定球与 rt.states 半径一致），受击高亮在 renderFrame 刷新
  buildPracticeTargets() {
    const mat = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.55, metalness: 0.15 });
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x4a4d50, roughness: 0.7, metalness: 0.4 });
    for (const s of this.practice.states) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.2, 8), poleMat));
      const ball = new THREE.Mesh(new THREE.SphereGeometry(s.radius, 16, 12), mat.clone());
      ball.position.y = 1.2;
      g.add(ball);
      g.position.set(s.pos.x, s.pos.y - 1.2, s.pos.z); // 杆底落在靶点站立面
      this.renderer.scene.add(g);
      this.practiceMeshes.push({ id: s.id, group: g, mat: ball.material });
    }
  }
  destroyPractice() {
    for (const t of this.practiceMeshes) this.renderer.scene.remove(t.group);
    this.practiceMeshes = [];
    this.practice = null;
  }
  clearSmokes() {
    for (const s of this.smokes) this.renderer.scene.remove(s.mesh);
    this.smokes = [];
  }
  // 烟雾视线接缝（语义同 grenade-effects.smokeBlocksSight）：玩家可见性判定与 WiredBot.canSee 共用
  smokeBlocked(from, to) {
    for (const s of this.smokes) if (s.cloud.blocksSight(from, to)) return true;
    return false;
  }
  // 几何遮挡（HE/闪光共用约定，与现役 explode 一致：起点抬 0.2、末端留 0.3 皮肤）
  sightBlocked(from, to) {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (L < 1e-6) return false;
    return !!this.world.raycast(from.x, from.y + 0.2, from.z, dx / L, dy / L, dz / L, Math.max(0, L - 0.3), 'bullet');
  }
  // 引信事件按 WEAPONS[id].effect 分发（combat 报告契约）
  detonate(n, p) {
    const v = new THREE.Vector3(p.x, p.y, p.z);
    const effect = WEAPONS[n.id]?.effect || 'he';
    if (effect === 'flash') this.flashbang(v);
    else if (effect === 'smoke') this.smokeOut(v);
    else this.explode(v, n.owner);
  }
  // 闪光弹：对每个存活角色结算致盲（computeFlashEffect），写 per-actor blindUntil/blindIntensity
  flashbang(p) {
    this.fx.light(p, 60, 0.3, 0xffffff, 40);
    audio.playFlashPop(p); // 专用闪光起爆音效（phase-6 音频 lane 交付）
    for (const a of this.actors) {
      if (!a.alive) continue;
      const r = computeFlashEffect({
        origin: p,
        // 观察者按眼位结算（与 explode 的 chestWorld 同理）：腰高掩体不应挡住眼可见的闪光
        observer: { pos: a.eye(new THREE.Vector3()), viewDir: a.forward(_d), alive: a.alive, spectating: false },
        isBlocked: (from, to) => this.sightBlocked(from, to),
      });
      if (!r.blinded) continue;
      // 更晚到期的闪光重置 remaining；强度一律取 max——弱闪不得下调既有强致盲
      a.blindUntil = Math.max(a.blindUntil || 0, this.time + r.duration);
      a.blindIntensity = Math.max(a.blindIntensity || 0, r.intensity);
    }
  }
  // 烟雾弹：规则体积在 SmokeCloud（grenade-effects 唯一视线接缝），视觉网格由本层同步
  smokeOut(p) {
    const cloud = new SmokeCloud({ pos: { x: p.x, y: p.y, z: p.z } });
    const mesh = new THREE.Mesh(
      // 视觉半径与 blocksSight 的规则半径一致：视线遮挡外缘不得超出可见烟体
      new THREE.SphereGeometry(cloud.radius, 18, 14),
      new THREE.MeshLambertMaterial({ color: 0xc2c4c6, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    mesh.position.set(p.x, p.y + 0.9, p.z);
    mesh.scale.setScalar(0.25);
    this.renderer.scene.add(mesh);
    this.smokes.push({ cloud, mesh });
    audio.playSmokePop(p); // 专用烟雾起爆音效（phase-6 音频 lane 交付）
  }
  updateSmokes(dt) {
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      s.cloud.advance(dt);
      if (s.cloud.expired()) {
        this.renderer.scene.remove(s.mesh);
        this.smokes.splice(i, 1);
        continue;
      }
      const o = s.cloud.opacity();
      s.mesh.material.opacity = 0.85 * o;
      s.mesh.scale.setScalar(0.25 + 0.75 * Math.min(1, s.cloud.age / 1.5));
    }
  }

  // ================= 流程 =================
  startMatch() {
    if (this._startPromise) return this._startPromise;
    if (!this.worldReady) {
      this._startPromise = this.prepareWorld()
        .then(() => this.startMatchReady())
        .catch((e) => {
          console.error(e);
          const message = e && e.message ? e.message : String(e);
          this.hud.el.menuError.textContent = this.t('load.fail', { msg: message });
          this.hud.el.menuError.classList.remove('hidden');
          this.hud.el.btnStart.disabled = true;
          this.hud.show('menu');
        })
        .finally(() => { this._startPromise = null; });
      return this._startPromise;
    }
    return this.startMatchReady();
  }
  startMatchReady() {
    const o = this.opts;
    // 模式解析：URL ?mode= 优先（菜单模式选择 UI 属 HUD lane），其余走地图默认；
    // 请求模式必须是该图 supportedModes 之一，否则回退默认
    const supported = Array.isArray(this.mapDesc.supportedModes) ? this.mapDesc.supportedModes : [];
    const requested = this.qs.get('mode') || o.mode;
    this.mode = getMode(supported.includes(requested) ? requested : this.mapDesc.defaultMode);
    audio.init(); audio.setVolumes({ master: o.vol }); audio.startAmbient(); audio.playUI('start');
    this.endBombSession();
    this.destroyPractice();
    this.clearSmokes();
    for (const a of this.actors) {
      this.renderer.scene.remove(a.soldier.root);
      disposeActorGpu(a);
    }
    for (const t of this.tags) {
      this.renderer.scene.remove(t.sprite);
      // 名牌 CanvasTexture 不 dispose 会随每局重开单调泄漏（acceptance §3）
      t.sprite.material.map?.dispose();
      t.sprite.material.dispose();
    }
    for (const n of this.nades) this.renderer.scene.remove(n.mesh);
    this.actors = []; this.nades = []; this.tags = []; this.timers = [];
    this.score = { BL: 0, GR: 0 };
    this.matchId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    this.playerObjectiveActions = 0; this.lastAward = null;
    this.goal = o.goal; this.timeLeft = this.mode.defaults.time;
    this.env.apply(o.tod);
    const my = o.team, other = my === 'BL' ? 'GR' : 'BL';
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    let id = 0;
    this.player = new Player(this, { id: id++, name: this.t('player.self'), team: my });
    // 激活预设是出生装备的权威来源；旧菜单偏好只用于首次档案迁移与降级兜底。
    this.player.primary = this.profileAdapter?.loadout().primary || o.primary || 'ak47';
    this.player.bind(document.getElementById('c'));
    this.actors.push(this.player);
    const N = this.mode.id === 'bomb' ? 5 : this.mode.id === 'practice' ? 0 : o.size; // 爆破固定 5v5，练习无敌军
    // 练习模式：靶场运行时 + 靶体可视网格（两地图靶点元数据来自注册表）
    if (this.mode.id === 'practice') {
      this.practice = new PracticeRuntime({ spots: this.mapDesc.practiceTargets || [] });
      this.buildPracticeTargets();
    }
    const prim = (team, i) => {
      if (i === 1 && N >= 4) return 'awm';
      if (i === 3 && N >= 6) return 'mp5';
      if (i === 5) return team === 'BL' ? 'm4a1' : 'ak47';
      return team === 'BL' ? 'ak47' : 'm4a1';
    };
    for (const team of [my, other]) {
      const count = team === my ? N - 1 : N;
      for (let i = 0; i < count; i++) {
        const b = new WiredBot(this, { id: id++, name: names.pop() || 'Bot' + id, team, diff: o.diff });
        b.primary = prim(team, team === my ? i + 1 : i);
        this.actors.push(b);
        if (team === my) this.addTag(b);
      }
    }
    for (const a of this.actors) this.spawnActor(a, true);
    this.vm.setTeam(my); this.vm.equip(this.player.weapon.id, 0.6);
    this.hud.slots(this.player.inv, 0);
    // 练习面板初始武器名与玩家出生主武器一致（只种 current，不占用按钮高亮的槽位语义）
    if (this.practice) this.practice.current = this.player.weapon.id;
    // 爆破模式控制器：回合流转/计时/胜负全部在 BombSession（持有纯规则引擎 BombMatch），
    // Game 只做统一复活与事件/场景协调；首个 spawnAll 由会话 start() 触发
    if (this.mode.id === 'bomb') {
      this.bombSession = new BombSession({
        roster: this.actors.map((a) => ({ id: a.id, team: a.team, name: a.name })),
        bombSites: this.map.bombSites || [],
        hooks: {
          spawnAll: () => this.spawnAllActors(),
          onEvents: (events) => this.onBombEvents(events),
        },
      });
      this.bomb = this.bombSession.match;
      this.c4 = this.makeC4Marker();
      this.bombSession.start();
    }
    this.playing = true; this.paused = false; this.ended = false;
    this.hud.show(null);
    document.getElementById('c').style.visibility = 'visible';
    this.startLoop();
    this.lock();
    setTimeout(() => audio.announce('Go go go!'), 400);
    this.hud.toast(this.mode.toast(this.goal, (k, p) => this.t(k, p)), 3.5);
  }
  addTag(b) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 48;
    const x = c.getContext('2d');
    x.font = 'bold 30px "PingFang SC","Microsoft YaHei",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 5; x.strokeStyle = 'rgba(0,0,0,.8)'; x.strokeText(b.name, 128, 24);
    x.fillStyle = b.team === 'BL' ? '#ff9b70' : '#8cc8ff'; x.fillText(b.name, 128, 24);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, opacity: 0.85, toneMapped: false }));
    s.scale.set(1.3, 0.244, 1); s.renderOrder = 20;
    this.renderer.scene.add(s);
    this.tags.push({ sprite: s, actor: b });
  }
  spawnActor(a, first) {
    let pts = this.map.spawns[a.team];
    // 边界契约：出生点必须落在可玩区域内（数据异常时回退全部点）
    const B = this.mapDesc.bounds;
    if (B) {
      const inB = pts.filter((p) => p.x >= B.x0 && p.x <= B.x1 && p.z >= B.z0 && p.z <= B.z1);
      if (inB.length) pts = inB;
    }
    let best = null, bestScore = -1e9;
    for (const p of pts) {
      let sc = Math.random() * 3;
      for (const o of this.actors) {
        if (!o.alive || o === a) continue;
        const d = Math.hypot(o.pos.x - p.x, o.pos.z - p.z);
        if (d < 1.2) sc -= 100;
        if (o.team !== a.team) sc += Math.min(d, 40) * 0.1;
      }
      if (sc > bestScore) { bestScore = sc; best = p; }
    }
    // 出生投掷物背包：档案 loadout 的雷种在前，其余装备目录型号补齐（各自 count 上限内轮换）
    a.spawnGrenades = this.grenadeBagFor(a);
    a.spawn(best);
    if (a instanceof Bot) a.onSpawn();
    if (a.isPlayer) {
      a.deathCam = null;
      this.vm.equip(a.weapon.id, first ? 0.6 : 0.5);
      this.vm.setVisible(true);
      this.hud.slots(a.inv, a.slot);
      audio.setLowHealth(false);
    }
  }
  lock() {
    if (this.touchMode || this.qs.has('nolock')) { this.locked = true; return; }
    const c = document.getElementById('c');
    try {
      const p = c.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { c.requestPointerLock(); } catch (e) { /* 忽略 */ } });
    } catch (e) { try { c.requestPointerLock(); } catch (e2) { /* 忽略 */ } }
  }
  onLockChange() {
    this.locked = document.pointerLockElement === document.getElementById('c');
    document.body.classList.toggle('lk', this.locked);
    if (this.locked) {
      if (this.paused) this.resume(true);
    } else if (this.playing && !this.ended && !this.inLoadout && !this.qs.has('nolock')) {
      this.pause();
    }
  }
  pause() {
    this.paused = true; this.hud.show('pause');
    this.hud.scoreboard(false);
    this.stopLoop();
  }
  resume(fromLock) {
    this.paused = false; this.hud.show(null);
    this.startLoop();
    if (!fromLock) this.lock();
  }
  quitToMenu() {
    this.playing = false; this.paused = false; this.ended = true;
    this.stopLoop();
    this.endBombSession();
    this.destroyPractice();
    this.clearSmokes();
    audio.stopAmbient(); audio.setLowHealth(false);
    for (const a of this.actors) {
      this.renderer.scene.remove(a.soldier.root);
      disposeActorGpu(a);
    }
    for (const t of this.tags) {
      this.renderer.scene.remove(t.sprite);
      t.sprite.material.map?.dispose();
      t.sprite.material.dispose();
    }
    this.actors = []; this.tags = [];
    this.player = null;
    this.vm.setVisible(false);
    if (document.pointerLockElement) document.exitPointerLock();
    document.getElementById('c').style.visibility = 'hidden';
    this.hud.show('menu');
    this.requestPlatformAd('menu-return'); // 自然断点：返回菜单（非交战中/回合间）
  }
  toggleLoadout() {
    if (!this.playing) return;
    if (this.inLoadout) { this.closeLoadout(); return; }
    this.inLoadout = true; this.hud.show('loadout');
    for (const x of document.querySelectorAll('#loadCards .card')) x.classList.toggle('on', x.dataset.w === (this.player.nextPrimary || this.player.primary));
    if (document.pointerLockElement) document.exitPointerLock();
  }
  closeLoadout() {
    this.inLoadout = false; this.hud.show(null); this.lock();
  }
  chooseLoadout(id) {
    const p = this.player;
    p.nextPrimary = id; this.opts.primary = id; this.hud.saveOpts();
    if (this.profileAdapter) {
      const active = this.profileAdapter.presets().active;
      this.profileAdapter.setPresetSlot(active, 'primary', id);
    }
    const inSpawn = p.alive && inSpawnZone(this.mapDesc, p.team, p.pos);
    if (inSpawn) {
      p.primary = id; p.inv[0] = new (p.inv[0].constructor)(id); p.inv[0].patternSeed = Math.random() * 6;
      p.slot = 0; p.readyAt = this.time + WEAPONS[id].draw; p.soldier.setWeapon(id);
      this.onSwitch(p); // 统一 vm/切枪音/HUD 槽位/练习运行时（selectWeapon）同步
      this.hud.toast(this.t('hud.weaponEquipped', { weapon: this.weaponName(id) }), 1.5);
    } else this.hud.toast(this.t('hud.weaponOnRespawn', { weapon: this.weaponName(id) }), 1.5);
    audio.playUI('buy');
  }
  onOption(k, v) {
    if (k === 'primary' && this.profileAdapter) {
      const active = this.profileAdapter.presets().active;
      this.profileAdapter.setPresetSlot(active, 'primary', v);
    }
    if (k === 'vol') audio.setVolumes({ master: v });
    if (k === 'fov' && this.renderer) { this.renderer.camera.fov = v; this.renderer.camera.updateProjectionMatrix(); }
    if (k === 'tod' && this.env) this.env.apply(v);
    if (k === 'quality' && this.worldReady) { this.hud.saveOpts(); location.reload(); }
    if (k === 'map') {
      this.hud.saveOpts();
      if (this.worldReady) location.reload();
      else {
        this.mapDesc = getMapDescriptor(v);
        this.hud.setMapInfo(this.mapDesc);
        this.hud.syncControls();
      }
    }
    if (k === 'team' && this.vm) this.vm.setTeam(v);
  }
  endMatch() {
    this.ended = true; this.playing = false;
    const my = this.player.team;
    const win = this.mode.result(this.score, my);
    this.awardProfileResult(win);
    this.hud.endScreen(win, this.score, this.actors, this.player.id);
    audio.playUI('roundEnd'); audio.setLowHealth(false);
    audio.announce(win ? 'Mission accomplished' : win === null ? 'Draw' : 'Mission failed');
    if (document.pointerLockElement) document.exitPointerLock();
    this.vm.setVisible(false);
    this.stopLoop();
    this.requestPlatformAd('match-end'); // 自然断点：整场结束（对局已收口，非回合间）
  }

  // 每局恰好一次的军衔结算：仅竞技模式（tdm/bomb），练习不调（service 白名单亦兜底拒绝）。
  // key 跨重试稳定且每局唯一；返回值存 lastAward 供结算 HUD 消费（lane 3 契约）。
  awardProfileResult(win) {
    if (!this.profileAdapter || !this.player) return null;
    if (this.mode.id !== 'tdm' && this.mode.id !== 'bomb') return null;
    const res = this.profileAdapter.awardMatch({
      key: `${this.mode.id}:${this.matchId}`,
      mode: this.mode.id,
      outcome: win === true ? 'win' : win === false ? 'loss' : 'draw',
      kills: this.player.stats.k,
      objectiveActions: this.playerObjectiveActions,
    });
    this.lastAward = res;
    if (res.awarded && res.rankUp) {
      this.hud.toast(this.t('hud.rankUpToast', { rank: this.rankName(res.rank.level, res.rank.rankName), xp: res.xp }), 4);
    }
    return res;
  }

  // ================= 爆破协调（规则在 BombSession/BombMatch，这里只做场景/音频/公共接口） =================
  // 丢弃当前会话：断开钩子、移除世界 C4 标记（重开/退回菜单时不得残留事件或计时）
  endBombSession() {
    if (this.bombSession) { this.bombSession.destroy(); this.bombSession = null; }
    this.bomb = null;
    if (this.c4) { this.renderer.scene.remove(this.c4.root); this.c4 = null; }
  }
  spawnAllActors() {
    for (const a of this.actors) this.spawnActor(a);
    this.killedBy = null;
  }
  // 玩家/机器人共用的目标命令入口（E 拆包/拾取、G 丢包、持包安放、机器人 C4 行为都走这里）。
  // 纯转发：目标行动 XP 记账只认引擎完成事件（onBombEvents），命令通道不计数（防连点刷分）
  objectiveCommand(type, actorId, pos) {
    if (!this.bombSession) return false;
    return this.bombSession.command(type, actorId, pos);
  }
  // 目标视图：可序列化快照 + plantable/defusable/pickupable/inSite 提示；非爆破模式恒为 null
  objectiveView(actorId) {
    if (!this.bombSession) return null;
    return this.bombSession.view(actorId !== undefined ? actorId : (this.player && this.player.id));
  }
  // 受控确定性测试钩子（仅 e2e/规则验证脚本使用）：精确摆位角色以验证规则边界；不用于玩法或 AI 证据
  __bombPlace(actorId, x, y, z) {
    const a = this.actors.find((t) => t.id === actorId);
    if (!a) return false;
    a.pos.set(x, y, z); a.vel.set(0, 0, 0);
    return true;
  }
  makeC4Marker() {
    const root = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.14, 0.24),
      new THREE.MeshStandardMaterial({ color: 0x2c2c2e, roughness: 0.6, metalness: 0.3 }),
    );
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.06), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    lamp.position.set(0.09, 0.085, 0);
    root.add(lamp);
    root.visible = false;
    this.renderer.scene.add(root);
    return { root, lamp };
  }
  // 世界 C4 标记：位置与可见性完全来自规则引擎公开状态（dropped/planted），每帧同步
  syncC4World() {
    if (!this.c4) return;
    const b = this.bomb && this.bomb.bomb;
    const root = this.c4.root;
    if (b && b.dropped && b.pos) {
      root.visible = true;
      root.position.set(b.pos.x, (b.pos.y || 0) + 0.08, b.pos.z);
    } else if (b && b.planted) {
      const site = (this.map.bombSites || []).find((s) => s.id === b.site);
      const p = b.pos || (site ? { x: site.x, y: site.y, z: site.z } : null);
      if (p) { root.visible = true; root.position.set(p.x, (p.y || 0) + 0.08, p.z); }
    } else root.visible = false;
    this.c4.lamp.visible = !!(b && b.planted && Math.sin(this.realTime * 8) > 0);
  }
  // 爆破语义事件 → 音频/HUD/特效协调；规则结算本身一次性来自引擎，这里不做二次判定
  onBombEvents(events) {
    for (const ev of events) {
      switch (ev.type) {
        case 'roundStart':
          this.score = { ...this.bomb.score };
          break;
        case 'phaseLive':
          audio.announce('Go go go!');
          break;
        case 'bombPlanted':
          audio.announce('Bomb has been planted');
          this.hud.toast(this.t('bomb.plantedSite', { site: `<b style="color:#f5b321">${ev.site}</b>` }), 3);
          if (ev.actorId === (this.player && this.player.id)) this.playerObjectiveActions++;
          break;
        case 'bombDefused':
          audio.announce('Bomb has been defused');
          if (ev.actorId === (this.player && this.player.id)) this.playerObjectiveActions++;
          break;
        case 'bombPickedUp':
          // 引擎对每次真实拾取恰好发一次（需包在地面且在可拾取位）；玩家归属计数
          if (ev.actorId === (this.player && this.player.id)) this.playerObjectiveActions++;
          break;
        case 'bombExploded': {
          const site = (this.map.bombSites || []).find((s) => s.id === ev.site);
          const p = site ? new THREE.Vector3(site.x, (site.y || 0) + 0.5, site.z) : this.renderer.camera.position;
          this.fx.explosion(p);
          audio.playExplosion(p);
          break;
        }
        case 'roundEnded':
          this.score = { ...this.bomb.score };
          audio.playUI('roundEnd');
          this.hud.toast(this.t('bomb.roundEndReason', {
            team: `<b>${this.t(ev.winner === 'BL' ? 'team.bl.name' : 'team.gr.name')}</b>`,
            reason: BOMB_REASON_KEYS[ev.reason] ? this.t(BOMB_REASON_KEYS[ev.reason]) : ev.reason,
          }), 3);
          break;
        case 'matchEnded':
          this.endMatch();
          break;
      }
    }
  }

  // ================= 战斗 =================
  fireWeapon(a, ws, spread) {
    const d = ws.def;
    const eye = a.eye(new THREE.Vector3());
    const dir = a.forward(new THREE.Vector3());
    jitterDir(dir, spread, Math.random);
    let muzzle;
    if (a.isPlayer) {
      const cam = this.renderer.camera;
      const right = _v2.set(1, 0, 0).applyQuaternion(cam.quaternion);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
      muzzle = cam.position.clone().addScaledVector(dir, 0.9).addScaledVector(right, 0.14).addScaledVector(up, -0.1);
      this.vm.fire();
      this.fx.light(cam.position.clone().addScaledVector(dir, 1.2), d.type === 'sniper' ? 10 : 5, 0.06);
      audio.playShot(d.sound, null);
      if (Math.random() < 0.5) audio.playShellDrop(null);
    } else {
      muzzle = a.soldier.muzzleWorld(new THREE.Vector3());
      this.fx.muzzle(muzzle, dir, d.type === 'sniper' ? 1.6 : d.type === 'smg' ? 0.8 : 1);
      a.soldier.kick();
      audio.playShot(d.sound, muzzle);
    }
    a.radarT = 1.6;
    // 让附近的机器人听到
    for (const b of this.actors) if (b !== a && b.hear && b.team !== a.team && b.pos.distanceTo(a.pos) < 45) b.hear(a.pos, true);
    const end = this.traceBullet(a, eye, dir, d);
    // 练习靶登记（仅玩家即时弹道；近战/投掷物不走此接缝）。
    // P3-4 契约：maxDist = min(range, 墙面射线距离 - skin)，隔墙靶不得穿墙登记
    if (this.practice && a.isPlayer && d.type !== 'melee' && d.type !== 'grenade') {
      const wall = this.world.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, d.range, 'move');
      const maxDist = Math.min(d.range, (wall ? wall.t : d.range) - 0.07);
      if (maxDist > 0) this.practice.hitScan(eye, dir, maxDist);
    }
    if (!a.isPlayer || Math.random() < 0.35 || d.type === 'sniper') this.fx.tracer(muzzle, end);
    // 子弹掠过玩家
    const p = this.player;
    if (p && p.alive && a !== p && a.team !== p.team) {
      const hp = p.eye(_v);
      const t = _d.copy(hp).sub(eye).dot(dir);
      if (t > 2 && t < eye.distanceTo(end)) {
        const closest = eye.clone().addScaledVector(dir, t);
        if (closest.distanceTo(hp) < 1.3) audio.playBulletWhiz(closest);
      }
    }
  }
  traceBullet(shooter, o, dir, d) {
    const range = d.range;
    const hits = this.world.raycastAll(o.x, o.y, o.z, dir.x, dir.y, dir.z, range);
    let power = d.pen, mul = 1, wall = false, from = 0;
    this.frame++;
    for (let i = 0; i <= hits.length; i++) {
      const h = hits[i];
      const lim = h ? h.t : range;
      // 角色命中
      let best = null, bestT = lim, part = null;
      for (const a of this.actors) {
        if (!a.alive || a === shooter || a.team === shooter.team) continue;
        const r = a.soldier.hitTest(o, dir, bestT, this.frame);
        if (r && r.t > from - 0.01 && r.t < bestT) { best = a; bestT = r.t; part = r.part; }
      }
      if (best) {
        const pt = o.clone().addScaledVector(dir, bestT);
        const dist = bestT;
        const partMul = part === 'head' ? d.headMul : part === 'arm' || part === 'leg' ? d.limbMul : 1;
        const dmg = d.dmg * mul * Math.pow(d.falloff, dist / 10) * partMul;
        this.fx.impact(pt, _v.copy(dir).negate(), 'flesh', dir);
        if (part === 'head') this.fx.impact(pt, _v.copy(dir).negate(), 'flesh', dir);
        audio.playImpact(pt, 'flesh');
        this.damage(best, shooter, dmg, part, d.id, dir, wall);
        return pt;
      }
      if (!h) break;
      const pt = o.clone().addScaledVector(dir, h.t);
      const n = new THREE.Vector3(h.nx, h.ny, h.nz);
      const mat = h.collider.mat;
      this.fx.impact(pt, n, mat, dir);
      if (pt.distanceTo(this.renderer.camera.position) < 40) audio.playImpact(pt, mat === 'wood' ? 'wood' : 'metal');
      if (h.collider.bullet === 'pen') {
        const thick = h.exit - h.t;
        const cost = thick * (mat === 'wood' ? 1.0 : 1.9);
        if (power > cost) {
          power -= cost; mul *= 0.6; wall = true; from = h.exit;
          const ep = o.clone().addScaledVector(dir, h.exit);
          this.fx.impact(ep, dir.clone(), mat, dir);
          continue;
        }
      } else if (Math.random() < 0.08 && mat === 'metal') audio.playRicochet(pt);
      return pt;
    }
    return o.clone().addScaledVector(dir, range);
  }
  melee(a, heavy) {
    const d = WEAPONS.knife;
    const range = heavy ? d.rangeHeavy : d.rangeLight;
    const eye = a.eye(new THREE.Vector3());
    const base = a.forward(new THREE.Vector3());
    if (a.isPlayer) this.vm.melee(heavy);
    this.frame++;
    let hit = null;
    for (const off of [0, 0.12, -0.12, 0.24, -0.24]) {
      const dir = base.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), off);
      for (const b of this.actors) {
        if (!b.alive || b === a || b.team === a.team) continue;
        const r = b.soldier.hitTest(eye, dir, range, this.frame);
        if (r && (!hit || r.t < hit.t)) hit = { a: b, t: r.t, part: r.part, dir };
      }
      if (hit) break;
    }
    const delay = heavy ? 0.33 : 0.1;
    this.timers.push({
      t: this.time + delay, fn: () => {
        if (!a.alive) return;
        if (hit && hit.a.alive) {
          const vf = hit.a.forward(new THREE.Vector3()); vf.y = 0; vf.normalize();
          const back = vf.dot(_v.copy(hit.dir).setY(0).normalize()) > 0.5;
          let dmg = heavy ? d.dmgHeavy : d.dmgLight;
          if (back) dmg *= heavy ? 2 : 1.6;
          if (hit.part === 'head') dmg *= 1.3;
          const pt = eye.clone().addScaledVector(hit.dir, hit.t);
          this.fx.impact(pt, hit.dir.clone().negate(), 'flesh', hit.dir);
          audio.playKnife(heavy ? 'heavy' : 'light', 'flesh', a.isPlayer ? null : eye);
          this.damage(hit.a, a, dmg, hit.part, 'knife', hit.dir, false, true);
        } else {
          const w = this.world.raycast(eye.x, eye.y, eye.z, base.x, base.y, base.z, range, 'bullet');
          if (w) {
            const pt = eye.clone().addScaledVector(base, w.t);
            this.fx.impact(pt, new THREE.Vector3(w.nx, w.ny, w.nz), w.collider.mat, base);
            audio.playKnife(heavy ? 'heavy' : 'light', 'wall', a.isPlayer ? null : eye);
          } else audio.playKnife(heavy ? 'heavy' : 'light', 'miss', a.isPlayer ? null : eye);
        }
      },
    });
  }
  throwGrenade(a) {
    const eye = a.eye(new THREE.Vector3());
    const dir = a.forward(new THREE.Vector3());
    const right = new THREE.Vector3(Math.cos(a.yaw), 0, -Math.sin(a.yaw));
    const pos = eye.clone().addScaledVector(dir, 0.5).addScaledVector(right, 0.12);
    const id = a.weapon.def.id; // 持哪枚投哪枚（slot 3 轮换由 actor 层完成）
    const def = WEAPONS[id] || WEAPONS.he;
    const vel = computeThrowVelocity({ dir, actorVel: a.vel });
    const mesh = buildGunMerged(id); mesh.scale.setScalar(1.3);
    mesh.position.copy(pos); this.renderer.scene.add(mesh);
    // 运动为纯核心 GrenadeProjectile（数值与现役手写积分逐位等价）；spin/网格是表现层
    const proj = new GrenadeProjectile({ pos, vel, fuse: def.fuse });
    this.nades.push({ mesh, id: def.id, owner: a, proj, spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, 0) });
    audio.playGrenadeThrow();
    if (a.isPlayer) audio.announce('Fire in the hole!');
    for (const b of this.actors) if (b.hear && b.team !== a.team && b.pos.distanceTo(pos) < 20) b.hear(pos, false);
  }
  updateNades(dt) {
    const W = this.world;
    // GrenadeProjectile 注入约定：(pos, dir, len) → {t,nx,ny,nz}|null，与 world.raycast('move') 对齐
    const raycast = (pos, dir, len) => W.raycast(pos.x, pos.y, pos.z, dir.x, dir.y, dir.z, len, 'move');
    this.nades = this.nades.filter((n) => {
      const events = n.proj.step(dt, raycast);
      n.mesh.position.set(n.proj.pos.x, n.proj.pos.y, n.proj.pos.z);
      for (const ev of events) {
        if (ev.type === 'bounce') {
          n.spin.multiplyScalar(0.6);
          if (ev.impactSpeed > 2) audio.playGrenadeBounce(new THREE.Vector3(ev.pos.x, ev.pos.y, ev.pos.z));
        } else if (ev.type === 'fuse') {
          this.detonate(n, ev.pos);
          this.renderer.scene.remove(n.mesh);
          return false;
        }
      }
      n.mesh.rotation.x += n.spin.x * dt; n.mesh.rotation.y += n.spin.y * dt;
      return true;
    });
  }
  explode(p, owner) {
    // 现役 HE 结算路径保留（队伍免疫/半径衰减/遮挡减伤与 computeHeBlast 数值一致，
    // 由 grenade-effects 单测锁定默认值对齐）；经 GrenadeProjectile 的 fuse 事件触发
    const d = WEAPONS.he;
    this.fx.explosion(p);
    audio.playExplosion(p);
    const camD = this.renderer.camera.position.distanceTo(p);
    this.fx.shake = Math.max(this.fx.shake, Math.max(0, 1.4 - camD / 18));
    for (const a of this.actors) {
      if (!a.alive) continue;
      if (a.team === owner.team && a !== owner) continue;
      const c = a.soldier.chestWorld(new THREE.Vector3());
      const dist = c.distanceTo(p);
      if (dist > d.radius) continue;
      const dir = c.clone().sub(p); const L = dir.length(); dir.divideScalar(L || 1);
      const blocked = this.world.raycast(p.x, p.y + 0.2, p.z, dir.x, dir.y, dir.z, Math.max(0, L - 0.3), 'bullet');
      let dmg = d.dmg * Math.pow(1 - dist / d.radius, 1.1);
      if (blocked) dmg *= 0.2;
      if (dmg > 1) this.damage(a, owner, dmg, 'chest', 'he', dir, false);
    }
    for (const b of this.actors) if (b.hear && b.pos.distanceTo(p) < 40) b.hear(p, true);
  }
  damage(v, att, amt, part, wid, dir, wall, melee) {
    if (!v.alive || v.protectT > 0) return;
    if (att && att !== v && att.team === v.team) return;
    const def = WEAPONS[wid];
    let hpD = amt;
    if (v.armor > 0 && part !== 'leg') {
      const ap = def?.armorPen ?? 0.75;
      hpD = amt * ap;
      v.armor = Math.max(0, v.armor - amt * (1 - ap) * 1.4);
    }
    v.hp -= hpD;
    v.lastAttacker = att; v.lastHurt = this.time;
    v.hurtTick = this.tick; // 本帧受伤事实（安包/拆包会被打断）
    const killed = v.hp <= 0;
    if (att && att !== v) att.stats.hits++;
    if (v.isPlayer) {
      if (att && att !== v) this.hud.damageFrom(Math.atan2(-(att.pos.x - v.pos.x), -(att.pos.z - v.pos.z)));
      v.aimPunch += Math.min(0.05, hpD * 0.0012);
      audio.playHurt(Math.min(100, hpD));
      this.dmgFlash = Math.min(1.2, (this.dmgFlash || 0) + hpD / 45);
      if (v.hp <= 30 && !killed) audio.setLowHealth(true);
    } else if (v.onDamaged) v.onDamaged(att);
    if (att && att.isPlayer && att !== v) {
      this.hud.hitmarker(part === 'head', killed);
      audio.playHitmarker(part === 'head');
    }
    if (killed) this.kill(v, att, wid, part === 'head' && !melee, wall, dir);
  }
  kill(v, att, wid, hs, wall, dir) {
    v.alive = false; v.hp = 0; v.deadT = 0; v.respawnT = this.mode.defaults.respawn; v.stats.d++;
    v.scoped = 0;
    v.soldier.die(dir.x, dir.z, hs);
    audio.playDeath(v.soldier.chestWorld(new THREE.Vector3()));
    const p = this.player;
    if (att && att !== v) {
      att.stats.k++; if (hs) att.stats.hs++;
      if (this.mode.scoreKills !== false) this.score[att.team]++; // 爆破比分是回合数，击杀不计
      att.multi = this.time - att.lastKillT < 5 ? att.multi + 1 : 1;
      att.lastKillT = this.time; att.streak++;
    }
    this.hud.killFeed(att && att !== v ? att : null, v, wid, hs, wall, att === p || v === p);
    if (att === p && v !== p) {
      const m = Math.min(att.multi, 8);
      const badge = killBadgeText((k, params) => this.t(k, params), { multi: m, headshot: hs, weaponId: wid, wall, victimName: v.name });
      if (m >= 2) setTimeout(() => audio.announce(MULTI[m].toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) + '!'), 150);
      else if (hs) setTimeout(() => audio.announce('Headshot!'), 150);
      this.hud.badge(badge.text, badge.sub, hs);
      audio.playKillConfirm(hs);
    }
    if (v === p) {
      p.startDeathCam(att);
      this.vm.setVisible(false);
      audio.setLowHealth(false);
      this.killedBy = att && att !== v
        ? killedByText((k, params) => this.t(k, params), { attackerName: att.name, attackerTeam: att.team, weapon: this.weaponName(wid), headshot: hs })
        : this.t('hud.dead');
    }
    this.fx.bloodSplat(v.pos);
    if (this.mode.checkEnd(this.score, this.goal)) setTimeout(() => { if (this.playing) this.endMatch(); }, 1200);
  }

  // ================= 事件音效 =================
  onJump(a) { audio.playJump(a.isPlayer ? null : a.pos.clone()); }
  onLand(a, sp) { audio.playLand(a.isPlayer ? null : a.pos.clone(), a.ground?.surface || 'metal', Math.min(1, sp / 10)); }
  onFootstep(a) {
    if (!a.isPlayer && a.pos.distanceTo(this.renderer.camera.position) > 30) return;
    audio.playFootstep(a.isPlayer ? null : a.pos.clone(), a.ground?.surface || 'metal', { run: true, crouch: a.crouch });
    if (!a.walk) for (const b of this.actors) if (b.hear && b.team !== a.team && b.pos.distanceTo(a.pos) < 12) b.hear(a.pos, false);
  }
  onSwitch(a) {
    if (!a.isPlayer) return;
    this.vm.equip(a.weapon.id, a.weapon.def.draw);
    audio.playWeaponSwitch(a.weapon.id);
    this.hud.slots(a.inv, a.slot);
    // 练习任意换枪：把实际切换同步进运行时（校验/槽位语义由 PracticeRuntime 保证）
    if (this.practice) this.practice.selectWeapon(a.weapon.id);
  }
  onReloadStart(a, empty) {
    if (!a.isPlayer) return;
    const d = a.weapon.def, t = this.time, id = d.id;
    this.vm.reload(d.reload, empty);
    this.timers.push({ t: t + d.reload * 0.2, fn: () => audio.playReload(id, 'magout') });
    this.timers.push({ t: t + d.reload * 0.6, fn: () => audio.playReload(id, 'magin') });
    if (empty) this.timers.push({ t: t + d.reload * 0.82, fn: () => audio.playReload(id, id === 'awm' ? 'bolt' : 'boltback') });
    if (empty) this.timers.push({ t: t + d.reload * 0.88, fn: () => audio.playReload(id, 'boltforward') });
  }
  onReloadDone() { }
  onScope(a) { if (a.isPlayer) audio.playScope(a.scoped > 0); }
  onDryFire(a) { if (a.isPlayer) audio.playDryFire(); }
  onGrenadeStart(a) { if (a.isPlayer) { this.vm.throwNade(); audio.playGrenadePin(); } }

  // ================= 主循环 =================
  startLoop() {
    if (this._loopRunning || !this.renderer) return;
    this._loopRunning = true;
    this.last = performance.now();
    this._raf = requestAnimationFrame(this.loop);
  }
  stopLoop() {
    this._loopRunning = false;
    if (this._raf != null) cancelAnimationFrame(this._raf);
    this._raf = null;
  }
  loop(now) {
    if (!this._loopRunning) return;
    this._raf = requestAnimationFrame(this.loop);
    let dt = (now - this.last) / 1000; this.last = now;
    if (dt > 0.1) dt = 0.1;
    if (dt <= 0) return;
    const R = this.renderer;
    this.realTime = (this.realTime || 0) + dt;
    const active = this.playing && !this.paused && !this.adPaused; // 广告期间冻结模拟（输入已锁）
    if (active) this.simulate(dt);
    this.renderFrame(dt);
  }
  // 调试：无渲染快进
  fastForward(seconds, step = 1 / 30) {
    for (let t = 0; t < seconds && this.playing; t += step) this.simulate(step);
    return { score: this.score, time: this.time.toFixed(1), kills: this.actors.map((a) => a.name + ':' + a.stats.k + '/' + a.stats.d).join(' ') };
  }
  simulate(dt) {
    const cam = this.renderer.camera;
    {
      this.time += dt;
      this.tick++;
      this.timeLeft -= dt;
      for (let i = this.timers.length - 1; i >= 0; i--) if (this.time >= this.timers[i].t) { const f = this.timers[i].fn; this.timers.splice(i, 1); f(); }
      this.player.update(dt);
      for (const a of this.actors) {
        if (a.isPlayer) continue;
        a.update(dt);
      }
      for (const a of this.actors) {
        a.radarT = Math.max(0, a.radarT - dt);
        if (a.alive) {
          a.protectT = Math.max(0, a.protectT - dt);
          const s = a.soldier;
          s.root.position.copy(a.pos);
          s.root.rotation.y = a.yaw;
          const fwd = (a.vel.x * -Math.sin(a.yaw) + a.vel.z * -Math.cos(a.yaw)) / Math.max(0.01, a.speed || 0);
          s.update(dt, { speed: a.speed || 0, fwd, crouch: a.crouch, pitch: a.pitch + a.punchP, onGround: a.onGround, reloading: a.weapon?.reloading });
          // 出生保护闪烁
          if (!a.isPlayer) s.mesh.visible = !(a.protectT > 0 && Math.sin(this.time * 30) > 0.3);
        } else {
          a.deadT += dt;
          a.soldier.update(dt, {});
          // 复活由模式适配器决定：爆破无个体复活（respawnT 为 null），统一回合复活走会话 spawnAll
          if (a.respawnT != null) {
            a.respawnT -= dt;
            if (a.respawnT <= 0 && !this.ended) this.spawnActor(a);
          }
        }
      }
      this.updateNades(dt);
      this.updateSmokes(dt);
      // 练习运行时：只随模拟推进（暂停 = simulate 不被调用即冻结）；受击高亮在 renderFrame 刷新
      if (this.practice) this.practice.update(dt);
      // 爆破会话：规则时间只在此推进（暂停时 simulate 不被调用即冻结）；事实每帧装配，
      // inSite 由会话按地图包点补全为包点 ID 字符串
      if (this.bombSession) {
        const facts = this.actors.map((a) => ({
          id: a.id, alive: a.alive, pos: { x: a.pos.x, y: a.pos.y, z: a.pos.z },
          moving: (a.speed || 0) > 0.4, damaged: a.hurtTick === this.tick,
        }));
        this.bombSession.update(dt, facts);
        this.syncC4World();
      }
      if (this.timeLeft <= 0 && !this.ended) this.endMatch();
      // 队友名字
      for (const t of this.tags) {
        const a = t.actor;
        t.sprite.visible = a.alive && a.pos.distanceTo(cam.position) < 45;
        if (t.sprite.visible) { a.soldier.headWorld(t.sprite.position); t.sprite.position.y += 0.42; }
      }
    }
  }
  renderFrame(dt) {
    const R = this.renderer, cam = R.camera;
    // 练习靶受击高亮（flash 由 PracticeRuntime 按 dt 衰减）
    if (this.practice) {
      for (const t of this.practiceMeshes) {
        const s = this.practice.states.find((x) => x.id === t.id);
        if (s) t.mat.color.set(s.flash > 0 ? 0xff5040 : 0xc8ccd0);
      }
    }
    // 第一人称武器
    if (this.player && this.playing) {
      const p = this.player;
      if (this.frame % 6 === 0 || !this.lightK) this.updateLightProbe();
      this.frame++;
      const sunCam = this.env.sunDir.clone().applyQuaternion(cam.quaternion.clone().invert());
      this.vm.setVisible(p.alive && !(p.scoped && p.weapon.def.type === 'sniper'));
      this.vm.update(dt, { speed: p.speed || 0, onGround: p.onGround, crouch: p.crouch, lookDX: p.lookDX, lookDY: p.lookDY, sunDirCam: sunCam, light: this.lightK, indoor: this.indoorK > 0.5 });
      R.vmScene.environmentIntensity = 0.75 * (0.35 + 0.65 * (1 - this.indoorK));
    }
    this.fx.update(dt, this.realTime, cam, this.env.shipSpeed);
    this.env.update(dt, this.realTime, cam.position);
    this.map.update?.(dt, this.realTime); // 运输船有动画帧回调；地图可不提供
    // 帧率统计与画质建议
    this.fpsAcc = (this.fpsAcc || 0) + dt; this.fpsN = (this.fpsN || 0) + 1;
    if (this.fpsAcc > 1) {
      this.fps = Math.round(this.fpsN / this.fpsAcc); this.fpsAcc = 0; this.fpsN = 0;
      const lbl = document.querySelector('#radarWrap .lbl');
      const region = this.player && this.playing ? this.regionAt(this.player.pos) : null;
      if (lbl) lbl.textContent = `${this.mapName()}${region ? ' · ' + this.regionName(region) : ''} · ${this.fps} FPS`;
      if (this.playing && !this.paused && this.time > 8 && !this.fpsHinted && this.fps < 32 && this.opts.quality !== 'low') {
        this.fpsHinted = true;
        this.hud.toast(this.t('hud.fpsHint'), 5);
      }
    }
    // 音频监听者
    const fwd = _v.set(0, 0, -1).applyQuaternion(cam.quaternion), up = _v2.set(0, 1, 0).applyQuaternion(cam.quaternion);
    audio.setListener(cam.position, fwd, up);
    audio.update(dt);
    // HUD
    if (this.player && (this.playing || this.ended)) this.updateHUD(dt);
    // 屏幕特效
    const fxu = R.fx.uniforms;
    this.dmgFlash = Math.max(0, (this.dmgFlash || 0) - dt * 1.6);
    fxu.uTime.value = this.realTime;
    fxu.uDamage.value = this.dmgFlash;
    const p = this.player;
    fxu.uLowHP.value = p && p.alive && this.playing ? Math.max(0, (35 - p.hp) / 35) : 0;
    fxu.uDeath.value = p && !p.alive && this.playing ? Math.min(1, p.deadT * 2) : 0;
    fxu.uProtect.value = p && p.alive && this.playing ? Math.min(1, p.protectT) : 0;
    fxu.uVignette.value = p && p.scoped ? 0 : 0.3;
    R.render();
  }
  updateLightProbe() {
    const p = this.player, e = p.eye(_v), s = this.env.sunDir;
    const sunBlocked = !!this.world.raycast(e.x, e.y, e.z, s.x, s.y, s.z, 80, 'sight');
    const roof = !!this.world.raycast(e.x, e.y, e.z, 0, 1, 0, 5, 'sight');
    const tl = sunBlocked ? 0.22 : 1, ti = roof ? 1 : 0;
    this.lightK = this.lightK === undefined ? tl : this.lightK + (tl - this.lightK) * 0.35;
    this.indoorK = this.indoorK === undefined ? ti : this.indoorK + (ti - this.indoorK) * 0.35;
  }
  updateHUD(dt) {
    const p = this.player, cam = this.renderer.camera, w = p.weapon;
    let spreadPx = 0;
    if (w && w.def.spread) {
      const sp = Math.min(0.12, w.spreadAcc + w.def.spread.base * 2 + (p.speed > 0.6 ? w.def.spread.move * Math.min(1, p.speed / 5.7) : 0) + (p.onGround ? 0 : w.def.spread.air * 0.5)) * (p.crouch ? 0.7 : 1);
      spreadPx = Math.tan(sp) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * window.innerHeight / 2;
    }
    // 准星下的角色名
    let aimName = '', aimTeam = '';
    if (p.alive && this.frame % 4 === 0) {
      const o = cam.position, d = _d.set(0, 0, -1).applyQuaternion(cam.quaternion);
      const wh = this.world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, 80, 'sight');
      const lim = wh ? wh.t : 80;
      let best = null, bt = lim;
      this.frame++;
      for (const a of this.actors) {
        if (a === p || !a.alive) continue;
        const r = a.soldier.hitTest(o, d, bt, this.frame);
        if (r) { best = a; bt = r.t; }
      }
      // 烟雾遮挡玩家视觉（与 AI canSee 同一接缝 smokeBlocksSight 语义）
      if (best && this.smokeBlocked(o, best.pos)) best = null;
      this.aimTarget = best;
    }
    if (this.aimTarget && this.aimTarget.alive) { aimName = this.aimTarget.name; aimTeam = this.aimTarget.team; }
    this.hud.update(dt, {
      score: this.score, timeLeft: this.timeLeft, goal: this.goal, myTeam: p.team, modeName: this.mode.name,
      hp: p.hp, armor: p.armor, alive: p.alive, weapon: w, scoped: p.scoped && w.def.type === 'sniper', spreadPx,
      yaw: p.yaw, respawnIn: p.respawnT, killedBy: this.killedBy, protect: p.protectT, aimName, aimTeam,
      objective: this.objectiveView(p.id), // 爆破回合/比分/C4/交互提示（HUD 不自行推算规则）
      // 闪光致盲（HUD 白屏叠加消费）：remaining 秒、intensity 0..1 峰值
      blind: p.alive ? {
        remaining: Math.max(0, (p.blindUntil || 0) - this.time),
        intensity: p.blindIntensity || 0,
      } : null,
      // 练习快照（命中数/靶位/当前枪），HUD 练习面板消费；非练习恒 null
      practice: this.practice ? this.practice.snapshot() : null,
      // 本局军衔结算结果（endScreen 可直接渲染 awarded/xp/rank/rankUp）
      award: this.ended ? this.lastAward : null,
    });
    this.hud.drawRadar(p, this.actors, this.time);
    const tab = p.keys.has('Tab') && this.playing && !this.paused;
    if (tab !== this.boardShown || (tab && this.frame % 20 === 0)) { this.boardShown = tab; this.hud.scoreboard(tab, this.actors, p.id, this.score); }
  }
}
