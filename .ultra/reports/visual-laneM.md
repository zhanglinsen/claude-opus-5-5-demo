# lane M 报告：沙漠灰材质（visual-plan.md §3.1 M1–M5）

日期：2026-09-27。只编辑了 `cf-transport-ship/src/maps/desert-grey-materials.js`（+新增截图脚本与探针均在 artifacts/，非产品代码）。未提交 git。e2e-desert **34/34 通过**。

## 1. 改动点（函数 / 参数前后值）

### M1 暖化底色
| 位置 | 前 | 后 |
|---|---|---|
| `plaster()` 默认 base（:71） | `[216,211,198]` | `[206,194,170]`；且蓝通道统一 ×0.96（`d[i*4+2]=base[2]*k*jk*0.96`）抵消冷光 |
| `plasterB` def（:397） | `plaster(..., [198,191,174], 0.5, 9115)` | `plaster(..., [184,170,144], 1.2, 9115)` |
| `concrete()` 底色（:186-188） | `168,162,150` | `176,166,146` |
| `sand()` 色斑幅度（:55） | `k = 0.84 + v*0.2 + …` | `k = 0.84 + v*0.26 + …` |

### M2 砌块行缝 / 竖缝
- `plaster()`：加入弱化版 stone 错缝行缝——`rows=4`（uv=3m 内约 4 行）、块宽 2×行高、错缝半块；缝处色差 −8%（`jk=0.92`）、高度场凹 `0.1`、粗糙度 +0.06。水渍/裂缝/起皮数量随默认 `wear` 1→1.4 自动加密。
- `concrete()`：模板缝由「十字半分」改为「横缝居中 + 四条竖缝（五分点）」，缝色 −7%（`seamK=0.93`）、两侧 2px 微倒角（渐变压暗 + 高度场斜坡）。

### M3 `sandPath`（道路面）
`sand()` 参数化为 `sand(S, useNormal, {tone, rough, pebbles, ruts, seed})`，新键：`{ tone:0.92, rough:0.8, pebbles:12, ruts:true, seed:9201 }`，`uv:3`，normalScale 0.45。车辙带 = 噪声扰动的横向正弦暗带（色 −22%、高 −0.18）。

### M4 `plasterBase`（墙基）
`plaster(..., [161,151,133], 1.8, 9220, 0.94)`（= plaster 底 ×0.78，wear 1.8，roughBase 新参 0.86→0.94），`uv:3`，normalScale 0.55。

### M5 `stoneTrim`（规整石作）
`stone()` 参数化为 `stone(S, useNormal, {rows, tone, toneVar, mortar, seed})`（原 9120/9121/9122 种子改为 seed 基准）。新键：`{ rows:4, tone:178, toneVar:36, mortar:126, seed:9210 }`，`uv:2.4`，normalScale 0.8。

**种子纪律**：新增全部落在 92xx 段（9201/9210/9220），与既有 91xx 不冲突；所有纹理种子固定，截图可复现。**分档不变**：S=128/256/512，low 无 normalMap。

## 2. 纹理计数（前 67 → 后 68，上限 80）

| 指标（medium，探针实测） | 前 | 后 | 预算 |
|---|---|---|---|
| renderer 纹理数 | 67 | **68** | ≤80 ✅ |
| geometries | 78 | 79 | ≤100 ✅ |
| meshTris | 68,582 | **68,582（不变）** | — ✅ |

说明：新增 3 键虽构建了 CanvasTexture，但 three.js 只统计**实际绑定渲染**的纹理；lane D 尚未消费这些键，故运行时计数仅 +1（噪声级）。即新材质运行时成本为零，lane D 启用后 medium 档最多 68+9=77 张，仍在 80 内——**stoneTrim 无需降级为 stone+tint**。low 档 48 张（新键各 +1 漫反射）。

## 3. 验证截图（同机位前后对比）

重拍脚本：`artifacts/dg-vis/reshoot-p7m.mjs`（desert-visual-shots.mjs 裁剪变体，独立 manifest，不覆盖原文件）。

| 文件（artifacts/dg-vis/） | mtime |
|---|---|
| p7-m-medium-aLong.png / -bSite.png / -grSpawn.png | 11:20:26 / 11:20:37 / 11:20:44 |
| p7-m-low-aLong.png / -bSite.png / -grSpawn.png | 11:21:00 / 11:21:05 / 11:21:09 |

目视：砌块行缝在 medium 与 low 均清晰可读（A 大两侧墙、B 区围墙面），low 档漫反射保底辨识度成立。

**像素采样客观对比**（纯 Python PNG 解码，同机位同区域均值；before=p6-final-*，after=p7-m-*）：

| 采样区 | | R−B | R/G |
|---|---|---|---|
| aLong 右墙（向阳） | before → after | −17.3 → **+2.4** | 0.931 → 0.959 |
| bSite 左墙 | before → after | −20.9 → **−3.6** | 0.933 → 0.951 |
| aLong 左墙（背光） | before → after | −51.3 → −30.6 | 0.778 → 0.796 |

结论：albedo 暖化 + 蓝通道 ×0.96 使向阳/侧墙面已回到中性微暖（R−B≈0）；**背光面仍偏蓝（−30）**，来源是 desertDay 冷色半球光（hemiSky 0xdfe8f0）+ 蓝天环境反射——即计划 §3.1 M1 预留的 env.js 兜底项（`hemiSky→0xe8e2d0`、`envInt 0.32→0.26`）。按 lane 边界未动 env.js，**建议批准后由 env 侧单独执行或并入 lane D 波次**。

## 4. e2e 结果

`node scripts/e2e-desert.mjs`：**34/34 通过**（含运输船冒烟回归 2 项）。材质键新增/参数变化未影响碰撞与导航（meshTris 与改动前逐位一致 68,582，布局数据未触碰）。附带产物：`artifacts/desert-landmark-*.png` 已由该流程刷新为当前状态。

## 5. 遗留 / 交接

1. 背光面残蓝 → env.js desertDay 兜底（见上，需批准）。
2. `sandPath/plasterBase/stoneTrim` 三键已就绪待 lane D 消费（接口与 §3.3 约定一致：id/uv/种子段均按计划）。
3. 重拍截图左下角 HUD 地图名显示「运输船」（pause 时机早于 HUD 更新所致，p6 系列同脚本此前显示正常）——纯 HUD 标签时序瑕疵，不影响几何/材质判定，未处理。
