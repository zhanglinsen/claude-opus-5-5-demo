你是 GLM-5.3-Flash MAX，独立只读审核员，全新上下文。禁止编辑文件、禁止子代理；只允许 Read/Glob/Grep 与只读 Bash（node --test、node --input-type=module、git diff/status）。工作目录 `/Users/sen/workspace/AI/claude-opus-5-5-demo/cf-transport-ship`。

审核域：E 波**双地图静态审查与资源泄漏排查**（只读；规格 `.ultra/specs/desert-grey.md`；最终候选版将在你审核结论后冻结并跑最终验收）。

排查范围：`src/` 全部（重点 game.js、render.js、env.js、hud.js、player.js、bots.js、actor.js、audio.js、maps/、combat/、modes/、profile/、navigation.js、physics.js）。

排查清单（逐项给证据）：
1. **资源泄漏**：dispose 缺失（geometry/material/texture/audio 节点/事件监听器/RAF/定时器）；重复开局/重开 10 次会累积什么（mesh/scene 子树/texture/DM）；Three.js 对象复用情况；`startMatch`/`endBombSession`/`destroy` 清理链是否完整。
2. **双地图切换**：切图路径的资源释放（旧地图几何/贴图/环境图/灯具/导航网格）；URL ?map= 与菜单切图两路径一致吗。
3. **跨模块一致性**：无重复规则逻辑（HUD/输入不内嵌判定）、无全局定位器、无隐藏 wall-clock 进入规则层（表现层 realTime 允许）。
4. **配置/设置**：settings 迁移路径、profile 键隔离、损坏输入归一化的实际覆盖。
5. **死代码/孤儿导出**（仅列清单，不要求修）。
6. 运行 `node --test tests/unit/*.test.mjs`（glob）报告真实数字；可写只读探针脚本到 /tmp 之外的工作区吗——不可以（只读），用 node --input-type=module 内存探针验证可疑泄漏路径（构造/销毁循环 10 次计数对象）。

输出：最终消息返回完整报告（不要写文件）：结论（APPROVE / REQUEST_CHANGES，以 P1/P2 存在与否为准）→ 逐项证据 → 缺陷列表（P1/P2/P3，文件:行号）→ 非阻塞清单（死代码等）。若发现 P1/P2 将冻结最终验收并路由修复。
