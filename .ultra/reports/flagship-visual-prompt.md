你是通过 CLI 调用的 GLM-5.3 旗舰，effort=max。当前是双地图离线游戏的视觉质量收口。请直接工作，不开子代理、不提交或推送。

范围：仅 `cf-transport-ship/src/env.js` 与 `.ultra/reports/flagship-visual.md`，可在 `cf-transport-ship/artifacts/dg-vis/` 写临时采样脚本/截图。绝不碰 game.js、e2e-bomb.mjs、accept-restart-check.mjs；另一 CLI 进程在处理玩法问题。

先读 `.ultra/reports/visual-integrate.md` 与 `.ultra/reports/visual-env-backlit-prompt.md`，再看最新 `src/env.js` 和 `artifacts/dg-vis/p7-env{1,2,3}-*`/`sample-env.py`。前一 Flash 进程做了 3 轮环境图调色，因额度耗尽退出；当前 env.js 留有 round3 的参数（turbidity 6.2, rayleigh .72, disk warm multiplier 1.06/1.01/.87, desertDay envInt .30），但 round3 拍摄超时，样本不完整。已知 round1 背光 R-B -10.2 但向阳 +18.9/地面过黄；round2 背光 -21.4、向阳 +11.2、洞内亮度 -10.4%。不要只追单一 RGB 数字；最终看 A 大、中门、B 点、洞内和天空的实机截图与经典参考的观感，并保留运输船场景风格。

任务：先判断当前 round3 参数是否实质改善且无明显副作用。可修复/重试 `reshoot-env.mjs` 的偶发加载超时，或用现有稳定拍摄入口。最多再做 2 组候选参数实验；若背光 <=15 与向阳 +2~+8、地面 R/G<=1.05、洞内不暗 >10% 不可同时达到，记录冲突并选择视觉上最佳的折中，勿过度调参。保证 ocean:true 的运输船路径不变。每个保留候选须构建并有对应截图；最终运行一次聚焦 e2e-desert 证明无地形交互回退。若只改 env 参数，优先沿用已有性能证据，不重跑 600s。

写 `.ultra/reports/flagship-visual.md`：参数、截图路径、采样数据、目视判断、选择理由、未达指标、运输船隔离依据。控制上下文和工具输出，最多 25 turns；模型额度有限。
