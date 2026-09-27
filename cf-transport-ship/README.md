# cf-transport-ship

穿越火线风格网页 3D FPS（内联单 HTML，Three.js + esbuild，无运行时网络依赖）。包含经典地图「运输船」（团队竞技，本地 AI 对战）与「沙漠灰」（高低层巷战地图，阶段 2 起可玩团队竞技/练习；爆破模式随阶段 3 开放）。

## 操作说明

菜单内也内置同一份键位表（游戏主菜单「按键」区随时可查）。

### 基础操作

| 按键 | 功能 |
|---|---|
| `W A S D` | 移动（`Shift` 静步，踩着箱子可上二层） |
| `空格` | 跳（蹲下再跳 = 蹲跳，跳得更高） |
| `Ctrl` / `C` | 蹲下 / 起身 |
| `鼠标左键` | 开火（按住连射）/ 手雷投掷（按住拉栓） |
| `鼠标右键` | 狙击开镜（三档）/ 刀重击 |
| `R` | 换弹 |
| `F` | 检视武器 |
| `Q` | 快切上一把武器；`滚轮` 循环切换 |
| `1 2 3 4` | 主武器 / 手枪 / 军刀 / 投掷物；持弹时再按 `4` 在手雷/闪光/烟雾间轮换（用完的型号不重复计数） |
| `5` | C4（携带时） |
| `E` | 拆包 / 拾取 C4（拆包优先，按住） |
| `G` | 丢弃当前 C4 |
| `B` | 更换主武器（出生区内立即生效，否则复活生效；爆破准备期立即生效、交战期下回合生效） |
| `Tab` | 计分板 |
| `Esc` | 暂停 / 设置（灵敏度、视野、音量、时间、画质） |

### 模式与地图

- **运输船**：团队竞技（TDM），率先达到目标击杀数的阵营获胜，4 秒复活。
- **沙漠灰**：默认爆破模式（5v5，潜伏者安包 / 保卫者拆包，先赢 7 回合获胜；C4 掉落可拾取，死亡掉包）；也支持团队竞技与练习。
- **练习模式**（两图均可选）：无敌军、全图探索、靶场任意换枪，命中数与受击反馈见练习面板；军衔 XP 不计入练习局。
- 菜单可选阵营（潜伏者 BL / 保卫者 GR）、对战规模、难度、画质与昼夜；`URL ?map=` / `?mode=` 可直接指定（如 `?map=desert-grey&mode=practice`）。

### 军衔与装备

- 完成一局团队竞技/爆破（胜利/平局/失败）会按击杀、目标行动（安包/拆包/拾包）与胜负结算 XP；每个对局结果只结算一次，练习局不结算。
- XP 累积提升本地军衔（列兵起步，存于浏览器 localStorage，损坏自动重建，隐私模式降级为仅本次会话有效）。
- 菜单内可编辑并切换三套装备预设（主武器/手枪/近战/投掷物），激活预设决定出生装备；投掷物固定携带手雷、闪光弹、烟雾弹各一枚，4 号键轮换。

### 触屏（手机横屏）

检测到触屏设备自动启用虚拟控件（也可用 URL `?touch=1` 强制开启）：左侧摇杆移动、右侧滑动控制视角；按钮：开火、跳、蹲、R（换弹）、切（快切）、镜（开镜）；爆破模式追加 C4 / E / G 按钮。

## 多地图架构

阶段 1 引入地图注册表与模式适配器，阶段 2 接入沙漠灰：

- `src/maps/registry.js` — 纯数据地图注册表：每张地图的元信息（id/名称/可用性/支持模式）、可玩边界、寻路配置、小地图参数、菜单环绕镜头、AI 常量、环境配置（海面/雾/日照/阴影体积）与出生区判定。出生点契约：`spawns[team] = [{x, y, z, yaw}]`，y 为脚底站立面高度，`Actor.spawn` 消费之（缺失回退注册表 `spawnYFallback`）。`resolveMapId(requested, stored)` 按 **URL `?map=` 参数 > 已存设置 > 新玩家默认** 解析。**新玩家默认沙漠灰**；旧 `cf_ship_opts` 用户迁移后默认运输船。
- `src/maps/index.js` — 浏览器侧装配：地图 id → 几何构建函数（运输船 = `src/map.js`，沙漠灰 = `src/maps/desert-grey.js`），并转出纯数据 `DESERT_LAYOUT`。
- `src/navigation.js` — 共享导航 API（`createNavigation(world, desc, map)`）：沙漠灰用高度感知导航图（`map.navGraph`，路径点带真实 y 与 walk/crouch/jump 通过要求），运输船由适配层保持原 NavGrid 行为。
- `src/modes/index.js` — 模式适配器注册表：开局参数（时长/复活间隔/目标）、结束判定、胜负判定、开局提示。当前 `tdm`（团队竞技）。
- `src/settings.js` — 版本化设置存取与迁移：旧 `cf_ship_opts`（v1，无版本）迁移为 `cf_opts_v2`，保留灵敏度/音量/画质/武器偏好。
- 小地图、菜单标题/简介、雷达标签、报点区域、加载文案、菜单镜头、AI 常量均随地图描述切换；机器人 AI 对非对称地图（沙漠灰）按 `teamGoals` 阵营目标选路，对对称地图（运输船）保留镜像分路。

