你是 GLM-5.3-Flash HIGH 实现者，处理与第二阶段只读审核完全独立的本地档案完整性小切片。CLI 工作，不调用子代理或其它模型。只编辑 `cf-transport-ship/src/profile/service.js`、`cf-transport-ship/tests/unit/profile-core.test.mjs`、新报告 `.ultra/reports/profile-integrity-fix.md`。其他 Game/map/AI/模式文件不可编辑，不跑全量构建/浏览器，不提交。先看 `.ultra/reports/profile-architecture.md`、`early-cores-review.md` 和 `profile-result-fix.md`。

目标只有两项有实际持久化影响的缺陷：
1. `service.profile` getter 当前暴露 live object；调用者可改 `stats`/`ledger`/`presets` 而绕过 service 保存与去重。返回安全只读快照或深层不可变对象，保证外部修改不能改变服务内存状态，也不会让已保存数据与内存分叉。保持现有公开调用与性能合理。
2. 未注入 storage 时 `persistence` 错报 `persisted`；本地存储写失败应显示 `memory`，后续写成功若可恢复则反映真实状态。不要把内存模式说成已落盘。现有 repository 安全读写与 legacy primary 行为保持。

每项先追加一条公开 API 行为测试并实际执行看到 RED，再最小修复、GREEN，绿态必要重构。只跑 `node --test tests/unit/profile-core.test.mjs`。测试期望来自用户本地保存契约，而不是内部 helper。报告红绿证据和接口影响。请勿顺手扩散其它 P3 事项。
