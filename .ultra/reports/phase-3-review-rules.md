# 沙漠灰爆破 Phase-3 独立审核 — 规则/C4/Game 域

**审核员**：GLM-5.3-Flash MAX（全新上下文只读，会话 1da64b66-e55e-4d2a-b6e1-d2d4029655ba，事件 `.ultra/dispatch/logs/phase-3-review-rules.jsonl`，提示 `phase-3-review-rules-prompt.md`）


## 结论：**APPROVE**

规则引擎、C4 生命周期、Game 协调与公共接缝在代码与真实命令输出层面均符合规格与并行契约；未发现 P1/P2 缺陷。id 0 修复真实落地，skip 已转真断言，全量单测 146/146 通过。e2e 产物为合流后重跑的 36/36（原 26 项 + 合流新增 10 项，证据链闭合）。以下逐点给证据。

---

## 逐点核实

### 1. 规格规则参数 — ✅ 符合
- 参数：`src/modes/bomb.js:16-24` `BOMB_DEFAULTS = { teamSize: 5, winsNeeded: 7, prepTime: 5, roundTime: 150, plantHold: 5, defuseHold: 7, fuseTime: 40 }`，与规格 `desert-grey.md:16`（准备5/回合150/安5/拆7/引爆40/先赢7）逐项一致；`tests/unit/bomb-core.test.mjs:48-53` 用 `deepEqual` 锁死。
- 5v5 固定阵营：`src/game.js:179` 爆破固定 `N=5`（玩家+4 bot vs 5 bot）；`startRound`（bomb.js:63-77）每回合只复活不重排 roster，无换边逻辑。
- 先赢 7：`endRound` 达标发 `matchEnded`（bomb.js:265-269）；`src/modes/index.js:25-30` `result()` 按回合比分判定，`checkEnd(){false}`、`scoreKills:false`、`defaults {time:Infinity, respawn:null}`（index.js:18-24）。
- 安包后 BL 全灭仍等待：`bomb.js:208-210` 灭队检查中 BL 全灭仅在 `phase === 'live'` 结算，planted 阶段不触发；测试 `bomb-core.test.mjs:136-145`（全灭后 phase 仍 planted，39s 后爆炸）。
- GR 全灭判 BL 胜（含未安包）：`bomb.js:209`，live/planted 均生效；测试 147-168 三条覆盖。
- 未安包超时 GR 胜：`bomb.js:188-190`；测试 74-83。

### 2. 玩家数字 id 0 — ✅ 修复正确，skip 已转真断言
- 代码：`bomb.js:73-74`（`bl[0] ?? null` / `carrier != null`）、`bomb.js:98`（`if (!a || a.id == null) continue`）、`bomb.js:106-107`（`carrierId == null`）。我逐处复核了模块内全部 id 使用点：命令/成员判定均为 `===`/`!==` 严格比较（bomb.js:125,132,140,147,154,164,299,304），其余为对象键查表（`alive`/`pos`/`tickFacts`），**无残留 falsy 判断**。会话层同样安全：`bomb-session.js:16,70,105-106,119-120` 全部 `!= null`。
- 测试实跑（本会话执行）：`node --test tests/unit/bomb-core.test.mjs tests/unit/bomb-runtime.test.mjs` → **29/29 pass, 0 fail, 0 skipped**。原 skip 已转为真断言：`bomb-runtime.test.mjs:82-90`（经 `BombSession.start()` 真实装配路径断言 `carrierId === 0`），核心侧新增两条（bomb-core.test.mjs:255-281：`startRound(0)` 持包 + id 0 事实采信/死亡掉包 `actorId: 0`）。
- 全量回归：`node --test tests/unit/*.test.mjs` → **146/146 pass, 0 skipped**，与合流报告声称一致。

