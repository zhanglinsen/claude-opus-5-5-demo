# E 波最终验收报告 — 候选版（desert-grey 分支工作树）

执行：GLM-5.3-Flash HIGH。执行时间：2026-09-27 07:40 – 08:38（本地）。验收期间**零产品代码改动**；新增脚本 `scripts/accept-{bomb-seeded,longrun,workflows,profile,gpu}.mjs`。基线：`node --test tests/unit/*.test.mjs`（glob）**223/223**；`dist/index.html` 970,984 B（952K，构建于 08:18 后的收口版）。

执行环境：macOS（Darwin 24.x，arm64 实测 GPU **AMD Radeon Pro 5500M**，ANGLE Metal）。提示中"Intel UHD 630"与本机实测不符，如实按实测记录。

## 1. 固定种子爆破回合 ≥20 — **通过（24 回合，五类结局齐全）**

命令：`node scripts/accept-bomb-seeded.mjs`（方法：`g.objectiveSeed` 注入目标规划器 + `fastForward` 确定性模拟推进，标记为 sim 证据、不冒充渲染）。两轮执行合计 46 回合（首跑 22 / 二跑 24），留存产物为二跑：

| 场次 | 种子 | 回合数 | matchEnded | 推进墙上耗时 | 最大单块 |
|---|---|---|---|---|---|
| 1 | 11 | 7 | ✓ | 12.7s | 5.4s |
| 2 | 23 | 8 | ✓ | 10.2s | 4.2s |
| 3 | 37 | 9 | ✓ | 14.0s | 4.8s |

结局分布（24 回合）：**timeout 18 / defused 2 / grWiped 2 / blWiped 1 / exploded 1** —— 安/拆/爆/歼灭/超时五类全部覆盖。0 页面异常、0 控制台错误、无卡死（单块推进墙上时间 < 5.4s，阈值 30s）。

如实说明：同种子两轮的结局序列不完全相同——objectiveSeed 只固定目标规划器决策，出生点/AI 射击/投掷仍有 `Math.random`（引擎既有行为），"完全逐位可复现"不成立；种子保证了规划层（分路/架点/携包/回防）可复现。产物：`artifacts/accept-bomb-seeded.json`。

## 2. ≥600 秒真实渲染长跑 — **通过（600s 真实 60fps，0 异常，内存平坦）**

命令：`node scripts/accept-longrun.mjs`（有头 Chrome 1280×720、q=low、真实 rAF——**不调用 fastForward**；运输船 TDM，对局时限运行时置 ∞ 保持全程活跃；每 5s 抽样 121 点）。渲染器：`ANGLE (AMD ... AMD Radeon Pro 5500M ...)`。

| 指标 | 首段（前 5 样） | 中段 | 尾段（后 5 样） |
|---|---|---|---|
| JS heap MB | 35.4→30.7（均 33.2） | 26.8→30.5（均 33.4） | 25.3→34.4（均 37.4） |
| 真实 rAF 帧/秒 | 60 | 60 | 60 |
| 存活角色 | 12→7（战斗减员） | 12 | 12 |
| 场景 mesh | 133 | 133 | 133 |

- 模拟时间 600.4s / 600s 墙钟（1:1，真实连续推进 ✓）；rAF 帧/秒 min 47 / P5 50.6 / median 60。
- 内存回归斜率 **+0.79 MB/min**（600s 累计 +4MB，无持续线性增长）；JS heap 无异常抬升。
- pageErrors 0 / consoleErrors 0。

产物：`artifacts/accept-longrun.json`（121 样本全量）。

**方法学如实记录**：headless 模式两次实测 rAF 被节流至 ~1fps（短窗口探针同配置却 60fps，成因未完全定位，疑与 headless 页面 BeginFrame 供给有关；`g.fps` 因按 clamp 后 dt 统计会虚报 10fps）。因此长跑改用**有头真窗口**执行，并给脚本加了节流免疫的真实 rAF 计数器作为"真实渲染"断言依据。该节流也意味着既有 headless e2e 中的"渲染"仅以低帧率发生（功能断言不受影响，但不应解读为帧率证据）。

## 3. 同页 10 次连续重开资源趋稳 — **部分通过（几何/网格/heap 平稳；纹理单调泄漏，见发现）**

同页连续 `startMatch()` 10 次（每次间隔 2.5s 沉降后采样）：

