// 档案应用适配层：Game/HUD/菜单未来唯一的 profile 接缝（浏览器接线在后续合流完成）。
// 职责：把激活预设解析为真实出生装备（只映射目录内 id，损坏槽位回退默认）、
// 封装 service.applyResult 的单次发分入口并附上 HUD 需要的军衔进度、
// 枚举/切换预设、以简单订阅回调向 HUD/菜单广播档案变化。
// 白名单、去重、练习排除、存储降级全部由 service 保证，这里不重复实现；
// storage 不经过本层（由调用方注入给 service），装备目录可注入替换（测试用）。

import { CATALOG, SLOT_DEFAULTS } from './equipment.js';

// 单槽解析：目录内原样保留，目录外/缺失回退该槽默认——输出绝不含目录外装备
function resolveSlot(catalog, defaults, slot, value) {
  return catalog[slot].includes(value) ? value : defaults[slot];
}

export function createProfileAdapter({ service, weapons } = {}) {
  if (!service || typeof service.applyResult !== 'function') {
    throw new TypeError('createProfileAdapter: 需要注入 createProfileService 产生的 service');
  }
  const catalog = (weapons && weapons.CATALOG) || CATALOG;
  const defaults = (weapons && weapons.SLOT_DEFAULTS) || SLOT_DEFAULTS;

  const listeners = new Set();

  function notify(reason) {
    for (const cb of listeners) {
      try { cb({ reason, persistence: service.persistence }); } catch (e) { /* 监听器异常不阻断其他监听器 */ }
    }
  }

  const adapter = {
    // 激活预设 → 实际出生装备；grenades 为数组以容纳未来多雷扩展（当前预设单雷槽 → 单元素）
    loadout() {
      const p = service.profile;
      const preset = p.presets[p.activePreset] || {};
      return {
        primary: resolveSlot(catalog, defaults, 'primary', preset.primary),
        sidearm: resolveSlot(catalog, defaults, 'sidearm', preset.sidearm),
        melee: resolveSlot(catalog, defaults, 'melee', preset.melee),
        grenades: [resolveSlot(catalog, defaults, 'grenade', preset.grenade)],
        armor: resolveSlot(catalog, defaults, 'armor', preset.armor),
      };
    },

    // Game 在 matchEnded 时调用一次。key 必须是该局唯一结果键（如 'tdm:<matchId>'），
    // 重试/重放同键由 service 去重；objectiveActions 为安/拆包等目标行动数。
    // 返回 { awarded, xp, rankUp, rank }：rank 为发分后的军衔进度，供 HUD 直接渲染。
    awardMatch(event) {
      const src = event && typeof event === 'object' ? event : {};
      const res = service.applyResult({
        key: src.key,
        mode: src.mode,
        outcome: src.outcome,
        kills: src.kills,
        objectives: src.objectiveActions,
      });
      if (!res.awarded) return { awarded: false, xp: 0, rankUp: false, rank: adapter.rankView() };
      notify('award');
      return { awarded: true, xp: res.xp, rankUp: res.rankUp, rank: adapter.rankView() };
    },

    // HUD/菜单的军衔视图：level 为 1 起算级别，progress ∈ 0..1，满级 nextThreshold=null
    rankView() {
      const r = service.rank;
      return {
        rankName: r.name,
        level: r.index + 1,
        xp: r.xp,
        nextThreshold: r.nextAt,
        progress: r.progress,
      };
    },

    // 切换激活预设；非数值/NaN/越界由 service 夹紧到 0..2，返回实际生效索引
    switchPreset(index) {
      const n = service.switchPreset(index);
      notify('preset');
      return n;
    },

    // 修改预设槽位（接线 §4.7：菜单↔预设双向同步的收敛点）。透传 service.setPresetSlot：
    // 索引夹紧 0..2，{slot:id} 合并后经 normalizePreset——目录外 id 回落槽默认，
    // 未知槽位名/非字符串被忽略、状态不变；返回该索引归一化后的冻结预设。reason:'preset'。
    setPresetSlot(index, slot, id) {
      const preset = service.setPresetSlot(index, { [slot]: id });
      notify('preset');
      return preset;
    },

    // 预设枚举：{ active, list }，list 为 service 快照的冻结预设（含全部槽位值）
    presets() {
      const p = service.profile;
      return { active: p.activePreset, list: p.presets };
    },

    // 存档状态透出：'persisted' = 本地存档通道可用；'memory' = 存储失败，档案仅会话内有效
    persistence() {
      return service.persistence;
    },

    // 订阅档案变化（reason: 'award' | 'preset'）。返回退订函数；非函数输入安全忽略。
    onProfileChanged(cb) {
      if (typeof cb !== 'function') return () => {};
      listeners.add(cb);
      return () => { listeners.delete(cb); };
    },
  };

  return adapter;
}
