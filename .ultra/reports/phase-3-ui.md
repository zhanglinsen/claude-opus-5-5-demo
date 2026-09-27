# Phase 3 — INPUT / HUD lane 报告

实现者：GLM-5.3-Flash HIGH（CLI，无子代理）。日期：2026-09-27。
契约：`.ultra/reports/phase-3-parallel-contract.md`；任务：`.ultra/tasks/contexts/task-3.md`。

## 交付范围

爆破模式输入与 HUD/触屏交互，全部只经 `Game.objectiveCommand(type, actorId, pos?)` 与 `Game.objectiveView(actorId?)` 接入；HUD 只读渲染 `HUD.update` 收到的 `s.objective`（RULES lane 已在 `game.js` updateHUD 传入 `this.objectiveView(p.id)`，本 lane 未改 game.js）。

### 已实现行为

- **5 号槽 C4**：`player.c4Selected` 为运行时输入状态（本体在 `BombInput.c4Selected`，Player 以 getter/setter 委托）。仅当 `objectiveView(id).bomb.carrierId === player.id` 时按 `5` 选中；第一人称切换到 C4 模型（`vm.equip('c4')`），枪械/投掷输入全部旁路。数字键/Q/滚轮切枪自动退出 C4。未持包按 5 提示「未携带 C4」。
- **按住左键安放**：C4 选中 + `view.plantable` 时按住开火发送 `startPlant`，松开发送 `stopPlant`。打断语义：`BombMatch` 按事实（移动/受伤/离开包点/死亡）取消后，视图进度归零 → 输入状态机封锁，必须松开重按才会重新 `startPlant`（0.3s 命令延迟宽限）。包点外按住不误发。
- **E 拆包优先于拾取**：`view.defusable` 时按住 E → `startDefuse`/松开 `stopDefuse`（与安放同一套打断-封锁语义）；`pickupable` 且不可拆时按 E → 瞬时 `pickupBomb`。
- **G 丢 C4**：持包且 C4 选中时 `dropBomb`（携带 `pos:{x,y,z}`）并退出选中。
- **死亡观战**：爆破模式（`objectiveView` 非 null）死亡后第一人称跟随己方存活队友，左键/滚轮切换；无存活队友回退原死亡镜头；下回合复活自动恢复。非爆破模式死亡镜头不变。
- **HUD**（新元素 `#objInfo/#c4State/#objHint/#objProg/#slotC4`，纯函数 `objectiveHud(view, ctx)` 渲染，不计算任何规则结果）：回合数、双方存活数、C4 状态（我携带 / 队友名携带 / 敌方携带 / 已掉落 / 已安放·包点·红色脉冲）、交互提示（按住左键安放 / 按住E拆除 / 按E拾取 / 准备期换包 / 回防文案）、安放/拆除进度条（分母取视图 `plantHold/defuseHold`，缺省 `BOMB_DEFAULTS`）。回合胜方文案直接渲染视图 `roundWinner`。地图/报点沿用既有雷达左下标签（game.js 既有逻辑）。C4 在手时弹药区显示 C4；5 号虚拟槽随携带/选中高亮。菜单按键说明与背包（B）对话框文案按模式更新。
- **触屏**：新增 C4 / E（按住）/ G 按钮（`touch.objBtns`），爆破模式存活时显示、TDM 自动隐藏；E 按住路由 `keys.KeyE`，安放复用既有开火键按住。触屏行为其余不变。
- **TDM/练习回归**：`objectiveView` 为 null 时输入状态机零命令、爆破 HUD 整块隐藏、死亡镜头与 B 背包行为不变（冒烟已验证 TDM 开局与按钮隐藏）。

## TDD 证据

命令均在 `cf-transport-ship/` 下执行：