| 重开次数 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| heap MB | 44.3 | 30.0 | 33.0 | 46.2 | 29.9 | 31.2 | 42.6 | 54.4 | 28.9 | 38.7 |
| geometries | 154 | 154 | 154 | 154 | 154 | 154 | 154 | 154 | 154 | 154 |
| meshes | 133 | 133 | 133 | 133 | 133 | 133 | 133 | 133 | 133 | 133 |
| **textures** | 122 | 138 | 153 | 168 | 184 | 200 | 216 | 230 | 243 | 258 |

heap 逐次值抖动大（GC 时机不同），但**无跨重开的趋势性抬升**（前 3 均 35.8 vs 后 3 均 40.7，差值 < 阈值；几何/网格完全恒定佐证无实体累积）。

- **通过**：几何 154 恒定、场景 mesh 133 恒定（无几何/网格累积）；heap 前 3 均 35.8 → 后 3 均 40.7（+4.9MB，< 阈值 1.2×+30MB；600s 长跑本身斜率 0.79MB/min 佐证非重开累积）。
- **未通过（真实发现）**：`renderer.info.memory.textures` **单调线性增长 +15/次**（122→258）。根因（代码走读定位，未改动产品）：每局 `addTag` 为每名队友创建名牌 `CanvasTexture`（10 个 bot），`startMatch/quitToMenu` 清理时只 `scene.remove(t.sprite)`，**未 dispose texture/material** → 每重开一次泄漏约 15 个 GPU 纹理。10 次重开 +13MB 纹理显存量级（256×48 RGBA ≈ 50KB/张），连续重开 10 次量级可容忍，但长时间挂机重开（如 100 局 ≈ +1500 纹理）存在显存压力。**修复建议**（一行级，留产品波）：tags 清理处补 `t.sprite.material.map.dispose(); t.sprite.material.dispose();`。

## 4. 双地图 × 双工作流 + 离线自包含 — **通过（8/8）**

命令：`node scripts/accept-workflows.mjs`（每页记录全部网络请求）。

| 组合 | 开局 | 请求数 | 外部请求 |
|---|---|---|---|
| transport-ship × HTTP | ✓ tdm | 1 | 0 |
| transport-ship × file:// | ✓ tdm | 1 | 0 |
| desert-grey × HTTP | ✓ bomb | 1 | 0 |
| desert-grey × file:// | ✓ bomb | 1 | 0 |

每页**恰好 1 个请求**（即 index.html 本体）——单文件自包含实证；HTTP 侧全部指向本机 127.0.0.1，file:// 侧全部 file:/data: 协议，断网语义成立。产物：`artifacts/accept-workflows.json`。

## 5. 桌面 + 手机横屏 — **通过（4/4）**

- 桌面 1280×720：由 §4 四个组合承载（均为桌面视口）。
- 手机 844×390 landscape（iPhone UA + hasTouch）：`touch.enabled=true`，虚拟控件可见且 **10 个按钮**（开火×2/跳/蹲/R/切/镜/C4/E/G）渲染齐全；真实 `TouchEvent` 派发到「开火」按钮 → `stats.shots` 0→**3**（实际射击）；「跳」按钮 → 角色实际离地（移动性）；0 页面异常。
- 调试记录（非产品缺陷）：首测点按落在出生 readyAt(0.3s) 之前未出弹——软渲染下模拟时间推进慢，脚本改为等待 `time > readyAt + 0.5` 后点按。

## 6. 真机 GPU 1080p 中画质 FPS — **沙漠灰达标；运输船低于 60fps 目标（如实）**

命令：`node scripts/accept-gpu.mjs`（有头 Chrome 1920×1080、q=medium、本机 GPU，无软渲染参数；各 ≥64s、2s 抽样 33 点）。渲染器：`ANGLE (AMD, ANGLE Metal Renderer: AMD Radeon Pro 5500M)`。

| 场景 | FPS median | P5 | min | frame time(median) | 低帧(<30fps)占比 | 60fps 目标 |
|---|---|---|---|---|---|---|
| 沙漠灰 爆破 | **60** | **60** | 46 | 16.7ms | ~0% | **达标** |
| 运输船 TDM | **45** | 37 | 0* | 22.2ms | 有 | **未达标（75%）** |

\* min=0 为首样本（fps 计数器尚未满 1s 窗口）的暖机值。

如实评估：沙漠灰 1080p 中画质稳定锁 60 vsync（P5=60，仅个别 46 抖动）；运输船 median 45 / P5 37，瓶颈与视觉 lane 报告 §2 的判断一致——海面泡沫/白色上层建筑持续供给 bloom（threshold 3.2 全档开启），render.js 的 bloom 根治（阈值提到 8-10 或天空/高亮排除出 bloom 输入）是首要修复方向（属 render.js owner / 已在 phase-4-visual §2 建议）。本报告不虚构达标。截图：`artifacts/accept-gpu-desert-grey.png`、`accept-gpu-transport-ship.png`；数据：`artifacts/accept-gpu.json`（含全量 FPS 序列）。

