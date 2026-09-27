# C 波独立审核 — 沙漠灰画面

**审核员**：GLM-5.3-Flash MAX（全新上下文只读，会话 c31818cf-6afd-461a-ae8a-9064e987728c，事件 `.ultra/dispatch/logs/phase-4-review-visual.jsonl`，提示 `phase-4-review-visual-prompt.md`）

分类器拒绝了计划目录写入——正好与您“不要写文件”的指令一致，我不再重试，审核报告直接在下方完整给出。

---

# C 波「沙漠灰画面」独立审核报告

## 结论：**APPROVE**

六项必须核实点全部通过，证据链闭合且时间线自洽。发现 3 个 P3 级瑕疵（1 处报告措辞不实、1 处跨 lane HUD 瞬态、1 处观感备注），无一阻塞本波验收。报告整体诚实度高：三处已知偏差（门洞偏宽、A 小道拉直、巷道偏宽）均主动披露，未虚报 FPS，low 档预期效果有言在先。

## 逐点证据

**1. 玩法冻结 ✓**
- 碰撞/视觉 1:1：`desert-grey.js:107-136` 唯二调用 `world.add`/`world.addRamp` 的位置，数据全部来自 `L.solids`/`L.ramps`；贴花 5 张（包点×2、桥面标识、跳落磨痕、窗台漆条）只 `scene.add`（desert-grey.js:152、160-163），檐口/远景/灯具同样零碰撞（desert-grey.js:139-200）。
- `DESERT_LAYOUT`（desert-grey-layout.js，untracked 无 git 基线）以时间戳+测试双证冻结：文件 mtime 9/26 23:37 早于 lane 3 全部改动（9/27 02:26+）；现跑 `node --test desert-layout + registry` 22/22 通过。
- 未跑 e2e（避免写盘），改用最新 `artifacts/e2e-desert-results.json` 复验：**34/34 pass、0 console/page 错误、97/97 可达、124 边 rejected=0、8 条物理腿各带无瞬移断言（maxStep≤0.096/maxUp≤0.260）、运输船冒烟与“无脚本异常”在列**。该 JSON 时间 03:36:30 晚于全部 src 文件 mtime（最晚 env.js 03:12、guns.js 正式修复 03:34），且 `find src tests scripts -newer` 为空——34 项在当前代码态成立。

**2. 规格符合 ✓**
- 三贴图组：`finish()` 产出 map+normalMap(normalFromHeight)+roughnessMap（desert-grey-materials.js:30-42），8 族材质全走 `std()`；roughness=1 绝对值编码属实。
- 风化细节与固定种子全部落实：水渍×8/裂缝×4/起皮×5、石砌凹缝+倒角、对拉螺栓孔+雨痕、板缝+横撑铆钉；fbm/mulberry32 种子 9101-9190 硬编码，远景建筑 LCG 种子 20260926（desert-grey.js:173）。
- 日照：`desertDay/desertDusk` 新增（env.js:23-34），git diff 确认 `day/dusk` 海图预设**逐字节未动**（diff 仅新增块）；`ocean:false` 时不建海面且 update/buildEnvMap 均有空值保护（env.js:246、305-310、340-344）；注册表 sunElev/sunAzim=55/115 与 preset 兜底一致（registry.js:82）。
- 三档策略如实：low=128px 且 `useNormal=false`（desert-grey-materials.js:362-363），0 点光源为 game.js:103 既有行为（`slice(0, low?0:4)`），报告与 §5.4 D 波提示如实声明，`low-bTunnelLower.png` 确认仍可辨。

**3. 地标辨识 ✓**（实看 12 张：overview、aDoor、aPit、aPlatform、aShort、midDoors、bTunnelLower、bWindow、bSite、blSpawn、grSpawn、low-bTunnelLower）
A 门半开木门+门洞、A 大坑石砌坑壁、A 平台高台+楼梯+木箱、A 小道高架直道、中门窄缝双木门、B 洞下层暖光灯池、B 窗房窗台黄漆条、B 区地面黄色喷漆方框、双出生开阔街区——轮廓/通道尺度/掩体/明暗均可辨识，与规格地标清单一一对应。§4 差异表诚实：冷蓝阴影、门洞偏宽、拉直转角、巷道偏宽全部主动承认且截图可印证。

