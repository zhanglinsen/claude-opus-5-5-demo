// 档案应用服务：装配/读取/保存本地档案，向 HUD/菜单与 Game 暴露唯一事实源。
// storage 由调用方注入（浏览器为 localStorage 适配器，测试为内存实现）；
// 本模块不做任何全局 IO，也不 import settings/game（避免循环依赖）。

import { PROFILE_VERSION, defaultPresets, normalizePreset } from './equipment.js';
import { createProfileRepository } from './repository.js';
import { resultXp, rankProgress } from './rank.js';

// 结果键账本上限：只保留最近 N 个键作为去重窗口（老键自然过期，档案不无限膨胀）
const LEDGER_CAP = 200;

// 可发奖励的已完结竞技模式：练习/缺失/未知 mode 视为残缺结果，一律不发（呼应 rank.js「残缺结果一律 0」）
const AWARDABLE_MODES = ['tdm', 'bomb'];

function clampIndex(v) {
  return Number.isFinite(v) ? Math.min(2, Math.max(0, Math.floor(v))) : 0;
}

// 深冻结：档案是纯 JSON 数据（与持久化格式一致），逐层冻结后外部修改（严格模式赋值/数组 push）无效
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

function freshProfile(legacyPrimary) {
  const presets = defaultPresets();
  if (legacyPrimary != null) presets[0] = normalizePreset({ primary: legacyPrimary });
  return {
    v: PROFILE_VERSION,
    xp: 0,
    presets,
    activePreset: 0,
    stats: {},
    ledger: [],
  };
}

// stats 数值字段上限（防刷分，与 applyResult 单场写入上限同量级的宽松兜底）
const STATS_CAP = 1e9;

function statsCount(v, cap) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(cap, Math.floor(v)) : 0;
}

// stats 桶归一化：非对象桶丢弃，数值字段垃圾值归 0，wins 不超过 matches
function normalizeStats(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const mode of Object.keys(raw)) {
    const m = raw[mode];
    if (!m || typeof m !== 'object') continue;
    const matches = statsCount(m.matches, STATS_CAP);
    const wins = Math.min(statsCount(m.wins, STATS_CAP), matches);
    out[mode] = {
      matches,
      wins,
      kills: statsCount(m.kills, STATS_CAP),
      objectives: statsCount(m.objectives, STATS_CAP),
    };
  }
  return out;
}

// 存档归一化：任何损坏/半残记录都重建为合法档案
function normalizeProfile(raw, legacyPrimary) {
  if (!raw || typeof raw !== 'object') return freshProfile(legacyPrimary);
  const srcPresets = Array.isArray(raw.presets) ? raw.presets : [];
  return {
    v: PROFILE_VERSION,
    xp: typeof raw.xp === 'number' && Number.isFinite(raw.xp) && raw.xp >= 0 ? Math.floor(raw.xp) : 0,
    presets: [0, 1, 2].map((i) => normalizePreset(srcPresets[i])),
    activePreset: clampIndex(raw.activePreset),
    stats: normalizeStats(raw.stats),
    ledger: Array.isArray(raw.ledger) ? raw.ledger.filter((k) => typeof k === 'string') : [],
  };
}

export function createProfileService({ storage = null, legacyPrimary = null } = {}) {
  const repo = storage ? createProfileRepository(storage) : null;
  let profile = normalizeProfile(repo ? repo.load() : null, legacyPrimary);
  // 真实持久化状态：未注入 storage 即 memory；注入后以最近一次写入结果为准（成功可从失败中恢复）
  let persisted = repo != null;

  // 只读快照缓存：profile 以不可变方式整体替换，identity 未变即复用，避免每次访问都深拷贝
  let snapshot = null;
  function publicSnapshot() {
    if (!snapshot || snapshot.source !== profile) {
      snapshot = { source: profile, value: deepFreeze(JSON.parse(JSON.stringify(profile))) };
    }
    return snapshot.value;
  }

  function persist() {
    if (!repo) return;
    persisted = repo.save(profile);
  }

  const svc = {
    // 归一化后的当前档案的只读快照（深层冻结；修改必须走服务方法，外部篡改不影响内存与磁盘）
    get profile() { return publicSnapshot(); },
    get rank() { return rankProgress(profile.xp); },
    // 'persisted' = 本地存档可用；'memory' = 存储失败，档案退化为会话内有效
    get persistence() { return persisted ? 'persisted' : 'memory'; },

    // 记录一次已完结对局结果。仅已完结竞技模式（tdm/bomb）发 XP/统计，且每个结果键只发一次
    // （重试/刷新页面后同键不重复，键账本随档案持久化）。练习/缺失/未知 mode 恒不发。
    // 返回 { awarded, xp, rankUp }。
    applyResult(event) {
      const ev = event && typeof event === 'object' ? event : null;
      const key = ev && typeof ev.key === 'string' && ev.key !== '' ? ev.key : null;
      const competitive = ev !== null && AWARDABLE_MODES.includes(ev.mode);
      if (!competitive || !key || profile.ledger.includes(key)) {
        return { awarded: false, xp: 0, rankUp: false };
      }
      const before = rankProgress(profile.xp);
      const xp = resultXp(ev);
      const mode = ev.mode;
      const stats = { ...profile.stats };
      const m = stats[mode] && typeof stats[mode] === 'object' ? stats[mode] : {};
      stats[mode] = {
        matches: (m.matches || 0) + 1,
        wins: (m.wins || 0) + (ev.outcome === 'win' ? 1 : 0),
        kills: (m.kills || 0) + (typeof ev.kills === 'number' && Number.isFinite(ev.kills) && ev.kills > 0 ? Math.min(200, Math.floor(ev.kills)) : 0),
        objectives: (m.objectives || 0) + (typeof ev.objectives === 'number' && Number.isFinite(ev.objectives) && ev.objectives > 0 ? Math.min(100, Math.floor(ev.objectives)) : 0),
      };
      const ledger = profile.ledger.length >= LEDGER_CAP
        ? profile.ledger.slice(profile.ledger.length - LEDGER_CAP + 1)
        : profile.ledger.slice();
      ledger.push(key);
      profile = { ...profile, xp: profile.xp + xp, stats, ledger };
      const after = rankProgress(profile.xp);
      persist();
      return { awarded: true, xp, rankUp: after.index > before.index };
    },

    // 切换激活预设；越界输入夹紧到 0..2，返回实际生效索引
    switchPreset(index) {
      const n = clampIndex(index);
      profile = { ...profile, activePreset: n };
      persist();
      return n;
    },

    // 修改某套预设的槽位；非法槽位值经 normalizePreset 回默认
    setPresetSlot(slotIndex, patch) {
      const i = clampIndex(slotIndex);
      const presets = profile.presets.slice();
      presets[i] = normalizePreset({ ...presets[i], ...(patch || {}) });
      profile = { ...profile, presets };
      persist();
      return presets[i];
    },
  };

  return svc;
}
