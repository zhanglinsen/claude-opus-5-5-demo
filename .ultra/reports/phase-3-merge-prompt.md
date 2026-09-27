你是 GLM-5.3-Flash HIGH，继续原 RULES/对局协调会话，执行阶段 3 合流。三路 lane（RULES/AI/UI）与 bomb.js id0 修复均已完成，当前没有其他写入者；你独占全部 `cf-transport-ship/src/**` 集成文件，但仅在与合流必要处做最小修改。不要调用子代理/其它模型，不提交不推送。

背景：三 lane 报告在 `.ultra/reports/phase-3-rules.md`、`phase-3-ai.md`、`phase-3-ui.md`；id0 修复 `.ultra/reports/bomb-zero-id-fix.md`（bomb-core 20/20、bomb-runtime 9/9 已绿）。AI lane 交付了 bots.js 爆破目标层（分路/安放/拾包/守包/回防拆包），UI lane 交付了 C4 输入/目标 HUD/触屏/观战。

合流任务：
1. 对表检查三 lane 消费/生产的 `objectiveView`/`objectiveCommand` 契约字段（plantable/defusable/pickupable/defuserId/plantProgress/plantHold/defuseHold/inSite/bomb.pos/spectate）；发现命名或语义不一致时以 game.js 实际输出为准修正消费方（bots.js 或 hud.js）的最小适配，不重写。
2. `npm run build` 与聚焦测试：`node --test tests/unit/bomb-core.test.mjs tests/unit/bomb-runtime.test.mjs tests/unit/bomb-bot.test.mjs tests/unit/bomb-input.test.mjs`；如集成导致跨 lane 用例失败，修产品代码直至全绿（必要测试红→绿，不扩测）。
3. 浏览器集成验收（真实 Chrome，沿用 `scripts/e2e-bomb.mjs` 风格）：
   a. 重跑 `node scripts/e2e-bomb.mjs`（26 项）确认三 lane 合并后仍全过；
   b. 新增少量关键用例：**玩家 id 0 为 BL 携包者**的完整闭环（0 号携包 → 走到包点 → 真实 HUD 显示安放提示/进度 → 安放成功 → 观战或换 GR 拆包结算），以及爆破模式死亡观战 HUD 与 5 号槽在真实浏览器中的表现；
   c. TDM/运输船快速回归（已有 `scripts/e2e.mjs` 21 项即可，不必扩测）。
4. 完成后写报告 `.ultra/reports/phase-3-merge.md`：实际命令与结果、发现的契约不一致及修法、浏览器证据（artifacts 截图/结果 JSON）、遗留问题清单。不要宣布阶段 3 门禁通过——独立 MAX 审核由协调者另行下发。
