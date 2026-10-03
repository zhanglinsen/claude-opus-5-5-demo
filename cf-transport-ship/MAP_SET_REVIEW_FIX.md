# 地图集检查定向修复证据

2026-10-03，仅在 `/private/tmp/cf-map-set-current-review` 当前源码快照修改，未 Git 提交，未替换现有地图注册表/构建器/主控/浏览器脚本。

修复：规范参数 `--map-set=classic|original`，兼容此前给出的 `--maps=classic|original`；非法值、缺值、重复和两种参数混用在写文件前失败。configured manifest 与包内 README 明确允许平台试用上传：`trialUploadAllowed:true`、`releaseVerificationPending:true`，保留 `adsVerified:false` / `platformReview:"pending"`。删除宽泛禁止公开提交措辞及经典数据剔除硬门槛，说明正式发布验证仍待完成、包体仍有共享资源冗余。

TDD 证据：

- CLI RED：旧代码 `--map-set=classic --map-set=original` 返回 0；`--maps=original` HTML 标记仍为 classic。两项测试 0/2；不是 fixture 错误。
- CLI GREEN：12 组非法/重复/混用参数失败且 canary 内容和输出目录保持不变；5 组默认/canonical/alias 选择实际 HTML 地图集正确，2/2。
- configured RED：先生成现有 all 与 configured 产物，更新实际 ZIP 测试，`trialUploadAllowed` 为 undefined 而非 true，8/9。
- 最终 GREEN：`node --test tests/unit/map-set-cli.test.mjs tests/unit/configured-build.test.mjs`，12/12。新增第 3 个 CLI 测试在隔离临时目录实际构建 canonical/alias configured original，两平台 ZIP 的试用状态与审核/广告 pending 正确。
- temp 根 dist 最终 all/configured 保持 classic；CLI 测试的原版产物位于各自临时目录并自动清理。

更改文件：`build.mjs`、`README.md`、`tests/unit/configured-build.test.mjs`、新增 `tests/unit/map-set-cli.test.mjs`、本记录。

未运行浏览器/GPU。真实平台审核/广告未由本修复验证；浏览器独立验收由主任务负责。
