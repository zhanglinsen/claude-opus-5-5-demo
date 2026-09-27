你是 GLM-5.3-Flash HIGH 实现者。用户要求 CLI 下发、TDD（每一个行为先可观察失败测试，再最小实现，再绿态重构）、必要测试、SOLID/分层/高内聚低耦合。不要调用其他模型或子代理。工作目录 `/Users/sen/workspace/AI/claude-opus-5-5-demo`。

文件所有权仅 `cf-transport-ship/src/profile/service.js`、`cf-transport-ship/tests/unit/profile-core.test.mjs`，以及新报告 `.ultra/reports/profile-result-fix.md`。其他 GLM 工作流正在修改 Game/e2e/AI，严禁触碰或运行全量测试/构建。参考 `.ultra/reports/early-cores-review.md` 的 Profile P3-1 与 `.ultra/reports/profile-architecture.md`。

修复 ProfileService.applyResult 对缺失或未知 `mode` 仍发 XP 的问题。只有已完成的竞争模式 `bomb`/`tdm` 可授予 XP；`practice`、缺失和其他未知 mode 均无奖励、无统计、无账本新增。先新增一条针对服务公开 API 的失败测试并确实执行看到红，再改最小代码，跑 `node --test tests/unit/profile-core.test.mjs` 至绿；重构若需要再复跑。别重复测试、不扩散 P3 其他建议。说明变更、红绿证据和任何限制。不要提交/推送。
