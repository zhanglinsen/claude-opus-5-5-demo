# 配置包审核后的极小范围修正（GLM Flash High）

工作目录 `/Users/sen/workspace/AI/claude-opus-5-5-demo/cf-transport-ship`。你负责实现、自测；Codex 独立复核。不要改经典视觉复核报告、不要提交/推送、不要接触真实 SDK 网络/广告。

当前已实现 `npm run build:configured`，独立 GLM Flash Max 审核 PASS，报告在 `../.ultra/logs/platform-id/review.jsonl` 最后一条 result。请只修明确问题：

1. `README.md` 当前说“全部 mock 标记”“本仓库不含任何真实平台 ID”“平台 ZIP 当前仅供本地 mock 验证”，与现有 `platform-ids.json` 和配置包不符。精确改成默认平台包为 mock、离线包非 mock、正式客户端 ID 仅在显式配置构建内联、配置包仍不可公开提交。不要把 ID 称为服务端密钥。
2. `src/main.js` 和 `src/platform/config.js` 顶部注释还称正式 ID 只由部署页注入/包内不含 ID，补充默认包与 configured 包两条路径；保持可复用插件实现不含具体 ID。
3. `build.mjs` 对 `--configured` 与 `--dev`、`--all`、`--target=` 混用要在写文件前明确失败，避免悄悄覆盖目标或产出未压缩的配置包。新增一个聚焦测试覆盖这些冲突；不要改默认构建行为。

实施后顺序：`npm run build:configured` 重建最终产物 → `node --test tests/unit/configured-build.test.mjs` → `node scripts/accept-configured-browser.mjs`（SDK 全部本地路由替身；不要访问真实平台）。保证浏览器证据时间晚于最终构建时间。检查 Git diff；只报告改动、测试数与限制。不要跑全量单测、长测、GPU 性能。不要提交/推送。
