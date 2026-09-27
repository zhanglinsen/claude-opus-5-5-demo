# 最终交付交接（final handoff）— 2026-09-27

## 结论

沙漠灰双地图游戏（在 `cf-transport-ship/` 内扩展，同一 HTML 支持运输船 + 沙漠灰）**全部六个阶段完成并通过独立 GLM MAX 最终交付审核（APPROVE，`.ultra/reports/final-review.md`）**。规格 `.ultra/specs/desert-grey.md` 的验收项八项全部有真实、可复跑证据。`.ultra/tasks/tasks.json` 中 task 1–7 全部 completed（task 6 由最终审核关单）。

## 交付物

| 交付物 | 位置 |
|---|---|
| 离线单文件 HTML（约 948KB，零运行时外部请求） | `cf-transport-ship/dist/index.html` |
| 本地访问 | HTTP：`http://127.0.0.1:8080`（`npm run serve` 或 `node scripts/serve.mjs`）；或直接双击 `dist/index.html`（file:// 已验证） |
| 源码 | `cf-transport-ship/src/`（未提交，见「待用户动作」） |
| 操作说明 | `cf-transport-ship/README.md`「操作说明」章节 + HTML 菜单内键位区 |
| 测试 | 223/223 单测（`npm test`）；e2e：bomb 36 / desert 34 / wiring 16 / hud 19 / general 21（`node scripts/e2e-*.mjs`）；验收脚本 `scripts/accept-*.mjs` ×7 |
| 证据产物 | `cf-transport-ship/artifacts/`（accept-*.json、e2e-*-results.json、dg-vis/ 90+ 张三档与真机 GPU 截图、bomb-*.png） |
| 全部阶段报告与审核记录 | `.ultra/reports/`（phase-1…phase-6 实现/审核/复核报告、验收、最终审核）；事件日志 `.ultra/dispatch/logs/` |

## 验收摘要（证据见 `.ultra/reports/final-review.md` 判定表）

1. **固定种子爆破**：24 回合 3 场，五类结局齐全，0 异常（种子固定规划层；出生/射击/投掷仍含 Math.random，已如实披露）。
2. **≥600s 真实渲染长跑**：600s @ 真实 60fps（有头真窗口；headless rAF 会被节流至 ~1fps，方法学已披露），heap 斜率 +0.79MB/min，0 异常。
3. **10 次连续重开**：修复骨骼 boneTexture/名牌纹理泄漏后 textures 98±2 平坦（drift +1），几何/网格恒定；最终审核员独立复跑 pass。
4. **双地图 × HTTP/file**：8/8，每页恰 1 请求（页面本体），0 外部请求。
5. **手机横屏**：844×390 landscape，10 个触屏按钮、真实开火/跳跃派发，0 异常。
6. **真机 GPU 1080p 中画质**：AMD Radeon Pro 5500M（实测；更正了早前 Intel UHD 630 的误判），沙漠灰 median 60/P5 57、运输船 median 60/P5 59——双双达标。验收初轮运输船 45fps 为与种子模拟并发导致的测量污染，干净复测更正（删减法探针证明余量充足）。
7. **Profile 浏览器链路** 8/8：新档→完赛恰一次 +25XP→进度更新→跨刷新持久→损坏恢复→预设切换出生雷种生效→练习零发分。
8. **离线交付**：单文件、键位说明齐备。

## 功能范围（均经独立审核）

- **双地图**：运输船（TDM/练习）+ 沙漠灰（爆破 5v5 先赢 7/TDM/练习，白模→材质/日照三档画质，97/97 导航可达，8 条真实寻路腿，e2e-desert 34 项含碰撞 0 拒绝边）。
- **爆破规则**：完整 C4 生命周期（携带/丢弃/死亡掉落/拾取/安放/拆除/引爆）、先赢 7、安包后 BL 全灭不结束、临界同帧爆炸优先、暂停冻结、统一复活、死亡观战不泄露敌方；玩家数字 id0 的 falsy 缺陷经浏览器探针复现后 TDD 修复。
- **目标 AI**：分路/携包安放/拾包/守包/回防拆包、12s 情报过期、遇阻重寻路、无全知（敌情只经可见/受击/听声三通道）、烟雾挡 AI 视线、闪光致盲；bots 雷包收窄 ['he']（协调者决策，避免自闪/自烟漂移）。
- **战斗/投掷物**：HE/闪光/烟雾三型 4 号轮换；投掷物运动核心与现役手感逐位等价（独立探针 max Δ 8.9e-16）；专用起爆音效。
- **HUD/输入/触屏**：目标 HUD（回合/比分/C4 状态/安拆进度/观战）、闪光白屏、练习面板、军衔/预设菜单、模式分段选择（URL ?mode= 优先）、C4/E/G 触屏按钮、爆破输入状态机。
- **军衔与装备（本地）**：`cf_profile_v1` 版本化存档与 `cf_opts_v2` 隔离、legacy 主武器迁移、XP 白名单（tdm/bomb）+ 事件级一次发放 + 防刷（连点 E 刷分通道被审核发现后以完成事件记账封死）、练习不计分、十级军衔阈值、三套预设 + 槽位编辑透传、存储降级 memory 并如实提示。
- **架构**：纯规则域（bomb/practice/grenade/projectile/profile）无 DOM/Three/存储；应用服务/适配器注入；Game/HUD 为表现适配层；SOLID/TDD（红→绿为主，个别切片诚实标注偏差）。

## 已接受残余（不阻塞交付，见 final-review.md §四）

1. 手输非法 `?mode=` 时菜单高亮与实际开局不一致（displayMode 与 startMatch 解析序差异）。
2. TDM 达标后 1.2s 结算窗口内暂停，对局仍按墙钟结束（基线既有行为，game.js:879 一行守卫可修）。
3. P3 dispose 卫生项（每士兵 MeshStandardMaterial、烟雾/C4/靶体几何材质——均无强引用、GC 可回收）。
4. 种子仅固定 AI 规划层，非逐位可复现。
5. e2e-hud 产物早于最后两轮 dispose 改动（改动不触及 HUD 断言面，e2e.mjs 覆盖相关路径）。
6. GPU 证据为单机（vsync 锁定下限，跨设备不可外推）。

## 待用户动作

1. **提交**：全部工作在工作树未提交（依协调者授权书「不要提交、推送」的约束，GLM 未执行 git commit/push）。建议：审阅后 `git add` 全部产品/测试/脚本/报告文件并按仓库惯例决定 dist 是否入库；30 个已跟踪文件（+1932/−223）+ 42 个未跟踪路径。提交后可复跑 `npm test` + `node scripts/accept-restart-check.mjs` 作提交后冒烟（代码未变，无需全套重测）。
2. hygiene 小波候选清单：上述残余 1/2/3。

## 流程记录

- 全部实现/修复由 GLM-5.3-Flash HIGH（CLI，`zcode-kit run claude-code`，文件独占 + ≤3 并发槽）执行；全部独立审核/复核由全新上下文 GLM-5.3-Flash MAX（plan 模式只读）执行；无 Codex Sol、无子代理、无网络发布。每个子任务有持久提示、事件 JSONL、stderr、报告；所有审核发现均回原 lane 修复并经新 MAX 复核关闭。协调器会话 ebe9bec6-37aa-4db8-b716-d8858230e8c0，进度全程记录于 `.ultra/reports/execution-state.md`。
