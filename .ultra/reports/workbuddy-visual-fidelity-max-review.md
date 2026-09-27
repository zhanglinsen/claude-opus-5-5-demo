# 双地图质感提升 · 独立只读审核报告

- 审核会话：全新 Workbuddy 会话（GLM-5.3 旗舰 MAX 上下文），独立于主 Flash 实施会话。
- 审核时间：2026-09-27 21:27–21:50 (+08:00)。
- 工程分支：`codex/desert-grey`，审核基线 HEAD `c0c28e6`。
- 铁律声明：本会话只读游戏源码/构建产物/性能数据，仅写入本报告一个文件；未运行构建、浏览器、GPU 或测试；未触碰 Git 状态、互斥标记与任务文件。

---

## 0. 冻结状态核查（审核前提，按提示要求先行）

按审核提示要求，先核实主 Flash 会话是否已冻结候选。**结论：审核开始时冻结协议尚未完成，但状态已收束稳定，本报告基于该稳定快照出具。**

观测时间线（全部来自文件 mtime 与内容，非推断）：

| 时间 | 事件 | 证据 |
|---|---|---|
| 20:51–20:58 | 正式配对测量 run1（5 轮），主机负载波 22→190 污染 | `artifacts/accept-gpu-pair-formal-20260927.json` |
| 21:09 | bldMidW 空心大厅修复截图（修复在工作树时构建） | `artifacts/desert-landmark-mid-fix1.png`、`desert-overview-fix1.png` |
| 21:11 | 路由 e2e 32/32 | `artifacts/e2e-desert-results.json`（date 13:11:51Z） |
| 21:16–21:21 | fx 系列 5 轮配对截图存在，**数值 JSON 缺失**（旧版脚本仅结尾持久化，中途丢失全部帧率数据） | `accept-gpu-pair-final-20260927-fx-*.png` 存在；`accept-gpu-pair-final-20260927.json` 不存在 |
| 21:24:50 | `scripts/accept-gpu-pair.mjs` 被修改（加入逐轮持久化） | 脚本 mtime |
| 21:25–21:28 | final2 补测：沙漠 1 轮（负载 13–22，安静）+ 船候选 1 轮（负载冲到 209，严重污染） | `artifacts/accept-gpu-pair-final2-20260927.json`（finishedAt 13:28:07Z） |
| 21:30:42–21:30:59 | bldMidW 修复从工作树还原（存入 stash），dist 重建为**无修复**版本 | 文件 mtime；`stash@{0}: ablation: temporarily revert hollow-hall fix` |
| 21:31–21:34 | 消融测量（nofix）沙漠 2 轮，负载 157/105 | `artifacts/accept-gpu-pair-ablation-nofix-20260927.json` |
| 21:34–21:50 | 无任何新写入（观察 15 分钟） | `find -newer` 为空 |

当前冻结态：HEAD `c0c28e6`，工作树对游戏源码干净；**bldMidW 修复不在树内而在 `stash@{0}`**；`dist/index.html`（10,523,243 字节，21:30:59）为无修复构建；`.ultra/reports/workbuddy-visual-in-progress.md` 标记仍存在但 stage 信息停在 21:15（过期）。无 `final-visual-fidelity-handoff.md`。

**本报告的审核对象**：HEAD `c0c28e6` 这一明确快照（含 stash 中待回放的 bldMidW 修复），对照本轮质感提升目标。**重要背景**：`.ultra/dispatch/workbuddy-visual-fidelity-task.md`（21:17）明确本轮 A/B/C 路须等上一轮互斥标记清除后才开工；截至审核时 A/B/C 路源码改动**均未落地**，因此本报告实质判定的是"当前候选距本轮质感目标的差距"，并逐项核实任务文件预定位的两个代码缺陷。

---

## 1. 审核范围与方法

**逐张查看的图像**：用户原图 `.ultra/references/visual-quality-20260927/desert-grey-user.png`、`transport-ship-user.png`；候选运行截图 `accept-gpu-pair-final2-20260927-fx2-desert-r2.png`（沙漠·出生区，46 FPS HUD）、`fx2-ship-cand-r3.png`（运输船·BL 舱壁，TDM 15:16）；bldMidW 修复截图 `desert-landmark-mid-fix1.png`、`desert-overview-fix1.png`。

