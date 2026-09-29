# 性能优化执行记录

- 用户在 2026-09-29 要求审查、拆分并行优化，并由当前协调者负责验收。
- 计划：`.ultra/specs/performance-20260929.md`；基线 `c40d4bd`。
- 23:14 三路 GLM-5.3-Flash High 已通过 zcode-agent-kit 启动（permission-mode auto）；每路独立工作树、提示与 JSONL。

| 路 | 工作树尾名 / 分支 | CLI session | 状态 |
|---|---|---|---|
| HUD | perf-hud / codex/perf-hud-20260929 | 20029 | 实现中 |
| 特效 | perf-effects / codex/perf-effects-20260929 | 51788 | 实现中 |
| 射线 | perf-physics / codex/perf-physics-20260929 | 78943 | 实现中 |

提示与日志在 `.ultra/dispatch/performance-20260929/`。实际状态以 JSONL result、进程及提交为准；切勿依据旧 session 重复派发。

## 验收责任

协调者亲自核对差异、测试与实机结果；Flash 自测或审核报告不能单独代替验收。新上下文 Flash Max 辅助独立代码审核。串行占用浏览器/GPU。

额外边界核验：HUD 的 update/updateObjective 同写弹药区，C4 切出须恢复文字和样式；缓存不能只比较会原地改变的对象引用。tracer 最多48且溢出淘汰最旧，寿命到期清零。射线最近命中排除恰好 maxT 而 raycastAll 包含，保留等距命中顺序。

实时额度到期 2026-09-30 00:00 Asia/Shanghai；到期后重新查余额，禁止冒称仍有原1亿余额。不为使用额度扩大无效工作。
