# 独立只读审核：configured 平台 ID 构建

在全新上下文中，只读审核 `/Users/sen/workspace/AI/claude-opus-5-5-demo/cf-transport-ship` 当前未提交差异。不要修改文件、不要运行外部 SDK 或长测试、不要提交或推送。重点审查 `build.mjs`、`platform-ids.json`、`scripts/platform-ids.mjs`、`tests/unit/configured-build.test.mjs`、`scripts/accept-configured-browser.mjs`、`package.json`、README，以及已生成的 `dist/configured/{y8,gamemonetize}` ZIP。

用户提供 Y8 App ID `6aba62bc25efe452cfc6c1b2`、Y8 Game ID `284915`、GameMonetize Game ID `6ju85rfh4ie5stg3q5xpw52cftpwcqsa`。项目目标：默认 `npm run build` 的 mock 与离线产物保持原样；显式 `npm run build:configured` 从本游戏专属配置生成两个各自只含自己平台 ID 的单文件 HTML/根目录 ZIP；游戏主脚本前设置 `window.__PLATFORM_IDS__`，运行时进入非 mock 平台适配器；构建缺 ID 失败；README/manifest 不把配置包误称为可公开提交，因为真实平台验证未做且平台包仍内嵌经典地图数据。可复用 `src/platform/` 插件不能绑定本游戏 ID。浏览器检查只能用 SDK 替身，必须证明传给 SDK 的 ID 与无加载期广告，不能产生真实网络广告。

直接检查代码、差异、测试与包内容，寻找高置信功能/集成缺陷、构建参数错误、假阳性测试或误导性文案。按严重度列出可操作发现，注明文件/行号和复现依据；若无阻塞缺陷给 PASS（允许非阻塞建议）。明确区分“ID 配置与替身检查通过”和“官方平台真实广告验证未完成”。输出中文简洁审核报告。
