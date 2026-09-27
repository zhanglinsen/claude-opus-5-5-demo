# 视觉整合波报告：env 兜底 + 终版证据 + 性能门禁（visual-plan.md §3.1 收口）

日期：2026-09-27。本波只编辑 `cf-transport-ship/src/env.js`（desertDay 两个参数）与本报告；desert-grey.js / desert-grey-materials.js 冻结未动。未提交 git。

## 1. env 兜底落地与 dusk 决策

| 参数（env.js desertDay） | 前 | 后 |
|---|---|---|
| hemiSky | 0xdfe8f0（冷蓝白） | **0xe8e2d0**（暖沙灰） |
| envInt | 0.32 | **0.26** |

`npm run build` 通过（dist 952.0 KB）。

**desertDusk 决策：不动。** dusk 评估帧 `p7-after-dusk-aLong-eval.png`（dev 侧 `env.apply('dusk')` 后拍摄）显示 dusk 半球光 `0xe0a880` 本就偏暖，墙面无残蓝，天空/云正常渲染暖橙。仅在 day 档残蓝成立。

**A/B 排障记录**：排障期间曾将两个参数临时还原并重建（验证菜单超时与 env 无关，见 §6），确认无关后已恢复整合值并重建、重拍全部终版截图——当前 dist 与 p7-after-* 截图严格对应。

## 2. 终版像素对比（复用 lane M 纯 Python PNG 均值法，同机位同区域）

四阶段：p6-final（视觉波次前）→ p7-m（M 材质）→ p7-d（M+D 装饰）→ p7-after（M+D+env 兜底，本波终版）。

| 采样区 | p6 | p7-m | p7-d | **after** | 目标 |
|---|---|---|---|---|---|
| aLong 左墙（背光）R−B | −51.3 | −30.6 | −30.7 | **−28.0** | ≤15 ❌ 未达标 |
| aLong 右墙（向阳）R−B | −17.3 | +2.4 | +2.3 | **+5.0** | 中性微暖 ✅ |
| bSite 左墙 R−B | −20.9 | −3.6 | −3.6 | **−1.1** | ✅ |
| aLong 地面 R−B / R/G | +20.8 / 1.024 | +20.1 / 1.023 | +21.5 / 1.026 | **+25.6 / 1.035** | 不过黄 ✅ |
| bSite 地面 R−B / R/G | +30.1 / 1.037 | +29.4 / 1.036 | +29.4 / 1.036 | **+33.6 / 1.044** | ✅ |

分档一致性（aLong 同区域，before → after）：low 背光 −50.8 → −27.5、向阳 −17.3 → +4.6；high 背光 −51.5 → −28.3、向阳 −17.4 → +5.1。三档趋势一致，改动为材质/环境侧、档位无关。

**门禁结论（残蓝）**：背光面 |R−B| = 28.0 > 15，**未达标，如实记录**。分析：hemiSky 暖化（R−B −17→+24）与 envInt −0.06 的合计贡献仅 ≈+2.6，说明该面残蓝主因不是半球光/env 强度，而是①ACES+0.55 曝光对暗部的色彩压缩、②该面主要受天空 PMREM 环境反射（envMap 仍是蓝天）主导——envInt 需要降到 ≈0.1 或给 desert 档单独的环境图染色才能达标，但这会显著压暗洞内补光，超出本波「两个参数」授权，**留待后续波次决策**。整体不偏黄过暖 ✅（R/G 全部 ≤1.044）。

## 3. 终版截图（artifacts/dg-vis/，12 张 + manifest）

| 文件 | mtime |
|---|---|
| p7-after-medium-{blSpawn 12:54:05, backGarden 12:54:20, overview 12:53:54, aLong 12:54:31, midDoors 12:54:43, bSite 12:54:54, bTunnelLower 12:55:06}.png | 本波终版 |
| p7-after-low-{overview 12:55:55, aLong 12:55:59}.png、p7-after-high-{overview 12:56:41, aLong 12:56:52}.png | 对照组 |
| p7-after-dusk-aLong-eval.png 12:55:31、p7-after-manifest.json 12:56:55 | dusk 评估 / 清单 |

目视确认：墙基条带、门框/门洞 AO、道路磨损贴花、B洞横梁均生效；远景已成组连片（孤立白盒感消除）；backGarden 首次建立基线。重拍脚本 `reshoot-p7-final.mjs`（含 dusk 评估帧逻辑）。

## 4. 性能门禁（真机 GPU，有头 1080p 中画质，串行执行）

`node scripts/accept-gpu.mjs`（两图各 65s，AMD Radeon Pro 5500M）：

| 图 | median | P5 | 基线 | 判定 |
|---|---|---|---|---|
| 沙漠灰爆破 | **60** | **60** | 60 / ≥55 | ✅ |
| 运输船 TDM | **60** | **58** | 60 / 59 | ✅ 无实质回退 |

