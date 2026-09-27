// HUD 与菜单（DOM）
import { WEAPONS, PRIMARIES } from './weapons.js';
import { loadOpts, saveOpts, acquireStorage } from './settings.js';
import { MAPS } from './maps/registry.js';
import { getMode, modeOptionsFor } from './modes/index.js';
import { BOMB_DEFAULTS } from './modes/bomb.js';

const TEAM_CN = { BL: '潜伏者', GR: '保卫者' };
const $ = (s, r = document) => r.querySelector(s);

const HS_ICON = 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><g fill="none" stroke="#ff4030" stroke-width="3"><circle cx="20" cy="20" r="11"/><path d="M20 2v10M20 28v10M2 20h10M28 20h10"/></g><circle cx="20" cy="20" r="3.5" fill="#ff4030"/></svg>`);
const WB_ICON = 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect x="15" y="4" width="10" height="32" fill="#bbb"/><path d="M2 20h36" stroke="#ffd24a" stroke-width="3"/></svg>`);
const BADGE_SVG = (color, inner) => `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="bg" cx="50%" cy="45%"><stop offset="0" stop-color="${color}" stop-opacity=".95"/><stop offset="1" stop-color="#1a0a00" stop-opacity=".9"/></radialGradient></defs><polygon points="50,3 93,27 93,73 50,97 7,73 7,27" fill="url(#bg)" stroke="#ffd24a" stroke-width="3"/>${inner}</svg>`;
const SKULL = `<g fill="#fff"><path d="M50 22c-14 0-24 9-24 22 0 8 4 13 9 16v9h30v-9c5-3 9-8 9-16 0-13-10-22-24-22z"/><rect x="40" y="66" width="4" height="8"/><rect x="48" y="66" width="4" height="8"/><rect x="56" y="66" width="4" height="8"/></g><circle cx="41" cy="45" r="6" fill="#3a1500"/><circle cx="59" cy="45" r="6" fill="#3a1500"/>`;
const CROSSHAIR_B = `<g fill="none" stroke="#fff" stroke-width="4"><circle cx="50" cy="50" r="20"/><path d="M50 18v14M50 68v14M18 50h14M68 50h14"/></g><circle cx="50" cy="50" r="5" fill="#ff3020"/>`;

// 爆破 HUD 只读渲染：把 Game.objectiveView 提供的 s.objective 映射为可见文案/进度。
// 不计算任何规则结果——回合胜负、时间、C4 状态全部取自视图字段。
export function objectiveHud(view, ctx = {}) {
  const off = { active: false, round: '', aliveBL: '', aliveGR: '', c4: '', c4Cls: '', hint: '', progress: null };
  if (!view || !view.phase || view.phase === 'idle' || view.phase === 'matchEnd') return off;
  const out = { ...off, active: true };
  out.round = view.round ? `第 ${view.round} 回合` : '';
  out.aliveBL = String(view.alive?.BL ?? '');
  out.aliveGR = String(view.alive?.GR ?? '');
  const bomb = view.bomb || null;
  const plantHold = view.plantHold || BOMB_DEFAULTS.plantHold;
  const defuseHold = view.defuseHold || BOMB_DEFAULTS.defuseHold;
  if (view.phase === 'roundEnd') {
    out.c4 = '';
    out.hint = view.roundWinner === 'BL' ? '潜伏者 拿下本回合' : view.roundWinner === 'GR' ? '保卫者 拿下本回合' : '回合结束';
    return out;
  }
  if (view.phase === 'planted') {
    out.c4 = `C4 已安放${bomb?.site ? ' · ' + bomb.site + ' 点' : ''}`;
    out.c4Cls = 'planted';
    if (view.defusable) out.hint = '按住 E 拆除 C4';
    else if (ctx.myTeam === 'BL') out.hint = '守住 C4 直至引爆';
    else out.hint = '前往 C4 点拆除';
    if (view.defuseProgress > 0) out.progress = { label: '正在拆除', frac: Math.min(1, view.defuseProgress / defuseHold) };
    return out;
  }
  if (bomb && bomb.planted) { // 视图相位与C4状态不一致时按安放渲染（防御）
    out.c4 = `C4 已安放${bomb.site ? ' · ' + bomb.site + ' 点' : ''}`;
    out.c4Cls = 'planted';
    return out;
  }
  if (bomb && bomb.dropped) {
    out.c4 = 'C4 已掉落';
    out.c4Cls = 'dropped';
    if (view.pickupable) out.hint = '按 E 拾取 C4';
    else if (ctx.myTeam === 'BL') out.hint = '找回 C4';
    else out.hint = '阻止对方拾取 C4';
    return out;
  }
  if (bomb && bomb.carrierId != null) {
    if (bomb.carrierId === ctx.myId) { out.c4 = 'C4 · 我携带'; out.c4Cls = 'carry'; }
    else {
      const a = ctx.actorOf ? ctx.actorOf(bomb.carrierId) : null;
      if (a && ctx.myTeam && a.team === ctx.myTeam) { out.c4 = `C4 · ${a.name} 携带`; out.c4Cls = 'carry'; }
      else { out.c4 = 'C4 · 敌方携带'; out.c4Cls = 'enemy'; }
    }
    if (view.plantable) out.hint = '按住左键安放 C4';
    if (view.plantProgress > 0) out.progress = { label: '正在安放', frac: Math.min(1, view.plantProgress / plantHold) };
  }
  if (view.phase === 'prep' && !out.hint) out.hint = '准备期 · 按 B 更换背包';
  return out;
}

// 主计时条只消费当前模式的公开视图；爆破的 Infinity 对局时限不能当作回合时钟。
export function matchHeader(s) {
  const bomb = s.objective;
  const remaining = bomb ? bomb.timeLeft : s.timeLeft;
  const tl = Math.max(0, Number.isFinite(remaining) ? remaining : 0);
  const mm = Math.floor(tl / 60), ss = Math.floor(tl % 60);
  return {
    clock: `${mm}:${ss < 10 ? '0' : ''}${ss}`,
    goal: bomb
      ? `${s.modeName || '爆破模式'} · 先赢 ${bomb.winsNeeded ?? BOMB_DEFAULTS.winsNeeded} 局`
      : `${s.modeName || '团队竞技'} · 目标 ${s.goal}`,
  };
}

