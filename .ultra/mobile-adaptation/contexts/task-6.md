# Task 6: 视口与页面壳

Status source: `../tasks.json`, task `6`. Do not maintain another status field here.

## Context
What: 对局中禁止双击/捏合缩放、下拉刷新、长按菜单、点击高亮；用 `100dvh` 与安全区避免被刘海/横条遮挡；补齐移动端 meta。
Why: 规格 E7。cf 目前 `touch-action`、`overscroll-behavior`、`env(safe-area-inset-*)`、`viewport-fit` 等全是 0 处，只靠 `user-scalable=no`，而 iOS Safari 10+ 忽略它。
Constraints: 遵守规格 [US-M06](../../specs/mobile-adaptation-20260930.md#US-M06)。只改 `src/index.html`、`src/style.css`；CSS 全部放进 `/* mobile:begin */ … /* mobile:end */` 标记块，选择器以 `html.is-touch` 开头或位于 `@media (pointer:coarse)` 内；标记块之外的 CSS 与基线逐字相同。三个构建目标共用 `src/index.html`，因此 meta 改动对桌面必须无可见影响。

## Implementation
Target files:
- `cf-transport-ship/src/index.html`（`:5` 附近）
- `cf-transport-ship/src/style.css`

Existing pattern: `pelican-bike/index.template.html` 已有 `theme-color`、`env(safe-area-inset-*)` 与 `#intro{touch-action:pan-y}` 的写法，可借鉴其取舍（**只借鉴，不修改**该游戏）。

Technical notes:
- **`touch-action` 必须限定范围**：只给 `html.is-touch #c` 与 `html.is-touch #touch` 设 `touch-action:none`。大厅/暂停等 `.screen` 需要触摸滚动，保持默认或 `pan-y`。若给 `body` 整体设 `none` 会让大厅无法滚动。
- `html.is-touch, html.is-touch body { overscroll-behavior: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }`。
- 高度：`html.is-touch, html.is-touch body { height: 100dvh }`，`100%` 作为回退（`#c`、`#ui` 已是 `position:fixed; inset:0`）。渲染器尺寸走 `window.innerHeight`（`render.js:90`），属禁区，本任务不动。
- 安全区：定义 `--sat/--sar/--sab/--sal: env(safe-area-inset-*, 0px)`，供 `#touch` 根与任务 8 的 HUD 规则使用；没有 `viewport-fit=cover` 时它们为 0，无害。
- iOS 捏合缩放：`gesturestart` 的 `preventDefault` 由 `touch.js`（任务 3 的模块）在 `enabled` 时挂接；本任务只声明需求并在测试里断言，若需要补一处 `touch.js` 改动，放在同一标记函数内。
- meta：`theme-color`、`apple-mobile-web-app-capable`、`mobile-web-app-capable`、`apple-mobile-web-app-status-bar-style=black-translucent`。
- **`viewport-fit=cover` 是需用户确认的决策 D2**：作为**独立、最后一个提交**，默认按建议启用，但在用户确认前不得离开本分支；若用户选择不启用，只需回退这一个提交，其余安全区变量仍然无害。
- 构建：不运行构建；三目标共用同一 `index.html` 模板（`build.mjs` 的 `/*__CSS__*/` `/*__JS__*/` 占位），静态测试检查模板即可。

Effort/complexity rationale: 0.5–0.8 天；假设不需要真机即可完成实现，效果由任务 9/10 验证；复杂度 4。

## Acceptance
- 新增 `tests/unit/mobile/shell.test.mjs`（纯文本检查，不启动浏览器）：
  - `index.html` 含 `theme-color` 与两个 web-app-capable meta；与基线相比，改动行全部是 `<meta` 行。
  - `style.css` 标记块内每个选择器以 `html.is-touch` 开头或在 `@media (pointer:coarse)` 内；标记块之外与基线（`git show ${MOBILE_BASE:-perf-integration-20260929}:cf-transport-ship/src/style.css`）逐字相同；git/基线不可用时该用例显式 skip 并说明原因。
  - `touch-action:none` 只出现在 `#c`、`#touch` 的选择器上。
- `cd cf-transport-ship && nice -n 19 node --test --test-concurrency=1 tests/unit/mobile/shell.test.mjs tests/unit/mobile/desktop-equivalence.test.mjs` 全绿。
- `node scripts/check-mobile-isolation.mjs` 退出码 0。
- 浏览器/真机验证（双击缩放、下拉刷新、刘海遮挡）归任务 9/10，不在本任务声称已验证。

## Trace
Source: `.ultra/specs/mobile-adaptation-20260930.md#US-M04`
Story IDs: US-M04
Accepted gaps: G-01

## Change Log
2026-09-30 创建。来源：规格评估 E7；决策 D2 待用户确认。

## Completion
完成于 2026-09-30，提交 `0b12351`。
- 证据：`shell.test.mjs` 6 项通过、0 跳过。变异验证三种违规均被抓到：块内未限定规则、块外基线 CSS 被改、`<meta>` 同一行夹带 `<script>`。
- 与计划的偏差：`apple-mobile-web-app-status-bar-style` 用 `black` 而非 `black-translucent`（后者在独立模式下内容延伸到状态栏下，而我们尚未处理该安全区）；**未启用 `viewport-fit=cover`**，仍待用户确认（决策 D2）。
- 过程中修了测试自身两处缺陷：“块外与基线一致”的跳过条件恒为真（该测试曾静默失效）、meta 检查只看行首可被同行夹带绕过。
- 未验证：双击缩放、下拉刷新、长按菜单、刘海遮挡、`100dvh` 在 iOS/Android 地址栏伸缩下的表现——全靠推断，必须真机确认（任务 10 清单）。
