# 沙漠灰视觉对照计划（lane P：视觉补充波次）

日期：2026-09-27。任务：对照真实 CF 沙漠灰参考图与本地截图，产出差距对照与两条并行 lane（M 材质 / D 装饰立面）的精确工作说明书。
**本计划不改任何 src 产品代码**；仅下载参考图到 `cf-transport-ship/artifacts/dg-ref2/`（仅供开发目视对照，绝不进运行时资源）、新增了一个只读探针脚本 `artifacts/dg-ref2/perf-probe.mjs`。未提交 git。

---

## 0. 参考图下载记录（真实来源）

| 文件（cf-transport-ship/artifacts/dg-ref2/） | 来源 | 内容 | 状态 |
|---|---|---|---|
| ref1-overhead.jpg | https://ol.3dmgame.com/gl/15988.html | 沙漠灰俯视图（即布局注释引用的 olimg 1521711094） | ✅ 需 Referer 头，首次 403 已重试成功 |
| ref1-callouts.png / ref1-extra.png | 同上 | 俯视图标注版 / 剖视 | ✅ 与旧 dg-ref/fp.png、dg-ref/map3.png 同源，互为备份 |
| ref2-a01…a06.jpg（6 张） | https://cf.17173.com/content/2015-09-06/20150906102425658.shtml | A 区/通道木箱与光照系列 | ✅ 全部下载；目视核对了 a01（B区木栅栏+顶棚木梁）、a03（中央大厅砌块墙+内凹木门）、a05（中央大厅大墙+石拱门洞）；a02/a04/a06 已下载未逐一目视 |
| ref3-wall01.jpg / ref3-wall02.jpg | https://cf.17173.com/content/2015-03-04/20150304095540179_2.shtml?_platform=PC | 经典墙体与门洞（GR 基地 / B 区石拱） | ✅ 下载并目视 |

三个页面均拉取成功，无编造参考。目视归纳的参考图核心特征：

- **R1 墙体**：暖灰褐石砌/砌块错缝墙，逐块明度差明显（块面约 rgb(200,192,175)，凹缝约 rgb(140,135,120)），墙面有水渍与破损但整体是「暖」的；本地当前是近中性冷白。
- **R2 门洞**：内凹门洞 + 深色木门/石拱，洞口周边有强调（门框、拱缘、洞内阴影）。
- **R3 立面构件**：木横梁顶棚（梁间透光）、波纹金属/瓦屋面、出檐、窗檐、墙基深色带。
- **R4 布局密度**：俯视图中主体建筑与周边街镇是**连片**的，屋顶高度错落；本地远景是一圈孤立立方体。

---

## 1. 对应表（区域 ↔ 参考特征 ↔ 本地截图 ↔ 一句话差距）

