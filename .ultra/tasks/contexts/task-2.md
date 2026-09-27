# Task 2: 品牌组件与原图接入

Status source: `../tasks.json`, task `2`.

## Context
What: 三张用户原图由独立品牌组件按语言与背景选择。Why: 统一离线及平台的工作室标识。Constraints: 保持源 PNG 字节、175×175 尺寸和两张透明图的 alpha。

## Implementation
Target files: `cf-transport-ship/src/assets/studio/`, 新建 `src/brand/`。Existing pattern: `build.mjs` 的 PNG dataurl loader。Technical notes: 三张原图已保存；核对 SHA-256 后，组件返回中文深底、中文透明或英文透明资源及替代文本。只新增模块与测试，不改 HUD、game.js、build.mjs；这些由后续集成。Effort/complexity: 3，纯组件与资源选择。

## Acceptance
- 中文/英文和背景类型选择正确；未知语言安全回退。
- 原图 SHA-256 与附件保存记录一致。
- Command: `node --test tests/unit/brand.test.mjs`

## Trace
Source: `.ultra/specs/platform-expansion.md#US-01`。Story IDs: US-01。Accepted gaps: none。

## Change Log
2026-09-27：三张附件已抢先保存，组件待门槛满足后实施。

## Completion
待执行；记录测试和视觉截图。
