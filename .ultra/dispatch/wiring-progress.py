"""Read-only: print the last assistant text of an active lane log."""

import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
texts = []
with path.open(encoding='utf-8', errors='replace') as stream:
    for line in stream:
        try:
            row = json.loads(line)
        except ValueError:
            continue
        if row.get('type') == 'assistant':
            for block in row.get('message', {}).get('content', []):
                if block.get('type') == 'text' and block.get('text', '').strip():
                    texts.append(block['text'].strip())
for t in texts[-3:]:
    print('---')
    print(t[:600])
