# 沙漠灰多地图实施规格

来源：用户于 2026-09-26 明确批准的“在运输船工程中新增沙漠灰地图”计划。基线提交：54adc1fb64155f9dd7c1c90ecae7b8185ac540b8。

## Scope
在现有 cf-transport-ship 内扩展；同一 HTML 支持运输船（团队竞技、练习）与沙漠灰（5v5 AI 爆破、团队竞技、练习）。共用枪械、角色、输入、音效、特效和渲染。新玩家默认沙漠灰，旧 cf_ship_opts 用户迁移后默认运输船。地图切换在菜单保存并重载；URL map=transport-ship/desert-grey 优先。仅本地交付。

## Architecture
地图定义提供 id/name/supportedModes/defaultMode/build/bounds、xyz+yaw 出生点、出生区、报点区域、包区、导航与环境及菜单镜头。运输船几何保留；海面、烟囱、灯光、阴影与旧 AI 坐标配置化。共享物理支持坡面、高低层；沙漠灰采用高度与净空明确的导航图，运输船原 NavGrid 通过适配接入。独立模式状态机控制复活、目标、计分与结算。设置迁移旧灵敏度、音量、画质、武器偏好。JS/Three.js/esbuild 栈和内联单 HTML 保持；不依赖运行时网络资源。增加 dev/test/test:e2e 以及仅测试参数开启的固定种子、快照和推进接口。

## Map
经典端游布局、增强画质。参考：https://ol.3dmgame.com/gl/15988.html；俯视图 https://olimg.3dmgame.com/uploads/images/raiders/20180322/1521711094_514704.jpg；实景 https://olimg.3dmgame.com/uploads/images/raiders/20180322/1521711100_595781.png。
必含潜伏者出生点、后花园、A门、A大、A大坑、A平台、A小道与楼梯、中路、中门、桥下、保卫者出生点、B洞上下层、B门、B窗、B包点。先可行走白模再材质。按参考图及人物尺度估算尺寸并记录，不宣称精确原版尺寸。灰白石墙、木门木箱、沙地、远景建筑；材质法线粗糙度、接触阴影、日照和洞内明暗；高中低画质。通路、视线与标志轮廓优先，不能交付只散放箱子的空旷竞技场。

## Rules
爆破默认 5v5/normal/固定阵营/先赢7局。准备5秒、回合150秒、安包5秒、拆包7秒、引爆40秒；本项目默认值。C4可携带/丢弃/死亡掉落/拾取/安放/拆除/引爆。安包后BL全灭仍等待拆除或引爆；GR全灭可判BL胜。未安包时间到GR胜。临界同帧事件只结算一次，按精确完成时间仲裁，平时刻爆炸优先。死亡观战存活队友，不泄露敌方；回合统一复活。准备期可改背包，交战期下一回合生效。暂停冻结模拟；重开清理计时器与输入。
团队竞技默认50杀/600秒/4秒复活，保留运输船人数与目标选项；背包出生区立即生效，否则复活生效。练习无敌军主动攻击，可全图探索/任意换枪/射击静态靶。

## Combat
复用AK47/M4A1/AWM/MP5/Deagle/knife和现有枪感。保留后坐力、散布、换弹开镜、部位伤害、护甲、木门木箱穿透、动画与空间音效。增加HE/flash/smoke；实体遮挡影响HE与闪光，烟雾同时阻碍AI视线。AI仅感知视线、声音、最后已知位置，具备分路/架点/侧翼/携包/补包/守包/回防拆包；遇阻重寻路，不能靠传送完成路径。

## Controls
WASD/鼠标左射击右开镜/Space跳/Ctrl或C蹲/Shift慢走/R换弹/数字切换/Q上一武器/B背包/Tab战绩/Esc暂停。5号C4，持C4在包区按住左键安包；E拆包或拾取（拆包优先）；G丢当前枪或C4；4号切换剩余投掷物。触屏补齐目标交互。HUD按地图模式显示报点、回合、存活人数、C4、战绩等；本地AI不显示伪造网络延迟。

