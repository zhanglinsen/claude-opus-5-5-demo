# Phase 2 集成准备报告（INTEGRATOR）

作者：GLM-5.3-Flash（集成 worker）。时间：2026-09-26。
状态：**集成源码已就绪**；按契约未执行共享构建/浏览器验证（等待协调者确认 MAP / MOVEMENT worker 停止后恢复，进行接口修复与一次性集成构建/测试/浏览器验证）。

## 已完成的变更（全部在本 worker 所有权文件内）

### src/maps/registry.js
- `desert-grey` 置为 `available: true`，`defaultMode: 'tdm'`（爆破 UI/默认值阶段 3 才放开；`supportedModes` 仍含 bomb/practice）。**新玩家默认沙漠灰**（`NEW_PLAYER_DEFAULT_MAP` 此前已指向 desert-grey，可用后自然生效）；旧 `cf_ship_opts` 用户经 settings 迁移仍默认运输船（已验证不受影响）。
- 沙漠灰完整描述：bounds/radar/menu（orbit+blurb）/env/`ambientKey: null`/`spawnYFallback`/`killY: -6`/`loadoutZone`（axis 'z'：BL 南 +Z、GR 北 −Z）/`nav: null`（高度感知导航图由 `map.navGraph` 提供，注册表不再给平面寻路网格）。
- 运输船 env 显式补 `shadowBox`（等值于原 env.js 硬编码船体阴影体积），保证运输船行为逐位保留。
- `inSpawnZone` 扩展支持 `axis: 'z'`（原 axis 'x' 行为不变）。

### src/maps/index.js
- 接入 `MAP_BUILDERS['desert-grey'] = buildDesertGrey`（按契约 API 导入 `./desert-grey.js`），并转出 `DESERT_LAYOUT`（`./desert-grey-layout.js`）。两文件由 MAP worker 实现，尚不存在时构建会失败——这是预期，构建统一放到集成阶段。

### src/game.js
- 导航：`new NavGrid(...)` → `createNavigation(world, mapDesc, map)`（MOVEMENT 契约 API）；构建 `navNodes`（id→node 索引）供阵营目标使用。game/bots 不再有对 NavGrid 的直接依赖。
- 环境：env 配置仍来自 `mapDesc.env`，缺省 `shadowBox` 时由 bounds 自动推导（沙漠灰生效）；运输船因注册表显式 shadowBox 完全保留原效果。加载文案在海图/陆地图间区分。
- 氛围泄漏治理：`fx.initAmbient` 仅在 `mapDesc.ambientKey` 指向的构建结果句柄存在时调用（沙漠灰 `ambientKey: null` → 无烟囱烟雾/海鸥）；海面由 env.js 的 `ocean: false` 配置关闭。`lampLights` 对 `lampSpots` 缺失做兜底。
- `this.map.update?.(...)` 兜底（沙漠灰构建结果可不含 update 动画回调）。
- 新增 `regionAt(pos)`：按 `map.regions`（id/name + XZ/Y 范围）解析玩家报点区域，显示在雷达标签（`地图 · 区域 · FPS`），纯数据驱动、无 map-id 分支。

### src/bots.js
- 全面切到共享导航 API：`findPath({x,y,z}, {x,y,z}, agent)` / `randomFree(rnd, bounds)`；agent 携带 radius/height/canCrouch/canJump。
- 非对称目标：`map.teamGoals`（或 `mapDesc.teamGoals`）+ `navNodes` 存在时，rush/flank/hold 均从**己方**目标节点池选目标（flank 偏向离敌方目标最深的节点，hold 朝最近敌方目标方向架点），彻底去掉运输船的镜像假设；无 navGraph 时走原 `mapDesc.ai` 镜像常量（运输船行为保留），两者都无时按边界随机游走兜底。
- 路径跟随：路径点带真实 y；`requires: 'crouch'` 压低身位、`requires: 'jump'` 贴近时起跳；移动始终经 `Actor.move → World.move` 物理，无任何传送。卡住重规划沿用既有 stuck 检测（重新 pickGoal 走新 API）。
- 对旧网格适配层返回 `[x,z]` 形态的路径点做了最小归一化（`wp()`/`goalXZ()`），两类地图共用同一套 bot 逻辑。

### src/actor.js
- 出生高度回退改为 `mapDesc.spawnYFallback`（原硬编码 0.02）。
- 掉出世界的 killY 由 `mapDesc.killY` 配置（原硬编码 -3），回退高度同 spawnYFallback。

### src/env.js
- `opts.ocean === false` 时不创建海面（含 update 守卫）；`buildEnvMap` 地面圆盘颜色对陆地图用 `opts.groundColor`（沙色）替代深水色。
- 阴影体积 `opts.shadowBox` 可配置（缺省 = 原运输船值）；太阳高度/方位 `opts.sunElev/sunAzim`、雾 `opts.fogColor/fogDensity` 可按地图覆盖。运输船未配置的项全部走原值。

