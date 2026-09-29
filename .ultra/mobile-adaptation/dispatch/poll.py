"""只读轮询：GLM 是否空闲、各 lane 的运行/完成情况。不写文件、不启动任何进程（zcode-kit 只调用只读子命令）。

用法：python3 .ultra/mobile-adaptation/dispatch/poll.py
判定 GLM 空闲：所有账号最近一次使用距今 >= IDLE_SECONDS（默认 180 秒）。
"""
import glob
import json
import os
import re
import subprocess
import time

IDLE_SECONDS = 180
RUN_DIR = '/private/tmp/cf-mobile-run'
UNIT = {'s': 1, 'm': 60, 'h': 3600, 'd': 86400}


def accounts_health():
    try:
        out = subprocess.run(['zcode-kit', 'accounts', 'health'], capture_output=True, text=True, timeout=30).stdout
    except Exception as exc:  # 工具缺失或超时：无法判断，按忙处理
        return None, f'无法读取 zcode-kit accounts health：{exc}'
    accounts = []
    for line in out.splitlines():
        m = re.match(r'^\s*\*?\s*(\S+)\s+(\S+)\s+(\S+)\s+(.*)$', line)
        if not m or not m.group(1).startswith(('bigmodel-', 'zai-')):
            continue
        used = re.search(r'used (\d+)([smhd]) ago', line)
        never = 'never used' in line
        age = int(used.group(1)) * UNIT[used.group(2)] if used else None
        accounts.append({'id': m.group(1), 'quota': m.group(2), 'state': m.group(3),
                         'used_ago_s': age, 'never': never, 'active': line.lstrip().startswith('*')})
    return accounts, None


def lane_runs():
    runs = []
    for path in sorted(glob.glob(os.path.join(RUN_DIR, '*.jsonl'))):
        lane = os.path.basename(path)[:-len('.jsonl')]
        finished, detail = False, ''
        try:
            with open(path, encoding='utf-8', errors='replace') as fh:
                for line in fh:
                    try:
                        row = json.loads(line)
                    except ValueError:
                        continue
                    if row.get('type') == 'result':
                        finished = True
                        detail = f"subtype={row.get('subtype')} is_error={row.get('is_error')} turns={row.get('num_turns')}"
        except OSError:
            continue
        age = round(time.time() - os.stat(path).st_mtime)
        runs.append({'lane': lane, 'finished': finished, 'log_age_s': age, 'detail': detail})
    return runs


def main():
    accounts, err = accounts_health()
    print('== GLM')
    if accounts is None:
        print('  未知（' + err + '）→ 按忙处理')
        idle = False
    else:
        ages = [a['used_ago_s'] for a in accounts if a['used_ago_s'] is not None]
        idle = bool(ages) and min(ages) >= IDLE_SECONDS
        for a in accounts:
            when = '从未使用' if a['never'] else f"{a['used_ago_s']}s 前使用"
            print(f"  {a['id']:<11} {a['state']:<8} {when}{'  (active)' if a['active'] else ''}")
        print(f"  判定：{'空闲' if idle else '忙'}（阈值 {IDLE_SECONDS}s；最近使用 {min(ages) if ages else '?'}s 前）")
    print('== 我的 lane 运行')
    runs = lane_runs()
    if not runs:
        print('  （无）')
    for r in runs:
        state = '已结束 ' + r['detail'] if r['finished'] else f"运行中（日志 {r['log_age_s']}s 未更新）"
        print(f"  {r['lane']:<8} {state}")
    running = sum(1 for r in runs if not r['finished'] and r['log_age_s'] < 900)
    print(f"== 结论：GLM {'空闲' if idle else '忙'}；我方运行中 lane {running} 个；可再启动 {max(0, 3 - running) if idle else 0} 个")


if __name__ == '__main__':
    main()