## Verification
测试完成且代码未改变时不要重复全套测试来制造“最终干净”记录；保留对应代码版本的第一次成功证据。仅因新增变更、失败或具体未解决风险追加验证。浏览器测试等待实际状态/DOM，不用固定毫秒等待猜测GPU或软件渲染速度。
每阶段GLM实现自测→独立Sol审核→GLM修复→Sol复核，通过后自动继续。GLM不能自审代替Sol；Sol不编辑实现。变更与证据绑定内容hash/阶段。两个回合修复仍同根因则Astra修订规划。
最终检查运输船回归、切图和设置；对照地图截图并走通双方到A/B及回防；安拆包/歼灭/超时/死亡掉包/取消/临界/暂停/重开；命中穿透/道具遮挡/AI；固定种子至少20爆破回合；不少于10分钟真实渲染；桌面和手机横屏；HTTP和file独立HTML无网络依赖和异常；连续重开10次资源趋稳；1080p中画质接近60fps为优化目标，报告实际设备、平均帧率和卡顿，不虚报。

## Delegation
Astra只规划、下发与汇总。所有产品代码/测试/修复由 zcode-kit run claude-code -- --model glm-5.3-flash 生成。独立审核固定 codex exec -m gpt-6-sol -s read-only。不得改为Astra或另一个模型实现。用CLI，不用内置子代理。事件日志在/private/tmp/cf-desert-grey-run；持久报告在.ultra/reports。不得打印密钥，不推送或部署。保留现有用户变更，当前初始工作树干净。

## User workflow update — 2026-09-26

User has changed reviewer allocation to conserve Codex quota. Complete the currently running phase-1 Sol rereview (same thread resumed after brief interruption). All SUBSEQUENT independent reviews/rereviews use fresh GLM-5.3-Flash CLI sessions with --effort max instead of Sol. Implementer remains GLM-5.3-Flash (--effort high unless user changes it); Astra only planning/orchestration. All work remains CLI dispatched. Independent read-only review domains may run concurrently against frozen source; implementation of dependent stages stays sequential and only one product writer at a time unless explicit disjoint-file ownership is planned. No self-review: reviewer must use fresh isolated context. Existing historical Sol reports remain valid evidence. This update supersedes old Sol-only language below/above.

## Latest user testing constraint — necessary tests only

User explicitly requests reducing excessive testing. Keep meaningful build, critical gameplay/rules/navigation checks, actual user startup, and targeted regression for changed behavior. Do not rerun an unchanged full suite, duplicate assertions, add implementation-mirroring tests, or broaden audits without a concrete remaining risk. Prefer a targeted case and stop once the relevant risk is resolved. Preserve required final acceptance (20 seeded bomb rounds, >=600 seconds actual rendering, dual-map HTTP/file workflows); run these once on the final candidate and repeat only affected evidence after fixes. Tests must remain honest and non-vacuous.

## Profile

User explicitly added SOLID, separation of concerns, layered/component structure, high cohesion/low coupling, TDD, military rank and equipment progression saved locally. The implementation before this update does not yet satisfy strict TDD and contains no persistent rank/full equipment system; do not misreport it. Apply TDD to new work from this point forward: public behavior test fails first, minimal implementation, refactor while green; keep tests necessary and non-tautological. Existing in-flight stage2 parallel workers started before this instruction, so do not claim their earlier work was test-first. Their integrated phase gate must still validate meaningful behavior.

Architecture target: pure game rules/domain (bomb outcome, rank XP, equipment validity) depends on no DOM/Three/storage; application services coordinate match/profile and expose explicit events; infrastructure adapts localStorage through guarded, versioned reads/writes/migration; game and HUD act as presentation/integration adapters. Avoid duplicating gameplay state between these layers, import cycles, mode/map conditionals spread across unrelated modules, and global service locators. Extract the currently broad Game responsibilities incrementally when adding touched features; no cosmetic rewrite without behavior gain.

Local player profile: versioned key separate from `cf_opts_v2`, preserve/migrate saved primary preference. Include total XP, named military rank/level derived from documented thresholds, match stats by mode, and three persisted equipment presets with active preset. Every preset selects from current actual primary/sidearm/melee/grenade types and body protection available in the game; invalid/corrupt saves normalize safely. XP comes from completed competitive rounds/matches with meaningful kills, objective actions and wins, awarded exactly once per unique result; practice does not farm rank. Ranks are local project progression, no account/network dependency. Equip choices obey existing bomb prep vs live and TDM spawn-zone vs respawn timing. HUD/menu show rank progress and active preset, with clear local-save/fallback state. Local storage failure degrades to memory without breaking play. No economy or forced unlock grind unless later explicitly requested.

Final acceptance adds: fresh profile, legacy primary migration, save/reload persistence, invalid/corrupt profile recovery, preset switching and phase-appropriate equip application, match XP counted once, rank threshold crossing and practice XP exclusion, local-only no runtime network dependence. Use a few high-value public seam tests and a real browser save/reload workflow, not redundant low-impact tests.
