请立即实现性能 A 路（HUD）。工作树 `/Users/sen/.codex/worktrees/perf-hud/claude-opus-5-5-demo`。
先读同目录主工程 dispatch/performance-20260929/common.md（完整路径 `/Users/sen/workspace/AI/claude-opus-5-5-demo/.ultra/dispatch/performance-20260929/common.md`）。

唯一归属：cf-transport-ship/src/hud.js；必要时独立新 ui helper；tests/unit/perf-hud.test.mjs；.ultra/reports/performance-20260929-hud.md。不改 game.js、词典、样式、构建或现有雷达算法。

已定位 HUD.update 每帧重新写比分、生命/护甲、弹药、时钟/目标、武器/名字等，并重复翻译/组合相同文案；updateNadeInfo 先构造整段字符串才比对。请确认真实调用链，将不变 DOM 写入和高频无效派生计算去掉。不要全局降低 HUD 频率：瞄准/受伤/闪光/进度动画保持每帧，数值变化当帧可见；计时精度与现有 UI 一致。

重点：locale 切换、重开、模式改变、元素被别的现有路径改写、settings/hud 实例销毁都需正确失效。用小而稳定的受控状态比较，避免 JSON.stringify 整个游戏状态。审查 HUD 内其他函数也写同一 DOM 的风险，保证缓存与直接写入一致。

最低测试：稳定状态重复更新时 DOM 写操作计数减少；单独改变 hp/ammo/score/计时显示单位及时更新；相同数值但 locale 改变时文案更新；新局/模式切换不残留。沿用 hud-radar/hud-i18n/hud-modes 中受影响项即可，不跑无关全套。

报告 lane=hud，提交中文。若文案构造优化风险大，先交可靠的重复 DOM 写入优化，不展开菜单重写。
