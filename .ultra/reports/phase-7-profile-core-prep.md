# 阶段 7 前置：档案核心（纯本地域 + 仓储）— 实施报告

GLM-5.3-Flash 早切片实现者。范围：档案域规则、应用服务、版本化本地仓储，全部纯 node 可测，无 DOM/Three/网络/账号。遵守独占文件所有权：未改动任何既有文件；未运行共享构建/浏览器套件。

注：任务指定的 `/Users/sen/.codex/skills/tdd/SKILL.md` 位于沙箱允许目录之外，无法读取；按任务正文中明确的 TDD 规则执行（逐行为 red→green→refactor，一次一个公开行为测试）。

## 新增文件（全部为本切片独占新建）

- `cf-transport-ship/src/profile/rank.js` — 军衔阈值 / 结果计分（纯域）
- `cf-transport-ship/src/profile/equipment.js` — 槽位目录（由真实武器表推导）/ 预设归一化
- `cf-transport-ship/src/profile/repository.js` — 版本化 key `cf_profile_v1`、保护式读写、损坏解析
- `cf-transport-ship/src/profile/service.js` — 应用服务：装配/持久化/预设/结果账本
- `cf-transport-ship/tests/unit/profile-core.test.mjs` — 8 条公开行为测试

## 逐循环 red→green 证据（命令均为 `node --test tests/unit/profile-core.test.mjs`，cwd=cf-transport-ship）

### 循环 1：全新/旧档案装配
- 红（先写测试 2 条）：
  ```
  Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../src/profile/service.js'
  ℹ pass 0  fail 1
  ```
- 实现最小代码：`equipment.js`（目录 + normalizePreset + defaultPresets）、`service.js`（freshProfile + legacyPrimary 迁移）。
- 重构修正（红→绿过程中测试抓住一次设计偏差）：实现最初给三套预设不同的默认主武器（ak47/awm/mp5），与「未迁移槽位用目录默认」的契约冲突（`actual: 'awm', expected: 'ak47'`）；按最小规则改为各槽默认 = 目录首项。
- 绿：`ℹ tests 2  pass 2  fail 0`

### 循环 2：切换预设 + 槽位归一化
- 红（新增 1 条测试）：
  ```
  ✖ 切换激活预设并修改槽位：非法值归一化，不影响其他预设
  TypeError: svc.switchPreset is not a function
  ```
- 实现：`switchPreset(index)`、`setPresetSlot(slotIndex, patch)`（越界夹紧、非法值经 normalizePreset 回默认）。
- 绿：`ℹ tests 3  pass 3  fail 0`

### 循环 3：保存/重载、损坏恢复、存储失败退化
- 红（新增 3 条测试）：
  ```
  Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../src/profile/repository.js'
  ```
- 实现：`repository.js`（safeGet/safeSet、parseProfileRaw 拒绝坏 JSON/无版本记录）+ 服务装配时 load 归一化 + 变更后自动 persist + `persistence` 状态。
- 绿：`ℹ tests 6  pass 6  fail 0`

### 循环 4：结果账本去重 / 练习排除 / 军衔跨越
- 红（新增 2 条测试）：
  ```
  Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../src/profile/rank.js'
  ```
- 实现：`rank.js`（RANKS 阈值、resultXp 上限计分、rankProgress）+ `service.applyResult`（键账本 LEDGER_CAP=200 随档案持久化；practice 恒不发、不进统计）。
- 绿（最终整档运行）：`ℹ tests 8  pass 8  fail 0`

## 公开 API（供后续 Game/HUD/菜单集成）

### `createProfileService({ storage, legacyPrimary })` → service（src/profile/service.js）
- `storage`：注入的存储适配器（浏览器侧由集成层给 localStorage 适配；测试用内存实现）。`null` 时纯内存。
- `legacyPrimary`：首次建档时迁移的旧主武器偏好。集成层应从已加载的 `cf_opts_v2`（`settings.js` 的 `loadOpts().primary`）传入；档案键已存在时该参数被忽略（档案随后 owns 装备）。**集成时注意**：先判断 `cf_profile_v1` 是否存在再决定是否迁移由服务内部处理——服务只在「档案不存在/损坏」时使用 legacyPrimary，因此总是传入当前设置 primary 即可，不会覆盖用户档案。
- 属性：
  - `profile`：归一化档案快照 `{ v, xp, presets[3], activePreset, stats, ledger }`。presets[i] = `{ primary, sidearm, melee, grenade, armor }`。
  - `rank`：`rankProgress(xp)` 结果。
  - `persistence`：`'persisted' | 'memory'`（存储写入失败后为 `'memory'`，档案仍可会话内使用；HUD 应显示降级状态）。
