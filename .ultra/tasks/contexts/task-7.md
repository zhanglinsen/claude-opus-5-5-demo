# Task 7: Y8 广告与语言适配器

Status source: `../tasks.json`, task `7`.

## Context
What: Y8 SDK 的初始化、平台语言和自然断点广告实现 PlatformAdapter。Why: 保持 SDK 逻辑独立。Constraints: 不做登录、云存档、激励或横幅；正式包需要 App ID 和 Game ID。

## Implementation
Target files: `src/platform/y8.js` 与专属 mock 测试。Existing pattern: Task 4 contract。Technical notes: 注入 window/script loader 以测试 async 加载；同时监听 `y8sdk.ready` 并调用 `emitReadyEvent()` 处理先加载竞态；广告 `showAd({type:'next',beforeAd,afterAd})`，只在 beforeAd 暂停。`getPlatformLocale()` 失败则返回空值。只改本适配器目录，不改 HTML/build/game。Effort/complexity: 5，SDK 回调竞态需验证。

## Acceptance
- SDK 先到与后到都只初始化一次；缺 SDK 时游戏可继续。
- 无广告填充不暂停，广告开始/结束成对通知。
- Command: `node --test tests/unit/platform-y8.test.mjs`

## Trace
Source: `.ultra/specs/platform-expansion.md#US-03`。Story IDs: US-03。Accepted gaps: none。

## Change Log
2026-09-27：官方文档 https://docs.y8.com/sdk/intro/ 与 https://docs.y8.com/sdk/advertising/。

## Completion
已完成。Y8 适配器入库，来源提交 `29086ba`；9/9 mock 测试与独立 Flash Max 审核 PASS。正式 ID 缺失，真实平台验证仍待执行。
