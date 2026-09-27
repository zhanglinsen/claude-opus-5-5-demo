# Task 8: GameMonetize 广告适配器

Status source: `../tasks.json`, task `8`.

## Context
What: GameMonetize 的初始化、SDK 事件和自然断点广告实现 PlatformAdapter。Why: 与 Y8 保持单一接口。Constraints: 正式包需要 Game ID；无 SDK 时安全退化。

## Implementation
Target files: `src/platform/gamemonetize.js` 与专属 mock 测试。Existing pattern: Task 4 contract。Technical notes: 构造 SDK_OPTIONS.onEvent，加载官方 sdk.js；`SDK_GAME_PAUSE` 暂停/静音，`SDK_GAME_START` 恢复；ready 后适时调用 `sdk.showBanner()`，不把 showBanner 名称误认为常驻横幅。只改本适配器目录，不改 HTML/build/game。Effort/complexity: 4，主要风险是事件重复与加载失败。

## Acceptance
- ready/加载失败/重复 pause-start 安全，广告只在自然断点请求。
- 模拟广告期间音频静音且模拟停止，结束恢复。
- Command: `node --test tests/unit/platform-gamemonetize.test.mjs`

## Trace
Source: `.ultra/specs/platform-expansion.md#US-03`。Story IDs: US-03。Accepted gaps: none。

## Change Log
2026-09-27：官方文档 https://github.com/GameMonetize/GameMonetize.com-SDK。

## Completion
已完成。GameMonetize 适配器入库，来源提交 `4f68db8`；16/16 mock 测试与独立 Flash Max 审核 PASS。正式 ID 缺失，真实平台验证仍待执行。
