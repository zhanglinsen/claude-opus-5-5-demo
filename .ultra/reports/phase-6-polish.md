# E 波 lane 1 — 画面/音效收口与渲染收敛报告

执行者：GLM-5.3-Flash HIGH。日期：2026-09-27。
输入：`phase-4-visual.md` §2（bloom 渗白根治建议）、`phase-5-fixes-rereview.md` 残留 P3-2 / P3-1。
授权文件：`src/render.js`、`src/env.js`、`src/audio.js`、`src/hud.js`（仅 1 行注释）。**未改** game.js/player.js/bots.js/modes/maps 几何。

## TL;DR

- **bloom 根治落地**：threshold 3.2→8（render.js）。沙漠总览/地面视角无渗白，运输船对比更干净（不回退，是改善），低档无 bloom 行为不变。
- **skyGain 回调**：desertDay 0.25→0.5、desertDusk 0.3→0.45，天空恢复蓝色云层结构，无墙面泛白复发。
- **音效收口**：bounce/pin/throw/HE 爆炸链路齐全（D 波 impactSpeed>2 闸门在位）；闪光/烟雾起爆现复用 bounce 音，本波在音频层补齐 `playFlashPop`/`playSmokePop` 程序化音效（待 Game lane 一行接线，见 §3）。
- **性能预收敛**：PMREM 环境图去重（startMatch 期构建 1→0 次，实测）；识别但不动一项跨 lane 浪费（沙漠载入全量构建运输船贴图，需 game.js 改动，见 §4）。
- **hud.js 勘误闭环**：P3-2 过时注释已改；P3-1 displayMode 按授权仅记录为已接受残余（§5）。
- 验证：单测 **223/223**、e2e-desert **34/34**、e2e **21/21**、build 通过；真机 GPU（有头 Chrome）renderer 信息已记录。**本报告不声称 FPS 成绩**（E 波性能验收另行实测）。

## 1. bloom 根治（render.js）

**改动**：`UnrealBloomPass(resolution, 0.14, 0.35, 3.2)` → threshold **8**（strength/radius 不变；`quality==='low'` 不创建 bloom 的行为不变）。注释说明依据。

**依据与校准**（运行时扫参截图，`artifacts/dg-vis/`）：
- `p6-calib-gain0.5-th{3.2,5,8,10}.png`（总览）：gain 0.5 下 3.2 与 8 观感已接近 → 天空原始辐亮度 ×0.5 大部分已低于 3.2，旧阈值渗白主要来自 gain=1.0 时代 3.2-6.4 区间的整片天空。
- `p6-gr-{aLong,mid,bSite}-g0.5-th{3.2,8}.png`（地面视角，对 bloom 渗白最敏感）：两阈值均无渗白。取 8 留双保险：天空即使随 skyGain 回调也不再进入高亮提取；真正 HDR 高光（太阳盘、枪口焰、爆炸闪光、海面日光闪斑辐射 ≥60）仍正常 bloom。

**运输船不回退**：`p6-ship-th3.2-old.png` vs `p6-ship-th8-new.png`（同机位同帧序）——旧阈值下白色上层建筑的辉光渗到船体与海面；新阈值船体色彩更实、海天边界更干净。海面日光闪斑（shader spec 项辐射 ~60）远超新阈值，bloom 特征保留。

## 2. skyGain 回调（env.js）

| 预设 | 旧值 | 新值 |
|---|---|---|
| desertDay | 0.25 | **0.5** |
| desertDusk | 0.3 | **0.45** |

验证（`p6-final-{high,medium,low}-{overview,aLong,bSite,bTunnelLower}.png`，三档全量重拍）：
- 天空恢复蓝色、云层结构可见（对比 phase-4 初版整片过曝白，`high-aLong.png` 前后对比见 `p6-gr-aLong-*` 系列）；
- 无墙面泛白复发：白墙辐射 ≈0.85×3.0×NdotL ≈ 2.2 < 阈值 8，远离 bloom 提取区，且 ACES 后有高光余量；
- 总览与低档观感一致、地标辨识不变（16 视角全量截图基线保留在 phase-4 的 `dg-vis/*.png`，本波新增 `p6-final-*` 12 张覆盖 overview/aLong/bSite/bTunnelLower × 三档）。

## 3. 音效收口（audio.js）

**现状核查**（不改逻辑的部分，列明为报告结论）：

| 事件 | 现状 | 评估 |
|---|---|---|
| 投掷出手 | `playGrenadeThrow`（whoosh，game.js:748） | 复用合理 ✓ |
| 弹体落地弹跳 | `playGrenadeBounce`，game.js:762 按 D 波 `impactSpeed > 2` 闸门过滤（贴地静止的尘埃级重命中不发声） | 复用合理 ✓ |
| 拔保险 | `playGrenadePin`（game.js:887） | 专属音已有 ✓ |
| HE 爆炸 | `playExplosion`（game.js:587/778）：爆裂瞬态+低频冲击+长尾+碎片+近距耳鸣 | 专属音已有 ✓ |
| **闪光起爆** | 复用 `playGrenadeBounce`（game.js:243，注释自认「专用闪光音效属音频层后续扩展」） | **缺专属音** |
| **烟雾起爆** | 复用 `playGrenadeBounce`（game.js:269） | **缺专属音** |

**本波改动**：在 audio.js 新增两个轻量程序化音效（各 ~20 行，复用既有 `_voice/_nz/_tn/_metal` 助手与距离衰减语义）：
- `playFlashPop(pos)`：锐利高频「啪」+ 明亮短促噪声闪爆 + 高频余振——无 HE 的碎片/隆隆，突出「闪」而非「炸」；
- `playSmokePop(pos)`：罐体低「噗」+ 罐盖金属声 + 发烟剂 ~1.6s 渐弱嘶声。