- 方法：
  - `switchPreset(index)` → 实际生效索引（0..2 夹紧），自动持久化。
  - `setPresetSlot(slotIndex, patch)` → 归一化后的该套预设；非法槽位值回默认，自动持久化。
  - `applyResult(event)` → `{ awarded, xp, rankUp }`。event = `{ key, mode, outcome, kills, objectives }`；`key` 为稳定唯一结果键（建议 `'<mode>:<matchId>'`，爆破可按回合 `bomb:<matchId>:r<n>`），重试/刷新同键不重复；`mode:'practice'` 或缺 key 恒不发且不进统计。stats 按模式累计 `{ matches, wins, kills, objectives }`。

### `rank.js`
- `RANKS`：10 级军衔，显式递增 XP 阈值（列兵 0 / 下士 300 / 中士 900 / 上士 2000 / 少尉 4000 / 中尉 7000 / 上尉 11000 / 少校 16000 / 中校 23000 / 上校 32000）。
- `XP_AWARD`：`perKill 10`（上限 `killCap 20`）、`perObjective 50`（上限 `objectiveCap 10`）、`win 100`、`draw 25`。全部上限冻结，防刷分。
- `resultXp(result)`：单场结果 → XP；practice/残缺 = 0。
- `rankProgress(xp)`：`{ index, name, xp, currentFloor, nextAt, nextName, toNext, progress(0..1，满级=1) }`。

### `equipment.js`
- `CATALOG`：`primary ['ak47','m4a1','awm','mp5']`、`sidearm ['deagle']`、`melee ['knife']`、`grenade ['he']`、`armor ['standard']`。由 `weapons.js` 真实武器表按 slot 推导（armor 为游戏现行固定 100 护甲模型，唯一选项 `standard`，未虚构装备）。
- `normalizePreset(raw)` / `defaultPresets()` / `SLOT_DEFAULTS` / `PROFILE_VERSION=1`。

### `repository.js`
- `PROFILE_KEY = 'cf_profile_v1'`（独立于 `cf_opts_v2`，版本字段 `v` 在档案体内）。
- `createProfileRepository(storage)` → `load()`（坏 JSON/无版本/抛错 → null，按全新档案重建）、`save(profile)`（写失败 → false）。
- `parseProfileRaw(raw)` 纯函数可单独测试。

## 设计约束落实
- 纯域（rank/equipment）无 DOM/storage/时钟；服务不 import settings/game/modes，无循环依赖、无全局服务定位器；游戏/HUD 不得直接碰 localStorage（集成阶段遵守）。
- 设置与档案分离：cf_opts_v2 只在首次建档时提供 primary 迁移源，之后装备由档案拥有。
- 练习场不产生 XP、不进模式统计；XP 来源含击杀/目标/胜负，非纯击杀等级。
- 无网络调用、无账号假设、无经济/解锁门槛。

## 未解决的集成工作（交协调者/后续阶段）
1. **浏览器存储适配器**：main.js 需向服务传 `storage: window.localStorage`（建议沿用 settings.js 的 MEMORY_STORAGE 兜底模式）与 `legacyPrimary: opts.primary`。
2. **结果事件接线**：Game 结束 tdm 场次 / bomb 回合与整场时调用 `applyResult`，生成稳定结果键（页面刷新重试同一结果不得换键）；练习场不调用或以 `mode:'practice'` 调用。
3. **装备应用时机**：预设切换后按现有阶段规则应用——bomb 准备期换装 vs 进行中限制、TDM 出生区 vs 复活计时（沿用任务 3 爆破引擎的 phase 事实）；本切片只拥有数据与规则，不触碰 game.js/HUD。
4. **HUD/菜单展示**：军衔进度条、当前激活预设、`persistence === 'memory'` 的降级提示。
5. **验收浏览器工作流**：真实 localStorage 存/刷新/读回（阶段验收清单中的一项，本切片按指令未运行浏览器套件）。
6. **模式统计键**：stats 目前以 `event.mode`（tdm/bomb）为键；若后续要求 per-map 细分，需扩展事件形状（向后兼容）。
