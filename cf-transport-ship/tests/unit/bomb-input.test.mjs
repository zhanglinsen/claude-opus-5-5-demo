// 爆破输入/HUD 公开行为测试（node --test）
// 输入片：Player 的 C4 输入命令状态机（player.js 导出的 BombInput，Player.update 每帧委托）。
// HUD 片：s.objective 只读视图 → HUD 可见文案（hud.js 导出的 objectiveHud，HUD.update 消费）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { BombInput } from '../../src/player.js';
import { objectiveHud } from '../../src/hud.js';

// 视图工厂：模拟 Game.objectiveView(actorId) 提供的字段（只取 UI 实际消费的公开字段）
const view = (over = {}) => ({
  phase: 'live', round: 3, timeLeft: 100,
  bomb: { carrierId: 7 },
  plantable: false, defusable: false, pickupable: false,
  plantProgress: 0, defuseProgress: 0,
  alive: { BL: 5, GR: 5 }, score: { BL: 2, GR: 1 },
  ...over,
});
// 输入工厂：Player.update 每帧从鼠标/键盘归集的输入
const inp = (over = {}) => ({
  carrying: true, c4Selected: true,
  fire: false, eHeld: false, ePressed: false, gPressed: false,
  pos: { x: 1, y: 0, z: 2 },
  ...over,
});
const types = (cmds) => cmds.map((c) => c.type);

test('持包按5选中C4后按住开火→startPlant，松开→stopPlant', () => {
  const bi = new BombInput();
  bi.selectC4(true);
  const v = view({ plantable: true });
  assert.deepEqual(types(bi.update(v, inp({ fire: true }), 1 / 60)), ['startPlant']);
  // 进度推进中继续按住：不重复发送
  assert.deepEqual(types(bi.update(view({ plantable: true, plantProgress: 2 }), inp({ fire: true }), 1 / 60)), []);
  // 松开：中断安放
  assert.deepEqual(types(bi.update(view({ plantable: true }), inp({ fire: false }), 1 / 60)), ['stopPlant']);
});

test('未选中5号槽或未持包时不发送安放命令', () => {
  const bi = new BombInput(); // 未按5选中C4
  assert.deepEqual(types(bi.update(view({ plantable: true }), inp({ fire: true }), 1 / 60)), []);
  const bi2 = new BombInput();
  bi2.selectC4(true);
  assert.deepEqual(types(bi2.update(view({ plantable: true }), inp({ fire: true, carrying: false }), 1 / 60)), []);
});

test('规则侧打断（进度归零）后按住不放不会重新安放，需松开再按', () => {
  const bi = new BombInput();
  bi.selectC4(true);
  const g60 = 1 / 60;
  assert.deepEqual(types(bi.update(view({ plantable: true }), inp({ fire: true }), g60)), ['startPlant']);
  // 命令延迟宽限期内进度仍为0是正常现象，不打断
  assert.deepEqual(types(bi.update(view({ plantable: true, plantProgress: 0 }), inp({ fire: true }), g60)), []);
  // 打断：进度归零（受伤/移动/离开包点由 BombMatch 事实判定），宽限耗尽后按住不放 → stopPlant + 封锁
  bi.update(view({ plantable: true, plantProgress: 0 }), inp({ fire: true }), 0.4);
  assert.deepEqual(types(bi.update(view({ plantable: true, plantProgress: 0 }), inp({ fire: true }), 1 / 60)), ['stopPlant']);
  // 一直按住也不再发送
  assert.deepEqual(types(bi.update(view({ plantable: true }), inp({ fire: true }), g60)), []);
  // 松开后重新按住 → 重新安放
  bi.update(view({ plantable: true }), inp({ fire: false }), g60);
  assert.deepEqual(types(bi.update(view({ plantable: true }), inp({ fire: true }), g60)), ['startPlant']);
});

test('E 拆包优先于拾取：defusable 时按E→startDefuse，松开→stopDefuse；仅 pickupable 时按E→pickupBomb', () => {
  const bi = new BombInput();
  // 拆包（按住语义）
  assert.deepEqual(types(bi.update(view({ phase: 'planted', bomb: { planted: true, site: 'A' }, defusable: true }), inp({ eHeld: true }), 1 / 60)), ['startDefuse']);
  assert.deepEqual(types(bi.update(view({ phase: 'planted', bomb: { planted: true, site: 'A' }, defusable: true, defuseProgress: 3 }), inp({ eHeld: true }), 1 / 60)), []);
  assert.deepEqual(types(bi.update(view({ phase: 'planted', bomb: { planted: true, site: 'A' } }), inp({ eHeld: false }), 1 / 60)), ['stopDefuse']);
  // 拆包优先：defusable 与 pickupable 同帧真时只拆不拾
  const bi2 = new BombInput();
  assert.deepEqual(types(bi2.update(view({ phase: 'planted', bomb: { planted: true, site: 'A' }, defusable: true, pickupable: true }), inp({ ePressed: true, eHeld: true }), 1 / 60)), ['startDefuse']);
  // 掉包拾取（瞬时命令）
  const bi3 = new BombInput();
  assert.deepEqual(types(bi3.update(view({ bomb: { dropped: true, pos: null }, pickupable: true }), inp({ ePressed: true }), 1 / 60)), ['pickupBomb']);
});

