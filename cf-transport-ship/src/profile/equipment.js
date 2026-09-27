// 档案装备域：三套预设的槽位目录与归一化（纯函数，无 DOM/storage）。
// 目录从 ../weapons.js 的真实武器表推导（slot 0=主武器、1=副武器、2=近战、3=投掷），
// 保证预设选项永远与实际战斗代码一致。护甲沿用游戏现行的固定 100 护甲模型，
// 目前唯一合法选项 standard；将来若出现可选拾取护甲，只需扩充这张表。

import { WEAPONS } from '../weapons.js';

export const PROFILE_VERSION = 1;

function idsBySlot(slot) {
  return Object.values(WEAPONS).filter((w) => w.slot === slot).map((w) => w.id);
}

// 槽位合法目录（冻结，保持 weapons.js 的声明顺序）
export const CATALOG = Object.freeze({
  primary: Object.freeze(idsBySlot(0).filter((id) => WEAPONS[id].type !== 'grenade')),
  sidearm: Object.freeze(idsBySlot(1)),
  melee: Object.freeze(idsBySlot(2)),
  grenade: Object.freeze(idsBySlot(3)),
  armor: Object.freeze(['standard']), // 游戏当前为固定护甲模型，无可选拾取
});

// 各槽位默认值 = 目录首项
export const SLOT_DEFAULTS = Object.freeze({
  primary: CATALOG.primary[0],
  sidearm: CATALOG.sidearm[0],
  melee: CATALOG.melee[0],
  grenade: CATALOG.grenade[0],
  armor: CATALOG.armor[0],
});

// 未知/损坏的槽位值回退到该槽默认；输出保证全部在目录内
export function normalizePreset(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const slot of Object.keys(SLOT_DEFAULTS)) {
    out[slot] = CATALOG[slot].includes(src[slot]) ? src[slot] : SLOT_DEFAULTS[slot];
  }
  return Object.freeze(out);
}

export function defaultPresets() {
  return [normalizePreset({}), normalizePreset({}), normalizePreset({})];
}
