# 阶段 1 修复报告（第 1 轮独立评审）

实施者：GLM-5.3-Flash。对应评审：.ultra/reports/phase-1-review.md（REQUEST_CHANGES，6 项发现）。日期：2026-09-26。

## 结论

6 项发现全部修复。修复后：单元测试 26/26 通过（原 19 例，新增/重写至 26 例），e2e 20/20 通过（全部对最终 dist 产物，exit code 0）。运输船几何除出生点数据补 y 字段外零改动；未实现任何沙漠灰几何或未来模式。

## 逐项修复对照

### P1-1 非法已存设置可导致无法开局 → 已修复

- 变更：`src/settings.js` 新增 `normalize()`：任何来源（v2 记录、v1 迁移、损坏 JSON）先以默认值重建，枚举字段（team/primary/diff/tod/quality）仅接受合法取值否则回默认；数值字段（sens/fov/vol/goal/size）要求有限数并夹紧到菜单范围；`map` 仅保证类型（未知 id 由注册表回退兜底）。`loadOpts` 对 v2 记录同样过 `normalize`，缺失字段补默认。
- 证明：
  - 单测：`normalize：v2 记录中的非法枚举与数值被替换/夹紧`、`loadOpts：畸形/极简 v2 记录被归一化`。
  - e2e（driver=ui）：预置 `cf_opts_v2 = {"v":2,"primary":"invalid","sens":"banana","fov":1e9,"team":"xx","quality":"ultra","diff":"nightmare","goal":-5,"size":99}`，经菜单**点击 #btnStart** 正常开局，归一化结果逐字段断言（primary ak47 / sens 1 / fov 100（夹紧）/ goal 1（夹紧）/ size 16（夹紧）），玩家手持默认 AK-47（`e2e-results.json` 场景 2）。

### P1-2 storage 访问抛错中断初始化 → 已修复

- 变更：`src/settings.js` 所有 `storage.getItem`（含评审指出的 legacy 键读取）统一走 `safeGet()`（try/catch 返回 null），`saveOpts` 已有兜底；`loadOpts` 任何分支都不再可能抛出。
- 证明：
  - 单测：`loadOpts：storage 读写全部抛错时也不抛异常，返回可用默认`（getItem/setItem 均抛 SecurityError 的注入 storage）。
  - e2e（driver=ui）：addInitScript 将 `window.localStorage` 替换为全抛错实现 → 菜单正常初始化、点击 #btnStart 正常开局（场景 3）。

### P1-3 浏览器测试未经过 Start 控件 → 已修复

- 变更：`scripts/e2e.mjs` 重写。主流程**不含 autostart**：加载 `?nolock=1&q=low` → 等待菜单 → **点击 `#btnStart`** → 观察可玩对局；随后依次演练：B 键打开更换武器面板 → 点击 M4A1 卡片 → 点击确定（出生区内立即生效，AK-47→M4A1）；进入暂停 → **点击「继续」**回到对局；**点击「退出到主菜单」**返回菜单且对局结束。file:// 场景维持菜单级验证。
- 说明：暂停的*进入*在无头环境无指针锁可退出（原路径是浏览器 Esc 退出锁触发 pointerlockchange），故用直接调用 `__game.pause()` 代替并标记 driver=setup；恢复与退出均走真实按钮点击（driver=ui）。
- 证明：`e2e-results.json` 场景 1 共 12 项断言（16 ui / 2 setup / 2 sim 全套分布见文末）。

### P1-4 两条玩法断言可空转通过 → 已修复

- 变更：`scripts/e2e.mjs`：
  - 机器人击杀：改为**只统计非玩家 actor 的 stats.k**，在对比窗口（fastForward(8)，窗口内无任何注入击杀）前后快照比较，必须净增长（本次 4 → 6）。
  - 复活：**点名具体机器人**（本局「灬冷血杀手」）——确定性击杀（场景构造，driver=setup，先 sim 跳过 3.5s 出生保护再施伤）→ 断言倒地 → fastForward 至复活间隔+0.05s → 断言**同一 actor** 重新存活且 deaths 恰 +1。推进只到复活点后 0.05s（AI 反应下限约 0.38s），断言确定而非碰运气。