| 区域 | 参考图特征 | 本地证据（现状截图） | 现状 vs 参考差距 |
|---|---|---|---|
| 潜伏者出生点 | ref1-overhead 南侧院落：建筑贴出生区、有院墙与店面层次 | `desert-landmark-blSpawn.png`（09:20）、`dg-vis/medium-blSpawn.png` | 前方是一整块无分缝冷白长墙 + 空旷沙地，参考中出生区紧邻建筑且立面有门窗与色块节奏 |
| 后花园 | ref1-overhead 东南密集连片屋顶群 | **无专用截图**（`desert-visual-shots.mjs` 的 LANDMARKS 列表漏了 backGarden，landmarkViews 里有机位） | 俯视/远看为空地+孤立白盒；先补拍再验收 |
| A 门 | ref3-wall02 石拱门洞 + ref2-a03 内凹木门 | `dg-vis/medium-aDoor.png` | 门洞为直角开洞，木门半开但无门框/拱缘/洞内阴影强调，门洞与墙面同色 |
| A 大 | ref2-a03：砌块错缝大墙 | `desert-landmark-aLong.png`、`p6-final-medium-aLong.png` | 两侧墙为冷蓝灰整块直角平面，纹理 3m 平铺可见重复水印，无墙基/檐口线脚 |
| A 平台（包点） | ref1-overhead A 区：平台上有掩体与高差立面 | `desert-landmark-aPlatform.png`、`dg-vis/medium-aPlatform.png` | 平台立面是冷白直角大面，只有统一 roofTile 顶板，无女儿墙压顶/墙基 |
| A 小道 | ref2 系列通道：墙+箱+顶棚节奏 | `dg-vis/medium-aShort.png` | 高台两侧整块平墙，无横梁/遮片，通道无明暗节奏 |
| 中门 | ref3-wall01：暗门洞+木门 | `desert-landmark-mid.png`、`dg-vis/medium-midDoors.png` | 双木门存在但嵌在同色墙缝里，无门框/雨棚，远看门洞几乎不可读 |
| 桥下 | ref2-a01：顶棚木梁架透光 | `desert-landmark-underpass.png`、`dg-vis/medium-underpass.png` | 顶板为平整冷灰混凝土，无横梁与局部补光对比，通道均匀死灰 |
| B 洞上层 | ref2-a01 顶棚梁架 + 砌块墙 | `dg-vis/medium-bTunnelUpper.png` | 同上：平墙平顶，无立面构件，冷色 |
| B 洞下层 | ref2-a05：大墙微色斑+拱洞 | `desert-landmark-bTunnelLower.png`、`p6-final-medium-bTunnelLower.png` | 两侧冷蓝平墙 + 顶板黑压，唯一层次来自点光源，无材质层 |
| B 门 | ref3-wall01：暗门洞 | `dg-vis/medium-bDoor.png` | 木门板与墙同缝直角，无框无洞内阴影 |
| B 窗 | ref2 系列窗洞+窗檐 | `dg-vis/medium-bWindow.png` | 窗洞直角开在整块墙上，无窗檐/窗台压顶（只有黄色贴花提示翻越） |
| B 点 | ref2-a01/a05：B 区石砌墙+木栅栏箱堆+梁架 | `desert-landmark-bSite.png`、`p6-final-medium-bSite.png` | 墙面整块冷灰无砌块，木箱虽在但墙体不提供任何「老城 B 区」辨识度 |
| 保卫者出生点 | ref3-wall01 就是 GR 基地：块石错缝墙+暗门洞 | `dg-vis/medium-grSpawn.png` | 参考是块石墙，本地是白灰直角墙——同一位置对比最刺眼 |
| 远景/总览 | ref1-overhead：连片街镇、屋顶错落 | `desert-landmark-overview.png`、`p6-final-medium-overview.png` | 34+ 组随机立方体悬浮散布（`desert-grey.js:171-186`），孤立白盒感，与主体断开 |

---

## 2. 前三个最影响辨识度的差距（排序 + 理由）

均基于地面视角可见面积排序，不以 HUD/天空占比充数：

1. **墙体冷色白灰 + 无砌块层次**（材质问题，M lane 主责）。每一张地面截图里墙面都占画面 40–60%；参考图墙体是暖灰褐+逐块明度差+凹缝，本地是近中性 rgb(216,211,198) 底色在冷色半球光/蓝天地图环境光（`env.js` desertDay：hemiSky 0xdfe8f0、envInt 0.32）下读成蓝白。改一处材质全图受益，性价比最高。
2. **立面无构件：墙基/檐口/门窗框/洞内阴影全缺**（D lane 主责）。现状每面墙就是一个直角矩形从沙地直接拔起，参考图所有墙都有深色墙基带、出檐/压顶、门洞强调。这些构件面数极低（每项 4–12 个 quad）却能瞬间打破「白模感」，是第二性价比。
3. **远景孤立立方体 → 连片街镇立面**（D lane）。`desert-landmark-overview.png` 中远景是漂浮的分离白盒，参考俯视是连片错落街镇。总览/高点（A 平台、B 窗房）是玩家实际会长时间停留的视角，成组化直接改变「这是真实的沙漠城镇还是白盒测试图」的第一印象。

---

## 3. 实施拆分（两条并行 lane 的工作说明书）

### 3.1 lane M：材质（单文件 `src/maps/desert-grey-materials.js`）

> 现状：9 个材质键 `sand/plaster/plasterB/stone/concrete/wood/woodDoor/roofTile/lamp`，全部程序化 Canvas，256px(medium)，`uv`=每块纹理覆盖米数（`desert-grey-materials.js:366-402`）。

