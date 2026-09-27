# Task 6: 运输船主题地图的原创平台版

Status source: `../tasks.json`, task `6`.

## Context
What: 提供独立设计的港口/舰船主题平台地图。Why: 两个平台首版都包含两张原创地图。Constraints: 离线旧运输船与旧玩家地图设置保持可用。

## Implementation
Target files: 新建 `src/maps/platform-harbor/` 与专属单测；只读 `src/map.js`、`src/env.js`、`src/navigation.js` 作为接口参考。Existing pattern: 运输船既有地图构建与出生区。Technical notes: 重做平面轮廓、甲板/码头建筑与标识，保留团队竞技/练习的对称或可平衡路线；几何、遮挡和导航一致。只改新目录，不争用沙漠或共享主控。Effort/complexity: 6，重点在结构与性能平衡。

## Acceptance
- 平台版轮廓与建筑不等同于离线运输船。
- 出生区、战线、静态靶和机器人导航可用，无明显性能退化。
- Command: `node --test tests/unit/platform-harbor.test.mjs`

## Trace
Source: `.ultra/specs/platform-expansion.md#US-04`。Story IDs: US-04。Accepted gaps: none。

## Change Log
2026-09-27：独立于沙漠路线并行。

## Completion
已完成。原创平台港口图入库，来源修复提交 `0e416fe`；18/18 测试与独立 Flash Max 复核 PASS；中英实机截图及短程实走见最终报告。
