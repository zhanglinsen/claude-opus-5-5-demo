# Task 7: 横屏引导与全屏

Status source: `../tasks.json`, task `7`. Do not maintain another status field here.

## Context
What: 竖屏对局时自动暂停并显示“请横屏”遮罩；支持全屏的浏览器提供全屏按钮，不支持的给出“添加到主屏幕”提示。
Why: 规格 US-M04。FPS 在竖屏下不可玩，且 iPhone Safari 没有 Fullscreen API，浏览器地址栏会长期占据竖向空间。
Constraints: 遵守规格 [US-M06](../../specs/mobile-adaptation-20260930.md#US-M06)。新建 `src/mobile/orientation.js`、`src/mobile/fullscreen.js`，仅由 `touch.js` 在 `enabled` 时挂接；只改 `src/touch.js`、`src/i18n/catalogs.js`（只增键）、`src/style.css`（标记块内）。**不改 `hud.js`**（提示文案放在遮罩里，不新增 HUD DOM）。

## Implementation
Target files:
- 新建 `cf-transport-ship/src/mobile/orientation.js`、`src/mobile/fullscreen.js`
- `cf-transport-ship/src/touch.js`、`src/i18n/catalogs.js`、`src/style.css`

Existing pattern: 任务 5 的暂停守卫（`playing && !paused && !ended && !adPaused`）；大厅已有竖屏规则 `style.css:343`。

Technical notes:
- 遮罩 `#rotateGuard`：由 `orientation.js` 创建，层级高于 `#pause`；用 `matchMedia('(orientation:portrait)')` 的 `change` 事件驱动，不轮询。
- 竖屏且在对局中：`touch.resetTouchState()` + `g.pause()`（同一守卫，只暂停一次）；回到横屏后**不自动继续**，遮罩消失，停留在暂停界面。大厅/结算不触发，大厅保持竖屏可用（决策 D3：对局强制横屏，建议采纳）。
- 遮罩文案（新增 `touch.rotate`、`touch.addToHome`，zh/en）：“请将手机横屏”；iOS 附“分享 → 添加到主屏幕以获得全屏体验”。
- 全屏按钮：仅当 `document.fullscreenEnabled && document.documentElement.requestFullscreen` 时创建；点击 `requestFullscreen({ navigationUI: 'hide' })` 后尽力 `screen.orientation.lock('landscape')`（失败静默）。Y8/GameMonetize 的 iframe 若无 `allowfullscreen`，`fullscreenEnabled` 为假，按钮自然不出现。按钮放在 `layout.js` 的 `sideRail`，与任务 4 的按钮保持间距。
- 构造期新增的浏览器 API 访问同样需特性检测，保证 `touch-i18n.test.mjs` 无需修改。

Effort/complexity rationale: 0.3–0.6 天；假设遮罩与按钮不需要 HUD 改动；iOS 行为需真机确认；复杂度 3。

## Acceptance
- 任务 2 的用例 10 转绿。
- `cd cf-transport-ship && nice -n 19 node --test --test-concurrency=1 tests/unit/touch-i18n.test.mjs tests/unit/mobile/touch-lifecycle.test.mjs tests/unit/mobile/desktop-equivalence.test.mjs` 全绿。
- 边界用例：非对局、已暂停、`adPaused` 时竖屏不触发暂停；横竖屏来回切换只暂停一次；无 Fullscreen API 时不创建按钮且不抛错；`orientation.lock` 抛错被吞掉。
- `node scripts/check-mobile-isolation.mjs` 退出码 0。

## Trace
Source: `.ultra/specs/mobile-adaptation-20260930.md#US-M04`
Story IDs: US-M04
Accepted gaps: G-01

## Change Log
2026-09-30 创建。来源：规格 US-M04；决策 D3 待用户确认。

## Completion
未完成。
