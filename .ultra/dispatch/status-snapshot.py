"""Read-only status snapshot of GLM CLI session logs (no product edits)."""

import json
import pathlib
import time

LOGS = pathlib.Path('/private/tmp/cf-desert-grey-run')
NAMES = [
    'phase-3-rules.jsonl', 'phase-3-ai.jsonl', 'phase-3-ui.jsonl',
    'glm-coordinator.jsonl', 'glm-coordinator-resume-1.jsonl',
    'glm-coordinator-resume-2.jsonl', 'glm-coordinator-resume-3.jsonl',
    'bomb-zero-id-fix.jsonl',
]

def summarize(path):
    try:
        st = path.stat()
    except FileNotFoundError:
        return None
    session = None
    result = None
    last_type = None
    lines = 0
    with path.open(encoding='utf-8', errors='replace') as stream:
        for line in stream:
            lines += 1
            try:
                row = json.loads(line)
            except ValueError:
                continue
            if not isinstance(row, dict):
                continue
            t = row.get('type')
            if t:
                last_type = t
            if t == 'system' and row.get('subtype') == 'init':
                session = row.get('session_id')
            if t == 'result':
                result = {
                    'subtype': row.get('subtype'),
                    'is_error': row.get('is_error'),
                    'num_turns': row.get('num_turns'),
                    'duration_ms': row.get('duration_ms'),
                }
    return {
        'size': st.st_size,
        'mtime_age_s': round(time.time() - st.st_mtime),
        'lines': lines,
        'session': session,
        'last_type': last_type,
        'result': result,
    }

for name in NAMES:
    info = summarize(LOGS / name)
    print(name, '->', json.dumps(info, ensure_ascii=False) if info else 'ABSENT')

# Also list newest files in the log dir to catch other running lanes.
try:
    entries = sorted(LOGS.glob('*.jsonl'), key=lambda p: p.stat().st_mtime)
    print('\nNewest jsonl logs:')
    for p in entries[-12:]:
        st = p.stat()
        print(f'  {p.name}  size={st.st_size}  age={round(time.time()-st.st_mtime)}s')
except OSError as exc:
    print('listing failed:', exc)