**全文阅读的源码**：`src/env.js`（363 行全文）、`src/render.js`（97 行全文）、`src/game.js` 关键段（init 70–145、startMatch 318–330、选项 504、循环 1005–1030、updateLightProbe 1055–1062）、`src/guns.js` 材质段（1–76）、`src/viewmodel.js`（1–80 + 光照 154–268）、`src/maps/desert-grey-materials.js`（390–469 全段）。

**核对的数据/报告**：4 份配对 JSON（short/formal/final2/ablation）、`accept-gpu-unthrottled-run1/2.json`、`accept-gpu-loaded-host-final.json`、`accept-gpu.json`（经 BLOCKED.md 转述核对）、`accept-restart-check.json`、`e2e-desert-results.json`、`scripts/accept-gpu-pair.mjs`、`BLOCKED.md`、`final-visual-handoff.md`、`workbuddy-final-visual-review.md`、`performance-contention-2026-09-27.md`、互斥标记。

---

## 2. 通过项

1. **配对测量方法学框架成立**。`scripts/accept-gpu-pair.mjs`：多 root（候选/基线各自 dist）、同机串行、防节流 Chrome 参数、固定 1920×1080 中画质、负载前/中/后全程采样、GPU renderer 逐轮记录、页面错误/崩溃/导航计数、`--out` 强制新文件名禁止覆盖历史证据、逐轮持久化（21:24 修复后）。方法方向正确。
2. **10 次重开资源测试证据扎实**（`artifacts/accept-restart-check.json`）：纹理 87–100 抖动无棘轮、几何 +1 惰性步（151→154，极差 3≤3）、drift −3.3≤6、0 页面错误，pass=true。本轮未改资源生命周期，继续沿用有效。
3. **受影响功能冒烟已做**：bldMidW 修复后 unit 28/28、路由 e2e 32/32（`e2e-desert-results.json`，21:11），修复截图同机位可查。
4. **运输船视觉无明显回退迹象**：短配对（20:46–20:47，负载 30–49）cand-ship median 60 vs base-ship 59（`accept-gpu-pair-short-20260927.json`）；final2 船候选截图与用户原图同机位对比，舱壁波纹板/锈渍流挂/BL 与禁烟标识/黄黑警示门框/箱区涂装（STAR/GLO/ORI、LENSV、CARTRIDGES）均在位，甲板钢板缝与涂装可读。C 路未实施即等于维持原状，无回退。
5. **诚实报告文化**：`BLOCKED.md` 如实记录"三轮沙漠灰 P5 57/49/41 仅一轮达标"且反对以单轮最佳宣称达标；`performance-contention-2026-09-27.md` 如实区分系统竞争与代码归因。审核文化符合本轮要求。
6. **构建自包含**：`dist/index.html` 10,523,243 字节单文件（21:30:59 重建）；历史 file:// 离线打开有先前轮报告背书（见第 7 节复测项 B5 的残留缺口）。
7. **两图风格保持**：沙漠灰暖灰石城、运输船冷色工业的风格基调在所有截图中保持一致；总览截图确认裙楼环已与围墙衔接、孤岛感消除（`desert-overview-fix1.png`）。

---

## 3. 阻塞项（按严重程度排序）

### B1（最高）：本轮质感提升的核心代码修复未实施，两个预定位缺陷在 HEAD 均确证存在

#### B1a 武器第一人称环境反射未绑定（A 路目标，代码路径确证 + 运行时截图吻合）

代码因果链（全部行号为 HEAD `c0c28e6` 实读）：

1. `src/game.js:103` 创建 `Environment` → 构造器末尾 `src/env.js:266` 先 `apply('day')`；
2. 该次 `apply` 中 `envKey !== this._envKey`（env.js:319–323）→ `buildEnvMap()` 执行，但此时 `game.js:104` 的 `this.env.extraScenes = [this.renderer.vmScene]` **尚未执行**，env.js:350 `for (const s of this.extraScenes || [])` 循环为空 → 只有主场景拿到 `environment`；
3. `game.js:105` 随后 `apply(this.opts.tod)`，默认 `tod: 'day'`（`src/settings.js:17`）→ envKey 与构造器完全相同 → **命中缓存跳过 `buildEnvMap()`**；
4. `game.js:326` startMatch 再次 `apply(o.tod)` 仍为 'day' → 继续跳过。**全工程检索确认 `vmScene.environment` 无其他赋值点**（`game.js:1020` 仅逐帧设置 `vmScene.environmentIntensity`，在 environment 为空时是无效操作）。

