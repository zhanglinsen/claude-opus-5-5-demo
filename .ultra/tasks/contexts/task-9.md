# Task 9: 菜单与 HUD 本地化

Status source: `../tasks.json`, task `9`.

## Context
What: 菜单、HUD、设置、战绩及品牌标识随语言即时更新。Why: 两种语言均可完整使用界面。Constraints: 不改游戏规则、主控和本地存档 ID。

## Implementation
Target files: `src/hud.js`, `src/viewmodel.js`, `src/style.css` 和相关 UI 单测。Existing pattern: `hud.js` 菜单模板与 `viewmodel.js` 投影。Technical notes: 使用任务 3 的 t()/订阅和任务 2 品牌组件；保持触屏响应式布局。对中文/英文文本溢出做 1920×1080 与手机横屏截图。此任务独占 HUD/style，不改 game.js/build。Effort/complexity: 6，界面文案分散但有明确文件边界。

## Acceptance
- 中英菜单、HUD、装备、战绩和暂停文字完整，切换无需重载。
- 品牌图标与文本语言对应，英文长度不遮挡重要战斗信息。
- Command: `node --test tests/unit/hud-i18n.test.mjs`

## Trace
Source: `.ultra/specs/platform-expansion.md#US-02`。Story IDs: US-01, US-02。Accepted gaps: none。

## Change Log
2026-09-27：HUD/style 文件只由本任务写入。

## Completion
已完成。菜单/HUD 本地化及触屏修复入库，来源提交 `f14006c`、`89bee5d`；独立 Flash Max 定向复核 PASS，双语截图见最终报告。
