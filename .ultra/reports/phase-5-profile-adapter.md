# 阶段 5/D 波 lane 2 — 本地军衔与装备应用适配层交付报告

**执行者**：GLM-5.3-Flash HIGH（lane 2，无子代理）
**日期**：2026-09-27
**范围**：`cf-transport-ship/src/profile/adapter.js`（新）、`src/profile/service.js`（P3-1 最小修复）、`tests/unit/profile-adapter.test.mjs`（新）。未触碰 `game.js`/`hud.js`/`bots.js`/`player.js`/`touch.js`/`modes/`/maps；未提交。

## 1. API（`src/profile/adapter.js`）

```js
import { createProfileAdapter } from './src/profile/adapter.js';
const adapter = createProfileAdapter({ service, weapons? });
```

- **依赖注入**：`service` 必填（`createProfileService` 产物，缺失抛 `TypeError`）；`weapons` 可选 `{ CATALOG, SLOT_DEFAULTS }`，默认用 `equipment.js` 从 `weapons.js` 推导的真实目录。storage 不经过本层，由 service 的调用方注入。
- **`loadout()`** → `{ primary, sidearm, melee, grenades:[...], armor }`。把激活预设逐槽解析：目录内 id 原样保留，目录外/缺失/非字符串回退 `SLOT_DEFAULTS`（单槽回退，不整包作废），输出绝不含目录外装备。`grenades` 为数组（当前预设单雷槽 → 单元素），为将来多雷预留形状。
- **`awardMatch({ key, mode, outcome, kills, objectiveActions })`** → `{ awarded, xp, rankUp, rank }`。`service.applyResult` 的薄封装：`objectiveActions` 映射为 service 的 `objectives`；白名单（tdm/bomb）、去重（key 账本）、练习拒绝全部由 service 保证，adapter 不重复实现。`rank` 为**发分后**的 `rankView()` 快照，HUD 可直接渲染；`rankUp` 供晋级提示。
- **`rankView()`** → `{ rankName, level, xp, nextThreshold, progress }`。经 `rank.rankProgress`；`level` 1 起算（index+1）；`progress` ∈ 0..1；满级 `nextThreshold = null`、`progress = 1`。
- **`switchPreset(index)`** → 实际生效索引（service 侧夹紧 0..2，非数值/NaN/负数/小数均安全）；**`presets()`** → `{ active, list }`（list 为 service 冻结快照的三套预设）。
- **`persistence()`** → `'persisted' | 'memory'`，如实透出 service 状态，供 HUD 显示本地存档/降级提示。
- **`onProfileChanged(cb)`** → 退订函数。事件 `{ reason: 'award' | 'preset', persistence }`；仅在实际变更后通知（去重拒绝/练习拒绝不通知），监听器异常被隔离不阻断其他监听器，非函数输入安全忽略。Set 持有，无全局定位器。

## 2. service.js P3-1 修复（授权范围 1/2）

`normalizeProfile` 原样保留 `stats`，垃圾值（如 `matches:'x'`）会跨会话存活并在累加时变成 `"x1"`。现新增 `normalizeStats`（service.js:55-69）：非对象桶整个丢弃；`matches/wins/kills/objectives` 套 `statsCount`（有限正数向下取整、上限 1e9 兜底）；`wins ≤ matches`。测试见 P3-1 回归条目（`tests/unit/profile-adapter.test.mjs`）。

P3-2 授权的两条归一化测试（无版本号存档 → 全新档案；合法 JSON 字段垃圾 → 字段级重建）一并补入本文件。**P3-3（rank.js 白名单下沉）未动**，按 lane 声明留给合流裁决。

## 3. 红→绿证据

- **红**：先写测试后实现。`node --test tests/unit/profile-adapter.test.mjs` 首跑 `ERR_MODULE_NOT_FOUND: adapter.js`（fail 1）——adapter 尚不存在。
- **绿过程**：实现 adapter 后首跑发现 1 条测试自身期望值算错（1 杀平局 = 10+25 = 35，误写 125），修正测试后全绿。被测代码无需改动。
- **绿**：`node --test tests/unit/profile-*.test.mjs` → **27 pass / 0 fail**（adapter 15 + 原有 core 12，原有 core 无回归）。
- **全量**：`npm test` → **184 pass / 0 fail**（801ms）。
- **构建**：`npm run build` → `built dist/index.html 917.1 KB`，无错误。

