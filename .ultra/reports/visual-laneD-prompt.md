你是 GLM-5.3-Flash HIGH，视觉补充波次 lane D：装饰/立面。工作说明书 = `.ultra/reports/visual-plan.md` §3.2（D1–D7）与 §3.3 接口约定，先读全文（含碰撞/导航复查清单）再动手。你**只编辑** `cf-transport-ship/src/maps/desert-grey.js` 的视觉装饰部分（§3–§6 区域）——**冻结** `desert-grey-layout.js` 的 solids/navGraph 与既有碰撞数据、不得改 desert-grey-materials.js（新增材质键 plasterBase/stoneTrim/sandPath 由并行 lane M 交付）。不提交，不调用子代理。额度紧张：聚焦执行。

执行要点：
1. 第一步先加兜底 helper：`const mat = (k, fb = 'plaster') => matDefs[k] || matDefs[fb];`，所有新增装饰经 `mat()` 取材质（M 未交付时自动回退现有键，不得因缺键崩溃）。uv 一律经 `matDefs[key].uv`，禁止硬编码平铺密度。
2. D1 墙基（protrusion 6cm 条带，plasterBase）、D2 门框/拱缘/洞内 AO 遮片（中门/A 门/B 门）、D3 窗檐（B 窗房）、D4 横梁（桥下/B 洞上层，梁底 ≥2.15m）、D5 墙地交界/门洞 AO 竖直贴花（复用 decal 风格：depthWrite:false、renderOrder 1、polygonOffset -2）、D6 远景成组街镇（重写 §5 随机环：8–10 组、组内 3–6 幢相邻共享墙、高 5–20m 错落、部分 roofTile 顶+出檐，rad≥58 不可达区，保留两座标志塔）、D7 道路磨损贴花（sandPath）。
3. 全部走现有 `Batch` 按材质合批（远景大 batch 按象限拆 2–4 个，`batch(key)` 可加后缀）；不做独立 per-decor Mesh；贴花 geometry 改模块级共享。预算：三角形 +3~6k、dg- batch ≤16、geometries ≤100。
4. 碰撞纪律：D1–D7 均纯 scene 附加/贴花零碰撞；唯一外扩 >4cm 的是 D1（6cm）——按计划复查清单跑 `node scripts/e2e.mjs` 与 e2e-bomb（沙箱流程含门缝/桥下路线），确认无卡位；若卡位把 protrusion 降到 0.03m 或改贴花方案，如实记录。
5. 验证：`npm run build`；重拍 `artifacts/dg-vis/p7-d-medium-{overview,aLong,midDoors,bSite,bTunnelLower,blSpawn}.png`（复制 desert-visual-shots.mjs 到 artifacts/dg-vis/reshoot-p7.mjs 并**补上缺失的 backGarden 机位**，landmarkViews 里有）；`node scripts/e2e-desert.mjs` 34 项全绿。
6. 报告 `.ultra/reports/visual-laneD.md`：D1–D7 逐项实现与 quad 数、batch/几何/三角形计数前后（用 artifacts/dg-ref2/perf-probe.mjs 或等价探针）、截图路径、e2e 结果、复查清单结论。
