"""Wait for one phase-3 CLI slot to free, then start GLM coordination.

This is process orchestration only. Product edits and audits are dispatched to GLM
through zcode-kit according to glm-autonomous-handoff.md.
"""

import json
import pathlib
import subprocess
import sys
import time


ROOT = pathlib.Path('/Users/sen/workspace/AI/claude-opus-5-5-demo')
LOGS = pathlib.Path('/private/tmp/cf-desert-grey-run')
ACTIVE = [LOGS / f'phase-3-{name}.jsonl' for name in ('rules', 'ai', 'ui')]
PROMPT = ROOT / '.ultra/reports/glm-coordinator-prompt.md'
OUT = LOGS / 'glm-coordinator.jsonl'
ERR = LOGS / 'glm-coordinator.stderr'


def is_finished(path):
    try:
        with path.open(encoding='utf-8', errors='replace') as stream:
            for line in stream:
                try:
                    if json.loads(line).get('type') == 'result':
                        return True
                except (ValueError, AttributeError):
                    continue
    except FileNotFoundError:
        return False
    return False


print('Waiting for one phase-3 GLM writer to finish before autonomous handoff.', flush=True)
last_status = None
deadline = time.monotonic() + 3 * 60 * 60
while True:
    status = tuple(is_finished(path) for path in ACTIVE)
    if status != last_status:
        print(f'Phase-3 completion: rules={status[0]} ai={status[1]} ui={status[2]}', flush=True)
        last_status = status
    if any(status):
        break
    if time.monotonic() > deadline:
        print('Handoff not started: no phase-3 writer finished after 3 hours.', flush=True)
        sys.exit(2)
    time.sleep(30)

print('Launching GLM HIGH autonomous coordinator.', flush=True)
command = [
    'zcode-kit', 'run', 'claude-code', '--',
    '--model', 'glm-5.3-flash', '--effort', 'high',
    '--add-dir', str(LOGS),
    '--permission-mode', 'acceptEdits',
    '--allowedTools',
    'Bash(zcode-kit *)', 'Bash(node *)', 'Bash(npm *)', 'Bash(npx *)',
    'Bash(python3 *)', 'Bash(mkdir *)', 'Bash(git *)', 'Bash(rg *)',
    'Bash(cat *)', 'Bash(sed *)', 'Bash(ls *)', 'Bash(sleep *)',
    '-p', '--output-format', 'stream-json', '--verbose',
]
with PROMPT.open('rb') as prompt, OUT.open('wb') as output, ERR.open('wb') as error:
    result = subprocess.run(command, stdin=prompt, stdout=output, stderr=error, cwd=ROOT)
print(f'GLM coordinator exited with code {result.returncode}; log: {OUT}', flush=True)
sys.exit(result.returncode)
