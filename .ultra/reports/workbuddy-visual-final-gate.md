# Workbuddy 任务：双地图视觉与性能最终验收

执行目录：`/Users/sen/workspace/AI/claude-opus-5-5-demo`。当前分支 `codex/desert-grey`，基准提交 `3316412`（视觉源码提交 `1ba7e44`）。**仅收尾现有双地图游戏**；Y8、GameMonetize、多语言及平台地图阶段继续等待。

先运行 `bash .ultra/dispatch/start-workbuddy-visual-final-gate.sh`。它创建 `.ultra/reports/workbuddy-visual-in-progress.md` 互斥标记，避免 Codex 自动化同时启动 GLM 写入。不要调用旧的 `start-workbuddy-visual.sh`，它会因已有 `final-visual-handoff.md` 和 `BLOCKED.md` 拒绝启动。保持可恢复快照和已有提交，不重置或清理工作树。现有 `.workbuddy/` 属先前 Workbuddy 会话，勿覆盖。

## 模型与初始档位

- **Workbuddy 初始模型选 `GLM-5.3-Flash`；若可选推理档位，选 High。整个 Workbuddy 会话保持该模型，不要求也不假设 Workbuddy 能自动切换。**它负责协调、V/P 两路初步排查、明确的小修及针对性自测。今晚 23:00 前先核对实时额度；额度为零时不要反复请求模型。
- **`GLM-5.3 MAX` 指旗舰模型 `glm-5.3` 加 `--effort max`，不是 Flash 的另一个档位。**两路证据收束后，在 Workbuddy 终端以 `zcode-kit` 启动一个**独立 CLI 进程**，不要切换当前 Workbuddy 会话模型。将完整审查提示保存为 `.ultra/dispatch/workbuddy-final-max-review-prompt.md`，然后运行：

  ```bash
  zcode-kit run claude-code -- --model glm-5.3 --effort max -p --output-format stream-json --verbose < .ultra/dispatch/workbuddy-final-max-review-prompt.md > .ultra/dispatch/logs/workbuddy-final-max-review.jsonl
  ```

  审核提示须要求只读、独立结论、逐项列证据；先确认实时旗舰额度，额度为零则不要调用，也不得把 Flash 自审标为 MAX 审核。如果 Workbuddy 无法执行本地 CLI，先把提示文件写好并停在该交接点，向用户提供这条手动命令。
- GPT-6 Sol high 若用于最后聚焦复核，也从 Workbuddy 终端启动**独立 `codex exec` 只读进程**，不切换当前会话模型；调用至多一次。将聚焦提示保存为 `.ultra/dispatch/workbuddy-final-sol-review-prompt.md`，然后运行：

  ```bash
  codex exec -m gpt-6-sol -s read-only -c 'model_reasoning_effort="high"' --json -o .ultra/reports/workbuddy-final-sol-review.md - < .ultra/dispatch/workbuddy-final-sol-review-prompt.md > .ultra/dispatch/logs/workbuddy-final-sol-review.jsonl
  ```

  若 CLI 不能执行，同样只生成提示文件和手动命令。Astra low 不承担本任务的视觉/性能终验。不要把两个 MAX 会话或多个 Sol 会话作为默认配置。

## 事实与目标

- `.ultra/reports/final-visual-handoff.md` 已完成并提交，但 `.ultra/reports/BLOCKED.md` 记录了未闭合的性能与独立视觉审核门槛。先读两份报告、`.ultra/reports/workbuddy-visual-handoff.md`、`.ultra/reports/performance-contention-2026-09-27.md`。
- 最近四轮最终候选 GPU 数据见 `cf-transport-ship/artifacts/accept-gpu-unthrottled-run1.json`、`accept-gpu-unthrottled-run2.json`、`accept-gpu-loaded-host-final.json`、`accept-gpu.json`。最后一轮 1080p 中画质 Radeon Pro 5500M：沙漠灰 median/P5 45/31，运输船 39/29；测量中主机 load 从约 6 升到约 18。目标是沙漠灰 P5 ≥55，运输船无实质回退；当前不能把低帧率直接归因于代码，也不能宣称性能通过。
- 最终几何截图在 `cf-transport-ship/artifacts/desert-overview.png` 与 `desert-landmark-*.png`。参考图在 `cf-transport-ship/artifacts/dg-ref/`、`dg-ref2/`。用户重点关注 **整体布局与建筑轮廓**，以及两张地图相近的制作完成度。
- 已有 229/229 单测、e2e-bomb 40/40、loadout/ping 6/6、e2e-desert 34/34、10 次重开和先前 603.5 秒长跑。不要整套重跑；只验证受新改动影响的项。

