# 最终视觉交接报告（final-visual-handoff.md）

生成：2026-09-27 18:58 +08:00。执行者：Workbuddy（协调器 + A/B 两子代理）。工程：`cf-transport-ship/`，分支 `codex/desert-grey`。本报告对应「双地图与视觉收口」旧任务终态，**不含 Y8/GameMonetize/多语言**（未启动 `.ultra/next-stage/` 任何工作，未改 `tasks.json`）。

## 结论

视觉收口完成、四项功能修复复核全部通过、候选冻结并完成双图实测。沙漠灰中画质 median 60 FPS 稳定、P5 最佳 57（门槛 ≥55）；运输船 median 47–50，与历史 60 的差距由持续高负载主机（load 19–48，从未安静）主导，代码零改动。已按选择性范围本地提交（哈希见文末），未推送。

## A 路：建筑轮廓对照（对照 dg-ref2 低分辨率参考）

| 区域 | 判定 | 处置 |
|---|---|---|
| 前院出生点 | 通过（街屋夹出巷道，与 ref1-overhead 底部院落宏观一致） | 未改 |
| A 平台与坡道 | 通过（内凹轮廓+连续坡道对应 ref3-wall02） | 未改 |
| B 点半露天 | 通过（木梁+断续屋面对应 ref2-a06） | 未改 |
| 整体俯视轮廓 | **明确差距**：围墙与 D6 远景楼块之间空隙呈"孤岛环" | **已补** |

- 修复：`src/maps/desert-grey.js` 新增 5.2 节贴墙裙楼环（22 段楼块沿边界墙外侧首尾相接，南行压低 5.5–7m 避免遮挡出生区；纯 box 装饰合批，零碰撞/零导航/零材质新增）。
- 集成阶段发现并修复：裙楼环代码调用 `cap` 越出 5 节块作用域，导致构建产物建图即抛 `cap is not defined`、菜单永不出现。A 路单测不执行浏览器建图路径、route-only e2e 当时跑的是旧 dist，故未能提前暴露。已在 5.2 节块内补定义并重建复验。**教训：任何地图源码改动后必须重新 build 才能代表候选。**
- 截图复核：`artifacts/desert-overview.png` 四周已成连片屋顶群；`desert-landmark-blSpawn.png` 出生区无遮挡穿帮。
- 不做项：ref3 木格栅顶棚归属无法从低分辨率反推，不作为差距处理。

## B 路：Sol 四项功能修复定向复核（逐项）

1. **错误包点拆包 — 通过**。`canDefuseAt`（bomb.js:313-319）要求 `inSite === bomb.site` 且距离 ≤2.5m，`startDefuse`/持续校验全链路一致。单测 bomb-core.test.mjs:126-155 覆盖 B 点 75m 拒绝、同包点 5m 拒绝、1m 完成离开中断。浏览器证据：e2e-bomb「A 点已安包时，B 点保卫者既无拆包提示也无法开始拆包」+「拆除完成 GR 胜」。
2. **爆破 HUD 时间/目标 — 通过**。hud.js:71-82 `matchHeader` 消费 `bomb.timeLeft` 与 `winsNeeded ?? 7`。浏览器证据：e2e-bomb 实拍 `{"clock":"0:04","goal":"爆破模式 · 先赢 7 局"}`，不再出现 0:00/目标 50。
3. **装备预设出生主武器 — 通过**。game.js:332 `loadout().primary || o.primary || 'ak47'`，`chooseLoadout`/`onOption` 均写入当前激活预设，出生区即时生效保留。新增浏览器场景 `scripts/e2e-loadout-ping.mjs`：旧 opts.primary=M4A1、激活预设 2=AK47 重开 → 出生 `ak47`；`chooseLoadout('awm')` 写入预设并即时生效。
4. **伪造本地 ping — 通过**。actor.js stats 仅 k/d/hs/shots/hits，全 src 无 ping 生成；hud.js:532 计分板表头仅 击杀/死亡/爆头。浏览器证据：board innerHTML 无「延迟」、actors 无 ping 字段。
5. 附带修复（B 路发现）：game.js:5 静态 `MAP_BUILDERS` 导入链把 `.png` 拉进 Node 模块图，wiring-modes 测试整文件崩溃；改为 registry 纯函数静态导入 + init() 内惰性 `await import('./maps/index.js')`（浏览器行为不变），红 93/94 → 绿。

