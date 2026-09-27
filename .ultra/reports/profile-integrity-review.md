# Profile 完整性修复 — 独立只读审核报告

**审核员**：GLM-5.3-Flash MAX（全新上下文，只读；CLI 会话 652d078c-3b3f-4453-ad0a-77591ea15acb，事件 `.ultra/dispatch/logs/profile-integrity-review.jsonl`）
**日期**：2026-09-27
**对象**：`.ultra/reports/profile-integrity-fix.md` 所述修复（快照只读 + persistence 如实报告），及 `src/profile/` 四模块与 `tests/unit/profile-core.test.mjs`
**方法**：通读全部源码与三份报告、规范 `#Profile` 一节；实际运行聚焦测试；用 `node --input-type=module` 对目录推导与归一路径做了黑盒探针验证。
**提示**：`.ultra/reports/profile-integrity-review-prompt.md`

## 结论：APPROVE

理由：两项声称的修复均在代码中真实落地且有可观察公共行为测试锁定；聚焦测试真实运行 **12 pass / 0 fail**（node --test，270ms）；XP 白名单、去重、练习排除、存档隔离、损坏归一、军衔/装备目录自洽性全部核实通过。发现的缺陷均为 P3 级（归一化盲点与测试覆盖缺口），无一阻塞合入。该轮修复严格遵守了声明的文件所有权范围（仅 service.js + 测试文件）。

## 逐点证据

### 1. 聚焦测试真实结果与测试质量

`node --test tests/unit/profile-core.test.mjs` 实际输出：`tests 12 / pass 12 / fail 0 / skipped 0`，与修复报告声称的「12 pass / 0 fail」一致。12 条测试全部只通过公开 API（`createProfileService`、`profile`/`rank`/`persistence` getter、`switchPreset`/`setPresetSlot`/`applyResult` 返回值）观察行为，storage 均为注入的内存实现，无一处探入内部状态。

无同义反复：关键算术有独立硬编码锚点——`profile-core.test.mjs:177` 断言 `kills:30` 超上限后得 `300`（20×10+胜100），不依赖被测函数自身；快照测试（145-170 行）通过「篡改后重载磁盘」这一外部可观察路径验证不分叉，而非只比内存。轻微半同义反复：第 112/159 行用 `resultXp(ev)` 作为期望值（与 service 内部同一函数），但被第 177 行的硬编码断言兜底，可接受。

### 2. 「停止活动对象突变」「准确报告内存持久化」是否真实落地 — 均已落地

**P3-3（live 对象）**：上一轮 `early-cores-review.md:42-43` 的原始发现属实。现 `service.js:63-68` 的 `publicSnapshot()` 做 JSON 往返深拷贝后逐层 `deepFreeze`，getter（77 行）返回冻结副本；身份缓存（64 行 `snapshot.source !== profile`）依赖「service 内所有更新都是不可变整体替换」，核实了三处变更点（107、116、126 行）确实全部 `{...profile, ...}` 替换，缓存前提成立。档案由 `normalizeProfile` 保证纯 JSON，深拷贝无损。测试以 try/catch 包裹篡改（兼容冻结抛错与静默无效两种实现）后断言服务内存、去重、重载三方面不受影响——是行为验证，非实现镜像。

**P3-5（persistence 谎报/不可恢复）**：`service.js:59` `let persisted = repo != null;` 从构造期起如实反映「未注入 storage = memory」；`service.js:72` `persisted = repo.save(profile);` 以最近一次写入结果为准，写成功可从失败中恢复。测试 78-82 行覆盖三种无 storage 调用形态，84-104 行覆盖「失败→memory、恢复写成功→persisted、并用同一 storage 重载证明数据确实落盘」（103 行）。两处修复与报告描述吻合。

### 3. XP 白名单与一次发放去重 — 正确

