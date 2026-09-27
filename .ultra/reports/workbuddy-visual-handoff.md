# Workbuddy 执行交接：先完成双地图视觉收口

更新：2026-09-27 17:40 Asia/Shanghai。工程根目录：`/Users/sen/workspace/AI/claude-opus-5-5-demo`，游戏在 `cf-transport-ship/`，当前分支 `codex/desert-grey`。**这是旧双地图/视觉任务的交接，不是新 Y8/GameMonetize 阶段。**

## Workbuddy 聊天框直接粘贴

> 在 `/Users/sen/workspace/AI/claude-opus-5-5-demo` 继续完成双地图游戏的最终视觉与性能验收。开始前创建并更新 `.ultra/reports/workbuddy-visual-in-progress.md`，写明开始时刻、负责者、当前阶段和日志路径；这是防止 Codex 23:00 自动化重复启动 GLM 的互斥标记。先读 `.ultra/reports/workbuddy-visual-handoff.md`、`visual-quality-in-progress.md`、`architectural-fidelity-progress.md`、`visual-parallel-acceleration.md`、`sol-final-review.md` 及项目已有截图与测试原始结果。不要把历史 `final-handoff.md` 当最终视觉完成。已有 WIP 检查点提交和快照必须保留，不要重置工作树。
>
> 按本文的 A/B 独立文件领域并发处理，最多两个实际写入者；浏览器/GPU 验证串行。每次仅做受改动影响的测试，已通过且未受影响的证据沿用。等候实际 GLM 额度可用后优先通过 `zcode-kit run claude-code -- --model glm-5.3-flash --effort high` 将明确的小修交给 GLM；独立新上下文做复核。当前任务结束前不启动 `.ultra/next-stage/` 中的平台 SDK/多语言开发。
>
> 冻结候选后完成同机 1080p 中画质双图实测、必要资源检查和已发现四项功能问题的定向复核；生成 `.ultra/reports/final-visual-handoff.md`，写清实测/沿用/未验证证据。旧视觉阶段验收通过后，选择性提交源码、必要测试与文档（不提交临时日志、性能产物、快照；不推送），记录提交哈希。清除互斥标记前确认无活跃 Workbuddy 写入任务。若真实阻塞，写 `.ultra/reports/BLOCKED.md`，包含复现、两轮修复和未完成门槛。最后向用户报告完成情况、提交哈希和仍需输入的事项。

## 事实与未完成门槛

- 原六阶段功能、军衔装备、本地存档与离线单 HTML 已有历史报告；`.ultra/reports/final-handoff.md` 只对应旧六阶段，视觉补充未结束。当前不存在 `final-visual-handoff.md` 或 `BLOCKED.md`。
- 新建筑调整：前院街屋、A 凹台与坡道、B 半露天梁架；地图/高度导航单测 28/28、沙漠灰 e2e 34/34（123 条边、97 节点），详见 `architectural-fidelity-progress.md`。
- Sol xhigh 终验在 `sol-final-review.md` 指出四项：错误包点远距离拆包、爆破 HUD 显示 0:00/目标 50、装备预设未决定出生主武器、伪造本地 ping。后续报告称已修，仍需对修复做**定向复核**，不要重复全项目终验。
- 之前 Radeon Pro 5500M 双图 GPU 数据、603.5 秒真实渲染/10 次重开存在，但拍摄早于最后环境与建筑几何变化；必须在安静主机上对最终候选重新测双图 1080p 中画质。沙漠灰 P5 目标 ≥55 FPS、运输船无实质回退。旧 600 秒证据可沿用，但要准确披露适用范围；仅在持续运行的资源分配/渲染循环/音频生命周期变更时重跑长测。
- 参考与候选图：`cf-transport-ship/artifacts/dg-ref2/`、`artifacts/visual-candidate/`。经典攻略图分辨率不足以推断精确尺寸。Luna 单项 A 平台试跑没有改动或测试，见 `luna-visual-trial.md`；别把它当视觉通过证据。
- 2026-09-27 17:21 GLM 两个已有账号余额均为 0；用户说 23:00 有新的 Flash 额度。以届时实时 `zcode-kit accounts quota` 为准，避免额度为零时反复启动。`zcode-kit` 代理曾无响应，现已重启；若再失败先检查 `zcode-kit proxy status`。
- 当前双地图源码、必要测试、图标和协作文档已有本地 WIP 检查点提交（以 `git log -1` 的最新哈希为准；该提交**不代表最终验收**）。后续视觉修复另行提交。可恢复快照在 `.ultra/snapshots/visual-wip-20260927-171454+0800/`。不要 `git reset --hard`、`git clean`、覆盖快照或批量 `git add -A`。

## 可并发的两路与文件所有权

1. A：对照建筑**整体布局与轮廓**，只改 `src/maps/desert-grey-layout.js`、`src/maps/desert-grey.js`、`src/maps/desert-grey-materials.js` 和地图专属测试。先看现有前院/A/B 实景；只有明确可证明的差距才改，不为增加细节而改。几何变更要验证碰撞、导航和关键视线。
2. B：只核对 Sol 四项修复；如仍有缺陷，独占 `src/modes/bomb.js`、`src/hud.js`、`src/game.js`、`src/actor.js` 和对应聚焦单测。A 不修改这些文件。四项逐条写通过/未通过与证据。

共享 `render.js`、`build.mjs`、全局环境与构建入口如确需修改，待 A/B 收束后只由一名集成者写入。总 GLM CLI 会话不超过 3 个（含协调器）；不要让多个浏览器/GPU 作业并发。

## 最小测试与最终证据

- 几何改动：`cd cf-transport-ship && node --test tests/unit/desert-layout.test.mjs tests/unit/height-navigation.test.mjs`；如影响走位，再跑一次 `E2E_ROUTE_ONLY=1 node scripts/e2e-desert.mjs`。不要每次拍十机位。
- 规则改动：只跑对应 `bomb-core`、`hud-mode`、`profile-core` 等测试及一条实际浏览器场景；错误包点/同包点远距离拆包必须拒绝，正确包点近距离拆包必须完成。
- 候选冻结：`npm run build`，一次双方出生点至 A/B 物理路线、运输船启动/射击冒烟；同机 1080p 中画质双图 GPU 各一次；10 次重开一次。实测机型、分辨率、画质、median/P5、资源指标写原始结果和报告。
- 独立 GLM MAX 核对参考图、当前截图、代码和原始测试数据；Sol 仅针对其四项功能阻塞复核。修复后只复测受影响项。最终报告不得把软件渲染 FPS 当真机 GPU 成绩。

## 与下一阶段衔接

新阶段的已验证计划草案在 `.ultra/specs/platform-expansion.md` 和 `.ultra/next-stage/`，含多语言、三张工作室图标、Y8/GameMonetize SDK 与双地图原创平台版。三张原图已保存于 `cf-transport-ship/src/assets/studio/`。只有本任务 `final-visual-handoff.md` 和本地提交完成后，23:00 平台扩展自动化才应归档旧任务并发布新任务记录。不要提前覆盖 `.ultra/tasks/tasks.json`。

## 终止与恢复规则

启动时写 `workbuddy-visual-in-progress.md`；每个阶段更新其 `updated_at`、会话/进程和日志路径。完成或放弃时确认无活跃写入者，再删除标记；最终交付文件或 `BLOCKED.md` 保留。Codex 的旧视觉自动化会以此标记避免重复启动。若 Workbuddy 中断，先看标记时间、CLI 日志、Git 状态与报告，再续跑，不能盲目启动第二批写入者。
