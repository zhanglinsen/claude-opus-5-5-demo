# 阶段 4 / C 波 lane 3 — P3 收尾修复报告

执行者：GLM-5.3-Flash HIGH（继续原沙漠灰画面会话）。日期：2026-09-27。
输入：`.ultra/reports/phase-4-review-visual.md`（APPROVE，3 个 P3）。本报告只覆盖画面域的 P3-a 与 P3-b；P3-c（HUD 雷达瞬态，hud.js 跨 lane）与建议 1（总览雾色，E 波试验项）不属本 lane 文件，未处理。

## P3-a：wood 磨损斑粗糙度遮罩（选「补实现」，与报告声明对齐）

审核指出：报告 §2 称 wood「磨光磨损斑（粗糙度局部下降）」，但 `desert-grey-materials.js` wood() 的磨损斑循环只画了 albedo 径向渐变，`rough[]` 未修改。

**处置：补实现**（推荐项）。在 wood() 磨损斑循环内（`desert-grey-materials.js:219-227` 一带）为同一径向遮罩增加粗糙度场衰减：

- 遮罩内按 `rough[i] = max(0.5, rough[i] - 0.18 * (1 - d/r))` 降低，锥形衰减与 albedo 渐变同心；下限 0.5 防止磨光过度。
- 效果：磨光处高光略强（roughness ~0.8 → 局部最低 ~0.62），方向与"长期触碰磨光"物理直觉一致。
- 种子未变（同一 mulberry32 序列，新增代码只消费 rnd 已取出的 x/y/r，不额外取随机数），既有截图基线可复现。

验证：`npm run build`（938.5KB，体积变化来自并行 guns 修复 lane 的正式 flash/smoke 枪模入库，与本项无关）+ 针对 wood 的快速自查：`artifacts/dg-vis/p3fix-aDoor.png`、`p3fix-bSite.png` 两视角实看——木箱磨斑处有细微光泽变化，整体观感与修复前一致，无回归。未重跑全量 48 张（按收尾指令）。

## P3-b：报告 §7 e2e JSON 归属更正

审核指出：`phase-4-visual.md` §7「本次运行重新生成」表述不实——现存 `artifacts/e2e-desert-results.json` 是 guns 修复 lane 复验生成的。

**处置：措辞更正**（`phase-4-visual.md` §7 已改）。更正后的时间线：

1. 9/27 本地 ~02:26-02:34：本 lane 完成画面改动并制作 guns.js 临时 shim；
2. 本地 ~02:5x：本 lane 运行 `e2e-desert` 取得 34/34（临时 shim 验证态）——该次运行的 JSON 已被后续运行覆盖，未存档（审核建议 3 的「按阶段归档结果 JSON」即针对此，采纳为流程建议）；
3. 本地 03:34：guns 修复 lane 正式补齐 flash/smoke builders；
4. 本地 03:36:30（`2026-09-26T19:36:30Z`）：guns 修复 lane 复验重新生成现存 34/34 JSON——**现存证据的生成者是 guns 修复 lane，不是本 lane**；
5. 审核（phase-4-review-visual.md）独立核验：该 JSON 晚于全部 src mtime、`find src tests scripts -newer` 为空，34 项在当前代码态成立。

结论不变：34/34 在初稿时点与当前代码态均成立，仅归属表述修正。

## 改动文件清单（本次收尾）

| 文件 | 改动 |
|---|---|
| `cf-transport-ship/src/maps/desert-grey-materials.js` | wood() 磨损斑循环内新增粗糙度遮罩衰减（约 +7 行，无种子/UV/布局变化） |
| `.ultra/reports/phase-4-visual.md` | §2 wood 行措辞补「同遮罩降低粗糙度场」；§7 时间线更正（P3-b） |
| `.ultra/reports/phase-4-visual-p3-fix.md` | 本报告（新增） |
| `cf-transport-ship/artifacts/dg-vis/p3fix-{aDoor,bSite}.png` | P3-a 视觉自查截图 |

未触碰其它任何文件（P3-c 归 HUD lane、建议 1 归 E 波，已在 `phase-4-visual.md` 原文留档）；未提交；未调用子代理。
