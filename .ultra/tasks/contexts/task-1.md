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
2026-09-28：执行完毕，registry 已切换，任务 1 标记 complete。

## Completion
2026-09-28 执行记录：

- **门槛确认**：`.ultra/reports/final-visual-fidelity-handoff.md` 终审 PASS-WITH-CONDITIONS，用户已接受主机竞争限制条件；`BLOCKED.md` 已标 RESOLVED；互斥标记已清除。视觉源码提交 `60fed10`/`1d199bb`/`7c406ed` 均在本地分支 `codex/desert-grey`。
- **快照核对**：`.ultra/snapshots/visual-wip-20260927-171454+0800/`（head `c935ace`，branch `codex/desert-grey`）manifest/tracked.patch(233,309B)/untracked-and-evidence.tar.gz(19,463,436B, 208 条目)/post-snapshot-plan-update.tar.gz(6,327B, 4 条目) 均非空，三文件 SHA-256 与 manifest 一致，tar 可完整读取。
- **证据核对**：截图 `artifacts/fidelity-baseline|fidelity-after|fidelity-after-low|fidelity-after-high|fidelity-final-filesmoke/`、性能 JSON `fidelity-verify.json`、`e2e-desert-results.json`、`accept-restart-check.json`、`accept-gpu-fidelity-20260927.json`、`accept-gpu-fidelity-calls-probe2-20260927.json`、`accept-gpu-desert-calm-20260927.json`、参考图 `.ultra/references/visual-quality-20260927/`、独立审核报告 `.ultra/reports/workbuddy-visual-fidelity-max-review.md`、`workbuddy-final-visual-review.md`、`workbuddy-final-performance.md` 全部在位非空。
- **旧阶段提交**：报告与 BLOCKED.md → `a5d2f8a`；规格 `platform-expansion.md` → `8df8c2c`。未提交 artifacts/快照/`.workbuddy`/临时文件；未推送。
- **归档与发布**：旧 registry（2026-09-26 周期，7 任务全 completed）→ `.ultra/archive/20260926-20260928-desert-grey-tasks/`；`.ultra/next-stage/tasks.json` + contexts（12 任务）已原子发布到 `.ultra/tasks/`。`next-stage/` 原样保留。
- **验证**：`validate_plan.py .ultra/tasks/tasks.json` → `{"status":"valid","errors":[],"pending":[],"warnings":[]}`；发布前暂存目录经 JSON/contexts/依赖闭环校验通过。
