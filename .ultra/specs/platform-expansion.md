# 双地图平台扩展规格（2026-09-27 已确认）

## 启动门槛

北京时间 2026-09-27 23:00 后，且 `.ultra/reports/final-visual-handoff.md` 存在并能核对最终截图、性能和独立审核时，才启动本阶段 GLM 实施。若 `.ultra/reports/BLOCKED.md` 指向未解决的旧阶段问题，先处理旧阶段。现有 `.ultra/tasks/` 仍供旧阶段使用；启动时先核对已有可恢复快照，在旧阶段验收通过后选择性提交源码、必要测试与文档（不提交临时日志、性能产物和快照；不推送），再命名归档旧 registry/contexts，发布 `.ultra/next-stage/` 中的新任务清单。不得因历史 `.ultra/reports/final-handoff.md` 宣称视觉补充已完成。23:00 是开始时间，不是完成期限。

新增门槛：用户已要求继续提升双地图质感。`.ultra/reports/visual-fidelity-pending.md` 存在期间不得启动平台阶段；必须核对 `.ultra/reports/final-visual-fidelity-handoff.md` 的最终截图、同机性能、独立审核和本地提交。前一轮 `final-visual-handoff.md` 不能替代本轮交付。

2026-09-27 23:00 用户追加授权：与视觉任务文件互斥的**隔离模块开发**可以提前并行，包括 `src/brand/`、`src/i18n/`、平台 SDK 接口及两张原创平台图；使用独立 worktree 和单测。上述视觉门槛继续约束**主游戏/HUD/registry/build 集成、浏览器/GPU 验证、任务 registry 切换及正式交付**。执行状态与文件归属见 `.ultra/reports/platform-parallel-in-progress.md`；不得因此清除旧视觉待审标记。

## 交付约束

共用现有 `cf-transport-ship/` 的枪战、模式、等级和本地装备系统，保持 `cf_opts_v2` 与 `cf_profile_v1` 可读。离线单文件 HTML 不含运行时外部依赖；Y8 和 GameMonetize 分别构建，仅加载本平台 SDK。未配置真实平台 ID 的产物标记为 mock，不得标记为可提交。SDK 运行需 HTTP；本地 `file://` 只验离线版。原有视觉和性能证据作为基线，测试只覆盖新增或受影响行为。

<a id="US-01"></a>
## US-01 工作室品牌素材

保留用户提供的三张 175×175 PNG 原图及透明通道：中文深底、英文透明、中文透明；源文件位于 `cf-transport-ship/src/assets/studio/`。品牌组件按当前语言和使用背景选择图标，中文界面用中文，英文平台界面用英文。平台如需其他尺寸，另生成导出文件，不覆盖原图。

<a id="US-02"></a>
## US-02 中英双语

简体中文与英语覆盖菜单、HUD、设置、战报、报点、模式、武器、军衔、装备和错误提示。所有玩家可见名称通过稳定 ID 和翻译目录解析，语言切换即时更新 UI，不更改存档 ID。优先级为玩家已保存选择 > Y8 平台语言 > 浏览器语言 > 构建默认语言；平台默认英语，离线默认中文。无效或未知语言安全回退。选择沿用现有设置存储并能在不可用的 localStorage 下继续游戏。

多语言服务需以可移植插件提供：通用语言选择、翻译、订阅和存储接口与本游戏词典分离，其他游戏可传入自己的目录和存储适配器即接入；对外有稳定入口和卸载/退订机制。插件本身无 CF 专属 ID、DOM 或构建目标依赖。

<a id="US-03"></a>
## US-03 平台 SDK 与广告

PlatformAdapter 提供一次初始化、平台语言读取、自然断点广告请求和事件；离线、Y8、GameMonetize 各一实现。广告仅在整场比赛结束或返回菜单请求，不在交战期间或页面加载时强制显示。仅广告实际开始时暂停模拟和静音；结束、失败、无填充或重复回调不会改变原有用户暂停状态，也不污染已存音量。Y8 使用 `y8sdk.ready` 和 `emitReadyEvent()` 防加载竞态，以 `beforeAd`/`afterAd` 控制游戏。GameMonetize 使用 `SDK_GAME_PAUSE`/`SDK_GAME_START` 控制游戏。首版不接激励广告、横幅、账号、云存档、排行榜或成就。

SDK 层也需成为可移植插件：平台适配器、广告会话与本游戏暂停/音频 glue 分离，接入通过配置/依赖注入，不在核心写死 CF 的地图、模式、自然断点名称或语言列表；提供稳定安装入口、事件订阅和清理方法。当前游戏的“整场结束/返回菜单”是实例配置策略，不是通用插件不可修改的规则。

<a id="US-04"></a>
## US-04 两张原创平台地图

离线版保留现有双地图。Y8 与 GameMonetize 版本共用战斗玩法，但两张地图均采用原创公开名称、布局轮廓、建筑造型、标识与环境表现，不沿用 CF 品牌或标志性地图外观。原创版改动同时更新碰撞、导航、包区与关键视线，并在两平台构建中保持相同。不要仅给原地图改名或换色。正式提交前人工核对公开页面、截图和平台条款。

<a id="US-05"></a>
## US-05 构建与可验证交付

构建目标为 `offline | y8 | gamemonetize`。交付离线单文件 HTML、两份平台 ZIP（ZIP 根目录有 index.html）、源码、双语及双地图截图、同机性能比较和独立审核。平台真实验证需要 Y8 App ID/Game ID、GameMonetize Game ID；未取得时完成 mock SDK 验证并明确标记待平台验证。平台公开上传需要单独核对账号资料与发布版。

<a id="US-06"></a>
## US-06 实施与验收方式

GLM-5.3-Flash 通过 CLI 负责实现、自测和定向修复；独立新上下文负责审核。先定接口，再以隔离工作树和文件所有权分三路并行，单一集成任务收口共享主控与构建入口。使用少量针对性 TDD：语言回退与持久化、品牌选择、SDK 生命周期和暂停恢复、构建隔离、两张原创地图关键路线，以及受改动影响的 GPU 性能。已有通过证据可沿用，不反复运行无关长测。

## 来源

- 用户 2026-09-27 确认的实施计划、三张工作室图标及平台首版两图/中英双语/广告优先的选择。
- `/Users/sen/Doubao/chats/2026-09-25/new-chat-1/Y8与GameMonetize_SDK接入资料.md`（背景资料；与官方文档冲突时以官方文档为准）。
- Y8: https://docs.y8.com/sdk/intro/ 、https://docs.y8.com/sdk/advertising/ 、https://docs.y8.com/sdk/localization/ 、https://docs.y8.com/sdk/local-development/
- GameMonetize: https://github.com/GameMonetize/GameMonetize.com-SDK 、https://gamemonetize.com/sdk
