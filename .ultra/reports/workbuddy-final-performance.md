# P 路 · 双地图性能证据与归因报告（workbuddy-final-performance.md）

- 生成：2026-09-27 23:45 (+08:00) · 执行：Workbuddy GLM-5.3-Flash 会话（P 路主责），含 21:27 后保真度会话对同一证据链的延续。
- 机器：MacBookPro16,1 · AMD Radeon Pro 5500M（有头 Chrome，ANGLE Metal）· 1920×1080 · 中画质 · 每图 ≥60s，每 2s 采样 `g.fps`。
- 目标：沙漠灰 P5 ≥55；运输船相对 c935ace 基线无实质回退。**结论口径：正式结论只采信负载 ≤30 窗口；不以单轮最佳值宣称达标。**

## 1. 测量方法（scripts/accept-gpu-pair.mjs）

- 多 root 串行配对：候选（工作树 dist）vs 运输船旧基线（`/tmp/cf-ship-baseline-p` = c935ace 只读 worktree，同 three@0.186 渲染栈，各自 dist）。
- 防节流 Chrome 参数（`--disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling`）。
- 负载全程采样（前/中/后，每 10s），renderer 逐轮记录，页面错误/崩溃/导航计数；`--out` 强制新文件名，绝不覆盖历史 JSON/截图。
- 演进：21:24 起逐轮持久化（中途崩溃不丢数据，起因见 §3-final 轮）；60fed10 增加 simTime≥1 采样门（消除启动 0 FPS 帧对 P5 的伪影）与 renderer.info 采样；1d199bb 修正 EffectComposer 双渲染下的 draw call 统计（autoReset=false + 差分调用率）。

## 2. 运输船回退判定：**无实质回退（证据闭合）**

同源配对（候选含 bldMidW 空心大厅修复 + 保真度增强，base=c935ace）：

| 窗口 | cand med/P5 | base med/P5 | 负载 | 佐证 |
|---|---|---|---|---|
| 20:46 short 14s×2 | 60/— | 59/— | 26–47 | 方法验证轮 |
| 22:5x 正式轮（保真度会话） | **44/33** | **41/18** | 候选窗更平静 | draw calls 294 vs 298、textures 105 vs 116、geometries 154=154 |

候选在更平静窗口双指标反超基线，渲染统计持平 —— 无代码回退信号，判定通过。

## 3. 沙漠灰 P5 ≥55：**本机当晚未获正式达标轮（保持阻塞）**

候选（含修复）65s 轮次全景（全部原始 JSON 保留，未覆盖）：

| 时间 | 轮次 | med/P5 | 负载（前→后） | 判读 |
|---|---|---|---|---|
| 20:52 | formal cand-desert-r1 | 57/27 | 22→19→33→89 | 前 40s 钉 60，末段波谷对应 P5 27 |
| 20:57 | formal cand-desert-r2 | 55/40 | 135→50 | 波衰减段 |
| 21:15 | fx-desert-r1 | 45/29 | 32→45 | 波上升段 |
| 21:25 | final2 fx2-desert-r2 | 45/36 | 13→19（当晚最静） | 从未触 60 |
| 21:32 | 消融 nofix r1/r2（还原态） | 42/0、50/34 | 157→196、105→64 | 重载段 |
| 22:52 | 正式轮（保真度会话，load 6.4 起） | **60/46** | 6→10.8→22 | 平静段钉 60；低点全部对应末段波 |
| 23:40 | qp1-desert | 36/23 | 43→164 | 波峰，作废 |

- **修复无罪（A/B 归因）**：还原态与修复态在同等负载窗口成绩一致（23:31 还原态 46/低载 vs 21:25 修复态 45/低载；20:52 修复态 57 曾钉 60）。傍晚后渲染天花板整体降至 ~45–50 为时间相关系统状态（疑似热节流/残余竞争），与代码无关。
- **负载波归因**：主机存在周期性外部负载波（数分钟内 13→196→50，1min 均值全程 6–53 振荡），每次 P5 低点均与波峰逐点对应；测量自身仅推高 load 至 ~20。
- **历史最好**：P5 57（accept-gpu-unthrottled-run1，负载 19–48）。22:52 近安静轮 P5=46。
- 按审核准则（不以单轮最佳、不以负载>30 窗口出正式结论），**P5≥55 未闭合**；需全程 load<10 的 ≥60s 轮，或用户接受"主机竞争限制"的如实记录。

## 4. 原始产物清单（全部保留）

`artifacts/accept-gpu-pair-short-20260927.json`、`-formal-20260927.json`、`-final-20260927.json`（fx 系列仅截图，数值轮丢失于持久化修复前）、`-final2-20260927.json`、`-ablation-nofix-20260927.json`、`-calmab-20260927.json`（轮 2 超时）、`-qp1-20260927.json`；历史 `accept-gpu*.json`；基线 worktree `/tmp/cf-ship-baseline-p`（保留至复测完成）。

## 5. 复现命令

> **⚠️ 前置条件（23:59 核验）**：当前 `dist/index.html`（22:16 构建）含 bldMidW 修复但**不含 60fed10 保真度源码**（bundle 未压缩，`compositePhoto`/`registerExtraScene` 字符串级缺失，探针可信）。今晚全部 GPU 轮（含保真度会话 22:52 的 60/46 与船配对）均为 pre-fidelity 构建；HEAD `7c406ed` 候选从未被 GPU 测量。**复测前必须先 `npm run build`**，否则会把过期构建当 HEAD 候选归因。qp1/qp2 三轮（23:40–23:52）同理为 pre-fidelity 构建（该构建的 P5 结论 18–23/受波扰仍有效）。

```bash
node cf-transport-ship/scripts/accept-gpu-pair.mjs \
  --out cf-transport-ship/artifacts/accept-gpu-pair-<新名>.json \
  --roots '{"cand":"<主树>/cf-transport-ship","base":"/tmp/cf-ship-baseline-p/cf-transport-ship"}' \
  --runs '[{"root":"cand","map":"desert-grey","label":"<标签>","s":65}]'
```

复测接受准则：全程 load<10（或 ≤30 并如实标注）、每图 ≥60s、沙漠灰 P5≥55、运输船双指标不劣于基线。