**M1 暖化底色**（改现有函数参数，不动函数签名）：
- `plaster`（:70，默认 `base=[216,211,198]`）→ `[206,194,170]`（暖沙灰），并在 per-pixel 循环中把 `k` 的蓝色通道系数单独再乘 `0.96`（等价于轻微提升 R/B 比），抵消冷光。
- `plasterB`（:381，`[198,191,174]`）→ `[184,170,144]`，`wear` 0.5→1.2：建筑体量比巷道墙更深更旧，拉开层次。
- `concrete`（:172，`168,162,150`）→ `[176,166,146]`。
- `sand`（:54，`201,183,140`）基本合格，仅把 `k` 波动幅度 `v*0.2` 加大到 `v*0.26` 增加色斑。
- **环境侧兜底**（若 M lane 完成后截图仍偏冷才动，属 env.js，需单独报备）：`desertDay.hemiSky 0xdfe8f0 → 0xe8e2d0`、`envInt 0.32 → 0.26`（`env.js:25-28`）。默认**不改 env.js**，先只动 albedo。

**M2 砌块/灰泥破损层次**：
- `plaster` 增加「砌块行缝」：仿照 `stone()`（:118-161）的 rows/错缝逻辑，在 plaster 上叠弱化版行缝（缝深 0.1、缝色差 8%），行高对齐 `uv=3m` 内约 4 行。
- `concrete` 现只有十字模板缝（:176-177），增加四条竖缝与边缘倒角。
- 起皮/水渍数量：`wear` 参数已有（:70），plaster 默认 1→1.4。

**M3 道路磨损**：新增 `sandPath` 材质键——`sand()` 变体：底色乘 0.92、roughness 0.92→0.8（压实的路更光滑略深）、碎石 30→12、增加车辙/脚印暗条带（fbm 长条 mask）。供 lane D 以贴花/薄面装饰主干道（中路、A 大中线、B 区入口）。

**M4 墙基材质**：新增 `plasterBase`——plaster 变体，底色乘 0.78、wear 1.8（近地污渍/磕碰最多）、roughness 0.95。供 lane D 做墙脚条带。

**M5 门框/石作**：新增 `stoneTrim`——`stone()` 变体：块面更规整（rows 6→4、缝色 118→126）、底色 `[196,186,164]`。供 lane D 门框/窗檐/压顶。

**分档策略（采样成本）**：沿用 `S=128/256/512`、`low` 无 normalMap（:367-369）。新增 3 个材质键 medium 档成本 = +3×(漫反射256² + 法线 + 粗糙度) 次采样，一次性构建成本约 +12ms（现全量 9 键约 35ms 量级，探针实测 67 张纹理），运行时零额外成本。**medium 纹理总数上限 80 张**，超出则把 `stoneTrim` 降为与 `stone` 共用贴图改 tint。

### 3.2 lane D：装饰/立面（`src/maps/desert-grey.js` 视觉装饰部分）

> 现状装饰：§3 檐口 roofTile（:139-143）、§4 贴花 decal()（:145-169）、§5 远景随机环（:171-186）、§6 灯具（:188-200）。全部输出走 Batch 按材质合批（:202-213）。

**D1 墙基**（纯 scene 附加，零碰撞）：对 `role ∈ {wall, struct}` 且 sy≥2 的 solid，沿墙四周底部加条带 box：高 0.5m、外扩 0.06m，材质 `plasterBase`。 protrusion 6cm，不产生任何可站立体块，不加碰撞体。
**D2 门框/木门强调**（纯 scene 附加，零碰撞）：中门/A门/B门 三处门洞加 jamb（两侧 0.15m 宽×0.1m 厚）+ 压顶，A 门用 `stoneTrim` 拱形（两段斜切 quad 近似拱），木门区用 `woodFrame`（可先用 `wood` 键加深 tint 的 plasterBase 代替，见接口约定）。门洞内贴一片深色 AO 遮片。
**D3 窗檐**（纯 scene 附加，零碰撞）：B 窗房两扇窗洞上沿加 0.15m 厚、外挑 0.3m 的 `stoneTrim` 窗檐 + 窗台下沿积尘遮片。
**D4 横梁**（纯 scene 附加，零碰撞）：桥下与 B 洞上层顶板下沿，沿 z 向每 2.5m 一根 0.15×0.12m `wood` 梁（B 洞上层也可用混凝土梁）。**约束**：桥下净空 2.3m，梁底不得低于 2.15m；不加碰撞（玩家身高 1.75m + 跳跃不触及 2.15m 以上），但需在导航复查清单里确认跳跃路径视觉穿模可接受。
**D5 局部阴影遮片**（纯 decal，零碰撞）：复用 `decal()`（:155-164）+ 新增竖直贴花 helper，在墙地交界（两侧 0.4m 渐变黑 alpha 0.22）、门洞内、B 窗洞内铺 AO 遮片。MeshBasicMaterial、depthWrite:false、renderOrder 1、polygonOffset -2（与现 paint() 一致）。
**D6 远景成组街镇**（纯 scene 附加，零碰撞，不可达区域）：重写 §5（:171-186）：保留 rad≥58（bounds 外），把随机环改为 8–10 个「街区组」，每组 3–6 幢相邻/共享墙建筑（间距 0–0.5m）、高度 5–20m 错落、部分加 roofTile 顶与 0.7m 出檐、组间留街道缝隙；两座标志塔保留。颜色由 M 的 plasterB 暖化承担。无需碰撞（半径 58 超出玩家可达 bounds ±44/±38）。
**D7 道路磨损贴花**（纯 decal，零碰撞）：中路、A 大中线、B 区入口用 `sandPath` 材质铺 1–2 片大贴花或薄面 quad（高 0.015m，低于现贴花 0.02 之上、沙地之上）。