**4. bloom 缓解 ✓**
- 注入面正确：`onBeforeCompile` 只挂可见 Sky 材质（env.js:236-242）；PMREM 环境图用**未打补丁的独立 Sky 实例**构建（env.js:319-323），环境 irradiance 不缩放，与报告声称一致；海图 skyGain 缺省 1（env.js:283）为恒等变换。替换目标字符串在 three@0.186.0 Sky.js:333 实际存在，无静默失效。
- 效果实证：`probe-baseline.png` 修复前总览近乎全白 → 修复后 `high-overview.png` 结构清晰，且 `probe-skygain.png` ≈ `probe-nobloom.png`，与“总览与低档观感一致”声称吻合。
- 根治建议（阈值提到 8-10 或把天空排除出 bloom 输入，归 render.js owner）已留档 §2/§5.2，方案合理。

**5. 性能声明纪律 ✓** — 报告全文无任何 FPS 成绩声称，§3 明确“本报告不声称任何 FPS”（截图内 HUD 帧数计数器是游戏自带显示，非报告声称）；low 档定位为“预期效果”并预先警示 D 波勿按中高档反馈，`low-*.png` 标注诚实。

**6. 越界检查 ✓（附说明）** — lane 3 可归属改动恰为授权集：desert-grey-materials.js、desert-grey.js（均新增）、env.js（+67/-16，全部在授权范围）、textures.js（**恰好一行** `T.quality = quality`，diff 核实）、artifacts/*。guns.js 还原链闭合：`.ultra/dispatch/guns.js.lane3-backup`（02:34）存在，备份 vs HEAD 仅差炸弹波 c4 块、**无 shim 残留**；当前 guns.js vs 备份仅差正式修复的 `export const builders` + `flash`/`smoke` builder（guns-builders-fix.md）。说明：分支上其余修改文件（bots/player/physics 等）属其他 lane 的在途工作，单分支未提交态下无法用 git 逐 lane 切割，但与本波报告互不重叠、时间线交叉一致。

## 缺陷列表

| 级别 | 位置 | 描述 |
|---|---|---|
| P3 | desert-grey-materials.js:219-227 vs 报告 §2 | 报告称 wood“磨光磨损斑（粗糙度局部下降）”，实际磨损斑只画了 albedo 径向渐变，`rough[]` 未修改——报告对材质功能有轻微夸大。二选一：修报告措辞，或补 2 行在磨损处降低 rough |
| P3 | hud.js（跨 lane，非本波文件） | HUD 雷达启动瞬态：三档总览及全部 probe 截图（每会话首拍）小地图显示**运输船**船形雷达+“运输船”标签，而后续地面视角截图已是“沙漠灰·潜伏者出生点”——沙漠灰开局首拍雷达/标签未切换。瞬态、纯视觉、e2e 未覆盖，建议路由 D 波/HUD owner 排查重建时机 |
| P3 | 报告 §7 表述 | 报告称 e2e JSON“本次运行重新生成”，但现存 JSON（03:36）实为 guns 修复 lane 复验所生成（晚于本报告定稿）。证据反而更新鲜、结论不变，仅表述不精确 |

无 P1/P2。

## 非阻塞建议

1. **总览观感**：修复 bloom 后总览仍整体偏白——雾色 0xc7bba2 在大俯视角占满画面所致，属真实沙尘氛围而非缺陷；E 波可试验 overview 机位下略降 fogDensity 或微调曝光。
2. **skyGain 回调提醒**已由报告 §5.2 自带（bloom 根治后 0.25→~0.5），无需重复。
3. **后续审核方法建议**：本波 e2e JSON 被后续 lane 覆盖重写，若各 lane 能把结果 JSON 按阶段归档（如 `e2e-desert-results.phase4.json`），证据归属会更清晰。