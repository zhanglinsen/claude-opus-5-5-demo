# 双地图视觉收尾验收差距（2026-09-27 19:30 +08:00）

状态：旧阶段源码与功能修复已由 Workbuddy 提交，**最终性能及独立视觉审核门槛尚未闭合**。这是一项验收证据矛盾；不得据 `final-visual-handoff.md` 启动平台扩展，也不得宣称整体完成。无需用户输入。

## 证据

- Workbuddy 最终报告 `.ultra/reports/final-visual-handoff.md` 声称视觉收尾完成，但三轮同机 1080p 中画质测量：沙漠灰 P5 为 57/49/41（仅一轮达到 ≥55），运输船 median 48/50/47。报告自己列出安静主机 GPU 复测为未验证项。
- 2026-09-27 19:27–19:30 在 Workbuddy 互斥标记清除后，仅运行一次最终候选双图 GPU 测量；本机 AMD Radeon Pro 5500M、有头 Chrome、1920×1080、中画质、每图约 65 秒，加入 `--disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling`。原始数据为 `cf-transport-ship/artifacts/accept-gpu.json`：沙漠灰 median/P5 **45/31 FPS**，运输船 **39/29 FPS**；页面错误均为 0。此前 JSON 已另存 `accept-gpu-loaded-host-final.json`。测量前主机 load 6.21/5.45/9.17，结束时 17.69/14.07/11.98；主机负载随测量显著上升。当前证据无法判明代码回退还是系统竞争，但不能证明目标已达到。
- `.ultra/reports/workbuddy-visual-handoff.md:35` 要求独立 GLM MAX 核对参考图、截图、代码和原始测试数据。现有最终报告记录 Workbuddy A/B 子代理内部复核，没有看到本轮最后几何变更后独立 GLM MAX 的结论。旧的 `.ultra/reports/final-review.md` 与 `sol-final-review.md` 均早于该变更。
- 截图 `cf-transport-ship/artifacts/desert-overview.png` 已显示外围楼块连片，但沙漠灰整体布局/建筑轮廓是否达到用户所需的 CF 观感仍缺独立视觉结论。

## 下一步（23:00 后按额度执行）

1. 保留 Workbuddy 提交 `1ba7e44`、报告回填提交 `3316412`、此前 WIP 检查点 `7bf6872`；不要重做已经通过的 229 单测、40+6+34 浏览器场景、10 次重开或 600 秒长跑。
2. 新 GLM-5.3 MAX **只读**上下文审查最终参考/截图与性能证据，判定是否有具体视觉差距及 GPU 测量污染。重点比较同一主机、同一负载下的当前与原版运输船；若负载无法下降，做配对短时对照和帧时间/渲染统计，不能仅改 FPS 阈值求通过。必要的小修由 Flash 执行。
3. 只有在独立审核通过、沙漠灰 P5 ≥55 且运输船无实质回退得到可靠证据，或明确记录用户接受无法达标的性能限制后，才清除本文件、更新最终视觉交接并放行平台扩展。若问题属于硬件/系统长期竞争，应报告实测限制，不虚构 60 FPS。

不推送、不发布；此报告不是要求重复全量测试。
