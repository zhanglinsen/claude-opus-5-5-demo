# GLM 自主执行交接（2026-09-27）

## 授权和角色

用户已批准在现有 `cf-transport-ship/` 完成双地图枪战游戏，并明确要求尽量使用即将到期的 GLM-5.3-Flash 额度。GPT-6 Astra 到此完成复杂计划和接口划分；常规实现、测试、修复、任务调度由 CLI GLM-5.3-Flash HIGH 执行，独立审核和复核由**新上下文** CLI GLM-5.3-Flash MAX 执行。不要启动 Codex Sol。仅当架构/接口冲突无法由文件所有权解决、同一功能缺陷两轮修复仍失败、或验收证据相互矛盾时，写 `BLOCKED.md` 并停止受阻分支，请 GPT 介入。其余独立分支继续推进，不等待日常批准。

依据：用户原始交付计划、后续关于 GLM MAX 代替 Sol、并发、必要测试、TDD/SOLID、本地军衔装备的指令；详细范围在 `.ultra/specs/desert-grey.md`、`.ultra/tasks/tasks.json` 和 `.ultra/reports/parallel-roadmap.md`。

## 当前正在运行的三路任务

| lane | 日志 | CLI 会话 ID | 独占文件 |
|---|---|---|---|
| 爆破规则 | `/private/tmp/cf-desert-grey-run/phase-3-rules.jsonl` | `de76b9b4-d4ae-49cd-8898-79dca08d25b2` | `game.js`、`modes/index.js`、`bomb-session.js`、`maps/registry.js`、专属测试/报告 |
| 目标 AI | `/private/tmp/cf-desert-grey-run/phase-3-ai.jsonl` | `3a6bbd89-aa1e-4f62-ad24-cfb9131686b9` | `bots.js`、专属测试/报告 |
| 输入/HUD | `/private/tmp/cf-desert-grey-run/phase-3-ui.jsonl` | `35928803-063f-4f0a-9107-aa9cdc973dbd` | `player.js`、`hud.js`、`touch.js`、`viewmodel.js`、`guns.js`、样式/HTML、专属测试/报告 |

解析 JSONL 中的 `type=result` 判断是否结束；只读日志，不向运行中的会话并发 `--resume`。首次运行协调器时，上面三路可能已有结果，请以实际日志为准。三个任务的完整提示在 `.ultra/reports/phase-3-{rules,ai,ui}-prompt.md`，共享接口在 `.ultra/reports/phase-3-parallel-contract.md`。

## 调度程序

1. **容量**：该提供方曾在第四个并发会话返回 429。协调器自身计入容量，总并发不得超过 3；只有两个其它会话时不再启动子任务。某任务结束后释放槽位。不要高频轮询或反复重试 429。
   协调器若需要读 `/private/tmp/cf-desert-grey-run/` 的历史 JSONL，应通过 CLI `--add-dir /private/tmp/cf-desert-grey-run` 授权该日志目录；Claude Code 默认工作目录限制会拒绝 `tail`/`ls` 直接读该路径。续跑命令已在 watchdog 中加此参数。阶段状态也可通过工作区内报告和 CLI 进程的 result 事件核对。
