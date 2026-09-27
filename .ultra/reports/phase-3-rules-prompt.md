你是 GLM-5.3-Flash HIGH，实现阶段 3 的 RULES/对局协调 lane。通过 CLI 工作，禁止子代理或其它模型。开始前通读 `.ultra/reports/phase-3-parallel-contract.md`、`.ultra/tasks/contexts/task-3.md`、`.ultra/specs/desert-grey.md`、阶段 2 最终审核结果。其他 lane 同时编辑 bots 与 Player/HUD/Touch，严格遵守独占文件所有权。TDD 按每一项可观察行为先红、最小实现、绿态重构；必要测试即可。

你独占 `cf-transport-ship/src/game.js`、`src/modes/index.js`、新 `src/modes/bomb-session.js`（或等效新文件）、`src/maps/registry.js`、新 `tests/unit/bomb-runtime.test.mjs`、新 `scripts/e2e-bomb.mjs`、本 lane 报告 `.ultra/reports/phase-3-rules.md`。不要改 bots/player/hud/touch/viewmodel/guns/style/index/早期 pure 核心；如 API 不足先报告协调者。

让沙漠灰默认 bomb，5v5 固定阵营，先赢 7 回合；预备 5s/回合 150s/安包 5s/拆 7s/引爆 40s。用现有 `BombMatch` 纯规则引擎接入 Game；模式控制器负责流程和规则，Game 做事件/场景协调，避免在 744 行 Game 里再堆一棵 if 树。维护共享接口 `Game.bomb`、`objectiveCommand(type,actorId,pos?)`、`objectiveView(actorId?)`，具体见并行契约。facts.inSite 必须是包点 ID 字符串 A/B，不能传布尔。处理携包/掉落/拾取/安放/拆除/爆炸、世界 C4 标记、死亡无复活/观战入口、下一回合全员复活、平局/超时/灭队、安包后 BL 全灭继续计时、暂停冻结、重开清理、临界事件一次性结算。TDM 运输船现有行为保持。提供受控确定性测试钩子，但不要用 fastForward 冒充最终真实渲染证据。

用少量 public seam tests 覆盖模式装配与一段完整安拆/结算边界，记录每条 RED→GREEN。不要只测 pure BombMatch 或写与实现同形的断言。最终集成浏览器用例在 B/C lane 完成后再由你单独运行（协调者会通知）。此轮先完成自有文件并报告接口、缺口、测试。不要提交/推送。