运输船 P5=58 vs 基线 59：样本全部 ≥58、无 <30 低帧样本、median 60——P5 指标取第 2 低样本，2s 粒度下 1 帧 vsync 量化差，判噪声不判回退。

**renderer.info 现状**（`artifacts/dg-ref2/perf-probe.mjs`；`info.render.calls/triangles` 因 post-processing 多 pass 每 pass 重置恒为 1，改用场景静态统计，真机/软渲染数字相同）：

| 指标（medium） | 数值 | 预算 |
|---|---|---|
| 场景三角形 | 70,082（49 mesh） | ≤110k ✅ |
| dg- 材质合批 | 15 个（含 D 新增 dg-ao/plasterBase/stoneTrim/sandPath 与 plasterB#0/#1 象限拆分） | ≤16 ✅ |
| textures / geometries | 78 / 81 | ≤80 / ≤100 ✅ |

## 5. 重开复验与长跑

**`accept-restart-check.mjs`（10 次重开）— 严格判定 pass:false，实质无泄漏，如实记录两轮**：
- 第 1 轮：textures [99,98,98,101,97,98,97,88,98,98]，geometries 恒 154，drift **−3.7**，growthSteps=1，pageErrors 0。
- 第 2 轮：textures [97,99,101,97,98,98,98,99,97,101]，geometries 恒 154，drift **0.0**，growthSteps=1，pageErrors 0。
- 判 false 的唯一条件是单步 >+3（97→101 = +4）；纹理计数在 ±4 带内抖动（GC/懒上传），无单调增长、geometries 逐位恒定、drift ≤0——**装饰 batch 未引入泄漏**，但脚本阈值与抖动带宽过于接近，建议后续把阈值放宽到 ±5 或改用 drift+geometries 双条件（脚本不在本波授权内，未改）。

**`accept-longrun.mjs`（600s 真渲染 + 同页 10 次重开）— 通过（exit 0）**：120 样本，median 60 / p5 56 / min 41，0 page errors、0 console errors；同页重开 10 次 geometries 恒 154、textures 102–105 平坦、heap 29–54.7MB 呈 GC 锯齿无斜率（首 3 均值 39.9 → 末 3 均值 42.4，+2.5MB/10 次重开 ≈ 噪声）。

## 6. e2e 回归

| 套件 | 结果 |
|---|---|
| `e2e-desert.mjs` | **34/34 通过**（运行两次均全绿） |
| `e2e.mjs` | 第 1、2 次在不同步骤超时（`#menu:not(.hidden)` 等待），第 3 次 **21/21 通过**——偶发环境问题，失败点漂移，非确定性回归 |
| `e2e-bomb.mjs` | **❌ 3/3 在同一断言确定性失败**：「默认开局：玩家 id 0 在 BL 且经规则引擎拿到 C4」——`{"pid":0,"team":"BL","carrierId":0,"carrying":false}`（bomb 已分配给 id0 但 player.carryingC4=false） |

e2e-bomb 排障结论（超出本波修复授权，如实移交）：
- **已排除本波 env 改动**：A/B 测试（还原两个参数后重建重跑）失败依旧。
- **已排除视觉 lane 文件**：失败场景为默认图（运输船）爆破，不加载 desert-grey.js / desert-grey-materials.js。
- **时间线**：e2e-bomb 上次绿记录为 03:40（36/36，artifacts/e2e-bomb-results.json）；其后 game.js（09:07 改动）、bots.js、modes 等玩法文件被六阶段后续波次修改，e2e-bomb 在 09:14 交付收口时未再复跑。断言矛盾（carrierId 已指派 id0 但 carryingC4=false）指向开局赋包时序在两个赋值点之间被后续改动拆开，需归属 lane 在 game.js/modes 侧定位修复。
- 建议修复后重跑 e2e-bomb + e2e.mjs 各两次确认稳定。

## 7. 交接口径

- 本波代码变更：env.js desertDay 两个参数（±说明注释）。
- 视觉目标：向阳/侧墙中性微暖、地面不过黄、远景成组、立面构件齐全——已达成；背光面残蓝 −28 未达 ≤15，需环境图染色/曝光侧的后续授权项。
- 性能：沙漠灰 60/60、预算内（70k tris/15 合批/78 纹理）、重开无泄漏（实质）、600s 长跑 0 异常——达标。
- 遗留：①背光面残蓝环境侧深改；②restart-check 阈值放宽；③e2e-bomb id0 携包断言回归（归属 lane）；④e2e.mjs 偶发菜单超时（同一浏览器进程多页面 SwiftShader 资源，建议 driver 侧逐段隔离）。
