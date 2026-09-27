# Phase 3 目标 AI lane 报告（爆破目标型 AI）

日期：2026-09-26。执行者：GLM-5.3-Flash（HIGH），CLI 单进程实现，无子代理/其它模型。与 RULES、UI lane 并行，遵守 `.ultra/reports/phase-3-parallel-contract.md` 文件所有权。

## 交付物（仅触碰以下文件）

- `cf-transport-ship/src/bots.js` — 新增「爆破目标层」：把已审核的 `createObjectivePlanner`（`src/ai/objective-planner.js`，未改动）接入真实机器人的感知、寻路移动与 C4 命令。
- `cf-transport-ship/tests/unit/bomb-bot.test.mjs` — 新建，7 条公共行为测试（真实 Bot 实例 + 假 Game 契约面）。
- `.ultra/reports/phase-3-ai.md` — 本报告。
- 证据脚本：`cf-transport-ship/artifacts/probe-ai.mjs`（gitignored，调试探针）。

未触碰 game.js / player.js / hud.js / modes / maps / navigation / objective-planner.js / 任何其它 lane 文件。未提交、未推送。

## 行为清单（全部有对应测试）

| 行为 | 实现 | 测试 |
|---|---|---|
| 分路 | 持包者→回合确定性主包点，其余 escort/flank 去另一包点（planner roundAssign，回合内稳定） | 测试 1：两 bot 东西向分路 |
| 携包安放 | carrier 到包区（view.plantable 或公开包点半径兜底）→ `objectiveCommand('startPlant')`；安放中站定（wish 归零），移动/受伤中断交给引擎事实 | 测试 1：startPlant 仅持包者下达 + 安放中位移 <0.15m |
| 携包/拾包 | dropped 且坐标已知才检索（planner retriever）；任何 BL 靠近掉落点 <1.7m 下 `pickupBomb` | 测试 2：最近者最先拾取，其余维持分路 |
| 守包 | planted 后进攻方全员 guard→向安放坐标（未知则合法包点坐标）移动 | 测试 3 |
| 回防拆包 | planted 后最近可行动防守者为 defuser→接近后 `startDefuse` 并站定；其余 cover 回防。他人拆包动作进行中（view.defuserId）不重复下令 | 测试 4 |
| 声音情报转点 | `hear` 进入许可观察（heard 通道），防守方新鲜情报指向另一包点时单点转点支援 | 测试 5 |
| 情报过期 | lastKnown/heard 超 `intelMaxAge=12s` 失效，过期后回防本防区 | 测试 5 |
| 遇阻重规划 | 复用既有卡住检测：卡住 ≥3 拍丢弃当前目标路径重算 + 起跳脱困，全程物理移动无传送 | 测试 6：findPath 重算、位置不跳变 |
| TDM 回归基线 | `Game.bomb` 为空时完全走既有 TDM 路径（随机分路/teamGoals 游走/追 LastSeen），不调用 objectiveView/objectiveCommand | 测试 7 |

## 信息纪律（无全知）

送入 planner 的观察只有：自身、己方全员（id/位置/存活，契约允许的己方通道）、本拍可见敌人（`canSee`）、被击中时攻击者的最后已知位置（`onDamaged`）、`hear` 声音位置——全部带时间戳并按 12s 过期；C4 状态仅来自 `objectiveView` 的公开快照。绝不读取敌方 actor 的实时坐标：敌方位置只经 canSee/hear/onDamaged 三个感知入口进入 `enemyMemory`/`visibleList`。

## 消费的契约面（供协调者与 RULES lane 对表）

- `Game.bomb`：真值=爆破模式（onSpawn 判定，决定是否启用目标层）。
- `Game.objectiveView(actorId)`：期望可序列化视图含 `phase`、`round`、`bomb`（与 `BombMatch.snapshot().bomb` 同形：`{carrierId}` | `{dropped,pos}` | `{planted,site,pos}`），及提示 `plantable`/`defusable`/`pickupable`、`plantProgress`、`defuserId`。**防御式兼容**：任一提示缺失（undefined）时按公开地图元数据（`game.map.bombSites` 的半径）与自身距离兜底判定；`plantProgress`/`defuserId` 缺失只影响「不重复下令」优化，引擎会忽略无效命令。
- `Game.objectiveCommand(type, actorId, pos?)`：bot 只下发 `startPlant`/`pickupBomb`/`startDefuse`（0.8s 节流），不触碰 BombMatch 私有字段。
- `game.map.bombSites`（公开地图元数据，desert-grey 已有 A/B 两点）用于兜底到点判定与守点朝向。
- 新增可选钩子：`game.objectiveSeed`（默认 0）——RULES/整合层可设置确定性种子以满足 20 回合固定种子验收；不设置也能工作。
- planted 无精确坐标时：obs 传 `site`（合法包点 ID），由 planner `c4.position || sitePoint(site)` 降级——符合「不臆造坐标」要求；dropped 无坐标时无人被指派检索。