净效果：首次白天开局 `vmScene.environment` 恒为空，直到用户手动切换时间档（day→dusk 改变 envKey 才重建）。VM 场景仅有 `DirectionalLight 2.6×lightK` + `HemisphereLight 0.35`（`viewmodel.js:32–38, 266–268`）直射光补偿。

材质后果（`src/guns.js:38–52`）：`metal` 基色 0x2b2d30 + metalness 0.85、`black` 0x16171a + metalness 0.35、`steel` 0x8e939a + metalness 0.95——金属度 ≥0.5 的材质外观几乎全部依赖 IBL 反射，无 IBL 时只剩分析光的细高光。

**运行时证据吻合**：用户原图 `desert-grey-user.png`（手枪纯黑剪影）、`transport-ship-user.png`（步枪纯黑剪影）；候选测量截图 `fx2-desert-r2.png` 中 AK47 **木护木/枪托可读（漫反射材质，metalness 0.05）而机匣/弹匣/枪管近黑（金属件）**——正是"无 IBL 时金属件变黑、漫反射件正常"的分裂表现，与代码因果一致，排除截图观感误判。该缺陷在两张地图同样成立（envKey 逻辑与地图无关）。

#### B1b 沙漠灰材质三通道不匹配 + 镜像重复痕迹（B 路目标，代码确证）

`src/maps/desert-grey-materials.js:426–455`：均衡/精致档加载旧石墙/地面图片后，`material.map` 换为图片、`material.normalMap = null`（436/450 行，注释"原程序凹凸图与新石缝不对齐"），**但 `roughnessMap`（401 行挂接的程序粗糙度图）原样保留**——程序粗糙度图是按旧程序 albedo 的纹理/接缝生成的，与照片级石缝 albedo 内容错位，且法线通道缺失，三通道互不匹配。

**运行时证据**：`fx2-desert-r2.png` 与 `desert-landmark-mid-fix1.png` 中两侧墙面同款深色污渍以镜像对称方式周期重复（"蝴蝶"伪影清晰可见，单侧墙约重复 4–5 次），地面路径与两侧过渡生硬——即用户反馈的"墙面重复、地面过于均匀"未改善。`MirroredRepeatWrapping` 消除了接缝色差但引入了对称伪影，且无大尺度污渍/变体叠加（任务文件 B 路要求的固定种子变体、大尺度污渍、墙脚磨损均未落地）。

### B2：候选冻结协议未完成

bldMidW 空心大厅修复（V 路终审确证差距的唯一修复，已通过 unit 28/28 + e2e 32/32 + 同机位截图验证）**当前不在工作树**，仅存于 `stash@{0}`；HEAD `c0c28e6` 不含它；`dist/index.html` 为消融用无修复构建。任何"冻结候选"都必须先 `stash pop`、重建、提交并记录哈希。互斥标记 stage 信息（21:15）落后实际活动 20 分钟，final2 与消融结果未回写。

### B3：性能门槛证据不闭合（含证据丢失）

全部同机 1080p 中画质、AMD Radeon Pro 5500M、有头 Chrome：

| 轮次 | 时间 | 沙漠灰 med/P5 | 运输船 med/P5 | 负载 | 判读 |
|---|---|---|---|---|---|
| unthrottled-run1/2 + loaded-host-final（旧候选） | 下午 | 60/57、60/49、60/41 | 48/35、50/37、47/35 | 19–48 | 仅 57 一轮 ≥55 |
| accept-gpu.json（BLOCKED 转述） | 19:27 | 45/31 | 39/29 | 6→18 | 污染 |
| formal run1 | 20:51 | 57/27、55/40 | 36/22、38/19（base 41/25） | 22→190 | 双方均污染；同窗口 cand 船低于 base |
| final2 | 21:25 | **45/36（负载 13–22，唯一近安静轮）** | 30/15 | →209 | 沙漠可用；船轮作废 |
| short 配对 | 20:46 | 57/18（14s） | cand 60 / base 59（14s） | 30–49 | 方法验证轮，太短 |
| 消融 nofix | 21:31 | 42/0、50/34 | — | 157/105 | 与 final2 负载不可比，仅说明修复无明确代价 |

