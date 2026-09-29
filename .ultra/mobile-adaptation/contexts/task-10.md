# Task 10: 基线对齐、真机清单与合并确认

Status source: `../tasks.json`, task `10`. Do not maintain another status field here.

## Context
What: 性能任务落地后把本分支 rebase 到其结果，复跑守卫与单测，整理 README 与真机清单，并把变更、验证证据、未验证项交给用户；**只有用户明确同意后才合并**。
Why: 用户要求“用户确认后才允许合并”，且不能影响性能优化任务。基线 `bc8e3e1` 只是规划时性能集成的顶端，性能分支之后还会变。
Constraints: 遵守规格 [US-M06](../../specs/mobile-adaptation-20260930.md#US-M06) 第 6 条。不推送、不合并、不改共享分支，直到用户在对话里明确说“合并”并指定目标分支与方式。

## Implementation
Target files:
- `cf-transport-ship/README.md`（“触屏（手机横屏）”章节，当前 `:42-44`）
- 新建 `.ultra/mobile-adaptation/device-checklist.md`
- 视情况 `git mv cf-transport-ship/tests/unit/mobile/*.test.mjs` 到 `tests/unit/`，使日常 `npm test` 覆盖它们（仅当用户同意合并时做；红测试此时已全绿）。

Technical notes:
1. **基线对齐**：向用户确认性能任务最终落到哪个分支/提交后，再 `git rebase <该提交>`。冲突只可能出现在白名单内的 `style.css`、`index.html`、`catalogs.js`、`touch.js`；若冲突落在禁区文件，说明有人改了热路径，停下并报告，不自行取舍。
2. **复跑**（降优先级、串行）：`node scripts/check-mobile-isolation.mjs --base <最终基线>`；`nice -n 19 node --test --test-concurrency=1 tests/unit/mobile/*.test.mjs tests/unit/touch-i18n.test.mjs`；再对现有全量 `npm test` 只跑一次，确认桌面路径与性能相关测试（`perf-hud`/`perf-effects`/`perf-raycast`）结果与基线一致。**不跑** `bench-*`、`accept-*`、`e2e*`，除非用户同意且 GPU 空闲。
3. **README**：更新触屏控件清单（菜单、记分板、配装、检视、槽位、全屏、横屏遮罩），说明“对局建议横屏，iPhone 可添加到主屏幕”。
4. **真机清单** `device-checklist.md`（iOS Safari、Android Chrome 各一遍）：双击/捏合缩放、下拉刷新、长按菜单、刘海/横条遮挡、地址栏与全屏、旋转重排、切后台/锁屏/来电后的暂停与音频恢复、点按视角区是否误开火（E14）、多指同时操作、Y8/GameMonetize 的 iframe 内表现与广告断点。**帧率/发热只记录，不作为通过条件**（渲染策略属 US-M07，已排除）。
5. **合并门**：向用户提交摘要——改动文件清单（守卫脚本输出）、每个任务的验证命令与结果、已在浏览器验证与未验证的项、需要确认的决策 D1–D4 的最终选择。用户明确同意后，按用户指定的目标与方式合并；否则本任务保持 `pending`，不得合并、不得推送。

Effort/complexity rationale: 0.3–0.6 天（不含真机执行与用户确认等待时间）；复杂度 3。

## Acceptance
- rebase 后 `node scripts/check-mobile-isolation.mjs --base <最终基线>` 退出码 0；`git diff --stat <最终基线>...HEAD` 中没有禁区文件。
- 上述单测全绿，且现有全量 `npm test` 与基线结果一致（数量与通过数相同）。
- `device-checklist.md` 覆盖上面清单，每项写明预期与判定方式。
- 用户书面同意后才出现合并操作；未同意时分支保持未合并、未推送。

## Trace
Source: `.ultra/specs/mobile-adaptation-20260930.md#US-M06`
Story IDs: US-M06
Accepted gaps: G-01, G-02

## Change Log
2026-09-30 创建。来源：用户“用户确认后才允许合并”“不能影响性能优化任务”。

## Completion
**部分完成（2026-09-30）**：文档部分已完成；其余项仍待办，任务保持 `in_progress`。
- 已完成：README 触屏章节（按代码里实际存在的控件写，并注明“尚未在真机验证”）、`device-checklist.md`（区分 [定论]/[推断]）。GLM 首次执行 L10a 20 轮后账号被限流，无产出，改由协调者完成。
- 已完成（2026-09-30）：独立审核。首次因窗口限流失败，账号恢复后先冒烟、只起这一路，GLM `glm-5.3` max 51 轮完成，**无阻断项**；逐条核实后修复了 2 条重要（广告暂停期间输入穿透、`mouse.lp/rp` 残留致恢复后走火）和若干建议，提交 `e280be4`。见 `../reports/REVIEW-triage.md`。
- 待办：① 性能任务落地后基线对齐（rebase）——性能分支目前 `ff6573a`，相对规划基线只改了 `env.js`（禁区）与报告，与移动端白名单无交集；② 落地后复跑守卫与测试，并在允许构建后跑 `build-targets` 与 `accept-mobile.mjs`；③ **向用户提交摘要并等待明确同意后才合并**，合并目标与方式由用户指定。
- 现有单元测试（排除 `configured-build`、`perf-effects`）：425 项，419 通过；6 项失败全是“缺少 `dist/` 构建产物”（`build-targets.test.mjs`，该文件与 `build.mjs` 相对性能基线零差异），与本计划无关，构建后应恢复。
- 至今未发生任何向共享分支的合并或推送（只推送了 `claude/cf-mobile-adaptation-plan` 计划分支）。
