# 阶段 1 修复报告（第 2 轮定向修复）

实施者：GLM-5.3-Flash。对应评审：.ultra/reports/phase-1-rereview-1.md（5 项已关闭，仅剩 localStorage **属性 getter** 抛错一项）。日期：2026-09-26。

## 结论

剩余缺陷已修复并验证：storage 的获取本身现在经统一守卫入口，属性 getter 抛错时设置退化为内存兜底，菜单可初始化、点击 #btnStart 可正常开局、无页面脚本异常。单测 28/28 通过，定向浏览器 fixture 4/4 通过（exit code 0）。既有 20/20 全量 e2e 证据原样保留，未与定向结果混算。

## 变更文件（仅本次修复）

| 文件 | 变更 |
| --- | --- |
| `src/settings.js` | 新增 `acquireStorage()`：读取 `globalThis.localStorage` 的唯一守卫入口（getter 抛 SecurityError 或属性不存在时回退内存实现 `MEMORY_STORAGE`）；`safeGet`/`saveOpts` 的方法级守卫保持不变作为第二层。 |
| `src/hud.js` | 移除两处对 `localStorage` 的直接书写（构造函数 loadOpts 与 `saveOpts()`），改为每次经 `acquireStorage()` 获取。grep 确认 src/ 下已无其它生产性直接访问。 |
| `tests/unit/settings.test.mjs` | 新增 2 例：getter 抛错时 `acquireStorage` 不抛且返回可用内存实现（并验证 load/save 往返）；可用 storage 原样返回。 |
| `scripts/e2e-storage-getter.mjs`（新增） | 定向浏览器 fixture：页面代码执行前把 `window.localStorage` 重定义为抛错 getter，走菜单 → 点击 #btnStart → 可玩对局。 |
| `package.json` | 新增 `test:e2e:storage` 脚本（定向场景选择入口）。 |

未改动：其余游戏源码、既有 e2e 全量脚本与结果、评审已关闭的各项修复。

## 命令与结果（最终代码，2026-09-26）

| 命令 | 结果 |
| --- | --- |
| `npm run build` | 通过，`built dist/index.html 845.9 KB` |
| `npm test` | 28/28 通过（26 + 新增 2） |
| `npm run test:e2e:storage` | 4/4 通过，exit code 0 |

定向 fixture 断言（全部 driver=ui，真实交互）：
1. getter 抛错时菜单正常初始化（`__game.opts` 字段可用）。
2. 设置经内存兜底可读写（改 `opts.map` → `hud.saveOpts()` → 读回一致）。
3. 点击 **#btnStart** 进入可玩对局且玩家存活。
4. 全程无页面脚本异常（pageerror 监听为空）。

## 证据路径

- `cf-transport-ship/artifacts/e2e-storage-getter-results.json` — 定向结果（scope 字段注明为定向场景）。
- `cf-transport-ship/artifacts/e2e-storage-getter.png` — storage 被拦截环境下的对局截图。
- `cf-transport-ship/artifacts/e2e-results.json`（21:34 未变）等既有文件 — 上一轮 20/20 全量证据，明确标注为先前证据，未覆盖。

## 说明与边界

- 内存兜底下设置不跨页面刷新持久（隐私模式的合理降级）；`loadOpts`/`saveOpts` 的方法级守卫仍保留，即使某些环境属性可读但方法抛错也不会中断启动。
- 未重跑全量 e2e（未改动其覆盖的任何行为路径）；fixture 未涉及指针锁，未伪造相关断言。
