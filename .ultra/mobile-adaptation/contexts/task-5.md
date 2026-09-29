# Task 5: 中断与后台生命周期

Status source: `../tasks.json`, task `5`. Do not maintain another status field here.

## Context
What: 对局中切后台、锁屏、来电、页面 `pagehide` 时自动暂停并挂起音频；返回后停留在暂停界面，由玩家点“继续”，音频在首个用户手势里恢复。
Why: 规格 E4。目前 cf 没有任何 `visibilitychange`/`pagehide` 处理，手机上一切后台就是“游戏还开着、状态卡住、声音可能继续”。
Constraints: 遵守规格 [US-M06](../../specs/mobile-adaptation-20260930.md#US-M06)。新建 `src/mobile/lifecycle.js`，仅由 `touch.js` 在 `enabled` 为真时挂接；**不改 `audio.js`/`game.js`**。

## Implementation
Target files:
- 新建 `cf-transport-ship/src/mobile/lifecycle.js`：`attachLifecycle(game, touch)` 返回 `detach()`。
- `cf-transport-ship/src/touch.js`：在 `enabled` 分支末尾调用。

Existing pattern: 广告暂停的独立原因模型 `game.js:127-136`（`enterAdPause`/`exitAdPause`、`adPaused` 与玩家暂停互不覆盖）。

Technical notes:
- 监听 `document.visibilitychange`（`hidden`）、`window.pagehide`；`blur` 只做 `resetTouchState()`（任务 3），不暂停。
- 触发条件：`g.playing && !g.paused && !g.ended && !g.adPaused` → `touch.resetTouchState()` + `g.pause()`。广告暂停期间只清输入，不调用 `pause()`；玩家已暂停则保持。
- **音频必须显式挂起**：`audio.js:238-243` 有 `setInterval(_tick, 100)` 兜底，注释明确“即使游戏暂停调用 update()，心跳/环境事件仍能继续”，所以停游戏循环不会让声音停。做法：`g.audio?.ctx?.suspend?.()`，全部特性检测、吞掉异常。
- 恢复：不自动继续。挂起后注册一次性 `touchstart`（capture），在首个用户手势里调用 `g.audio.init()`——它幂等，会走 `_resume()`（`audio.js:217-224/1197`，已处理 `suspended` 与 iOS 的 `interrupted`）。
- 大厅/结算界面（`!g.playing`）不触发；桌面不注册（依赖 `enabled`）。
- `dt` 已在 `game.js:1088` 钳到 0.1，返回时不会出现大步长。

Effort/complexity rationale: 0.5–1 天；假设 `audio.ctx` 字段与 `init()` 语义如上（已读码核实）；iOS 来电/`interrupted` 的真实行为需真机确认；复杂度 5。

## Acceptance
- 任务 2 的用例 9 转绿。
- `cd cf-transport-ship && nice -n 19 node --test --test-concurrency=1 tests/unit/touch-i18n.test.mjs tests/unit/mobile/touch-lifecycle.test.mjs tests/unit/ad-session.test.mjs` 全绿。
- 边界用例：`adPaused` 为真、`playing` 为假、`paused` 已为真、`ended` 为真时都不调用 `pause()`；`audio.ctx` 缺失时不抛错；`detach()` 后不再响应。
- `node scripts/check-mobile-isolation.mjs` 退出码 0（`audio.js`、`game.js` 未被触碰）。

## Trace
Source: `.ultra/specs/mobile-adaptation-20260930.md#US-M03`
Story IDs: US-M03
Accepted gaps: G-01

## Change Log
2026-09-30 创建。来源：规格评估 E4；`audio.js:238-243` 的兜底心跳发现。

## Completion
未完成。
