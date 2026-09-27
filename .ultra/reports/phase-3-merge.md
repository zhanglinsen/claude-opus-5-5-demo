# Phase 3 合流报告 — RULES/AI/UI 三 lane + bomb.js id0 修复

执行者：GLM-5.3-Flash HIGH（原 RULES lane 会话续跑，CLI，无子代理/其它模型）。日期：2026-09-27。
前提：三 lane 报告（`phase-3-rules.md` / `phase-3-ai.md` / `phase-3-ui.md`）与 id0 修复（`bomb-zero-id-fix.md`）均已交付，无其他写入者。本会话独占集成文件，仅做合流必要最小修改；未提交/未推送。

## 1. 契约对表结果

以 `BombSession.view()`（`game.objectiveView` 实际输出）为基准，逐项核对三 lane 消费字段：

| 契约字段 | RULES 输出 | AI 消费（bots.js） | UI 消费（player/hud） | 结论 |
|---|---|---|---|---|
| `plantable/defusable/pickupable` | ✓（`defusable` 已含 `!action` 语义） | ✓（undefined 时有半径/距离兜底） | ✓ | 一致 |
| `plantProgress/defuseProgress` | ✓ | ✓（`plantProgress>0` 持续站定/不重复下令） | ✓（进度条分子） | 一致 |
| `defuserId` | ✓ | ✓（他人拆包中不重复下令的门） | —（未消费） | 一致 |
| `bomb{carrierId|dropped,planted,site,pos}` | ✓（与 `snapshot().bomb` 同形） | ✓ | ✓（`carrierId === p.id` 严格等值，id 0 安全） | 一致 |
| `inSite` / `spectate` | ✓ | —（未消费，地图元数据兜底） | inSite 未消费；spectate 走 `game.actors` 直读 | 一致 |
| `plantHold/defuseHold` | **合流前缺失** | — | HUD 有 `BOMB_DEFAULTS` 回退（数值恰好 5/7 一致） | **唯一缺口，已补** |

**发现并修复的不一致（1 处）**：`objectiveView` 未显式下发 `plantHold/defuseHold`（并行契约字段表明确列出）。UI lane 渲染已优先读取、回退值当前恰好正确，属契约完整性缺口而非行为缺陷。
修法（最小、红→绿）：`tests/unit/bomb-runtime.test.mjs` 既有视图测试加 2 条断言（**RED**：`Expected 5, actual undefined`）→ `src/modes/bomb-session.js` view() 增加两个字段直读规则接缝（**GREEN**）。未改 bots.js/hud.js（其消费端无需适配）。

AI lane 的可选钩子 `game.objectiveSeed` 本轮未接入（其报告注明不设置也能工作；留待 20 回合固定种子验收时按需注入，Game 侧一行赋值即可）。

## 2. 实际命令与结果

```
npm run build
→ built dist/index.html 910.6 KB

node --test tests/unit/bomb-core.test.mjs tests/unit/bomb-runtime.test.mjs \
        tests/unit/bomb-bot.test.mjs tests/unit/bomb-input.test.mjs
→ 46 tests, 46 pass, 0 fail, 0 skipped

node scripts/e2e-bomb.mjs            → 36/36 通过（原 26 项 + 合流新增 10 项）
node scripts/e2e.mjs                 → 21/21 通过（TDM/设置/file:// 回归，未扩测）
npm test（全量）                      → 146 tests, 146 pass, 0 fail, 0 skipped
```

跨 lane 集成未引发任何既有用例失败；全量套件无跳过（原 bomb-runtime 的 id0 缺陷记录 skip 已随修复转为真实断言并通过）。

## 3. 浏览器集成验收（真实 Chrome，`scripts/e2e-bomb.mjs`，driver=ui/sim 标注）

原有 26 项重跑全过（默认装配/5v5 参数/接缝契约/机器人携带者 A、B 点安拆结算/超时/引爆/BL 全灭继续计时/暂停冻结/重开清理/winsNeeded 接缝/运输船回归）。**合流新增 10 项**（真实输入管线 + 真实移动）：

