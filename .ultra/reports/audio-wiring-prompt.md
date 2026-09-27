你是 GLM-5.3-Flash HIGH，继续原 D 波接线会话，最后一个两行收口接线：音频 lane 已交付 `audio.playFlashPop(pos)` 与 `audio.playSmokePop(pos)`（见 `.ultra/reports/phase-6-polish.md` §3），当前 game.js 的闪光/烟雾起爆仍复用 `playGrenadeBounce`。你只编辑 `cf-transport-ship/src/game.js`（game.js:243 与 :269 两处各改一行调用对应新音效；如行号已漂移以 `playGrenadeBounce` 在 detonate flash/smoke 分支的调用点为准）与报告 `.ultra/reports/audio-wiring-fix.md`。不改其它文件，不提交，不调用子代理。

验证：`node --test tests/unit/*.test.mjs`（glob）全量 + `npm run build` + `node scripts/e2e-wiring.mjs`（flash/smoke 起爆路径覆盖处确认无回归）。报告写明改动点与验证结果。这是候选版冻结前最后一次 game.js 改动。
