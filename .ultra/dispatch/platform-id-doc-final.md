# 文案最后两处精确纠正

只改 `/Users/sen/workspace/AI/claude-opus-5-5-demo/cf-transport-ship/README.md` 与 `src/platform/config.js` 的注释，勿动代码逻辑、测试、构建产物，不提交/推送。

1. README 构建命令 `npm run build` 行仍写“全部 mock 标记”，这是错的：离线目标本来就非 mock；准确写“离线 + 两个平台 mock 包”。
2. README 下文“默认三构建（含其平台 ZIP）为 mock 包”若仍存在，也改成“默认的两个平台构建及其 ZIP 为 mock；离线目标非 mock”。不要混淆 `mock` 与“不含真实平台 ID”。
3. `src/platform/config.js` 顶部末尾称“具体凭据只在构建层 scripts/platform-ids.mjs”，也不准确：具体值在根目录 `platform-ids.json`，脚本只负责读取/校验。改准确。

只做这三处文案定向修正，运行 `git diff --check` 和 `rg -n '全部 mock|三构建.*mock 包|具体凭据只在' README.md src/platform/config.js` 确认旧错字句消失。不要重跑测试或浏览器（本轮只改文案）。报告改动。
