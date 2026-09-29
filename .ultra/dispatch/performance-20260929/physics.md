请立即实现性能 C 路（射线宽阶段搜索）。工作树 `/Users/sen/.codex/worktrees/perf-physics/claude-opus-5-5-demo`。
共同约束：`/Users/sen/workspace/AI/claude-opus-5-5-demo/.ultra/dispatch/performance-20260929/common.md`。

唯一归属：cf-transport-ship/src/physics.js；tests/unit/perf-raycast.test.mjs；可选 scripts/bench-raycast.mjs；.ultra/reports/performance-20260929-physics.md。不改地图、AI、武器、game.js或移动query语义。

World.raycast/raycastAll 当前通过 query 射线起终点的整个XZ包围矩形，长对角射线搜索格子数量近长度平方，AI视线/射击反复调用。研究现有网格(cell4)与collider更新约定，在静态World.build网格上沿射线保守遍历/等价裁剪，精确测试仍用现有 rayOBB/rayWedge。保持公共query供移动使用。谨慎处理共享_candidates/stamp、maxT、边界、raycastAll exit和排序。坐标key=x*1000+z旧约束不要顺便重写全索引。

测试先行，使用冻结旧实现/独立朴素精确碰撞作oracle，确定性随机数数百至数千条足够；包含竖直/零dx或dz、负坐标、网格边/角、物体跨格、起点在物体内、OBB旋转、坡面、最远端、短射线、非单位方向（若API允许）、三个mode的 flags、同t稳定顺序、最近命中与所有穿透命中的 t/exit/n/材料/对象身份。不要排序丢弃与原查询顺序关联的等距行为：明确恢复旧扫描顺序，或证明可接受且不影响现有契约。差分中发现旧精确几何bug先记录，不混入本路。

验收须有搜索访问/候选数量显著下降或可信微基准，不能只换算法名字；也记录短轴向射线不明显恶化。只跑受影响 physics/navigation/combat 单测，不全套/不GPU。若无法保证边界正确，改成更保守范围优化并说明。报告 lane=physics，中文提交。
