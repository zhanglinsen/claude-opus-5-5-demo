# 阶段 1 实现报告：共享接口与运输船适配

实施者：GLM-5.3-Flash（zcode-kit run claude-code）。基线：54adc1f。日期：2026-09-26。
状态来源：.ultra/specs/desert-grey.md（#architecture）、.ultra/tasks/contexts/task-1.md。

> **更新（2026-09-26，第 1 轮评审后）**：独立评审提出 6 项发现，已全部修复并重新验证（单测 26/26，e2e 20/20，主流程经 #btnStart 真实点击进入）。逐项对照见 `.ultra/reports/phase-1-fix-1.md`；下文原报告中的测试数字为修复前版本。

## 结论

阶段 1 范围全部完成并通过自测：地图注册表/描述符与模式适配器落地，运输船功能与玩法保留（e2e 真实浏览器冒烟全绿），设置迁移与地图选择架构就绪，`desert-grey` 仅登记元数据（菜单显示「待开放」，无假沙漠几何、无安拆包功能）。构建 844.9 KB 内联单 HTML，HTTP 与 file:// 均正常加载，无页面脚本异常。

## 变更文件

新增：
- `src/maps/registry.js` — 纯数据地图注册表（元信息/可用性/支持模式/寻路范围/小地图参数/菜单环绕镜头/AI 架点分路常量/出生区判定）+ `resolveMapId` 解析（URL `?map=` > 已存设置 > 新玩家默认 > 首张可用；不可用地图自动回退）。
- `src/maps/index.js` — 浏览器侧装配（地图 id → 几何构建函数；运输船 → `src/map.js`）。
- `src/modes/index.js` — 模式适配器注册表，当前仅 `tdm`：开局参数（600s / 4s 复活 / 目标杀数）、结束与胜负判定、开局提示。
- `src/settings.js` — 版本化设置：旧 `cf_ship_opts`（v1）→ `cf_opts_v2`（v2），保留灵敏度/音量/画质/武器偏好；旧用户迁移后固定默认运输船，全新玩家 `map:null` 交由注册表解析（沙漠灰开放前回退运输船）。
- `scripts/serve.mjs` — 最小静态服务（dev/e2e 用，no-store）。
- `scripts/e2e.mjs` — playwright-core + 本机 Chrome 真实浏览器 e2e（HTTP 对局 / 地图回退 / 设置迁移 / 地图菜单 / file://）。
- `tests/unit/settings.test.mjs`、`tests/unit/registry.test.mjs`、`tests/unit/modes.test.mjs` — node:test 单元测试 19 例。
- `README.md`、`.gitignore`（`artifacts/` 与 `*.log`）。

修改：
- `src/game.js` — 地图解析与描述符注入（寻路范围、环境氛围锚点、雷达、菜单镜头、加载文案、FPS 标签）；`startMatch`/`kill`/`endMatch` 走模式适配器；换背包出生区判定走 `inSpawnZone`；`?map=` 参数支持；`map` 选项保存后重载。
- `src/hud.js` — 设置读写走 `src/settings.js`；菜单新增地图选择段（从注册表动态生成，不可用地图按钮禁用）；标题/简介/加载页/记分板标题随地图描述切换；`buildRadar`/`drawRadar` 参数化（画布尺寸、坐标偏移、顶层结构虚线框）。
- `src/bots.js` — 架点/分路/包抄/漫游/突进常量改由 `game.mapDesc.ai` 提供。
- `src/env.js` — `shipSpeed` 参数化（`opts.shipSpeed`）。
- `src/style.css` — 仅新增禁用按钮样式（2 行）。
- `package.json` — 新增 `dev`/`serve`/`test`/`test:e2e` 脚本。
- `package-lock.json` — resolved URL 从不可达的内部源 `bnpm.byted.org` 重写为 `registry.npmjs.org`（版本不变），否则 `npm ci` 无法安装。

