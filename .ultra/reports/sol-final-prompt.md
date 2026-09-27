你是新的 GPT-6 Sol xhigh、只读、独立终验上下文。工程位于 `/Users/sen/workspace/AI/claude-opus-5-5-demo/cf-transport-ship`。用户要求一个可离线打开的双地图 3D 枪战游戏，沙漠灰默认 5v5 AI 爆破，运输船原 TDM 玩法不退化；画质/性能兼顾。本轮只审查冻结候选，不改文件、不调用子代理、不提交。

请独立审查代码、当前 diff、真实截图与原始验证产物（不要照单接受实施报告）。入口：`.ultra/specs/desert-grey.md`、`.ultra/reports/visual-quality-in-progress.md`、`.ultra/reports/flagship-c4.md`、`.ultra/reports/visual-close-orchestrator.md`、`cf-transport-ship/artifacts`。原计划的全新 GLM 旗舰只读预审因额度耗尽未执行；最后两处 env 参数回退由编排侧完成，尚无独立确认，请特别核查。特别核查：
- 玩家 0 号 C4 的携带/掉落/拾取/安放与浏览器输入闭环；爆破临界状态仅结算一次，切图/模式不残留，运输船 TDM 与沙漠灰路线不回退。
- 分层与组件边界、SOLID/关注点分离、关键新规则的测试先行证据；聚焦可复现 P1/P2 缺陷。
- 目视两张地图的实际 1080p 截图及关键点图，判断沙漠灰与运输船制作完成度接近程度，诚实指出无法达到原版级复刻的差距。
- 实测 AMD Radeon Pro 5500M、1080p 中画质 Desert P5≥55 FPS、Ship 无实质回退；10 次重开和 ≥600s 真实渲染无持续资源增长/异常。判断已有证据对当前代码是否仍有效；仅为具体风险运行必要聚焦检查，不重跑无关长测。
- `dist/index.html` 为离线单文件，可 HTTP 与 file 打开，记录真实 UTF-8 字节数；本地资料/截图路径可交付。

报告首行写 `APPROVE` 或 `REQUEST_CHANGES`。发现必须修复的缺陷请按 P1/P2 列具体文件行号、复现证据、影响和最小修复方向；不要以没有证据的理论风险阻塞。说明未亲自验证的项目和视觉/性能结论的范围。最终报告写入 CLI `-o` 指定路径即可。
