请立即实现性能 B 路（特效与渲染临时分配）。工作树 `/Users/sen/.codex/worktrees/perf-effects/claude-opus-5-5-demo`。
共同约束：`/Users/sen/workspace/AI/claude-opus-5-5-demo/.ultra/dispatch/performance-20260929/common.md`。

唯一归属：cf-transport-ship/src/effects.js；src/game.js 仅 renderFrame 中 sunDir/camera 四元数临时对象；tests/unit/perf-effects.test.mjs；.ultra/reports/performance-20260929-effects.md。其他 game.js 逻辑不可改，不降画质。

Effects.update 当前每帧 new Matrix4/Quaternion/Vector3，tracer循环 clone camPos、new up/nrm/basis，并用 filter 替换数组；检查粒子循环类似分配，改实例自有 scratch 与顺序稳定原位紧缩，保持 matrix/count/透明度及材质更新语义。事件发生时创建持久状态可保留，无需把全项目对象池化。renderFrame 环境太阳方向变换使用复用临时对象，但不能修改 env.sunDir 或相机四元数，不得将临时对象引用泄露给持久消费者。

必须核查 tracer 寿命：head=min(len,t*380)、tail=max(0,head-7)、tail>=len 的清理条件似乎对常见长度不可达；用真实测试确认，若属实按移动弹迹的预期完全退出，短/长射线都正确，并避免为零长度生成 NaN。修复生命周期不等于减少合法特效数。

最低测试：足够时间后示踪线数量归零；短/长轨迹与帧跨度；存活示踪线的矩阵/方向与基线合理区间一致；多个特效实例互不污染；无效向量不产生NaN；粒子退场和计数正确。不启动GPU，使用真实Three math/受控场景 stub 实测操作数或可复现小基准，别写仅查源码字符串的测试。

报告 lane=effects，中文提交。对每帧分配减少的结论附证据；FPS留给集成实测。
