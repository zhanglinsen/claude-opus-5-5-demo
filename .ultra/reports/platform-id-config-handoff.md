# 平台 ID 配置交付（2026-09-28）

## 范围

用户提供 Y8 Game ID `284915`、App ID `6aba62bc25efe452cfc6c1b2`，以及 GameMonetize Game ID `6ju85rfh4ie5stg3q5xpw52cftpwcqsa`。这些浏览器端客户端 ID 保存在 `cf-transport-ship/platform-ids.json`，通过显式 `npm run build:configured` 构建两份独立包；默认离线与平台 mock 构建行为不变。可复用 SDK 插件源码不含本游戏 ID。

## 产物

- `cf-transport-ship/dist/configured/y8/index.html` 与 `y8-package.zip`，ZIP SHA-256 `5f4496c1fb7ceed2e449a872e7af18d0cadba025a1d189bc1b5b5ac54d2e340d`。
- `cf-transport-ship/dist/configured/gamemonetize/index.html` 与 `gamemonetize-package.zip`，ZIP SHA-256 `14d062d00808c4e338f8a0b2443c2d15e9dedb4de8b78be46f25b80adecf195d`。
- 两份 ZIP 根目录均为单文件 `index.html`，另含 README 与 manifest。manifest 标记 `mock:false`、`adsVerified:false`、`submissionAllowed:false`。产物在本地 `dist/`，按仓库规则不纳入 Git。

## 验证与审核

- GLM-5.3-Flash High 实现与定向修正；全新上下文 GLM-5.3-Flash Max 独立只读审核结论 **PASS**（原始记录 `.ultra/logs/platform-id/review.jsonl`，日志仅留本机）。
- 最终配置构建测试 `9/9`，浏览器 SDK 本地替身检查 `15/15`；浏览器证据 `cf-transport-ship/artifacts/configured-platform/browser-check.json`，时间晚于最终 ZIP 构建。替身记录 Y8 `sdk.init` 的 App/Game ID、GM `SDK_OPTIONS.gameId`，确认加载期无广告调用。没有请求真实广告。
- 审核后仅修正文案与构建参数冲突处理；`--configured` 与 `--all`、`--dev`、`--target=` 混用会在写文件前失败。Codex 对增量差异作只读检查，`git diff --check` 通过；只改文案的最后一轮没有重跑测试。

## 尚未完成

真实 Y8/GameMonetize 平台审核及广告投放没有验证。两份平台包仍内嵌未开放的经典地图数据，公开提交前须剔除并复核素材。当前配置包只供本地接线验证，不能视为可提交的正式包。
