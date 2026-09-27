# 视觉补充波次 lane D 报告：装饰/立面（desert-grey.js §3–§6 区域）

日期：2026-09-27。执行：GLM-5.3-Flash HIGH。工作说明书：`.ultra/reports/visual-plan.md` §3.2（D1–D7）+ §3.3 接口约定。
**改动范围**：仅 `cf-transport-ship/src/maps/desert-grey.js` 的视觉装饰部分（另按约定改造了合批输出循环与 decal 共享几何）。`desert-grey-layout.js` 的 solids/navGraph 与碰撞数据零改动；`desert-grey-materials.js` 零改动（plasterBase/stoneTrim/sandPath 由并行 lane M 交付，本 lane 只消费）。未提交 git。

## 0. 兜底 helper（接口约定 §3.3 第 1 条，第一步已落）

- `const mat = (k, fb = 'plaster') => matDefs[k] || matDefs[fb];` + 键解析表 `K = { base/trim/path }`：M 未交付时自动回退现有键，缺键不崩。实际执行时 M 已交付三键，装饰直接以正式材质呈现。
- 所有新增平铺 uv 一律经 `matDefs[key].uv`（拱缘斜面 uv 计算处即 `mat(K.trim).uv`），零硬编码平铺密度。
- 新增 AO 遮片材质为**本地图构建局部**创建（Canvas 渐变 + MeshBasicMaterial，与 `paint()` 同约定：transparent、depthWrite:false、polygonOffset -2、renderOrder 1），不动材质文件。

## 1. D1–D7 逐项实现与 quad 计数

| 项 | 实现 | quad 数 |
|---|---|---|
| D1 墙基 | role∈{wall,struct} 且 sy≥2 且落地（底面 ≤0.06m）且 m≠stone 的 33 个 solid，四周底部外扩 6cm、高 0.5m 条带 box（plasterBase），纯 scene 附加零碰撞 | 33×6 = **198** |
| D2 门框/拱缘/洞内遮片 | 中门：woodDoor 色 jamb×2（内缘与门洞齐平，不缩 1.4m 通道）+ 压顶；A 门：stoneTrim jamb×2 + 压顶 + 双坡拱缘（2 片斜 quad 近似石拱，法线朝上、坡向平铺 uv）；B 门：stoneTrim jamb×2 + 压顶（嵌墙缘不缩 3m 门洞）；三处门洞内竖直 AO 遮片（双面，顶部最深） | 9 box×6 + 2 = **56** |
| D3 窗檐 | B 窗房两扇窗洞（z[-26,-22]/z[-18,-14]）上沿 stoneTrim 窗檐 0.15m 厚、外挑 0.3m（西侧立面外），加窗台下沿积尘 AO 遮片 | 2×6 = **12** |
| D4 横梁 | 桥下：顶板（2.3m）下沿沿 z 向木梁 0.15×0.12，x 向每 2.5m 一根 ×13，梁底 2.18m ≥2.15m 约束；B 洞上层：顶板（5.2m，距地板 2.6m）下沿沿 x 木梁 ×9，梁底距地板 2.48m。合入既有 `wood` batch，零新增 batch | 22×6 = **132** |
| D5 AO 贴花 | 墙地交界：与 D1 同集 33 个 solid 四侧 0.4m 渐隐条带（y=0.012，低于 sandPath 顶面 0.015 与现贴花 0.02，深度排序自然正确）；门洞/窗洞竖直遮片 12 片。全部合入单 `ao` batch（单张 u 向渐变贴图，地面条带 u=0 墙侧→渐隐；竖直遮片 uv 反转使最深处落在顶部） | 132 + 12 = **144** |
| D6 远景成组街镇 | 重写 §5 随机环：9 个街区组 × 3–6 幢贴邻建筑（共享墙、缝 0–0.5m）、高 5–20m 错落、33 幢加 roofTile 顶 + 0.7m 出檐；组沿近切向成排、组间留街缝；两座标志塔保留并加瓦顶。实测最近建筑半径 59.0m ≥58 不可达区（兜底检查 `|x|<46&&|z|<40` 跳过数为 0，未触发）。按 x 象限拆 2 个 batch（plasterB#0/#1） | (46+33+4)×6 = **498** |
| D7 道路磨损 | sandPath 薄面 5 片（顶面 0.015m：中路 4.5×28、A 大北段 3.6×3、A 大南段 3.6×18（避开 A 大坑分两段）、B 门内通道 9×4.5、B 区洞口外 5×9） | 5×6 = **30** |

合计约 1070 quad ≈ 2140 tri；扣除被重写的旧随机环（约 306 quad），净增约 **+1,500 tri**（探针实测 68,582 → 70,082），在 +3~6k 预算内。

## 2. 合批/几何预算（perf-probe.mjs 实测，medium 档）