- **沙漠灰 P5 ≥55**：全部原始轮次中仅 57 一轮达标（且该轮负载 19–48，BLOCKED.md 已自行质疑）。按"主机竞争时不以最佳单轮宣称达标"的审核准则，**未达标**。唯一近安静轮（final2，负载 13–22）P5=36。
- **运输船无实质回退**：同窗口 cand/base 完整对只有 formal run1（36–38 vs 41，双方被 90–190 负载污染）与 short 轮（60 vs 59，各仅 14 秒）。**方向上无回退信号，但无一段安静负载下的 ≥60 秒配对**，不能出"通过"结论。
- **fx 系列数值丢失**：21:16–21:21 的 5 轮（含 desert-r1、ship cand/base ×2）只有截图没有 JSON——旧版脚本结尾才持久化、中途丢失。21:24 脚本已修复为逐轮持久化，但该轮数据不可恢复。

### B4：测量方法缺口

1. 配对脚本**不采集 draw calls / triangles / 纹理数**（`page.evaluate` 仅取 t/fps/quality/simTime）——本轮验证清单明确要求 draw calls；若 B1a 修复后材质/环境图变化，需要 draw call 佐证无回归，当前无此数据。
2. 采样窗口不一致：final2 沙漠 `simTimeStart=1`（避开启动零帧）而船与消融轮 `simTimeStart=0`，启动 0 FPS 帧直接把 P5 打到 0（消融 r1 P5=0、short 船 P5=0 均为此伪影），P5 统计在轮间不可比。
3. 主机负载波（22→190、→209）反复出现在船图测量窗口，来源未定位（此前记录有 VMware/WindowServer 竞争）；在负载无法压低时，当前仅有"双方同污染"的弱对照，未做帧时间/渲染统计减法定位。

### B5（次要）：重建后未记录离线打开结果

dist 于 21:30 重建（无修复版），本轮未重新记录 file:// 离线打开结果；仅有历史轮报告背书与文件大小。回放 stash 重建后需补一次。

---

## 4. 不确定项（不计入差距）

1. 石作/坑道冷暖：源码 `stone` tone=140 暖灰（rr>bb），截图偏暗主要来自洞内补光与 AO；低分辨率用户原图无法确证超差。
2. 人物轮廓"偏硬"：用户原图人物为暗色剪影加轮廓光，与 VM/角色材质有关（C 路人物子项未实施），但无法从现有截图分离"确实偏硬"与"武器黑剪影连带观感"，留待 A/C 路修复后同机位复拍。
3. 运输船总览证据缺口（前轮已记录）：artifacts 缺少运输船环绕/总览截图，整体轮廓仍靠源码背书。
4. 消融测量的决策含义：nofix 42/50 vs cand 45（负载不可比）不能证明修复有性能代价；是否保留修复应以视觉价值 + 回放后的正式配对为准。

---

## 5. 最小修复建议（交回 Flash 主会话执行）

1. **B1a（最小而结构正确）**：在 `src/env.js` 为 `extraScenes` 增加 setter（或 `bindExtraScenes()` 方法），赋值时立即将当前 `this.envRT?.texture` 绑定到新场景并同步 `environmentIntensity`；环境键变化重建时原有 350 行循环继续兜底。备选一行补丁（归集成者）：`game.js:104` 赋值后强制失效缓存 `this.env._envKey = null` 再 `apply(this.opts.tod)`。二选一，不得双改。顺带清理 `game.js:1020`：environment 未绑定时 `environmentIntensity` 是无效操作，绑定后需保留。
2. **B1b**：两个图片加载回调中（427–440、441–454）在 `material.normalMap = null` 的同时 `material.roughnessMap = null` 并设标量 `material.roughness`（墙 ~0.9、地面 ~0.85 起步），`oldRough?.dispose()` 与旧贴图同等处理；镜像重复伪影与大尺度变体属 B 路后续迭代，不阻塞本轮最小修复。
3. **B2**：`git stash pop` 回放 bldMidW 修复 → 重建 → 同机位复验 `desert-landmark-mid-fix1/overview-fix1` → 与 B1a/B1b 修复一并做**一个选择性提交**（不含临时日志/性能产物），记录哈希，然后更新互斥标记 stage 与 `final-visual-fidelity-handoff.md`。
4. **B4**：`accept-gpu-pair.mjs` 采样增加 `renderer.info.render.calls/triangles` 与 `textures.memory`（每 2 秒随现有 evaluate 一并返回）；统一所有轮 `simTimeStart>=1`；船图配对等负载 <10 窗口执行（或按 performance-contention 的减法定位流程先归因）。
5. **B5**：重建后用 file:// 打开 dist 冒烟一次并记录结果。