2. **阶段 3 收口**：先修复 `BombMatch` 玩家数字 ID 0 的 falsy 边界；已备提示 `.ultra/reports/bomb-zero-id-fix-prompt.md`，只写 `bomb.js`/其测试，必须观察 RED→GREEN。如果规则 lane 已经用了稳定字符串 ID 适配且测试覆盖实际玩家 0 携包、安包、死亡掉包，可以省去核心修复。三路结束后，复用 RULES 原会话串行做合流和必要浏览器用例；AI/UI 专属缺陷分别回原会话。冻结源码后至少两个新 MAX 上下文并行只读审核（规则/C4 与 AI/UI/架构），确认缺陷回原 lane 修复，再新 MAX 定向复核。阶段 3 未过门禁不要宣布完整爆破玩法。
3. **并行波次**：按 `.ultra/reports/parallel-roadmap.md` 的 C/D/E 波执行。C 波把战斗/投掷物、练习场景/靶体、沙漠灰材质/几何分到互斥文件；D 波对 `Game`/`HUD` 的接线顺序执行。早期纯模块不等于已接入游戏。每路前写明确提示、所有权、接口和验收；必要行为按红→绿→重构。文件冲突立即暂停其中一路并调整所有权。
4. **军衔装备**：`src/profile/` 已有纯领域/仓储/服务和 12 个聚焦测试，但未接入浏览器。先新 MAX 只读复核最后的完整性修复（`.ultra/reports/profile-integrity-fix.md`），再在独占模块中构建适配器；最终完成持久化、结果 XP 去重、军衔、三套预设在菜单中选择并在实际对局装备生效。只展示已实现的枪械、投掷物、护甲。
5. **画面与性能共同验收**：白模已过路线门禁，画面阶段对照参考俯视图和关键视角（潜伏者出生点、A 大/平台/小道、中门/桥下、B 洞上下层/B 门/B 窗/B 点、保卫者出生点），检查轮廓、通道尺度、掩体、材质磨损、日照/洞内明暗及交火视线。高/中/低画质都要保持地标辨识与玩法碰撞一致。中画质 1080p 以接近 60 FPS 为**优化目标**，在真实 GPU 浏览器上记录设备、渲染器、画质、分辨率、FPS 中位数和低帧/帧时间，不把软件渲染当作目标硬件成绩；不达目标就按测得瓶颈优化阴影、静态几何合批/实例化、材质/贴图、可见性和粒子预算，并复测，不能单纯削掉关键地标。完整候选版才运行一次至少 20 个固定种子爆破回合、至少 600 秒实际渲染运行（模拟推进不算），在同一长时运行中抽样 FPS、错误数和资源增长；另覆盖两地图、桌面/手机横屏、HTTP 与 `file://`、离线资源。保存对照截图、测试记录、实际硬件/渲染器与 FPS；修复后只重跑受影响证据。最终输出一个离线 HTML、源码、本地访问地址、操作说明和独立 MAX 最终审核报告。
6. **阶段记录**：每个独立审核通过后更新 `.ultra/tasks/tasks.json` 和 `.ultra/reports/execution-state.md`。阶段 1 的 Sol 历史审核只作历史证据；后续一律 GLM MAX。计划校验目前仅因 `.ultra/tasks/contexts/` 下 8 个历史并行提示多于 task-1…task-7 而失败；活动任务完成后，把这些历史提示移动到 `.ultra/dispatch/` 等非 contexts 目录，再运行 validator。不要在活动进程可能读文件时移动。

## CLI 模板

实现/修复：

```bash
zcode-kit run claude-code -- --model glm-5.3-flash --effort high \
  --permission-mode acceptEdits \
  --allowedTools 'Bash(node *)' 'Bash(npm *)' 'Bash(npx *)' 'Bash(python3 *)' 'Bash(mkdir *)' 'Bash(git status *)' \
  -p --output-format stream-json --verbose < PROMPT > EVENTS 2> STDERR
```

审核/复核：

```bash
zcode-kit run claude-code -- --model glm-5.3-flash --effort max \
  --permission-mode plan --tools 'Read,Glob,Grep,Bash' \
  --allowedTools 'Read' 'Glob' 'Grep' 'Bash(node --test *)' 'Bash(node --input-type=module *)' 'Bash(git diff *)' 'Bash(git status *)' \
  --disallowedTools Edit Write NotebookEdit \
  -p --output-format stream-json --verbose < REVIEW_PROMPT > REVIEW_EVENTS 2> REVIEW_STDERR
```

所有事件和提示保存在 `.ultra/reports/` 或 `/private/tmp/cf-desert-grey-run/`，报告要写实际命令/结果，不编造已验证状态。修复可用已验证 CLI 会话 ID 的 `--resume`，审核必须新上下文。不要提交、推送、部署或修改全局配置。原始实验来源保留在 README。

## 交回 GPT 的信号

如果遇到上述真正阻碍，在 `.ultra/reports/BLOCKED.md` 写：具体症状、复现步骤、受影响文件、已尝试的两种修复及其证据、目前可独立推进的工作。用户可以把文件发给 GPT；无需在正常阶段性进展时调用 GPT。完成时写 `.ultra/reports/final-handoff.md`，列出产物、未满足项和证据链接，供 GPT 做一次简短交付核对。