// 闪光白屏状态机（phase-5-wiring §4.1 契约的渲染侧）：opacity ∝ intensity × remaining/满时长。
// state 为 HUD 持有的跨帧 episode（{remaining, duration}）：更晚到期的更强闪光重置满时长，
// 叠加的更弱/更短闪光不重置；remaining ≤ 0 或无数据一律隐藏。
export function updateBlindState(state, blind) {
  if (!blind || !(blind.remaining > 0)) {
    state.remaining = 0; state.duration = 0;
    return { visible: false, opacity: 0 };
  }
  if (blind.remaining > state.remaining + 1e-3) state.duration = blind.remaining;
  state.remaining = blind.remaining;
  const intensity = Math.min(1, Math.max(0, blind.intensity || 0));
  const frac = state.duration > 0 ? Math.min(1, blind.remaining / state.duration) : 0;
  return { visible: true, opacity: intensity * frac };
}

// 菜单模式分段的生效值：已存模式合法且该图支持才生效，否则地图默认（运输船 tdm、沙漠灰 bomb）。
// 与 startMatch 的解析对齐（URL ?mode= 优先于已存设置，那一半在 game.js）。
export function effectiveMode(opts, mapDesc) {
  const mode = opts && opts.mode;
  const supported = mapDesc && Array.isArray(mapDesc.supportedModes) ? mapDesc.supportedModes : null;
  if (mode && supported && supported.includes(mode)) return mode;
  return (mapDesc && mapDesc.defaultMode) || 'tdm';
}

// P3-5②：菜单高亮用的「实际开局模式」——镜像 startMatch 的完整解析顺序
//（URL 合法且该图支持 → 优先；否则回落 effectiveMode 的已存/地图默认语义），
// 保证 URL 携带非法/不支持 mode 时高亮与实际开局一致。
export function displayMode(qs, opts, mapDesc) {
  const requested = qs && typeof qs.get === 'function' ? qs.get('mode') : null;
  const supported = mapDesc && Array.isArray(mapDesc.supportedModes) ? mapDesc.supportedModes : null;
  if (requested && supported && supported.includes(requested)) return requested;
  return effectiveMode(opts, mapDesc);
}

// 结算页军衔行：awarded:false（去重重放/练习）静默；rank 缺失时仍给 XP（防御）
export function awardLine(award) {
  if (!award || !award.awarded) return '';
  const xp = `+${award.xp ?? 0} XP`;
  const r = award.rank;
  if (!r) return xp;
  return `${award.rankUp ? '军衔晋升！' : ''}${xp} · ${r.rankName || ''}${r.level ? ` · Lv.${r.level}` : ''}`;
}

// 投掷物背包行：[{id, name, count, current}]；剩余 0 的型号不再显示，current 供 4 号轮换高亮
export function nadeSummary(bag, used, currentId) {
  if (!Array.isArray(bag)) return [];
  const rows = [];
  for (const id of bag) {
    const def = WEAPONS[id];
    if (!def) continue;
    const count = Math.max(0, (def.count || 1) - ((used && used[id]) || 0));
    if (count <= 0) continue;
    rows.push({ id, name: def.name, count, current: id === currentId });
  }
  return rows;
}

export class HUD {
  constructor(game) {
    this.g = game;
    this.root = $('#ui');
    this.root.innerHTML = TEMPLATE;
    this.el = {};
    for (const n of this.root.querySelectorAll('[id]')) this.el[n.id] = n;
    this.icons = {};
    this.feedItems = [];
    this.dmgDirs = [];
    this.hitT = 0; this.toastT = 0;
    this.slotsT = 0;
    this.blind = { remaining: 0, duration: 0 }; // 闪光白屏 episode 状态
    this.qs = new URLSearchParams(location.search); // 与 game 构造期同一 URL 快照（菜单高亮镜像开局解析）
    this._profileBound = false;
    this._prChips = '';
    this._nadeHtml = null; // P3-1：投掷物背包条仅变化时重写
    this._endAward = null; // P3-2：结算军衔行仅变化时重写
    this.radarCtx = this.el.radar.getContext('2d');
    const touch = matchMedia('(pointer:coarse)').matches;
    this.opts = loadOpts(acquireStorage(), touch);
    this.buildMenu();
  }
  saveOpts() { saveOpts(acquireStorage(), this.opts); }

