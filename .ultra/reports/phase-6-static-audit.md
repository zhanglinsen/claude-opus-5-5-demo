# E 波独立审查 — 双地图静态审查与资源泄漏排查

**审查员**：GLM-5.3-Flash MAX（全新上下文只读，会话 3447927a-2f24-43b1-9bff-b8b145baa5f9，事件 `.ultra/dispatch/logs/phase-6-static-audit.jsonl`，提示 `phase-6-static-audit-prompt.md`）

# E 波双地图静态审查与资源泄漏排查报告（只读）

**审查对象**：`cf-transport-ship`（工作树，基线 54adc1f + E 波变更），审查域覆盖 `src/` 全部 43 个文件（逐文件通读，含 audio.js 1848 行、game.js 1073 行全文）。
**测试实测**：`node --test tests/unit/*.test.mjs` → **223 通过 / 0 失败 / 0 跳过**（1.02s）。
**探针实测**：`node --input-type=module` 内存探针 ×4（详见下文），全程未写任何文件。

---

## 结论：**APPROVE**（无 P1 / 无 P2）

不存在阻塞最终验收的缺陷。泄漏类问题全部为“已脱离场景、无强引用、可被 GC 回收”的**未 dispose 卫生问题**（P3），与规格“连续重开 10 次资源趋稳”的验收方向一致，建议最终浏览器验收时顺带观察；若实测有增长趋势，按 P3 清单补 dispose 即可，无需冻结流程。

---

## 逐项证据

### 1. 资源泄漏 —— 清理链完整，无留存型泄漏；dispose 卫生不完整（P3）

**清理链验证（startMatch → endBombSession / destroyPractice / clearSmokes）**
- `startMatch` 先 `endBombSession()`（bomb-session.js:134 `destroy()` 断钩子 + `match.restart()`；c4 标记 scene.remove，game.js:506-510）→ `destroyPractice()` → `clearSmokes()` → 移除 actors/tags/nades 并重置数组与计时器（game.js:296-302）。链完整。
- `quitToMenu` 同样走这三步 + `audio.stopAmbient()`（其内部对称淡出并断开全部 srcs/nodes，audio.js:1132-1158）。
- **探针 3**：BombSession 构造/销毁 ×10，`destroyed` 后 update/command 全部失效，spawnAll 恰好 10 次，会话无定时器/监听器，整体随 `bombSession=null` 可回收。

**Three.js 对象复用（探针 1/2 实测）**
- 同队 Soldier **共享几何**（`GEO_CACHE`，character.js:73-75）与**共享图集贴图**（`ATLAS`，character.js:6-8）；`buildGunMerged` 全局缓存几何+材质（guns.js:321-344），投掷物网格/换枪/第三人称枪模均无 GPU 累积。
- effects.js 全部池化：粒子 900+900 上限、贴花 InstancedMesh 定容循环覆盖、曳光 48、枪口焰 12、动态灯 3、海鸥 6。
- audio.js voice 上限 48（`_reserve` 丢弃最远/最旧），`_free` 断开全部节点，`_tick` 兜底回收超时 voice（audio.js:1345-1399, 1709-1712）；ambient 启停对称且支持淡出期重入（audio.js:986-999）。
- env.js：PMREM 环境图按 `envKey` 变更才重建，旧 `envRT.dispose()`（env.js:317-337）——`startMatch` 重复 `env.apply(o.tod)` 不再重复渲染 PMREM。

**监听器/RAF/定时器**
- 全部 window/document 监听器均为一次性绑定：`Player.bind` 有 `g._inputBound` 防重入（player.js:83-86）、HUD 构造一次、TouchControls 构造一次、audio `setInterval` 一次。重开 10 次监听器数不变。
- `game.timers` 在 startMatch 清空；击杀播报/结算的 `setTimeout` 均有 `this.playing` 守卫或无害化（game.js:360, 856）。

**重开 10 次的实际累积（静态盘点 + 探针 1）**
每次重开新建且**不 dispose**（脱离场景后仅靠 GC）：每角色 1 个 `MeshStandardMaterial`（character.js:202，探针实测 10 次重开 ×10 角色 = 100 个）、每队友 1 张 256×48 CanvasTexture + SpriteMaterial（game.js:363-374）、每颗烟 1 组 SphereGeometry+MeshLambertMaterial（game.js:261-268）、每靶 2 几何 + clone 材质（game.js:197-210）、每爆破局 2 组 BoxGeometry+材质的 C4 标记（game.js:533-544）。单次量级为 KB～数十 KB，无强引用残留，属 GC 延迟回收而非真泄漏。

### 2. 双地图切换 —— 两路径一致，均为整页重载

- URL 路径：`init` 里 `resolveMapId(qs.map, opts.map)`（registry.js:125-130，URL > 已存 > 新玩家默认 > 首张可用），随后写回 `opts.map` 并保存（game.js:62-65）。
- 菜单路径：地图按钮写 `opts.map`/`opts.mode` 后 `onOption('map') → location.reload()`（game.js:471-472），与画质切换同路径。
- **探针 4**：`resolveMapId('transport-ship','desert-grey')`='transport-ship'（URL 优先）、非法 URL 回退已存、损坏输入（数字/对象）落到 desert-grey、`inSpawnZone` 两图各自轴向判定正确。
- 因切图=整页 reload，旧地图几何/贴图/环境图/灯具/导航网格由浏览器整体回收，**不存在跨图残留路径**；两图构建器均合批（map.js Batch / desert-grey.js Batch），沙漠灰 `env.ocean:false` 时不创建海面（env.js:246），`ambientKey:null` 时不建烟囱/海鸥氛围（game.js:97-98）。运输船 NavGrid 经 `createGridNav` 适配、沙漠灰走高度图导航（navigation.js:300-305），边校验缓存按“边×端点×profile”有界。

