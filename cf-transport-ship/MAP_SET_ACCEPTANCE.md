# 地图集开关独立验收

日期：2026-10-03。检查对象为主目录的 `--map-set=classic|original` 实现，保留该版本；此前独立工作树提交 `767648b` 未覆盖主目录。定向修复由 GPT-6.1 Sol medium 完成，主任务独立核对代码、构建与浏览器行为。

## 结论

通过本次开关验收。offline、Y8、GameMonetize 及 configured 构建默认 classic：沙漠灰、运输船。original 仍可在项目构建时选取；玩家菜单只显示当前图集两张地图，没有图集控件，网址 `maps` / `mapSet` 参数不能改变编译选择。平台 SDK 目标与图集独立。

检查发现并修复两项：重复地图集参数原先静默使用第一个；配置包文案原先阻止用户已授权的平台试用。现支持规范 `--map-set` 和兼容别名 `--maps`，非法、缺值、重复、混用均在写文件前失败。configured 包标明 `mock:false`、`trialUploadAllowed:true`、`releaseVerificationPending:true`，真实审核和广告状态仍为 pending / false。

## 实际验证

- 43/43 聚焦 Node 测试：`node --test tests/unit/registry.test.mjs tests/unit/build-targets.test.mjs tests/unit/configured-build.test.mjs tests/unit/map-set-cli.test.mjs`。
- esbuild 编译后的 registry + getMapBuilder：offline / y8 / gamemonetize × classic / original / 未注入开关，共 9/9；验证实际可用图、默认图、构建器及跨集 ID 回退。
- 串行 Chrome 浏览器 25/25：两种 configured SDK 包 × 沙漠灰/运输船均实际进入练习对局；首屏大厅无 WebGL/世界，点击后正确构建地图与导航。SDK 官方脚本地址使用路由替身，记录正确公开客户端 ID；加载期无广告、无其他平台 SDK 请求、无未处理异常。
- 同一浏览器 origin 切换 classic → original → classic：XP、装备预设、语言、灵敏度和音量保持，失效 URL / 旧图 ID 回退到有效地图。透明英文工作室 favicon 与原图完全一致。
- 重建 all 与 configured 五个 HTML、四个 ZIP。最终 configured 两包均 classic，ZIP 根 HTML 与旁边的 HTML 字节一致。最后文案/参数修正后的游戏脚本 SHA-256 与浏览器验收版本一致，因此没有重复 GPU 测试。

浏览器原始记录和实际执行脚本保存在 `artifacts/map-set-acceptance/`（忽略生成物，不进入 Git）。TDD 修复证据见 `MAP_SET_REVIEW_FIX.md`。

## 使用

```bash
npm run build:configured                         # 默认经典双图，真实平台客户端 ID
npm run build:configured -- --map-set=original    # 原创双图备用
```

上传试用用 `dist/configured/y8/y8-package.zip` 和 `dist/configured/gamemonetize/gamemonetize-package.zip`；普通 `dist/y8` / `dist/gamemonetize` 仍是 mock 包。平台实际审核、真实广告填充未在本次验证；未重跑 FPS 或长时间性能测试，共享地图资源的包体冗余仍在。
