# Task 4: 平台接口、广告状态与离线适配器

Status source: `../tasks.json`, task `4`.

## Context
What: 定义 PlatformAdapter 合同与广告暂停生命周期，给 Y8/GM 提供可复用接入点。Why: 平台差异不渗入游戏规则。Constraints: 广告无填充不得暂停；原用户暂停和音量必须保留。

## Implementation
Target files: 新建 `src/platform/contract.js`, `offline.js`, `ad-session.js`、`src/audio.js` 和聚焦单测。Existing pattern: `game.js` pause/resume、`audio.js` setVolumes。Technical notes: 广告暂停是独立原因，成对、幂等；音频临时静音不写回设置。离线适配器不发网络请求。此任务只定义 contract，不修改 game.js/build.mjs，供任务 7/8 与最终集成复用。Effort/complexity: 6，核心在状态恢复边界。

## Acceptance
- 开始/结束、无广告、失败和重复回调后状态与音量正确。
- 离线适配器可在无 window/SDK 环境构造。
- Command: `node --test tests/unit/platform-contract.test.mjs tests/unit/ad-session.test.mjs`

## Trace
Source: `.ultra/specs/platform-expansion.md#US-03`。Story IDs: US-03。Accepted gaps: none。

## Change Log
2026-09-27：将音频临时静音与持久音量分离。

## Completion
已完成。可复用 PlatformAdapter/AdSession/离线适配器入库，来源修复提交 `216908f`；34/34 测试与独立 Flash Max 复核 PASS。
