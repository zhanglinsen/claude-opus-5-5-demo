# 平台扩展阶段最终验收报告（草稿 · 待最终独立审核定稿）

- 阶段：平台扩展（Task 12 定向浏览器/GPU 验收与交付证据）
- 实施基线 SHA：`00f94f8`（Y8 locale：空 SDK locale 回退浏览器语言）
- 本轮验收执行：GLM-5.3-Flash High，独立 worktree `platform-integration`
- 验收日期：2026-09-28
- 独立终审：`.ultra/reports/platform-expansion-independent-review.md`，GLM-5.3-Flash Max `PASS-WITH-CONDITIONS`；文字条件已修订。
- 本地预览：离线 `http://127.0.0.1:8787/`，Y8 mock `http://127.0.0.1:8787/y8/index.html`，GameMonetize mock `http://127.0.0.1:8787/gamemonetize/index.html`；三地址均实测 HTTP 200。服务器由 `cd cf-transport-ship && npm run serve` 启动，离线 `dist/index.html` 亦可直接打开。
- 前置核对：HEAD `00f94f8` ✓；worktree Git 干净 ✓；主仓库 `.ultra/dispatch/platform-night/integration-y8-empty-locale-review.jsonl` 新上下文 Flash Max 审核结论 **PASS**（所审 SHA 即 `00f94f8`）✓；范围文件 `task-12.md`、`specs/platform-expansion.md` ✓

## 1. 通过/失败矩阵

| 验收项 | 结果 | 证据 |
|---|---|---|
| 完整单测（集成后） | **PASS** 404/404 | `artifacts/platform-expansion/logs/npm-test-00f94f8.log` |
| 三目标构建一次通过、可复现 | **PASS** | `logs/build-three-targets-00f94f8.log`；三个 index.html 重建前后 SHA 完全一致（见 §2） |
| ZIP 结构（根目录 index.html + 平台隔离） | **PASS** | 见 §2；内嵌 index.html 与对应构建 SHA 一致 |
| 离线版 file:// 打开 | **PASS** | 无控制台错误、无外部请求、默认中文 |
| 平台构建 HTTP mock 打开 | **PASS** | y8 / gamemonetize 均无控制台错误、**零外部请求（不加载真实 SDK）** |
| mock 明示标记 | **PASS** | `window.__PLATFORM_MOCK__`、`data-platform-mock="true"`、`manifest.json "mock": true`、占位 ID `mock-y8-app-id` 等 |
| 构建地图集隔离 | **PASS** | y8 菜单仅 `platform-desert`/`platform-harbor`，无经典图；离线版经典双图在 |
| 双语切换即时性 | **PASS** | 菜单/对局 HUD/触屏按钮（开火↔FIRE、跳↔JUMP 等）即时更新，无需刷新 |
| 语言持久化 | **PASS** | 刷新后保持；`cf_opts_v2.lang` 落盘；玩家选择 > 平台/浏览器语言 |
| 空平台语言回退浏览器（00f94f8 修复项） | **PASS** | 浏览器 en-US → 英文；浏览器 zh-CN → 中文；双向正确 |
| 装备/档案持久化 | **PASS** | `cf_opts_v2.primary=awm` 刷新保持；`cf_profile_v1` 可读（装备预设+XP 结构） |
| 平台双图短程实走/碰撞冒烟 | **PASS** | 两图各实走 2s：沙漠图位移 10.82m、港口图位移 7.44m，均未越界、未坠落（dy=0）、保持存活 |
| 广告自然断点 mock 冒烟 | **PASS** | `menu-return` 断点请求收口 `no-fill`；不暂停（paused=false, adPaused=false）、无静音残留 |
| 广告完整生命周期（开始才暂停/结束恢复/失败/重复回调） | **PASS（沿用单测证据）** | SDK 34/34、适配器 9/9、16/16 单测（含 00f94f8 前各轮红绿转录）；本轮浏览器仅做断点冒烟，未重复 |
| 双图双语截图 + 品牌 + mock 标识 | **PASS** | 10 张截图，见 §5 |
| 同机 GPU FPS 同口径对比 | **PASS（附条件）** | 见 §4；平台双图与经典双图持平 |
| 正式平台 ID 线上验证 | **待真实平台验证** | 未取得 Y8 App/Game ID、GameMonetize Game ID；mock 证据不作为实平台通过 |

