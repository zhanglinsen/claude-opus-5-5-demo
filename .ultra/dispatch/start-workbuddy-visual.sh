#!/usr/bin/env bash
set -euo pipefail

project_root=/Users/sen/workspace/AI/claude-opus-5-5-demo
cd "$project_root"

handoff=.ultra/reports/workbuddy-visual-handoff.md
marker=.ultra/reports/workbuddy-visual-in-progress.md

if [[ -f .ultra/reports/final-visual-handoff.md ]]; then
  printf '视觉任务已有最终交付文件；先核对，不要重复启动。\n' >&2
  exit 2
fi
if [[ -f .ultra/reports/BLOCKED.md ]]; then
  printf '存在 BLOCKED.md；先处理记录的阻碍。\n' >&2
  exit 2
fi
if [[ -e "$marker" ]]; then
  printf 'Workbuddy 执行标记已存在，先检查是否仍有活跃任务：%s\n' "$marker" >&2
  cat "$marker" >&2
  exit 2
fi

cat > "$marker" <<EOF
# Workbuddy 正在收尾双地图及视觉任务

owner: Workbuddy
started_at: $(date '+%Y-%m-%dT%H:%M:%S%z')
updated_at: $(date '+%Y-%m-%dT%H:%M:%S%z')
stage: reading handoff
handoff: $handoff
EOF

printf '已创建互斥标记：%s\n\n' "$marker"
cat "$handoff"
