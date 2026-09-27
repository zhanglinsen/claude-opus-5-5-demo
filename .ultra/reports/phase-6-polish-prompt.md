你是 GLM-5.3-Flash HIGH，E 波 lane 1：画面/音效收口与渲染收敛。D 波已过闸（223/223 全绿、全部 e2e 通过、独立复核 APPROVE）。你独占 `cf-transport-ship/src/render.js`、`src/env.js`、`src/audio.js`（如需）、`src/textures.js`（如需微调）、`cf-transport-ship/src/hud.js` 仅限 1 行过时注释修正、与报告 `.ultra/reports/phase-6-polish.md`；**不改** game.js/player.js/bots.js/modes/maps 几何。不提交，不调用子代理。

依据：`.ultra/reports/phase-4-visual.md` §2（bloom 渗白根治建议：threshold 提到 ~8-10 或把天空排除出 bloom 输入；skyGain 0.25 是绕过 bloom 的保守值，根治后可回调 ~0.5）、`.ultra/reports/phase-5-fixes-rereview.md` 残留 P3-2（hud.js:416-417 过时勘误注释）与 P3-1（displayMode 边缘场景——只在 hud.js 注释/报告注明为已接受残余，不改逻辑）。

任务：
1. **bloom 根治**（render.js）：按视觉报告方案处理——提高 threshold 或把天空排除出 bloom 输入；保持低档无 bloom 行为不变。
2. **skyGain 回调**（env.js）：bloom 根治后把 desertDay/desertDusk 的 skyGain 从 0.25 回调到观感与过曝安全平衡的值（从 0.4-0.5 起试，截图对比），确认天空恢复蓝色且无墙面泛白复发；海图（运输船）渲染结果不得回退。
3. **音效收口**（audio.js / 如需）：检查闪光/烟雾落地是否已有 bounce 音（D 波已接 impactSpeed>2 闸门）——若爆炸/闪光/引信缺专属音，可加轻量程序化音效或确认复用合理；不追求复杂，报告列明现状即可。
4. **性能预收敛**：中画质几何/材质已按档分级；检查是否有明显浪费（如重复构建、未合并静态几何的低垂果实），只做低风险优化并量化说明（截图+构建体积+节点数），不做大重构。
5. **一行勘误**：hud.js:416-417 注释改为「chooseLoadout onSwitch 同步已由 game.js 修复」。
6. 验证：`node --test tests/unit/*.test.mjs`（glob）全量 + `npm run build` + `node scripts/e2e-desert.mjs` + `node scripts/e2e.mjs`；重拍 artifacts/dg-vis 的 overview 与 2-3 个关键视角三档对比（复用 desert-visual-shots.mjs 或写轻量版），证明 bloom 修复效果；本机 Chrome 若可**有头**运行（非 headless），记录一次真实 GPU 渲染器的 renderer 信息（WebGL debugging info）供 E 波性能验收参考——不声称 FPS 成绩。
7. 报告 `.ultra/reports/phase-6-polish.md`：每项改动、参数、前后对比截图路径、验证结果。
