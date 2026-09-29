# Task 1: 性能隔离守卫与桌面等价测试

Status source: `../tasks.json`, task `1`. Do not maintain another status field here.

## Context
What: 一个只读的隔离检查脚本，加一组“桌面下移动端代码完全不生效”的单元测试，作为后续所有任务的门。
Why: 用户要求不能影响性能优化任务。把约束变成可执行检查，而不是靠自觉。
Constraints: 遵守规格 [US-M06](../../specs/mobile-adaptation-20260930.md#US-M06)。只读 git；不构建、不开浏览器；不改现有测试与脚本。

## Implementation
Target files:
- 新建 `cf-transport-ship/scripts/check-mobile-isolation.mjs`
- 新建 `cf-transport-ship/tests/unit/mobile/isolation.test.mjs`
- 新建 `cf-transport-ship/tests/unit/mobile/desktop-equivalence.test.mjs`

Existing pattern: 单测用 `node:test` + `node:assert/strict`，DOM 桩写法见 `tests/unit/touch-i18n.test.mjs:15-45`；脚本风格参考 `scripts/accept-lobby.mjs`（顶部注释写用法）。

Technical notes:
- 脚本导出纯函数 `classify(path)` → `allowed | forbidden | foreign`。`forbidden` 为规格 US-M06 第 2 条的禁区；`foreign` 为白名单之外的其它路径（含 `pelican-bike/`、`qq-speed/`）。白名单/禁区常量集中放脚本顶部，注释指回规格。
- CLI：`node scripts/check-mobile-isolation.mjs [--base <ref>]`，默认 base=`perf-integration-20260929`。检查 `git diff --name-only <base>...HEAD` 与 `git status --porcelain`（含未跟踪）的并集，任一路径非 `allowed` 则退出码 1 并逐条列出原因；base 不存在退出码 2。不写文件、不联网。
- 桌面等价测试：`matchMedia('(pointer:coarse)')` 返回 false 且 `location.search` 为空；`document`/`window` 用“任何访问都抛错”的代理。`new TouchControls(game)` 必须成功、`enabled===false`、零监听（`touch.js:14` 已提前返回，本测试锁住这一行为，防止后续任务在早返回之前引入副作用）。
- 对 `src/mobile/*.js`（存在时）逐个动态 `import()`，断言导入无副作用（代理未被访问）。任务 3 起新增模块后此用例才有对象，不存在时用例记为通过并输出“无 mobile 模块”。
- 放在 `tests/unit/mobile/` 子目录：`npm test` 的通配符 `tests/unit/*.test.mjs` 不递归，避免性能任务的测试运行被本计划的红测试误伤（任务 10 再决定是否上移）。

Effort/complexity rationale: 0.3–0.5 天；假设沿用 node:test，无新依赖；复杂度 3。

## Acceptance
- `cd cf-transport-ship && nice -n 19 node --test --test-concurrency=1 tests/unit/mobile/isolation.test.mjs tests/unit/mobile/desktop-equivalence.test.mjs` 全绿。
- 当前分支运行 `node scripts/check-mobile-isolation.mjs` 退出码 0。
- 失败路径：临时改动 `src/hud.js`（不提交）后同一命令退出码 1 并列出 `src/hud.js`；还原后恢复 0。
- 边界：`--base` 指向不存在的 ref 时退出码 2 且提示；只有 `.ultra/mobile-adaptation/` 与规格文件变化时通过。

## Trace
Source: `.ultra/specs/mobile-adaptation-20260930.md#US-M06`
Story IDs: US-M06
Accepted gaps: 无

## Change Log
2026-09-30 创建。来源：用户“不能影响性能优化任务”；规格 US-M06。

## Completion
未完成。