## 6. 定向复测范围（修复后只复核以下项；其余沿用）

- **必须复测**：① 首次白天开局（默认 tod=day、两图各一）武器反射绑定前后对照截图（同机位：沙漠出生区、船 BL 舱壁）；② 手动 day→dusk→day 往返与对局内重开后的 VM 绑定；③ 沙漠灰墙面粗糙度观感 + 同机位截图；④ 安静窗口（load<10）双图 ≥60 秒正式配对（cand 含 bldMidW 修复 + 全部新修复，base 用 `/tmp/cf-ship-baseline-p` c935ace），含 draw calls；⑤ file:// 离线打开。
- **沿用不复测**：229 单测、e2e-bomb 40/40、loadout/ping 6/6、e2e-desert 完整 34/34（路由 32/32 已对 bldMidW 复验）、10 次重开、603.5 秒长跑（本轮未触及资源分配/渲染循环/音频生命周期）。
- **明确禁止**：以任一单轮最佳值宣称沙漠灰 P5 达标；在负载 >30 窗口出正式结论。

---

## 7. 结论

**CHANGES_REQUIRED**

核心依据一句话版本：本轮质感提升（A 路武器环境反射、B 路材质三通道、C 路船面/人物）尚未实施，任务文件预定位的两个代码缺陷在 HEAD `c0c28e6` 经代码路径与运行时截图双重确证仍然存在；bldMidW 修复滞留 stash 未提交；沙漠灰 P5≥55 与运输船无回退均无可靠负载下的配对证据。上述 B1a/B1b 为小而明确的代码修复（各 ≤10 行），B2 为流程收尾，修复后仅需第 6 节定向复测即可再审。

*报告生成：2026-09-27 21:50 (+08:00) · 审核引擎：Workbuddy GLM-5.3 旗舰 MAX 独立只读会话 · 未改动任何游戏文件*

---

# 第二轮复核（修复后，只审受影响项）

- 复核会话：同一独立 GLM-5.3 旗舰 MAX 只读上下文（继 21:50 第一轮 CHANGES_REQUIRED 之后）。
- 复核时间：2026-09-27 23:29–23:55 (+08:00)。
- 复核范围：仅第一轮 B1a/B1b/B2/B4/B5 对应的受影响项 + C 路外观回归 + 性能复核；沿用不受影响的玩法证据（229 单测、e2e-bomb 40/40、loadout/ping 6/6、603.5s 长跑不再复测）。
- 铁律声明同前：只读游戏源码/构建产物/证据，仅写本报告；未运行构建/浏览器/GPU/测试。

## R0. 冻结状态核查（复核前提）

主 Flash 会话已按约定收束：互斥标记 23:15 更新为 **WRITES STOPPED — candidate frozen at 60fed10 (+1d199bb)**；候选提交 `60fed10`（22:42:54，12 文件 +683/−23）+ 采样修复 `1d199bb`（23:14:48）；stash 已清空（bldMidW 修复已回放进提交）；无活跃写入（23:15 后无新产物）。

**dist == 提交源码确证**：dist/index.html（10,528,802 字节，22:16:18）早于提交但晚于全部源码最后修改（game.js mtime 22:16:18 与 dist 同批，22:16→22:42 间无源码变更）；提交特征串在 dist 中全部命中——`registerExtraScene`×2、`midHallLintel`、靴底 `sole`×4、污渍种子 9252/9257/9262/9267、枪械新基色 0x3a3d42→3816770 与 0x24262b→2369067（hex 与函数名经打包压缩后以十进制/混淆名存在，属预期）。22:21–22:28 的预提交测试（fidelity-verify、fidelity-after、e2e 路由）与 22:46 后的提交后测试（重开、filesmoke、正式 GPU、probe2）测试的是同一棵树，证据链自洽。

## R1. 逐项复核（对照第一轮阻塞项）

### B1a 武器环境反射绑定 — **通过**

