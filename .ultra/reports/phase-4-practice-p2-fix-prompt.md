你是 GLM-5.3-Flash HIGH，继续原练习运行时会话，执行 C 波审核路由的定向修复。当前视觉 lane 在并行运行（独占 maps/textures/env，与你无交集）；你只编辑 `cf-transport-ship/src/modes/practice-runtime.js`、`cf-transport-ship/src/combat/projectile.js` 的注释与 `tests/unit/practice-runtime.test.mjs`、`tests/unit/combat-projectile.test.mjs`，以及报告 `.ultra/reports/phase-4-practice-p2-fix.md`。不改 game/HUD/其它文件，不提交，不调用子代理。

依据 `.ultra/reports/phase-4-review-combat-practice-prompt.md` 对应的审核报告（REQUEST_CHANGES，P2-1 必改）：

1. **P2-1（必改）**：`practice-runtime.js:29` 的 `!!WEAPONS[id]` 走原型链，`canSelectWeapon('toString')`/`'constructor'` 返回 true 且可被选为当前武器（审核已探针实证，`slots[undefined]`）。改为 `Object.hasOwn(WEAPONS, id)`（或等价 hasOwnProperty.call）。TDD：先加失败用例（'toString'/'constructor' must be rejected 且不改变当前选择），红→绿。
2. **P3-2**：`combat/projectile.js:51,55` 构造参数 `radius` 接收后从未读取——删除该参数或注明占位用途（二选一，说明理由）。
3. **P3-3**：`projectile.js` 头注释加粗强调「rested 后每子步仍发 bounce，D 波必须用 |vn|>2 闸门过滤音效」，或在 rested 后抑制 impactSpeed 极小的事件（选一种，保持与现役手感一致优先）。
4. **P3-4**：在你报告的接线契约中把 `hitScan(origin, dir, weapon.range)` 修正为「maxDist 传 min(range, 墙面射线距离)，Game 侧先做墙面 raycast」，并写明隔墙命中风险。
5. 审核建议 2/3/4（effect 键断言、pickTarget 非数组防御、atRest 严格相等脆弱性）可顺手做，不强制；做了就写进报告。
6. 验证：`node --test tests/unit/practice-runtime.test.mjs tests/unit/practice-core.test.mjs tests/unit/combat-projectile.test.mjs tests/unit/combat-throwables.test.mjs` 全绿 + `npm test` 全量 + `npm run build`。
7. 报告写红绿证据与每项处置。
