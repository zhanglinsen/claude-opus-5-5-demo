# 阶段 2 — MOVEMENT 报告：坡道碰撞 / 高度感知导航

实现者：GLM-5.3-Flash（MOVEMENT worker）。所有权内文件：`src/physics.js`（修改）、`src/navigation.js`（新增）、`tests/unit/height-navigation.test.mjs`（新增）及本报告。未触碰 map/registry/game/bots/actor/env。

## 交付的 API

### 1. `World.addRamp(o)` — src/physics.js 新增 `Ramp` 类

按契约实现：`world.addRamp({x, z, sx, sz, y0, y1, axis: 'x'|'z', yaw: 0, thickness: 0.3, mat: 'concrete', surface: 'stone', tag})`。

- 局部 XZ 矩形（yaw 旋转约定与 `Collider` 一致），顶面沿 `axis` 从负端 `y0` 线性过渡到正端 `y1`，底面为 `min(y0,y1) - thickness` 的水平面；侧壁/底面实体。
- **脚部支撑**：`World.support()` 对坡道返回 `topAt(圆心最近脚印处)` 的高度，受 `maxY` 约束 —— 低处的胶囊不会从上方坡段获得假支撑。
- **水平碰撞**：`World.move()` 对坡道按「脚下斜面不算侧壁；高于脚面的楔体按坡顶高度走上台阶（≤ stepHeight）或推出」处理；配合每子步 ≤0.3m 的地面吸附，上/下坡全程贴面、不离地、无跳变（测试验证 y 严格贴合坡面）。
- **净空**：`World.blocked()` 对坡道按真实楔形占据判断（站立在坡顶不自我阻挡；坡下净空按底面平底计算），蹲起/上台阶/站立检查全部兼容。
- **射线**：`Ramp.rayWedge()` 用局部 (u,v,y) 六半空间（4 竖直侧面 + 平底 + 斜顶）凸体裁剪，`raycast`/`raycastAll` 的 bullet/sight/move 模式均按真实楔形求交 —— 坡顶上方空间不阻挡（旧 OBB 包围盒会误挡），命中坡面/侧壁的 t、exit、法线（含斜面法线归一化）正确；楔内起点 t=0、exit 正确，与 `rayOBB` 契约一致。
- `Ramp` 带 `isRamp` 标记与 Collider 同名字段（minX/maxX/minZ/maxZ/top/bottom/solid/bullet/sight/mat/surface/tag/stamp），空间网格、AABB 预剔除、HUD 雷达过滤等现有消费方无需改动；`toLocal`/`toWorldDir` 齐备，`circleOBB` 直接可用。

### 2. `createNavigation(world, descriptor, map)` — src/navigation.js（新增）

返回共享导航对象（与 game.js/bots.js 已接入的调用形态一致）：

- `findPath(start, goal, agent)`：`start/goal` 为 `{x,y,z}`（脚底高度）；返回 `[{x, y, z, nodeId?, requires?}]`，不可达返回 `[]`。`agent = {radius, height, canCrouch, canJump}`（缺省 radius 0.42 / height 1.75 / canCrouch、canJump 均默认 **false**——bots.js 显式传 true，不受影响）。
  - `requires` 标注**到达该路径点所走的那条边**的通过要求（walk 不标注；crouch/jump 标注），与 bots.js「接近路径点时蹲下/起跳」的消费方式匹配。
  - 端点处理：先经 `world.support` 吸附到真实可站立面（±1m 内），再向同层（|Δy| ≤ 1.2）且 12m 内、直线可走的图结点投影 —— 端点始终关联正确可达层，不静默跳层。
  - 边校验（按 agent 缓存）：能力检查（crouch/jump 要求、edge.width ≥ 2×radius+0.12、node.clearance ≥ radius+0.05）+ 直线采样几何校验（步长 0.3m）：每步有真实支撑面、单步爬升 ≤0.45（与 Actor.stepHeight 0.42 对齐）/跌落 ≤0.65（jump 边 ≤1.15/≤3.0、允许 ≤1.7m 悬空跨越）、净空从「脚底+单步爬升」起算（下一级台阶不算墙，墙体/低顶仍阻断）、终点地形与结点 y 收敛（|Δ| ≤ 1.0）—— 跨层伪边、穿墙边、楼梯上叠矩形边都会被拒绝。
  - 图搜索：Dijkstra（二叉堆，沙漠灰 97 结点全图单源 <40ms）。
- `randomFree(rnd, bounds?)`：图模式在结点（可选 XZ 边界过滤）附近抖动并验证真实支撑/净空；无候选返回 `null`（与 legacy 语义一致，bots 两者都处理）。
- 另暴露 `kind`（'graph'|'grid'|'none'）、`nodes`、`edges`、`canTraverse(fromId, toId, agent)`（供集成层校验单条边）。
- **运输船适配**：`descriptor.nav` 存在时沿用现有 `NavGrid`（不改动其任何公有行为），`findPath` 输出适配为 `{x, y: 0, z}`（保持甲板 y=0 的既定导航），`randomFree` 适配为对象返回；无 navGraph 也无 nav 时返回空实现（`findPath→[]`、`randomFree→null`），地图未接入时仍可构建。
- 未做任何全局 y=0 吸附、绕过碰撞或跨层瞬移：所有高度来自 `world.support` 实测。

