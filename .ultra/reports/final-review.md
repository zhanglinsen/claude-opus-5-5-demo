# 最终交付审核 — 沙漠灰多地图（cf-transport-ship）

**审核员**：GLM-5.3-Flash MAX（全新上下文只读，会话 bf373245-dd3c-46aa-9467-745cbd9a0d78，事件 `.ultra/dispatch/logs/final-review.jsonl`，提示 `final-review-prompt.md`）

全部核验完成，证据链闭合。以下为最终交付审核报告。

---

# 最终交付审核报告 — 沙漠灰多地图（cf-transport-ship）

**结论：APPROVE（批准交付）**

审核方式：全新上下文只读抽查 + 实测复跑（`node --test`、`node scripts/accept-restart-check.mjs`、git 只读命令、产物 JSON/时间戳核对、dist 内容二进制级检查）。未编辑任何文件、未使用子代理。

---

## 一、验收项逐条判定（规格 #verification）

| # | 验收项 | 判定 | 证据（实测/产物） |
|---|---|---|---|
| 1 | 固定种子 ≥20 爆破回合 | ✅ | `accept-bomb-seeded.json`：24 回合 / 3 场，五类结局齐全（timeout 18 / defused 2 / grWiped 2 / blWiped 1 / exploded 1），0 页面异常 0 控制台错误、无卡死 |
| 2 | ≥600s 真实渲染 | ✅ | `accept-longrun.json`：模拟 600.4s / 墙钟 600s（1:1），有头真窗口、真实 rAF median 60fps，heap 斜率 +0.79MB/min，0 异常 |
| 3 | 连续重开 10 次资源趋稳 | ✅（修复后闭环） | 验收轮如实暴露纹理 +15/次泄漏 → 修复后 `accept-restart-check.json` pass（98±2、drift +1）；**本人独立复跑脚本：pass=true，textures 97–100 平坦、drift +0.3、0 异常** |
| 4 | 双图 × 双工作流离线自包含 | ✅ | `accept-workflows.json` 12/12 项全 true：双图 × HTTP/file 8 项每页恰好 1 请求（页面本体）、external=[]；file:// 侧全为 file:/data: 协议 |
| 5 | 手机横屏 | ✅ | 同产物内 844×390 landscape 4 项：10 个虚拟按钮齐全、开火按钮实调（stats.shots 0→3）、跳跃实调离地、0 异常 |
| 6 | 真机 GPU 1080p 中画质 | ✅ | `accept-gpu.json`（headed=true）：渲染器 ANGLE Metal **AMD Radeon Pro 5500M**；沙漠灰 median 60 / P5 57，运输船 median 60 / P5 59，低帧占比 0；45fps 更正有本轮干净复测数据支撑（详见§三.4） |
| 7 | Profile 浏览器链路 | ✅ | `accept-profile.json` 8/8：全新档案、TDM 完赛恰好一次 +25 XP、进度 8%、跨刷新持久、损坏归一化、预设切换→出生雷包首位=flash、**练习局零发分**、0 异常 |
| 8 | 交付物离线单文件 | ✅ | `dist/index.html` 970,922 B（09:15）**晚于最后 src 改动 game.js（09:07）**；bundle 含 `boneTexture`×18（确认最新修复已入包）；外部引用仅 4 个 `<a href>`（GitHub/X 导航链接，非资源加载，不影响离线）；菜单键位区经大写 `\uXXXX` 转义形式核实存在（`开火`×4、17 个 `<kbd>` 块） |

单元测试实测：**`node --test tests/unit/*.test.mjs` → 223/223 pass、0 fail**（duration 858ms）。e2e 产物实测数字：`e2e-results` 21/21（09:20）、`e2e-bomb` 36/36（09:16）、`e2e-desert` 34/34（09:21）、`e2e-wiring` 16/16（09:17）、`e2e-hud` 19/19（06:20）——全部与报告声称一致。

## 二、最新两处产品改动复核

1. **`disposeActorGpu`（src/game.js:37-40）**：代码正确——带 `isTexture` 守卫释放 `skeleton.boneTexture`，接入 startMatch（game.js:309）与 quitToMenu（game.js:455）两处清理循环；tags 名牌 `material.map?.dispose()` + `material.dispose()` 同样两处齐备（game.js:314-315、459-460），注释如实标注根因与来源。
2. **实测验证**：本人重新执行 `node scripts/accept-restart-check.mjs`（headless、10 次同页重开 × 2.5s 沉降）：**textures [98,99,100,100,98,99,97,99,99,100]、growthSteps=0、drift +0.3、pageErrors=0、pass=true**。修复有效且稳定。
3. **README 操作说明**：章节齐备（基础操作/模式与地图/军衔与装备/触屏），与 HTML 菜单键位区（src/hud.js:663-670）逐条语义一致，README 为超集（补充 B 时机、4 号投掷物轮换、蹲跳等细节）。抽查中一度怀疑 dist 缺失键位区，经查为我方搜索方法缺陷（esbuild ASCII 大写十六进制转义），dist 内容完整——此处如实记录，不构成发现。

