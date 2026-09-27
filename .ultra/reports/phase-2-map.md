# Phase 2 MAP 报告：沙漠灰布局几何与导航数据

实现者：GLM-5.3-Flash（MAP worker，并行契约 .ultra/tasks/contexts/phase-2-parallel-contract.md）
状态：MAP 交付项已完成并自测通过；物理可通行性与浏览器集成按契约留给 MOVEMENT/INTEGRATOR。

## 交付文件（严格限于 MAP 所有权）

| 文件 | 内容 |
|---|---|
| `cf-transport-ship/src/maps/desert-grey-layout.js` | `export const DESERT_LAYOUT`（纯数据，无 three/DOM 依赖）：bounds、spawns、regions、bombSites、navGraph{nodes,edges}、teamGoals、landmarkViews、solids(140)、ramps(2)、meta |
| `cf-transport-ship/src/maps/desert-grey.js` | `export function buildDesertGrey(scene, T, world, opts={})`：数据驱动实例化，返回 spawns/regions/bombSites/navGraph/bounds/teamGoals/landmarkViews/lampSpots/meshes/materials/layout/update |
| `cf-transport-ship/src/maps/desert-grey-materials.js` | `export function createDesertMaterials(opts)`：程序化灰白石墙/沙地/石材/木材纹理与包点喷漆 |
| `cf-transport-ship/tests/unit/desert-layout.test.mjs` | 纯数据校验 11 项（见下） |

未改动 registry.js / maps/index.js / game.js / physics.js / navigation.js 及任何其他 worker 文件。
未注册 MAP_BUILDERS（集成职责）；`buildDesertGrey` 即插即用。

## 参考与比例估算

- 俯视图与实景图已下载留存：`cf-transport-ship/artifacts/dg-ref/`（overhead.jpg 600×436、fp.png、map3.png 含小地图）。
- 布局按经典沙漠灰（dust2 式拓扑）重建：BL 南 / GR 北，A 区东北、B 区西北。
- 估算尺度：**约 88m × 76m**（bounds x[-44,44] z[-38,38]），按俯视图比例与 1.75m 人物高度推算；
  为白盒尺度而非精确原版尺寸，已记录于 `DESERT_LAYOUT.meta.scaleNote`。
- 方向约定：+X 东/A，-X 西/B，-Z 北/GR，+Z 南/BL；yaw=0 朝北（与 actor.forward 一致，已核对 actor.js:31）。

## 层高方案（真实分层，非贴地装饰）

- 地面 y=0；上层步道/平台/上层坑道/B 窗房地板 **y=2.6**；A大坑坑底 **y=-1.8**。
- 真实同 XZ 叠层（测试覆盖）：
  - **桥下** x[-38,-6] z[2,6] 净空 2.3，其顶板在 x[-32,-26] 段即 **B洞上层坑道地板**（桥）；
  - **A小道**（catwalk x[10,26] 顶面 2.6）与**A平台**（x[34,44] 顶面 2.6）为实体高台；
  - **B洞上层**（2.6，顶板 5.2）与 **B洞下层**（y=0，顶板 2.3）平行坑道，共享 x=-32 墙。

## 地标 → 几何对照（全部落地）

| 地标 | 实现 |
|---|---|
| 潜伏者出生点 | 南端 x[-14,10] z[28,36]，10 出生点 yaw=0 朝北 |
| 后花园 | 西南开放庭院 x[-34,-14] z[8,36]，含木箱掩体 |
| A大 | 东侧南北大街 x[24,34] z[-10,32]，西侧 1.6m 绕坑沿条台 |
| A大坑 | 坑 x[26,34] z[-6,10] 底 -1.8，两端契约坡道 pitRampS/pitRampN 进出 |
| A门 | z=-10 门墙 + 4m 门洞 + 半开木门板（yaw 1.15，木/可穿透） |
| A平台 | x[34,44] z[-38,-18] 顶面 2.6，A包点 (39,2.6,-28)，南梯 10 级 |
| A小道与楼梯 | 中路东梯 x[6,10]（0→2.6）→ catwalk x[10,26] → A小道下台 x[26,32]（台北梯落地 A 区） |
| 中路 | x[-6,6] z[-24,8] 开顶巷道 |
| 中门 | z=-24 门墙 + 双木门板，仅留 1.4m 中缝可通行（视线遮蔽） |
| 桥下 | 上述有顶通道，连接中路与 B洞下层 |
| 保卫者出生点 | 北端 x[-12,14] z[-38,-30]，yaw=PI 朝南 |
| B洞上下层 | 上层 x[-32,-26]（2.6，后花园大台阶上）→ B窗房；下层 x[-38,-32]（0）→ B区，桥下入口 |
| B门 | B区东墙 x=-26 门洞 z[-34,-31]，一扇封闭一扇半开 |
| B窗 | x=-26 墙两处窗洞（ sill 3.6 / head 4.8），B窗房 2.6 地板，GR 专用楼梯 + BL 上层坑道双入口 |
| B包点 | (-36,0,-24)，喷漆标识，掩体木箱群 |

