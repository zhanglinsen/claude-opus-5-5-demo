# 阶段 5 / D 波 lane 3 — HUD/样式/触屏整合交付报告

执行：GLM-5.3-Flash HIGH。授权文件：`src/hud.js`、`src/style.css`、`src/settings.js`（仅 ENUMS.mode + 默认值）、新测试 `tests/unit/hud-blind.test.mjs`、`tests/unit/hud-mode.test.mjs`、`tests/unit/hud-award.test.mjs`、新冒烟脚本 `scripts/e2e-hud.mjs`。**未改动** `game.js`/`player.js`/`bots.js`/`profile/`/`modes/`/`maps`/`touch.js`（分支上 touch.js 的 M 为本波之前既有改动，本 lane 零触碰）。未提交。

## 1. 实现清单

| # | 契约条目（phase-5-wiring §4） | 实现 |
|---|---|---|
| 1 | **闪光白屏** | `#blind` 白色全屏叠加（#hud 首子元素、`pointer-events:none`、z-index 30，不拦截任何输入）。纯函数 `updateBlindState(state, blind)`：opacity = intensity(0..1 夹紧) × remaining/满时长；episode 状态由 HUD 持有——更晚到期的更强闪光重置满时长，叠加更弱/更短闪光不重置；`remaining ≤ 0`/无数据隐藏并清零状态。数据源即 lane 1 提供的 `s.blind`，未读 player 内部字段 |
| 2 | **军衔/档案 UI** | 菜单新增「军衔档案」块：`rankView()` 渲染军衔名/`Lv.n`/进度条（progress→width%）/`xp / nextThreshold XP`（满级显示「满级」）；`presets()` 渲染三套预设分段（主武器·雷种命名），active 高亮，点击调 `switchPreset(i)`、高亮经 `onProfileChanged` 事件刷新（**零轮询**）；`persistence()==='memory'` 显示「本地存档不可用，进度仅本次会话有效」（P3-5 语义：不宣称「已保存」）。adapter 在 Game.init 中晚于 HUD 构造，故 `ensureProfile()` 在 `show('menu'/'end')` 时惰性绑定订阅。结算页新增 `#endAward`：消费 `s.award`（发分后快照），渲染 `+N XP · 军衔 · Lv.n`，`rankUp` 加「军衔晋升！」前缀，`awarded:false`（去重/练习）静默 |
| 3 | **菜单模式选择** | 菜单「地图」下新增「模式」分段：`setMapInfo` 时经 `modeOptionsFor(mapDesc)` 重建，高亮 = 新导出纯函数 `effectiveMode(opts, mapDesc)`（已存模式合法且该图 supportedModes 包含才生效，否则地图默认——与 startMatch 的解析逐字对齐，URL `?mode=` 优先那一半本就在 game.js）。点击只写 `opts.mode` 并 `saveOpts()`，开局经 startMatch 生效；切图时自动把 `opts.mode` 回落为新图默认（运输船 tdm、沙漠灰 bomb）。`settings.js` 新增 `ENUMS_MODE = ['tdm','bomb','practice']` 导出 + `DEFAULT_OPTS.mode = null`（null = 跟随地图默认；normalize 对 null/非法枚举均安全回退） |
| 4 | **练习面板** | `#practice`（左下）：命中总数、7 靶位 chip 列表（`flash>0` 红框高亮 + 每靶命中数，DOM 仅在变化时重写）、当前武器名、换枪按钮组（4 主武器 + 沙鹰 + 军刀 + 投掷物槽，全部目录内）。换枪走**真实玩家路径**：主武器 → `chooseLoadout(id)`（现役换包路径），其余 → `weaponUpdate(0.05,{sw:slot})`；两者都经 `onSwitch → practice.selectWeapon` 同步进运行时快照。非练习模式 `s.practice = null` → 隐藏；触屏与桌面同一渲染路径（面板按钮 `pointer-events:auto` 可点）。<br>**勘误（2026-09-27 审核 P2-1/P3-6）**：上句「两者都经 onSwitch 同步」**与事实不符**——`chooseLoadout` 的出生区即时生效分支（game.js）直接替换 `p.inv[0]` 并置 slot，**不调用 onSwitch**，故主武器路径不同步练习运行时快照（面板名/高亮停留旧枪）；且开局 `PracticeRuntime.current=null` 无种子同步，面板武器名初始为空。根因修复在 game.js 侧（P2-1/P3-6，由接线会话处理）；hud.js 内相应失实注释已改为准确表述，空态渲染已防御性确认不抛错 |
| 5 | **投掷物 HUD** | `#nadeInfo`（左侧 slotC4 上方）：读 `player.grenadeBag/usedGrenades/inv[3].def.id`，纯函数 `nadeSummary` 输出 `[{id,name,count,current}]`（剩余 0 的型号消失），当前型号高亮；出手后记账实时反映（e2e 实证闪光消耗后消失）。4 号轮换高亮即 current 指针 |
| 6 | **触屏复核** | 爆破 C4/E/G 按钮逻辑零改动（`touch.js` 未动），objBtns 显隐仍由 `updateObjective` 按爆破模式控制；练习面板在触屏同路显隐，换枪按钮即触屏可用的换枪入口 |

样式：`style.css` 仅追加新元素块（#blind/#nadeInfo/#practice/#rankRow/#endAward 等），未改任何既有规则。

## 2. 红绿证据