## 三、诚实性抽检（3 项 + 附加）

1. **bomb id 0 修复**（bomb-zero-id-fix.md）：报告声称的三处守卫逐一在代码现场确认（src/modes/bomb.js:78 `bl[0] ?? null`、103 `a.id == null`、112 `carrierId == null`），且附红/绿测试证据。✅ 一致
2. **bots 只带 HE**：src/game.js:196 `if (!a.isPlayer) return ['he'];`，与 223 条单测中“出生雷包：bots 只带 HE”及各报告声称一致；玩家雷包走档案补齐（game.js:197-200）。✅ 一致
3. **early-ai-fix**：objective-planner.js:50 `roundAssign` 稳定身份分配、112 `siteOfC4`、120/145 planted 分支不再要求坐标、“dropped 无坐标不臆造”均在代码确认；报告含先红后绿记录。✅ 一致
4. **45→60fps 更正**：`accept-gpu.json`（09:14 重测，headed，AMD 5500M）两图均 median 60 / P5 57/59 / 低帧 0%，min=0 暖机样本如实标注；删减法探针脚本 `accept-gpu-probe.mjs`（09:09）留档。更正有真实数据支撑；“测量污染”成因（与种子模拟并发执行）无法事后独立复现，但已按复测数据更正结论，方向诚实。
5. **局限披露到位**：种子只固定规划层、出生/射击/投掷仍有 `Math.random`（acceptance §1 明示）；GPU 实测 AMD 而非提示假设的 Intel（已更正）；headless rAF 节流方法学风险（§2 明示，长跑改有头采集）。均未见夸大。

## 四、未交付项 / 已接受残余清单

| 项 | 位置 | 评估 |
|---|---|---|
| displayMode URL 边缘 | hud.js:97-102/275 vs game.js:293-302 | 手输非法 `?mode=` 时菜单高亮与实际开局不一致，无玩法影响。已记录为接受残余，不影响交付 |
| 静默期 endMatch 历史行为 | src/game.js:879 | TDM 达标后 `setTimeout(endMatch,1200)` 只判 `playing` 不判 `paused`：这 1.2s 窗口内暂停，对局仍按墙钟结束。**基线既有行为**，非本轮引入，量级边缘。已记录 |
| 未 dispose 卫生项（P3） | character.js:202 每士兵 MeshStandardMaterial；烟雾球/C4 标记/练习靶几何材质 | 均已脱离场景、无强引用、GC 可回收，KB 级；本轮实测 textures 平坦佐证无留存型泄漏。geometries 151→154 的非单调抖动与 GC 延迟一致，非泄漏形态。可留后续 hygiene 波 |
| 种子可复现性边界 | accept-bomb-seeded 方法说明 | `objectiveSeed` 只保证规划层可复现；不宣称逐位可复现。披露与实现一致 |
| e2e-hud 产物偏旧（06:20） | artifacts | 早于最后两轮 game.js 改动，但该改动仅 dispose 路径，不触及 HUD/blind/award 断言面；且 e2e.mjs（09:20）覆盖菜单/重开/file 路径。按“仅必要测试”约束可接受 |
| GPU 证据单机 | — | 单台 AMD 5500M（macOS），60fps 为 vsync 锁定下限值，余量经删减探针佐证；规格要求“报告实际设备”已满足，跨设备结论本就不可外推 |

**交付面事项（非缺陷）**：① `tasks.json` 中 task6 仍为 `pending`——本次审核即其关单依据，需协调者翻转状态；② 全部工作未提交：30 个已跟踪文件（+1932/−223）+ 42 个未跟踪路径（含 src/ai、src/combat、src/maps/desert-grey\*、src/modes/\*、src/profile、全部验收脚本与产物）——提交属交付步骤，由协调者/用户执行。

## 五、交付建议

1. **批准交付**：规格 #verification 八项全部有真实、可复跑的证据支撑；两处收口改动经我独立复跑验证；诚实性抽检未发现任何虚报——发现问题时均如实降级（纹理泄漏如实判 fail、45fps 如实记录、GPU 型号如实更正），修复后证据链完整。
2. 关单动作建议按序：翻转 task6 → `git add` 全部产品/测试/脚本/报告文件并提交（含未跟踪新模块，注意 dist 是否纳入版本管理按仓库惯例）→ 提交后可在干净工作树复跑一次 `node --test` + `accept-restart-check` 作提交后冒烟（代码未变，无需全套重测）。
3. P3 卫生项（按 team 缓存士兵材质、烟雾/C4/靶体 dispose）与 game.js:879 暂停期判 `paused` 一行守卫，适合作为下一个 hygiene 小波的既知清单；不构成本轮交付阻塞。