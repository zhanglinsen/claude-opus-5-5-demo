"""Extract the final assistant text and result row from a CLI JSONL log."""

import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
session = None
result = None
last_text = None
tool_cmds = []
with path.open(encoding='utf-8', errors='replace') as stream:
    for line in stream:
        try:
            row = json.loads(line)
        except ValueError:
            continue
        if not isinstance(row, dict):
            continue
        t = row.get('type')
        if t == 'system' and row.get('subtype') == 'init':
            session = row.get('session_id')
        if t == 'result':
            result = row
        if t == 'assistant':
            for block in row.get('message', {}).get('content', []):
                if block.get('type') == 'text' and block.get('text', '').strip():
                    last_text = block['text']
                elif block.get('type') == 'tool_use':
                    name = block.get('name', '?')
                    inp = block.get('input', {})
                    cmd = inp.get('command') or inp.get('file_path') or inp.get('pattern') or ''
                    tool_cmds.append(f'{name}: {str(cmd)[:120]}')

print('session:', session)
if result:
    print('result subtype:', result.get('subtype'), 'is_error:', result.get('is_error'),
          'turns:', result.get('num_turns'), 'duration_ms:', result.get('duration_ms'))
print('tool calls:', len(tool_cmds))
for c in tool_cmds[-8:]:
    print('  ', c)
print('--- final text length:', len(last_text or ''))
if last_text:
    print(last_text)