- **先红**：`node --test tests/unit/hud-*.test.mjs` 首跑 3 文件全挂（`updateBlindState`/`effectiveMode`/`ENUMS_MODE`/`awardLine`/`nadeSummary` 未导出）。
- **后绿**：实现后 **19/19 通过**（blind 7：新闪/衰减/弱闪不重置/强闪重置/清零/夹紧/重起；mode 5：ENUMS+默认值/生效模式/地图默认回落/缺 supportedModes 防御/modeOptionsFor 对齐；award+nade 7：静默/XP 军衔/晋升/rank 缺失防御/顺序与高亮/消耗记账/空数据）。
- **全量**：`npm test` → **211 pass / 0 fail**（基线 190 + 本 lane 19 + 并行 lane 在途 2；settings/modes/registry 既有测试无回归——`DEFAULT_OPTS` 增加键与既有 deepEqual 兼容）。
- `npm run build` → `built dist/index.html 946.2 KB`，无错误。

## 3. e2e 结果（全量真实浏览器）

| 套件 | 结果 |
|---|---|
| `node scripts/e2e.mjs` | **21/21 通过**（既有主流程/设置迁移/file:// 冒烟，无回归） |
| `node scripts/e2e-bomb.mjs` | **36/36 通过**（既有爆破全流程，C4/E/G 触屏按钮回归不变） |
| `node scripts/e2e-desert.mjs` | **34/34 通过**（既有沙漠灰门禁） |
| `node scripts/e2e-wiring.mjs` | **15/15 通过**（lane 1 契约冒烟无回归） |
| `node scripts/e2e-hud.mjs`（新） | **18/18 通过**，结果 `artifacts/e2e-hud-results.json` |

e2e-hud 覆盖（driver 标记同 e2e.mjs）：
- **菜单**：模式分段按 supportedModes 渲染、未设置时高亮地图默认（沙漠灰=爆破）、点击写入 cf_opts_v2、重载后生效进练习模式；军衔名/级别/进度条渲染、三预设枚举 + active 高亮、点击预设 2 经 switchPreset + onProfileChanged 迁移高亮；存档健康时降级提示隐藏。
- **练习面板**：命中计数/7 靶 chip/7 换枪按钮渲染；点击军刀 → 玩家真实切刀 + 运行时快照同步 + 按钮高亮 + 面板武器名更新；实弹打靶 → 命中 +1 且受击靶高亮。
- **闪光白屏**：未闪时隐藏 → 真实投掷闪光弹（4 号键轮换到 flash 再出手）→ `#blind` 出现且 opacity 与玩家 blindIntensity 同源（0.18/0.18）→ 消退后隐藏；出手后背包条记账（闪光移除、手雷/烟雾保留、当前高亮）。
- **结算军衔**：TDM 到时走真实 endMatch → `#endAward` 渲染 `+25 XP · 列兵 · Lv.1`（发分后快照，awarded=true）。
- **URL 优先级**：已存 practice + `?mode=tdm` → tdm（URL 覆盖已存设置）。

调试过程修正的 3 处**测试自身**问题（实现未改）：① evaluate 返回 DOM 元素被序列化丢 classList → 改页面内取纯数据；② 默认预设 slot3 是手雷不是闪光弹 → 走 4 号键真实轮换；③ headless 软渲染 sim 时率仅 ~0.3×（dt 钳制）+ 脚下垂直投掷视角≈90° 部分致盲（intensity 0.18）→ 阈值放宽为 >0.05 并与 blindIntensity 交叉验证；另修正了双 WebGL 上下文抢占导致的超时（先关旧页）。

## 4. 遗留与边界

1. **预设槽位编辑未做**：`adapter-passthrough-fix`（setPresetSlot 透传）在并行 lane 尚未落地（报告文件不存在），按任务预案只做了展示+切换。透传可用后在此分段基础上加编辑 UI 即可。
2. **预设↔菜单主武器双向同步未收敛**（wiring §4.7 原遗留）：菜单主武器偏好（opts.primary）仍优先于预设 loadout；需 adapter 透传 + 路由裁决后收敛。
3. **换枪按钮在桌面指针锁定态不可点**（无光标）：属预期——桌面走 1-4 数字键；按钮主要服务触屏与暂停间隙。练习模式投掷物槽按钮 = 切到 slot3（再按轮换语义与 4 号键一致）。
4. **闪光致盲强度语义**（观察，非本 lane 改动）：`flashbang` 传给 computeFlashEffect 的 observer.pos 是脚底 `a.pos` 而非眼位，脚下近炸的视角夹角≈90° → intensity 仅 ~0.18（wiring e2e 的 3m 正对场景为 0.74）。HUD 侧按契约纯消费不受影响；若要「脚下闪光更致盲」的观感，建议 E 波把 observer 统一为眼位。
5. 暂停期间 HUD 帧不更新，白屏停留在暂停前 opacity（simulate 冻结、remaining 不减），恢复后继续衰减——无可见异常。<br>**勘误（2026-09-27 审核 P3-3）**：机制表述不准确——暂停期 `renderFrame → updateHUD` **仍每帧执行**，HUD 帧是更新的；只因 simulate 冻结使 remaining 不减、opacity 恒定，可观察结论（白屏停留、恢复后继续衰减）不变。另 P3-4（同审核）：白屏 z-index 30 绘制于暂停菜单之上遮盖菜单文字，产品裁定菜单可读性优先，已在修复批次把 `#pause` 提到 z-index 40。
6. `render.js` bloom 阈值根治建议（visual 报告 §2）未动，本 lane 未触碰 render.js。

## 5. 验证时间线

全部测试在 2026-09-27 本日当前代码态重跑取得：单测 211/211 → build → e2e(21) → bomb(36) → desert(34) → wiring(15) → hud(18)，全绿后未再改动任何 src 文件。