失败项：无。

## 2. 三构建与产物核验

构建产物（本 worktree `cf-transport-ship/dist/`，`00f94f8` 源码重建）：

| 产物 | SHA-256 |
|---|---|
| `dist/index.html`（offline, 10560.2 KB） | `6961ab8f2c1356286fd3453a5b593e1b1d15f296d90729a1ca2859f835731422` |
| `dist/y8/index.html`（10564.8 KB） | `c437395da6cfb244737f6f2e85ca56b3b3a4c7763e4176a2c9a5ccd55ef5c521` |
| `dist/y8/y8-package.zip` | `f31e4222c0fe9ab0770f67d2a0b80e6fdf0d0ad77eac98eb2c3e233c40738ab7` |
| `dist/gamemonetize/index.html`（10564.1 KB） | `9bbf2c8e157eb18d797ba265c41a8d0626ab29d1a1ce14ec61b632e150ea40d9` |
| `dist/gamemonetize/gamemonetize-package.zip` | `3181672c6c52c2307d2fe48959527fed2d53d674f863b414cb9e5c82209ab6dc` |

- 复现性：重建前后三个 index.html SHA **逐字节一致**；ZIP 仅因内嵌时间戳不同，ZIP 内 `index.html` 与对应构建 SHA 一致（已验证）。
- 隔离：`y8sdk` 标记仅出现在 y8 版；`GameMonetize`/`SDK_GAME_PAUSE`/`SDK_GAME_START` 仅出现在 GM 版；offline 版两者皆无。
- ZIP 根目录：`index.html` + `README.md`（上传/凭据注入说明）+ `manifest.json`（`"mock": true`，注明无真实 ID、经 `window.__PLATFORM_IDS__` 注入）。
- **两平台均无正式 ID，全部产物为 mock，不可提交为正式版。**

## 3. 浏览器/GPU 定向验收（38/38 通过）

工具：`scripts/accept-platform-browser.mjs`（本轮新增并提交），headed Chrome + 真 GPU（Radeon Pro 5500M），单浏览器严格串行，结果 JSON：`artifacts/platform-expansion/browser-acceptance.json`。

覆盖（按构建）：

- **离线 file://**：默认中文；语言切英文即时生效；刷新后语言+装备（AWM）保持；`cf_profile_v1` 可读；经典运输船/沙漠灰进入对局截图（风格对照）；无控制台错误、无外部请求。
- **Y8 HTTP mock**：浏览器 en-US + mock 无平台语言 → 英文；菜单仅平台双图；mock 标记齐全；切中文即时生效且刷新保持（saved > platform）；广告 `menu-return` 断点 no-fill 不暂停；浏览器 zh-CN 反向回退 → 中文；触屏控件（开火/跳/蹲/R/切/镜 + C4/E/G）随语言即时切换；platform-desert 中文触屏实走截图；对局中暂停菜单切英文触屏即时变 FIRE；platform-harbor 中英出生点截图；全程无外部请求。
- **GameMonetize HTTP mock**：平台默认英文；mock 标记 target=gamemonetize；广告断点 no-fill；英文菜单截图（含品牌图标、地图限定、军衔档案区）；无外部请求。

首轮运行曾出现两个脚本侧问题，均已定位并修正（非产品缺陷）：

1. 「Y8 全新玩家默认英文」断言失败：Playwright Chrome 继承本机系统语言（navigator.language=zh-CN），mock 下平台语言为空、浏览器语言 zh-CN 正确胜出——**恰为 00f94f8 修复后预期行为**。改为显式 context locale 双向断言。
2. 触屏/nolock 页无 pointer lock，Esc 暂停不可达（暂停由锁丢失触发，设计如此）。改经游戏 API 打开暂停菜单（setup 驱动），语言切换与恢复仍走真实 UI 控件。

