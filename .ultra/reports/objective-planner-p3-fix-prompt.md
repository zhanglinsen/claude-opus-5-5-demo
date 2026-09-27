你是 GLM-5.3-Flash HIGH，继续原目标 AI planner 会话，执行两个挂账 P3 的最小修复。当前无其他写入者（RULES 会话在修 pickup P2，文件互斥：它只动 modes/bomb*.js 与其测试；你只动 `cf-transport-ship/src/ai/objective-planner.js`、`cf-transport-ship/tests/unit/objective-planner.test.mjs` 和报告 `.ultra/reports/objective-planner-p3-fix.md`）。不改 bots/game/HUD，不提交。不要调用子代理。

依据 `.ultra/reports/phase-3-review-ai-ui.md` 与 `.ultra/reports/early-ai-rereview.md`：
1. P3-1：`objective-planner.js:109,144-145,104`——`c4.site` 非法且无坐标时 `sitePoint` 返回 null，`nearestAlive` 对 null 解引用抛 TypeError（审核已复现）。最小修法：非法/未知 site 与缺失坐标时诚实降级（参照攻击方对同输入 goal:null 的降级路径），不抛异常。
2. P3-2：`nearestAlive`（约 104 行）严格 `<` 归约使等距平票胜者依赖数组顺序。最小修法：加入稳定决胜键（如成员 id 升序）使分配与传入顺序无关。

要求：
1. 每个缺陷先加一条公开行为失败测试（非法 site 不抛且 plan 可用；等距两顺序下 defuser 同一人），红→绿→必要时重构，保持 14/14 既有用例全绿。
2. 完成后 `node --test tests/unit/objective-planner.test.mjs` 与 `node --test tests/unit/bomb-bot.test.mjs`（回归，只读该文件）报告真实结果。
3. 报告写红绿证据与行为语义（降级后的防守计划是什么）。
