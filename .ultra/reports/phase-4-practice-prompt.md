你是 GLM-5.3-Flash HIGH，阶段 4/C 波 lane 2：自由练习运行时。并行波次中你独占新文件 `cf-transport-ship/src/modes/practice-runtime.js`、新靶体组件文件（如 `src/modes/practice-targets.js`）与 `tests/unit/practice-runtime.test.mjs`（新）；**不写** `game.js`/`hud.js`/`bots.js`/`player.js`/既有 `src/modes/practice.js`（纯核心已审核通过，仅可 import）、`modes/index.js`、maps。不提交，不调用子代理。规格：`.ultra/specs/desert-grey.md#rules`（练习模式：无敌军主动攻击、全图探索、任意换枪、射击静态靶）与 `#architecture`。

现状：`src/modes/practice.js` 是已通过的 PracticeSession 纯核心（注入靶点/hit/update/reset/snapshot，5/5 测试），尚无任何运行时调用方。

交付：
1. `src/modes/practice-runtime.js`：练习模式运行时纯逻辑——包装 PracticeSession：按注入的地图靶点元数据生成靶体状态（含位置/半径/可见性查询）、命中登记接缝（供 Game 用弹道命中后调用 hit(id)）、以及「任意换枪」的枪械目录选择校验（从 `src/weapons.js` 公开目录读取，校验待选枪合法性，不涉及 UI）。无 DOM/Three/存储；暂停=不 update。
2. 靶体组件：纯数据+几何查询（射线-球命中判定 helper），供 Game 与两地图共用；靶点布局元数据本身属地图文件，不在你范围——定义注入接口即可。
3. 聚焦测试：红→绿；覆盖命中登记、非法输入、换枪校验（合法/非法/近战/投掷物槽位语义）、reset、快照透传。
4. 验证：`node --test` 聚焦全绿 + `node --test tests/unit/practice-core.test.mjs` 回归 + `npm run build`。
5. 报告 `.ultra/reports/phase-4-practice.md`：注入契约（Game 侧需要提供什么）、红绿证据、给 D 波接线的清单（模式注册、命中调用点、HUD 消费 snapshot）。
