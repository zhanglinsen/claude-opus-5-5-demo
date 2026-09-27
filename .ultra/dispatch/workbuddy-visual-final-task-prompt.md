# 发给 Workbuddy 的任务：双地图视觉与性能最终收尾

你只负责 `/Users/sen/workspace/AI/claude-opus-5-5-demo/cf-transport-ship` 的**沙漠灰 + 运输船**视觉与性能最终验收。不要启动多语言、Y8、GameMonetize 或平台原创地图阶段；不推送、不发布。当前代码和视觉收尾已有本地提交，保留全部进度、快照与 `.workbuddy/`，不要 `git reset --hard`、`git clean` 或批量 `git add -A`。

## 0. 模型、启动与互斥

- 当前 Workbuddy 会话固定使用 **GLM-5.3-Flash / High**。Workbuddy 不能自动切换模型，不要在会话里假装切换。V/P 初步排查、定向修复、自测均由 Flash 完成。
- **GLM-5.3 旗舰 MAX** 是独立 `zcode-kit` CLI 进程：模型 `glm-5.3`、`--effort max`，用于最终只读视觉和性能方法审核。先查实时额度；没有额度时不得用 Flash 自审冒充 MAX。最后的 **GPT-6 Sol high** 也是独立 `codex exec` 只读进程，最多一次聚焦终验；两者都不改变本 Workbuddy 会话模型。若 Workbuddy 无法执行 CLI，生成完整提示文件和手动命令，停在审核交接点并如实报告。
- 在终端先运行：

  ```bash
  cd /Users/sen/workspace/AI/claude-opus-5-5-demo && bash .ultra/dispatch/start-workbuddy-visual-final-gate.sh
  ```

  这会创建 `.ultra/reports/workbuddy-visual-in-progress.md` 互斥标记并输出详细交接文档。标记存在期间 Codex 自动化不得并发改工程。工作进行中更新标记的阶段与 `updated_at`；所有子任务和写入进程结束后才删除标记。若标记已存在，先核对活跃任务，不要重复启动。

## 1. 先核对事实，不重复已完成工作

依次读 `.ultra/reports/workbuddy-visual-final-gate.md`、`.ultra/reports/BLOCKED.md`、`.ultra/reports/final-visual-handoff.md`、`.ultra/reports/performance-contention-2026-09-27.md`。当前基准提交为 `45b373d`；视觉源码提交 `1ba7e44`，报告回填 `3316412`。当前 blocker 是**性能门槛缺可靠证据**和**最后几何变更缺独立 GLM MAX 审核**，不是玩法功能重做。

最后一轮有头 Chrome、AMD Radeon Pro 5500M、1920×1080、中画质的结果：沙漠灰 median/P5 **45/31 FPS**，运输船 **39/29 FPS**；主机负载在测试中显著上升。原始数据在 `cf-transport-ship/artifacts/accept-gpu.json`，历史对照在同目录 `accept-gpu-unthrottled-run1.json`、`accept-gpu-unthrottled-run2.json`、`accept-gpu-loaded-host-final.json`。这不能直接证明代码回退，也不能证明目标达成。目标：沙漠灰 P5 ≥55 FPS，运输船无实质回退。已有 229 单测、40/40 爆破浏览器场景、6/6 装备与 ping、34/34 地图路线、10 次重开和以前的 603.5 秒长跑；不重跑无关项。

## 2. 两路并行，分析期均不改游戏源码

**V 路：视觉与布局审核。**单独上下文，只读现有 `cf-transport-ship/artifacts/dg-ref/`、`dg-ref2/` 参考图及 `desert-overview.png`、`desert-landmark-*.png` 最终截图，结合沙漠灰与运输船地图源码。逐点审查用户特别指出的**整体布局与建筑轮廓**，以及出生点、A 大/坑/平台、小道、中路、桥下、B 洞/门/窗/点和运输船制作完成度。给出最多 5 项确证差距，附参考图与游戏截图路径、玩家可见影响、拟改文件和验收方式；无法从低清参考确认的事项明确列为不确定。V 路不启动浏览器、GPU、构建或测试，以免污染 P 路。初步结果写 `.ultra/reports/workbuddy-final-visual-review.md`，最后再交全新 GLM MAX CLI 独立审核。

**P 路：性能测量与归因。**独占 Chrome/浏览器/GPU；先检查 `scripts/accept-gpu.mjs` 的采样、窗口遮挡节流、画质和视角、系统竞争、GPU renderer、帧时间。若环境允许，以最终候选和旧运输船基线（可从 `c935ace` 建只读临时工作树，先确认配置可比）做**相邻时间、相同条件的串行配对测量**。先短采样验证方法，再对稳定候选各做 ≥60 秒正式测量；记录测量前/中/后负载、renderer、median/P5、帧时间和页面异常。每轮数据用新文件名保存，绝不覆盖现有 JSON 或截图。环境仍持续争用时，继续用配对数据和渲染统计定位，不能只改 FPS 阈值或挑选最好的一轮求绿。结果写 `.ultra/reports/workbuddy-final-performance.md`。

两路分析可同时进行，浏览器/GPU 作业必须串行；禁止 V 路临时开浏览器截图。两路都完成前不让任何人改共享主控、渲染入口或构建产物。

## 3. 定向修复、独立审核、最终验收

- 若 V 路找到确定的视觉差距，Flash 独占沙漠灰地图文件修复；若 P 路定位到代码瓶颈，另一 Flash 任务独占其指向的渲染/运输船文件。只有文件所有权互斥时才并发写入；有冲突就串行。修复后只跑受影响的地图路线、功能冒烟或性能测量。所有代码修改结束后由一名集成者重新 build，最终 GPU 测量期间不再并发改代码。
- 用全新 `glm-5.3 --effort max` CLI 上下文**只读**核对参考图、最终截图、代码、两路报告和 GPU 原始数据。具体命令及提示文件约定见 `.ultra/reports/workbuddy-visual-final-gate.md`。输出独立结论，不能把 Flash 产出的报告改名当 MAX 审核。
- 证据齐备后，运行一次 `gpt-6-sol`、`model_reasoning_effort="high"`、`-s read-only` 的聚焦终验，仅审视觉差距、性能归因、运输船回退、证据完整性；不要重新做全项目审核。若发现阻塞缺陷，交 Flash 定向修复，仅复核受影响项。Sol CLI 命令和提示文件约定同见交接文档。
- 最终候选须有可信的同机 1080p 中画质数据：沙漠灰 P5 ≥55 FPS，运输船无实质回退，或如实指出无法达标并保留 blocker 等待用户决策。原有 600 秒长跑可沿用；只有修改持续运行的资源分配、渲染循环或音频生命周期时才重跑。

## 4. 关单和交付

通过后更新 `.ultra/reports/final-visual-handoff.md`，写清参考/截图、V/P 结论、GLM MAX 与 Sol 只读审核、性能原始数据和局限；删除 `.ultra/reports/BLOCKED.md`；选择性本地 Git 提交源码、必要测试、交接报告与 blocker 删除，记录完整哈希。不要提交临时日志、性能产物、快照或 `.workbuddy/`；不推送、不发布。确认没有活跃子任务后删除 Workbuddy 互斥标记，平台扩展自动化才可继续。

若仍不能可靠测量、未达门槛或独立审核指出阻塞问题，更新并保留 `BLOCKED.md`，写具体复现、数据、已尝试修复和下一步；停止所有写入后清除互斥标记。最终回复给用户必须明确“已通过 / 仍阻塞”，列出精确 FPS、审核结论、提交哈希和未解决事项，不因 `final-visual-handoff.md` 已存在就宣布验收通过。
