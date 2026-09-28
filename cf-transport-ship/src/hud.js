// HUD 与菜单（DOM）
import { WEAPONS, PRIMARIES } from './weapons.js';
import { loadOpts, saveOpts, acquireStorage } from './settings.js';
import { MAPS } from './maps/registry.js';
import { MODES, getMode, modeOptionsFor } from './modes/index.js';
import { BOMB_DEFAULTS } from './modes/bomb.js';
import { CATALOGS, createGameLocale } from './i18n/index.js';

const $ = (s, r = document) => r.querySelector(s);

// ---------- 本地化基础（Task 9 / US-02） ----------
// 纯函数片（objectiveHud / matchHeader / awardLine）的缺省翻译：直接取中文目录，
// 与历史输出逐字一致；传入 t（LocaleService.t 形状）即切换语言，不另存第二套硬编码字符串。
const interp = (text, params) => (params ? text.replace(/\{(\w+)\}/g, (m, n) => (params[n] != null ? String(params[n]) : m)) : text);
const zhT = (k, params) => interp(CATALOGS.zh && CATALOGS.zh[k] !== undefined ? CATALOGS.zh[k] : k, params);

// 军衔稳定键（与 profile/rank.js 档位顺序一一对应；adapter 只提供中文 rankName）
const RANK_TIER_KEYS = ['private', 'corporal', 'sergeant', 'staffSergeant', 'secondLieutenant', 'firstLieutenant', 'captain', 'major', 'lieutenantColonel', 'colonel'];
const rankKeyByName = (name) => RANK_TIER_KEYS.find((k) => CATALOGS.zh[`rank.${k}.name`] === name) || null;
const rankKeyByLevel = (level) => {
  const i = (level | 0) - 1;
  return i >= 0 && i < RANK_TIER_KEYS.length ? RANK_TIER_KEYS[i] : null;
};
const rankLabel = (r, t) => {
  const key = rankKeyByName(r && r.rankName) || rankKeyByLevel(r && r.level);
  return key ? t(`rank.${key}.name`) : (r && r.rankName) || '';
};

// game.js 传入的 s.modeName 取自 MODES[id].name（中文），反查稳定键以便翻译
const modeKeyByName = (name) => Object.keys(MODES).find((id) => MODES[id].name === name) || null;

const HS_ICON = 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><g fill="none" stroke="#ff4030" stroke-width="3"><circle cx="20" cy="20" r="11"/><path d="M20 2v10M20 28v10M2 20h10M28 20h10"/></g><circle cx="20" cy="20" r="3.5" fill="#ff4030"/></svg>`);
const WB_ICON = 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect x="15" y="4" width="10" height="32" fill="#bbb"/><path d="M2 20h36" stroke="#ffd24a" stroke-width="3"/></svg>`);
const BADGE_SVG = (color, inner) => `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="bg" cx="50%" cy="45%"><stop offset="0" stop-color="${color}" stop-opacity=".95"/><stop offset="1" stop-color="#1a0a00" stop-opacity=".9"/></radialGradient></defs><polygon points="50,3 93,27 93,73 50,97 7,73 7,27" fill="url(#bg)" stroke="#ffd24a" stroke-width="3"/>${inner}</svg>`;
const SKULL = `<g fill="#fff"><path d="M50 22c-14 0-24 9-24 22 0 8 4 13 9 16v9h30v-9c5-3 9-8 9-16 0-13-10-22-24-22z"/><rect x="40" y="66" width="4" height="8"/><rect x="48" y="66" width="4" height="8"/><rect x="56" y="66" width="4" height="8"/></g><circle cx="41" cy="45" r="6" fill="#3a1500"/><circle cx="59" cy="45" r="6" fill="#3a1500"/>`;
const CROSSHAIR_B = `<g fill="none" stroke="#fff" stroke-width="4"><circle cx="50" cy="50" r="20"/><path d="M50 18v14M50 68v14M18 50h14M68 50h14"/></g><circle cx="50" cy="50" r="5" fill="#ff3020"/>`;

