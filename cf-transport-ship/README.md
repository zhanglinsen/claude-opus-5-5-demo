# cf-transport-ship

穿越火线风格网页 3D FPS（内联单 HTML，Three.js + esbuild，无运行时网络依赖）。当前包含经典地图「运输船」（团队竞技，本地 AI 对战）。

## 多地图架构（沙漠灰实施中）

阶段 1 引入了地图注册表与模式适配器，为「沙漠灰」地图铺路：

- `src/maps/registry.js` — 纯数据地图注册表：每张地图的元信息（id/名称/可用性/支持模式）、可玩边界、寻路范围、小地图参数、菜单环绕镜头、AI 架点/分路常量、出生区判定。出生点契约：`spawns[team] = [{x, y, z, yaw}]`，y 为脚底站立面高度，`Actor.spawn` 消费之（缺失回退 0.02）。`resolveMapId(requested, stored)` 按 **URL `?map=` 参数 > 已存设置 > 新玩家默认** 解析，不可用的地图自动回退。`desert-grey` 在阶段 2 前仅登记元数据（`available: false`），菜单中展示为「待开放」。
- `src/maps/index.js` — 浏览器侧装配：地图 id → 几何构建函数（运输船 = `src/map.js`）。
- `src/modes/index.js` — 模式适配器注册表：开局参数（时长/复活间隔/目标）、结束判定、胜负判定、开局提示。当前仅 `tdm`（团队竞技）。
- `src/settings.js` — 版本化设置存取与迁移：旧 `cf_ship_opts`（v1，无版本）迁移为 `cf_opts_v2`，保留灵敏度/音量/画质/武器偏好；**旧用户迁移后默认运输船**，新玩家默认地图由注册表解析（沙漠灰开放前回退运输船）。
- 小地图、菜单标题/简介、雷达标签、加载文案、菜单镜头、AI 常量均随地图描述切换，不再硬编码运输船。

## 命令

```bash
npm run build      # 构建 dist/index.html（内联单文件）
npm run dev        # 开发构建 + 本地静态服务 http://127.0.0.1:8787
npm test           # 单元测试（node:test，注册表/设置迁移/模式适配器）
npm run test:e2e   # 真实浏览器 e2e（playwright-core + 本机 Chrome，HTTP 与 file://）
```

URL 参数：`?map=transport-ship|desert-grey`（优先于已存设置）、`?q=low|medium|high`（画质）、`?autostart=1`（跳过菜单，测试用）、`?nolock=1`（不锁定指针，测试用）。

测试约定：`window.__game.fastForward(seconds)` 为仅测试使用的模拟推进接口；e2e 证据（截图/结果 JSON）输出到 `artifacts/`（已 gitignore）。

## 目录

```
src/
  main.js        入口
  game.js        对局主控（流程/战斗/HUD 调度/主循环）
  maps/          地图注册表（registry.js 纯数据）与装配（index.js）
  modes/         模式适配器
  map.js         运输船几何构建（合批 + 程序化纹理）
  physics.js     OBB 碰撞世界 + 寻路网格
  actor.js       角色基类（移动/武器状态机）
  player.js      玩家输入与镜头    bots.js 机器人 AI
  guns.js        枪模    viewmodel.js 第一人称武器    character.js 士兵模型
  weapons.js     武器数值    effects.js 特效    audio.js 程序化音效
  env.js         天空/海洋/光照    textures.js 程序纹理    hud.js HUD 与菜单
  settings.js    设置版本迁移    touch.js 触屏
scripts/         serve.mjs 静态服务；e2e.mjs 浏览器测试
tests/unit/      node:test 单元测试
```
