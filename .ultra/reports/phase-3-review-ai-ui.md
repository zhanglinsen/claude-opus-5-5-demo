# 沙漠灰爆破 Phase-3 独立审核 — 目标 AI + 输入/HUD/触屏 + 架构域

**审核员**：GLM-5.3-Flash MAX（全新上下文只读，会话 5d860adb-2641-4767-9de5-ef9147afa39f，事件 `.ultra/dispatch/logs/phase-3-review-ai-ui.jsonl`，提示 `phase-3-review-ai-ui-prompt.md`）


---

# 沙漠灰爆破 Phase-3 审核 — 目标 AI + 输入/HUD/触屏 + 跨文件架构

**结论：REQUEST_CHANGES**（变更范围仅 1 处，属契约生产方 RULES lane 文件；被审的 AI / INPUT / HUD lane 代码本身全部合格）。

唯一阻塞项是 `pickupable` 提示与引擎 `pickupBomb` 均无距离校验，导致掉包后任意位置的 BL 玩家按 E 可“隔空取包”（P2，详见缺陷表）。其余各审核点均有真实代码/测试证据支撑，31/31 单测全绿。

## 测试真实结果

`node --test tests/unit/bomb-bot.test.mjs tests/unit/objective-planner.test.mjs tests/unit/bomb-input.test.mjs` → **31 pass / 0 fail**（bot 7 + planner 14 + input 10），无 skipped。

断言抽查（非空洞）：bomb-bot 测试用真实 `Bot` 实例 + 假 Game 契约面驱动 `update()` 物理移动，断言的是行为结果而非实现——分路断言 `dx1*dx2 < 0`（两 bot 朝相反东西向）、安放中位移 `<0.15m`、卡住时 `findPathCalls >= 2` 且坐标位移 `<0.5m`（不传送）、TDM 下 `viewCalls === 0 && commands.length === 0`。bomb-input 测试逐帧断言命令序列（含 0.3s 宽限期不打断、打断后封锁、松开重按）。planner 测试含对抗性用例（`hiddenEnemies` 注入不影响计划、obs.team 乱序/队友阵亡不改变分配）。

## 逐点核实

**1. AI 信息纪律 — 通过**
- 敌方坐标仅经三个许可入口进入：`canSee`（bots.js:288-302，含距离/FOV/射线遮挡）→ think 的可见循环 bots.js:319-327 仅对 `canSee` 通过者写 `enemyMemory`；`onDamaged`（bots.js:275-277，记录攻击者当时位置）；`hear`（bots.js:272-274）。game.js 四处声音广播（453 枪声 45m / 566 手雷 20m / 614 爆炸 40m / 686 跑步脚步 12m）均为带距离门限的声音事件，非坐标直读。
- `buildObjectiveObs`（bots.js:159-186）只送入自身、己方（契约允许）、`visibleList`、按龄过滤的 `lastKnown`、`heard`；C4 状态仅来自 `objectiveView`。敌方 actor 实时坐标无任何直读路径。
- 情报 12s 过期：`intelMaxAge = 12`（bots.js:40），lastKnown/heard 双重按龄过滤（bots.js:171-177），planner 侧 `freshIntelPoints` 再次过滤（objective-planner.js:171-185）。
- 遇阻重寻路无传送：卡住 ≥3 拍清空 `objGoal/path` 交由下一拍 `findPath` 重算（bots.js:385-394），移动全程经 `world.move` 物理，测试 6 验证位移 <0.5m。

**2. AI 目标行为 — 通过**
- 分路：planner `roundAssign` 按种子确定性定主包点，成员→包点按 id 排序一次定死并缓存（objective-planner.js:50-83），乱序/阵亡不翻转（测试覆盖）。
- 携包安放：bots.js:247-251 仅持包者在 `plantable`（或兜底 `nearSitePoint`）时 `startPlant`；`holdUntil` 站定（update:488 wish 归零），打断交引擎事实（bomb.js:236-241 moved/damaged/leftSite/died）。
- 掉包检索/拾取：planner retriever 只在坐标已知时指派；bots.js:252-253 距掉点 <1.7m 才 `pickupBomb`。守包：planted → guard（planner:114-120）。回防拆包：最近存活防守者 defuser，其余 cover（planner:139-150）；bots.js:254-257 `!view.defuserId` 门 + 引擎 `startDefuse` 要求 `!this.action`（bomb.js:141-147）双重防重复下令。
- TDM 回归：`bombMode=false` 时完全不走 `objectiveThink`（bots.js:346-380），测试 7 断言 `objectiveView` 零调用、零命令。