### 3. C4 生命周期与结算仲裁 — ✅ 完整、唯一、按精确时间仲裁
- 全事件链齐备（bomb.js）：携带 `roundStart.carrierId`（:76）→ 丢弃 `bombDropped/discarded`（:153-159）→ 死亡掉落 `bombDropped/death`（:105-111，pos 取最近已知位置）→ 拾取 `bombPickedUp`（:161-168，仅存活 BL、prep/live）→ 安放 `plantStarted/plantCancelled{released,leftSite,moved,damaged,died,lostBomb}/bombPlanted{site}`（:123-130,214-255）→ 拆除 `defuseStarted/defuseCancelled/bombDefused`（:138-152,195-200）→ 引爆 `bombExploded{site}`（:201-203）→ `roundEnded{winner,reason}`/`matchEnded`。
- 结算唯一性：`endRound` 以 phase 守卫幂等（bomb.js:258-259）；运行时测试断言 `roundEnded` 恰好一次（bomb-runtime.test.mjs:131-132）；超时/灭队同帧互斥由 phase 推进顺序保证（bomb.js:182-211）。
- 临界同帧仲裁：安包 vs 回合超时按**精确完成时刻**判定，`plant.time <= deadlines.live` 即有效（bomb.js:186，含大帧越线场景）；拆包 vs 引爆要求拆包完成时刻**严格早于** fuse，同刻平手判引爆（bomb.js:198-204，注释 :26-27 明示）；测试 `bomb-core.test.mjs:125-134` 构造 50s 重合帧验证“平局爆炸优先、只结算一次”。同批命令 `startDefuse` 优先于 `pickupBomb`（E 键语义，bomb.js:29-32）。

### 4. 暂停 / 重开 / 统一复活 / 观战 — ✅
- 无墙钟泄漏：`src/modes/` 全目录 grep `Date.now|performance.now|setTimeout|setInterval` 零命中；引擎时间仅经 `update(dt)` 推进；Game 暂停时不调 `simulate`（game.js:716-717），会话更新在 simulate 内（game.js:768-774）。核心测试 283-291（不调 update 快照逐字节不变）+ e2e“墙钟 300ms 流逝模拟时钟不动”双证。C4 灯闪用 `realTime`（game.js:391）纯属表现层且仅在 simulate 中刷新，不触碰规则时间。
- 重开清理：`startMatch` 先 `endBombSession()`（destroy 断钩子 + 移除世界 C4，game.js:340-344）再重建会话/roster，`timers=[]`、比分清零（game.js:164-169）；排队命令不穿越重开、destroy 后命令/事件/视图全关（bomb-runtime.test.mjs:180-205）；e2e“新会话第 1 回合/0 比分/C4 标记复位”通过。
- 回合统一复活：`ROUND_RESTART_DELAY=4s` → `spawnAll` → 下一回合（bomb-session.js:8,87-97）；个体复活关闭（`respawnT=null`，game.js:759-762 门控跳过）；测试 bomb-runtime.test.mjs:58-79 精确断言 4s 内不复活、跨 4s 全员复活。
- 观战不泄露敌方：`view.spectate` 只含同队存活且排除自己（bomb-session.js:111-115）；e2e 逐条核对 spectate id 全为同队（artifact 34 项 noLeak）。详见缺陷 P3-2 的一个接缝备注。

### 5. objectiveView/objectiveCommand 公共接缝 — ✅ 与三 lane 契约一致，无布尔 inSite 残留
- 接缝实现：`game.js:350-358`（未知命令经会话白名单拒绝，非爆破模式恒 null）；`bomb-session.js:59-63`（6 类命令收口）、`:101-127`（view 下发 snapshot + `inSite`（`siteAt` 只返回 'A'/'B' 字符串或 null，:35-42）+ `plantable/defusable/pickupable` + `plantHold/defuseHold` + `spectate`）。`plantHold/defuseHold` 为合流会话补齐的契约缺口（phase-3-merge.md §1，红→绿）。
- 消费方对表（抽查实际代码）：hud.js `objectiveHud` 消费 plantable/defusable/pickupable/进度/`plantHold||BOMB_DEFAULTS` 回退（hud.js:27-28,37,51,63-64），`carrierId != null && === p.id` 严格等值（hud.js:248，id 0 安全）；bots.js 消费 `bomb{planted,dropped,carrierId,site,pos}`/phase/三提示/`defuserId`（bots.js:152-158,227-262，提示缺失时有几何兜底、不读引擎私有字段）；player.js `oview.bomb.carrierId === this.id`（player.js:146，id 0 安全）。与 phase-3-merge.md 的对表结论吻合。
- 布尔 inSite：**无残留**。公共视图只产字符串/null；引擎侧把非字符串一律视为“不在包点”（bomb.js:35,6-8 严格契约），并有专项测试拒绝布尔 true/空串（bomb-core.test.mjs:222-253）。核心测试夹具用 `inSite: false` 作原始事实输入属引擎防御契约明确允许的范围，非视图接缝。

