# Task 12: 定向验收、独立审核与交付

Status source: `../tasks.json`, task `12`.

## Context
What: 审查三种构建的功能、图像、性能和 SDK 行为并交付证据。Why: 保证两图同品质、广告不破坏玩法。Constraints: 只运行必要测试；不重复旧阶段已通过的长时验证。正式平台 ID 缺失是可说明的外部依赖，不把 mock 称为实平台通过。

## Implementation
Target files: `cf-transport-ship/artifacts/platform-expansion/` 与 `.ultra/reports/platform-expansion-final.md`。Existing pattern: 旧阶段真实 GPU 截图和指标。Technical notes: 新上下文 GLM MAX 只读审核实际代码、截图、测试原始输出；发现缺陷回 Flash 定向修复，受影响项复核。两图两语言截图；原版/平台版关键路线；广告暂停；同机 1080p 中画质与冻结基线比较。Effort/complexity: 5，侧重证据和必要复核。

## Acceptance
- 双地图双语、品牌、离线/平台构建及广告 mock 证据齐全；正式 ID 若已给则进行平台真实验证。
- 独立报告列明缺陷、修复、性能、原创新版对照及未满足项。
- Command: `npm test` 与聚焦浏览器/性能脚本；具体命令在执行报告中记录。

## Trace
Source: `.ultra/specs/platform-expansion.md#US-06`。Story IDs: US-05, US-06。Accepted gaps: none。

## Change Log
2026-09-27：保留必要测试，旧证据沿用。

## Completion
已完成（附条件）。验收脚本与报告提交 `8a6ec5c`、`6c5859e`，独立 Flash Max 终审 PASS-WITH-CONDITIONS；最终证据见 `.ultra/reports/platform-expansion-final.md` 与 `.ultra/reports/platform-expansion-independent-review.md`。正式 ID/平台包代码数据剔除在公开提交前处理。