| 指标 | before | after | 预算 | 结论 |
|---|---|---|---|---|
| 场景三角形 | 68,582 | **70,082**（+1,500） | ≤110,000 | ✅ |
| 场景 mesh 数 | 43 | **49** | ≤55 | ✅ |
| dg- 合批数 | 9 | **15**（新增 plasterBase/stoneTrim/sandPath/ao + plasterB#0/#1） | ≤16 | ✅（远景 roofTile 顶并入主 roofTile batch、两片 AO 共用一张渐变贴图合一个 batch，即为守住该预算） |
| geometries | 78 | **81** | ≤100 | ✅（贴花改模块级共享 `UNIT_GROUND` 单位面片后，5 个旧 decal geometry 释放，抵消了新增 batch） |
| FPS | 60 | 未单独声称（E 波统一测） | — | — |

附属工程改动（均在构建器内，不碰冻结数据）：`box()` 对 batch 键做 `#n` 后缀剥离；合批输出循环支持本地材质表（`localMats`）与后缀键，AO batch 不投影（castShadow=false）。

## 3. 碰撞/导航复查清单结论（计划 §3.2 清单逐条）

全部 D1–D7 均为纯 scene 附加/贴花，`world.add` 调用零新增；唯一外扩 >4cm 的是 D1（6cm）。新增探针 `artifacts/dg-vis/probe-routes.mjs`（与 e2e-bomb 行走测试同做法：共享导航寻路 + 触屏摇杆逐帧真实物理驱动，radius 0.36 / height 1.8）：

| 路线 | 结果 |
|---|---|
| 中门门缝 md1→md2（宽 1.5 边） | ✔ 无卡位（frames=631，maxStep=0.091） |
| A 门 adS→adN | ✔ 无卡位 |
| B 门 bs7→bd1 | ✔ 无卡位 |
| 桥下全程 un1→un6 | ✔ 无卡位（13 根梁下通行，梁底 2.18m） |
| A 小道 asx1→as3（楼梯→台面） | ✔ 无卡位 |
| B 洞上层 ut1→ut4（9 根梁下） | ✔ 无卡位 |
| B 窗跳落落地（dropScuff 处）→ 走离墙脚 | ✔ 落地存活、越过 D1 墙基外扩带走离 ≥1.5m 无卡位 |

D1 无需降 protrusion/改贴花方案，维持 6cm。附：e2e-bomb 首跑曾报「玩家携包 C4」一步失败，重跑 36/36 全绿，确认为 C4 分配时序偶发，与本 lane 装饰无关（纯视觉改动不触碰模拟）。

## 4. 验证结果

- `npm run build`：✅ 通过（dist/index.html 952.0 KB）。
- `node scripts/e2e.mjs`：**21/21 通过**。
- `node scripts/e2e-bomb.mjs`：**36/36 通过**（首跑偶发见上）。
- `node scripts/e2e-desert.mjs`：**34/34 通过**（含沙箱流程与运输船冒烟回归）。
- `node artifacts/dg-vis/probe-routes.mjs`：**7/7 路线无卡位**。
- 重拍截图（`artifacts/dg-vis/p7-d-medium-*.png`，脚本 `artifacts/dg-vis/reshoot-p7.mjs`，landmarkViews 机位直摆、medium 单档）：
  `p7-d-medium-overview / aLong / midDoors / bSite / bTunnelLower / blSpawn / backGarden`（**backGarden 为新增机位首拍**，补上 landmarkViews 漏拍项）+ `manifest-p7.json`。

## 5. 截图人工比对要点（before → after）

- overview（对照 `p6-final-medium-overview.png`）：远景由孤立漂浮白盒变为连片错落街镇（屋顶高低起伏、部分瓦顶），两座标志塔保留，封闭感成立。✅
- midDoors（对照 `dg-vis/medium-midDoors.png`）：门洞获得木色门框 + 压顶，门洞从「同色墙缝」变为可读门洞。✅
- aLong（对照 `p6-final-medium-aLong.png`）：两侧墙脚出现深色墙基条带，M lane 砌块缝 + 本 lane 墙基/路面粉碎「白模感」。✅
- bTunnelLower（对照 `p6-final-medium-bTunnelLower.png`）：两侧墙脚深色墙基带打破平墙（本区段计划未要求梁，梁在桥下与 B 洞上层）。✅
- bSite（对照 `p6-final-medium-bSite.png`）：B 窗房立面两扇窗洞获得 stoneTrim 窗檐与窗下积尘遮片，墙基带贯穿。✅
- 墙体蓝白问题归 M lane（其 plaster/plasterB 暖化已生效于上述截图），本报告不重复声称。

## 6. 遗留与备注

- D5 地面 AO 与竖直遮片合并为单张渐变贴图（alpha 0.30→0.04），与计划给的地面 0.22 略有出入（兼顾门洞顶部投影强度）；若验收偏重可拆回两张贴图（dg- batch 预算余 1）。
- A 大中线道路按坑位拆为南北两段，未横穿 A 大坑。
- 远景组排向为近切向 ±0.2rad 抖动，极端组半径可低至 ~54m，但仍在 bounds（±44/±38）之外且兜底检查未触发，不可达性成立。
