你是独立 GLM-5.3-Flash MAX 代码复核员，使用全新上下文。只读，不改文件，不调用子代理。工作目录 /Users/sen/workspace/AI/claude-opus-5-5-demo。

只复核 `.ultra/reports/early-cores-review.md` 的 Objective AI P2-1 与 P2-2 修复，参考 `.ultra/reports/early-ai-fix.md`，但自己检查 `cf-transport-ship/src/ai/objective-planner.js` 和 `tests/unit/objective-planner.test.mjs`。运行一次聚焦测试即可。判断：planted C4 只有 site 或 position 时进攻守包/防守回防是否合理；dropped 未知位置是否诚实退化；回合内重排和队友阵亡是否稳定，迟到成员和跨回合是否可能破坏缓存。查出真实可复现缺陷，给文件行号、严重度和最短复现；不重述已知 P3 建议，不扩展全项目审查。输出 APPROVE 或 REQUEST_CHANGES，简明中文报告。无写权限。
