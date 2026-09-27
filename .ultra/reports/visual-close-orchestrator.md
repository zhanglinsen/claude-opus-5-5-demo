# 视觉补充波候选收口（编排记录，非独立 GLM 审核）

2026-09-27 14:30 +08:00。前一 GLM-5.3 旗舰视觉进程完成 round3/4/5 四机位截图和参数探索，但在写报告前返回 `API Error: 400 Upstream request failed (HTTP 400)`。随后极小的新 CLI 收口任务返回 `API Error: 400 [1005] exceed quota limit`。实时额度仅余约 41,013，无法运行计划中的新上下文旗舰只读预审。本文件由 Codex 编排侧记录真实证据，**不是旗舰独立预审通过结论**。

## 候选取舍

同一软件渲染机位、`sample-env.py` 采样：

| 候选 | A 大背光 R−B | A 大向阳 R−B | 地面 R/G | B 洞下层亮度变化 | 结论 |
|---|---:|---:|---:|---:|---|
| 原视觉整合 | −28.0 | +5.0 | 1.035 | 基准 | 背光明显偏蓝 |
| round3 | −18.6 | +12.1 | 1.048 | −8.4% | 显著改善；向阳偏暖 |
| **round4（保留）** | **−18.6** | **+11.6** | **1.045** | **−8.4%** | 背光仍未到 ±15、向阳仍超过 +8，但地面、洞内、天空约束保持 |
| round5 | −7.8 | +19.0 | 1.054 | −12.4% | 背光单项达标，向阳、地面、洞内三项退化；弃用 |

保留的 `src/env.js` 参数：`desertDay.envInt=0.30`；仅非海图 PMREM `turbidity=8.0`、`rayleigh=0.72`、地面反弹乘色 `(1.02,1.00,0.94)`。可见天空仍使用原独立 Sky 参数；`ocean:true` 运输船分支保持原 PMREM 设置与海面颜色。最后两处从 round5 回到 round4 的改动由 Codex 编排侧在 GLM quota 拒绝后执行，并已 `npm run build` 成功（`dist/index.html` 952.1 KB 构建器输出）。

round4 原始截图：`cf-transport-ship/artifacts/dg-vis/p7-env4-medium-{aLong,bSite,bTunnelLower,overview}.png`，`p7-env4-manifest.json`。round5 对照截图亦保留，不能把 round5 声称为最终版。这些截图由 headless SwiftShader 拍摄，仅供视觉对照，不是 FPS 证据。

## 证据边界

- round4 截图显示 A 大仍是明显的现代灰白直线墙体风格，虽较原始白模有石材细节、墙基和旧化，离经典端游沙漠灰的建筑密度和材质表现仍有差距；B 点和洞内也偏简化。不能声称像素级复刻或所有视觉指标通过。
- 视觉整合波的真机 AMD Radeon Pro 5500M、1920×1080、中画质：沙漠灰 median/P5=60/60，运输船=60/58；600 秒真实渲染和 10 次重开原始数据在 `.ultra/reports/visual-integrate.md`。round4 只改环境图参数，未改变几何量、贴图数或游戏规则；其后**尚未重跑同机 GPU/600 秒长测**，性能结论对最终参数的外推需要 Sol 审核确认。
- `e2e-desert` 在视觉整合波为 34/34；round4 定稿后未重跑，因为 GLM 额度耗尽。C4 聚焦浏览器回归在独立的玩法 lane 两次 38/38，见 `.ultra/reports/flagship-c4.md`。
- 计划中的全新上下文 GLM-5.3 旗舰只读预审**未执行**；直接交 GPT-6 Sol `xhigh` 做一次独立终验，并明确上述证据缺口。