### 3. 跨模块一致性 —— 通过

- **HUD 不内嵌规则**：`objectiveHud`（hud.js:19-68）只读渲染 `objectiveView` 快照，回合/C4/胜负全部取自视图字段；安/拆包分母来自 `view.plantHold/defuseHold`（bomb-session.js:119-120），`BOMB_DEFAULTS` 仅作防御性兜底。
- **输入层无判定**：`BombInput`（player.js:7-62）只做命令状态机（防连点、松开重按），命令合法性由 `BombMatch.applyCommand` 权威校验；`Game.objectiveCommand` 纯转发（game.js:517-520）。
- **无 wall-clock 进规则层**：BombMatch/BombSession/PracticeRuntime/SmokeCloud/GrenadeProjectile 只吃 `update(dt)`；`performance.now()`/`realTime` 仅出现在 HUD 淡出、菜单环绕镜头等表现层。`matchId` 的 `Date.now()` 只作唯一键。
- **无全局定位器**：依赖均经构造注入（profile adapter/service、navigation、modes）；`window.__game` 为调试句柄（见非阻塞清单）。

### 4. 配置/设置 —— 通过

- 迁移路径：v1 `cf_ship_opts` → v2 `cf_opts_v2`，"legacy 键存在即默认运输船"，损坏 JSON/抛错 storage 全部归一化为可用默认（settings.js:64-114；单测 4 例覆盖含 getter 抛错回退内存）。
- profile 键隔离：`cf_profile_v1` 独立于 `cf_opts_v2`（repository.js:4），legacyPrimary 只迁入预设 0（service.js:28-39）。
- 损坏归一化覆盖：档案级 `normalizeProfile`/`normalizeStats`（越界夹紧、wins≤matches、ledger 只留字符串且上限 200）、预设级 `normalizePreset`（目录外回槽默认）、raw 解析拒绝无版本号记录（service.js:49-79, repository.js:15-22）。storage 失败降级 memory 并在 HUD 如实提示（hud.js:295）。

---

## 缺陷列表

**P1**：无。
**P2**：无。

**P3（不阻塞，建议后续 hygiene）**
1. `src/game.js:363-374`（addTag）/ `startMatch:300`、`quitToMenu:438` — 队友名牌 CanvasTexture+SpriteMaterial 移除时未 `dispose()`；每次重开 +N 张贴图，量级 KB 级、GC 可回收。若浏览器重开实测增长，此处是首选补丁点。
2. `src/character.js:202` — 每 Soldier 实例新建 `MeshStandardMaterial`（几何/图集已共享），未 dispose；探针实测 10 次重开 ×10 角色 = 100 个材质。建议改为按 team 缓存材质或 remove 时 dispose。
3. `src/game.js:259-271, 533-544, 197-210` — 烟雾球、C4 标记、练习靶的几何/材质逐实例创建、`clearSmokes`/`endBombSession`/`destroyPractice` 只 remove 不 dispose。同上量级。
4. `src/game.js:431-444`（quitToMenu）— 未清 `this.nades`：飞行中手雷的网格会残留在菜单背景场景里，直到下次 startMatch 才被移除（game.js:301 兜底）；纯观感问题。`this.timers` 同样未清但永不触发。
5. `src/game.js:856` — TDM 达标后 `setTimeout(endMatch, 1200)` 只判 `this.playing` 不判 `this.paused`：暂停期间墙钟仍会结束对局。历史行为，非 E 波引入。
6. `src/game.js:221-224` — 就地重写了 `smokeBlocksSight` 的三行循环而未 import `combat/grenade-effects.js:130` 的同名导出（语义一致、有单测锁定）；建议收敛到唯一接缝。

## 非阻塞清单（死代码/孤儿导出，仅列不修）
- `src/textures.js:751` `T.spark = sparkTex()`：每次启动生成但无任何消费方（特效只用 glow/puff/flash/flashSide）。
- `src/maps/desert-grey.js:224` `landmarkViews`：布局→构建结果透传，产品代码无消费（仅 desert-layout 单测校验 id 唯一）。
- `src/combat/grenade-effects.js:29` `computeHeBlast`：产品路径为 `Game.explode` 内联实现，导出仅作测试对齐锁（注释已声明该契约）。
- `src/combat/grenade-effects.js:130` `smokeBlocksSight`：导出无调用方（见 P3-6）。
- `src/weapons.js:89` `WeaponState.refill()`：src 与 tests 均无调用。
- `src/audio.js:918, 899` `playUI('countdown')` / `'hover'` 分支：无触发点。
- `src/game.js:124` `window.__game`：调试全局句柄（e2e 使用场景），非服务定位器模式。
- `src/map.js:6,633` `CH/CW/L20/L40/hullContour` 导出：模块内自用为主，外部无 import。

**验收建议**：E 波候选可冻结进入最终验收；最终浏览器验收的“连续重开 10 次”环节顺带记录 scene 内 mesh/材质计数与 GPU 内存趋势即可，若趋平则本报告 P3 全部转为记录项闭环。