## 路线选择（非对称攻防）

- BL 进攻：① 出生→A大入口→A大（坑/沿条）→A门→A区→平台南梯；② 中路→A小道楼梯→catwalk→下台→A区；③ 中路→桥下→B洞下层→B区；④ 后花园→上层楼梯→B洞上层→B窗（架点）。
- GR 防守/回防：出生→前庭→中门缝架中路；→A连接→A区北口（+平台南梯回防）；→B连接→B门回防、楼梯上B窗架点。
- teamGoals：BL=[pf2(A包点), bs3(B包点)]；GR=[ac2(A连接), md2(中门北), bc1(B连接)] 回防枢纽。
- 出生区互不连通（无镜像通道），符合「去运输船镜像假设」要求。

## 导航图

- 97 节点 / 124 边，全部 `{id,x,y,z,clearance,region}`，边 `{from,to,bidirectional:true,width,requires}`；
  当前全部 `requires:'walk'`（无 crouch/jump 依赖，图即所说）。
- 节点 y 为脚底高度；门洞边收窄 width（中门 1.5、B门 2.5、A门 4）。

## 自测证据（仅纯数据 + 构建器桩测，未跑共享构建/浏览器）

- `node --test tests/unit/desert-layout.test.mjs`：**11/11 通过**。覆盖：17 必含地标区域存在且 id 唯一、每地标 ≥1 导航节点、出生点数量/有限值/界内/出生区/南北分离(>50m)、图引用完整与界内、BL 图可达双包点、GR 可达回防枢纽+A平台+B窗、包点在区域内、solids/ramps 数值有限界内、真实同 XZ 叠层存在、边高差 ≤2.7、17 机位齐全、meta 记录。
- 追加内联几何审计（未入库）：全部 97 节点不嵌入任何墙体/结构体（台阶节点除外，脚踩面）。
- `esbuild` bundle `src/maps/desert-grey.js` 通过（682KB 含 three）。
- node 桩测构建器：colliders 数 == solids 数（140），ramps 全部经 `world.addRamp` 提交，返回契约字段齐全；
  world 无 `addRamp` 时退化为 16 个浅台阶碰撞体（导航模块就位后不会走到，仅保白盒可跑）。
- 既有单元套件回归：`node --test tests/unit/*.test.mjs` 74/74 通过（含并行期间其他 worker 新增测试，未发现接口冲突）。

## 集成需要（INTEGRATOR / MOVEMENT）

1. `maps/index.js` 注册 `MAP_BUILDERS['desert-grey'] = buildDesertGrey`（import 自 `./desert-grey.js`），并把 registry 的 `desert-grey.available` 置 true、补 radar/menu/env 元数据（radar overlays 建议：A平台/A小道/B窗房虚线框）。
2. MOVEMENT 的 `world.addRamp` 契约实现后，坡道碰撞自动切换；本图 ramps 仅 2 处（A大坑两端），楼梯均为 ≤0.26m 浅台阶碰撞体（沿用运输船楼梯做法），无需额外坡面支持。
3. 物理可通行性（坡道行走、2.3m 净空、台阶 step-up、楼梯节点 y 校正 ±0.26m）为 MOVEMENT/集成验证职责，本报告不声称已验证。
4. env.js 目前固定海洋/运输船氛围；沙漠灰需要沙漠天空（fog/preset）与关闭海洋——env 为集成所有权，构建器未依赖海洋（无 funnelTop，ambient 自动跳过）。
5. 灯光锚点 7 处（桥下×2、下层×1、上层×2、B窗房×1、中门×1），game.lampLights 取前 4。
6. 小地图/雷达与 menu.orbit 镜头参数属 registry（集成），landmarkViews 已提供截图机位（含 overview）。

## 已知限制

- 白盒阶段：材质为程序化简单纹理（灰白/沙色），屋顶檐口/远景建筑为纯视觉装饰；最终抛光在后续阶段。
- 中门/B门/A门为静态门板（可穿透木材质、遮挡视线），不做开合交互（原版亦为固定视野遮挡）。
- 未实现 B 窗房房顶可行走、A 大沿条未设栏杆（掉落坑内即游戏性），如审校需要可加矮墙。