未改动：运输船几何（`src/map.js`）、枪械/角色/物理/音效/特效/触屏，以及 pelican-bike、qq-speed 两个工程。

## 命令与结果（cf-transport-ship 内，2026-09-26）

| 命令 | 结果 |
| --- | --- |
| `npm run build` | 通过，`built dist/index.html 844.9 KB` |
| `npm test`（node:test） | 19/19 通过，0 失败 |
| `npm run test:e2e`（playwright-core + /Applications/Google Chrome.app，headless） | 17/17 通过，无页面脚本异常 |

e2e 覆盖（对 dist 最终产物，HTTP 与 file:// 双通道）：
1. `?autostart=1&nolock=1` 开局：12 actors、tdm 模式、timeLeft≈600、地图解析为 transport-ship；雷达标签「运输船」。
2. 玩家击杀：HUD 比分 0→1，击杀信息流出现条目（用 `fastForward` 推进跳过 3s 出生保护后击杀）。
3. 机器人模拟：`fastForward(10)` 产生 8 次击杀，阵亡者按 4s 间隔复活。
4. 设置以 `cf_opts_v2`（v:2, map:transport-ship）落盘。
5. `?map=desert-grey` 回退运输船并写回设置。
6. 旧 `cf_ship_opts`（sens 1.7 / vol 0.5 / quality medium / primary awm）迁移保留全部字段、默认运输船。
7. 菜单列出两张地图，desert-grey 禁用显示「待开放」，transport-ship 选中。
8. `file://` 加载单 HTML 正常渲染菜单。

证据（已 gitignore）：`cf-transport-ship/artifacts/e2e-results.json`、`artifacts/e2e-http-match.png`、`artifacts/e2e-menu-map-select.png`、`artifacts/e2e-file-menu.png`。

## 与验收项对照

- 地图注册表/描述符 + 模式适配器，仅支持现有运输船：✅（desert-grey 仅元数据 available:false）
- 运输船几何与玩法保留：✅（e2e 真实对局 + 击杀 + 复活；几何代码零改动）
- 常量参数化（地图/环境/雷达/出生/菜单/环绕/AI）：✅（见变更清单；出生点数据本就在 buildMap 返回值中，随地图构建切换）
- 设置迁移 + 地图选择架构：✅（v1→v2 迁移；菜单地图段 + URL 优先级 + 保存重载）
- dev/test/test:e2e 脚本 + 有意义测试：✅（19 单测 + 17 e2e，均验证用户可见行为）
- .gitignore 生成物：✅（`cf-transport-ship/.gitignore`：`artifacts/`、`*.log`；node_modules/dist 由仓库根覆盖）
- HTTP + file 冒烟：✅

## 已知限制 / 剩余工作（按规划属后续阶段）

1. 沙漠灰几何、导航、环境（阶段 2）：注册表项尚无 nav/radar/menu/ai 数据，构建函数未注册。
2. 爆破模式状态机（阶段 3+）：`modes/index.js` 仅 tdm；C4/投掷物新增未实现（现有 HE 手雷为运输船既有功能，未动）。
3. 环境构建器仍是海洋专用（`src/env.js`）；沙漠灰需要独立天空/光照/远景。`env.shipSpeed` 已参数化，其余随阶段 2。
4. e2e 在 headless 软渲染下约 1–2 fps，属于测试环境限制；用 `fastForward` 推进接口规避，未绕过任何被测行为。
5. `package-lock.json` registry URL 重写需随本次变更一起提交，否则外部环境无法安装依赖。

## 风险与说明

- 菜单地图段采用与既有选项一致的 `.seg` 样式，未引入新视觉语言；仅新增禁用态两行 CSS。
- `resolveMapId` 对新玩家返回沙漠灰（开放后生效），开放前回退运输船并有单测锁定该行为；阶段 2 翻转 `available` 后无需改动游戏代码。
- 单元测试注入 storage，不触真实 localStorage；e2e 全部断言用户可见状态（HUD 文本、按钮禁用态、localStorage 落盘、截图）。