## 7. Profile 浏览器最终验收 — **通过（8/8）**

命令：`node scripts/accept-profile.mjs`（真实浏览器 + localStorage 全程）。

| 步骤 | 结果 |
|---|---|
| 全新档案 | xp 0 / 列兵 Lv.1 / 三套预设 / persisted ✓ |
| TDM 完赛（到时结束） | awardMatch 恰好一次发分 +25 XP，账本 1 条 ✓ |
| 军衔进度 | rankView xp 25、progress 8% ✓ |
| 重载持久化 | xp/军衔跨刷新保持 ✓ |
| 损坏存档恢复 | 垃圾 JSON → 归一化合法档案、游戏可玩、通道 persisted ✓ |
| 预设切换出生装备 | setPresetSlot(1,'grenade','flash') + switchPreset(1) → 出生雷包首位=flash、手持 flash ✓ |
| 练习局不加 XP | 练习到时结束 → lastAward=null、XP/账本零增长（相对断言，损坏恢复后基线）✓ |
| 全程 | 0 页面异常 ✓ |

产物：`artifacts/accept-profile.json`。说明：预设切换对**主武器**的出生生效走 `opts.primary`（菜单/换包偏好，HUD lane 负责与预设的同步），本验收以**雷种**观察预设→出生装备链路（无 HUD 依赖的确定路径）。

## 8. 离线交付物核对 — **通过**

- `dist/index.html` 单文件 970,984 B（`ls dist/` 仅此一个交付文件，esbuild 内联 JS/CSS/纹理）。
- 运行时网络依赖：§4 的请求清单证明 HTTP/file:// 双工作流每页仅 1 请求（页面本体），0 外部请求。
- 操作说明：存在于 HTML 菜单内（`W A S D 移动 / 鼠标左键 开火 / 1 2 3 4 主武器·手枪·刀·手雷 / Q 快切 / 5 C4 / E 拆包 / G 丢包 / R 换弹 / Tab 计分板 / Esc 暂停` 等完整键位表，实测 grep 命中）。README 无独立操作章节（有"多地图架构/命令/目录"），建议补充——非阻塞。

## 汇总

| 验收项 | 结果 |
|---|---|
| 1 固定种子爆破 20 回合 | ✅ 24 回合（46 累计），五类结局，0 异常 0 卡死 |
| 2 ≥600s 真实渲染长跑 | ✅ 600s @ 60fps 真实 GPU，0 异常，heap 平坦（+0.79MB/min） |
| 3 十次连续重开资源趋稳 | ⚠️ 几何/网格/heap 平稳；**纹理 +15/次单调泄漏（未达标，附根因与修复建议）** |
| 4 双地图 × 双工作流离线 | ✅ 8/8，单请求自包含 |
| 5 桌面 + 手机横屏 | ✅ 4/4，触屏开火/跳跃实调 |
| 6 真机 GPU 1080p 中画质 | ⚠️ 沙漠灰 60fps 达标；**运输船 45fps 未达 60 目标（如实）**，bloom 根治为首要建议 |
| 7 Profile 最终验收 | ✅ 8/8 |
| 8 离线交付物 | ✅ 单文件/零外部请求/HTML 内操作说明（建议 README 补操作章节） |

**未达标项与建议**：
1. 【产品缺陷·建议下波一行修复】重开纹理泄漏：tags 清理补 dispose（§3）。
2. 【性能·归 render.js owner】运输船 1080p 中画质 45fps < 60 目标：bloom 阈值 8-10 或高亮源排除出 bloom（phase-4-visual §2 已有方案）；或运输船海面泡沫粒子降档。
3. 【测试方法学】headless rAF 节流致长时渲染证据必须在有头模式采集；既有 headless e2e 结论有效但不构成帧率证据。
4. 【文档】README 补操作说明章节（当前在 HTML 菜单内）。

产物清单：`artifacts/accept-bomb-seeded.json`、`accept-longrun.json`、`accept-workflows.json`、`accept-profile.json`、`accept-gpu.json`、`accept-gpu-desert-grey.png`、`accept-gpu-transport-ship.png`。脚本：`scripts/accept-*.mjs`（5 个，可重复执行，无产品代码改动）。