1. RED：先写 `tests/unit/bomb-input.test.mjs`（10 例：安放边界、打断封锁、E 优先级、G、非爆破零命令；HUD 只读文案 4 例），`node --test tests/unit/bomb-input.test.mjs` → fail（导出缺失/断言失败）。
2. GREEN：最小实现 `BombInput`（player.js 导出）+ `objectiveHud`（hud.js 导出）→ 10/10 pass。
3. 全套：`npm test` → 141 例 138 pass；**2 个失败均在 `tests/unit/bomb-bot.test.mjs`（AI lane 文件，并行进行中，非本 lane 改动）**。
4. 构建：`npm run build` → `built dist/index.html`（无错误）。
5. 浏览器冒烟（playwright-core + 本机 Chrome，脚本在 `artifacts/smoke-ui-lane.mjs`、`artifacts/smoke-ui-touch.mjs`，证据为脚本运行输出）：
   - 真实契约（RULES lane 落地 `objectiveView/objectiveCommand` 后重跑）：沙漠灰爆破开局，HUD 自动收到 `s.objective` 渲染「第 1 回合」；无 pageerror/console error；包点外按住左键不误发安放。
   - HUD 直接喂 `s.objective`：回合/存活/C4 状态/提示/进度 50%/5号槽高亮/观战文案全部正确渲染。
   - 触屏：爆破模式三按钮显示、TDM 隐藏、E 按住路由 keys。
   - 未声称浏览器内完整可玩安放-拆除闭环：持包者随机分配且需走位到包点，完整闭环留给 RULES lane 的整合与浏览器验收（其负责 scripts/e2e-bomb）。

## 变更文件

- `src/player.js`：`BombInput` 导出状态机；Player 集成（Digit5/E/G、C4 视图模型切换、观战、preventDefault 增 KeyE/KeyG/Digit5）。
- `src/hud.js`：`objectiveHud` 导出；`updateObjective`；模板新元素/菜单键位/背包文案；中央信息统一到 updateObjective。
- `src/touch.js`：目标交互按钮（默认隐藏，HUD 联动显隐）。
- `src/guns.js`：`c4` 程序化模型（炸药块+键盘+胶带）。
- `src/viewmodel.js`：`HIP.c4` 姿态。
- `src/style.css`：爆破 HUD 元素样式。
- `tests/unit/bomb-input.test.mjs`：新增（唯一新测试文件）。
- `artifacts/smoke-ui-lane.mjs`、`artifacts/smoke-ui-touch.mjs`：冒烟脚本（artifacts 已 gitignore）。

## 限制与给协调者的事项

1. **G 丢主武器无运行时接口**：契约只提供 `dropBomb`；丢弃主武器需要世界物品表示与拾取接口（RULES/mode core 职责）。当前 G 仅在 C4 选中时丢 C4；未实现丢枪。如需丢枪请补充接口后回本 lane。
2. **进度条分母**：`objectiveView` 快照未显式提供 hold 时长时回退 `BOMB_DEFAULTS`（5/7s）。若 RULES 以后允许按局覆盖规则参数，请在视图加 `plantHold/defuseHold` 字段（渲染已优先读取）。
3. **观战镜头**为简化的第一人称跟随（位置+朝向），无等待黑屏/切换动画；切换交互为左键或滚轮。
4. **B 背包计时逻辑**在 `game.js chooseLoadout`（RULES 文件）：其「出生区内立即生效」语义在爆破准备期天然成立（回合出生在出生区）；交战期更换经 `nextPrimary` 下回合生效。本 lane 仅更新了对话框文案；若 RULES 需要区分爆破准备期/交战期的特殊处理，请在 game.js 侧完成或回报接口需求。
5. HUD 消费的 `s.objective` 字段清单（供 RULES 对照）：`phase/round/score/timeLeft/bomb{carrierId|dropped|planted,site,pos}/plantProgress/defuseProgress/plantable/defusable/pickupable/alive{BL,GR}/roundWinner`，可选 `plantHold/defuseHold`。

未提交/未推送。