// 爆破 HUD 只读渲染：把 Game.objectiveView 提供的 s.objective 映射为可见文案/进度。
// 不计算任何规则结果——回合胜负、时间、C4 状态全部取自视图字段。
// ctx.t 可选（LocaleService.t 形状）：缺省走中文目录，HUD 传入当前语言 t 即时切换。
export function objectiveHud(view, ctx = {}) {
  const t = ctx.t || zhT;
  const off = { active: false, round: '', aliveBL: '', aliveGR: '', c4: '', c4Cls: '', hint: '', progress: null };
  if (!view || !view.phase || view.phase === 'idle' || view.phase === 'matchEnd') return off;
  const out = { ...off, active: true };
  out.round = view.round ? t('hud.round', { n: view.round }) : '';
  out.aliveBL = String(view.alive?.BL ?? '');
  out.aliveGR = String(view.alive?.GR ?? '');
  const bomb = view.bomb || null;
  const plantHold = view.plantHold || BOMB_DEFAULTS.plantHold;
  const defuseHold = view.defuseHold || BOMB_DEFAULTS.defuseHold;
  if (view.phase === 'roundEnd') {
    out.c4 = '';
    out.hint = view.roundWinner === 'BL' ? t('bomb.roundBL') : view.roundWinner === 'GR' ? t('bomb.roundGR') : t('bomb.roundEnd');
    return out;
  }
  if (view.phase === 'planted') {
    out.c4 = bomb?.site ? t('bomb.plantedSite', { site: bomb.site }) : t('bomb.planted');
    out.c4Cls = 'planted';
    if (view.defusable) out.hint = t('bomb.defuseHold');
    else if (ctx.myTeam === 'BL') out.hint = t('bomb.defendC4');
    else out.hint = t('bomb.gotoC4');
    if (view.defuseProgress > 0) out.progress = { label: t('bomb.defusing'), frac: Math.min(1, view.defuseProgress / defuseHold) };
    return out;
  }
  if (bomb && bomb.planted) { // 视图相位与C4状态不一致时按安放渲染（防御）
    out.c4 = bomb.site ? t('bomb.plantedSite', { site: bomb.site }) : t('bomb.planted');
    out.c4Cls = 'planted';
    return out;
  }
  if (bomb && bomb.dropped) {
    out.c4 = t('bomb.dropped');
    out.c4Cls = 'dropped';
    if (view.pickupable) out.hint = t('bomb.pickup');
    else if (ctx.myTeam === 'BL') out.hint = t('bomb.recover');
    else out.hint = t('bomb.blockPickup');
    return out;
  }
  if (bomb && bomb.carrierId != null) {
    if (bomb.carrierId === ctx.myId) { out.c4 = t('bomb.carryMe'); out.c4Cls = 'carry'; }
    else {
      const a = ctx.actorOf ? ctx.actorOf(bomb.carrierId) : null;
      if (a && ctx.myTeam && a.team === ctx.myTeam) { out.c4 = t('bomb.carryAlly', { name: a.name }); out.c4Cls = 'carry'; }
      else { out.c4 = t('bomb.carryEnemy'); out.c4Cls = 'enemy'; }
    }
    if (view.plantable) out.hint = t('bomb.plantHold');
    if (view.plantProgress > 0) out.progress = { label: t('bomb.planting'), frac: Math.min(1, view.plantProgress / plantHold) };
  }
  if (view.phase === 'prep' && !out.hint) out.hint = t('bomb.prepHint');
  return out;
}