- 白名单：`service.js:13` `AWARDABLE_MODES = ['tdm', 'bomb']`，守卫在 88-90 行。实测探针确认 practice 直接返回 0；测试 126-143 行锁定缺失/未知（ctf）/空串 mode 均 `awarded:false`、不产 `stats` 桶、不占账本键。
- 去重：`service.js:89` 以 `profile.ledger.includes(key)` 拒绝重复；账本随档案持久化（103-107 行），测试 116-118 行验证「同会话重试」与「重载后同键」均不重复发。
- 练习不入账：守卫先行，`applyResult({mode:'practice'})` 在调用 `resultXp` 之前即被拒，不写统计、不触发持久化。测试 120-123 行锁定。
- 账本封顶：`service.js:103-105` 满员时 `slice(len-199)` + push = 恰好 200，算术正确（但该分支无测试，见缺陷 P3-4）。

### 4. 版本化键隔离与损坏归一 — 隔离真实；归一路径基本被覆盖，stats 是盲点

- 隔离：`repository.js:4` `PROFILE_KEY = 'cf_profile_v1'`，`settings.js:6` `cf_opts_v2`，两键无任何代码交叉读写（grep 全 src 确认）；全仓只有 `settings.js` 直接触 `localStorage`，game/HUD 未越层碰存储。
- 归一路径实测探针（合法 JSON 但字段全垃圾的存档，`v:1, xp:-5, presets:'garbage', activePreset:99, ledger:[1,'k',null]`）：重载后 xp→0、activePreset→2（夹紧）、presets→3 套合法预设、ledger→`["k"]`（非字符串滤除）——`normalizeProfile` 有效。`parseProfileRaw` 实测拒绝非字符串与无版本号记录（均返回 null，按全新档案重建）。
- 测试覆盖现状：**只有坏 JSON 一条**（测试 61-68 行）。「无版本号」「合法 JSON 但字段垃圾」两条归一路径代码正确但无测试锁定——规范 `desert-grey.md:49` 验收项明确要求 invalid/corrupt recovery，覆盖不完整（见缺陷 P3-2/P3-3）。

### 5. 军衔阈值与装备预设自洽性 — 通过

- 军衔：`rank.js:5-16` 十级阈值 0/300/900/2000/4000/7000/11000/16000/23000/32000，实测程序化验证严格递增；`rankProgress`（42-60 行）进度夹紧 0..1、满级恒 1。`XP_AWARD`（19-26 行）冻结且带单场上限，测试 177 行独立锚定上限夹紧行为。
- 装备：`equipment.js:15-21` 的 CATALOG **运行时从 `../weapons.js` 真实武器表推导**，实测输出 `primary:[ak47,m4a1,awm,mp5], sidearm:[deagle], melee:[knife], grenade:[he], armor:[standard]`，与 weapons.js 中的 slot/type 声明逐一对应。因为目录是推导而非手抄，预设引用不可能指向不存在的装备——结构上自洽。护甲 `'standard'` 与游戏真实模型吻合：`actor.js:16,47` 固定 `armor = 100`，`game.js:621-624` 护甲减伤，`hud.js:183` 显示。weapons.js 无 flash/smoke 条目，CATALOG.grenade 仅 `he` 与实际表一致，无虚构装备。`equipment.js:16` 对 slot-0 的 `type !== 'grenade'` 过滤当前是无操作（防御性），无害。

### 6. 越层依赖 / 导入环 / 全局服务定位器 — 未发现

- 依赖图实测：`rank.js`、`repository.js` 零 import；`equipment.js` 仅 import 纯数据模块 `weapons.js`（实测 weapons.js 无 import、无 DOM/Three/window 引用）；`service.js` 仅 import 同层三模块。规范要求的「纯域不含 DOM/Three/storage」成立。
- 无导入环（weapons.js 是汇点，不回引 profile）。
- 无全局服务定位器：profile 四模块无任何 `globalThis`/`window` 引用，storage 全部经构造注入；`settings.js:87` 的 `globalThis.localStorage` 在适配器层且属 profile 范围之外。
- 附带核实修复报告自述「尚无 src 内 profile 模块之外的调用方（已 grep 确认）」：属实——`createProfileService`/`applyResult` 在 `src/profile/` 之外零引用，Game/HUD/菜单接线仍是 phase-7 报告列出的未完成集成项（本轮范围声明明确排除，不算缺陷）。