## TDD 记录

聚焦命令：`cd cf-transport-ship && node --test tests/unit/bomb-bot.test.mjs`

- 切片 1（分路+携包安放，核心纵切）：**红**（`两人应分向不同包点` 行为断言失败，非缺模块）→ 实现 planner 接线/观察构建/寻路执行/命令下发 → **绿**（期间修正两处：假 Game 漏 `bomb` 真值导致回退 TDM；安包站定被卡住检测误判起跳——stuck 判定加 `now >= holdUntil` 守卫）。
- 切片 2（掉包/守包/回防拆包）：先写 3 条测试，2 红（拾取断言过严修正为「最近者最先」；`掩护者不得拆包` 真缺陷——他人动作进行中仍补发 startDefuse，加 `!view.defuserId` 门）→ **绿**。测试架另修一处自身 bug（回防用例漏传 `phase:'planted'`）。
- 切片 3（情报过期/卡住重规划/TDM 回归）：3 条回归守卫测试（其中转点测试的时间线修正了一次：情报 12s 过期与行走窗口重叠导致中途折返属正确行为）→ **绿**。
- 绿态重构：到达目标 1.6m 内不再重复 findPath（守点空耗）；`combatUpkeep` 抽取消除 TDM/爆破两分支重复。重构后复跑 7/7 绿，`objective-planner.test.mjs` 14/14 绿（回归）。
- `node build.mjs` → `built dist/index.html 910.5 KB`（含 bots.js 目标层，打包通过）。

按「必要测试」约束未跑全量套件；未做浏览器验收（归 RULES lane 整合后统一执行）。

## 设计说明

- **每 bot 一个 planner 实例**：planner 按（种子|阵营|回合）确定性派生分配，同队各实例传入相同成员集 → 分配一致，无需共享实例或侵入 Game。
- **角色映射**：`anchor/guard/cover` → `this.role='hold'`（复用既有架点朝向/下蹲行为），其余 → `rush`；目标朝向用公开 `teamGoals` 敌方目标节点。
- **安/拆包站定**：`holdUntil` 抑制移动 wish（含交战横移），保留开火；引擎按 moved/damaged/leftSite 事实中断，bot 感知 `plantProgress`/`defuserId` 持续续期站定状态。
- **交战优先**：可见敌人时移动交由既有战斗走位，目标路径保留、脱离交战后自动回归目标（无需新寻路）。

## 限制与移交项（不扩范围）

1. **view 形状需与 RULES lane 对表**：我方按 `snapshot().bomb` + 提示字段消费并对 undefined 全部有兜底；若 RULES 命名不同，兜底仍可用（半径/距离判定），但建议整合时确认 `plantable/defusable/pickupable/defuserId/plantProgress` 字段名与语义（尤其 defusable 是否已含 `!action` 语义）。
2. **早期 pure planner 的两个 P3**（early-ai-rereview N1：`c4.site` 非法时 planDefender 抛 TypeError；N2：`nearestAlive` 等距平票角色翻转）属 `src/ai/objective-planner.js`，不在本 lane 文件白名单内，未动。正常集成流（同源地图元数据）不可触发；如需修，建议按复核报告的最小修法补两条断言。
3. 交战开火/投掷物行为属 task 4；本 lane 未改战斗细节（仅复用）。
4. 阵营固定按 `attackerTeam='BL'`（与 modes/bomb.js 一致）；无换边逻辑（当前 spec 无此需求）。
5. bot 不主动追击 lastSeen（追击交给战斗行为与防守 rotator 情报通道），避免目标层与交战层互相拉扯。
