#!/usr/bin/env bash
set -euo pipefail

project_root=/Users/sen/workspace/AI/claude-opus-5-5-demo
cd "$project_root"

handoff=.ultra/reports/workbuddy-visual-final-gate.md
marker=.ultra/reports/workbuddy-visual-in-progress.md
platform_marker=.ultra/reports/platform-expansion-in-progress.md

[[ -f "$handoff" ]] || { printf '缺少任务文档：%s\n' "$handoff" >&2; exit 2; }
[[ -f .ultra/reports/BLOCKED.md ]] || { printf '当前没有验收差距记录，先核对是否已完成。\n' >&2; exit 2; }
[[ ! -e "$platform_marker" ]] || { printf '平台扩展已有活跃标记，先协调，避免并发改工程。\n' >&2; exit 2; }
if [[ -e "$marker" ]]; then
  printf 'Workbuddy 互斥标记已存在，先确认是否有活跃任务：%s\n' "$marker" >&2
  cat "$marker" >&2
  exit 2
fi

set -C
cat > "$marker" <<EOF
# Workbuddy 正在进行双地图最终验收

owner: Workbuddy
started_at: $(date '+%Y-%m-%dT%H:%M:%S%z')
updated_at: $(date '+%Y-%m-%dT%H:%M:%S%z')
stage: two-lane review and performance diagnosis
handoff: $handoff
base_head: $(git rev-parse --short HEAD)
EOF
set +C

printf '已创建互斥标记：%s\n\n' "$marker"
cat "$handoff"
