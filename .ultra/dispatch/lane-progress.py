"""Read-only: print the last non-thinking activity of each active lane log."""

import json
import pathlib
import time

LOGS = pathlib.Path('/private/tmp/cf-desert-grey-run')
LANES = ['phase-3-rules.jsonl', 'phase-3-ai.jsonl']

for name in LANES:
    path = LOGS / name
    st = path.stat()
    print(f'== {name}  age={round(time.time()-st.st_mtime)}s  size={st.st_size}')
    shown = 0
    with path.open(encoding='utf-8', errors='replace') as stream:
        rows = stream.readlines()
    for line in reversed(rows):
        if shown >= 4:
            break
        try:
            row = json.loads(line)
        except ValueError:
            continue
        t = row.get('type')
        if t == 'assistant':
            msg = row.get('message', {})
            for block in msg.get('content', []):
                if block.get('type') == 'text' and block.get('text', '').strip():
                    text = block['text'].strip().replace('\n', ' | ')[:300]
                    print(f'  [assistant] {text}')
                    shown += 1
                    break
        elif t == 'user':
            msg = row.get('message', {})
            content = msg.get('content')
            desc = None
            if isinstance(content, list):
                for block in content:
                    if block.get('type') == 'tool_result':
                        c = block.get('content')
                        if isinstance(c, list):
                            c = ' '.join(x.get('text', '') for x in c if isinstance(x, dict))
                        desc = str(c)[:200].replace('\n', ' | ')
                        break
            elif isinstance(content, str):
                desc = content[:200]
            if desc:
                print(f'  [tool_result] {desc}')
                shown += 1
    print()