**接线说明**：两方法当前**未被调用**（本 lane 禁改 game.js）。接线是 detonate() flash/smoke 分支各一行 `audio.playGrenadeBounce(p)` → `audio.playFlashPop(p)` / `audio.playSmokePop(p)`（game.js:243/269 两处）。请协调者路由给 Game 域 lane 完成接线后即闭环；未接线期间行为与 D 波完全一致（零回归风险）。

## 4. 性能预收敛（低风险项）

**已做**：`env.js` apply() 的 PMREM 环境图重建改为输入变化才重建（key = preset 名 + sunElev/sunAzim/ocean/groundColor）。init 与 startMatch 各调一次 apply 且参数相同，此前每次 apply 都完整渲染一次 PMREM 立方体。
- 量化：实测 startMatch 期间 `buildEnvMap` 调用 **1 → 0 次**（探针包裹计数，medium 档软渲染下每次构建 ~数十 ms 主线程+GPU）；每次页面载入净省 1 次 PMREM。切换画质/tod（会 reload 或改 key）仍正确重建。
- 风险评估：环境图输入全部包含在 key 内（sky2 uniforms 与 sunDir 均由 preset+override 派生），无语义变化；e2e 两套全过、截图观感不变。

**识别但不动**（跨 lane，记录给协调者）：
1. 沙漠灰载入时 `game.js` 仍先全量构建运输船贴图集（`buildTextures` 含 1024/2048² canvas + 多组 fbm，沙漠仅用 `T.quality` 一项）。修复需 game.js 把地图 id 传给 buildTextures 或延迟构建——属 Game/贴图域，E 波本 lane 无权改 game.js，潜在收益为沙漠载入时间下降（量级需 GPU 机实测，本报告不虚构数字）。
2. 其余几何侧已是合并批处理（沙漠 8 个材质批 + 贴花、运输船合并网格），无明显未合并静态几何的低垂果实。

**量化数据**：构建产物 `dist/index.html` 947.9 KB（minified 单文件）；沙漠场景网格数/导航节点数不变（本波零几何改动，e2e 97/97 可达断言原样通过）。

## 5. hud.js 勘误闭环（P3-2）与 P3-1 残余记录

- **P3-2 已修**：hud.js 原 416-417 两行过时勘误注释（「chooseLoadout 的出生区即时生效分支不经 onSwitch……」）改为单行：
  `// chooseLoadout onSwitch 同步已由 game.js 修复（原 P2-1 勘误，phase-5 复核为已接受残余后闭环）。`
- **P3-1（displayMode 镜像 startMatch 声明过宽）按授权不改逻辑**，在此记录为**已接受残余**：URL 携带非法/不支持 mode 且已存模式合法时，实际开局落地图默认（game.js:293-294），而菜单高亮取已存值（hud.js:97-102/275）→ 仅菜单高亮与实际不一致，手输 URL 边缘场景、无玩法影响。如需闭环：displayMode 的回落分支改为跟随 startMatch 的 `requested || o.mode` 解析序（归 Game/HUD 域后续波次，连带 hud-mode.test.mjs:56 用例注释与 hud.js:260 注释一起改）。

## 6. 验证结果

| 项 | 结果 |
|---|---|
| `node --test tests/unit/*.test.mjs` | **223/223 通过** |
| `npm run build` | 通过，dist/index.html 947.9 KB |
| `node scripts/e2e-desert.mjs` | **34/34 通过**（`artifacts/e2e-desert-results.json` 本波运行重新生成） |
| `node scripts/e2e.mjs` | **21/21 通过** |
| 三档对比截图 | `artifacts/dg-vis/p6-final-{high,medium,low}-{overview,aLong,bSite,bTunnelLower}.png`（12 张；参数实测 threshold=8 / skyGain=0.5） |
| 校准与对照 | `p6-calib-*`（6 张扫参）、`p6-gr-*`（6 张地面对照）、`p6-ship-*`（海图前后对照） |

**真机 GPU 渲染器信息**（有头 Chrome，非 headless，供 E 波性能验收参考；本报告不声称 FPS）：
- vendor：`Google Inc. (Intel)`
- renderer：`ANGLE (Intel, ANGLE Metal Renderer: Intel(R) UHD Graphics 630, Unspecified Version)`
- WebGL2；MAX_TEXTURE_SIZE 16384；MAX_VIEWPORT_DIMS 16384x16384
- 真机 GPU 高画质总览截图：`artifacts/dg-vis/p6-gpu-high-overview.png`（与软渲染观感一致）
- 建议后续性能实测在本机（Intel UHD 630，1080p 中画质 ≈60fps 为优化目标）由 E 波性能 lane 完成。

## 7. 改动文件清单

| 文件 | 改动 |
|---|---|
| `src/render.js` | bloom threshold 3.2→8 + 依据注释 |
| `src/env.js` | desertDay/desertDusk skyGain 0.25/0.3→0.5/0.45 + 注释更新；apply() PMREM 去重（+6 行） |
| `src/audio.js` | 新增 `playFlashPop`/`playSmokePop`（待 Game lane 一行接线，见 §3） |
| `src/hud.js` | 仅 1 行注释勘误（P3-2） |
| `.ultra/reports/phase-6-polish.md` | 本报告 |
| `artifacts/dg-vis/p6-*.png` | 校准/对照/终版三档截图 + 真机 GPU 截图（~30 张） |

未触碰：game.js/player.js/bots.js/modes/maps 几何/physics/navigation/registry。未提交；未调用子代理。
