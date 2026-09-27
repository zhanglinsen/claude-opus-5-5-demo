你是 GLM-5.3-Flash HIGH，视觉补充波次整合 lane：M（材质）与 D（装饰）均已交付，现在做环境兜底 + 终版证据 + 性能门禁。你只编辑 `cf-transport-ship/src/env.js`（仅 desertDay 兜底两个参数）与报告 `.ultra/reports/visual-integrate.md`；不改其它产品文件（desert-grey.js/materials.js 已冻结）。不提交，不调用子代理。额度紧张：按清单执行，不跑无关测试。

背景：`.ultra/reports/visual-laneM.md` §3 实测背光面 R−B ≈ −30（残蓝），根因 desertDay 冷色半球光 + 蓝天环境反射；计划 §3.1 M1 预留兜底：`desertDay.hemiSky 0xdfe8f0 → 0xe8e2d0`、`envInt 0.32 → 0.26`（env.js:25-28 一带）。desertDusk 同步评估（截图看效果，仅当 dusk 同样残蓝才动，报告说明）。

任务：
1. env.js 兜底参数落地；`npm run build`。
2. 终版重拍 `artifacts/dg-vis/p7-after-*.png`（用 reshoot-p7.mjs 或合并 M/D 两个脚本）：medium 档全部 7 机位（overview/aLong/midDoors/bSite/bTunnelLower/blSpawn/backGarden）+ 对照组 low/high 各 overview+aLong；同机位与 p6-final-*/p7-m-*/p7-d-* 前后像素采样对比表（复用 lane M 的 Python PNG 均值法），重点验证背光面残蓝收敛（目标 |R−B| ≤ 15）且整体不偏黄过暖。
3. 性能门禁（真机 GPU，有头 Chrome 1080p 中画质，串行执行避免并发污染——这是上次 45fps 事故的教训）：`node scripts/accept-gpu.mjs` 两图各 ≥60s，沙漠灰 median 接近 60 且 P5 ≥55、运输船不回退（基线 60/P5 59）；记录 renderer.info draw calls/triangles。若 Desert P5 <55，先查并发再如实报告。
4. `node scripts/accept-restart-check.mjs` 10 次重开纹理平坦复验（装饰 batch 新增后不得引入泄漏）。
5. `node scripts/accept-longrun.mjs` ≥600s 真渲染终检（0 异常、heap 斜率记录）。
6. 回归：`node scripts/e2e-desert.mjs` + `node scripts/e2e.mjs` + `node scripts/e2e-bomb.mjs` 全绿。规则未改，24 回合证据沿用不重跑。
7. 报告 `.ultra/reports/visual-integrate.md`：env 改动前后值与 dusk 决策、像素对比表、GPU FPS/draw calls 表、重开与长跑结果、全部截图路径清单。若任何门禁未达标，如实记录数字，不要粉饰。
