你是 GLM-5.3-Flash HIGH，继续原 RULES/对局协调会话，执行阶段 3 审核路由出的 P2 定向修复。当前无其他写入者；你只编辑 `cf-transport-ship/src/modes/bomb-session.js`、`cf-transport-ship/src/modes/bomb.js`、`cf-transport-ship/tests/unit/bomb-runtime.test.mjs` 或 `tests/unit/bomb-core.test.mjs`（聚焦用例）、`scripts/e2e-bomb.mjs`（定向回归项）和报告 `.ultra/reports/phase-3-pickup-fix.md`。不改 bots/player/hud/ai，不提交。不要调用子代理。

审核报告 `.ultra/reports/phase-3-review-ai-ui.md`（REQUEST_CHANGES，唯一 P2）：**掉包可被任意距离拾取**——`bomb-session.js:108-109` 的 `pickupable` 提示对任何存活 BL 恒真（无距离项），`bomb.js:163-170` 的 `pickupBomb` 命令分支也无权威距离校验；后果是地图任意位置的 BL 按 E 隔空取包，HUD「找回 C4」分支对存活 BL 不可达（bot 仅因自身 1.7m 门限幸免）。

要求：
1. 修在生产方：`pickupable` 加与掉点的距离判定（可下传所需数据），`bomb.js` 的 `pickupBomb` 分支补权威校验（引擎为准，不依赖视图）；**不要**在输入层加客户端守卫。距离阈值与既有拾取/交互语义一致（bots.js 用 1.7m 仅作其自身兜底，引擎可选一个合理交互半径，如 2m 内，写明选择依据）。
2. TDD：先在聚焦测试加失败用例（掉包后远端 BL `pickupable=false` 且 `pickupBomb` 无效；近端有效；GR 永不拾取），红→绿→必要时重构。
3. 定向回归：`node --test` 聚焦两套全绿 + `node scripts/e2e-bomb.mjs` 36 项仍全过（若该修复影响既有用例文案/断言，最小修正并说明）+ `npm run build`。
4. 报告写实际红绿证据、阈值选择、对 AI/UI 消费方的影响（bots.js 兜底是否仍一致）。