## 构建目标（offline | y8 | gamemonetize）

```bash
npm run build            # 三目标一次全出（offline + y8 + gamemonetize）
npm run build:offline    # 仅 dist/index.html（离线单文件，经典双图，中文默认）
npm run build:y8         # dist/y8/index.html + y8-package.zip（平台原创双图，英语默认）
npm run build:gamemonetize  # dist/gamemonetize/index.html + gamemonetize-package.zip（同上）
```

- 每个构建只开放自己的地图集，且只加载目标平台的 SDK：离线版开放运输船/沙漠灰、无平台 SDK；y8 版只含 Y8 适配器（`y8sdk`）；gamemonetize 版只含 GameMonetize 适配器（`SDK_GAME_PAUSE`/`SDK_GAME_START`）。当前平台单文件仍内嵌未开放的经典地图数据；正式公开发布前应剔除并复核素材。
- **平台 ZIP**：根目录即 `index.html`，整包自包含（JS/CSS/纹理内联），当前仅供本地 mock 验证，取得正式 ID 并完成真实平台验证后才可提交；另含 `README.md`（上传与凭据注入说明）与 `manifest.json`。
- **mock 标记（重要）**：本仓库不含任何真实平台 ID。未在宿主页注入 `window.__PLATFORM_IDS__ = { appId, gameId }` 时，平台构建以明确 mock 模式运行：`window.__PLATFORM_MOCK__`、`<html data-platform-mock="true">`、`manifest.json` 内 `"mock": true`，广告一律无填充、不发起任何平台 SDK 网络请求。**带 mock 标记的包不得作为正式版提交**；取得正式 Y8 App/Game ID 或 GameMonetize Game ID 后的线上行为仍待真实验证。
- 构建隔离与 mock 逻辑有单测覆盖（`tests/unit/build-targets.test.mjs`、`platform-*.test.mjs`）。

## 命令

```bash
npm run build            # 构建 dist/index.html（内联单文件）
npm run dev              # 开发构建 + 本地静态服务 http://127.0.0.1:8787
npm test                 # 单元测试（node:test，注册表/设置迁移/模式适配器）
npm run test:e2e         # 真实浏览器 e2e（playwright-core + 本机 Chrome，HTTP 与 file://）
npm run test:e2e:desert  # 沙漠灰集成验收（路线物理走通/地标截图/运输船冒烟）
node scripts/accept-platform-browser.mjs   # 平台扩展定向验收：三构建双语/mock/触屏/广告断点冒烟
node scripts/accept-gpu-pair.mjs --out <file.json> --roots '<json>' --runs '<json>'  # 同机 GPU FPS 配对测量（1080p，含负载采样）
```

本地验平台构建需 HTTP（SDK 约定）：`npm run serve` 后访问 `http://127.0.0.1:8787/y8/index.html` 与 `/gamemonetize/index.html`；离线版可直接 `file://` 打开 `dist/index.html`。

URL 参数：`?map=transport-ship|desert-grey`（离线版）/ `?map=platform-desert|platform-harbor`（平台版，优先于已存设置）、`?q=low|medium|high`（画质）、`?autostart=1`（跳过菜单，测试用）、`?nolock=1`（不锁定指针，测试用）、`?touch=1`（强制触屏控件）。

### 平台原创双图（Y8 / GameMonetize 版）

- **赤霞集市 Chixia Bazaar**（`platform-desert`）：原创红沙街区，赤水暗渠纵贯，粮仓高台（A）与驼队市场（B）为包点；默认爆破，亦支持团队竞技/练习。
- **雾港码头 Fog Harbor Quay**（`platform-harbor`）：原创集装箱码头，龙门吊与栈桥多层结构；默认团队竞技，亦支持练习。
- 两张图与经典图无共享品牌或标志性外观，几何/碰撞/导航/包区为原创实现（`src/maps/platform-desert/`、`src/maps/platform-harbor/`），两平台构建内容相同。

测试约定：`window.__game.fastForward(seconds)` 为仅测试使用的模拟推进接口；e2e 证据（截图/结果 JSON）输出到 `artifacts/`（已 gitignore）。

## 目录

```
src/
  main.js        入口
  game.js        对局主控（流程/战斗/HUD 调度/主循环）
  maps/          地图注册表（registry.js 纯数据）与装配（index.js）；desert-grey 沙漠灰
  modes/         模式适配器
  map.js         运输船几何构建（合批 + 程序化纹理）
  physics.js     OBB 碰撞世界 + 寻路网格    navigation.js 共享导航 API
  actor.js       角色基类（移动/武器状态机）
  player.js      玩家输入与镜头    bots.js 机器人 AI
  guns.js        枪模    viewmodel.js 第一人称武器    character.js 士兵模型
  weapons.js     武器数值    effects.js 特效    audio.js 程序化音效
  env.js         天空/海洋/光照    textures.js 程序纹理    hud.js HUD 与菜单
  settings.js    设置版本迁移    touch.js 触屏
scripts/         serve.mjs 静态服务；e2e.mjs / e2e-desert.mjs 浏览器测试；accept-platform-browser.mjs 平台验收；accept-gpu-pair.mjs GPU 测量
tests/unit/      node:test 单元测试
```
