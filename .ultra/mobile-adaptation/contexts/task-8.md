# Task 8: 小屏 HUD 与触控区避让

Status source: `../tasks.json`, task `8`. Do not maintain another status field here.

## Context
What: 让游戏内 HUD 在手机横屏（含宽度 >760 的 844×390、932×430）下不与触控区重叠、不遮挡准星附近视野；补充更小横屏与竖屏大厅的尺寸规则。
Why: 规格 E9（⚠️ 推断）。现有游戏内 HUD 只有一组按宽度触发的 `@media (max-width:760px)`（`style.css:304-309`），手机横屏多数不命中。
Constraints: 遵守规格 [US-M06](../../specs/mobile-adaptation-20260930.md#US-M06)。**只改 `src/style.css` 标记块内的 CSS 与 `src/mobile/layout.js`**，选择器以 `html.is-touch` 开头；**不改 `hud.js`**，不改桌面 HUD 尺寸。

## Implementation
Target files:
- `cf-transport-ship/src/style.css`（标记块内）
- `cf-transport-ship/src/mobile/layout.js`（如需补充区域常量）
- 新建 `cf-transport-ship/tests/unit/mobile/layout-geometry.test.mjs`

Existing pattern: 大厅横屏规则 `style.css:315-341`、英文文案弹性 `style.css:286-302`；HUD DOM 由 `hud.js` 模板生成（**只读**，用来做元素清单：`#radarWrap`、`#feed`、`#ammo`、`#score`、`#center`、`#objHint`、`#toast` 等）。

Technical notes:
- 先做**HUD 元素清单**：读 `hud.js` 模板与 `style.css`，列出每个 HUD 块的锚点、默认尺寸、位置，写进本文件 Completion，再据此定避让方案；不凭猜测改。
- 划分区域：左下 = 摇杆区，右下 = 动作按钮区，右侧 = `sideRail`，屏幕中央半径约 20% 高度 = 准星视野区；HUD 块避开这些区域，必要时收缩（雷达、击杀信息、弹药）或上移。
- 触控区几何全部来自 `layout.js` 的 `computeLayout`，因此**可以用纯 Node 单测**验证按钮几何；HUD 元素的实际包围盒在浏览器里才有，交任务 9 断言。
- 竖屏大厅：补 390×844、360×740 的规则；对局在竖屏时由任务 7 暂停，不为竖屏对局做 HUD 适配。
- 英文长文案（`html[lang=en]`）在小屏下已有 `white-space:normal`；新规则不得覆盖它们。
- 依赖任务 6 的 `is-touch` 作用域与 `--sa*` 安全区变量。

Effort/complexity rationale: 0.5–1 天；假设 HUD 无需 DOM 改动即可通过 CSS 避让；如发现必须改 `hud.js` 才能做到，**停下并询问用户**，不得自行放宽；复杂度 5。

## Acceptance
- `layout-geometry.test.mjs`：在横屏 844×390、932×430、667×375、800×360 下，所有触屏按钮与摇杆底座在视口内（含安全区）、互不重叠、边长 ≥44px、不进入屏幕中央准星区；竖屏 390×844 只要求在视口内且不抛错（竖屏对局由任务 7 强制暂停）。
- `cd cf-transport-ship && nice -n 19 node --test --test-concurrency=1 tests/unit/mobile/layout-geometry.test.mjs tests/unit/mobile/shell.test.mjs tests/unit/touch-i18n.test.mjs` 全绿。
- 标记块之外的 CSS 与基线逐字相同（沿用任务 6 的测试）。
- `node scripts/check-mobile-isolation.mjs` 退出码 0。
- HUD 实际包围盒与触控区不重叠的最终断言由任务 9 完成，本任务不声称已在浏览器验证。

## Trace
Source: `.ultra/specs/mobile-adaptation-20260930.md#US-M05`
Story IDs: US-M05
Accepted gaps: G-01

## Change Log
2026-09-30 创建。来源：规格评估 E9/E10。
2026-09-30 更正验收：竖屏 390×844 不再要求互不重叠，理由同任务 3。`layout-geometry.test.mjs` 的基础部分由 lane L0 随 `layout.js` 一并提供，本任务在其上补 HUD 避让与安全区用例，见 `dispatch/README.md`。

## Completion
完成于 2026-09-30，提交 `c7ac93f`。HUD 元素清单、避让表、局限见 `../reports/L8-report.md`。
- 证据：`hud-geometry.test.mjs` 10 项（9 通过 + 1 待办）；解析 `hud` 分区声明的位置/尺寸，与 `computeLayout` 触控矩形及准星区相交检查，覆盖 844×390、932×430、800×360、667×375、含刘海的 844×390 与 812×375。测试抓到 2 处我手算漏掉的冲突（击杀信息与爆破模式 E 键），已修复；变异验证 4 个视口变红。
- **重要局限**：只验证“声明的盒子”，真实内容（文字/图标/行高）是否溢出需任务 9 在真实页面里量；英文文案更长（比分 `.goal` 设了 nowrap）、高度 <360 的紧凑屏、性能任务正在改的 `hud.js` 雷达画布缓存 rebase 后需复核。我看不到像素，观感需人眼确认。
