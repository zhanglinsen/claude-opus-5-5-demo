# 作战大厅按需加载交付记录

## 改动

- 首屏只初始化 HUD、设置、档案、地图描述和触屏控件；不创建 WebGL、纹理、地图、环境或逐帧循环。
- 点击“开始游戏”后显示加载进度，只执行所选地图的构建器。同一地图返回大厅后停止渲染，再次开局复用已加载资源。
- 首次在大厅切地图不重载页面；离线和平台目标各自嵌入两张小尺寸静态地图预览，保持单文件与目标资源隔离。
- 建图失败返回大厅并显示本地化错误提示。

## 定向验证

- `npm run build`：离线、Y8 mock、GameMonetize mock 三目标成功；`npm run build:configured`：两份带正式 ID 的包成功。正式 SDK 服务端和广告播放仍需平台环境验证，配置包不可据此宣称可提交。
- `node --test tests/unit/build-targets.test.mjs tests/unit/registry.test.mjs tests/unit/hud-mode.test.mjs`：40/40 通过。
- `npm run test:e2e:lazy`：离线运输船、沙漠灰，Y8 原创沙漠、GameMonetize 原创港口的大厅与冷启动全部通过；返回大厅 320 ms 内世界绘制 0 次；离线 `file://` 打开与加载失败回退通过；页面脚本异常 0。
- `node scripts/accept-lobby.mjs`：本次改动后的大厅交互与截图验收通过。

## 性能判读限制

一次 9 秒的 1080p 中画质短程探针测得沙漠灰中位约 17 FPS、运输船约 12 FPS；启动样本含 0 FPS，不能用它计算可靠 P5。探针时机器虽接入交流电，`pmset -g custom` 显示 **AC Power lowpowermode=1**。此前正常供电的历史验收与电池低电量模式下的复验见 `classic-visual-recheck-20260928.md`。这次修复消除了大厅空闲时的 3D 渲染，未宣称已解决低电量模式下的对局帧率。正式同机对比须在关闭低电量模式且图形负载稳定后进行一次双图串行采样。