// 主计时条只消费当前模式的公开视图；爆破的 Infinity 对局时限不能当作回合时钟。
// t 可选：模式名经稳定键反查翻译（s.modeName 来自 MODES 中文名）。
export function matchHeader(s, t = zhT) {
  const bomb = s.objective;
  const remaining = bomb ? bomb.timeLeft : s.timeLeft;
  const tl = Math.max(0, Number.isFinite(remaining) ? remaining : 0);
  const mm = Math.floor(tl / 60), ss = Math.floor(tl % 60);
  const modeKey = modeKeyByName(s.modeName || '');
  const mode = modeKey ? t(`mode.${modeKey}.name`) : (s.modeName || '');
  return {
    clock: `${mm}:${ss < 10 ? '0' : ''}${ss}`,
    goal: bomb
      ? t('hud.goalBomb', { mode, n: bomb.winsNeeded ?? BOMB_DEFAULTS.winsNeeded })
      : t('hud.goalTdm', { mode, n: s.goal }),
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
// t 可选：军衔名按中文档位名反查稳定键翻译（未知档位名回落原样，不外泄键名）
export function awardLine(award, t = zhT) {
  if (!award || !award.awarded) return '';
  const xp = `+${award.xp ?? 0} XP`;
  const r = award.rank;
  if (!r) return xp;
  return `${award.rankUp ? t('report.rankUp') : ''}${xp} · ${rankLabel(r, t)}${r.level ? ` · Lv.${r.level}` : ''}`;
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
  // deps.locale 可选（LocaleService）：由最终集成传入 Game 级语言服务；
  // 缺省自建（读 cf_opts_v2 的 lang 字段，自动按浏览器语言解析），旧调用 new HUD(game) 行为不变。
  constructor(game, deps = {}) {
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
    this._lastEnd = null;  // 语言切换时重绘结算页所需快照
    this._lastBoard = null;
    this.radarCtx = this.el.radar.getContext('2d');
    const touch = matchMedia('(pointer:coarse)').matches;
    this.opts = loadOpts(acquireStorage(), touch);
    this.initLocale(deps.locale);
    this.buildMenu();
    this.applyLocale(); // 按当前语言填充静态文案（模板内置 zh 初值，切语言即时重绘）
    this.initBrand();
  }
  saveOpts() { saveOpts(acquireStorage(), this.opts); }

  // ---------- 语言服务（Task 9） ----------
  initLocale(injected) {
    this.locale = injected || createGameLocale();
    this._ownsLocale = !injected; // 自建实例由本 HUD 销毁；注入实例归宿主管
    this.t = (k, p) => this.locale.t(k, p);
    // 缺键回落语义由 LocaleService 负责；这里只记录诊断输出
    this._unsubLocale = this.locale.subscribe(() => this.applyLocale());
  }
  // 键缺失时的安全取值：t() 缺键回退键名本身，展示层用 fallback 挡住键名外泄
  tf(key, fallback) { const v = this.locale.t(key); return v === key ? fallback : v; }
  // 武器/地图/模式的稳定展示名：目录缺键回落注册表原名
  wName(id, fallback) { return this.tf(`weapon.${id}.name`, fallback != null ? fallback : (WEAPONS[id] || {}).name || id); }
  mapName(desc) { return this.tf(`map.${desc.id}.name`, desc.name); }
  modeName(id, fallback) { return this.tf(`mode.${id}.name`, fallback != null ? fallback : getMode(id).name); }
  destroy() {
    if (this._unsubLocale) { this._unsubLocale(); this._unsubLocale = null; }
    if (this._ownsLocale && this.locale && this.locale.destroy) this.locale.destroy();
  }
  // 语言切换 → 全量重绘可见文案。静态节点走 data-i18n 原地改文本（监听器不重绑），
  // 动态分段（地图/模式/预设）整体重建（先清空，旧节点随重建移除，监听器绑在新节点上）。
  applyLocale() {
    document.documentElement.lang = this.locale.getLocale();
    this.applyStaticText();
    this.buildMapSeg();
    if (this.mapDesc) this.setMapInfo(this.mapDesc);
    if (this._profileBound) this.renderProfile();
    this.syncControls();
    this.syncLangSegs();
    this.updateBrand();
    if (this._lastEnd && !this.el.end.classList.contains('hidden')) this.renderEnd(this._lastEnd);
    if (this._lastBoard && !this.el.board.classList.contains('hidden')) {
      const b = this._lastBoard;
      this.scoreboard(true, b.actors, b.myId, b.score);
    }
  }
  applyStaticText() {
    for (const el of this.root.querySelectorAll('[data-i18n]')) el.textContent = this.t(el.dataset.i18n);
    for (const el of this.root.querySelectorAll('[data-i18n-title]')) {
      el.title = this.t(el.dataset.i18nTitle);
      el.setAttribute('aria-label', el.title);
    }
  }
  // 语言分段高亮跟随 LocaleService 实际生效值（auto 反映解析结果）
  syncLangSegs() {
    const v = this.locale.isAuto() ? 'auto' : this.locale.getLocale();
    for (const seg of this.root.querySelectorAll('.langSeg'))
      for (const b of seg.querySelectorAll('button')) b.classList.toggle('on', b.dataset.v === v);
  }
  bindLangSegs() {
    for (const seg of this.root.querySelectorAll('.langSeg')) {
      for (const b of seg.querySelectorAll('button')) {
        b.addEventListener('click', () => {
          const v = b.dataset.v === 'auto' ? '' : b.dataset.v;
          if (this.locale.setLocale(v)) {
            // 与 LocaleService 的持久化保持一致，避免后续 saveOpts 用旧 opts.lang 覆盖
            this.opts.lang = v === '' ? '' : this.locale.getLocale();
            this.saveOpts();
          }
          this.g.audio?.playUI('click');
        });
      }
    }
  }

  // ---------- 品牌（US-01）：按当前语言/背景选已保存原图，只换 src 不改原图 ----------
  initBrand() {
    // 动态加载：品牌资源经 esbuild dataurl 内联；加载失败不阻塞 HUD
    import('./brand/index.js').then(({ createBrandMark }) => {
      this.brand = createBrandMark({ getLocale: () => this.locale.getLocale() });
      this.updateBrand();
    }).catch(() => {});
  }
  updateBrand() {
    const img = this.el.brandMark;
    if (!img || !this.brand) return;
    const mark = this.brand.getMark('transparent');
    if (!mark) { img.classList.add('hidden'); return; }
    img.src = mark.src; img.alt = mark.alt;
    img.classList.remove('hidden');
    const favicon = document.querySelector('link[rel="icon"]');
    if (favicon) favicon.href = mark.src;
  }

  // ---------- 大厅导航（经典 FPS 大厅 tab）：作战默认可见，其余面板 hidden；
  // role=tab/aria-selected/aria-controls 语义 + 方向键/Home/End；状态只在点击/键盘时变更，
  // 语言切换与 show('menu') 不重置（面板文案由 applyStaticText 原地改写，监听器不重绑）
  initLobbyNav() {
    this.navBtns = [...this.root.querySelectorAll('.lobbyNav .navBtn')];
    for (const b of this.navBtns) {
      b.addEventListener('click', () => {
        this.selectLobbyTab(b.dataset.tab);
        this.g.audio?.playUI('click');
      });
      b.addEventListener('keydown', (e) => {
        const i = this.navBtns.indexOf(b);
        let n = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % this.navBtns.length;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i + this.navBtns.length - 1) % this.navBtns.length;
        else if (e.key === 'Home') n = 0;
        else if (e.key === 'End') n = this.navBtns.length - 1;
        if (n == null) return;
        e.preventDefault();
        this.selectLobbyTab(this.navBtns[n].dataset.tab);
        this.navBtns[n].focus();
      });
    }
    this.selectLobbyTab('battle');
  }
  selectLobbyTab(name) {
    if (!this.navBtns || !this.navBtns.some((b) => b.dataset.tab === name)) return;
    for (const b of this.navBtns) {
      const on = b.dataset.tab === name;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
      const panel = this.el[b.getAttribute('aria-controls')];
      if (panel) panel.hidden = !on;
    }
  }
  // 仅 TDM 的击杀目标设置在 practice/bomb 下隐藏（只收 UI，不改变任何实际规则）；
  // 高亮值经 menuMode()（镜像开局解析），与模式分段高亮同源
  updateGoalVisibility() {
    if (this.el.goalOpt) this.el.goalOpt.hidden = ['bomb', 'practice'].includes(this.menuMode());
  }

  // ---------- 菜单 ----------
  // 地图分段整体重建（语言切换即重建）：按钮监听在重建时绑在新节点上，旧节点随 innerHTML 清空移除；
  // 通用设置写入 + 切图回落默认模式两条路径合并到同一个 click（原先分两处绑定）
  buildMapSeg() {
    const seg = $('#mapSeg');
    seg.innerHTML = '';
    const o = this.opts;
    for (const id of Object.keys(MAPS)) {
      const m = MAPS[id];
      const b = document.createElement('button');
      b.dataset.v = id;
      b.innerHTML = `${esc(this.mapName(m))}<small>${m.available ? esc(m.en) : esc(this.t('menu.locked'))}</small>`;
      if (!m.available) b.disabled = true;
      b.addEventListener('click', () => {
        for (const x of seg.querySelectorAll('button')) x.classList.remove('on');
        b.classList.add('on');
        o.map = id;
        o.mode = (m && m.defaultMode) || null; // 切图时模式回落该图默认；对局时 URL ?mode= 仍优先于已存设置
        this.saveOpts();
        this.g.onOption?.('map', id);
        this.g.audio?.playUI('click');
      });
      seg.appendChild(b);
    }
  }
  // 菜单/加载页文案与小地图参数随地图切换（名称/简介经稳定键翻译，语言切换时整条重跑）
  setMapInfo(desc) {
    this.mapDesc = desc;
    this.el.lobby.dataset.map = desc.id;
    const name = this.mapName(desc);
    document.title = `${name} · ${this.t('menu.docTitle')}`;
    this.el.mapTitle.textContent = name;
    this.el.mapEn.textContent = desc.en;
    this.el.mapBlurb.innerHTML = desc.menu ? this.tf(`map.${desc.id}.blurb`, desc.menu.blurb) : '';
    this.el.loadTitle.textContent = this.locale.getLocale() === 'zh' ? name.split('').join(' ') : name;
    this.el.boardTitle.textContent = `${name} · ${this.modeName(desc.defaultMode)}`;
    if (this.el.radarLbl) this.el.radarLbl.textContent = name;
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
      b.textContent = this.modeName(m.id, m.name);
      if (m.id === cur) b.classList.add('on');
      b.addEventListener('click', () => {
        for (const x of seg.querySelectorAll('button')) x.classList.remove('on');
        b.classList.add('on');
        this.opts.mode = m.id;
        this.saveOpts();
        this.updateGoalVisibility();
        this.g.onOption?.('mode', m.id);
        this.g.audio?.playUI('click');
      });
      seg.appendChild(b);
    }
    this.updateGoalVisibility();
  }
  buildMenu() {
    const o = this.opts;
    this.buildMapSeg();
    this.initLobbyNav();
    // 通用分段（mapSeg 已在 buildMapSeg 内自带绑定；modeSeg 按图重建时自绑；langSeg 走 LocaleService）
    const segs = this.root.querySelectorAll('.seg[data-k]:not(#mapSeg)');
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
    this.bindLangSegs();
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
    this.updateGoalVisibility();
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
    this.el.rankName.textContent = rankLabel(r, this.t);
    this.el.rankLevel.textContent = `Lv.${r.level}`;
    this.el.rankXp.textContent = r.nextThreshold != null ? `${r.xp} / ${r.nextThreshold} XP` : this.t('hud.rankMax', { xp: r.xp });
    this.el.rankFill.style.width = `${Math.round(Math.min(1, Math.max(0, r.progress)) * 100)}%`;
    // 存档通道降级（隐私模式/配额错误）：如实提示会话内有效，不宣称「已保存」
    this.el.profileNote.classList.toggle('hidden', a.persistence() !== 'memory');
    const ps = a.presets();
    const seg = this.el.presetSeg;
    seg.innerHTML = '';
    ps.list.forEach((p, i) => {
      const b = document.createElement('button');
      const w1 = this.wName(p.primary), w2 = this.wName(p.grenade);
      b.innerHTML = `${esc(this.t('equip.preset', { n: i + 1 }))}<small>${esc(w1)} · ${esc(w2)}</small>`;
      if (i === ps.active) b.classList.add('on');
      b.addEventListener('click', () => {
        a.switchPreset(i); // adapter 事件 → onProfileChanged → 重渲染高亮
        this.g.audio?.playUI('click');
      });
      seg.appendChild(b);
    });
  }
  loading(p, text) {
    this.el.loadBar.style.width = (p * 100).toFixed(0) + '%';
    if (!text) return;
    // game.js 传入注册表的 loadingLabel（中文）时按稳定键翻译；其余阶段文案接线在 game.js，原样显示
    if (this.mapDesc && text === this.mapDesc.loadingLabel) text = this.tf(`map.${this.mapDesc.id}.loading`, text);
    this.el.loadTxt.textContent = text;
  }

  // ---------- 局内 ----------
  update(dt, s) {
    const e = this.el, t = this.t;
    // 比分与时间
    e.sBL.textContent = s.score.BL; e.sGR.textContent = s.score.GR;
    const header = matchHeader(s, t);
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
      e.aHint.textContent = w.reloading ? t('hud.reload')
        : (d.mag > 1 && w.mag === 0 && w.reserve === 0 ? t('hud.ammoEmpty')
          : (d.mag > 1 && w.mag === 0 ? t('hud.reloadHint') : ''));
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
    e.protect.textContent = s.protect > 0 && s.alive ? t('hud.protect', { sec: s.protect.toFixed(1) }) : '';
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
    const award = s.award ? awardLine(s.award, t) : '';
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
    const html = rows.map((r) => `<span class="${r.current ? 'on' : ''}">${esc(this.wName(r.id, r.name))}<b>×${r.count}</b></span>`).join('');
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
    e.prHits.textContent = this.t('hud.practiceHits', { n: pr.totalHits });
    // P3-6 空态防御：开局 PracticeRuntime.current 可能为 null（game 侧种子化由接线会话处理），
    // 这里显示空武器名、无按钮高亮即可，不抛错
    const w = WEAPONS[pr.weapon && pr.weapon.current];
    e.prWeapon.textContent = w ? this.wName(pr.weapon.current, w.name) : '';
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
    const e = this.el, p = this.g.player, t = this.t;
    const oh = objectiveHud(s.objective, {
      myId: p && p.id, myTeam: s.myTeam, t,
      actorOf: (id) => this.g.actors.find((a) => a.id === id) || null,
    });
    e.objInfo.classList.toggle('hidden', !oh.active);
    e.objRound.textContent = oh.round;
    e.objAlive.textContent = oh.active ? t('hud.alive', { a: oh.aliveBL, b: oh.aliveGR }) : '';
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
      e.wName.textContent = t('hud.c4Item');
      e.aMag.textContent = '—'; e.aMag.classList.remove('low');
      e.aRes.textContent = '';
      e.aHint.textContent = oh.hint || '';
      e.wIcon.style.visibility = 'hidden';
    } else e.wIcon.style.visibility = '';
    // 死亡观战（爆破模式）
    if (!s.alive && oh.active) {
      e.center.classList.remove('hidden');
      e.cBig.textContent = p && p.spectateName ? t('hud.spectatingName', { name: p.spectateName }) : t('hud.spectating');
      e.cSmall.textContent = t('hud.spectateTip');
    } else if (!s.alive && s.respawnIn > 0) {
      e.center.classList.remove('hidden');
      e.cBig.innerHTML = s.killedBy || t('hud.dead');
      e.cSmall.textContent = t('hud.respawnIn', { sec: s.respawnIn.toFixed(1) });
    } else e.center.classList.add('hidden');
    // 触屏目标交互按钮仅爆破模式显示
    const showObj = oh.active && s.alive;
    for (const b of (this.g.touch && this.g.touch.objBtns) || []) b.style.display = showObj ? 'grid' : 'none';
  }
  slots(inv, cur) {
    const e = this.el.slots;
    e.innerHTML = '';
    [this.t('hud.slotPrimary'), this.t('hud.slotPistol'), this.t('hud.slotMelee'), this.t('hud.slotThrow')].forEach((lab, i) => {
      const w = inv[i];
      if (!w) return;
      const d = document.createElement('div');
      d.className = 's' + (i === cur ? ' on' : '');
      d.innerHTML = `<span>${esc(this.wName(w.def.id, w.def.name))}</span><img src="${this.icons[w.id] || ''}"><b>${i + 1}</b>`;
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
    this._lastBoard = show ? { actors, myId, score } : null; // 语言切换时重绘
    if (!show) return;
    const t = this.t;
    const rows = (team) => actors.filter((a) => a.team === team).sort((a, b) => b.stats.k - a.stats.k || a.stats.d - b.stats.d)
      .map((a) => `<tr class="${a.id === myId ? 'me' : ''} ${a.alive ? '' : 'dead'}"><td>${esc(a.name)}</td><td>${a.stats.k}</td><td>${a.stats.d}</td><td>${a.stats.hs}</td></tr>`).join('');
    const tbl = (team) => `<table class="t${team}"><tr><th class="team">${esc(t(`team.${team.toLowerCase()}.name`))} · ${score[team]}</th><th>${esc(t('report.kills'))}</th><th>${esc(t('report.deaths'))}</th><th>${esc(t('report.headshots'))}</th></tr>${rows(team)}</table>`;
    this.el.boardBody.innerHTML = `<div class="cols">${tbl('BL')}${tbl('GR')}</div>`;
  }
  endScreen(win, score, actors, myId) {
    this.show('end');
    this._lastEnd = { win, score, actors, myId }; // 语言切换时重绘
    this.renderEnd(this._lastEnd);
  }
  renderEnd({ win, score, actors, myId }) {
    const t = this.t;
    const r = this.el.endRes;
    r.textContent = win === null ? t('report.draw') : win ? t('report.victory') : t('report.defeat');
    r.className = 'res ' + (win ? 'win' : 'lose');
    this.el.endSc.textContent = `${t('team.bl.name')} ${score.BL} : ${score.GR} ${t('team.gr.name')}`;
    const mvp = [...actors].sort((a, b) => (b.stats.k * 2 - b.stats.d + b.stats.hs) - (a.stats.k * 2 - a.stats.d + a.stats.hs))[0];
    this.el.endMvp.textContent = mvp ? t('report.mvp', { name: mvp.name, k: mvp.stats.k, hs: mvp.stats.hs }) : '';
    const me = actors.find((a) => a.id === myId);
    const acc = me && me.stats.shots ? ((me.stats.hits / me.stats.shots) * 100).toFixed(1) : '0';
    this.el.endMe.textContent = me ? t('report.myScore', { k: me.stats.k, d: me.stats.d, hs: me.stats.hs, acc }) : '';
    const rows = (team) => actors.filter((a) => a.team === team).sort((a, b) => b.stats.k - a.stats.k)
      .map((a) => `<tr class="${a.id === myId ? 'me' : ''}"><td>${esc(a.name)}</td><td>${a.stats.k}</td><td>${a.stats.d}</td><td>${a.stats.hs}</td></tr>`).join('');
    const tbl = (team) => `<table class="t${team}"><tr><th class="team">${esc(t(`team.${team.toLowerCase()}.name`))}</th><th>${esc(t('report.kills'))}</th><th>${esc(t('report.deaths'))}</th><th>${esc(t('report.headshots'))}</th></tr>${rows(team)}</table>`;
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

// 换包卡片：名称/副标题挂稳定键，语言切换由 applyStaticText 原地改写（监听器绑在 .card 上，不重绑）
const PRIM_CARDS = PRIMARIES.map((id) => (
  `<div class="card" data-w="${id}"><img alt=""><b data-i18n="weapon.${id}.name">${esc((WEAPONS[id] || {}).name || id)}</b><small data-i18n="menu.card.${id}"></small></div>`
)).join('');

// 练习面板换枪按钮组（仅目录内：主武器 + 副武器 + 军刀 + 投掷物槽）；文案挂稳定键
const PR_GUN_BTNS = [
  ...PRIMARIES.map((id) => ({ slot: 0, id })),
  { slot: 1, id: 'deagle' },
  { slot: 2, id: 'knife' },
  { slot: 3, id: null },
].map((g) => `<button data-slot="${g.slot}"${g.id ? ` data-w="${g.id}"` : ''} data-i18n="${g.id ? `weapon.${g.id}.name` : 'hud.prGrenades'}">${esc((WEAPONS[g.id] || {}).name || '投掷物')}</button>`).join('');

const TEMPLATE = `
<div id="hud" class="hidden">
  <div id="blind" class="hidden"></div>
  <div id="score">
    <div class="team bl" id="tBL"><span class="nm" data-i18n="team.bl.name">潜伏者</span><span class="pts" id="sBL">0</span></div>
    <div class="mid"><div class="time" id="sTime">10:00</div><div class="goal" id="sGoal"></div></div>
    <div class="team gr" id="tGR"><span class="pts" id="sGR">0</span><span class="nm" data-i18n="team.gr.name">保卫者</span></div>
  </div>
  <div id="radarWrap"><canvas id="radar"></canvas><div class="lbl" id="radarLbl">运输船</div></div>
  <div id="clinks"><a href="https://github.com/riba2534/claude-opus-5-5-demo" target="_blank" rel="noopener noreferrer" data-i18n-title="menu.linkGithub" title="GitHub 源码" aria-label="GitHub 源码"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg></a><a href="https://x.com/riba2534" target="_blank" rel="noopener noreferrer" data-i18n-title="menu.linkX" title="X @riba2534" aria-label="X @riba2534"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/></svg></a></div>
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
  <div id="practice" class="hidden"><div class="ph"><b data-i18n="hud.practiceTitle">练习靶场</b><span id="prHits">命中 0</span><span id="prWeapon"></span></div><div id="prTargets"></div><div id="prGuns">${PR_GUN_BTNS}</div></div>
  <div id="board" class="hidden tbl"><h3><span id="boardTitle">运输船 · 团队竞技</span><span>Tab</span></h3><div id="boardBody"></div></div>
  <div id="touch" class="hidden"></div>
</div>

<div id="loading" class="screen"><div class="t" id="loadTitle">运 输 船</div><div class="s" id="loadTxt" data-i18n="common.loading">LOADING</div><div class="bar"><i id="loadBar"></i></div><div class="tip" data-i18n="load.tip">小提示：蹲下再跳（蹲跳）可以跳得更高，踩着木箱就能爬上对面集装箱的二楼。</div></div>

<div id="menu" class="screen lobbyScreen hidden">
  <div class="lobby" id="lobby">
    <header class="lobbyTop">
      <img id="brandMark" class="hidden" alt="" draggable="false">
      <div class="lobbyBrand">
        <div class="logo" data-i18n="menu.logo">无限工作室</div>
        <div class="gameTitle" data-i18n="menu.gameTitle">前线行动</div>
      </div>
      <nav class="lobbyNav" role="tablist" aria-label="lobby-nav">
        <button class="navBtn" role="tab" id="navBattle" data-tab="battle" aria-controls="panelBattle" aria-selected="true" tabindex="0" data-i18n="menu.tab.battle">作战</button>
        <button class="navBtn" role="tab" id="navLoadout" data-tab="loadout" aria-controls="panelLoadout" aria-selected="false" tabindex="-1" data-i18n="menu.tab.loadout">装备</button>
        <button class="navBtn" role="tab" id="navSettings" data-tab="settings" aria-controls="panelSettings" aria-selected="false" tabindex="-1" data-i18n="menu.tab.settings">设置</button>
        <button class="navBtn" role="tab" id="navControls" data-tab="controls" aria-controls="panelControls" aria-selected="false" tabindex="-1" data-i18n="menu.tab.controls">操作</button>
      </nav>
    </header>
    <div class="lobbyMain">
      <section class="arena">
        <div class="arenaOverline" data-i18n="menu.arena">战区</div>
        <h1 id="mapTitle">运输船</h1>
        <div class="en" id="mapEn">TRANSPORT SHIP</div>
        <p id="mapBlurb"></p>
        <p id="menuError" class="hidden" role="alert"></p>
        <div class="opt"><div class="lab" data-i18n="menu.map">地图</div><div class="seg mapCards" data-k="map" id="mapSeg"></div></div>
      </section>
      <aside class="lobbySide">
        <div class="lobbyPanel" id="panelBattle" role="tabpanel" aria-labelledby="navBattle">
          <div class="opt"><div class="lab" data-i18n="menu.mode">模式</div><div class="seg" data-k="mode" id="modeSeg"></div></div>
          <div class="opt"><div class="lab" data-i18n="menu.team">阵营</div><div class="seg team" data-k="team"><button data-v="BL"><span data-i18n="team.bl.name">潜伏者</span><small data-i18n="team.bl.sub">Black List</small></button><button data-v="GR"><span data-i18n="team.gr.name">保卫者</span><small data-i18n="team.gr.sub">Global Risk</small></button></div></div>
          <div class="row2">
            <div class="opt"><div class="lab" data-i18n="menu.teamSize">对战规模</div><div class="seg" data-k="size"><button data-v="4">4v4</button><button data-v="6">6v6</button><button data-v="8">8v8</button></div></div>
            <div class="opt" id="goalOpt"><div class="lab" data-i18n="menu.goalKills">目标击杀</div><div class="seg" data-k="goal"><button data-v="30">30</button><button data-v="50">50</button><button data-v="100">100</button></div></div>
          </div>
          <div class="opt"><div class="lab" data-i18n="menu.difficulty">电脑难度</div><div class="seg" data-k="diff"><button data-v="easy" data-i18n="diff.easy">简单</button><button data-v="normal" data-i18n="diff.normal">普通</button><button data-v="hard" data-i18n="diff.hard">困难</button><button data-v="hell" data-i18n="diff.hell">地狱</button></div></div>
        </div>
        <div class="lobbyPanel" id="panelLoadout" role="tabpanel" aria-labelledby="navLoadout" hidden>
          <div class="opt"><div class="lab" data-i18n="menu.primary">主武器</div><div class="seg" data-k="primary"><button data-v="ak47" data-i18n="weapon.ak47.name">AK-47</button><button data-v="m4a1" data-i18n="weapon.m4a1.name">M4A1</button><button data-v="awm" data-i18n="weapon.awm.name">AWM</button><button data-v="mp5" data-i18n="weapon.mp5.name">MP5</button></div></div>
          <div class="opt" id="profileBox">
            <div class="lab" data-i18n="menu.profile">军衔档案</div>
            <div id="rankRow"><span id="rankName"></span><span id="rankLevel"></span><div class="rankBar"><i id="rankFill"></i></div><span id="rankXp"></span></div>
            <div class="seg" id="presetSeg"></div>
            <div class="note hidden" id="profileNote" data-i18n="error.storageUnavailable">本地存档不可用，进度仅本次会话有效</div>
          </div>
        </div>
        <div class="lobbyPanel" id="panelSettings" role="tabpanel" aria-labelledby="navSettings" hidden>
          <div class="row2">
            <div class="opt"><div class="lab" data-i18n="menu.timeOfDay">时间</div><div class="seg" data-k="tod"><button data-v="day" data-i18n="tod.day">白天</button><button data-v="dusk" data-i18n="tod.dusk">黄昏</button></div></div>
            <div class="opt"><div class="lab" data-i18n="menu.quality">画质</div><div class="seg" data-k="quality"><button data-v="low" data-i18n="quality.low">流畅</button><button data-v="medium" data-i18n="quality.medium">均衡</button><button data-v="high" data-i18n="quality.high">极致</button></div></div>
          </div>
          <div class="opt"><div class="lab" data-i18n="menu.sensitivity">灵敏度</div><div class="slider" data-k="sens"><input type="range" min="0.2" max="3" step="0.05"><span></span></div></div>
          <div class="opt"><div class="lab" data-i18n="menu.fov">视野 FOV</div><div class="slider" data-k="fov"><input type="range" min="65" max="100" step="1"><span></span></div></div>
          <div class="opt"><div class="lab" data-i18n="menu.volume">音量</div><div class="slider" data-k="vol"><input type="range" min="0" max="1" step="0.05"><span></span></div></div>
          <div class="opt"><div class="lab" data-i18n="settings.language">语言</div><div class="seg langSeg" id="langSeg"><button data-v="auto" data-i18n="settings.languageAuto">自动</button><button data-v="zh" data-i18n="settings.languageZh">简体中文</button><button data-v="en" data-i18n="settings.languageEn">English</button></div></div>
        </div>
        <div class="lobbyPanel" id="panelControls" role="tabpanel" aria-labelledby="navControls" hidden>
          <div class="keys">
            <kbd>W A S D</kbd><span data-i18n="menu.key.move">移动</span>
            <kbd>Shift</kbd><span data-i18n="menu.key.walk">静步</span>
            <kbd data-i18n="menu.key.space">空格</kbd><span data-i18n="menu.key.jump">跳</span>
            <kbd>C</kbd><span data-i18n="menu.key.crouch">蹲</span>
            <kbd data-i18n="menu.key.lmb">鼠标左键</kbd><span data-i18n="menu.key.fire">开火</span>
            <kbd data-i18n="menu.key.rmb">右键</kbd><span data-i18n="menu.key.scope">狙击开镜 / 刀重击</span>
            <kbd>1 2 3 4</kbd><span data-i18n="menu.key.slots">主武器 / 手枪 / 刀 / 手雷</span>
            <kbd>Q</kbd><span data-i18n="menu.key.quickSwap">快切</span>
            <kbd data-i18n="menu.key.wheel">滚轮</kbd><span data-i18n="menu.key.cycleSwitch">切换</span>
            <kbd>5</kbd><span data-i18n="menu.key.c4">C4（携带时）</span>
            <kbd>E</kbd><span data-i18n="menu.key.spab">拆包 / 拾取（拆包优先）</span>
            <kbd>G</kbd><span data-i18n="menu.key.dropC4">丢弃 C4</span>
            <kbd>R</kbd><span data-i18n="menu.key.reload">换弹</span>
            <kbd>F</kbd><span data-i18n="menu.key.inspect">检视武器</span>
            <kbd>B</kbd><span data-i18n="menu.key.changePrimary">更换主武器</span>
            <kbd>Tab</kbd><span data-i18n="menu.key.scoreboard">计分板</span>
            <kbd>Esc</kbd><span data-i18n="menu.key.pauseSettings">暂停 / 设置</span>
          </div>
          <div class="note hidden" id="touchNote" data-i18n="menu.touchNote">检测到触屏设备：已启用虚拟摇杆（左侧移动、右侧滑动视角）。电脑 + 鼠标体验最佳。</div>
        </div>
      </aside>
    </div>
    <footer class="lobbyBottom">
      <button class="go" id="btnStart" data-i18n="menu.start">开 始 游 戏</button>
      <div class="note" data-i18n="menu.lockNote">点击开始后鼠标将被锁定，按 Esc 暂停。画质切换会重新加载页面。</div>
      <div class="mlinks"><a href="https://github.com/riba2534/claude-opus-5-5-demo" target="_blank" rel="noopener noreferrer" data-i18n="menu.linkGithub">GitHub 源码</a><span>·</span><a href="https://x.com/riba2534" target="_blank" rel="noopener noreferrer" data-i18n="menu.linkX">X @riba2534</a></div>
    </footer>
  </div>
</div>

<div id="pause" class="screen hidden"><div class="pauseBox"><h2 data-i18n="menu.pause">暂停</h2>
  <div class="opt"><div class="lab" data-i18n="menu.mouseSensitivity">鼠标灵敏度</div><div class="slider" data-k="sens"><input type="range" min="0.2" max="3" step="0.05"><span></span></div></div>
  <div class="opt"><div class="lab" data-i18n="menu.fov">视野 FOV</div><div class="slider" data-k="fov"><input type="range" min="65" max="100" step="1"><span></span></div></div>
  <div class="opt"><div class="lab" data-i18n="menu.volume">音量</div><div class="slider" data-k="vol"><input type="range" min="0" max="1" step="0.05"><span></span></div></div>
  <div class="opt"><div class="lab" data-i18n="menu.timeOfDay">时间</div><div class="seg" data-k="tod"><button data-v="day" data-i18n="tod.day">白天</button><button data-v="dusk" data-i18n="tod.dusk">黄昏</button></div></div>
  <div class="opt"><div class="lab" data-i18n="settings.language">语言</div><div class="seg langSeg" id="langSegPause"><button data-v="auto" data-i18n="settings.languageAuto">自动</button><button data-v="zh" data-i18n="settings.languageZh">简体中文</button><button data-v="en" data-i18n="settings.languageEn">English</button></div></div>
  <button class="go" id="btnResume" data-i18n="menu.resume">继 续</button><button class="go sec" id="btnQuit" style="margin-top:10px" data-i18n="menu.quit">退出到主菜单</button>
</div></div>

<div id="loadout" class="screen hidden"><div class="loadBox"><h2 data-i18n="menu.loadoutTitle">更换主武器</h2><div class="sub" data-i18n="menu.loadoutSub">团队竞技：出生点内立即生效，否则复活时生效。爆破：准备期内立即生效，交战期更换下回合生效。副武器沙漠之鹰、军刀、手雷自动配备。</div>
  <div class="cards" id="loadCards">${PRIM_CARDS}</div>
  <button class="go sec" id="btnLoadClose" style="margin-top:14px" data-i18n="menu.loadoutOk">确 定（B）</button>
</div></div>

<div id="end" class="screen hidden"><div class="endBox">
  <div class="res" id="endRes">胜利</div><div class="sc" id="endSc"></div><div class="mvp" id="endMvp"></div><div class="mvp" id="endMe" style="color:#dfe4e8"></div>
  <div id="endAward" class="hidden"></div>
  <div id="endTable" class="tbl"></div>
  <div style="display:flex;gap:10px;margin-top:16px"><button class="go" id="btnAgain" data-i18n="menu.again">再 来 一 局</button><button class="go sec" id="btnMenu" data-i18n="menu.toMenu">主菜单</button></div>
</div></div>
`;