### 6. e2e 产物核实 — ✅（36/36，含一点审核方式说明）
- 产物 `artifacts/e2e-bomb-results.json`：date `2026-09-26T17:25:54.297Z`（= 本地 09-27 01:25:54，与 8 张 bomb-*.png mtime 01:24-01:25 吻合），**36/36 pass、consoleErrors/pageErrors 均空**。
- 数目口径：审核单写“26 项”，但脚本现为 36 项——26 项为 RULES lane 原始验收，合流会话新增第 8 节 10 项（玩家 id 0 全链路：真实键盘选 5 号槽、导航寻路逐帧驱动走到 A 点、真实鼠标按住安放、HUD 进度/提示、观战跟随），由 `phase-3-merge.md` §3/§4 记录并在合流后重跑。证据链闭合，非虚报。
- 脚本抽查非空洞：断言落在真实引擎状态（`phase/bomb.planted/site`、比分、`roundEnded` 单次）、真实几何（C4 世界标记与 A 点距离 0.00m）、真实物理（寻路 + 单帧水平位移 ≤0.35m 反传送）、真实 DOM（`#slotC4` class、`#objHint` 文案、`#objProgFill` 宽度 52%）。sim 驱动项用 fastForward/受控摆位且脚本头与产物 note 双重声明，未冒充渲染证据。
- 诚实说明：本会话为只读审核，**未重跑** `node scripts/e2e-bomb.mjs`（该脚本会写 artifacts 截图与 results.json，重跑会覆盖被审核证据本身）；第 6 点结论基于产物 + 脚本逐行阅读 + 我独立运行的单测/代码交叉验证。

---

## 缺陷列表

无 P1、无 P2。以下均为 P3：

- **[P3] e2e 直读引擎内部字段** — `scripts/e2e-bomb.mjs:151,226,243,345` 读 `g.bomb.action/roundWinner/now`。这些不是 `objectiveView` 公共接缝字段（契约只约束 UI/bot 消费方，测试脚本不受限），但若日后 BombSession 收紧封装这些断言会碎。建议后续改走 snapshot/view。
- **[P3] UI 重复实现观战列表，未消费 `view.spectate`** — `src/player.js:122-123` 从 `game.actors` 直筛同队存活，而非读接缝字段。当前两源结果一致、无泄密（e2e noLeak 已实测验证），但存在语义漂移面（合流报告 §1 已如实标注）。建议 player.js 改读 `oview.spectate`，让该字段不沦为仅测试消费。
- **[P3] 爆破开局全员双重出生** — `src/game.js:195` 先直接 `spawnActor(a, true)`，随后 `bombSession.start()` 的 `spawnAll` 钩子再出生一次（game.js:211）。同步执行、无规则影响，纯冗余。
- **[P3] 文档口径漂移** — `phase-3-rules.md:16,58` 仍写“26 项”，现脚本/产物为 36 项（合流报告已记录增量）。阅读单份报告会得出过时数字。

## 非阻塞建议

1. 遗留的最终阶段验收（20 回合固定种子、≥600s 真实渲染、双工作流、连续重开 10 次）仍属阶段门禁未跑——合流报告 §5.5 已声明，本审核不据此扣分，但阶段 3 门禁不应在完成前宣布。
2. e2e 第 2 节依赖 `opts.team='GR'` 绕开玩家携包路径的旧写法（e2e-bomb.mjs:99）在第 8 节补上 id 0 闭环后已无掩盖之嫌；可考虑在脚本注释里把“绕开”措辞改为“对照组”，避免误读。
3. 合流会话把 `plantHold/defuseHold` 补进 view 时，HUD 的 `|| BOMB_DEFAULTS` 回退（hud.js:27-28）已成死分支，可择机删除以保持“分母只来自接缝”的单一来源。