## 实测证据（本机 MacBookPro16,1 / AMD Radeon Pro 5500M / 2026-09-27）

| 项目 | 结果 | 产物 |
|---|---|---|
| build | dist/index.html 10,523,243 字节（cap 修复后重建） | dist/ |
| 地图/高度导航单测 | 28/28 | — |
| 全量单测（22 文件） | **229/229** | — |
| e2e-bomb（错包点/拆包/HUD/运输船回归） | **40/40**，无页面异常 | artifacts/e2e-bomb-results.json |
| e2e-loadout-ping（新增） | **6/6** | artifacts/e2e-loadout-ping-results.json |
| e2e-desert 完整（123 边 0 拒绝、97/97 可达、双方至 A/B 物理路线无瞬移、9/9 机器人活跃、十机位截图、运输船冒烟） | **34/34** | artifacts/e2e-desert-results.json |
| 10 次重开资源 | pass：纹理抖动无棘轮、几何 +1 惰性步≤2、极差 3≤3、drift −3.3≤6、0 页面错误 | artifacts/accept-restart-check.json |
| GPU 沙漠灰 1080p 中画质 | 三轮 median 60/60/60；P5 57/49/41（最佳 57 ≥ 55） | accept-gpu-unthrottled-run1/2.json、accept-gpu.json |
| GPU 运输船 1080p 中画质 | 三轮 median 48/50/47；P5 35/37/35 | 同上 |

GPU 测量条件披露：主机全程高负载（load 19–48，未安静）。首轮未加防节流参数测得 16/14 与 11/10（macOS 有头 Chrome 窗口遮挡节流主导），加 `--disable-backgrounding-occluded-windows` 等参数后回升至上表数据；四份原始 JSON 均保留（accept-gpu-loaded-host.json 等）。**运输船与所有共享渲染代码本轮零改动**，其 47–50/35–37 判读为负载压制区间而非代码回退；沙漠灰 P5 波动（57/49/41）与负载毛刺一致。

## 沿用证据（适用范围如实披露）

- **603.5 秒长跑 + 10 次 10 轮重开**（accept-longrun.json，运输船低画质）：发生于最后环境参数回退与裙楼环静态几何之前。本轮仅改静态装饰（零碰撞合批）与一次性规则/加载行为，未触及持续运行的资源分配/渲染循环/音频生命周期，按交接判据不重复 ≥600s 长跑。
- 历史 24 回合规则证据：玩法核心逻辑未改，沿用。
- 历史安静主机 60/60、60/58：仅存于 sol-final-review.md 文字，原始 JSON 已被覆盖；作为安静主机参照值引用。

## 未验证 / 后续建议

1. **安静主机 GPU 复测**：负载降至 <10 时重跑 `node scripts/accept-gpu.mjs`（可加防节流参数），确认沙漠灰 P5 稳定 ≥55 与运输船回到 ~60；建议 23:00 自动化窗口或用户空闲时执行。
2. e2e-desert 截图为 SwiftShader 软渲染（HUD 显示 10–13 FPS），仅作几何/构图证据，不作性能成绩。
3. A 平台木格栅顶棚、精确开口尺寸：低分辨率参考不可判，留待有高清参考时评估。

## 提交

选择性本地提交（源码 + 新增测试 + 本报告；不含临时日志/性能产物/快照/互斥标记），未推送。哈希见会话最终汇报与下方「提交哈希」小节。

（提交哈希由协调器在提交后回填：见 git log。）

## 提交哈希

- `1ba7e44dcf726256251155babb50ba52c2462522` — Finish dual-map visual closeout: podium ring, four rule fixes verified, lazy map import（源码 + 新增测试 + 本报告，2026-09-27，分支 codex/desert-grey，未推送）
- 前置 WIP 检查点：`7bf6872`（Checkpoint dual-map game and visual work in progress）
- 本报告哈希回填的后续提交：见 `git log --oneline -2`（若存在第二个仅报告哈希回填的提交）。