test('G 丢C4：dropBomb 携带位置并退出C4选中；未持包G无命令', () => {
  const bi = new BombInput();
  bi.selectC4(true);
  const cmds = bi.update(view(), inp({ gPressed: true }), 1 / 60);
  assert.deepEqual(types(cmds), ['dropBomb']);
  assert.deepEqual(cmds[0].pos, { x: 1, y: 0, z: 2 });
  // 未持包
  const bi2 = new BombInput();
  bi2.selectC4(true);
  assert.deepEqual(types(bi2.update(view(), inp({ gPressed: true, carrying: false }), 1 / 60)), []);
});

test('非爆破模式（视图为空）完全不产生命令', () => {
  const bi = new BombInput();
  bi.selectC4(true);
  assert.deepEqual(types(bi.update(null, inp({ fire: true, eHeld: true, ePressed: true, gPressed: true }), 1 / 60)), []);
});

// ---------- HUD 只读渲染片 ----------

test('HUD：准备期显示回合与换包提示，持包显示C4携带', () => {
  const o = objectiveHud(view({ phase: 'prep', timeLeft: 3 }), { myId: 7, myTeam: 'BL' });
  assert.ok(o.active);
  assert.match(o.round, /第 3 回合/);
  assert.match(o.hint, /准备期/);
  assert.match(o.hint, /B/);
  assert.match(o.c4, /C4/);
  assert.equal(o.c4Cls, 'carry');
});

test('HUD：live 持包按身份显示携带者，plantable 提示按住左键安放，安放中显示进度', () => {
  const me = objectiveHud(view({ plantable: true }), { myId: 7, myTeam: 'BL', actorOf: () => null });
  assert.match(me.c4, /我携带/);
  assert.match(me.hint, /按住左键/);
  const mate = objectiveHud(view(), { myId: 8, myTeam: 'BL', actorOf: (id) => (id === 7 ? { name: '阿明', team: 'BL' } : null) });
  assert.match(mate.c4, /阿明/);
  const enemy = objectiveHud(view(), { myId: 9, myTeam: 'GR', actorOf: () => ({ name: '敌方', team: 'BL' }) });
  assert.match(enemy.c4, /敌方携带/);
  const prog = objectiveHud(view({ plantable: true, plantProgress: 2.5 }), { myId: 7, myTeam: 'BL' });
  assert.equal(prog.progress.label, '正在安放');
  assert.ok(prog.progress.frac > 0.4 && prog.progress.frac < 0.6);
});

test('HUD：已安放显示包点与拆除提示/进度，掉落显示拾取提示', () => {
  const planted = objectiveHud(view({ phase: 'planted', bomb: { planted: true, site: 'B' }, defusable: true, timeLeft: 31 }), { myId: 9, myTeam: 'GR' });
  assert.match(planted.c4, /B/);
  assert.match(planted.hint, /按住 E/);
  const defusing = objectiveHud(view({ phase: 'planted', bomb: { planted: true, site: 'B' }, defuseProgress: 3.5 }), { myId: 9, myTeam: 'GR' });
  assert.equal(defusing.progress.label, '正在拆除');
  const dropped = objectiveHud(view({ bomb: { dropped: true, pos: null }, pickupable: true }), { myId: 7, myTeam: 'BL' });
  assert.match(dropped.c4, /掉落/);
  assert.match(dropped.hint, /拾取/);
});

test('HUD：回合结束渲染规则给出的胜方；TDM（无视图）整块不显示', () => {
  const end = objectiveHud(view({ phase: 'roundEnd', bomb: null, roundWinner: 'GR' }), { myId: 7, myTeam: 'BL' });
  assert.match(end.hint, /保卫者/);
  const off = objectiveHud(null, { myId: 7, myTeam: 'BL' });
  assert.equal(off.active, false);
  assert.equal(off.c4, '');
  assert.equal(off.progress, null);
});
