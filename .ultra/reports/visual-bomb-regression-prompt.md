你是 GLM-5.3-Flash HIGH，继续原 D 波接线会话，修复视觉波次期间暴露的确定性玩法回归。现象（`.ultra/reports/visual-integrate.md` §6）：`node scripts/e2e-bomb.mjs` 三连挂同一断言「默认开局：玩家 id 0 在 BL 且经规则引擎拿到 C4」——`{"pid":0,"team":"BL","carrierId":0,"carrying":false}`：引擎已把 carrierId 指派给 id0，但 `player.carryingC4=false`。已排除 env.js 与视觉文件（失败在默认运输船爆破路径）。时间线：e2e-bomb 上次绿为 03:40；其后 game.js（09:07 dispose 收口）、bots.js、modes 等被后续波次修改，疑似开局赋包时序在两个赋值点之间被拆开。

你只编辑 `cf-transport-ship/src/game.js` 或 `src/actor.js` 或 `src/player.js`（以实际根因所属为准，最小修复）、`scripts/e2e-bomb.mjs`（如需加稳定性断言）与报告 `.ultra/reports/visual-bomb-regression-fix.md`。不改 modes/bots/视觉文件，不提交，不调用子代理。

要求：
1. 先定位根因（读 startRound/统一复活/spawnActor/giveLoadout/carryingC4 getter 的赋值时序；用 node 探针或浏览器探针复现「carrierId=0 但 carryingC4=false」的中间态）——确定是哪个波次的哪处改动引入（git diff 对照），如实报告。
2. 最小修复：玩家 carrying 状态必须与引擎 carrierId 一致地建立（不得用测试特判掩盖）；按公开行为补一条聚焦失败测试再修（红→绿）。
3. 顺带处理（授权）：`scripts/accept-restart-check.mjs` 判定阈值放宽为「单步 ≤+5 且 drift ≤+5 且 geometries 恒定」（纹理 ±4 GC 抖动误判 fail 的校准，见 visual-integrate §5），判定逻辑改动写明理由。
4. 回归：`node --test tests/unit/*.test.mjs`（glob）全量 + `node scripts/e2e-bomb.mjs` 连跑 2 次全绿 + `node scripts/e2e.mjs` 连跑 2 次（如 e2e.mjs 仍现菜单偶发超时，如实记录并确认失败点漂移非确定性）+ `npm run build`。
5. 报告：根因、引入波次、红绿证据、回归结果。
