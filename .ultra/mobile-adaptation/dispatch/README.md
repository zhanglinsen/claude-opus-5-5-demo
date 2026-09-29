# 并发调度说明（协调者手册）

用户指示（2026-09-30）：推送后尽快并发推进，任务尽量拆分；协调者负责进度协调与验收；**GLM 忙就先自己推进，定时轮询，GLM 没有任务时就用 GLM**。硬约束不变：不能影响性能优化任务（规格 US-M06），用户确认前不得把移动端工作合并到共享分支。

## 角色
- **协调者（Claude，本会话，在 `mobile-adaptation-plan` worktree）**：写契约与提示词、决定谁做什么、启动/监控 GLM lane、**验收**、把通过验收的 lane 分支合入 plan 分支、更新 `status.md`。
- **GLM 工作者**：一个 lane 一个进程、一个 worktree、一个分支；只改自己名下的文件；不 push。
- 协调者亲自做的 lane：L3b（关键路径）；GLM 忙时按优先级继续亲自做。

## Lane 与所有权
见 `contract.md` §1（文件所有权）与 `status.md`（当前状态）。任务与 lane 对应：

| lane | 任务 | 依赖（合入/验收顺序，不是开工顺序） | 提示词 |
|---|---|---|---|
| 地基 | 3a | 已完成 `6b84c28` | — |
| L1 | 1 | — | `prompts/L1.md` |
| L2 | 2 | 1 | `prompts/L2.md` |
| L3b | 3 | 地基、2 | 协调者自己做 |
| L4 | 4 | 地基 | `prompts/L4.md` |
| L5 | 5 | 地基 | `prompts/L5.md` |
| L6 | 6 | — | `prompts/L6.md` |
| L7 | 7 | 地基 | `prompts/L7.md` |
| L8 | 8 | 地基、6 | `prompts/L8.md` |
| L9 | 9 | 地基 | `prompts/L9.md`（只写不跑） |
| L10a | 10 文档 | L3b、L4、L7 已合入 | `prompts/L10a.md` |

`tasks.json` 的依赖表示**合入与验收顺序**；开工顺序被有意放宽：各 lane 只依赖 `contract.md`，不依赖彼此的实现，所以可以同时开始。

**GLM 派发优先级**（GLM 空闲时按此顺序取“todo”）：L1 → L2 → L6 → L4 → L5 → L7 → L8 → L9 → L10a。

## GLM 容量与账号
- 实测（2026-09-30 01:03）：可用额度 `bigmodel-3` GLM-5.3-Flash 补偿包 95.4M；`bigmodel-2` GLM-5.3 旗舰 2.49M。到期：旗舰 2026-09-30 23:59:59，Flash 补偿包 2026-10-01 00:00（北京时间）。
- 模型选择：实现类 lane 用 `glm-5.3-flash --effort high`；独立审核用**新上下文** `glm-5.3-flash --effort max`（只读）；旗舰 `glm-5.3` 只留给最终独立审核这类高价值、低 token 的环节。账号路由由本机 `zcode-kit` 代理自动完成，不手动切账号，不使用 `--show-key`。
- **GLM 判定空闲**：`python3 .ultra/mobile-adaptation/dispatch/poll.py` 输出“GLM 空闲”（所有账号最近使用距今 ≥180 秒）。
- **并发上限 3**（历史上第 4 个并发会话出现过 429）。遇到 429 不要高频重试，等下一次轮询。
- **不抢占别人**：判定“忙”时不启动 GLM lane；已在运行的 lane 不受影响。

## 启动一个 GLM lane（以 L1 为例；LANE、路径按需替换）
每步都是独立的简单命令，在 plan worktree 根目录执行：

```bash
# 1. 从 plan 分支当前提交建 lane 分支和 worktree（必须在提示词与契约已提交之后）
git worktree add -b claude/mobile-lane-L1 /Users/sen/workspace/AI/claude-opus-5-5-demo/.claude/worktrees/mobile-lane-L1 claude/cf-mobile-adaptation-plan
# 2. 接上依赖（符号链接，被 .gitignore 忽略；不安装、不联网）
ln -s /Users/sen/workspace/AI/claude-opus-5-5-demo/cf-transport-ship/node_modules /Users/sen/workspace/AI/claude-opus-5-5-demo/.claude/worktrees/mobile-lane-L1/cf-transport-ship/node_modules
# 3. 写启动提示（stdin），日志放仓库外
mkdir -p /private/tmp/cf-mobile-run
```
启动提示 `/private/tmp/cf-mobile-run/L1.prompt.md` 的内容：

