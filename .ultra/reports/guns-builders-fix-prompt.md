你是 GLM-5.3-Flash HIGH，继续原投掷物/战斗会话。视觉 lane 发现一个**阻塞级跨 lane 集成缺口**，协调者现在授权你修复：C 波你在 `src/weapons.js` 新增了 `flash`/`smoke`，但 `src/guns.js` 的 `builders` 表没有对应构建函数；`game.makeIcons()`（game.js:133）启动时遍历 `Object.keys(WEAPONS)` 调 `buildGunMerged(id)` 会抛 `builders[id] is not a function`，**Game.init 中断、所有地图无法开局**（视觉 lane 用临时 shim 验证后已还原，备份 `.ultra/dispatch/guns.js.lane3-backup`，其报告 `.ultra/reports/phase-4-visual.md` §6）。

本次授权文件：`cf-transport-ship/src/guns.js`（builders 表新增 + 程序化模型）、`cf-transport-ship/src/viewmodel.js`（如需 HIP 姿态，参考既有 `HIP.c4`）、新测试 `cf-transport-ship/tests/unit/guns-builders.test.mjs`、报告 `.ultra/reports/guns-builders-fix.md`。不改 weapons/game/hud/其它文件，不提交，不调用子代理。

要求：
1. 为 `flash` 与 `smoke` 各补一个正式程序化枪模 builder（投掷物造型：闪光弹=细长圆柱+斜纹/拉环，烟雾弹=罐体+顶部拉杆与排气孔），风格与现有 he/枪械 builder 一致；必要时在 viewmodel HIP 加持握姿态。模型只求辨识度与风格统一，不追求复杂。
2. 先加一条失败测试：遍历 `Object.keys(WEAPONS)` 断言每个 id 在 builders 表都有函数（红：缺 flash/smoke）→ 补齐 → 绿。这条测试同时封死未来新增武器忘建模型的回归。
3. 验证：`node --test tests/unit/guns-builders.test.mjs` 红→绿；`npm test` 全量；`npm run build`；然后跑 `node scripts/e2e-desert.mjs`（34 项，真实浏览器 init 不再崩、运输船+沙漠灰可开局）——这是证明缺口真正关闭的关键证据。顺带重跑 `node scripts/e2e.mjs`（21 项）。
4. 报告 `.ultra/reports/guns-builders-fix.md`：红绿证据、模型描述、e2e 结果、对视觉 lane 截图证据有效性的影响评估（shim 只影响图标输入，视觉结论是否仍成立）。
