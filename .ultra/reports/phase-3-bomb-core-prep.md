# Phase 3 提前并行任务：爆破规则纯核心（bomb-core prep）

日期：2026-09-26。执行者：GLM-5.3-Flash（实现者）。范围：stage3 中可与 stage2 并行的独立切片，供协调者后续评审/集成。

## 交付物（仅触碰以下三个新文件）

- `cf-transport-ship/src/modes/bomb.js` — 爆破回合纯规则引擎（无 DOM/Three/时钟/随机/副作用）。
- `cf-transport-ship/tests/unit/bomb-core.test.mjs` — 16 条公共行为边界测试（TDD：先红后绿）。
- `.ultra/reports/phase-3-bomb-core-prep.md` — 本报告。

未触碰 modes/index.js、game.js、bots.js、HUD、地图、物理、package.json、既有测试与共享文档，符合不相交文件所有权约束。

## TDD 记录（红→绿）

Red（模块尚不存在）：

```
node --test tests/unit/bomb-core.test.mjs
→ ✖ tests/unit/bomb-core.test.mjs — Cannot find module '.../src/modes/bomb.js'（1 fail / 0 pass）
```

Green（实现 bomb.js 后首次运行，未改测试）：

```
node --test tests/unit/bomb-core.test.mjs
→ tests 16 / pass 16 / fail 0 / skipped 0（duration 238.96ms）
```

按用户"必要测试"约束，未重跑全量套件；本次只跑该聚焦文件。未做实现镜像式断言，测试全部落在公共 API（update 返回事件、snapshot、startRound、command）上。

## API 摘要（供 Game 集成）

- `BOMB_DEFAULTS`：teamSize 5、winsNeeded 7、prepTime 5、roundTime 150、plantHold 5、defuseHold 7、fuseTime 40（与批准规格一致，测试锁定）。
- `new BombMatch({ roster: [{id, team:'BL'|'GR'}], rules? })`；`rules` 仅为测试/确定性接缝。
- `startRound(carrierId)` → 回合统一复活后调用，进入准备期，返回 `[{type:'roundStart',...}]`；仅 idle/roundEnd 可调用。
- `update(dt, facts)` → 唯一时间推进入口（暂停 = 不调用）。facts.actors 每帧提供 `{id, alive, inSite, moving, damaged, pos}`；返回本帧有序语义事件。
- `command({type, actorId, pos?})`：startPlant/stopPlant、startDefuse/stopDefuse、dropBomb、pickupBomb；排队于下次 update 开头结算，startDefuse 优先于 pickupBomb（E 拆包优先）。
- `snapshot()`：phase/round/score/timeLeft/bomb/plantProgress/defuseProgress/defuserId/alive/roundWinner/matchWinner，供 HUD 与观战。
- `plantable(id)` / `defusable(id)`：基于最近一帧事实的交互提示。

事件类型：roundStart、phaseLive、plantStarted/plantCancelled（reason: released/moved/damaged/died/leftSite/lostBomb）、bombPlanted（site）、defuseStarted/defuseCancelled、bombDefused、bombExploded、bombDropped（reason: death/discarded，含 pos）、bombPickedUp、roundEnded（winner+reason: timeout/blWiped/grWiped/defused/exploded）、matchEnded。

## 已覆盖规则边界（与批准 Rules 一一对应）

- 准备 5s→交战；准备期不可安包（持包限制之一）。
- 未安包超时 GR 胜；先赢 7 局 matchEnded 后不可再开局。
- 安包 5s→planted→引爆 40s 判 BL；拆包 7s 判 GR。
- 同一精确时刻拆包 vs 引爆：平手判引爆，单次结算（事件内按精确完成时间仲裁）。
- 安包后 BL 全灭仍等待拆除/引爆；GR 全灭立即判 BL。
- 未安包 BL 全灭判 GR；GR 全灭判 BL。
- 死亡掉包（含位置）、GR 不可拾取、存活 BL 拾取。
- 进度打断并重置：移动打断安包、拆包者死亡打断拆包（重按需满整段时长）。
- 暂停纯度（不调用 update 快照不变）与重开纯度（无旧事件回放、状态清零）。
- 无自动换边：引擎不交换 roster 阵营，比分跨回合累计。

## 尚未集成（留给后续阶段，不在本切片声称完成）

- 接入 game.js：每帧喂 facts（actor 存活/在包点/移动/受伤/位置）与命令（安放键、E、G、拾取），消费事件驱动 HUD/音效/特效；统一复活后调用 startRound。
- 包点/出生点几何来自地图定义（phase-2 地图工作）；拆包范围当前由 facts.inSite 表达。
- 观战镜头与准备期背包更换为 Game 侧表现，引擎已提供 snapshot/phase 支撑。
- 浏览器端实际安拆包演示与 20 回合固定种子验收：按规格在最终候选上运行一次。

## 证据

- 聚焦命令与结果：`node --test tests/unit/bomb-core.test.mjs` → 16 pass / 0 fail（首次全绿记录，见上）。
- 未运行共享构建/浏览器套件（其他 worker 正在编辑，遵守约束）；未提交、未推送、未部署。
