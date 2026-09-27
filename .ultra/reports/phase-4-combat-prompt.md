你是 GLM-5.3-Flash HIGH，阶段 4/C 波 lane 1：投掷物与战斗模块。并行波次中你独占 `cf-transport-ship/src/combat/`（可新建 projectile.js 等）、`src/weapons.js`、`src/effects.js` 与 `tests/unit/combat-*.test.mjs`（新）；**不写** `game.js`/`hud.js`/`bots.js`/`player.js`/`touch.js`/`viewmodel.js`/`modes/`，不提交，不调用子代理。规格：`.ultra/specs/desert-grey.md#combat`。

现状：`src/combat/grenade-effects.js` 已有 HE/闪光/烟雾纯规则（伤害/致盲/挡视线，含 isBlocked 注入接缝，已审核 APPROVE）；`src/weapons.js` 只有 `he` 一枚投掷物（slot 3）；`Game.explode` 现役 HE 行为与其对齐。任务4 范围「战斗完善、投掷物与练习模式」中你负责投掷物与战斗的**可独立测试模块层**，Game 接线属 D 波。

交付：
1. `src/weapons.js`：新增 `flash`（闪光弹）与 `smoke`（烟雾弹）条目，字段与既有 he 一致风格（slot 3 轮换、fuse、speed、count 等），数值合理并记录依据。保持既有枪械字段不变；注意 `src/profile/equipment.js` 的 CATALOG 从 weapons.js 推导，新条目会自动进入装备目录（这是期望行为）。
2. 新 `src/combat/projectile.js`：投掷物运动纯核心——初速+重力抛体、与注入碰撞回调的反弹/滚动衰减、引信到期或停止条件判定；确定性（无随机或随机经注入 seed）；无 DOM/Three。公开接口返回位置/速度/事件（bounce/fuse/explode-ready），Game 适配在 D 波。
3. 新聚焦测试 `tests/unit/combat-projectile.test.mjs` 等：可观察行为（抛物线落点、反弹速度衰减、引信触发、边界初速）。红→绿→重构，每个切片先红。
4. 若 flash/smoke 需要 weapons.js 之外的纯数据/规则，放 `src/combat/`，不放 Game。
5. 验证：`node --test` 聚焦新测试全绿 + `node --test tests/unit/grenade-effects.test.mjs`（如存在）与 `npm run build` 回归；不跑全量浏览器。
6. 报告 `.ultra/reports/phase-4-combat.md`：API、数值依据、红绿证据、给 D 波 Game 接线的契约清单（isBlocked 适配、smokeBlocksSight 唯一视线接缝、出生/引爆事件）。
