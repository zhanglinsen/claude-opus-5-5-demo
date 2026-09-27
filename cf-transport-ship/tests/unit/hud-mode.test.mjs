// HUD 菜单模式选择 + 设置 ENUMS.mode 单元测试（node --test）
// 契约（phase-5-wiring §4.6）：菜单用 modeOptionsFor(mapDesc) 渲染分段；
// settings.js 增加 ENUMS.mode；默认值逻辑：运输船 tdm、沙漠灰 bomb；URL ?mode= 优先级更高
//（URL 优先在 game.startMatch 已实现，这里锁定持久化层的生效模式语义）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveMode, matchHeader } from '../../src/hud.js';
import { ENUMS_MODE, DEFAULT_OPTS, normalize, loadOpts, acquireStorage } from '../../src/settings.js';
import { MAPS } from '../../src/maps/registry.js';
import { modeOptionsFor } from '../../src/modes/index.js';

test('settings：ENUMS.mode 覆盖三模式，DEFAULT_OPTS.mode = null（跟随地图默认）', () => {
  assert.deepEqual(ENUMS_MODE, ['tdm', 'bomb', 'practice']);
  assert.equal(DEFAULT_OPTS.mode, null);
  assert.equal(normalize({ v: 2, mode: 'practice' }).mode, 'practice');
  assert.equal(normalize({ v: 2, mode: 'dm' }).mode, null); // 非法枚举 → 跟随地图默认
  assert.equal(normalize({ v: 2 }).mode, null);
  assert.equal(loadOpts(acquireStorage(), false).mode, null); // 全链路不抛
});

test('effectiveMode：已存合法模式且该图支持 → 原样生效', () => {
  assert.equal(effectiveMode({ mode: 'tdm' }, MAPS['desert-grey']), 'tdm');
  assert.equal(effectiveMode({ mode: 'practice' }, MAPS['transport-ship']), 'practice');
});

test('effectiveMode：未设置/不支持 → 地图默认（运输船 tdm、沙漠灰 bomb）', () => {
  assert.equal(effectiveMode({ mode: null }, MAPS['transport-ship']), 'tdm');
  assert.equal(effectiveMode({ mode: null }, MAPS['desert-grey']), 'bomb');
  assert.equal(effectiveMode({}, MAPS['desert-grey']), 'bomb');
  // 运输船不支持爆破 → 回落 tdm
  assert.equal(effectiveMode({ mode: 'bomb' }, MAPS['transport-ship']), 'tdm');
});

test('effectiveMode：缺 supportedModes 的描述符安全回退默认模式', () => {
  assert.equal(effectiveMode({ mode: 'practice' }, { defaultMode: 'bomb' }), 'bomb');
  assert.equal(effectiveMode({ mode: null }, {}), 'tdm');
});

test('modeOptionsFor：两图选项与注册表 supportedModes 对齐（菜单渲染输入）', () => {
  assert.deepEqual(modeOptionsFor(MAPS['transport-ship']).map((m) => m.id), ['tdm', 'practice']);
  assert.deepEqual(modeOptionsFor(MAPS['desert-grey']).map((m) => m.id), ['bomb', 'tdm', 'practice']);
  assert.deepEqual(modeOptionsFor(null), []);
});

// ---- P3-5②（审核路由）：菜单高亮须与实际开局模式一致（镜像 startMatch：URL 合法优先 → 已存 → 地图默认） ----
import { displayMode } from '../../src/hud.js';
import { MODES } from '../../src/modes/index.js';

const qsOf = (v) => ({ get: (k) => (k === 'mode' ? v : null) });

test('displayMode：URL 携带合法且该图支持的 mode → URL 优先（覆盖已存设置）', () => {
  assert.equal(displayMode(qsOf('tdm'), { mode: 'practice' }, MAPS['desert-grey']), 'tdm');
  assert.equal(displayMode(qsOf('practice'), { mode: 'bomb' }, MAPS['desert-grey']), 'practice');
});

test('displayMode：URL 非法/该图不支持 → 回落已存合法模式（高亮与实际开局一致）', () => {
  assert.equal(displayMode(qsOf('dm'), { mode: 'practice' }, MAPS['desert-grey']), 'practice');
  assert.equal(displayMode(qsOf('bomb'), { mode: 'practice' }, MAPS['transport-ship']), 'practice');
});

test('displayMode：URL 非法且未存模式 → 地图默认', () => {
  assert.equal(displayMode(qsOf('nonsense'), { mode: null }, MAPS['desert-grey']), 'bomb');
  assert.equal(displayMode(qsOf(null), { mode: null }, MAPS['transport-ship']), 'tdm');
});

test('displayMode：qs 缺失/无 get 方法安全回落 effectiveMode 语义', () => {
  assert.equal(displayMode(null, { mode: 'practice' }, MAPS['desert-grey']), 'practice');
  assert.equal(displayMode({}, { mode: null }, MAPS['desert-grey']), 'bomb');
});

test('交叉校验：ENUMS_MODE 与 MODES 键一致（防未来增删静默失配）', () => {
  assert.deepEqual(Object.keys(MODES), ENUMS_MODE);
});

test('爆破主 HUD 读取规则视图的回合剩余时间与胜局目标', () => {
  assert.deepEqual(matchHeader({ modeName: '爆破模式', timeLeft: Infinity, goal: 50,
    objective: { timeLeft: 145, winsNeeded: 7 } }),
  { clock: '2:25', goal: '爆破模式 · 先赢 7 局' });
  assert.deepEqual(matchHeader({ modeName: '团队竞技', timeLeft: 540, goal: 50, objective: null }),
    { clock: '9:00', goal: '团队竞技 · 目标 50' });
});