**碰撞/导航复查清单**（D lane 自查后才算完成）：
D1–D7 全部为纯 scene 附加或贴花，唯一需要复查的是**任何外扩 >4cm 且位于可通行区域 1.8m 高度以下的体块**——按上述设计只有 D1 墙基（6cm）。需复查路线：中门门缝（E('md1','md2',1.5)）、A 门（adS↔adN）、B 门（bs7↔bd1）、桥下全程（un1–un6）、B 窗跳落落地（dropScuff 贴花处）、A 小道矮墙翻越（aShortParapet）。复查方式：跑现有 `node scripts/e2e.mjs`（沙漠灰流程）+ 在四条路线上以 bot 巡逻无卡位为准；D1 若造成卡位，把 protrusion 降到 0.03m 或给基带改用贴花方案。

### 3.3 两 lane 接口约定

1. **材质 id**：新增键固定为 `plasterBase` / `stoneTrim` / `sandPath`（snakeCase，注册进 `createDesertMaterials` 返回的 `def`）。颜色一律 `[r,g,b]` 0–255 数组参数；`wear` 无量纲乘数；种子固定在 92xx 段（现用 91xx，不冲突）。
2. **uv 归属**：`def[key].uv`（米/块）由 lane M 定；lane D 一律经 `matDefs[key].uv` 取值，禁止硬编码平铺密度。
3. **D 不依赖 M 未交付项**：`desert-grey.js:52-53` 现在直接 `const d = matDefs[key]`，缺键会崩。D lane 第一步先在构建器加兜底 helper：`const mat = (k, fb = 'plaster') => matDefs[k] || matDefs[fb];`，所有新增装饰经 `mat()` 取材质；D 可在 M 之前交付（装饰以 plaster/wood/roofTile 现有键呈现），M 后到只是换肤色。反向：M 不依赖 D 的任何改动。
4. **均不碰** `desert-grey-layout.js` 的 solids/navGraph 数据（碰撞布局冻结）；M 不改 `desert-grey.js`，D 不改 `desert-grey-materials.js`（新增键由 M 完成，D 只消费）。

---

## 4. 验证与性能预算

**同机位前后截图清单**（机位即 `landmarkViews`，重拍用 `desert-visual-shots.mjs` 的轻量变体——把脚本复制到 `artifacts/dg-vis/reshoot-p7.mjs` 并将 LANDMARKS 过滤为下表 6 项 + **补上缺失的 backGarden**，输出到 `artifacts/dg-vis/p7-after-<档位>-*.png`；before 直接引用现有文件，不重拍）：

