# Adapter `setPresetSlot` 透传修复 — 小型授权修复报告

**执行者**：GLM-5.3-Flash HIGH（原档案适配层会话续）
**日期**：2026-09-27
**动机**：D 波接线报告 `phase-5-wiring.md` §4.7（及表格第 12 行、§4 第 7 条）：adapter 缺 `setPresetSlot` 透传，菜单主武器偏好（`opts.primary`）优先于档案预设，菜单↔预设双向同步无法收敛，需 lane 3 预设编辑 UI + 本透传后闭环。
**改动范围**：仅 `src/profile/adapter.js`（+7 行）、`tests/unit/profile-adapter.test.mjs`（+2 条用例）。未触碰 game/hud/settings/service；未提交。

## 1. API

```js
adapter.setPresetSlot(index, slot, id)
```

- **方法名与索引参数位次与 `service.setPresetSlot` 一致**（service 签名 `(slotIndex, patch)`）；adapter 把 `(index, slot, id)` 展开为 service 期望的 patch 形式 `{ [slot]: id }`，即 `service.setPresetSlot(index, { [slot]: id })`——纯透传，不在 adapter 层做任何校验或白名单。
- **参数含义**：`index` 预设索引（service 侧夹紧 0..2，越界/非数值不崩溃）；`slot` 槽位名（`'primary' | 'sidearm' | 'melee' | 'grenade' | 'armor'`）；`id` 该槽装备 id（须为 `CATALOG[slot]` 内的真实武器/护甲 id）。
- **返回值语义与 service 一致**：该索引归一化后的**冻结预设对象**（`Object.isFrozen` 为真，字段齐全）。menu 应以返回值或 `presets()` 重读为准渲染。
- **事件**：调用后发 `onProfileChanged({ reason: 'preset', persistence })`，与 `switchPreset` 一致（始终通知；监听方重读状态即可，幂等无副作用）。

**非法输入行为（全部由 service 保证，adapter 不重复实现）**：

| 输入 | 行为 |
|---|---|
| 目录外 id（如 `'bfg-9999'`） | `normalizePreset` 归一到该槽默认（`SLOT_DEFAULTS`），**非报错**——与 service 既有语义一致 |
| 未知槽位名（`'blade'`）/非字符串（`42`） | 未知 patch 键被 `normalizePreset` 忽略，**预设状态完全不变**；返回值仍是合法归一化预设 |
| 越界索引（`9` / `-1` / `NaN`） | 夹紧到 0..2 |
| 合法 id 但目标槽不变 | 等价幂等写回，状态不变 |

## 2. 红绿证据

- **红**：先加 2 条用例后首跑 `node --test tests/unit/profile-adapter.test.mjs` → **pass 15 / fail 2**，失败即新用例（`TypeError: adapter.setPresetSlot is not a function`），既有 15 条不受影响。
- **绿**：最小实现（透传 + `notify('preset')`）后 → **pass 17 / fail 0**。
- **聚焦全量**：`node --test tests/unit/profile-adapter.test.mjs tests/unit/profile-core.test.mjs` → **29 pass / 0 fail**（adapter 17 + core 12，core 无回归）。
- **全量**：`npm test` → **192 pass / 0 fail**（接线基线 190 + 新增 2）。

新增用例覆盖：① 合法修改生效、返回值冻结且与 `service.profile.presets[i]` deep-equal、未触碰槽位与激活索引不变、切到该预设后 `loadout()` 反映修改、preset 事件计数；② 目录外 id 归一到槽默认、非法槽位名状态完全不变（前后 JSON 快照比对）、越界索引夹紧、非字符串槽位不崩溃。

## 3. HUD/菜单（lane 3）侧使用说明

- **单向写**：菜单编辑某套预设的槽位时调 `adapter.setPresetSlot(presetIndex, slot, weaponId)`，**不要**直接持有或修改 `presets()` 返回的对象（冻结快照，写了也无效）。渲染以返回值或随后的 `presets()` 重读为准。
- **双向同步收敛点**：菜单主武器偏好（`opts.primary`）与档案预设的双向同步，以本方法为唯一写入口——菜单选择武器 → `setPresetSlot(active, 'primary', id)` → `onProfileChanged(reason:'preset')` → 菜单重读 `presets()`/`rankView()` 刷新；Game 开局出生装备继续走 `loadout()`（接线报告表格第 12 行的兜底链路不变）。
- **非法输入 UX**：目录外 id 会静默归到槽默认而非抛错——菜单侧应在提交前用 `CATALOG`（或 `presets()` 列表）过滤可选项，不要依赖运行时报错；若收到非法值，重读 `presets()` 会看到默认值回填，直接按该值渲染即可。
- **事件语义**：`reason:'preset'` 在合法修改、归一化回填、以及被 service 忽略的无效写之后都会发出（与 `switchPreset` 的始终通知策略一致）；监听方一律重读状态，不要假设事件意味着"值变了"。

## 4. 遗留

- 无新增遗留。原报告 §5 的其余两项（P3-3 rank.js 白名单下沉、未跟踪文件落基线提交）维持不变，仍留给合流裁决。