## 缺陷列表

**P1 / P2：无。**

**P3-1 — stats 桶值不在归一化范围内，垃圾值会跨会话传播并进一步变形**
`src/profile/service.js:50` 只校验 `stats` 是对象即原样保留；`service.js:96-101` 用 `(m.matches || 0) + 1` 累加。实测探针：存入 `stats:{tdm:{matches:'x'}}` 后重载，垃圾 `'x'` 存活，下一次 `applyResult` 后变成 `"x1"`（字符串拼接）。与规范「invalid/corrupt saves normalize safely」有出入。影响有限：仅本地自伤数据、不崩溃、不影响 XP，且当前无任何 stats 消费方（接线前修复成本最低）。

**P3-2 — 合法 JSON 但无版本号/字段垃圾的存档归一路径未被测试锁定**
`repository.js:19`（无 v → null）与 `normalizeProfile` 的字段级重建（`service.js:42-53`）代码正确（探针验证），但测试只覆盖坏 JSON（`profile-core.test.mjs:61-68`）。规范验收项「invalid/corrupt profile recovery」目前只有部分测试证据。

**P3-3 — `rank.js` 自身的「残缺结果一律 0」契约未在其模块内强制**
`rank.js:34` 只排除 `mode === 'practice'`；实测直接调用 `resultXp({outcome:'win', kills:5})`（缺 mode）返回 150。当前不可达（service.js 白名单先行、`resultXp` 无其他调用方），但模块头注释（`rank.js:3`）承诺的行为与实现不符，未来任何直接调用都会踩坑。

**P3-4 — 账本封顶分支无测试**
`service.js:103-105` 的 LEDGER_CAP=200 滚动逻辑经目检正确但零覆盖；这是去重窗口的核心参数。

**P3-5（语义备注）— 损坏恢复后构造期即报 `persisted`**
`service.js:59` 使「读到了存储通道」就报 `persisted`，此时重建的全新档案尚未写盘（`profile-core.test.mjs:67` 把该语义锁死）。属「通道健康」而非「数据已落盘」语义，修复报告已如实披露且下次重载会再次归一无数据损失——可接受，但 HUD 接线时应知晓此刻的 `persisted` 不代表当前档案在盘上。

## 非阻塞建议

1. 接线前顺手处理 P3-1：`normalizeProfile` 中对 stats 桶字段套用与 `rank.js:28` `bounded` 同型的数值校验（一次性小改，避免将来 HUD 显示 `x1`）。
2. 补两条归一化测试（无版本号存档、合法 JSON 垃圾字段存档）即可完整锁定规范验收项，其余不必扩测（遵循规范「necessary tests only」约束）。
3. P3-3 可二选一：`rank.js` 改用与 service 相同的白名单（需把白名单下沉到 rank 层避免双源），或修正 `rank.js:3` 的注释把契约收敛为「由调用方保证 mode 已白名单化」。倾向前者，单一事实源。
4. `setPresetSlot`（`service.js:128`）返回的是内部冻结对象的同一引用而非快照拷贝——因 `normalizePreset` 冻结所以安全，但与 `profile` getter 的快照语义不一致，接线 HUD 时统一走 getter 更稳。
5. 上一轮评审对 `stats.bomb` 计数的提醒（按回合键会使 matches 统计回合而非场次，`early-cores-review.md:54`）在接线 `applyResult` 前仍需裁决，本轮未处理（不在其范围）。
6. 流程观察：`src/profile/` 与测试文件目前全部是**未跟踪文件**（从未提交），三轮修复均停留在工作树。报告「未提交/推送」的表述属实，但多轮修复叠加在未版本化文件上，建议尽快落一个基线提交以便后续审核有 diff 可依。
