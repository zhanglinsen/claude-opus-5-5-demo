# Phase 3 提前并行任务：目标型 AI 策略核心（objective-ai prep）

日期：2026-09-26。执行者：GLM-5.3-Flash（实现者）。范围：stage3 中可与 stage2 地图/移动 worker 并行的独立切片，供协调者后续评审/集成。依据：`.ultra/specs/desert-grey.md` Rules/Combat（AI 仅感知视线、声音、最后已知位置，具备分路/架点/侧翼/携包/补包/守包/回防拆包，遇阻重寻路不能传送）、task-3 上下文、Profile 段 TDD/SOLID 要求。

## 交付物（仅创建以下三个新文件）

- `cf-transport-ship/src/ai/objective-planner.js` — 目标型 AI 纯策略核心（无 DOM/Three/时钟副作用，不读完整 actor 列表，不接触隐藏敌人位置，不做移动/传送）。
- `cf-transport-ship/tests/unit/objective-planner.test.mjs` — 11 条公共行为边界测试。
- `.ultra/reports/phase-3-objective-ai-prep.md` — 本报告。

未触碰 bots.js、game.js、地图/布局、navigation、modes、HUD、package.json、profile 及其他共享文件。未运行共享构建/浏览器套件（其他 worker 正在编辑）。未提交、未推送、未部署。

说明：`/Users/sen/.codex/skills/tdd/SKILL.md` 读取被权限拒绝（未能授予），改为遵循任务上下文与 spec Profile 段的 TDD 纪律执行：每条行为先红后绿，红→绿→重构纵向推进。

## TDD 记录（每切片独立 红→绿→重构，聚焦命令均为）

```
cd cf-transport-ship && node --test tests/unit/objective-planner.test.mjs
```

切片 1 —— 进攻方分路（持包者去有效包点 + 两名进攻方分走 A/B）：

- 红（模块尚不存在）：`tests 1 / pass 0 / fail 1`（Cannot find module '.../src/ai/objective-planner.js'）
- 绿（最小实现后，未改测试）：`tests 2 / pass 2 / fail 0`

切片 2 —— C4 状态行为（掉落 → 最近者拾取；已安放 → 进攻方守包）：

- 红：`tests 4 / pass 2 / fail 2`（两条新断言失败：'carrier' vs 'retriever'、无守包分支）
- 绿：`tests 4 / pass 4 / fail 0`

切片 3 —— 防守方行为（默认分守 A/B 架点；已安放 → 最近可行动者拆包、其余回防掩护）：

- 红：`tests 6 / pass 4 / fail 2`
- 绿：`tests 6 / pass 6 / fail 0`

切片 4 —— 信息纪律与稳定性（新鲜敌情单点转点支援；过期情报失效；隐藏敌人信息不影响计划；同回合重复决策不振荡；多回合包点覆盖 A 与 B）：

- 红：`tests 11 / pass 10 / fail 1`（仅转点行为失败：'anchor' vs 'rotator'；过期情报用例此时平凡通过，转点实现后成为真实回归）
- 绿：`tests 11 / pass 11 / fail 0`

重构（绿态下进行）：抽取 `nearestAlive`/`siteOfC4` 消除三处「最近可行动队员」与两处 C4 包点回退的重复；`roundAssign` 提前返回扁平化。重构后复跑：`tests 11 / pass 11 / fail 0`。按「必要测试」约束，未重跑全量套件；测试全部落在公共 API（plan 输入/输出）上，期望值由测试内公开的地图元数据推导，不镜像实现公式、不读私有常量。

## API 摘要（供 stage3 集成）

```
createObjectivePlanner({ seed, map, intelMaxAge = 12, attackerTeam = 'BL' })
  seed          数值确定性种子；每（阵营, 回合）派生独立 PRNG，包点选择与调用顺序无关
  map.bombSites 包点元数据 [{ id, x, y, z, ... }]（来自地图定义，如 desert-grey-layout.js）
  intelMaxAge   最后已知位置/声音的有效时长（秒），超龄情报自动失效
  attackerTeam  进攻方阵营（默认 BL，与 modes/bomb.js 一致）
返回 { plan(observation) }
```

observation（只接受许可观察）：

- `self: { id, team, position }` — 自身
- `team: [{ id, position, alive? }]` — 己方小队观察（不含敌方）
- `c4: { state: 'carried'|'dropped'|'planted'|..., carrierId?, site?, position? }` — C4 公开/队内已知状态
- `enemies: { visible: [{ id, position }], lastKnown: [{ id, position, time }], heard: [{ position, time }] }` — 仅许可感知通道
- `now`（回合计时，用于情报过期）、`round`（回合号，决定确定性分路）

返回计划（每队员每次调用一个）：`{ role, intent, site, goal }`

- 进攻方：`carrier/plant`（持包去主包点）、`escort|flank/attack`（护送主包点 / 侧翼另一包点）、`retriever/retrieve`（掉落拾取，目标=掉落位置）、`guard/defend`（安放后守包）
- 防守方：`anchor/hold`（分守 A/B，前 ceil(n/2) 守主防区）、`rotator/rotate`（新鲜敌情指向另一包点时，仅距情报最近者单点支援，目标=情报位置）、`defuser/defuse` + `cover/retake`（C4 安放后最近可行动者拆包，其余回防）

决策稳定性与防扎堆：主包点按（种子, 阵营, 回合）确定性抽取并按回合记忆，回合内不振荡；跨回合 A/B 均会出现（测试覆盖 8 回合）；阵亡者不可担任拾取/拆包（`alive` 判定）；规划仅产出目标点，实际移动由共享导航 `findPath` 执行，无传送。

## 尚未集成（留给 stage3 整合，不在本切片声称完成）

- bots.js 接入：为每个 bot 构建许可观察（可见敌人、空间音效→heard、最后已知位置+时间戳、C4 状态来自 modes/bomb.js 的事件/snapshot），把 `{goal}` 喂给 `navigation.findPath` 做真实寻路与重寻路；规划器本身不移动任何实体。
- BombMatch 连接：回合号、C4 carried/dropped/planted 的位置与包点标注、进攻方阵营 BL 需由整合层从炸弹规则引擎读取后传入 observation。
- 地图接线：desert-grey 的 `bombSites` 元数据（已在 layout 中，A/B 两点）与出生点接入；路线（routes）元数据如后续地图层提供，可用于细化 escort/flank 的路径偏好，当前以另一包点作为侧翼目标。
- 己方语音/报点消息通道：观察结构预留了己方小队观察入口，整合层可把队友报点折叠为 lastKnown 条目；规划器当前消费 visible/lastKnown/heard。
- 交战行为（开火、走位、投掷物）属 task 4；本切片只决定目标与角色，不声称「目标型 AI 机器人已在浏览器可玩」。最终 20 回合固定种子验收待整备后的候选上运行。

## 证据

- 聚焦命令与各切片红/绿结果见上；最终状态：`node --test tests/unit/objective-planner.test.mjs` → 11 pass / 0 fail。
- 未运行共享构建/浏览器套件、未提交、未推送（遵守并行 worker 约束）。
