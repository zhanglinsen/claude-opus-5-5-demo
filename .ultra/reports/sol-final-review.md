REQUEST_CHANGES

### 必须修复

- **P1｜可在错误包点拆除 C4。** [bomb.js](/Users/sen/workspace/AI/claude-opus-5-5-demo/cf-transport-ship/src/modes/bomb.js:143) 接受任意非空 `inSite`，拆包提示和持续校验也未核对已安放的包点。用真实地图包点数据复现：C4 安在 A，保卫者站在相距 **75.1 米**的 B，`defusable=true`；按住拆包 7 秒后产生 `bombDefused`，GR 获胜。应统一校验包点 ID 与 C4 实际位置，并补错误包点及同包点远距离用例。
- **P2｜爆破主 HUD 显示错误时间和目标。** [hud.js](/Users/sen/workspace/AI/claude-opus-5-5-demo/cf-transport-ship/src/hud.js:317) 用爆破模式的 `Infinity` 对局时限计算出 `0:00`，并显示 TDM 的“目标 50”；[携包实拍](/Users/sen/workspace/AI/claude-opus-5-5-demo/cf-transport-ship/artifacts/bomb-player0-carry.png)可见。应读取爆破视图的回合剩余时间和 7 局胜利目标。
- **P2｜切换装备预设不改变出生主武器。** [game.js](/Users/sen/workspace/AI/claude-opus-5-5-demo/cf-transport-ship/src/game.js:329) 总是优先采用有值的旧 `opts.primary`。聚焦复现：旧偏好 M4A1、切到主武器为 AK47 的预设 2，适配器返回 AK47，开局表达式仍返回 M4A1。应由当前预设决定出生装备，并把菜单改枪写入当前预设，同时遵守现有生效时机。
- **P2｜本地战绩板伪造网络延迟。** [actor.js](/Users/sen/workspace/AI/claude-opus-5-5-demo/cf-transport-ship/src/actor.js:20) 为每个角色随机生成 `ping`，[hud.js](/Users/sen/workspace/AI/claude-opus-5-5-demo/cf-transport-ship/src/hud.js:509) 将其作为“延迟”显示；与规格中本地 AI 不显示伪造延迟的要求相反。移除该列或改为真实的本地状态。

### 证据与范围

- **C4 与回归：**亲自运行的 40 项聚焦单测全过，包括 id 0、死亡掉包、拾取、临界同刻单次结算及重开。检查了原始 [浏览器结果](/Users/sen/workspace/AI/claude-opus-5-5-demo/cf-transport-ship/artifacts/e2e-bomb-results.json)与携包、安放截图：G 掉包、E 拾回、5 号槽和鼠标安放闭环有记录；**本轮未亲自重跑浏览器**。运输船 TDM 隔离及沙漠灰路线有既有浏览器产物支持。现有拆包测试均在正确包点，遗漏了上述 P1。
- **性能与资源：**原始 [GPU 数据](/Users/sen/workspace/AI/claude-opus-5-5-demo/cf-transport-ship/artifacts/accept-gpu.json)为 Radeon Pro 5500M、1080p 中画质：沙漠灰 median/P5 **60/60 FPS**，运输船 **60/58 FPS**，后者无实质回退。[长跑数据](/Users/sen/workspace/AI/claude-opus-5-5-demo/cf-transport-ship/artifacts/accept-longrun.json)记录约 603.5 秒墙钟真实渲染及 10 次重开，未见持续资源增长或页面异常；该长跑场景是**运输船低画质**。这些测量早于最后环境参数回退，因此不是当前候选的直接 FPS 或长跑实测。核对发现此后产品源码仅 `env.js` 更新，回退值确为 `0.30 / 8.0 / 0.72 / (1.02,1.00,0.94)`，仅陆地图环境反射分支受影响；运输船分支未改。性能外推合理，但当前候选的精确 P5 未亲测。
- **视觉：**亲自查看两图 [1080p 沙漠灰](/Users/sen/workspace/AI/claude-opus-5-5-demo/cf-transport-ship/artifacts/accept-gpu-desert-grey.png)、[1080p 运输船](/Users/sen/workspace/AI/claude-opus-5-5-demo/cf-transport-ship/artifacts/accept-gpu-transport-ship.png)，以及最终参数对应的 [A 大](/Users/sen/workspace/AI/claude-opus-5-5-demo/cf-transport-ship/artifacts/dg-vis/p7-env4-medium-aLong.png)、[B 点](/Users/sen/workspace/AI/claude-opus-5-5-demo/cf-transport-ship/artifacts/dg-vis/p7-env4-medium-bSite.png)和洞内图。沙漠灰已可辨路线并有石纹、墙基和明暗，但大面积直墙、重复箱体及块状远景使其制作完成度明显落后于运输船，也与本地原版参考中的密集旧城立面、门洞和材质变化有明显差距。最终参数关键点图为 **1280×720 软件渲染**；两张 1080p 图拍摄于回退前，不能冒充当前候选的最终 1080p 实拍。
- **分层与测试先行：**`BombMatch`、`BombSession`、地图注册表和档案服务的边界基本清楚；`Game` 仍承担较多协调职责。部分关键规则有报告中的红→绿记录，阶段 2 及部分后续切片明确不是严格测试先行；未提交的工作树也无法独立重建完整时间顺序。本轮未把缺少历史证明单独列为阻塞项。
- **离线产物：**对当前源码作只在内存中的构建，所得字节与 [dist/index.html](/Users/sen/workspace/AI/claude-opus-5-5-demo/cf-transport-ship/dist/index.html) **完全一致**；实际 UTF-8 大小 **975,257 字节**。文件内联 JS/CSS，外部网址仅为可点击链接；既有 [HTTP 与 file 工作流记录](/Users/sen/workspace/AI/claude-opus-5-5-demo/cf-transport-ship/artifacts/accept-workflows.json)显示双图均可打开且无运行时外部请求。**本轮未亲自重开浏览器**验证当前文件。

遵守只读约束，未改文件、未提交，也未写报告文件；本消息即终验报告。