# 阶段 5 / D 波 lane 1 — Game 接线交付报告

执行：GLM-5.3-Flash HIGH。授权文件：`src/game.js`、`src/actor.js`、`src/modes/index.js`、`src/main.js`（未改动，见 §5）、`src/maps/registry.js`（任务 4 授权的靶点变更）、新测试 `tests/unit/wiring-modes.test.mjs`、新脚本 `scripts/e2e-wiring.mjs`。未提交。

## 1. 契约差异与适配决策

| # | 决策 | 依据/理由 |
|---|---|---|
| 1 | `updateNades` 手写积分 → `GrenadeProjectile.step(dt, raycast)`，raycast 适配 `(pos,dir,len) => world.raycast(...,'move')`；bounce 音效带 `impactSpeed > 2` 闸门（P3-3）；spin/网格/随机自转留在表现层 | combat 报告 §D 波接线契约；运动数值逐位等价由 C 波审核实证 |
| 2 | `throwGrenade` 改投 `computeThrowVelocity({dir, actorVel})` + `buildGunMerged(投掷物 id)`；引信事件按 `WEAPONS[id].effect` 分发：he→现役 `explode`（结算路径未动，数值与 computeHeBlast 一致由 C 波单测锁定）、flash→`flashbang`、smoke→`smokeOut` | combat 报告契约 1/3；保留现役 HE 结算避免行为漂移 |
| 3 | **AI 感知经 `WiredBot extends Bot` 子类覆写 `canSee`（game.js 内），不改 bots.js**：blinded 期间直接 false；否则先查烟雾（`cloud.blocksSight`，语义即 smokeBlocksSight 唯一接缝）再 `super.canSee` | bots.js 属本 lane 禁改清单；子类覆写是最小所有权内合规方案，bots.js 零改动、既有 bots 测试全部原样通过 |
| 4 | 闪光：`flashbang(p)` 对每个存活 actor 调 `computeFlashEffect`（isBlocked 用 `sightBlocked`，与现役 explode 同约定：起点 y+0.2、末端 -0.3），写 per-actor `blindUntil`（game.time 时点）/`blindIntensity`（峰值）；更晚到期的闪光重置峰值，叠加弱闪光取 max | combat 报告契约 4；HUD 白屏叠加归 lane 3 |
| 5 | 烟雾：`SmokeCloud` 列表 + 每帧 `advance(dt)`（暂停=simulate 不调用即冻结）；视觉为 game 层自建的半透明球网格（opacity/scale 随 opacity()），不碰 effects.js；玩家侧可见性（准星角色名 aimTarget）同样经 `smokeBlocked`——AI 与玩家同一接缝 | combat 报告契约 5 |
| 6 | **投掷物轮换放 actor 层（任务 1 授权）：4 号键持弹再按 → `cycleGrenade()`；出手后 `advanceGrenade()` 自动转下一枚剩余型号**；`makeGrenadeState` 按 `count - usedGrenades` 结算剩余量，轮换回已投型号不复制新雷 | 任务原文「若切换逻辑在 game/actor 层则本 lane 完成」；player.js 的 Digit4/wheel 逻辑零改动即获得轮换（wheel 的「没有手雷了」拦截与自动轮换天然兼容） |
| 7 | 出生投掷物背包 = 档案 `loadout().grenades` 在前 + `CATALOG.grenade` 补齐（默认 he/flash/smoke 各 1），`spawnActor` 注入 `a.spawnGrenades` | adapter 契约 `grenades` 数组形状直接消费；仅带 1 雷的预设也能轮换到全部三型（如需「买什么带什么」再收窄） |
| 8 | hitScan 接 P3-4 修正契约：`maxDist = min(range, 墙面 'move' 射线距离 - 0.07)`，仅玩家即时弹道（近战/投掷物不走） | practice-p2-fix §P3-4 |
| 9 | 练习模式：`MODES.practice`（time Infinity / respawn 2 / checkEnd false / result null）+ `startMatch` N=0（无敌军）；`PracticeRuntime({spots: mapDesc.practiceTargets})` + 立杆+靶球可视网格（受击 `flash` 高亮）；`rt.update(dt)` 挂 simulate 非暂停分支；`onSwitch` 同步 `selectWeapon`；模式解析 `URL ?mode=` 优先（须在 mapDesc.supportedModes 内） | practice 报告 §接线清单；**菜单模式选择 UI 在 hud.js 模板内（lane 3 领地）→ 路由见 §4.6** |
| 10 | 靶点放 `registry.js` 两图描述符（任务授权）：运输船 6 点 / 沙漠灰 7 点，全部取 AI 可站立区（holds/lanes 邻域与导航节点坐标 + 胸口高 1.2；UPPER=2.6/PIT=-1.8 同布局常量） | practice 报告「spots 属地图」+ 任务授权 |
| 11 | 档案：`init` 构造 `createProfileService({storage: acquireStorage(), legacyPrimary: opts.primary})` + adapter，向下只传 adapter；`endMatch → awardProfileResult`（**每局一次**，key=`${mode}:${matchId}`，matchId 开赛生成含时间戳+随机段，刷新重开不撞键）；`objectiveCommand` 记账玩家安/拆/拾取（除 dropBomb）为 objectiveActions；练习不调用（service 白名单兜底） | adapter 报告 §4 接线契约 |
| 12 | 出生主武器仍以 `opts.primary`（菜单偏好）优先、`loadout().primary` 兜底 | 现役 chooseLoadout/nextPrimary 机制承接相位时机；adapter 未暴露 setPresetSlot 透传（adapter 报告 §5 已记），菜单↔预设双向同步需 lane 3 预设 UI + adapter 透传后收敛，见 §4.7 |

