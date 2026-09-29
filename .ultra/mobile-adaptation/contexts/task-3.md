# Task 3: 触屏输入稳健化与自适应布局

Status source: `../tasks.json`, task `3`. Do not maintain another status field here.

## Context
What: 让触屏输入在被打断、失焦、旋转、多指时不卡键、不错位；摇杆改为浮动；点按视角区不再误开火。
Why: 规格 E3/E4/E5/E6/E14。这些是“能进游戏但玩不了”的直接原因，且不涉及渲染，风险最低、价值最高。
Constraints: 遵守规格 [US-M06](../../specs/mobile-adaptation-20260930.md#US-M06)。只改 `src/touch.js`、新建 `src/mobile/layout.js`、`src/style.css` 的 `#touch` 段；**不改 `player.js`**（状态清零直接写 `player.touch.*`）。所有新逻辑仅在 `enabled` 为真时生效。

## Implementation
Target files:
- `cf-transport-ship/src/touch.js`
- 新建 `cf-transport-ship/src/mobile/layout.js`：纯函数 `computeLayout(w, h)` 返回各按钮 `{left|right, bottom, size}`，无 DOM 依赖，便于单测与后续任务 4/8 复用。
- `cf-transport-ship/src/style.css`：`#touch` 段（当前 `:278-280`）追加，放在 `/* mobile:begin */ … /* mobile:end */` 标记块内，选择器一律以 `html.is-touch` 开头。

Existing pattern: `touch.js:22-26`（`place()`）、`touch.js:27-33`（`btn()`）、`touch.js:57-86`（摇杆/视角/结束处理）。

Technical notes:
- **兼容约束**：`touch-i18n.test.mjs` 用极简桩构造 `TouchControls`（`document` 只有 `getElementById/createElement`，`window` 只有 `innerWidth/innerHeight/addEventListener`）。构造期每个新增的浏览器 API 访问必须做特性检测（`document.documentElement?.classList`、`window.visualViewport?.addEventListener` 等），使该测试无需改动即通过。
- 按钮统一 `press/release`：记录 touch identifier；`touchend` 与 `touchcancel` 都调用 release；保持 `preventDefault()`。
- `resetTouchState()`：清 `fire/firePressed/jump/crouch/mx/mz`、`touchLook`、`mouse.r`，复位摇杆 UI 与 `padId/lookId`；绑定 `window.blur`。（`visibilitychange`/`pagehide`/`orientationchange` 的挂接归任务 5，避免重复注册。）
- 重排：`resize`、`orientationchange`、`visualViewport.resize` 触发 `applyLayout()`（rAF 去抖）；在 844×390 下保持现状坐标，副开火键由 `right: W-250` 改为等价的 `left: 186px`（`touch.js:41`）。
- 浮动摇杆：左侧区按下点作为原点，底座移到该点（夹在区域内），位移相对该点；抬起复位。保留 60px 最大偏移与 `mx/mz` 输出范围。
- 点按视角区：对 `e.target.id === 'c'`（画布）的 `touchstart/touchend` 用非 passive 监听并 `preventDefault()`，阻断合成鼠标事件（E14）。**不得**拦截 `.screen`（暂停/大厅/结算）内的触摸，否则会吞掉其按钮的 click。
- `document.documentElement.classList.add('is-touch')`：供任务 6/7/8 的 CSS 作用域。
- 视角灵敏度：保持 `*1.6` 常量并继续乘 `g.opts.sens`（`player.js:136`）；本任务不新增设置项（US-M08 排除）。

Effort/complexity rationale: 0.5–1 天；假设不需要真机即可用桩覆盖；E14 的合成鼠标事件行为需任务 9 在浏览器中最终确认；复杂度 5。

## Acceptance
- 任务 2 的用例 1–5 转绿。
- `cd cf-transport-ship && nice -n 19 node --test --test-concurrency=1 tests/unit/touch-i18n.test.mjs tests/unit/mobile/desktop-equivalence.test.mjs tests/unit/mobile/touch-input.test.mjs` 全绿（含现有测试无修改）。
- 多指用例：摇杆 + 视角 + 开火同时按下，三者状态互不覆盖；抬起其一不影响其余。
- 边界：`computeLayout` 在 844×390、932×430、667×375、800×360、390×844 下所有按钮都在视口内、互不重叠、边长 ≥44。
- `node scripts/check-mobile-isolation.mjs` 退出码 0（`player.js` 未被触碰）。

## Trace
Source: `.ultra/specs/mobile-adaptation-20260930.md#US-M02`
Story IDs: US-M02
Accepted gaps: G-01（浏览器/真机验证后置）

## Change Log
2026-09-30 创建。来源：规格评估 E3/E4/E5/E6/E14。

## Completion
未完成。
