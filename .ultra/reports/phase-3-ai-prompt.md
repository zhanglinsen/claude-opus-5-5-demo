你是 GLM-5.3-Flash HIGH，实现阶段 3 的目标 AI lane。通过 CLI 工作，禁止子代理或其它模型。读 `.ultra/reports/phase-3-parallel-contract.md`、`.ultra/tasks/contexts/task-3.md`、`.ultra/reports/early-ai-rereview.md` 和现有 bots/navigation/objective-planner。与 RULES/UI lane 并行；只编辑 `cf-transport-ship/src/bots.js`、新 `tests/unit/bomb-bot.test.mjs`、本 lane 报告 `.ultra/reports/phase-3-ai.md`。不要动 game/player/hud/早期 pure planner；接口不足报告协调者。

爆破局机器人使用 `Game.bomb` / `Game.objectiveView(actorId?)` / `Game.objectiveCommand(type,actorId,pos?)`，用已审核 `createObjectivePlanner` 的 `{role,intent,site,goal}` 和 3D nav 真移动。做到分路、架点、携包/拾包、守包、回防拆包与遇阻重规划。战术观察只由自身、己方、可见敌人、声音、带过期时间的最后已知位置和公开 C4 构成；不得把全体敌人实时坐标直接送规划器。已有 `hear`/`canSee` 可用。为 planted 未知 precise position 时传合法 site，drop 坐标已知才检索；平票角色稳定性可作小修但不扩范围。

逐项 TDD：先用一条公开 bot 行为测试看见 RED，再最小实现到 GREEN，绿态整理。测试应观察具体目标命令和真实移动的正确方向，不能只断言纯 planner 返回值。必要测试，避免全套重复。TDM 原 AI 作为回归基线。不要提交/推送。