观察项（非本轮缺陷、不阻塞）：触屏模式无暂停按钮，移动端玩家除等待对局结束外缺少主动暂停入口；属既有交互设计，建议后续任务评估。

## 4. 同机 GPU FPS 对比（1080p 中画质）

工具：既有 `scripts/accept-gpu-pair.mjs`（防节流 Chrome 参数、逐轮负载采样、原始序列落盘）。四轮串行同一浏览器实例，符号链接 root 分别暴露离线/Y8 构建，`renderer.info` 钩子统计 draw calls，启动零帧排除（simTime≥1）。

- GPU：ANGLE Metal Renderer — **AMD Radeon Pro 5500M**（四轮 UNMASKED_RENDERER 一致）
- 视口/画质：1920×1080 / medium
- 窗口：2026-09-28 06:01（本机时间）起，每图采样窗口 65s
- 主机负载：后台多会话常驻负载（load 1min 峰值 11.2，测量前回落；四轮窗口约 4.5–7.1；16 核；无单一大 CPU 进程，15min 基线 ~6.2）。**非理想静默窗口，但四轮同条件串行、全程逐轮记录负载（约 4.5–7.1），相对比较有效；未做任何反复刷值。**

| 图 | 构建 | median | P5 | min | 低帧(<30)占比 | draw calls/s | calls/帧≈ | 累计三角形 | 轮内最大负载 |
|---|---|---|---|---|---|---|---|---|---|
| 运输船（经典） | offline | **60** | 59 | 45 | 0% | 16813 | 280.2 | 834.7M | 7.13 |
| 沙漠灰（经典） | offline | **60** | 60 | 44 | 0% | 7140 | 119.0 | 405.4M | 6.91 |
| 赤霞集市（原创） | y8 | **60** | 59 | 44 | 0% | 10217 | 170.3 | 335.6M | 6.93 |
| 雾港码头（原创） | y8 | **60** | 58 | 45 | 0% | 10817 | 180.3 | 525.4M | 5.70 |

- 四图 median 均为 60（垂直同步封顶），P5 58–60，低帧样本为 0；平台双图 draw calls（10217/10817 /s）落在经典双图区间（7140–16813 /s）内，资源开销同量级。
- 原始数据（逐 2s 采样 FPS 序列、调用率、负载序列）：`artifacts/platform-expansion/fps-four-maps.json`；每轮截图 `fps-four-maps-<label>.png`。
- **关于旧基线口径**：`final-visual-fidelity-handoff.md` 中「沙漠灰 P5≥55」在其测量轮未获正式达标轮（最好 P5=46，由末段负载波拖低），该条件项**维持原记录、不因本轮数据追溯宣称达标**。本轮平静段沙漠灰 P5=60 仅为新条件下的同口径新测量，两轮负载条件不同，不构成对旧门槛的裁决；是否关闭该条件项由协调者决定。

## 5. 交付物与文件路径

全部在 worktree `platform-integration`（`/Users/sen/.codex/worktrees/platform-integration/claude-opus-5-5-demo/`）：

- 构建：`cf-transport-ship/dist/index.html`、`cf-transport-ship/dist/y8/{index.html,y8-package.zip}`、`cf-transport-ship/dist/gamemonetize/{index.html,gamemonetize-package.zip}`
- 截图（10 张，`cf-transport-ship/artifacts/platform-expansion/screenshots/`，已 gitignore 不入库）：
  - `offline-menu-zh.png` / `offline-menu-en.png` — 离线菜单双语（品牌图标、中文/英文界面）
  - `offline-classic-transport-ship.png` / `offline-classic-desert-grey.png` — 离线经典双图对局（风格对照，英文 HUD）
  - `y8-menu-en.png` — Y8 平台英文菜单（品牌、平台双图限定）
  - `y8-platform-desert-zh.png` — 赤霞集市中文对局（触屏控件中文、小地图「赤霞集市·南队场」、建筑轮廓清晰）
  - `y8-platform-desert-en.png` — 赤霞集市英文对局
  - `y8-platform-harbor-zh.png` / `y8-platform-harbor-en.png` — 雾港码头中英出生点（码头建筑/集装箱/队友/双语 HUD）
  - `gm-menu-en-mock.png` — GameMonetize 英文菜单（mock 标识证据）
