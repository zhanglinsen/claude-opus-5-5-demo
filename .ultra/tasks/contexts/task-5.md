# Task 5: 沙漠主题地图的原创平台版

Status source: `../tasks.json`, task `5`.

## Context
What: 在共享玩法上提供独立设计的沙漠主题平台地图。Why: 两个平台公开版不能仅将当前沙漠灰换名。Constraints: 离线旧图保留；不把截图或原游戏素材作为运行资源。

## Implementation
Target files: 新建 `src/maps/platform-desert/` 与必要地图专属测试；只读现有 desert-grey 布局、导航、材质作为接口参考。Existing pattern: `src/maps/desert-grey-layout.js`, `desert-grey-materials.js`。Technical notes: 重做整体轮廓、关键建筑、名称与标识，并让碰撞、导航、包区、视线对应新几何；只更改本地图专属文件。由任务 11 接入 map registry/build target。Effort/complexity: 6，两个包区与高低层验证耗时，必要时在本目录拆子任务。

## Acceptance
- 平台版与离线旧图在俯视轮廓及主要建筑立面上可明显区分。
- 双出生点到 A/B、回防、上下层和包区可走通。
- Command: `node --test tests/unit/platform-desert.test.mjs`

## Trace
Source: `.ultra/specs/platform-expansion.md#US-04`。Story IDs: US-04。Accepted gaps: none。

## Change Log
2026-09-27：与运输船原创版文件完全分离。

## Completion
待执行；记录布局图、路线和实机截图。
