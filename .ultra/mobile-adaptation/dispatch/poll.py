"""只读轮询：GLM 是否空闲、各 lane 的运行/完成情况。除了在 /private/tmp/cf-mobile-run 写一个小状态文件外，
不写任何文件、不启动进程（zcode-kit 只调用只读子命令）。

用法：python3 -B .ultra/mobile-adaptation/dispatch/poll.py

判定 GLM 空闲（三个条件同时满足）：
  1. 代理请求计数器在 SAMPLE_SECONDS 秒内没有增长（实时流量为 0）；
  2. 自上次轮询以来的请求速率 <= MAX_RATE_PER_10MIN（长窗口内也是稀疏的）；
  3. 没有 market-lab 的 GLM 工作树进程在跑（其它项目的 lane 正在使用代理）。

为什么不用 `zcode-kit accounts health` 的 “used Ns ago”：它是代理后台定期探测活跃账号刷新出来的，
永远不超过约 30 秒（实测在计数器完全不动时仍恒为 23–29 秒），不是有效的空闲信号。
我方自己的 lane 也会产生请求，所以有 lane 运行时“速率”条件只作参考，不据此阻止启动，并发上限仍是 3。
"""
import glob
import json
import os
import re
import subprocess
import time

SAMPLE_SECONDS = 10
MAX_RATE_PER_10MIN = 6
RUN_DIR = '/private/tmp/cf-mobile-run'
STATE = os.path.join(RUN_DIR, 'poll-state.json')


def run(cmd, timeout=30):
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout).stdout


def proxy_counter():
    """代理日志里最大的 #NNN 请求序号；读不到返回 None。"""
    try:
        nums = [int(n) for n in re.findall(r'^#(\d+)', run(['zcode-kit', 'proxy', 'logs', '80']), re.M)]
        return max(nums) if nums else None
    except Exception:
        return None


def usable_accounts():
    """`zcode-kit accounts health` 末尾的 `usable: N of M`（只读本地状态，不向上游发请求）；读不到返回 None。"""
    try:
        m = re.search(r'usable:\s*(\d+)\s+of\s+\d+', run(['zcode-kit', 'accounts', 'health']))
        return int(m.group(1)) if m else None
    except Exception:
        return None


def other_projects_running():
    """其它项目（market-lab）的 GLM 工作树里有进程在跑。"""
    try:
        out = run(['ps', '-Ao', 'pid,etime,command'])
    except Exception:
        return None
    hits = [line.strip()[:110] for line in out.splitlines() if 'market-lab' in line and 'grep' not in line]
    return hits


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


def load_state():
    try:
        with open(STATE, encoding='utf-8') as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def save_state(counter):
    try:
        os.makedirs(RUN_DIR, exist_ok=True)
        with open(STATE, 'w', encoding='utf-8') as fh:
            json.dump({'counter': counter, 'time': time.time()}, fh)
    except OSError:
        pass


def main():
    print('== GLM（代理请求计数器 + 其它项目进程）')
    c0 = proxy_counter()
    reasons = []
    idle = True
    if c0 is None:
        print('  无法读取代理计数器 → 按忙处理')
        idle = False
    else:
        time.sleep(SAMPLE_SECONDS)
        c1 = proxy_counter()
        live = (c1 - c0) if c1 is not None else None
        print(f'  代理计数器 #{c0} → #{c1}（{SAMPLE_SECONDS}s 内 +{live}）')
        if live is None or live > 0:
            idle = False
            reasons.append(f'实时有流量（{SAMPLE_SECONDS}s 内 +{live}）')
        prev = load_state()
        if prev and c1 is not None and c1 >= prev['counter']:
            minutes = max((time.time() - prev['time']) / 60.0, 0.1)
            rate = (c1 - prev['counter']) / minutes * 10
            print(f'  自上次轮询（{minutes:.1f} 分钟前，#{prev["counter"]}）以来：约 {rate:.1f} 个请求/10 分钟')
            if rate > MAX_RATE_PER_10MIN:
                reasons.append(f'长窗口速率偏高（{rate:.1f}/10 分钟，阈值 {MAX_RATE_PER_10MIN}）')
        if c1 is not None:
            save_state(c1)
    others = other_projects_running()
    if others is None:
        print('  无法读取进程表 → 按忙处理')
        idle = False
    elif others:
        print(f'  market-lab 进程 {len(others)} 个在跑：')
        for line in others[:3]:
            print(f'    {line}')
        idle = False
        reasons.append('market-lab 的 lane 在跑')
    else:
        print('  market-lab：无进程')
    # 账号是否可用：套餐窗口限流时代理会把账号标为 exhausted，即使余额充足也会返回 503（2026-09-30 04:0x 实测）。
    usable = usable_accounts()
    if usable is None:
        print('  账号可用数：读取失败 → 按不可用处理')
        reasons.append('无法读取账号状态')
    else:
        print(f'  账号可用数：{usable} / 4')
        if usable == 0:
            reasons.append('所有账号 exhausted（窗口限流，等待恢复；不要重试）')
    if reasons:
        idle = False

    print('== 我的 lane 运行')
    runs = lane_runs()
    if not runs:
        print('  （无）')
    for r in runs:
        state = '已结束 ' + r['detail'] if r['finished'] else f"运行中（日志 {r['log_age_s']}s 未更新）"
        print(f"  {r['lane']:<8} {state}")
    running = sum(1 for r in runs if not r['finished'] and r['log_age_s'] < 900)
    verdict = '空闲' if idle else '忙'
    print(f"== 结论：GLM {verdict}{'（' + '；'.join(reasons) + '）' if reasons else ''}；我方运行中 lane {running} 个；"
          f"可再启动 {max(0, 3 - running) if idle else 0} 个")


if __name__ == '__main__':
    main()