| 机位 | before（现有文件） | after（重拍） | 验收点 |
|---|---|---|---|
| overview（远景） | `p6-final-medium-overview.png`、`desert-landmark-overview.png` | p7-after-medium-overview.png | 远景成组、无孤立白盒；墙不再蓝白 |
| aLong（A 大） | `p6-final-medium-aLong.png`、`desert-landmark-aLong.png` | p7-after-medium-aLong.png | 暖灰+砌块缝+墙基可见 |
| midDoors（中门） | `dg-vis/medium-midDoors.png` | p7-after-medium-midDoors.png | 门框/门洞阴影可读 |
| bSite（B 点） | `p6-final-medium-bSite.png`、`desert-landmark-bSite.png` | p7-after-medium-bSite.png | 石砌/墙基/箱堆阴影 |
| bTunnelLower（B 洞下层） | `p6-final-medium-bTunnelLower.png` | p7-after-medium-bTunnelLower.png | 梁架或遮片打破平墙 |
| backGarden（后花园，**新补**） | 无（缺失项） | p7-after-medium-backGarden.png | 首次建立基线 |
| 对照组：low/high 各 overview+aLong | `p6-final-low-*.png`、`p6-final-high-*.png` | 同名 p7-after-low/high-*.png | 分档不回归 |

**中画质性能现状与预算**（现状数字由 `artifacts/dg-ref2/perf-probe.mjs` 实测，2026-09-27；`accept-gpu.json` 只有 FPS 无 draw calls，故加探针）：

| 指标 | 现状（medium） | 预算 | 依据 |
|---|---|---|---|
| 场景三角形 | 68,582（43 mesh） | ≤ 110,000（+40k 装饰余量，实际 D1–D7 估 +3~6k） | 装饰全走合批 quad |
| 场景 mesh 数 | 43（dg- 合批 9 个） | ≤ 55；dg- 合批 ≤ 16 | 新材质各 1 个 batch，贴花独立 mesh |
| 材质键/纹理 | 9 键 / 67 张纹理 | ≤ 12 键 / ≤ 80 张 | M 新增 3 键 |
| FPS | 60（16.7ms，AMD 5500M，accept-gpu.json） | 维持 60 / p5 ≥ 57 | 现余量极大 |
| geometries | 78 | ≤ 100 | — |

**合批/实例化建议**：装饰一律走现有 `Batch`（按材质键合并进 `dg-<key>` 静态 mesh），不要为每个装饰建独立 Mesh，也不必用 InstancedMesh（合批静态几何更省）；贴花继续共用 `PlaneGeometry` 实例化参数（现在每片 new，可顺手改为模块级共享 geometry，省 geometries 计数）。远景建筑与玩家可达区不同 batch 不必分离——frustum culling 由 boundingSphere 负责，单 batch 半径大时应按象限拆 2–4 个 batch（现有 `batch(key)` 粒度可加后缀 `plasterB#n`）。

**回归门槛**：验收前必须跑 `node scripts/e2e.mjs`（沙漠灰流程全绿）+ 重拍后与 before 图逐机位人工比对（唯一强制人工环节，本报告即依据）。

---

## 5. 附录：证据文件与 mtime（均真实存在于本机）

**现状截图（before）**
- `artifacts/accept-gpu-desert-grey.png` — 2026-09-27 09:13:03
- `artifacts/desert-landmark-overview.png` 09:20:23、`blSpawn` 09:20:24、`aLong` 09:20:26、`mid` 09:20:31、`underpass` 09:20:33、`bSite` 09:20:39（同批 09:20 共 11 张，中画质 e2e 流程）
- `artifacts/dg-vis/p6-final-medium-{overview 07:03:11, aLong 07:03:18, bSite 07:03:26, bTunnelLower 07:03:35}.png`
- `artifacts/dg-vis/medium-{aDoor 03:17:28, grSpawn 03:17:20, bTunnelUpper 03:18:42, bDoor 03:19:03, bWindow 03:19:12}.png`（high/low 三档全集 03:14–03:20，manifest.json 记录 renderer 信息）

**参考图（artifacts/dg-ref2/，2026-09-27 10:57–10:58 下载）**
- ref1-overhead.jpg / ref1-callouts.png / ref1-extra.png（3dmgame 俯视图，需 Referer）
- ref2-a01…a06.jpg（17173 A/通道木箱与光照）
- ref3-wall01.jpg / ref3-wall02.jpg（17173 经典墙体和门洞）
- _ref1/_ref2/_ref3.html（原页面存档，出处可溯）
- perf-probe.mjs（本次新增的只读性能探针）

**源码依据（只读）**：`src/maps/desert-grey.js`（231 行）、`src/maps/desert-grey-materials.js`（402 行）、`src/maps/desert-grey-layout.js`（379 行）、`src/env.js`（desertDay 预设 :23-28）、`src/textures.js`（mulberry32/fbm/normalFromHeight :4-47）。