1. **玩家 id 0 为 BL 携包者全链路**：默认菜单 Start → 玩家 id 0、BL、`carrierId === 0`、`carryingC4 === true`（id0 修复验证）。
2. **5 号槽（真实键盘事件）**：按 `5` → 输入状态机 `c4Selected === true`，HUD `#slotC4` 高亮可见。
3. **真实走到包点**：共享导航 `findPath` 到 A 平台目标节点 + 逐帧摇杆输入接口驱动（真实 `World.move`/`simulate(1/60)`，1196 帧，单帧水平位移 ≤0.093m，无传送），到达后 `inSite === 'A'`。
4. **真实 HUD 安放提示**：`#objHint` 显示「按住左键安放 C4」。
5. **按住左键安放 + 进度 HUD（真实鼠标事件）**：mousedown 取锁后再按住 → 引擎 `action.kind==='plant'`；冻结模拟等一个真实渲染帧后读 DOM：`#objProg` 显示「正在安放」、进度 52%（`plantHold=5` 为分母，验证本次合流补齐的字段被 HUD 实际消费）。
6. **安放成功**：引擎 `planted/site='A'`、世界 C4 标记可见、`#c4State` 显示「C4 已安放 · A 点」。
7. **灭队结算 + 统一复活**：GR 全灭 → BL 胜 → 第 2 回合玩家复活（C4 按轮转交给下一名 BL，`carrying=false` 属正确轮转）。
8. **死亡观战 HUD（真实）**：玩家阵亡 → `spectateName` 指向存活队友、`#cBig` 显示「观战中 · 运输船之王」、镜头真实跟随队友（与队友水平距离 <2.5m）。
9. **观战不泄露敌方**：视图 spectate 与实际阵营一致。
10. 运输船回归 21 项套件独立通过（TDM/4 秒复活/无爆破泄漏）。

浏览器证据（`artifacts/`）：`e2e-bomb-results.json`（36 项逐条 + console/pageerror 均空）、截图 `bomb-player0-{carry,at-site,planting,planted,spectate}.png`、`bomb-{round-prep,round-end,exploded}.png`、`ship-bomb-regression.png`。

实现说明：e2e 中「冻结模拟 → 等 `realTime` 推进的真实渲染帧 → 读 DOM」模式用于 headless 慢 rAF 下的确定性 HUD 断言，等待的是真实渲染帧而非固定毫秒。

## 4. 变更文件（本合流会话）

- `src/modes/bomb-session.js`：view() 增加 `plantHold/defuseHold`（2 行，唯一产品修改）。
- `tests/unit/bomb-runtime.test.mjs`：既有视图测试增加 2 条断言（红→绿驱动）。
- `scripts/e2e-bomb.mjs`：新增第 4 节 10 项浏览器验收（+文案修正）。
- `.ultra/reports/phase-3-merge.md`：本报告。
- 未改 bots.js / hud.js / player.js / touch.js / guns.js / viewmodel.js / bomb.js / ai / maps。

## 5. 遗留问题清单

1. **AI lane P3×2**（`src/ai/objective-planner.js`，非本合流白名单，未动）：`c4.site` 非法时 planDefender 的 TypeError 风险、`nearestAlive` 等距平票角色翻转。正常同源集成流不可触发；建议按 `early-ai-rereview.md` 的最小修法补两条断言，归 planner 所有者。
2. **G 丢主武器无运行时接口**：世界物品表示/拾取接口不存在（UI lane 已报告）。当前 G 仅丢 C4，符合现有契约；如需丢枪须先补 mode 层接口。
3. **`game.objectiveSeed` 未接线**：AI planner 种子默认 0 可用；20 回合固定种子验收时由 Game 侧注入（一处赋值）。
4. **roundEnd 期安/拆包动作的 HUD 交互**：回合结束瞬间 `objectiveHud` 走 roundEnd 分支（胜方文案），输入状态机在 phase 非 live/planted 时不发命令——行为正确，但触屏按钮显隐由 `oh.active` 控制，回合结束瞬间仍显示按钮（无功能影响，P4 视觉细节）。
5. **最终阶段验收未跑**（按分工属阶段门禁）：20 回合固定种子、≥600s 真实渲染、桌面/手机横屏、HTTP/file 双工作流、连续重开 10 次资源稳定性。本报告不宣布阶段 3 门禁通过，独立 MAX 审核由协调者另行下发。
