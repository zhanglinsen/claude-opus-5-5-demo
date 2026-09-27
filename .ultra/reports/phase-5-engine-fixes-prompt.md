你是 GLM-5.3-Flash HIGH，继续原 D 波接线会话，处理两域审核路由的定向修复。并行有 HUD 会话在改 hud.js/style.css（无交集）；你只编辑 `cf-transport-ship/src/game.js`、`src/actor.js`、`scripts/e2e-wiring.mjs`、`scripts/e2e-hud.mjs`（仅追加主武器同步用例）、`tests/unit/wiring-modes.test.mjs`（如需）与报告 `.ultra/reports/phase-5-engine-fixes.md`。不改 bots.js/player.js/hud.js/modes/，不提交，不调用子代理。

审核依据：`.ultra/reports/phase-5-review-engine.md`（P2-1/P2-2/P3-1/2/3/4）、`.ultra/reports/phase-5-review-hud-profile.md`（P2-1 根因在 game.js）。

修复清单（每项 TDD 或行为验证，红→绿优先）：
1. **P2-1 目标行动记账**：`objectiveCommand` 把 stopPlant/stopDefuse 也计为行动，且连点 E 可刷 500 XP 目标分。改为完成语义：从 match 事件记账（bombPlanted/bombDefused 的玩家归属、bombPickedUp），或最小白名单 `['startPlant','startDefuse','pickupBomb']` 且 start 与完成一一对应不重复计——选一种并在报告写明 XP 完整性论证（一场最多 10 次行动、无法靠重复点按刷分）。
2. **P2-2 bots 雷包收窄为 ['he']**：协调者决策——bots 不投闪光/烟雾（无队伍豁免语义、AI 无型号意识），出生雷包对非玩家只补 he（he 数量按现役 1）。玩家侧 CATALOG 补齐不变。
3. **P3-1 闪光观察者眼位**：flashbang 的 observer.pos 改眼位（a.eye() 或 chestWorld，与 explode 一致），遮挡/距离按眼位结算。
4. **P3-2 强度取 max**：更晚到期的新闪重置 remaining 但 blindIntensity 取 max(现有, 新)。
5. **P3-3 烟雾视觉半径**：视觉球半径与规则 3.5m 对齐（或注释有意余量，二选一说明）。
6. **HUD-P2-1 根因（练习面板主武器同步）**：`chooseLoadout` 出生区即时生效分支调用 `this.onSwitch(p)`（统一 vm/音效/slots/练习 selectWeapon 同步）；并保证练习开局 PracticeRuntime.current 初始化为玩家当前主武器（消除面板空高亮）。在 `scripts/e2e-hud.mjs` 追加一条用例：练习模式点击 AK/M4 主武器按钮 → 面板武器名与按钮高亮同步（真实点击路径）。
7. **P3-4**：e2e-wiring.mjs 删除未用 `drain`；修正 :180-189 断言措辞或改为真实验证内容。
8. 回归：`node --test tests/unit/*.test.mjs` 全量（注意用文件 glob，Node 26 目录参数会假失败）+ `npm run build` + `node scripts/e2e-wiring.mjs` + `node scripts/e2e-hud.mjs` + `node scripts/e2e-bomb.mjs`（ objective 记账改动影响爆破结算 HUD/XP 路径，必须回归）。投掷物手感未动则不必重跑 desert/e2e.mjs。
9. 报告写每项修法、红绿证据、回归结果。