- 机器可读结果：`browser-acceptance.json`（38 检查项逐项）、`fps-four-maps.json`（原始采样）
- 日志：`logs/npm-test-00f94f8.log`、`logs/build-three-targets-00f94f8.log`、`logs/accept-platform-browser.log`、`logs/accept-gpu-four-maps.log`、`logs/commands.txt`（命令记录）
- 脚本（入库）：`cf-transport-ship/scripts/accept-platform-browser.mjs`（新增）
- README（入库）：三构建目标、mock/凭据注入说明、平台双图说明、验收命令

## 6. 复现命令

```bash
cd cf-transport-ship
npm test
npm run build
node scripts/accept-platform-browser.mjs
node scripts/accept-gpu-pair.mjs --out artifacts/platform-expansion/fps-four-maps.json \
  --roots '{"offline":"/tmp/plt-verify-offline","y8":"/tmp/plt-verify-y8"}' \
  --runs '[{"root":"offline","map":"transport-ship","label":"classic-ship","s":65},{"root":"offline","map":"desert-grey","label":"classic-desert","s":65},{"root":"y8","map":"platform-desert","label":"platform-desert","s":65},{"root":"y8","map":"platform-harbor","label":"platform-harbor","s":65}]'
# FPS 测量的 /tmp 符号链接 root：dist/index.html → 离线构建、dist/index.html → dist/y8/index.html
```

## 7. 剩余限制与未满足项

1. **正式平台 ID 缺失（外部依赖）**：Y8 App ID/Game ID、GameMonetize Game ID 未取得。平台构建全部以明确 mock 标记交付，**待真实平台验证**；线上 SDK 行为（真实广告填充、平台语言、加载竞态）不在本轮声称范围内。
2. **广告完整生命周期靠单测证据**：开始才暂停/静音、结束恢复玩家暂停与音量、no-fill/失败/重复回调不卡等经 SDK 34/34、适配器 9/9、16/16 单测覆盖（含真实接线转录）；按任务约束浏览器侧只做一次断点冒烟，未重复全套。
3. **旧长测沿用不重复**：原创地图 18/18 单测、旧视觉路线长测、20 回合等均沿用既有通过证据，本轮未重跑。
4. **沙漠灰 P5 旧门槛**：见 §4 末段——维持旧记录，不追溯宣称达标。
5. **主机负载条件**：FPS 测量在后台常驻负载约 4.5–7.1 的窗口完成（非静默），四轮同条件串行、逐轮负载在案；绝对值解读需带此条件。
6. 触屏无暂停按钮（既有设计观察项，建议后续评估）。

7. **平台包代码数据范围**：平台页面仅开放原创双图，URL 深链也会回退到原创图；当前单文件包仍内嵌未开放的经典地图描述数据。正式公开发布前应从平台构建中剔除这些未使用数据，并复核品牌与素材；本轮 mock 包不作为可提交版。

## 8. 本轮提交

- 验收基线：`00f94f8`（未修改任何产品源码；验收中无失败项需修复，故无修复提交）
- 本轮提交：`8a6ec5c` — `cf-transport-ship/scripts/accept-platform-browser.mjs`（新增验收脚本）+ `cf-transport-ship/README.md`（三构建与平台说明）
- 验收报告：`.ultra/reports/platform-expansion-final.md`（本文件；独立 Flash Max 终审 PASS-WITH-CONDITIONS，文字条件已修订）