测试覆盖清单（15 条，全部走公开 API、storage 注入）：loadout 合法映射/逐槽回退/自定义目录注入；awardMatch tdm 硬编码锚点（5×10+100=150）、bomb 目标分映射、practice 拒绝、重复键拒绝；rankView 新档边界/跨阈值重计/满级 null+1；switchPreset 破坏性输入五种；事件通知/退订/异常隔离；persistence 透出；P3-1 与两条 P3-2 归一化回归。

## 4. 给合流 worker 的接线契约

- **Game → adapter 构造**：在 service 创建处（storage 注入：浏览器用 `settings.js` 同型的 guarded localStorage 适配器，可传 `legacyPrimary` 迁移旧主武器偏好）包一层 `createProfileAdapter({ service })`，向下只传 adapter，不传 service。
- **Game 何时调 `awardMatch`**：在**每局竞技比赛完结事件（matchEnded）**调用**一次**，`key` 必须是该局唯一且跨重试稳定的结果键（建议 `${mode}:${matchId}`，matchId 在开赛时生成并随局持有）。`mode` 只传 `'tdm' | 'bomb'`（练习局不调用，或传 `mode:'practice'` 由 service 拒绝兜底）。bomb 模式注意 service 的 `matches` 桶按调用次数累计——**按场调用而非按回合调用**（early-cores-review 已提醒）。返回值 `awarded/xp/rank/rankUp` 可直接喂给结算 HUD；`awarded:false` 静默即可（去重属正常重放）。
- **HUD 何时读 `rankView`**：一是消费 `awardMatch` 返回的 `rank`（发分后快照，含 `rankUp`）；二是菜单/结算页直接调 `adapter.rankView()`。`persistence() === 'memory'` 时按规格显示"本地存档不可用，进度仅本次会话有效"类提示。注意 profile-integrity-review P3-5 的语义：损坏恢复后构造期即报 `persisted`，此时新档案尚未写盘——HUD 文案不要宣称"已保存"，只表示通道健康。
- **菜单如何 `switchPreset` / `presets`**：菜单用 `presets()` 枚举三套预设（`list[i].primary/sidearm/melee/grenade/armor` 均为目录内 id，可直接渲染）与 `active` 高亮当前套；点击切换调 `switchPreset(i)`，以其返回值为准（越界输入会被夹紧）。槽位编辑目前经 `service.setPresetSlot`（adapter 未包一层，属最小范围；若合流时菜单需要，可加透传方法）。**装备实际生效时机**（bomb 预备 vs 进行、TDM 出生区 vs 重生）是 Game 侧职责：在合规时点调 `loadout()` 取出生装备并喂给现有 spawn 逻辑；adapter 不感知相位。
- **变更订阅**：HUD/菜单用 `onProfileChanged(cb)` 刷新军衔条与预设高亮，不要轮询。`reason:'award'` 后重读 `rankView()`，`reason:'preset'` 后重读 `presets()`/`loadout()`。
- **localStorage 降级行为**（由 service/repository 保证，接线时不要绕过）：隐私模式/配额错误 → `persistence()` 转 `'memory'`，游戏不中断，档案会话内有效；后续写成功自动恢复 `'persisted'`。损坏 JSON/无版本号/字段垃圾存档 → 构造期归一化为合法档案（stats 桶现已包含在内），下次写回即落盘干净数据。profile 键为独立版本化 `cf_profile_v1`，与 `cf_opts_v2` 无交叉。

## 5. 遗留给合流裁决

- P3-3：rank.js「残缺结果一律 0」契约未在模块内强制（白名单下沉 vs 修正注释）。
- `setPresetSlot` 返回内部冻结引用而非快照拷贝（review 建议 4）：接线 HUD 统一走 `profile` getter 语义即可规避，或届时在 adapter 包一层。
- `adapter.js` 与 `profile/` 各文件及测试目前仍未跟踪（从未提交），建议合流 worker 尽快落基线提交以便审核有 diff。