**3. 输入 — 通过**
- 5 号槽：Digit5 仅 `carryingC4`（objectiveView `bomb.carrierId === player.id`）可选（player.js:146,165-168）；C4 在手时 `weaponUpdate(dt,{})` 全旁路枪械输入（player.js:195）。
- 按住安放/打断封锁：`BombInput` 上升沿 `startPlant`，松开 `stopPlant`；打断 = 宽限 0.3s 耗尽后进度仍为 0 → `stopPlant + blockPlant`，按住不放不再发，必须松开（`!inp.fire` 清封锁）重按（player.js:26-37）。
- E 拆包优先：`!canDefuse && !this.defuseHeld` 才发 `pickupBomb`（player.js:54）。G 丢 C4 带 pos 并退出选中（player.js:56-59）。非爆破模式 `view=null` 零命令（player.js:19-23，测试覆盖）。

**4. HUD 只读性 — 通过**
- `objectiveHud`（hud.js:19-68）是纯函数：无 DOM、无 game 状态、不推算任何规则结果；回合胜方直接渲染 `view.roundWinner`，进度条分母优先取视图 `plantHold/defuseHold`。`updateObjective`（hud.js:229-272）只做显隐/文案映射。
- 触屏按钮显隐：`oh.active && s.alive` 才显示 C4/E/G（hud.js:270-271 → touch.js:34-42），TDM/练习下 `objectiveView` 恒 null → 隐藏。死亡观战仅跟随己方存活队友（player.js:122-133），无敌方泄露；敌方携带者只显示“敌方携带”不显名（hud.js:60-62）。

**5. 跨 lane 契约对表 — 名称/语义全部对上，仅 `pickupable` 一项语义缺口（见 P2）**
实际视图 = `bomb-session.view()`（bomb-session.js:101-127）= `BombMatch.snapshot()` 展开 + 提示字段，产出 `phase/round/score/timeLeft/bomb{carrierId|dropped,pos|planted,site,pos}/plantProgress/defuseProgress/defuserId/alive{BL,GR}/roundWinner/matchWinner/inSite/plantable/defusable/pickupable/plantHold/defuseHold/spectate`。对表结果：
- bots.js `c4FromView` 消费的 `bomb.planted/site/pos/dropped/carrierId` 与 bomb.js:251 的 `{planted, site, pos}` 精确同形；`defuserId` 快照真实存在（bomb.js:290），“不重复下令”门在真机上是生效优化而非仅兜底。
- HUD 的 `plantHold/defuseHold` 视图已下发（bomb-session.js:123-124），UI lane 报告里的 `BOMB_DEFAULTS` 回退已是休眠路径；HUD 报告的字段清单与实际一致。
- `plantable/defusable` 语义一致（引擎含 inSite/存活/`!action` 校验，bomb.js:298-307）。**`pickupable` 例外**：见下。

**6. 架构 — 通过（两处已休眠的防御性重复，非缺陷）**
- 无越层依赖：HUD→`modes/bomb.js` 仅导入冻结常量 `BOMB_DEFAULTS`（hud.js:6），方向合法（域不依赖表现层的约束未被破坏）；输入层只经 `objectiveCommand` 下发，不内嵌胜负判定；bots 全部走公共契约面。
- 无新增全局状态；玩家 id=0 的契约边界已安全：bomb.js 全部改用 `== null` / `!== false` 判空（bomb.js:107,126,141,165），视图/HUD/输入/bots 的 `carrierId === p.id`、`carrierId != null` 在 id=0 下均正确。
- 两个已知 P3 仍存在（已用真实执行复现），但**正常集成流不可触发**：引擎安放时 `site` 只能来自 `session.siteAt` 的合法包点 ID（bomb.js:243-251 + bomb-session.js:35-42），planner 与会话共用同一份 `map.bombSites`；`nearestAlive` 的平票翻转依赖 obs.team 顺序变化，而 `buildObjectiveObs` 固定按 `g.actors` 序迭代。

