// 军衔与 XP 域规则（纯函数，无 DOM/storage/时钟）。
// XP 来自「已完结竞技结果」：击杀、目标行动（安/拆包）与胜利，各项均有上限，
// 防止刷分污染统计；练习场结果恒为 0。不设只看击杀数的等级体系。

export const RANKS = Object.freeze([
  { name: '列兵', xp: 0 },
  { name: '下士', xp: 300 },
  { name: '中士', xp: 900 },
  { name: '上士', xp: 2000 },
  { name: '少尉', xp: 4000 },
  { name: '中尉', xp: 7000 },
  { name: '上尉', xp: 11000 },
  { name: '少校', xp: 16000 },
  { name: '中校', xp: 23000 },
  { name: '上校', xp: 32000 },
]);

// 单次竞技结果的计分规则与上限（冻结，作为公开契约）
export const XP_AWARD = Object.freeze({
  perKill: 10,
  killCap: 20,
  perObjective: 50,
  objectiveCap: 10,
  win: 100,
  draw: 25,
});

function bounded(v, cap) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(cap, Math.floor(v)) : 0;
}

// 单场竞技结果 → XP；practice 或残缺结果一律 0
export function resultXp(result) {
  if (!result || typeof result !== 'object' || result.mode === 'practice') return 0;
  const kills = bounded(result.kills, XP_AWARD.killCap);
  const objectives = bounded(result.objectives, XP_AWARD.objectiveCap);
  const outcome = result.outcome === 'win' ? XP_AWARD.win : result.outcome === 'draw' ? XP_AWARD.draw : 0;
  return kills * XP_AWARD.perKill + objectives * XP_AWARD.perObjective + outcome;
}

// XP → 军衔进度：tier 为当前军衔，progress 为当前段内进度 0..1（满级恒为 1）
export function rankProgress(xp) {
  const total = typeof xp === 'number' && Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0;
  let index = 0;
  for (let i = 0; i < RANKS.length; i++) if (total >= RANKS[i].xp) index = i;
  const tier = RANKS[index];
  const next = RANKS[index + 1] || null;
  const span = next ? next.xp - tier.xp : 0;
  const progress = next ? (total - tier.xp) / span : 1;
  return {
    index,
    name: tier.name,
    xp: total,
    currentFloor: tier.xp,
    nextAt: next ? next.xp : null,
    nextName: next ? next.name : null,
    toNext: next ? next.xp - total : 0,
    progress: Math.min(1, Math.max(0, progress)),
  };
}
