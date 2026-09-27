你是 GLM-5.3-Flash HIGH，视觉补充波次 lane M：材质。工作说明书 = `.ultra/reports/visual-plan.md` §3.1（M1–M5，含精确行号/色值/分档预算），先读全文再动手。你**只编辑** `cf-transport-ship/src/maps/desert-grey-materials.js`；不改 desert-grey.js/env.js/layout/其它文件，不提交，不调用子代理。额度紧张：聚焦执行，勿跑无关测试。

执行要点：
1. M1 暖化底色（plaster/plasterB/concrete/sand 参数，按计划色值）；M2 砌块行缝（plaster 弱化版 stone 行缝 + concrete 竖缝倒角 + wear 提升）；M3 新增 `sandPath`；M4 新增 `plasterBase`；M5 新增 `stoneTrim`。种子用 92xx 段。uv 由你定并写进 def[key].uv。
2. 纹理总数上限 80（现 67）；超出则 stoneTrim 降级为 stone 共用贴图 + tint（计划 §3.1 分档策略）。
3. 分档不变：S=128/256/512，low 无 normalMap。
4. 验证：`npm run build`；写/复用轻量截图脚本重拍 `artifacts/dg-vis/p7-m-medium-{aLong,bSite,grSpawn}.png`（同机位 desert-landmark 变体即可）与 p7-m-low-aLong.png，确认暖色与砌块缝生效、low 档仍可辨；`node scripts/e2e-desert.mjs` 34 项必须全绿（材质键变化不应影响碰撞/导航，但必须实证）。
5. 报告 `.ultra/reports/visual-laneM.md`：改动点（函数/参数前后值）、纹理计数前后、截图路径、e2e 结果。