  // ---------- 菜单 ----------
  buildMapSeg() {
    const seg = $('#mapSeg');
    for (const id of Object.keys(MAPS)) {
      const m = MAPS[id];
      const b = document.createElement('button');
      b.dataset.v = id;
      b.innerHTML = `${m.name}<small>${m.available ? m.en : '待开放'}</small>`;
      if (!m.available) b.disabled = true;
      seg.appendChild(b);
    }
  }
  // 菜单/加载页文案与小地图参数随地图切换
  setMapInfo(desc) {
    this.mapDesc = desc;
    document.title = `${desc.name} · 穿越火线 3D`;
    this.el.mapTitle.textContent = desc.name;
    this.el.mapEn.textContent = desc.en;
    this.el.mapBlurb.innerHTML = desc.menu ? desc.menu.blurb : '';
    this.el.loadTitle.textContent = desc.name.split('').join(' ');
    this.el.boardTitle.textContent = `${desc.name} · ${getMode(desc.defaultMode).name}`;
    this.buildModeSeg();
  }
  // 菜单模式分段：按地图 supportedModes 顺序渲染（modeOptionsFor），高亮当前生效模式；
  // 点击只写入设置并保存，开局经 startMatch 生效（URL ?mode= 仍优先于已存设置）
  buildModeSeg() {
    const seg = $('#modeSeg');
    if (!seg) return;
    seg.innerHTML = '';
    const cur = this.menuMode();
    for (const m of modeOptionsFor(this.mapDesc)) {
      const b = document.createElement('button');
      b.dataset.v = m.id;
      b.textContent = m.name;
      if (m.id === cur) b.classList.add('on');
      b.addEventListener('click', () => {
        for (const x of seg.querySelectorAll('button')) x.classList.remove('on');
        b.classList.add('on');
        this.opts.mode = m.id;
        this.saveOpts();
        this.g.onOption?.('mode', m.id);
        this.g.audio?.playUI('click');
      });
      seg.appendChild(b);
    }
  }
  buildMenu() {
    const o = this.opts;
    this.buildMapSeg();
    const segs = this.root.querySelectorAll('.seg[data-k]');
    for (const s of segs) {
      const k = s.dataset.k;
      for (const b of s.querySelectorAll('button')) {
        if (b.disabled) continue;
        if (String(o[k]) === b.dataset.v) b.classList.add('on');
        b.addEventListener('click', () => {
          for (const x of s.querySelectorAll('button')) x.classList.remove('on');
          b.classList.add('on');
          o[k] = isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v;
          this.saveOpts();
          this.g.onOption?.(k, o[k]);
          this.g.audio?.playUI('click');
        });
      }
    }
    // 切图时模式回落该图默认（运输船 tdm、沙漠灰 bomb）；对局时 URL ?mode= 仍优先于已存设置
    for (const b of $('#mapSeg').querySelectorAll('button')) {
      b.addEventListener('click', () => {
        const d = MAPS[b.dataset.v];
        o.mode = (d && d.defaultMode) || null;
        this.saveOpts();
      });
    }
    // 练习面板换枪按钮：主武器走现有换包路径（onSwitch 同步练习运行时），其余按槽位真实切枪
    for (const b of this.root.querySelectorAll('#prGuns button')) {
      b.addEventListener('click', () => this.practiceSwitch(+b.dataset.slot, b.dataset.w));
    }
    for (const sl of this.root.querySelectorAll('.slider[data-k]')) {
      const k = sl.dataset.k, inp = sl.querySelector('input'), sp = sl.querySelector('span');
      inp.value = o[k]; sp.textContent = (+o[k]).toFixed(k === 'fov' ? 0 : 2);
      inp.addEventListener('input', () => {
        o[k] = +inp.value; sp.textContent = (+inp.value).toFixed(k === 'fov' ? 0 : 2); this.saveOpts();
        this.g.onOption?.(k, o[k]);
      });
    }
    $('#btnStart').addEventListener('click', () => this.g.startMatch());
    $('#btnResume').addEventListener('click', () => this.g.resume());
    $('#btnQuit').addEventListener('click', () => this.g.quitToMenu());
    $('#btnAgain').addEventListener('click', () => this.g.startMatch());
    $('#btnMenu').addEventListener('click', () => this.g.quitToMenu());
    for (const c of this.root.querySelectorAll('#loadCards .card')) {
      c.addEventListener('click', () => {
        this.g.chooseLoadout(c.dataset.w);
        for (const x of this.root.querySelectorAll('#loadCards .card')) x.classList.toggle('on', x === c);
      });
    }
    $('#btnLoadClose').addEventListener('click', () => this.g.closeLoadout());
    if (matchMedia('(pointer:coarse)').matches) $('#touchNote').classList.remove('hidden');
    for (const a of this.root.querySelectorAll('#clinks a, .mlinks a'))
      a.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  }
  setIcons(icons) {
    this.icons = icons;
    for (const c of this.root.querySelectorAll('#loadCards .card')) c.querySelector('img').src = icons[c.dataset.w] || '';
  }
  syncControls() {
    const o = this.opts;
    for (const s of this.root.querySelectorAll('.seg[data-k]')) {
      // 模式高亮跟随实际开局解析（P3-5②：URL 非法/不支持时回落默认，不跟随已存值）
      const val = s.dataset.k === 'mode' ? this.menuMode() : o[s.dataset.k];
      for (const b of s.querySelectorAll('button')) b.classList.toggle('on', String(val) === b.dataset.v);
    }
    for (const sl of this.root.querySelectorAll('.slider[data-k]')) {
      const k = sl.dataset.k; sl.querySelector('input').value = o[k]; sl.querySelector('span').textContent = (+o[k]).toFixed(k === 'fov' ? 0 : 2);
    }
  }
  show(name) {
    if (name === 'menu' || name === 'pause') this.syncControls();
    if (name === 'menu' || name === 'end') this.ensureProfile();
    for (const n of ['menu', 'pause', 'end', 'loadout', 'loading']) this.el[n].classList.toggle('hidden', n !== name);
    this.el.hud.classList.toggle('hidden', name === 'menu' || name === 'loading' || name === 'end');
  }
  // P3-5②：菜单模式高亮 = 实际开局模式（URL 合法优先 → 已存 → 地图默认）
  menuMode() { return displayMode(this.qs, this.opts, this.mapDesc); }
  // ---------- 军衔/档案（adapter 由 Game.init 在 HUD 之后装配，这里惰性绑定，事件刷新不轮询） ----------
  ensureProfile() {
    const a = this.g.profileAdapter;
    if (!a) return;
    if (!this._profileBound) {
      this._profileBound = true;
      a.onProfileChanged(({ reason }) => {
        if (reason === 'preset') {
          this.opts.primary = a.loadout().primary;
          this.saveOpts();
          this.syncControls();
        }
        this.renderProfile();
      });
    }
    this.renderProfile();
  }
  renderProfile() {
    const a = this.g.profileAdapter;
    if (!a) return;
    const r = a.rankView();
    this.el.rankName.textContent = r.rankName;
    this.el.rankLevel.textContent = `Lv.${r.level}`;
    this.el.rankXp.textContent = r.nextThreshold != null ? `${r.xp} / ${r.nextThreshold} XP` : `${r.xp} XP · 满级`;
    this.el.rankFill.style.width = `${Math.round(Math.min(1, Math.max(0, r.progress)) * 100)}%`;
    // 存档通道降级（隐私模式/配额错误）：如实提示会话内有效，不宣称「已保存」
    this.el.profileNote.classList.toggle('hidden', a.persistence() !== 'memory');
    const ps = a.presets();
    const seg = this.el.presetSeg;
    seg.innerHTML = '';
    ps.list.forEach((p, i) => {
      const b = document.createElement('button');
      b.innerHTML = `预设 ${i + 1}<small>${esc((WEAPONS[p.primary] || {}).name || p.primary)} · ${esc((WEAPONS[p.grenade] || {}).name || p.grenade)}</small>`;
      if (i === ps.active) b.classList.add('on');
      b.addEventListener('click', () => {
        a.switchPreset(i); // adapter 事件 → onProfileChanged → 重渲染高亮
        this.g.audio?.playUI('click');
      });
      seg.appendChild(b);
    });
  }
  loading(p, text) { this.el.loadBar.style.width = (p * 100).toFixed(0) + '%'; if (text) this.el.loadTxt.textContent = text; }

