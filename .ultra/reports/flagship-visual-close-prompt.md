你是 GLM-5.3 旗舰 CLI 收口执行者。上个视觉会话在最后四张 round5 PNG 已保存后因上游 HTTP 400 退出，不能再反复探索。只做以下明确的小任务，不开子代理、不提交：

1. 当前 `cf-transport-ship/src/env.js` 是 round5 候选：desertDay envInt 0.32、非海图 PMREM rayleigh 0.45、turbidity 8.0、disk (1.02,1.00,0.94)。请回退到 **round4 已拍摄候选**：envInt **0.30**、PMREM rayleigh **0.72**、turbidity **8.0**、disk 不变。其他一律不改（尤其 ocean:true）。原因：round5 背光 R-B=-7.8 虽达标，但向阳 +19.0、地面 R/G=1.054、洞内 -12.4% 均越界；round4 背光 -18.6、向阳 +11.6、地面 1.045、洞内 -8.4%，天空未橙灰，是整体更均衡的视觉折中。
2. 运行单命令 `npm --prefix cf-transport-ship run build`。截图 `cf-transport-ship/artifacts/dg-vis/p7-env4-medium-{aLong,bSite,bTunnelLower,overview}.png` 已与 round4 参数对应，不需要重拍、不跑长测。
3. 写 `.ultra/reports/flagship-visual.md`，简述 round1~5 对比、选 round4 理由、未达严格背光/向阳色值的限制、运输船 ocean:true 隔离、截图路径、构建结果和上个会话 HTTP400/额度耗尽导致未完成 e2e-desert/独立 GLM 预审的事实。不要声称所有指标全过。只限 3 turns，避免大文件读取。
