你是 GLM-5.3-Flash HIGH，最终验收后的定向修复轮。验收报告 `.ultra/reports/phase-6-acceptance.md` 有两项未达标，另有文档项。你只编辑 `cf-transport-ship/src/game.js`、`src/maps/registry.js` 或运输船地图/海面参数文件（如 `src/map.js`/`src/env.js` 中海面相关参数）、`README.md`（cf-transport-ship 目录下）与报告 `.ultra/reports/phase-6-final-fixes.md`；不改其它产品文件，不提交，不调用子代理。

任务：
1. **纹理泄漏一行修复**（§3 未达标）：`addTag` 名牌清理处（startMatch/quitToMenu 的 tags 移除点，game.js:363-374 与 :300/:438 附近）补 `t.sprite.material.map.dispose(); t.sprite.material.dispose();`（以及 sprite 自身如含 geometry 材质外的资源按需）。TDD 不可行处用探针验证：写 `scripts/accept-restart-check.mjs`（或扩展 accept-longrun）复跑 10 次重开，断言 `renderer.info.memory.textures` 趋平（允许 ±3 抖动，不允许单调 +15/次）。
2. **运输船 1080p 中画质 45fps → 接近 60**：注意验收报告把瓶颈归到 bloom 阈值 3.2 是**过时归因**——收口版 render.js 阈值已是 8（`.ultra/reports/phase-6-polish.md`），45fps 是在阈值 8 下实测的。请先用 accept-gpu.mjs 或探针定位真实瓶颈（ suspects：海面 shader/泡沫粒子数量、环境反射、角色数量 12、阴影档；用删减法各测 ~30s：关泡沫/降海面网格/关阴影/降 pixelRatio 对比）。然后做**低风险**优化（如中画质海面泡沫粒子减半、海面网格分段降档、中档阴影 2048→1024），不得砍掉地标辨识与玩法可感性。修后重跑 accept-gpu 运输船 60s 记录新数字；若仍达不到 60，如实报告实际值与剩余瓶颈，不虚构。
3. **README 操作说明**：cf-transport-ship/README.md 增补「操作说明」章节（键位表与菜单/模式说明，与 HTML 菜单一致；两地图、爆破/团队竞技/练习模式、C4 安拆/触屏按钮）。
4. 回归：`node --test tests/unit/*.test.mjs`（glob）+ `npm run build` + 受影响 e2e（改了海面/阴影则 e2e.mjs 与 e2e-desert.mjs 必跑；e2e-bomb 若 game.js 改动也要跑）。
5. 报告写定位数据、改动、前后 FPS/纹理数对比、回归结果。这是候选版最后一轮产品改动；完成后协调者将重跑受影响验收并交最终独立审核。
