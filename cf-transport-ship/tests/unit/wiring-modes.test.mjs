// D 波接线：练习模式适配器与地图靶点元数据契约测试（node --test，纯数据，无 DOM/Three）。
// 模式适配器与靶点都是 Game 接线的输入：本测试锁定公开形状，几何可行性由浏览器 e2e 兜底。
// 追加（phase-5-engine-fixes）：审核 P2-1/P2-2/P3-1/2/3 与 HUD-P2-1 的 Game 实例级回归
// （game.js 模块在 node 可导入；Game 实例只注入 fake 协作者，不走浏览器路径）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { MODES, getMode, modeOptionsFor } from '../../src/modes/index.js';
import { MAPS } from '../../src/maps/registry.js';
import { createTargetStates } from '../../src/modes/practice-targets.js';
import { WeaponState } from '../../src/weapons.js';

globalThis.location = { search: '' }; // Game 构造器读取 location.search；node 下注入最小 shim
const { Game } = await import('../../src/game.js');

// 构造最小可用的 Game 测试替身：只装配被测方法触达的协作者
function makeGame() {
  const g = new Game();
  g.hud = { saveOpts() {}, toast() {}, slots() {} };
  g.vm = { equip() {} };
  g.opts = {};
  g.time = 10;
  return g;
}

// 最小可驱动 actor 替身：pos/eye/forward 满足 flashbang 的观察者契约（eye 高于任何腰高掩体）
function makeObserver(overrides = {}) {
  const a = {
    alive: true, pos: { x: 0, y: 0, z: 0 },
    eye: (out) => out.set(0, 1.62, 0),
    forward: (out) => out.set(1, 0, 0), // 面朝 +x
    blindUntil: 0, blindIntensity: 0,
    ...overrides,
  };
  return a;
}

test('练习模式适配器：无对局时限、可重生、永不判负/结束，供 Game 钩子消费', () => {
  const m = getMode('practice');
  assert.equal(m.id, 'practice');
  assert.ok(MODES.practice, 'practice 应注册进 MODES 表');
  assert.equal(m.defaults.time, Infinity, '练习无对局时限（timeLeft 永不到期）');
  assert.ok(Number.isFinite(m.defaults.respawn) && m.defaults.respawn >= 0, '死亡后可重生（有限重生延迟）');
  assert.equal(m.checkEnd(m.score ?? { BL: 0, GR: 0 }, 50), false, '练习不凭比分结束对局');
  assert.equal(m.result({ BL: 1, GR: 9 }, 'BL'), null, '练习无胜负语义');
});

test('modeOptionsFor：按地图 supportedModes 顺序给出可选模式（供菜单渲染，lane 3 消费）', () => {
  assert.deepEqual(modeOptionsFor(MAPS['desert-grey']).map((o) => o.id), ['bomb', 'tdm', 'practice']);
  assert.deepEqual(modeOptionsFor(MAPS['transport-ship']).map((o) => o.id), ['tdm', 'practice']);
  assert.deepEqual(modeOptionsFor(null), [], '无地图描述时安全返回空');
  for (const o of modeOptionsFor(MAPS['desert-grey'])) {
    assert.ok(typeof o.name === 'string' && o.name.length > 0, '每个选项带可显示名称');
  }
});

test('两幅地图都提供合法练习靶点：全部通过 createTargetStates 校验且无丢弃', () => {
  for (const id of ['transport-ship', 'desert-grey']) {
    const spots = MAPS[id].practiceTargets;
    assert.ok(Array.isArray(spots) && spots.length >= 4, `${id} 应提供至少 4 个练习靶点`);
    const states = createTargetStates(spots);
    assert.equal(states.length, spots.length, `${id} 靶点应全部合法（无校验丢弃）：${JSON.stringify(states)}`);
    const ids = new Set(spots.map((s) => s.id));
    assert.equal(ids.size, spots.length, `${id} 靶点 id 不重复`);
    for (const s of states) {
      assert.ok(s.visible, `${id} 靶点 ${s.id} 默认可见（射击靶）`);
      assert.ok(s.radius > 0 && Number.isFinite(s.pos.x), `${id} 靶点 ${s.id} 半径/坐标合法`);
    }
  }
});

// ---- P2-1：目标行动只按引擎完成事件记账（刷分封堵） ----
test('目标行动记账：只计玩家的 bombPlanted/bombDefused/bombPickedUp 完成事件', () => {
  const g = makeGame();
  g.player = { id: 0 };
  g.onBombEvents([
    { type: 'bombPlanted', actorId: 0, site: 'A' },   // 玩家安包成功 +1
    { type: 'bombDefused', actorId: 1 },              // 队友拆包，不记
    { type: 'bombPickedUp', actorId: 0 },             // 玩家拾包 +1
    { type: 'bombPlanted', actorId: 2, site: 'B' },   // 敌方（测试假事件）不记
  ]);
  assert.equal(g.playerObjectiveActions, 2, `完成事件恰好各计一次，实际 ${g.playerObjectiveActions}`);
});

