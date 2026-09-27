你是 GLM-5.3-Flash HIGH，视觉补充波次 env 深改 lane：收敛背光面残蓝。现状（`.ultra/reports/visual-integrate.md` §2）：albedo/半球光/envInt 兜底后，向阳墙 R−B=+5 ✅、bSite 左墙 −1.1 ✅，但 aLong 背光墙 R−B=−28（目标 ≤15）。分析：该面主要被蓝天 PMREM 环境反射主导 + ACES 暗部压缩；继续降 envInt（需 ≈0.1）会把洞内压暗。你只编辑 `cf-transport-ship/src/env.js` 与报告 `.ultra/reports/visual-env-backlit.md`；不改其它产品文件，不提交，不调用子代理。预算：≤3 轮参数实验，达不到就如实记为接受残余。

允许的方案方向（自选，报告写依据）：
a. **desert 档环境图暖染**：env.js 已按 preset 构建 PMREM——对 ocean:false 档在构建/envMap 应用路径上做暖色乘法（或在 Sky 构建参数上给 desert 更暖的 turbidity/rayleigh 组合使反射变暖），可见天空保持蓝色白天、不得变橙。
b. hemiGround/hemiSky 进一步微调（现 hemiSky 0xe8e2d0）。
c. 曝光/色调映射微调（谨慎，全档生效）。

硬约束（每轮验证）：
1. 背光面 R−B 收敛（用 visual-integrate 的 PNG 采样法，同机位 aLong 背光区，目标 ≤15，尽力而为）。
2. **不回退**：向阳墙保持中性微暖（+2~+8）；地面不过黄（R/G ≤1.05）；bTunnelLower 洞内补光亮度不得明显变暗（同区域亮度均值下降 ≤10%）；天空截图不得变橙/灰（overview 目视 + 采样）。
3. 三档一致性抽查（low/medium/high aLong）。
4. 每轮 `npm run build` + 拍 `artifacts/dg-vis/p7-env{n}-{medium-aLong,bSite,bTunnelLower,overview}.png`；最终一轮跑 `node scripts/e2e-desert.mjs` 34 项。
5. 报告：每轮参数与采样数字、最终选择、约束逐条结论；若 ≤15 不可达，给出达到的最优值与接受理由。
