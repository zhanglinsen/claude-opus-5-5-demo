# GLM-5.3-Flash High：正式平台 ID 配置与独立构建

工作目录：`/Users/sen/workspace/AI/claude-opus-5-5-demo/cf-transport-ship`。先读仓库指令、`build.mjs`、`src/main.js`、`src/platform/config.js`、平台适配器、`tests/unit/build-targets.test.mjs` 和 README。用户已授权将以下公开客户端标识接入本游戏：GameMonetize Game ID `6ju85rfh4ie5stg3q5xpw52cftpwcqsa`；Y8 Game ID `284915`；Y8 App ID `6aba62bc25efe452cfc6c1b2`。它们是平台 SDK 在浏览器端使用的公开 ID，不是服务端密钥。

目标：保留当前 `npm run build` 生成三种原有 mock/离线包、原有测试和独立离线单文件行为；新增显式的 `npm run build:configured`（或等价清晰命令），从本游戏专属、可替换的 `platform-ids.json` 读取三项 ID，只生成 `dist/configured/y8/` 与 `dist/configured/gamemonetize/` 两套单文件 HTML + 根目录 `index.html` 的 ZIP。配置层与可复用 `src/platform/` 插件分离。单文件 HTML 必须在游戏主脚本运行前内联目标平台的 `window.__PLATFORM_IDS__`；Y8 包只出现它自己的两个 ID，GM 包只出现它自己的 Game ID，离线包不含三项 ID。不能指望上传后的平台宿主页注入 ID。默认 mock 包不能被覆盖。

产物 manifest 和包内 README 应如实标记：ID 已配置、mock=false、真实平台审核/广告仍未完成，暂不可公开提交。原因还包括已知平台包目前仍内嵌未开放的经典地图数据；本任务不扩大到地图资产剔除，但不能把包称为可提交版。正式 SDK 接入失败仍应按现有适配器安全退化；不在加载时自动弹广告。不上传平台、不推送 Git、不改现有视觉性能复验报告。

采用 TDD：先写聚焦失败测试（配置包路径、ID 隔离、manifest、ZIP 根 index、默认 mock 包不变），再最小实现。构建错误时对缺失/空 ID 明确失败，避免伪正式包。添加一条轻量浏览器验证（可用 SDK 脚本路由替身），确认配置包真的走非 mock 适配器路径，Y8 init 与 GM SDK_OPTIONS 收到正确 ID；不请求真实广告，也不做 GPU 长测。只运行受影响单测、构建与此浏览器检查。

参考官方文档：Y8 https://docs.y8.com/sdk/intro/ 与 https://docs.y8.com/sdk/local-development/；GameMonetize https://github.com/GameMonetize/GameMonetize.com-SDK 。报告修改文件、命令、结果、仍需的平台验证；不要自行提交或推送。工程当前有一个无关未跟踪文件 `.ultra/reports/classic-visual-recheck-20260928.md`，不得触碰。
