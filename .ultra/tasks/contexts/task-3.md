# Task 3: 语言服务、目录与设置兼容

Status source: `../tasks.json`, task `3`.

## Context
What: 提供中英文本目录、t(key, params)、语言来源优先级、订阅和持久选择。Why: 各界面可独立本地化。Constraints: 不改地图、装备、军衔的持久 ID，现有 `cf_opts_v2` 可读。

## Implementation
Target files: 新建 `src/i18n/`、`src/settings.js` 与聚焦单测。Existing pattern: `settings.js` 的 normalize/acquireStorage。Technical notes: 通过 `lang` 空值表示自动；用户选择优先，其次适配器返回的 Y8 locale，再次 navigator，最后构建默认。只增加设置字段和纯服务，不触碰 HUD/game.js。目录新增稳定键，后续任务补足调用点。Effort/complexity: 5，涉及动态状态与旧设置兼容。

## Acceptance
- 中英目录键一致，缺键有可诊断回退；切换通知订阅者。
- 旧 `cf_opts_v2` 和抛错 storage 下仍可进入游戏。
- Command: `node --test tests/unit/i18n.test.mjs tests/unit/settings.test.mjs`

## Trace
Source: `.ultra/specs/platform-expansion.md#US-02`。Story IDs: US-02。Accepted gaps: none。

## Change Log
2026-09-27：依据既有 v2 设置模块分配文件所有权。

## Completion
已完成。可复用 LocaleService、目录及设置兼容入库，来源提交 `2468553`；45/45 聚焦测试、独立旗舰 MAX 审核 PASS。