### tests/unit/registry.test.mjs
- 更新为「双图可用」契约：新玩家默认沙漠灰、URL 优先、非法 id 回退；新增沙漠灰描述自洽检查（nav=null、env.ocean=false、ambientKey=null、axis-z 出生区）。

### scripts/e2e.mjs（现有 e2e 的必要适配）
- 用例 1-3 显式 `?map=transport-ship`（语义是运输船主流程/设置回归，不再受默认地图切换影响）。
- 用例 4 由「desert-grey 不可用回退」改为「URL map=desert-grey 生效并写回设置 + 非法 id 回退」。

### scripts/e2e-desert.mjs（新增，尚未运行）
- 真实菜单开局（点击 Start）→ 元数据契约（出生点 xyz+yaw/bounds、navGraph 节点边、teamGoals、regions、lampSpots、无海面/无烟囱泄漏、导航接口存在）。
- **双方出生点 → 己方目标节点的真实 `World.move` 步进走通**：逐帧统计单帧水平位移（≤0.35m）与单帧抬升（≤0.55m），证明坡道/高低层可达且无跨障碍瞬移；到达时脚底 y 与目标 y 偏差 <1.2m。
- 机器人物理活跃度（fastForward 12s：仍在可玩范围内、多数发生真实位移）。
- 地标截图（`map.landmarkViews` 摆相机，等待真实帧推进）、总览俯瞰、HUD 截图；运输船冒烟（海面/氛围保留）。结果写 `artifacts/e2e-desert-results.json`。

### package.json / README.md
- 新增 `test:e2e:desert` 脚本；README 更新双地图/共享导航/新玩家默认地图说明。

## 已运行的验证（仅 node 纯单测，未动共享构建）

`node --test tests/unit/registry.test.mjs tests/unit/settings.test.mjs tests/unit/modes.test.mjs` → **29/29 通过**。
所有改动文件 `node --check` 语法通过。未运行 `npm run build` / 任何浏览器测试（按契约等待协调者放行）。

## 关键假设（集成阶段需与 MAP/MOVEMENT 实际产物核对）

1. **构建结果句柄**：假设 `buildDesertGrey` 返回 `spawns/regions/bombSites/navGraph/bounds/lampSpots/landmarkViews`，且 `navGraph.nodes` 元素含 `{id,x,y,z}`。契约的构建返回清单未列 `teamGoals`（在 DESERT_LAYOUT 导出里）——bots 兼容 `map.teamGoals || mapDesc.teamGoals`；若两者都无，机器人退化为随机游走。建议 MAP worker 在构建结果中带上 `teamGoals`（或集成阶段我在 maps/index.js 装配时合并 LAYOUT 数据）。
2. **regions 形状**：`regionAt` 兼容 `{id,name,x0..z1}` 或带 `extents/bounds` 子对象的两种形态；e2e 断言 regions>0 且能解析出玩家区域。
3. **估算数值待对齐**：registry 中沙漠灰 bounds（±48/±44）、radar 尺寸/偏移、loadoutZone 阈值（±30）、killY=-6、菜单 orbit、env 日照/雾参数均为按参考图估算，需与 DESERT_LAYOUT 实际尺寸对齐（集成阶段一次性校准）。
4. **导航 API 签名**：bots 按 `findPath(start, goal, agent)` / `randomFree(rnd, bounds?)` 调用；randomFree 返回做了数组/对象双形态兼容，运输船适配层无论返回 `[x,z]`（旧行为）还是 `{x,y,z}` 都可用。路径点 `requires` 字段缺省视为 walk。
5. **landmarkViews**：假设构建结果暴露 `landmarkViews [{id,name,position,lookAt}]`（e2e 截图依赖）；若只在 LAYOUT 里，集成阶段在装配层转出。

## 集成阶段待办（协调者确认其他 worker 停止后）

1. 对照 desert-grey.js / desert-grey-layout.js / navigation.js 实际导出核对上述假设，做接口修复（仅限我的所有权文件 + 协调许可下的联合修复）。
2. 一次性 `npm run build`；`npm test`；`npm run test:e2e`；`npm run test:e2e:desert`（含路线物理走通与截图证据，输出 artifacts/）。
3. 校准 registry 估算数值（bounds/radar/loadoutZone/killY/shadow 体积/日照）。
4. 确认运输船回归（e2e 用例 1-3 + e2e-desert 的 ship 冒烟）后出最终报告 `.ultra/reports/phase-2-implementation.md`。

## 风险/限制

- `defaultMode` 暂为 `tdm`：爆破模式规则/属阶段 3，符合任务约束（「Desert temporarily playable TDM; do not implement bomb rules now」）。
- 沙漠灰 HUD 报点依赖 MAP 的 regions 数据质量；若 regions 覆盖不全，区域标签可能留空（不致错）。
- 未修改 MAP/MOVEMENT 所有权文件；physics.js / map.js 未动（NavGrid 仍由 physics.js 导出，供 MOVEMENT 适配层使用）。