## 2. 红绿证据

- **wiring-modes.test.mjs（先红后绿）**：红 —— 首跑 fail（`modeOptionsFor` 未导出 / practice 未注册 / practiceTargets 不存在）；实现 modes/index.js + registry 后绿 3/3。
- `npm test` → **190 pass / 0 fail**（基线 187 + wiring 3；bots/modes/profile 既有测试无回归）。
- `npm run build` → `built dist/index.html 938.5 KB`。
- **e2e-wiring.mjs（新）15/15**，调试过程修正了 3 处**测试自身**的问题（实现未改）：
  1. HE 平投落地后滚翻出 10m+ 超出爆炸半径 → 改为引信临爆前把 bot 确定性摆到爆点旁（setup 干预锁定几何）；
  2. 暂停期 simulate 不同步 soldier.root，`chestWorld/headWorld` 与逻辑位脱节 → place 后手动同步表现层；
  3. `g.time += 5` 手动推进使遗留 `autoSwitchAt` 立即触发吞掉后续出手 → throwCur 前清理（真实游戏时间连续流动不会遇到，非产品 bug）。

## 3. e2e 结果（全量真实浏览器）

| 套件 | 结果 |
|---|---|
| `node scripts/e2e-bomb.mjs` | **36/36 通过**（爆破回合流转/安拆包/死亡掉包/运输船 TDM 冒烟/无脚本异常） |
| `node scripts/e2e.mjs` | **21/21 通过**（运输船主流程/设置迁移/file:// 冒烟/无异常） |
| `node scripts/e2e-desert.mjs` | **34/34 通过**（97 节点可达/8 条物理腿/机器人活跃/运输船冒烟/无异常） |
| `node scripts/e2e-wiring.mjs`（新） | **15/15 通过**（练习 5 + 投掷物 8 + 档案 2），结果 `artifacts/e2e-wiring-results.json` |

wiring 冒烟覆盖：练习进得去（URL ?mode=practice、仅玩家、7 靶+7 网格）、能打靶（fireWeapon→hitScan 实弹路径 totalHits=1、受击 flash）、快照有数（reset/换枪同步）；HE 爆炸实际扣血（hp 100→87.8）；闪光后 bot `blindUntil/blindIntensity` 置位（2.21s/0.74）且 **canSee=false → 消退后恢复**；烟雾穿越视线 blocked、旁路畅通、**AI 视线穿烟 canSee=false → 烟散恢复**；4 号键轮换 he→flash→smoke 带剩余量记账；档案 persisted、loadout 全目录内、awardMatch 恰好一次 + 同 key 去重。

