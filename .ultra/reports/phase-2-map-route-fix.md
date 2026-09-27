# Phase 2 MAP 补充报告：真实几何路由修复（red→green）

实现者：GLM-5.3-Flash（MAP worker）。所有权内文件：`src/maps/desert-grey-layout.js`、`tests/unit/desert-layout.test.mjs`、本报告。未改动 physics/navigation/game/registry 或其他 worker 文件。

## 缺陷（来自 .ultra/reports/phase-2-movement.md 的真实几何验证）

纯数据图连通测试不足以保证可走：以真实 `World`（solids+ramps 入碰撞）+ `createNavigation` 校验，BL 出生仅达 66/97 节点，A 平台簇与 B 包点/下层簇被边界边切断。被拒边 12 条（本轮复测）：`snA→asE1`、`asE1→sn3`、`alg1→alg2`（压 A 大/A 区木箱）、`yd4→yd6`（前院箱）、`gd1→gd4`（后花园箱）、`bs3→bs4`、`bs5→bs6`、`bs5→bs7`、`bs7→bd1`、`bd1→bc1`（B 区箱群/B 窗楼梯/B 门板）、`un5→un6`（x=-32 墙截断桥下）、`gy3→ac1`（擦中路东北楼角）。

## TDD 过程

1. **RED**：在 `tests/unit/desert-layout.test.mjs` 新增 3 个行为测试（真实 `World` + `createNavigation`，非图论模拟）：
   - BL 出生质心 → 两个 teamGoal（pf2 A平台包点 / bs3 B包点）`findPath` 非空；
   - GR 出生质点 → GR 目标 + plt2/wr3/lo2（回防 A 平台、B 窗、B 下层）非空；
   - 全图 97 节点从 bl2 经 `canTraverse` 校验后的图必须无孤岛。
   命令与结果：
   - `node --test tests/unit/desert-layout.test.mjs` → **11 pass / 3 fail**；失败信息「BL 无法从真实几何走到 pf2」「GR … plt2」「碰撞校验后不可达节点 65/97」（两簇 32 节点）。
2. **修复**（全部为布局数据层：木箱移位让出通路、墙体留出 intentional opening、节点/门位重摆，未伪造图路径）：
   - `upWallW`（x=-32 上/下层坑道隔墙）z 范围 `[-14,6]→[-14,2]`：桥下通道在 z[2,6] 恢复贯通（x=-32 段即「桥」），上下层仍由顶板/楼上实体密封；
   - B 区箱群从包点正西移到西墙侧（-42.3,-20 群 + -33,-24.5 单箱），让出 `bs3→bs4`、`bs5→bs6`、`bs5→bs7` 直线，包点掩体保留；
   - A 区中央两箱西移（31,-21 / 30.4,-19.6）、A 大两箱东移靠坑口（31,22 / 32.6,20.8）、前院箱北移（4,16.5）、后花园箱东移（-17.8,19.5）：让出 `snA→asE1`、`asE1→sn3`、`alg1→alg2`、`yd4→yd6`、`gd1→gd4`；
   - B 门开孔南移 `z[-34,-31]→z[-35,-32]`（墙段 e1/e2/门楣/报点区域同步），封闭门扇随移，敞开门扇改为贴 B 区内侧墙平放（-26.55,-31.55）：门前与 B 窗楼梯（北端缩至 z=-32.2）之间形成 ≥1.9m 地面走位带，修复 `bs7↔bd1↔bc1` 双向；
   - 节点重摆：`gy3`→(2,0,-30.5)（避开中路东北楼角，grYard 区域扩展 z[-31.5,-24]）、`bd1`→(-24.5,0,-32.9)、`bc1`→(-20,0,-33)；楼梯/坡道边本身此前已全部通过，未改动。
3. **GREEN**（修复后唯一一次定向测试运行）：
   - `node --test tests/unit/desert-layout.test.mjs` → **14/14 通过**；
   - 辅助全图扫描（内联脚本，未入库）：**被拒边 0/124**；**可达节点 97/97（无异常、无豁免）**；端到端路径 BL→pf2 20 点、BL→bs3 14 点、GR→ac2/md2/bc1/plt2/wr3/lo2 全部非空；
   - 回归审计：97 节点无一嵌入墙体（台阶/门体除外）；21 个木箱无相互重叠。

## 变更文件

- `cf-transport-ship/src/maps/desert-grey-layout.js`：solids（upWallW、bWallE1/E2、bDoorLintel、bDoorPanel1/2、Crates 8 处移位/重排）、navGraph（bd1/bc1/gy3 坐标）、regions（bDoor、grYard 范围）。
- `cf-transport-ship/tests/unit/desert-layout.test.mjs`：+3 个真实几何路由测试与真实 World 构建辅助。
- `desert-grey.js` / `desert-grey-materials.js` 无需改动（数据驱动，自动跟随）。

## 限制

- 边校验只保证节点间直线可走 + 全图连通；bot 实际走位、对枪掩体效果属 INTEGRATOR 浏览器验证（协调者下一阶段）。
- 木箱移位后掩体位置略有变化（A 大中线让出、B 区箱群靠西墙），地标方位/层高/通路拓扑不变。
- B 门敞开扇固定贴墙（静态门板，原版亦为固定遮挡）；门开孔南移 1m，与 GR 前庭的相对关系不变。
- 未运行共享构建/浏览器测试/全量套件（契约要求，留给集成阶段）。
