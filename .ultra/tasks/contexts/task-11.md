# Task 11: 整合主控与三种构建产物

Status source: `../tasks.json`, task `11`.

## Context
What: 接入所有组件，输出离线、Y8、GameMonetize 构建。Why: 同一游戏可在本地与两平台运行。Constraints: 离线无 SDK/外部请求，平台包不交叉加载，缺正式 ID 明确标记 mock。

## Implementation
Target files: `src/main.js`, `src/game.js`, `src/maps/index.js`, `src/index.html`, `build.mjs`, `package.json` 与打包脚本。Existing pattern: 当前 esbuild 内联 HTML 构建。Technical notes: 仅此任务修改共享入口与构建；选择 map 内容 pack、语言默认及平台适配器。广告调用在整场结束或返回菜单，不侵入回合中。Y8 SDK 外链只在 Y8 版，GameMonetize SDK 外链只在 GM 版；平台 ZIP 根目录 index.html。Effort/complexity: 6，六个共享入口聚合风险。

## Acceptance
- 三种产物均能启动双地图；离线 `file://` 可玩且无外部资源。
- Y8/GM mock HTTP 版只有对应 SDK；无 ID 的包不能冒充发布包。
- Command: `npm run build && node --test tests/unit/build-targets.test.mjs`

## Trace
Source: `.ultra/specs/platform-expansion.md#US-05`。Story IDs: US-03, US-04, US-05。Accepted gaps: none。

## Change Log
2026-09-27：单一集成任务负责共享文件。

## Completion
已完成。三目标集成产品基线 `00f94f8` 经独立 Flash Max 复核 PASS；三构建与 ZIP 位于 `cf-transport-ship/dist/`。正式平台包仍为 mock。