  // ---------- 局内 ----------
  update(dt, s) {
    const e = this.el;
    // 比分与时间
    e.sBL.textContent = s.score.BL; e.sGR.textContent = s.score.GR;
    const header = matchHeader(s);
    e.sTime.textContent = header.clock;
    e.sGoal.textContent = header.goal;
    e.tBL.classList.toggle('mine', s.myTeam === 'BL'); e.tGR.classList.toggle('mine', s.myTeam === 'GR');
    // 生命护甲
    e.hpVal.textContent = Math.max(0, Math.ceil(s.hp));
    e.arVal.textContent = Math.max(0, Math.ceil(s.armor));
    e.hpBox.classList.toggle('low', s.hp <= 30 && s.alive);
    // 弹药
    const w = s.weapon;
    if (w) {
      const d = w.def;
      e.wName.textContent = d.hudName;
      if (d.type === 'melee') { e.aMag.textContent = '∞'; e.aRes.textContent = ''; }
      else if (d.type === 'grenade') { e.aMag.textContent = w.mag; e.aRes.textContent = ''; }
      else { e.aMag.textContent = w.mag; e.aRes.textContent = '/ ' + w.reserve; }
      e.aMag.classList.toggle('low', d.mag > 1 && w.mag <= Math.ceil(d.mag * 0.2));
      if (this.icons[d.id] && e.wIcon.dataset.id !== d.id) { e.wIcon.src = this.icons[d.id]; e.wIcon.dataset.id = d.id; }
      e.aHint.textContent = w.reloading ? '换弹中…' : (d.mag > 1 && w.mag === 0 && w.reserve === 0 ? '弹药耗尽' : (d.mag > 1 && w.mag === 0 ? '按 R 换弹' : ''));
    }
    // 准星
    const showX = s.alive && !s.scoped && w && w.def.type !== 'sniper';
    e.cross.style.display = showX ? '' : 'none';
    if (showX) {
      const gap = 4 + s.spreadPx;
      e.cT.style.top = -(gap + 9) + 'px'; e.cB.style.top = gap + 'px';
      e.cL.style.left = -(gap + 9) + 'px'; e.cR.style.left = gap + 'px';
    }
    e.scope.classList.toggle('on', !!s.scoped && s.alive);
    // 命中标记
    if (this.hitT > 0) { this.hitT -= dt; e.hit.style.opacity = Math.min(1, this.hitT * 5); } else e.hit.style.opacity = 0;
    // 受击方向
    for (const d of this.dmgDirs) {
      d.t -= dt;
      const rel = d.ang - s.yaw;
      d.el.style.transform = `rotate(${-rel}rad)`;
      d.el.style.opacity = Math.max(0, Math.min(1, d.t));
      if (d.t <= 0) d.el.remove();
    }
    this.dmgDirs = this.dmgDirs.filter((d) => d.t > 0);
    // 击杀信息淡出
    const now = performance.now();
    this.feedItems = this.feedItems.filter((f) => { if (now - f.t > 7000) { f.el.remove(); return false; } return true; });
    // 提示
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) e.toast.style.opacity = 0; }
    // 中央信息（阵亡/观战）由 updateObjective 统一处理
    e.protect.textContent = s.protect > 0 && s.alive ? `出生保护 ${s.protect.toFixed(1)}s（开火即解除）` : '';
    e.nameTip.textContent = s.aimName || ''; e.nameTip.className = s.aimTeam || '';
    if (this.slotsT > 0) { this.slotsT -= dt; e.slots.style.opacity = Math.min(1, this.slotsT * 2); } else e.slots.style.opacity = 0;
    // 闪光白屏（s.blind，仅玩家存活时非 null；pointer-events:none 不拦截任何输入）
    const bl = updateBlindState(this.blind, s.blind);
    e.blind.style.opacity = bl.opacity;
    e.blind.classList.toggle('hidden', !bl.visible);
    // 投掷物背包条（slot 3 轮换 / 剩余量 / 当前高亮）
    this.updateNadeInfo();
    // 练习面板（非练习模式 s.practice = null → 隐藏）
    this.updatePractice(s);
    // 结算军衔行（s.award 仅 ended 后非 null；awarded:false 静默）——P3-2：仅变化时重写
    const award = s.award ? awardLine(s.award) : '';
    if (award !== this._endAward) {
      e.endAward.innerHTML = award;
      e.endAward.classList.toggle('hidden', !award);
      this._endAward = award;
    }
    this.updateObjective(dt, s);
  }
  updateNadeInfo() {
    const p = this.g.player, e = this.el.nadeInfo;
    const rows = p ? nadeSummary(p.grenadeBag, p.usedGrenades, p.inv[3] && p.inv[3].def.id) : [];
    const hidden = e.classList.contains('hidden');
    if (!rows.length) { if (!hidden) e.classList.add('hidden'); return; }
    const html = rows.map((r) => `<span class="${r.current ? 'on' : ''}">${esc(r.name)}<b>×${r.count}</b></span>`).join('');
    if (hidden || html !== this._nadeHtml) { // P3-1：与练习 chips 同纪律，仅变化时重写 DOM
      e.classList.remove('hidden');
      e.innerHTML = html;
      this._nadeHtml = html;
    }
  }
  updatePractice(s) {
    const e = this.el, pr = s.practice;
    if (!pr) { e.practice.classList.add('hidden'); return; }
    e.practice.classList.remove('hidden');
    e.prHits.textContent = `命中 ${pr.totalHits}`;
    // P3-6 空态防御：开局 PracticeRuntime.current 可能为 null（game 侧种子化由接线会话处理），
    // 这里显示空武器名、无按钮高亮即可，不抛错
    const w = WEAPONS[pr.weapon && pr.weapon.current];
    e.prWeapon.textContent = w ? w.name : '';
    // 靶位：受击 flash>0 高亮 + 每靶命中数（DOM 写仅在变化时发生）
    const chips = (pr.targets || []).map((t) => `<i class="${t.flash > 0 ? 'on' : ''}">${esc(t.id)} ${t.hits}</i>`).join('');
    if (chips !== this._prChips) { e.prTargets.innerHTML = chips; this._prChips = chips; }
    const cur = (pr.weapon && pr.weapon.current) || '';
    for (const b of e.prGuns.querySelectorAll('button')) {
      const slot = pr.weapon && pr.weapon.slots[b.dataset.slot];
      b.classList.toggle('on', b.dataset.w ? b.dataset.w === slot : WEAPONS[cur]?.slot === 3);
    }
  }
  practiceSwitch(slot, id) {
    const p = this.g.player;
    if (!p || !p.inv[slot]) return;
    // chooseLoadout onSwitch 同步已由 game.js 修复（原 P2-1 勘误，phase-5 复核为已接受残余后闭环）。
    if (slot === 0 && id) { this.g.chooseLoadout(id); return; }
    p.weaponUpdate(0.05, { sw: slot }); // 真实切枪路径 → onSwitch → practice.selectWeapon
  }
  // 爆破目标 HUD：只读渲染 s.objective（Game.objectiveView 提供的同一视图），不计算任何规则结果
  updateObjective(dt, s) {
    const e = this.el, p = this.g.player;
    const oh = objectiveHud(s.objective, {
      myId: p && p.id, myTeam: s.myTeam,
      actorOf: (id) => this.g.actors.find((a) => a.id === id) || null,
    });
    e.objInfo.classList.toggle('hidden', !oh.active);
    e.objRound.textContent = oh.round;
    e.objAlive.textContent = oh.active ? `存活 ${oh.aliveBL} : ${oh.aliveGR}` : '';
    e.c4State.textContent = oh.c4;
    e.c4State.className = oh.c4 ? oh.c4Cls : 'hidden';
    e.objHint.classList.toggle('hidden', !oh.hint);
    e.objHint.textContent = oh.hint;
    if (oh.progress) {
      e.objProg.classList.remove('hidden');
      e.objProgFill.style.width = (oh.progress.frac * 100).toFixed(0) + '%';
      e.objProgLbl.textContent = oh.progress.label;
    } else e.objProg.classList.add('hidden');
    // 5号槽 C4 虚拟槽位
    const carrying = !!(s.objective && s.objective.bomb && s.objective.bomb.carrierId != null && p && s.objective.bomb.carrierId === p.id);
    e.slotC4.classList.toggle('hidden', !carrying);
    e.slotC4.classList.toggle('on', carrying && !!(p && p.c4Selected));
    // C4 在手时弹药区显示 C4
    if (p && p.c4Selected && oh.active && s.alive) {
      e.wName.textContent = 'C4 爆破物';
      e.aMag.textContent = '—'; e.aMag.classList.remove('low');
      e.aRes.textContent = '';
      e.aHint.textContent = oh.hint || '';
      e.wIcon.style.visibility = 'hidden';
    } else e.wIcon.style.visibility = '';
    // 死亡观战（爆破模式）
    if (!s.alive && oh.active) {
      e.center.classList.remove('hidden');
      e.cBig.textContent = p && p.spectateName ? `观战中 · ${p.spectateName}` : '观战中';
      e.cSmall.textContent = '点击鼠标切换观战队友 · 下一回合复活';
    } else if (!s.alive && s.respawnIn > 0) {
      e.center.classList.remove('hidden');
      e.cBig.innerHTML = s.killedBy || '你阵亡了';
      e.cSmall.textContent = `${s.respawnIn.toFixed(1)} 秒后复活 · 按 B 更换武器`;
    } else e.center.classList.add('hidden');
    // 触屏目标交互按钮仅爆破模式显示
    const showObj = oh.active && s.alive;
    for (const b of (this.g.touch && this.g.touch.objBtns) || []) b.style.display = showObj ? 'grid' : 'none';
  }
  slots(inv, cur) {
    const e = this.el.slots;
    e.innerHTML = '';
    ['主武器', '副武器', '近身', '投掷'].forEach((lab, i) => {
      const w = inv[i];
      if (!w) return;
      const d = document.createElement('div');
      d.className = 's' + (i === cur ? ' on' : '');
      d.innerHTML = `<span>${w.def.name}</span><img src="${this.icons[w.id] || ''}"><b>${i + 1}</b>`;
      e.appendChild(d);
    });
    this.slotsT = 2.2;
  }
  killFeed(k, v, wid, hs, wb, mine) {
    const d = document.createElement('div');
    d.className = 'kf' + (mine ? ' me' : '');
    const icon = this.icons[wid] ? `<img src="${this.icons[wid]}">` : `<span>[${WEAPONS[wid]?.name || wid}]</span>`;
    d.innerHTML = (k ? `<span class="k ${k.team}">${esc(k.name)}</span>` : '') + icon + (wb ? `<img class="hs" src="${WB_ICON}">` : '') + (hs ? `<img class="hs" src="${HS_ICON}">` : '') + `<span class="v ${v.team}">${esc(v.name)}</span>`;
    this.el.feed.prepend(d);
    this.feedItems.push({ el: d, t: performance.now() });
    while (this.feedItems.length > 6) { const f = this.feedItems.shift(); f.el.remove(); }
  }
  hitmarker(hs, kill) {
    this.el.hit.className = kill ? 'kill' : hs ? 'hs' : '';
    this.hitT = kill ? 0.45 : 0.22;
  }
  damageFrom(ang) {
    const d = document.createElement('div'); d.className = 'dd';
    this.el.dmgDirs.appendChild(d);
    this.dmgDirs.push({ el: d, ang, t: 1.4 });
  }
  badge(text, sub, headshot) {
    const b = this.el.badge;
    b.classList.remove('show'); void b.offsetWidth;
    b.querySelector('.ico').innerHTML = BADGE_SVG(headshot ? '#c0301a' : '#b8860b', headshot ? CROSSHAIR_B : SKULL);
    b.querySelector('.txt').textContent = text;
    b.querySelector('.sub').textContent = sub || '';
    b.classList.add('show');
  }
  toast(text, dur = 2.5) { const t = this.el.toast; t.innerHTML = text; t.style.opacity = 1; this.toastT = dur; }
  scoreboard(show, actors, myId, score) {
    this.el.board.classList.toggle('hidden', !show);
    if (!show) return;
    const rows = (team) => actors.filter((a) => a.team === team).sort((a, b) => b.stats.k - a.stats.k || a.stats.d - b.stats.d)
      .map((a) => `<tr class="${a.id === myId ? 'me' : ''} ${a.alive ? '' : 'dead'}"><td>${esc(a.name)}</td><td>${a.stats.k}</td><td>${a.stats.d}</td><td>${a.stats.hs}</td></tr>`).join('');
    const tbl = (team) => `<table class="t${team}"><tr><th class="team">${TEAM_CN[team]} · ${score[team]}</th><th>击杀</th><th>死亡</th><th>爆头</th></tr>${rows(team)}</table>`;
    this.el.boardBody.innerHTML = `<div class="cols">${tbl('BL')}${tbl('GR')}</div>`;
  }
  endScreen(win, score, actors, myId) {
    this.show('end');
    const r = this.el.endRes;
    r.textContent = win === null ? '平局' : win ? '胜利' : '失败';
    r.className = 'res ' + (win ? 'win' : 'lose');
    this.el.endSc.textContent = `潜伏者 ${score.BL} : ${score.GR} 保卫者`;
    const mvp = [...actors].sort((a, b) => (b.stats.k * 2 - b.stats.d + b.stats.hs) - (a.stats.k * 2 - a.stats.d + a.stats.hs))[0];
    this.el.endMvp.textContent = mvp ? `MVP：${mvp.name}（${mvp.stats.k} 杀 / ${mvp.stats.hs} 爆头）` : '';
    const me = actors.find((a) => a.id === myId);
    const acc = me && me.stats.shots ? ((me.stats.hits / me.stats.shots) * 100).toFixed(1) : '0';
    this.el.endMe.textContent = me ? `你的战绩：${me.stats.k} 击杀 · ${me.stats.d} 死亡 · ${me.stats.hs} 爆头 · 命中率 ${acc}%` : '';
    const rows = (team) => actors.filter((a) => a.team === team).sort((a, b) => b.stats.k - a.stats.k)
      .map((a) => `<tr class="${a.id === myId ? 'me' : ''}"><td>${esc(a.name)}</td><td>${a.stats.k}</td><td>${a.stats.d}</td><td>${a.stats.hs}</td></tr>`).join('');
    const tbl = (team) => `<table class="t${team}"><tr><th class="team">${TEAM_CN[team]}</th><th>击杀</th><th>死亡</th><th>爆头</th></tr>${rows(team)}</table>`;
    this.el.endTable.innerHTML = `<div class="cols">${tbl('BL')}${tbl('GR')}</div>`;
  }
  // ---------- 小地图 ----------
  buildRadar(world, desc) {
    const R = desc.radar, S = 8; // px/m
    this.radarOff = { x: R.offX, z: R.offZ };
    const W = R.widthM * S, H = R.heightM * S;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(70,80,84,0.95)'; x.fillRect(0, 0, W, H);
    const cols = [...world.colliders].filter((k) => k.solid && k.top > 0.3 && k.bottom < 2 && k.hx < R.maxColliderHalf && k.tag !== 'deck').sort((a, b) => a.top - b.top);
    for (const k of cols) {
      if (k.bullet === 'pass' && k.mat !== 'mesh') continue;
      x.save();
      x.translate((k.x + R.offX) * S, (k.z + R.offZ) * S);
      x.rotate(-k.yaw);
      const hgt = k.top;
      x.fillStyle = k.mat === 'mesh' ? 'rgba(200,200,190,.5)' : hgt > 4 ? '#1d2327' : hgt > 2 ? '#2d353a' : hgt > 1.3 ? '#3b454b' : '#56616a';
      x.fillRect(-k.hx * S, -k.hz * S, k.hx * 2 * S, k.hz * 2 * S);
      x.strokeStyle = 'rgba(0,0,0,.5)'; x.lineWidth = 1;
      x.strokeRect(-k.hx * S, -k.hz * S, k.hx * 2 * S, k.hz * 2 * S);
      x.restore();
    }
    // 顶层结构（如二楼管道顶棚）用虚线表示
    x.strokeStyle = 'rgba(245,179,33,.35)'; x.setLineDash([6, 4]);
    for (const o of R.overlays || []) x.strokeRect(o.x * S + R.offX * S, o.z * S + R.offZ * S, o.w * S, o.h * S);
    this.radarImg = c; this.radarS = S;
  }
  drawRadar(me, actors, t) {
    const ctx = this.radarCtx, cv = this.el.radar;
    const W = cv.width = cv.clientWidth * 1.5 | 0, H = cv.height = cv.clientHeight * 1.5 | 0;
    ctx.clearRect(0, 0, W, H);
    if (!this.radarImg || !this.radarOff) return;
    const S = this.radarS, off = this.radarOff, zoom = 0.55 * (W / 294);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(me.yaw);
    ctx.scale(zoom, zoom);
    ctx.translate(-(me.pos.x + off.x) * S, -(me.pos.z + off.z) * S);
    ctx.globalAlpha = 0.95;
    ctx.drawImage(this.radarImg, 0, 0);
    ctx.globalAlpha = 1;
    for (const a of actors) {
      if (a === me) continue;
      const seen = a.team === me.team || (a.radarT > 0);
      if (!seen) continue;
      const px = (a.pos.x + off.x) * S, pz = (a.pos.z + off.z) * S;
      if (!a.alive) {
        if (a.team !== me.team || a.deadT > 5) continue;
        ctx.strokeStyle = '#9aa'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(px - 8, pz - 8); ctx.lineTo(px + 8, pz + 8); ctx.moveTo(px + 8, pz - 8); ctx.lineTo(px - 8, pz + 8); ctx.stroke();
        continue;
      }
      ctx.fillStyle = a.team === me.team ? '#4fb0ff' : '#ff4a3a';
      if (a.team === me.team) {
        ctx.save(); ctx.translate(px, pz); ctx.rotate(-a.yaw);
        ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(8, 9); ctx.lineTo(0, 4); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill();
        ctx.restore();
      } else {
        ctx.globalAlpha = Math.min(1, a.radarT);
        ctx.beginPath(); ctx.arc(px, pz, 9, 0, 7); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
    // 自己
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath(); ctx.moveTo(W / 2, H / 2 - 10); ctx.lineTo(W / 2 + 7, H / 2 + 8); ctx.lineTo(W / 2, H / 2 + 4); ctx.lineTo(W / 2 - 7, H / 2 + 8); ctx.closePath(); ctx.fill();
    // 视野扇形
    const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.45);
    g.addColorStop(0, 'rgba(255,255,255,.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(W / 2, H / 2); ctx.arc(W / 2, H / 2, W * 0.45, -Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6); ctx.closePath(); ctx.fill();
  }
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

const PRIM_CARDS = PRIMARIES.map((id) => {
  const d = WEAPONS[id];
  const sub = { ak47: '潜伏者经典 · 伤害高', m4a1: '保卫者经典 · 稳定', awm: '一枪致命 · 需开镜', mp5: '射速快 · 移动灵活' }[id];
  return `<div class="card" data-w="${id}"><img alt=""><b>${d.name}</b><small>${sub}</small></div>`;
}).join('');

// 练习面板换枪按钮组（仅目录内：主武器 + 副武器 + 军刀 + 投掷物槽）
const PR_GUN_BTNS = [
  ...PRIMARIES.map((id) => ({ slot: 0, id })),
  { slot: 1, id: 'deagle' },
  { slot: 2, id: 'knife' },
  { slot: 3, id: null },
].map((g) => `<button data-slot="${g.slot}"${g.id ? ` data-w="${g.id}"` : ''}>${(WEAPONS[g.id] || {}).name || '投掷物'}</button>`).join('');

const TEMPLATE = `
<div id="hud" class="hidden">
  <div id="blind" class="hidden"></div>
  <div id="score">
    <div class="team bl" id="tBL"><span class="nm">潜伏者</span><span class="pts" id="sBL">0</span></div>
    <div class="mid"><div class="time" id="sTime">10:00</div><div class="goal" id="sGoal"></div></div>
    <div class="team gr" id="tGR"><span class="pts" id="sGR">0</span><span class="nm">保卫者</span></div>
  </div>
  <div id="radarWrap"><canvas id="radar"></canvas><div class="lbl">运输船</div></div>
  <div id="clinks"><a href="https://github.com/riba2534/claude-opus-5-5-demo" target="_blank" rel="noopener noreferrer" title="GitHub 源码" aria-label="GitHub 源码"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg></a><a href="https://x.com/riba2534" target="_blank" rel="noopener noreferrer" title="X @riba2534" aria-label="X @riba2534"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/></svg></a></div>
  <div id="feed"></div>
  <div id="vitals">
    <div class="vbox" id="hpBox"><div class="ic">✚</div><div class="val" id="hpVal">100</div></div>
    <div class="vbox" id="arBox"><div class="ic">⛨</div><div class="val" id="arVal">100</div></div>
  </div>
  <div id="slots"></div>
  <div id="nadeInfo" class="hidden"></div>
  <div id="slotC4" class="hidden"><span>C4</span><b>5</b></div>
  <div id="objInfo" class="hidden"><span id="objRound"></span><span id="objAlive"></span></div>
  <div id="c4State" class="hidden"></div>
  <div id="objHint" class="hidden"></div>
  <div id="objProg" class="hidden"><i id="objProgFill"></i><span id="objProgLbl"></span></div>
  <div id="ammo"><div class="wname" id="wName"></div><div class="row"><img class="wicon" id="wIcon" alt=""><span class="mag" id="aMag">30</span><span class="res" id="aRes">/ 90</span></div><div class="hint" id="aHint"></div></div>
  <div id="cross"><i class="t" id="cT"></i><i class="b" id="cB"></i><i class="l" id="cL"></i><i class="r" id="cR"></i></div>
  <div id="hit"><i></i><i></i><i></i><i></i></div>
  <div id="dmgDirs"></div>
  <div id="scope"><div class="ring"></div><div class="h"></div><div class="v"></div><div class="h2 l"></div><div class="h2 r"></div><div class="v2"></div><div class="dot"></div></div>
  <div id="badge"><div class="ico"></div><div class="txt"></div><div class="sub"></div></div>
  <div id="center" class="hidden"><div class="big" id="cBig"></div><div class="small" id="cSmall"></div></div>
  <div id="toast"></div>
  <div id="protect"></div>
  <div id="nameTip"></div>
  <div id="practice" class="hidden"><div class="ph"><b>练习靶场</b><span id="prHits">命中 0</span><span id="prWeapon"></span></div><div id="prTargets"></div><div id="prGuns">${PR_GUN_BTNS}</div></div>
  <div id="board" class="hidden tbl"><h3><span id="boardTitle">运输船 · 团队竞技</span><span>Tab</span></h3><div id="boardBody"></div></div>
  <div id="touch" class="hidden"></div>
</div>

<div id="loading" class="screen"><div class="t" id="loadTitle">运 输 船</div><div class="s" id="loadTxt">LOADING</div><div class="bar"><i id="loadBar"></i></div><div class="tip">小提示：蹲下再跳（蹲跳）可以跳得更高，踩着木箱就能爬上对面集装箱的二楼。</div></div>

<div id="menu" class="screen hidden">
  <div class="menuBox">
    <div class="title">
      <div class="logo">CROSSFIRE · 团队竞技</div>
      <h1 id="mapTitle">运输船</h1>
      <div class="en" id="mapEn">TRANSPORT SHIP</div>
      <p id="mapBlurb"></p>
      <div class="keys">
        <kbd>W A S D</kbd><span>移动　<kbd>Shift</kbd> 静步　<kbd>空格</kbd> 跳　<kbd>C</kbd> 蹲</span>
        <kbd>鼠标左键</kbd><span>开火　<kbd>右键</kbd> 狙击开镜 / 刀重击</span>
        <kbd>1 2 3 4</kbd><span>主武器 / 手枪 / 刀 / 手雷　<kbd>Q</kbd> 快切　<kbd>滚轮</kbd> 切换</span>
        <kbd>5</kbd><span>C4（携带时）　<kbd>E</kbd> 拆包 / 拾取（拆包优先）　<kbd>G</kbd> 丢弃 C4</span>
        <kbd>R</kbd><span>换弹　<kbd>F</kbd> 检视武器　<kbd>B</kbd> 更换主武器</span>
        <kbd>Tab</kbd><span>计分板　<kbd>Esc</kbd> 暂停 / 设置</span>
      </div>
      <div class="note hidden" id="touchNote">检测到触屏设备：已启用虚拟摇杆（左侧移动、右侧滑动视角）。电脑 + 鼠标体验最佳。</div>
    </div>
    <div class="opts">
      <div class="opt"><div class="lab">地图</div><div class="seg" data-k="map" id="mapSeg"></div></div>
      <div class="opt"><div class="lab">模式</div><div class="seg" data-k="mode" id="modeSeg"></div></div>
      <div class="opt"><div class="lab">阵营</div><div class="seg team" data-k="team"><button data-v="BL">潜伏者<small>Black List</small></button><button data-v="GR">保卫者<small>Global Risk</small></button></div></div>
      <div class="opt"><div class="lab">主武器</div><div class="seg" data-k="primary"><button data-v="ak47">AK-47</button><button data-v="m4a1">M4A1</button><button data-v="awm">AWM</button><button data-v="mp5">MP5</button></div></div>
      <div class="row2">
        <div class="opt"><div class="lab">对战规模</div><div class="seg" data-k="size"><button data-v="4">4v4</button><button data-v="6">6v6</button><button data-v="8">8v8</button></div></div>
        <div class="opt"><div class="lab">目标击杀</div><div class="seg" data-k="goal"><button data-v="30">30</button><button data-v="50">50</button><button data-v="100">100</button></div></div>
      </div>
      <div class="opt"><div class="lab">电脑难度</div><div class="seg" data-k="diff"><button data-v="easy">简单</button><button data-v="normal">普通</button><button data-v="hard">困难</button><button data-v="hell">地狱</button></div></div>
      <div class="row2">
        <div class="opt"><div class="lab">时间</div><div class="seg" data-k="tod"><button data-v="day">白天</button><button data-v="dusk">黄昏</button></div></div>
        <div class="opt"><div class="lab">画质</div><div class="seg" data-k="quality"><button data-v="low">流畅</button><button data-v="medium">均衡</button><button data-v="high">极致</button></div></div>
      </div>
      <div class="row3">
        <div class="opt"><div class="lab">灵敏度</div><div class="slider" data-k="sens"><input type="range" min="0.2" max="3" step="0.05"><span></span></div></div>
        <div class="opt"><div class="lab">视野 FOV</div><div class="slider" data-k="fov"><input type="range" min="65" max="100" step="1"><span></span></div></div>
        <div class="opt"><div class="lab">音量</div><div class="slider" data-k="vol"><input type="range" min="0" max="1" step="0.05"><span></span></div></div>
      </div>
      <div class="opt" id="profileBox">
        <div class="lab">军衔档案</div>
        <div id="rankRow"><span id="rankName"></span><span id="rankLevel"></span><div class="rankBar"><i id="rankFill"></i></div><span id="rankXp"></span></div>
        <div class="seg" id="presetSeg"></div>
        <div class="note hidden" id="profileNote">本地存档不可用，进度仅本次会话有效</div>
      </div>
      <button class="go" id="btnStart">开 始 游 戏</button>
      <div class="note">点击开始后鼠标将被锁定，按 Esc 暂停。画质切换会重新加载页面。</div>
      <div class="mlinks"><a href="https://github.com/riba2534/claude-opus-5-5-demo" target="_blank" rel="noopener noreferrer">GitHub 源码</a><span>·</span><a href="https://x.com/riba2534" target="_blank" rel="noopener noreferrer">X @riba2534</a></div>
    </div>
  </div>
</div>

<div id="pause" class="screen hidden"><div class="pauseBox"><h2>暂停</h2>
  <div class="opt"><div class="lab">鼠标灵敏度</div><div class="slider" data-k="sens"><input type="range" min="0.2" max="3" step="0.05"><span></span></div></div>
  <div class="opt"><div class="lab">视野 FOV</div><div class="slider" data-k="fov"><input type="range" min="65" max="100" step="1"><span></span></div></div>
  <div class="opt"><div class="lab">音量</div><div class="slider" data-k="vol"><input type="range" min="0" max="1" step="0.05"><span></span></div></div>
  <div class="opt"><div class="lab">时间</div><div class="seg" data-k="tod"><button data-v="day">白天</button><button data-v="dusk">黄昏</button></div></div>
  <button class="go" id="btnResume">继 续</button><button class="go sec" id="btnQuit" style="margin-top:10px">退出到主菜单</button>
</div></div>

<div id="loadout" class="screen hidden"><div class="loadBox"><h2>更换主武器</h2><div class="sub">团队竞技：出生点内立即生效，否则复活时生效。爆破：准备期内立即生效，交战期更换下回合生效。副武器沙漠之鹰、军刀、手雷自动配备。</div>
  <div class="cards" id="loadCards">${PRIM_CARDS}</div>
  <button class="go sec" id="btnLoadClose" style="margin-top:14px">确 定（B）</button>
</div></div>

<div id="end" class="screen hidden"><div class="endBox">
  <div class="res" id="endRes">胜利</div><div class="sc" id="endSc"></div><div class="mvp" id="endMvp"></div><div class="mvp" id="endMe" style="color:#dfe4e8"></div>
  <div id="endAward" class="hidden"></div>
  <div id="endTable" class="tbl"></div>
  <div style="display:flex;gap:10px;margin-top:16px"><button class="go" id="btnAgain">再 来 一 局</button><button class="go sec" id="btnMenu">主菜单</button></div>
</div></div>
`;
