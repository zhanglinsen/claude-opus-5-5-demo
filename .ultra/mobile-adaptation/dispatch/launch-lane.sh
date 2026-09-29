#!/bin/bash
# 启动一个 GLM lane 工作者。用法：launch-lane.sh <lane> <worktree路径> <模型> <effort> <impl|review|smoke>
#   提示词从 /private/tmp/cf-mobile-run/<lane>.prompt.md 读取；事件写 <lane>.jsonl（smoke 写 <lane>.txt），错误写 <lane>.stderr。
#   实际使用的副本在 /private/tmp/cf-mobile-run/launch-lane.sh；本文件是留档，两者内容一致。
set -u
LANE="$1"; WT="$2"; MODEL="$3"; EFFORT="$4"; KIND="$5"
RUN=/private/tmp/cf-mobile-run
cd "$WT" || { echo "worktree 不存在：$WT" >&2; exit 3; }

# 干净环境：不继承调用方（Claude 桌面会话）的 ANTHROPIC_BASE_URL / CLAUDE_CODE_* / HTTP(S)_PROXY，
# 否则子进程会把请求送去桌面端网关而不是本地 GLM 代理，得到 401 Invalid bearer token。
# （2026-09-30 实测：直接在桌面会话里运行 zcode-kit run claude-code 会 401，用本脚本的干净环境则正常。）
CLEAN=(env -i HOME="$HOME" PATH="$PATH" TMPDIR="${TMPDIR:-/tmp}" LANG="${LANG:-en_US.UTF-8}")

IMPL_ALLOW=(
  'Read' 'Glob' 'Grep' 'Edit' 'Write'
  'Bash(nice -n 19 node --test --test-concurrency=1 *)'
  'Bash(node cf-transport-ship/scripts/check-mobile-isolation.mjs*)'
  'Bash(git status*)' 'Bash(git diff*)' 'Bash(git log*)' 'Bash(git add *)' 'Bash(git commit *)'
  'Bash(ls *)' 'Bash(cat *)' 'Bash(mkdir *)'
)
DENY=(
  'Bash(git push*)' 'Bash(git checkout*)' 'Bash(git switch*)' 'Bash(git reset*)'
  'Bash(git rebase*)' 'Bash(git merge*)' 'Bash(git stash*)' 'Bash(npm *)' 'Bash(npx *)'
)

case "$KIND" in
  smoke)
    exec "${CLEAN[@]}" zcode-kit run claude-code -- --model "$MODEL" --effort "$EFFORT" --permission-mode plan \
      -p --output-format text < "$RUN/$LANE.prompt.md" > "$RUN/$LANE.txt" 2> "$RUN/$LANE.stderr"
    ;;
  impl)
    exec "${CLEAN[@]}" zcode-kit run claude-code -- --model "$MODEL" --effort "$EFFORT" --permission-mode acceptEdits \
      --allowedTools "${IMPL_ALLOW[@]}" --disallowedTools "${DENY[@]}" \
      -p --output-format stream-json --verbose < "$RUN/$LANE.prompt.md" > "$RUN/$LANE.jsonl" 2> "$RUN/$LANE.stderr"
    ;;
  review)
    exec "${CLEAN[@]}" zcode-kit run claude-code -- --model "$MODEL" --effort "$EFFORT" --permission-mode plan \
      --tools 'Read,Glob,Grep,Bash' \
      --allowedTools 'Read' 'Glob' 'Grep' 'Bash(nice -n 19 node --test --test-concurrency=1 *)' \
        'Bash(git diff*)' 'Bash(git log*)' 'Bash(git show*)' 'Bash(git status*)' 'Bash(ls *)' 'Bash(cat *)' \
      --disallowedTools Edit Write NotebookEdit 'Bash(git push*)' 'Bash(git commit*)' 'Bash(git add*)' 'Bash(npm *)' 'Bash(npx *)' \
      -p --output-format stream-json --verbose < "$RUN/$LANE.prompt.md" > "$RUN/$LANE.jsonl" 2> "$RUN/$LANE.stderr"
    ;;
  *) echo "未知类型：$KIND" >&2; exit 2 ;;
esac
