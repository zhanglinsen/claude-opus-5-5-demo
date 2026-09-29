# 性能 C 路：射线宽阶段搜索（lane=physics）

基线 `c40d4bd`。原 GLM-5.3-Flash 实现者 23:44 因 `API Error 400 [1005] exceed quota limit` 中断，未提交；经用户同意由协调者（Claude Opus 5.5）接手完成。
归属文件：`cf-transport-ship/src/physics.js`、`tests/unit/perf-raycast.test.mjs`、`scripts/bench-raycast.mjs`、本报告。

## 发现

- P2 `World.raycast/raycastAll`（physics.js）以起终点包围矩形整面 `query`，长对角射线访问格数约为长度平方。AI 视线/射击（bots.js:299、game.js:910/973）、太阳/墙透视（game.js:1210/1227，maxT=80）每帧反复调用。

## 实改

- 新增 `World._rayCands`：逐列只访问线段 XZ 投影两向外扩 0.1 覆盖的格子。
  - 访问集是旧矩形的子集，并覆盖线段 0.1 内全部格子，因此候选集包含一切可能命中。AABB 过滤与旧 query 相同。
  - 跨单列、或线段无 x 跨度时，直接访问旧矩形本身。
- 顺序契约：`raycast` 以严格 `<` 取最近命中（等距时先扫到者胜），`raycastAll` 为稳定排序，二者都依赖候选顺序。
  - 候选按"旧矩形扫描首访格（x 外层、z 内层）+ `build()` 序号"排序，逐位复现旧顺序。
  - 每列都覆盖完整 z 范围时，访问顺序即旧顺序，省去排序。
- `query()`、移动与导航语义不变。精确求交仍用 `rayOBB/rayWedge`。射线使用独立候选数组 `_rayCand`，与 `query` 的 `_cand` 互不干扰。
- 未采用原实现者遗留的 DDA 草稿（已备份，不入库）。原因：去掉了 0.1 余量，碰撞体 AABB 恰压格线时存在浮点漏检风险；排序键依赖 `add()` 时赋的 id；`_rayRz1` 未赋值。

## 红绿证据

- 红：基线上 `perf-raycast` 性能项失败（长对角格子访问 old=676 new=676）。
- 绿：`perf-raycast` 7 项全部通过：
  - 合成场景约 2000 条确定性射线 × 3 mode + raycastAll，与冻结旧实现逐位一致（t/exit/n/对象身份/顺序），并与朴素全量 oracle 一致；
  - 角点、网格线、负坐标、竖直、零长度、非单位方向、起点在物体内、maxT 边界、等距命中顺序；
  - 真实地图差分：platform-harbor（构建器）、desert-grey、platform-desert（layout 碰撞体），各 3000 条射线 × 3 mode + raycastAll。
- 变异检查：去掉排序或把外扩余量改为 0，均有测试失败。开发中一次条件写错（dx=0 跨两列时斜率退化）也被差分当场拦下。
- 受影响测试：perf-raycast、height-navigation、desert-layout、platform-desert、platform-harbor、combat-*、grenade-effects、bomb-bot，共 109 项通过。

## 微基准

`node scripts/bench-raycast.mjs`：基线 `c40d4bd` 的 World 与当前 World，在同一真实地图数据上跑同一批确定性射线，sight 模式，每组 2000 条。

| 地图 | 射线类型 | 格子访问 旧→新 | 候选数 旧→新 | raycast 耗时 µs/条 旧→新 |
|---|---|---|---|---|
| platform-harbor | ai-sight | 42.5 → 12.6 | 15.7 → 8.7 | 3.38 → 2.71 |
| platform-harbor | long-80 | 109.0 → 22.0 | 17.6 → 8.5 | 5.77 → 3.16 |
| platform-harbor | short-axial | 1.4 → 1.4 | 1.5 → 1.5 | 0.39 → 0.48 |
| desert-grey | ai-sight | 64.8 → 15.8 | 25.2 → 13.0 | 6.07 → 4.08 |
| desert-grey | long-80 | 109.3 → 22.0 | 23.9 → 11.4 | 7.97 → 4.05 |
| desert-grey | short-axial | 1.4 → 1.4 | 1.8 → 1.8 | 0.44 → 0.52 |
| platform-desert | ai-sight | 59.2 → 15.1 | 12.1 → 7.4 | 4.64 → 3.46 |
| platform-desert | long-80 | 109.2 → 22.0 | 12.2 → 6.9 | 6.06 → 3.32 |
| platform-desert | short-axial | 1.4 → 1.4 | 1.5 → 1.5 | 0.41 → 0.49 |

长射线格子访问降为 1/4～1/5，候选约减半。真实 `raycast` 耗时：AI 视线约 −20～33%，80m 射线约 −45～49%。短轴向射线每条慢约 0.08～0.1µs，候选与格子访问不变，开销来自宽阶段的额外计算。每帧此类调用为数十次量级，影响在 µs 级。

## 限制与移交

- 经典运输船图的 `buildMap` 依赖 DOM/画布纹理，Node 下无法构建，未纳入真实地图差分；需集成者在浏览器中用运行中的真实 world 做同样的差分。
- 未测 FPS，不宣称帧率收益。
