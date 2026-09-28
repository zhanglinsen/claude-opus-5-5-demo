# 作战大厅菜单改版交接

## 范围

- 参考经典 FPS 大厅的信息层级：顶部品牌与导航、中央地图展示、右侧作战配置、底部固定出击。
- 离线版继续显示沙漠灰/运输船；平台版仍按原构建隔离使用原创地图。游戏规则、SDK 与地图几何未修改。
- 中文/英文分别使用已保存的透明背景「无限」/「INFINITY」工作室原图。菜单和网页标签图标均随语言切换；原图字节未改。
- 作战、装备、设置和操作分区；爆破/练习不展示仅团队竞技适用的目标击杀选项。现有设置、军衔档案、装备预设与开始按钮保留原交互。

## 实施与审核

- GLM-5.3-Flash High 先写了浏览器验收脚本和部分菜单代码，随后 CLI 返回 `400 [1005] exceed quota limit`。额度查询显示 Flash 账户为零；依据用户要求，余下实施由当前任务完成，独立只读审核使用 GPT-6 Sol medium。
- 独立审核提出三项收尾意见：旧 favicon、旧页面描述、英文截图仍在设置页。均已修正并复验。
- `npm run build` 与 `npm run build:configured` 均成功；默认离线/Y8/GameMonetize HTML 与 ZIP、已配置 ID 的两套平台构建均重新生成。正式平台审核和广告投放仍不属于本次菜单改版验收。
- 相关单测：`node --test tests/unit/brand.test.mjs tests/unit/i18n.test.mjs tests/unit/build-targets.test.mjs tests/unit/hud-i18n.test.mjs tests/unit/hud-mode.test.mjs`，63/63 通过。
- 浏览器验收：`node scripts/accept-lobby.mjs`，87/87 检查通过，页面脚本异常 0。覆盖 1600×900 桌面、844×390 触屏横屏、双语作战页、菜单导航、地图/模式、装备/设置重载保存、透明品牌与出击。390×844 竖屏另外人工查看，无横向溢出。

## 本地截图

截图保留在 `cf-transport-ship/artifacts/lobby/screenshots/`（构建/验收产物目录，未纳入 Git）：

- `desktop-zh.png`、`desktop-en.png`
- `touch-zh.png`、`touch-en.png`

本次没有重复旧任务的长时 GPU/性能测试；改动集中在菜单 DOM/CSS、品牌入口和页面元数据。游戏从大厅进入对局已由浏览器脚本确认。
