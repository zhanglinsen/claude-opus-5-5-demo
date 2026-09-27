# Task 10: 战斗消息与档案名称本地化

Status source: `../tasks.json`, task `10`.

## Context
What: 战斗播报、模式/地图/报点、武器/军衔/装备显示名转换为语言键。Why: 避免 HUD 双语但对局仍出现中文硬编码。Constraints: 持久 ID 与规则数据不变。

## Implementation
Target files: `src/game.js`, `src/maps/registry.js`, `src/modes/index.js`, `src/profile/` 中显示名相关文件和聚焦测试。Existing pattern: 现有 map/mode ID 与 profile rank/equipment。Technical notes: 使用任务 3 服务，但仅替换玩家可见文本；存档序列化不保存译文。此任务独占 game.js，待其完成后任务 11 才集成平台事件。Effort/complexity: 5，文本分散；控制触及文件不超过 8 个。

## Acceptance
- 两种语言的战斗消息、地图报点、军衔和装备正确。
- 已保存等级/装备与模式/地图设置升级后保持原值。
- Command: `node --test tests/unit/profile-core.test.mjs tests/unit/game-i18n.test.mjs`

## Trace
Source: `.ultra/specs/platform-expansion.md#US-02`。Story IDs: US-02。Accepted gaps: none。

## Change Log
2026-09-27：game.js 写入与最终集成顺序互斥。

## Completion
已完成。战斗消息/档案本地化入库，来源提交 `53d664a`、`ccfb1d5`；38/38 受影响测试及独立 Flash Max 定向复核 PASS。