> 你是 lane L1。当前目录是你独占的 git worktree（分支 claude/mobile-lane-L1）。请依次完整阅读并严格遵守：`.ultra/mobile-adaptation/dispatch/prompts/_common.md`、`.ultra/mobile-adaptation/dispatch/prompts/L1.md`，然后开始工作，结束前按要求写报告并提交。

```bash
# 4. 在 lane worktree 中后台启动（cwd = lane worktree）
cd /Users/sen/workspace/AI/claude-opus-5-5-demo/.claude/worktrees/mobile-lane-L1 && nohup zcode-kit run claude-code -- \
  --model glm-5.3-flash --effort high --permission-mode acceptEdits \
  --allowedTools 'Read' 'Glob' 'Grep' 'Edit' 'Write' \
    'Bash(nice -n 19 node --test --test-concurrency=1 *)' 'Bash(node cf-transport-ship/scripts/check-mobile-isolation.mjs*)' \
    'Bash(git status*)' 'Bash(git diff*)' 'Bash(git log*)' 'Bash(git add *)' 'Bash(git commit *)' \
    'Bash(ls *)' 'Bash(cat *)' 'Bash(mkdir *)' \
  --disallowedTools 'Bash(git push*)' 'Bash(git checkout*)' 'Bash(git switch*)' 'Bash(git reset*)' \
    'Bash(git rebase*)' 'Bash(git merge*)' 'Bash(git stash*)' 'Bash(npm *)' 'Bash(npx *)' \
  -p --output-format stream-json --verbose \
  < /private/tmp/cf-mobile-run/L1.prompt.md > /private/tmp/cf-mobile-run/L1.jsonl 2> /private/tmp/cf-mobile-run/L1.stderr &
```
结束判定：`L1.jsonl` 出现 `"type":"result"`（`poll.py` 已解析）。**只读日志，不向运行中的会话并发 `--resume`。**

## 验收清单（每个 lane 结束后，协调者亲自做，不采信 worker 的自述）
1. `git log --oneline claude/cf-mobile-adaptation-plan..claude/mobile-lane-<L>`：确认只有该 lane 的提交，信息为中文。
2. 隔离：`node cf-transport-ship/scripts/check-mobile-isolation.mjs --lane <L> --base claude/cf-mobile-adaptation-plan`（L1 合入后可用；此前用 `git diff --name-only <plan>...<lane>` 人工对照契约 §1）。**任何禁区或越权文件 → 拒收**。
3. 读完整 diff，逐项对照对应任务上下文的验收条目与契约；核对测试是否真的断言了行为（不是空断言、不是放宽阈值）。
4. **我自己**重跑该 lane 声称通过的测试命令（`nice -n 19 node --test --test-concurrency=1 …`），并跑兼容契约：`touch-i18n / i18n / game-i18n / hud-i18n / ad-session` 与 `tests/unit/mobile/layout-geometry.test.mjs`。
5. 合入：在 plan worktree `git merge --no-ff claude/mobile-lane-<L>`（提交信息中文）；合入后再跑一遍上一条。冲突只可能出现在 `style.css` 哨兵之间以外——出现即说明有人越权，回退并查原因。
6. 在 `status.md` 追加验收记录（commit、命令、结论），更新任务上下文的 `Completion` 与 `tasks.json` 状态。全部完成前不要把任务标 `completed`。
7. 拒收时：写明具体缺陷，用原会话 `--resume`（仅在该 lane 已结束时）或新起同 lane 修复；同一问题两轮仍失败 → 协调者自己接手。

## 轮询规程（定时任务触发时）
1. `python3 .ultra/mobile-adaptation/dispatch/poll.py`。
2. 有 lane 已结束 → 先验收（上面清单）。
3. GLM 判定空闲且有 todo lane → 按优先级启动，直到运行中 lane 数 = 3；启动前先在 `status.md` 标 `进行中(GLM)`。
4. GLM 忙 → 不启动 GLM；协调者继续按 `status.md` 里下一个 `todo`（优先关键路径）亲自做，**开始前先标 `进行中(自己)`**。
5. 全部 lane 完成并验收 → 进入收尾：全量兼容测试、隔离检查、独立审核（新上下文、只读）、汇总给用户，并 `CronDelete` 本轮询。
6. 每次轮询只做一小步并向用户汇报变化；无变化时一句话说明即可。

## 收尾与合并门
- 全部 lane 合入 plan 分支且验收通过后：`git log`/`diff --stat` 对 `perf-integration-20260929` 复核只有白名单文件；跑守卫；写最终汇总。
- **合并到共享分支（perf-integration / main）需用户明确确认**，并由用户指定目标与方式；确认前只在 plan 分支与本地 lane 分支上工作，plan 分支已推送，lane 分支不推送。
- 性能任务落地后需 rebase 时按任务 10 处理；冲突落在禁区文件则停下报告。
