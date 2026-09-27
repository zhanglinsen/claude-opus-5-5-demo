"""Resume a completed GLM coordinator session until the handoff or blocker exists.

This watchdog never edits product files. It only launches the same authorized
GLM CLI coordinator after its previous invocation has finished.
"""

import json
import pathlib
import subprocess
import sys
import time


ROOT = pathlib.Path('/Users/sen/workspace/AI/claude-opus-5-5-demo')
LOGS = pathlib.Path('/private/tmp/cf-desert-grey-run')
VISUAL = '--visual' in sys.argv
VISUAL_LOGS = ROOT / '.ultra/dispatch/logs'
DONE = ROOT / ('.ultra/reports/final-visual-handoff.md' if VISUAL else '.ultra/reports/final-handoff.md')
BLOCKED = ROOT / '.ultra/reports/BLOCKED.md'
PROMPT = ROOT / ('.ultra/reports/visual-quality-continue.md' if VISUAL else '.ultra/reports/glm-coordinator-continue.md')


def result_and_session(path):
    session = None
    result = None
    try:
        with path.open(encoding='utf-8', errors='replace') as stream:
            for line in stream:
                try:
                    row = json.loads(line)
                except ValueError:
                    continue
                if not isinstance(row, dict):
                    continue
                if row.get('type') == 'system' and row.get('subtype') == 'init':
                    session = row.get('session_id')
                if row.get('type') == 'result':
                    result = row
    except FileNotFoundError:
        pass
    return session, result


def block(reason):
    BLOCKED.write_text(
        '# Autonomous GLM coordinator stopped\n\n'
        + reason + '\n\nSee `/private/tmp/cf-desert-grey-run/glm-coordinator*.jsonl` and '
        + '`.ultra/reports/execution-state.md` for the last completed work.\n',
        encoding='utf-8',
    )
    print(f'BLOCKED: {reason}', flush=True)
    sys.exit(2)


print('Watching GLM coordinator for completion or a genuine blocker.', flush=True)
index = 0
current = (VISUAL_LOGS / 'visual-quality-coordinator.jsonl') if VISUAL else (LOGS / 'glm-coordinator.jsonl')
quick_exits = 0
while True:
    if DONE.exists():
        print(f'Final handoff ready: {DONE}', flush=True)
        sys.exit(0)
    if BLOCKED.exists():
        print(f'Coordinator reported a blocker: {BLOCKED}', flush=True)
        sys.exit(2)
    session, result = result_and_session(current)
    if result is None:
        # Active sessions may spend many minutes in reasoning or browser checks.
        time.sleep(45)
        continue
    if not session:
        block(f'Coordinator completed without a resumable session ID in {current}.')
    if result.get('is_error') or result.get('subtype') not in ('success', None):
        block(f'Coordinator CLI returned an error in {current}: {result.get("subtype")}.')

    time.sleep(8)  # Let the previous CLI process release its provider slot.
    if DONE.exists() or BLOCKED.exists():
        continue
    index += 1
    next_log = (VISUAL_LOGS / f'visual-quality-coordinator-resume-{index}.jsonl') if VISUAL else (LOGS / f'glm-coordinator-resume-{index}.jsonl')
    next_err = (VISUAL_LOGS / f'visual-quality-coordinator-resume-{index}.stderr') if VISUAL else (LOGS / f'glm-coordinator-resume-{index}.stderr')
    print(f'Resuming GLM coordinator, cycle {index}, session {session}.', flush=True)
    command = [
        'zcode-kit', 'run', 'claude-code', '--',
        '--model', 'glm-5.3-flash', '--effort', 'high',
        '--resume', session,
        '--add-dir', str(LOGS),
        '--add-dir', str(VISUAL_LOGS),
        '--permission-mode', 'acceptEdits',
        '--allowedTools',
        'Bash(zcode-kit *)', 'Bash(node *)', 'Bash(npm *)', 'Bash(npx *)',
        'Bash(python3 *)', 'Bash(mkdir *)', 'Bash(git *)', 'Bash(rg *)',
        'Bash(cat *)', 'Bash(sed *)', 'Bash(ls *)', 'Bash(sleep *)',
        '-p', '--output-format', 'stream-json', '--verbose',
    ]
    started = time.monotonic()
    with PROMPT.open('rb') as prompt, next_log.open('wb') as output, next_err.open('wb') as error:
        run = subprocess.run(command, stdin=prompt, stdout=output, stderr=error, cwd=ROOT)
    duration = time.monotonic() - started
    print(f'Coordinator cycle {index} exited {run.returncode} after {duration:.0f}s.', flush=True)
    if run.returncode:
        block(f'Coordinator resume failed with exit {run.returncode}; stderr: {next_err}.')
    if duration < 60:
        quick_exits += 1
    else:
        quick_exits = 0
    if quick_exits >= 3:
        block('Three consecutive coordinator resumes ended within 60s without a final handoff; manual intervention needed.')
    current = next_log