## 两路并行，隔离上下文

Workbuddy 同时下发两个独立子任务；每路分别写报告，主协调器仅做集成。两路分析时都不改游戏源码。

### V 路：独立视觉审核（只读，可与 P 路并行）

1. 用全新上下文对照参考图、最终双图截图与 `src/maps/desert-grey.js`、`src/maps/transport-ship.js`。逐点判断前院、A 大/坑/平台、小道、中路、桥下、B 洞/门/窗/点及运输船是否达到约定轮廓、视线和完成度。区分参考可证实的差距与分辨率不足的猜测。
2. 只读取已经存在的截图，**不启动浏览器、GPU、build 或测试**，避免干扰 P 路测量。给出最多 5 项按玩家可见影响排序的具体差距，附参考与游戏截图路径、可改文件、验收方式。没有确定差距也明确写出依据。
3. 23:00 后额度可用时，用新的 GLM-5.3 旗舰 MAX 只读 CLI 上下文做正式独立结论；若未有额度，先提交 Workbuddy 的初步报告，不假称 GLM 已审核。结果写 `.ultra/reports/workbuddy-final-visual-review.md`。

### P 路：性能证据与瓶颈（独占浏览器/GPU，可与 V 路并行）

1. 先核对 FPS 脚本、显示/遮挡节流、Chrome 参数、主机 load、GPU 型号、帧时间与既有数据。不要重复已经确认失败的全量长测，也不要把低负载瞬时值当作整个测量窗口的负载。
2. 在**没有其他浏览器/GPU 测试**时，做最小同机配对对照：最终候选与运输船旧基线（可从 `c935ace` 建只读临时工作树；确认构建和地图配置可比）在相邻时间、同分辨率/画质/视角/时长/Chrome 参数下串行测量。每段记录运行前、中、后的主机负载、GPU renderer、median/P5、帧时间和页面异常；原始输出使用新文件名，勿覆盖已有 JSON 或截图。先用短采样判断方法有效，再只对可靠候选做每图 ≥60 秒正式测量。
3. 若主机竞争持续，明确区分系统瓶颈与代码瓶颈；可用渲染统计或删减法定位，但一次只改一个因素。严禁只改断言、阈值或脚本选样让结果变绿。结果写 `.ultra/reports/workbuddy-final-performance.md`，附原始产物路径和可复现命令。

## 分析后实施与集成

- V 路若确认视觉差距，GLM-5.3-Flash 只改 `cf-transport-ship/src/maps/desert-grey.js` 及其独占的地图文件；P 路若确认代码瓶颈，另一 Flash 任务只改性能归因指向的渲染/运输船文件。先确定文件所有权，两个写入者最多并发两路；冲突时串行。不要让任何代码改动与正式 GPU 测量重叠。
- 两路报告收束后由一名集成者 build 最终候选，运行受改动影响的路线/功能冒烟、双地图同机 GPU 测量和必要的资源检查。仅在改动持续运行的资源分配、渲染循环或音频生命周期时重跑 ≥600 秒长跑。
- GLM MAX 独立结论与可信性能数据齐备后，才使用**一次 GPT-6 Sol high 只读聚焦终验**（仅视觉差距、性能归因、双地图回退与证据完整性；不重做全项目审核）。发现阻塞缺陷交 Flash 定向修复，再只复核受影响项。若 GLM 已充分解决且 GPT 额度不适合，可把 Sol 步骤保留为明确的未执行项，不得冒称完成。
- 达到门槛后更新 `.ultra/reports/final-visual-handoff.md`，附新审核与性能数据；清除 `.ultra/reports/BLOCKED.md`；选择性本地 Git 提交源码、必要测试及报告，记录哈希，不提交临时日志/性能产物/快照，不推送、不发布。确认无活跃子任务后删除 Workbuddy 互斥标记。然后平台扩展自动化才可启动。
- 若可信测量仍未达目标或视觉差距无法合理解决，保留并更新 `BLOCKED.md`，注明数据、已经尝试的两轮修复与下一步；停止写入后清除互斥标记，让旧阶段自动化接续。不要以“最佳一次达到”为整体通过依据。

## 主协调器最终输出

简要列出 V/P 两路结论、确切 FPS 数据与测量条件、最终审核结论、改动/测试范围、提交哈希及剩余限制。不要把原 `final-visual-handoff.md` 的存在当成上述新门槛已通过。
