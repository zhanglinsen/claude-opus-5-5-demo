# Task 2: 触屏缺陷红测试

Status source: `../tasks.json`, task `2`. Do not maintain another status field here.

## Context
What: 先把已核实的触屏缺陷写成会失败的测试，证明缺陷存在，并为后续任务给出明确的“变绿”目标。
Why: 规格评估里的 E1、E3、E4、E5、E6、E14 都来自读码；先用红测试锁定，再修改，避免修了不存在的问题或修偏。
Constraints: 遵守规格 [US-M06](../../specs/mobile-adaptation-20260930.md#US-M06)。只改 `tests/**`；红测试放 `tests/unit/mobile/`，不得进入 `npm test` 的通配范围，也不得进入任何被性能任务拉取的分支。

## Implementation
Target files:
- 新建 `cf-transport-ship/tests/unit/mobile/helpers/touch-dom.mjs`：可复用的 DOM/TouchEvent 桩，参照 `touch-i18n.test.mjs:15-45`，另提供 `fireTouch(target, type, {id,x,y})`、可切换的 `matchMedia`、可变的 `innerWidth/innerHeight`、可派发的 `window` 事件。
- 新建 `tests/unit/mobile/touch-input.test.mjs`（用例 1–5）
- 新建 `tests/unit/mobile/touch-menu.test.mjs`（用例 6–8）
- 新建 `tests/unit/mobile/touch-lifecycle.test.mjs`（用例 9–10）

Existing pattern: `tests/unit/touch-i18n.test.mjs`（构造 `TouchControls` 的最小桩）、`tests/unit/bomb-input.test.mjs`。

用例与转绿任务：

| # | 断言 | 缺陷 | 转绿 |
|---|---|---|---|
| 1 | 开火按钮收到 `touchcancel` 后 `player.touch.fire===false` | E3 | 任务 3 |
| 2 | `window` 触发 `blur` 后 `touch.fire/mx/mz/crouch` 清零、`touchLook` 清零 | E4 | 任务 3 |
| 3 | 视口 844×390→390×844→932×430 变化并触发 `resize`/`orientationchange` 后，所有按钮包围盒仍在视口内 | E5 | 任务 3 |
| 4 | 在左侧区 (100,300) 按下、不移动，`touch.mx/mz` 约为 0（浮动摇杆） | E6 | 任务 3 |
| 5 | 画布上的 `touchstart` 调用了 `preventDefault`（非 passive）；`.screen` 内按钮上的不调用 | E14 | 任务 3 |
| 6 | 菜单按钮仅在 `playing && !paused && !ended` 时调用 `game.pause()` | E1 | 任务 4 |
| 7 | 记分板切换增删 `Tab`；配装/检视/槽位分别注入 `KeyB`/`KeyF`/`Digit1-4` | E2 | 任务 4 |
| 8 | “镜”按下置 `mouse.r`+`mouse.rp`、抬起清 `mouse.r`；开火按下置 `mouse.lp` | E8 | 任务 4 |
| 9 | `visibilitychange`(hidden)/`pagehide`：清状态 + 只暂停一次 + 挂起 `audio.ctx`；`adPaused`/未在对局/已暂停时不暂停 | E4 | 任务 5 |
| 10 | 对局中变为竖屏：暂停一次并显示遮罩；非对局不触发 | US-M04 | 任务 7 |

Technical notes:
- 每条红测试的断言消息写明“缺什么”，使失败原因来自缺失行为，而不是桩报错。先单独确认桩本身能构造现有 6 个按钮（复用现有测试的通过作为基线）。
- 现有 `touch-i18n.test.mjs` 是兼容契约：不修改，任务 3–7 全程保持通过（它对 `_labeled` 做了 6 项完整 `deepEqual`，见 `:81-82`、`:125-126`）。

Effort/complexity rationale: 0.3–0.5 天；假设桩可复用现有写法；复杂度 3。

## Acceptance
- `cd cf-transport-ship && nice -n 19 node --test --test-concurrency=1 tests/unit/mobile/touch-*.test.mjs`：**预期失败**，失败数=10 条用例中除已通过项外的全部，且每条失败消息指向上表的缺失行为。
- `nice -n 19 node --test --test-concurrency=1 tests/unit/touch-i18n.test.mjs tests/unit/mobile/desktop-equivalence.test.mjs` 仍全绿。
- `node scripts/check-mobile-isolation.mjs` 退出码 0。
- 该任务的提交在任务 3–7 完成前不得离开本分支。

## Trace
Source: `.ultra/specs/mobile-adaptation-20260930.md#US-M01`
Story IDs: US-M01, US-M02, US-M03
Accepted gaps: 无

## Change Log
2026-09-30 创建。来源：规格评估 E1/E3/E4/E5/E6/E14。

## Completion
未完成。
