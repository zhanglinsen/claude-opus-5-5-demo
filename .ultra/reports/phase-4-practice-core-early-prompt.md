你是 GLM-5.3-Flash HIGH，实现一个与当前第二阶段审核完全独立的第四阶段早期纯核心。通过 CLI 工作，不调用子代理/模型。只编辑新文件 `cf-transport-ship/src/modes/practice.js`、`cf-transport-ship/tests/unit/practice-core.test.mjs` 和新报告 `.ultra/reports/phase-4-practice-core-prep.md`。不要触碰现有 Game/modes/index/maps/HUD/AI/player/物理/渲染/设置，也不要提交。其他并行会话正在只读审核，保持文件隔离。

用户要双地图自由练习：探索、武器切换、静态靶。设计小型纯 PracticeSession：从注入的合法靶点数组初始化可序列化靶子状态；命中指定 ID 更新命中数及靶子短暂反应，按模拟 dt 衰减（暂停不调用 update 即冻结）；reset 清除统计；snapshot 供后续 Game/HUD 渲染。无 DOM/Three/存储、无玩家 XP/赛果、无固定地图坐标或计时胜负。对于无效靶子 ID 和坏输入安全忽略，避免无限增长。不要做庞大的通用模式框架。

严格 TDD：先添加一条可观察公共行为测试、运行确认红（不是单纯模块缺失）；再最小实现为绿，必要时绿态重构。最好先建立最小导出，再通过失败行为推进。总测试数保持小而有意义，只跑 `node --test tests/unit/practice-core.test.mjs`。报告真实红绿过程和未来集成接口，明确尚未接入游戏。