## 命令与结果（均在 cf-transport-ship/ 下）

| 命令 | 结果 |
|---|---|
| `node --test tests/unit/height-navigation.test.mjs` | **10/10 通过**（坡道升降贴面、坡下通行、楔形射线、叠层/低净空/顶头、图导航跨层经坡道、穿墙边拒绝+绕门洞、只剩伪边不可达、跨层/crouch/宽度准入、randomFree 站立面、船适配 y=0+门洞、legacy NavGrid 签名不变） |
| `npm test`（全量，含并行的 profile/modes/registry 套件） | **74/74 通过**（本轮结束时 profile-core 已由并行 worker 修复；本 worker 未改动其文件） |
| `npm run build`（esbuild） | 成功，`dist/index.html 880.5 KB` |

## 对真实沙漠灰几何的（计划外）验证

MAP worker 的 `DESERT_LAYOUT` 已导出 `solids`/`ramps`（与 `world.add`/`addRamp` 契约同形），据此在 node 内构建真实碰撞世界并接入真实 navGraph（97 结点 / 124 边）做端到端校验（临时脚本，未提交为测试，避免跨 worker 文件依赖）：

- GR 出生 → 3 个 GR teamGoal 全部可达；BL↔GR 出生互通（13 路径点）。
- BL 出生可达 **66/97** 结点；不可达的 31 个分两簇：A 平台簇（plt/pf/asE1/snB/alg2+/pr/pb/ad…）与 B 包点/下层簇（bs1-7/lo1-2/un6）。
- 被几何校验拒绝的边 11/124，**全部**因真实障碍：9 条压在 1.1–1.4m 木箱上（`snA→asE1`、`asE1→sn3`、`alg1→alg2`、`yd4→yd6`、`gd1→gd4`、`bs3→bs4`、`bs5→bs6`、`bs5→bs7`、`bs7→bd1`），2 条穿过建筑墙体（`un5→un6` 压在 (-32,-4) 处 0.4×20 墙、`gy3→ac1` 压在 (10,-23.5) 处 8×9 建筑）。两簇内部连边全部通过校验，仅上述边界边被切断。

**需要 MAP/INTEGRATOR 修复（非 MOVEMENT 所有权）**：A 平台簇与 B 包点簇对外只有上述边界边。修复选项：为这些边增加绕行中间结点（避开箱体/墙）、或微移对应木箱/边端点。修复后 BL→pf2（A 平台 teamGoal）与 BL→bs3（B 包点）即可达。楼梯边（aShortStairs/bUpperStairs/aPlatStairs/bWinStairs）在台阶容差修正后已全部通过，无需改动。

## 集成注意事项

1. `game.js` 的 `createNavigation(this.world, this.mapDesc, this.map)` 与 bots 的 `navAgent()`/`wp.requires` 消费方式已核对匹配；`requires` 语义为「到达该点的边的要求」（incoming），bots 现有代码即按此工作。
2. `map.navGraph` 优先于 `descriptor.navGraph`；沙漠灰 `descriptor.nav = null` 时走图导航，运输船走 NavGrid 适配。
3. 图导航校验假设：结点 y 与实际脚底站立面误差 ≤ ~1m、相邻结点直线可走；`clearance` 按「可通过半径」解释。边两端最好放在台阶/坡道的起止处（本轮真实数据已满足）。
4. 楔形视觉网格由 MAP 构建；physics 只提供碰撞。`world.addRamp` 返回 Ramp 实例，MAP 可留存做对照。
5. 楼层间距 ≥ ~2m 时 support 的 maxY 过滤才能可靠区分上下层（沙漠灰主层 0 / 上层 2.8 满足）。

## 已知限制

- 端点投影要求 12m 内存在同层且直线可走的结点（最多取最近 6 个）；在结点稀疏的大房间中央或被障碍完全包围的位置会返回 `[]`（诚实失败，不做传送兜底）。
- 边校验只检查结点间直线；边中段需要绕障的走法必须由 MAP 用中间结点表达（这正是当前两簇不可达的原因）。
- 直连捷径（<28m 且直线可走）会跳过图结点， bots 的路线选择可能比预期更直接；如需强制走图，可在调用层禁用（当前未提供开关）。
- `canCrouch`/`canJump` 缺省为 false；未传 agent 的调用方拿不到 crouch/jump 边（契约未规定缺省，取保守值并在此声明）。
- 坡道 sides 推出在圆心已进入矩形且坡面高于脚面超过 stepHeight 时按最近边法向推出（如从高处坠入陡坡中段会滑向边缘），未做专门的「落入坡面」吸附。
- 实际 actor 走位验证（浏览器内 bot 走攻防路线）属 INTEGRATOR 阶段职责，本报告的路径结果为 node 内几何校验。

## 状态

MOVEMENT 工作完成，停止。未提交、未部署、未改全局设置。