## 4. 给 lane 3 的 HUD 消费契约

1. **闪光白屏**：`hud.update(dt, s)` 新增 `s.blind = { remaining: 秒, intensity: 0..1 }`（仅玩家存活时非 null）。渲染建议：白色叠加层 opacity ∝ intensity × (remaining / 满时长)，`remaining ≤ 0` 隐藏。数据源 `player.blindUntil`（game.time 时点）/`player.blindIntensity`，第三人称/观战如需可读任意 actor 同名字段。
2. **练习面板**：`s.practice = PracticeRuntime.snapshot()` 或 null（非练习模式）。形状：`{ now, totalHits, targets: [{id, pos:{x,y,z}, hits, flash}], weapon: { slots: {slot→id}, current } }`，整体可 JSON 序列化；`targets[].flash > 0` 时高亮该靶；换枪 UI（如做）调 `game.practice.selectWeapon(id)` / `canSelectWeapon(id)`（合法目录含近战与投掷物）。
3. **军衔/结算**：`s.award = { awarded, xp, rankUp, rank: { rankName, level, xp, nextThreshold, progress } } | null`（仅 `ended` 后非 null，发分后快照可直接渲染；`awarded:false` 静默）。菜单/暂停页可随时调 `game.profileAdapter.rankView()` 与 `presets()`/`switchPreset(i)`/`persistence()`/`onProfileChanged(cb)`（`persistence()==='memory'` 时显示「本地存档不可用，进度仅本次会话有效」，勿宣称「已保存」——adapter 报告 P3-5 语义）。
4. **投掷物 HUD**：slot 3 图标应显示 `inv[3].def.id`（he/flash/smoke 轮换）与剩余量（`inv[3].mag`）；背包语义见 §1.6/1.7。
5. **视觉提示（可选消费）**：`game.smokes`（`{cloud, mesh}`，cloud.opacity()/expired() 可查）与 `game.practiceMeshes` 已由 game 层渲染，HUD 无需处理；报点/雷达不受烟雾影响（未改 hud）。
6. **[需 lane 3] 菜单模式选择**：UI 在 hud.js 模板内，本 lane 未触碰。数据已就绪：`modeOptionsFor(mapDesc)`（modes/index.js 新导出）按 `supportedModes` 顺序返回 `[{id, name}]`（运输船 tdm/practice、沙漠灰 bomb/tdm/practice）；渲染 `<div class="seg" data-k="mode">` 后需在 settings.js ENUMS 加 `mode` 才能持久化（settings.js 归属请协调者确认），当前 `URL ?mode=` 已可用作过渡。
7. **[需路由] 预设↔菜单主武器双向同步**：adapter 缺 `setPresetSlot` 透传（adapter 报告 §5 遗留），当前菜单主武器偏好（opts.primary）优先于档案预设；收敛方案需 adapter 加透传方法 + lane 3 预设编辑 UI。
8. **[给视觉/性能] lampSpots 顺序**：未动渲染与灯具消费（前 4 个点光源逻辑原样），视觉 lane §5.5 的「洞内优先」语义不受本波影响；贴花 renderOrder 未动。

## 5. 其他说明

- `src/main.js` 无需改动（入口未变）。
- bots.js/player.js/hud.js/viewmodel.js/guns.js 零改动；`WiredBot` 是 bots.js 的唯一消费差异点（子类覆写 canSee，`new WiredBot` 替换 `new Bot`，game.js 内）。
- 已知边界：暂停期表现层（soldier.root/投掷物网格）不同步逻辑位，仅影响测试干预手法，不影响运行时（simulate 每帧同步）。
- 视觉 lane 报告 §2 的 render.js bloom 根治建议仍待 E 波/性能收敛，本波未动 render.js。
