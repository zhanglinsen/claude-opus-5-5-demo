# E 波验收后定向修复轮 — 最终收口

执行：GLM-5.3-Flash HIGH。日期：2026-09-27。改动文件：`src/game.js`（纹理泄漏修复）、`README.md`（操作说明章节）。**未改** maps/registry/map.js/env.js（FPS 项经定位后无需改动，见 §2）。未提交。

## 1. 纹理泄漏（acceptance §3）— 已修复，探针红→绿

### 定位过程（三步二分，全部探针留档）

1. **红**：新增 `scripts/accept-restart-check.mjs`（10 次同页重开 × 2.5s 沉降，采 `renderer.info.memory.textures`）。修复前：**112 → 229 单调 +13~14/次，drift +90.7，fail**。
2. 第一修（tags 名牌 CanvasTexture dispose，startMatch/quitToMenu 两处清理点）只消掉 +2~3/次（112→207，仍 fail）→ 主泄漏另有源头。
3. **二分定位**：分系统禁用探针（HUD/机器人/vm/env/fx/map.update/阴影/冻结 simulate 逐项关闭，delta 恒 +11~16）+ 场景纹理枚举（每局场景内仅新增 5 张 256×48 名牌纹理）+ `character.js` 走读 → **根因：每士兵一张 `SkinnedMesh + Skeleton`，three.js 渲染器首帧为其惰性分配 `skeleton.boneTexture`（DataTexture），`scene.remove` 不触发释放** → 11 个角色/局 ≈ +11 张，与实测吻合。附加特征解释了此前所有疑点：资源在 startMatch 创建、**首次渲染时才上传计数**（同步探针无帧 → 看似平坦）。

### 修复

`src/game.js` 模块级新增 `disposeActorGpu(a)`（释放 `soldier.mesh.skeleton.boneTexture`），接入 startMatch 与 quitToMenu 两处 actor 清理循环；连同 tags 名牌 `material.map/material.dispose`（材质/几何为共享缓存，无需处理）。

### 绿

```
textures: 98, 97, 98, 100, 99, 97, 98, 97, 98, 101
monotonicGrowth=false  growthSteps=0  first3=97.7  last3=98.7  drift=+1.0  pass=true
```

产物：`artifacts/accept-restart-check.json`。

## 2. 运输船 1080p 中画质 45fps — 测量污染更正，达标（60fps），无需产品改动

- **过时归因更正**：acceptance 报告沿用 phase-4 的 bloom 阈值 3.2 归因；收口版 render.js 阈值已是 **8**（phase-6-polish §1），45fps 是阈值 8 下测得 → 另有原因。
- **真实原因：测量污染**。时间线复盘：两次 accept-gpu 运行（07:51-53）与 accept-bomb-seeded 第二轮（07:47-52，多场无头爆破满载模拟）**并发执行**，CPU/GPU 争用拉低运输船读数至 median 45 / P5 37。
- **干净环境复测**（修复后 dist，单独执行）：`node scripts/accept-gpu.mjs` →
  - 沙漠灰爆破：median **60** / P5 57 / min 0（暖机样本）
  - 运输船 TDM：median **60** / P5 **59** / min 0
- **删减法探针**（`scripts/accept-gpu-probe.mjs`，1080p 中画质、基线/藏海面/pixelRatio 1/关阴影/复原各 20s）：全部状态 median **60** —— 海面 shader、阴影、像素比均有充足余量，瓶颈不在渲染侧。
- **决策**：FPS 达标，海面/阴影/海面网格参数**一律不动**（最低风险 = 零改动；避免为不存在的瓶颈引入画质风险）。验收报告的 45fps 结论由本报告更正为"测量污染，干净环境 60fps 达标"，数据以本次 `artifacts/accept-gpu.json` 为准。
- 诚实备注：本机 GPU 为 **AMD Radeon Pro 5500M**（acceptance 报告沿用提示中 Intel UHD 630 的假设与实测不符，已更正）；60fps 为 vsync 锁定值，代表"不低于 60"，无法区分余量大小，但删减法探针表明余量充足。

## 3. README 操作说明 — 已补

`cf-transport-ship/README.md` 新增「操作说明」章节：基础键位表（与 HTML 菜单键位区逐条一致：WASD/Shift/蹲跳/开火/开镜/R/F/Q/滚轮/1234/4 号投掷物轮换/5 C4/E 拆包拾取/G 丢包/B 换包时机/Tab/Esc）、模式与地图说明（运输船 TDM、沙漠灰爆破 5v5 先赢 7 回合、练习模式规则、URL 参数）、军衔与装备（XP 结算/去重/练习不计入、三套预设、localStorage 持久化与降级、投掷物 3 型轮换）、触屏按钮说明。

## 4. 回归结果（全部通过）

| 项 | 结果 |
|---|---|
| `node --test tests/unit/*.test.mjs`（glob） | **223 pass / 0 fail** |
| `npm run build` | `built dist/index.html 948.2 KB` |
| `node scripts/e2e-bomb.mjs`（game.js 改动必跑） | **36/36** |
| `node scripts/e2e-wiring.mjs`（game.js 投掷物/练习路径） | **16/16** |
| `node scripts/e2e.mjs`（含 file:// 与菜单/重开路径） | **21/21** |
| `node scripts/e2e-desert.mjs`（含运输船冒烟，覆盖 dispose 改动） | **34/34** |
| `node scripts/accept-restart-check.mjs` | **pass**（textures 98±2，drift +1） |
| `node scripts/accept-gpu.mjs` | 沙漠灰 60 / 运输船 60（P5 57/59） |

## 5. 状态

候选版最后一轮产品改动完成。改动总量：game.js +14 行（disposeActorGpu + 两处接入 + tags dispose）、README +40 行、新增验收脚本 2 个（accept-restart-check.mjs / accept-gpu-probe.mjs，后者为测量工具留档）。工作树未提交，待协调者重跑受影响验收（accept-restart-check / accept-gpu / e2e 套件）后交最终独立审核。
