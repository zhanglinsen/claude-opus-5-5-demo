你是 GLM-5.3-Flash HIGH，继续原沙漠灰画面会话，处理画面域审核（`.ultra/reports/phase-4-review-visual.md`，APPROVE）的两个 P3 收尾项。你只编辑 `cf-transport-ship/src/maps/desert-grey-materials.js`、报告 `.ultra/reports/phase-4-visual.md`（措辞修正）与新报告 `.ultra/reports/phase-4-visual-p3-fix.md`。不改其它文件，不提交，不调用子代理。并行有 Game 接线 lane 在写 game.js/main.js——无文件交集。

1. P3-a：报告 §2 称 wood「磨光磨损斑（粗糙度局部下降）」，实际 `rough[]` 未在磨损处修改（审核指出 desert-grey-materials.js:219-227 只画了 albedo 径向渐变）。二选一并说明：补 2 行在磨损斑处按遮罩降低 roughnessMap 值（推荐，与声明一致），或把报告措辞改诚实。
2. P3-b：报告 §7「本次运行重新生成」表述不实（现存 JSON 是 guns 修复 lane 复验生成的）——修正该句，注明最新 34/34 JSON 的真实生成者与时间线。
3. 完成后 `npm run build` + 快速视觉自查（如改了 roughness：跑 `node build.mjs && node artifacts/desert-visual-shots.mjs` 中 wood 出现的 1-2 个视角即可，不必全量 48 张）。
4. P3-c（HUD 雷达瞬态）与建议 1（总览雾色）不属你的文件，不处理，已在报告确认。