test('目标行动记账：命令通道（含 stop 类与连点 start）不再产生计数', () => {
  const g = makeGame();
  g.player = { id: 0 };
  g.bombSession = { command: () => true }; // 命中类型收口恒真——旧实现据此计数的刷分入口
  for (let i = 0; i < 20; i++) {
    g.objectiveCommand('startDefuse', 0);
    g.objectiveCommand('stopDefuse', 0);
    g.objectiveCommand('startPlant', 0);
    g.objectiveCommand('stopPlant', 0);
  }
  assert.equal(g.playerObjectiveActions, 0, `命令通道必须零计数（防 E 键连刷），实际 ${g.playerObjectiveActions}`);
});

// ---- P2-2：bots 雷包收窄为 ['he']（协调者决策） ----
test('出生雷包：bots 只带 HE（不投闪光/烟雾），玩家按档案 + 目录补齐', () => {
  const g = makeGame();
  g.profileAdapter = { loadout: () => ({ grenades: ['he'], primary: 'ak47' }) };
  const bot = { isPlayer: false };
  const player = { isPlayer: true };
  assert.deepEqual(g.grenadeBagFor(bot), ['he'], 'bot 雷包只含 he');
  assert.deepEqual(g.grenadeBagFor(player), ['he', 'flash', 'smoke'], '玩家雷包仍全量轮换');
});

// ---- P3-1/P3-2：闪光观察者眼位 + 强度取 max ----
test('闪光遮挡按眼位结算：腰高掩体不再错误挡住眼可见的闪光', () => {
  const g = makeGame();
  g.fx = { light() {} };
  g.time = 0;
  // 模拟腰高掩体：仅当视线终点低于 1.2m 时判定遮挡（眼位 1.62 应畅通、脚底 0 应被挡）
  g.world = { raycast: (x, y, z, dx, dy, dz, len) => (y + dy * len < 1.2 ? { t: 1 } : null) };
  const a = makeObserver();
  g.actors = [a];
  g.flashbang({ x: 5, y: 1.6, z: 0 });
  assert.ok(a.blindUntil > 0 && a.blindIntensity > 0, '眼位可见 → 应致盲（脚底旧实现被腰墙误挡）');
});

test('闪光强度取 max：更晚到期的弱闪不得下调既有强致盲', () => {
  const g = makeGame();
  g.fx = { light() {} };
  g.world = { raycast: () => null };
  const a = makeObserver();
  g.actors = [a];
  g.time = 0;
  g.flashbang({ x: 0, y: 1.62, z: 0 }); // 与眼重合（贴脸）：满强度 duration 3s、until 3
  assert.equal(a.blindIntensity, 1);
  g.time = 2.9;
  g.flashbang({ x: 9.6, y: 1.6, z: 0 }); // 距离 ~9.6 → 弱闪 intensity ~0.4、until ~4.1（更晚到期）
  assert.ok(Math.abs(a.blindUntil - 4.1) < 1e-3, `更晚到期重置 remaining，实际 ${a.blindUntil}`);
  assert.equal(a.blindIntensity, 1, `强度必须保持 max(1, 0.4)=1，实际 ${a.blindIntensity}`);
});

// ---- P3-3：烟雾视觉球半径与规则半径对齐 ----
test('烟雾视觉球半径等于规则半径（视线遮挡外缘不应超出可见烟体）', () => {
  const g = makeGame();
  g.renderer = { scene: { add() {}, remove() {} } };
  g.smokes = [];
  g.smokeOut({ x: 0, y: 0, z: 0 });
  const s = g.smokes[0];
  assert.ok(s, 'smokeOut 应生成云');
  assert.equal(s.mesh.geometry.parameters.radius, s.cloud.radius, '视觉半径须与 blocksSight 半径一致');
});

// ---- HUD-P2-1：chooseLoadout 出生区即时生效分支统一走 onSwitch（练习运行时同步） ----
test('chooseLoadout 即时生效分支：经 onSwitch 同步练习运行时与 HUD/vm', () => {
  const g = makeGame();
  const synced = [];
  g.practice = { selectWeapon: (id) => synced.push(id) };
  g.mapDesc = { loadoutZone: { BL: { axis: 'x', max: -28.3 } } };
  const p = {
    id: 0, isPlayer: true, team: 'BL', alive: true, pos: { x: -30, y: 0, z: 0 }, nextPrimary: null, slot: 0,
    inv: [new WeaponState('ak47')],
    get weapon() { return this.inv[this.slot]; },
    soldier: { setWeapon() {} },
  };
  g.player = p;
  g.chooseLoadout('m4a1');
  assert.equal(p.inv[0].id, 'm4a1', '出生区内立即生效');
  assert.deepEqual(synced, ['m4a1'], `练习运行时必须同步（旧实现面板停留旧枪），实际 ${JSON.stringify(synced)}`);
});