- 代码：`env.js` 新增 `registerExtraScene(scene)`——注册即绑定当前 `envRT.texture` + `environmentIntensity`（去重），`extraScenes` 在构造器初始化为 `[]`；`game.js:104` 改用注册接口。时序分析确认正确：构造器 `apply('day')` 已先建 envRT，注册时立即绑定命中；后续环境键变化由 `buildEnvMap` 同步循环兜底；apply 缓存命中分支零改动（不掩盖原缺陷，而是补齐注册时序）。全工程无 `extraScenes =` 直接赋值残留。
- 运行时：**修复前**基线 JSON 取证 `vmEnvBound=false, sceneEnvBound=true`（`artifacts/fidelity-baseline/capture-fidelity-*.json`，因果按任务要求先用运行状态验证）；**修复后** `artifacts/fidelity-verify.json` **10/10**：两图首次白天开局、day→dusk、dusk→day（缓存命中）、重开、两图切换，`vmScene.environment` 全程保持，0 页面错误。断言脚本 `verify-fidelity.mjs` 直接检查 `vmScene.environment` 真值，方法正确。
- 截图：`fidelity-after/desert-grey-spawn.png`（向阳：机匣/弹匣蓝灰金属反射+木件材质深度）、`desert-grey-gunback.png`（背光/暗墙：武器保持可读，非剪影）、`transport-ship-spawn.png`（同效）。与用户原图的纯黑武器对照，缺陷消除。
- 配套：枪械基色适度提亮（metal 0x2b2d30→0x3a3d42 m0.85→0.78、black 0x16171a→0x24262b m0.35→0.3、steel m0.95→0.88）+ 手套/袖套提亮，未新增灯——与"不靠加灯掩盖"约束一致。

### B1b 沙漠灰材质三通道 + 镜像重复 — **通过**

- 代码：图片加载回调中 `roughnessMap=null` + 标量粗糙度（墙 0.9 / 地 0.85，旧图 dispose）——即第一轮最小修复建议原文；其上叠加 `compositePhoto()`：2×2 镜像拼贴进 512/1024 画布、固定种子 fbm 大尺度污渍（跨拼块连续、破坏对称）+ 墙脚/边缘 AO + sandPath 车辙带，**三通道（map/roughness/normal）同一过程派生**；`texture.repeat=(0.5,0.5)` 守恒世界尺度（画布含 2 拼块，每拼块仍占 uv 米）；合成失败回退照片直贴+标量粗糙度；源图烘入后 dispose；low 档零改动。关键实现细节复核：`tex()` 默认 `RepeatWrapping`（19-25 行），合成贴图 repeat 0.5 平铺无 ClampToEdge 穿帮风险；plaster/plasterB 与 sand/sandPath 种子错开（9252/9257/9262/9267）。
- 截图：`fidelity-after/desert-grey-mid.png` 对照第一轮 `desert-landmark-mid-fix1.png`——原"同款污渍镜像对称重复 4–5 次"消除，污渍跨拼块有机连续；地面出现大尺度色调与车辙变化。第一轮不确定项"墙面重复"已按用户反馈闭环。

### B2 候选冻结协议 — **通过**

`60fed10` 单提交含 A/B/C 三路 + 集成：bldMidW 实心楼重构为 6 面壳墙 + 顶板 + 门楣 + 半开木门扇 + 3 室内木箱（外轮廓 x[-20,-6] z[-24,2] h5.5 与檐口线守恒，`desert-grey.js` 手补同位屋顶盖板）——即第一轮滞留 stash 的 V 路修复，已随提交落地（`desert-landmark-mid-fix1` 同款门洞在 after 截图中可见）；提交哈希已记录；最终交接报告 `.ultra/reports/final-visual-fidelity-handoff.md` 已写；互斥标记 stage 如实更新。

### B4 测量方法 — **通过**

`1d199bb`：`renderer.info.autoReset=false` 单调累计 + 相邻样本差分求每秒/每帧调用率（EffectComposer 每帧 main+vm 两遍、帧尾自动清零导致第一版帧间读数恒 0/1——已定位并修正重测）。全部轮次 `simTimeStart=1`，启动零帧伪影消除。probe2 实测：cand-ship ≈293.8 调用/帧 vs base-ship ≈298.1（候选反而少 4），cand-desert ≈146.9——draw calls 无回退。

### B5 离线冒烟 — **通过**

`artifacts/fidelity-final-filesmoke/`：file:// 打开最终 dist，两图 ok、`vmEnvBound=true`、`sceneEnvBound=true`、0 页面错误（desert textures 75 / geometries 83）。

## R2. 性能复核（同机 1080p 中画质，AMD Radeon Pro 5500M，有头 Chrome 防节流）

