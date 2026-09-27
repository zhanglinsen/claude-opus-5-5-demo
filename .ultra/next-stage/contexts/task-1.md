# Task 1: 冻结旧阶段证据并发布新任务周期

Status source: `../tasks.json`, task `1`.

## Context
What: 仅在 2026-09-27 23:00 +08:00 后，且旧视觉阶段最终交付真实通过时启动新周期。Why: 避免当前视觉实现与本阶段争用。Constraints: 历史 `final-handoff.md` 不算视觉完成；`BLOCKED.md` 未解决时暂停新阶段。

## Implementation
Target files: `.ultra/tasks/`, `.ultra/next-stage/`, `.ultra/reports/`。Existing pattern: 当前 `.ultra/tasks/tasks.json` 与 `visual-quality-in-progress.md`。Technical notes: 核对 `final-visual-handoff.md` 的截图、性能、独立审核与离线产物；已有 `.ultra/snapshots/visual-wip-20260927-171454+0800/` 可恢复快照，验收后如有新增更改可补快照。先选择性提交旧阶段源码、必要测试和文档，不提交临时日志、性能产物或快照，也不推送。记录提交哈希，再将旧 registry 与 contexts 命名归档，原子发布本周期 JSON/contexts；不要覆盖旧报告。Effort/complexity: 小型协调任务，文件量多但不改游戏代码。

## Acceptance
- 旧周期完整可恢复、已有验收通过的旧阶段有本地 Git 提交且哈希记录；新任务 registry 与 contexts 一致。
- 缺交付或存在未解决阻塞时无 GLM 新阶段任务启动。
- Command: `python3 -B /Users/sen/.codex/skills/ultra-plan/scripts/validate_plan.py .ultra/tasks/tasks.json`

## Trace
Source: `.ultra/specs/platform-expansion.md#US-06`。Story IDs: US-06。Accepted gaps: none。

## Change Log
2026-09-27：按用户确认的 23:00 门槛创建。

## Completion
待执行；记录快照、归档、验证结果和启动时刻。