## 缺陷列表

| 级别 | 缺陷 | 位置 |
|---|---|---|
| **P2** | **掉包可被任意距离拾取**。`pickupable` 对任何存活 BL 恒真（无距离项），引擎 `pickupBomb` 命令也无距离校验 → 掉包后地图任意位置的 BL 玩家 HUD 显示“按 E 拾取 C4”，按 E 即把 C4 隔空收入囊中；顺带导致 HUD“找回 C4”分支对存活 BL 不可达。bot 侧仅因自身 1.7m 门限幸免。正确修法在生产方：`bomb-session.js:108-109` 的 pickupable 加与掉点距离判定（并可下传事实距离），`bomb.js` pickupBomb 分支补权威校验；**不要**在 BombInput 里加客户端距离守卫（会把规则逻辑复制进输入层） | src/modes/bomb-session.js:108-109；src/modes/bomb.js:163-170 |
| P3 | planner P3-1 仍在：`c4.site` 非法且无坐标时 `planDefender` 抛 `TypeError: Cannot read properties of null (reading 'x')`（复现确认；`siteOfC4` 原样返回非法 site → `sitePoint` 返回 null → `nearestAlive` 对 null 解引用；攻击方同输入则诚实降级 goal:null 不抛）。正常流不可触发 | src/ai/objective-planner.js:109,144-145,104 |
| P3 | planner P3-2 仍在：`nearestAlive` 用严格 `<` 归约，平票胜者=数组首个；实测 `[d1,d2]` 与 `[d2,d1]` 两种顺序下 defuser 在 d1/d2 间翻转。正常流 g.actors 序稳定不可触发；近似等距的双 bot 竞争也会被引擎单动作约束与 `!view.defuserId` 门一拍内自愈 | src/ai/objective-planner.js:104 |
| P3 | bots.js:343 读取 `this.target.alive` 清目标——目标可能死于视野外（队友击杀），属于三个许可通道之外的轻量元信息（不泄露坐标，仅影响清目标时机） | src/bots.js:343 |
| P3 | 视图 `spectate` 字段（bomb-session.js:111-115）无任何消费方——player.js 用 g.actors 自行计算己方存活列表，属未使用的契约面 | src/modes/bomb-session.js:111-115 |

## 非阻塞建议

1. bots.js:272 `hear(pos, loud) {    if ...` 语句挤在花括号同行，且 bomb-bot.test.mjs:142 的 `test(...)` 与首语句同行——纯格式噪音，顺手清理即可。
2. bomb-bot.test.mjs:143 `const game` 紧贴 `test(` 同行，建议换行以便断点/栈定位。
3. `game.objectiveSeed` 钩子目前无人设置（bots 默认 0）——20 回合固定种子验收前由 RULES/整合层注入即可，行为已验证可工作。
4. UI lane 报告称 preventDefault 增加了 KeyG，实际 player.js:90 列表无 `'KeyG'`（无功能影响，'g' 无浏览器默认行为），报告措辞与实现有一字之差。
5. bots.js 的 `nearSitePoint()` 与 planner 的 `siteFor` 是有意的 undefined 兜底，真机视图字段恒在，均处休眠——保留无害，但建议整合报告里注明它们是防御层而非活动逻辑。

**给协调者的路由**：P2 修复权在 RULES lane（bomb-session.js / bomb.js），修后需按流程对 pickup 距离边界做一次定向回归（含“掉包后远端按 E 无效 + 近端有效 + GR 按 E 永不拾取”）；AI/INPUT/HUD lane 文件无需改动，两个 planner P3 可按 early-ai-rereview 的最小修法与 P2 同批处理或继续挂账。