- 证明：`e2e-results.json` 场景 1 的 `[setup] 目标机器人被确定性击杀倒地`、`[sim] 同一机器人 4s 复活间隔后重新存活`、`[sim] 模拟窗口内机器人击杀数净增长`。

### P2-5 地图契约缺少边界与出生高度 → 已修复

- 变更：
  - `src/maps/registry.js`：运输船描述符新增 `bounds`（±36.6 / ±12.15，与舷侧 invisible 墙一致）与 `spawnYFallback: 0.02`；契约注释明确 `spawns[team] = [{x,y,z,yaw}]`、y 为脚底站立面。
  - `src/map.js`：出生点数据补 `y`（主甲板碰撞体顶面 y=0）。
  - `src/actor.js`：`Actor.spawn` 改为 `this.pos.set(sp.x, sp.y ?? 0.02, sp.z)`，消费出生高度并带安全默认。
  - `src/game.js`：`spawnActor` 按边界过滤出生点（数据异常时回退全部点）。
- 证明：
  - 单测：`运输船描述` 断言 bounds 存在、自洽且包住寻路范围。
  - e2e（driver=ui）：20 个出生点全部 xyz+yaw 有限、落在 bounds 内；玩家实际站位高度等于所归出生点的 y（pos.y=0，场景 1）。

### P2-6 空对象旧记录被误判为新玩家 → 已修复

- 变更：`src/settings.js` `migrate(rawLegacy, hasLegacyKey, touch)`：旧用户判定基于**legacy 键是否存在**（收到字符串即视为存在，`{}` 与损坏 JSON 都算），与其中字段数无关；键存在 → 默认运输船，无键 → 新玩家默认由注册表解析。`loadOpts` 相应传参。
- 证明：单测 `空对象 {} 的旧记录也是旧用户：默认运输船`（同时覆盖 `migrate('{}')` 与 `loadOpts` 注入 `'{}'`）、`损坏的旧记录字符串同样按旧用户处理；无记录才是新玩家`。

## 命令与结果（最终代码，2026-09-26）

| 命令 | 结果 |
| --- | --- |
| `npm run build` | 通过，`built dist/index.html 845.7 KB` |
| `npm test` | 26/26 通过（评审后新增 7 例：畸形 v2 / 夹紧 / 抛错 storage / 空 `{}` 旧记录 / bounds 等） |
| `npm run test:e2e` | 20/20 通过，exit code 0，无页面脚本异常 |

e2e 断言驱动方式分布：`ui` 16（真实点击/键盘/菜单交互）、`setup` 2（无头环境替代指针锁退出的 pause 进入；确定性击杀构造场景）、`sim` 2（fastForward 确定性推进：复活确认与机器人击杀窗口）。逐断言 driver 标记已写入 `artifacts/e2e-results.json`。

正确性场景统一使用 `q=low`、640×400 / 800×500 视口以降低软渲染开销；**该结果不作为性能/帧率证据**。等待一律基于实际状态/DOM（waitForFunction/waitForSelector），实时等待与定时器推进分别用状态轮询与 fastForward 确定性完成，无超过 30s 的 sleep。

证据：`artifacts/e2e-results.json`、`artifacts/e2e-ui-flow.png`、`artifacts/e2e-file-menu.png`（均为最终代码产物）。

## 调试过程中发现并修正的问题

- 出生点原以 y=0.02 落地后由物理贴合到甲板顶面 y=0，契约值与实际站立面不一致导致首轮 e2e 失败；契约改为精确的碰撞体顶面 y=0（几何零改动）。
- e2e 首版 `#pause.hidden` 用 visible 语义等待、退出按钮在暂停界面内不可见两处测试自身缺陷已修正。

## 遗留 / 说明

- `?q=` 参数仍会覆盖并持久化画质（原有行为）；迁移场景的 e2e 因此不带 `q=`，以证明画质字段原样保留。
- 其余遗留项同 `.ultra/reports/phase-1-implementation.md`（沙漠灰几何/环境属阶段 2，爆破模式属后续阶段）。