`artifacts/accept-gpu-fidelity-20260927.json`（22:52–22:57，4 轮串行 ×65s，simTime≥1）：

| 轮次 | median/P5 | 负载 前→后 | 判读 |
|---|---|---|---|
| cand-desert (60fed10) | **60 / 46** | 6.4→22.0 | 帧序列 [36, 60×28, …, 57/56/46/59/59] 与负载波（10.79→21.17→22.04）**逐点对应**：平静段（load 6–10）全程锁 60，P5=46 由首个启动样本 + 末段波造成 |
| base-desert (c935ace) | 38 / 17 | 22.0→18.2 | 非同源早期版本，仅参考（报告已如实标注） |
| cand-ship (60fed10) | **44 / 33** | 17.1→14.5 | 同源配对双优 |
| base-ship (c935ace) | 41 / 18 | 14.0→27.0 | base 中段遭负载波 |

- **运输船无实质回退：通过**。同源配对 44/33 vs 41/18（候选窗口更平静仍双优）+ 20:46 短配对（60 vs 59）+ formal run1 方向一致；draw calls 294 vs 298 持平、纹理 105 vs 116（合成未增材质）、几何 154=154。三重证据一致。
- **沙漠灰 P5≥55：本机仍未获正式达标轮**。最好轮 median 60、平静段锁 60，但整窗 P5=46；历史最好 57（负载 19–48）。测量自身与外部竞争使全程 load<10 窗口无法保证。主会话按规则**未宣称达标**并在 `BLOCKED.md`（23:10 更新）如实保留为唯一未闭合项，附逐点负载数据——符合"不以最佳单轮过关、不虚构 60 FPS"的审核准则。
- 资源：10 次重开（22:46 重跑）textures 87–100 无棘轮、geometries 154 恒定、drift −2.7、0 错误——B 路合成管线 dispose 路径正确。

## R3. 第一轮之外的新增验证（C 路与两图风格）

- 运输船表面：`transport-ship-spawn.png` 舱壁板缝网格 + 分块明度 + 垂挂锈 streak、甲板焊缝/划痕/防滑带、集装箱棱边磨白 + 底部锈带（`textures.js` 全为程序 canvas 增补，`map.js` 零改动）。
- 人物：GR +8 / BL +6 渲染盒（盔檐/盔顶/肩垫/装具带/靴底沿），全挂现有骨骼；`HITBOXES` 未动（hitTest 为固定 AABB slab 测试）；路由 e2e 32/32（22:28，含 C 路改动的工作树）证明机器人物理/路线无回归。人物近距离可读性截图未单独存档（小证据缺口，不阻塞——改动量小且 e2e 覆盖行为）。
- 两图风格：沙漠灰暖灰石城 / 运输船冷色工业保持各自基调；材质深度已接近（武器可读性、墙面层次、船面结构），用户五项检查点全部改善或闭环。

## R4. 复核结论

**APPROVE**（候选 `60fed10` + `1d199bb`）

- 第一轮 CHANGES_REQUIRED 的全部五项（B1a/B1b/B2/B4/B5）逐一复核通过，证据链完整（代码路径 → 运行时 JSON → 固定机位前后截图 → file:// 冒烟）。
- 运输船无实质回退以同源配对 + draw calls + 资源数三重证据通过。
- **唯一遗留（不阻塞候选，须如实随关单报告）**：沙漠灰 P5≥55 在本机未获正式达标轮——median 60 与平静段锁 60 已证，整窗 P5 受测量期负载波（含测量自身推高）压制。处置按 `BLOCKED.md` 既有路径：安静窗口（全程 load<10）复测出 ≥60s 达标轮即闭合；或由用户明确接受"本机 Radeon Pro 5500M 竞争限制"后关单。不得以单轮最佳值或推算值宣称达标。
- 关单动作（由主会话/后续会话执行，非本审核）：按 MAX 复审通过结论清除互斥标记与 `visual-fidelity-pending.md`、更新 `BLOCKED.md` 为已解决/仅剩性能复测项；放行平台阶段前需用户确认。
- 定向复测范围（若后续有源码改动才需要）：仅沙漠灰 P5 安静窗口正式轮 + 受影响机位截图；其余沿用本轮证据。

*第二轮复核完成：2026-09-27 23:55 (+08:00) · 审核引擎：Workbuddy GLM-5.3 旗舰 MAX 独立只读会话 · 未改动任何游戏文件*
