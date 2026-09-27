// 设置迁移与归一化单元测试（node --test）
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEGACY_KEY, SETTINGS_KEY, SETTINGS_VERSION, migrate, loadOpts, saveOpts, normalize, acquireStorage, DEFAULT_OPTS } from '../../src/settings.js';

function fakeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    dump: () => Object.fromEntries(m),
  };
}
// 模拟隐私模式等 storage 访问抛 SecurityError 的环境
function throwingStorage() {
  return {
    getItem: () => { throw new DOMException('denied', 'SecurityError'); },
    setItem: () => { throw new DOMException('denied', 'SecurityError'); },
  };
}

test('migrate 保留旧灵敏度/音量/画质/武器偏好，并固定为 v2 + 运输船', () => {
  const legacy = JSON.stringify({ sens: 1.7, vol: 0.45, quality: 'medium', primary: 'awm', team: 'GR', fov: 90, tod: 'dusk' });
  const o = migrate(legacy);
  assert.equal(o.v, SETTINGS_VERSION);
  assert.equal(o.map, 'transport-ship');
  assert.equal(o.sens, 1.7);
  assert.equal(o.vol, 0.45);
  assert.equal(o.quality, 'medium');
  assert.equal(o.primary, 'awm');
  assert.equal(o.team, 'GR');
  assert.equal(o.fov, 90);
  assert.equal(o.tod, 'dusk');
});

test('空对象 {} 的旧记录也是旧用户：默认运输船（不落入新玩家默认）', () => {
  assert.equal(migrate('{}').map, 'transport-ship');
  assert.equal(loadOpts(fakeStorage({ [LEGACY_KEY]: '{}' }), false).map, 'transport-ship');
});

test('损坏的旧记录字符串同样按旧用户处理；无记录才是新玩家', () => {
  assert.equal(migrate('{broken json').map, 'transport-ship');
  assert.equal(migrate(null).map, null);
});

test('migrate/loadOpts 对损坏与非法旧字段回退默认值', () => {
  const o = migrate(JSON.stringify({ sens: 'banana', team: 'xx', fov: 1e9, primary: 42 }));
  // 非法字段回默认，越界数值夹紧
  assert.deepEqual({ ...o, map: undefined, fov: undefined, quality: undefined }, { ...DEFAULT_OPTS, map: undefined, fov: undefined, quality: undefined });
  assert.equal(o.fov, 100); // 1e9 为有限数 → 夹紧到菜单上限
  assert.equal(o.quality, 'high'); // 无有效画质 → 桌面默认
});

test('normalize：v2 记录中的非法枚举与数值被替换/夹紧，缺失字段补默认', () => {
  const o = normalize({ v: 2, primary: 'invalid', team: 'xx', quality: 'ultra', diff: 'nightmare', tod: 'noon', sens: 'banana', fov: 1e9, vol: -3, goal: NaN, size: 99 });
  assert.equal(o.primary, 'ak47');
  assert.equal(o.team, 'BL');
  assert.equal(o.quality, 'high'); // 桌面默认
  assert.equal(o.diff, 'normal');
  assert.equal(o.tod, 'day');
  assert.equal(o.sens, 1.0); // 非数值 → 默认
  assert.equal(o.fov, 100); // 越界 → 夹紧
  assert.equal(o.vol, 0); // 负值 → 夹紧
  assert.equal(o.goal, 50); // NaN → 默认
  assert.equal(o.size, 16); // 越界 → 夹紧
  assert.equal(o.v, SETTINGS_VERSION);
});

test('normalize：合法但越界的数值被夹紧到菜单范围', () => {
  const o = normalize({ v: 2, sens: 99, fov: 10, vol: 2, goal: -5, size: 0 });
  assert.equal(o.sens, 3);
  assert.equal(o.fov, 65);
  assert.equal(o.vol, 1);
  assert.equal(o.goal, 1);
  assert.equal(o.size, 2);
});

test('normalize：合法值原样保留', () => {
  const o = normalize({ v: 2, sens: 1.7, fov: 90, vol: 0.5, goal: 100, size: 8, primary: 'awm', team: 'GR', quality: 'low', diff: 'hell', tod: 'dusk', map: 'transport-ship' });
  assert.equal(o.sens, 1.7);
  assert.equal(o.goal, 100);
  assert.equal(o.size, 8);
  assert.equal(o.map, 'transport-ship');
  assert.equal(o.quality, 'low');
});

test('loadOpts：畸形/极简 v2 记录被归一化，可正常用于开局', () => {
  const s = fakeStorage({ [SETTINGS_KEY]: '{"v":2,"primary":"invalid"}' });
  const o = loadOpts(s, false);
  assert.equal(o.primary, 'ak47');
  assert.equal(o.mag ?? o.sens, 1.0); // sens 回默认
  assert.ok(Number.isFinite(o.fov) && o.fov >= 65 && o.fov <= 100);
  // 关键路径字段全部可用
  for (const k of ['team', 'primary', 'diff', 'tod', 'quality', 'sens', 'fov', 'vol', 'goal', 'size']) assert.notEqual(o[k], undefined);
});

test('loadOpts：损坏的 v2 JSON 回退迁移路径', () => {
  const s = fakeStorage({ [SETTINGS_KEY]: '{oops', [LEGACY_KEY]: JSON.stringify({ sens: 2.2 }) });
  const o = loadOpts(s, false);
  assert.equal(o.sens, 2.2);
  assert.equal(o.map, 'transport-ship');
});

test('loadOpts：无旧数据的新玩家得到 v2 默认（地图交由注册表解析）', () => {
  const s = fakeStorage();
  const o = loadOpts(s, false);
  assert.equal(o.v, SETTINGS_VERSION);
  assert.equal(o.map, null);
  assert.equal(o.quality, 'high'); // 桌面
  assert.ok(SETTINGS_KEY in s.dump()); // 立即落盘
});

test('loadOpts：检测到旧 cf_ship_opts 时迁移并落盘', () => {
  const s = fakeStorage({ [LEGACY_KEY]: JSON.stringify({ sens: 2.2, vol: 0.2 }) });
  const o = loadOpts(s, true);
  assert.equal(o.sens, 2.2);
  assert.equal(o.vol, 0.2);
  assert.equal(o.map, 'transport-ship'); // 旧用户默认运输船
  assert.equal(o.quality, 'low'); // 触屏默认
  assert.equal(JSON.parse(s.dump()[SETTINGS_KEY]).sens, 2.2);
});

test('loadOpts：已迁移的 v2 数据优先于旧键', () => {
  const s = fakeStorage({
    [LEGACY_KEY]: JSON.stringify({ sens: 9 }),
    [SETTINGS_KEY]: JSON.stringify({ v: SETTINGS_VERSION, sens: 1.1, map: 'transport-ship' }),
  });
  assert.equal(loadOpts(s, false).sens, 1.1);
});

test('loadOpts：storage 读写全部抛错时也不抛异常，返回可用默认', () => {
  const s = throwingStorage();
  const o = loadOpts(s, false);
  assert.equal(o.v, SETTINGS_VERSION);
  assert.equal(o.primary, 'ak47');
  assert.equal(o.quality, 'high');
  assert.doesNotThrow(() => saveOpts(s, o));
});

test('acquireStorage：localStorage 属性 getter 抛错时回退内存实现且不抛异常', () => {
  assert.equal(typeof globalThis.localStorage, 'undefined'); // node 下本无 localStorage
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { throw new DOMException('denied', 'SecurityError'); },
  });
  try {
    let s;
    assert.doesNotThrow(() => { s = acquireStorage(); });
    // 功能上等价可用（内存兜底语义），且读取不触发任何异常
    assert.doesNotThrow(() => s.getItem('anything'));
    assert.equal(s.getItem('anything'), null);
    // 内存实现可完整走通 load/save 往返
    const o = loadOpts(s, false);
    assert.equal(o.v, SETTINGS_VERSION);
    assert.equal(o.primary, 'ak47');
    o.map = 'desert-grey';
    saveOpts(s, o);
    assert.equal(loadOpts(s, false).map, 'desert-grey');
  } finally {
    delete globalThis.localStorage;
  }
});

test('acquireStorage：可用 storage 原样返回', () => {
  const s = fakeStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: s });
  try {
    assert.equal(acquireStorage(), s);
  } finally {
    delete globalThis.localStorage;
  }
});

test('saveOpts/loadOpts 往返一致', () => {
  const s = fakeStorage();
  const o = loadOpts(s, false);
  o.map = 'desert-grey';
  saveOpts(s, o);
  assert.equal(loadOpts(s, false).map, 'desert-grey');
});

// ── 语言字段（US-02）：lang 存于 cf_opts_v2，'' = 自动 ──

test('lang 字段：默认空串（自动），归一化保留合法字符串', () => {
  assert.equal(DEFAULT_OPTS.lang, '');
  const o = normalize({ v: 2, lang: 'en' });
  assert.equal(o.lang, 'en');
  const zh = normalize({ v: 2, lang: 'zh-CN' });
  assert.equal(zh.lang, 'zh-CN');
});

test('lang 字段：非法类型回退空串，两侧空白与超长输入被清理', () => {
  assert.equal(normalize({ v: 2, lang: 42 }).lang, '');
  assert.equal(normalize({ v: 2, lang: null }).lang, '');
  assert.equal(normalize({ v: 2, lang: {} }).lang, '');
  assert.equal(normalize({ v: 2, lang: ' en ' }).lang, 'en');
  assert.equal(normalize({ v: 2, lang: 'x'.repeat(99) }).lang.length, 35);
  assert.equal(normalize({ v: 2, lang: '   ' }).lang, '');
});

test('lang 字段：旧 v2 记录（无 lang）与 v1 迁移记录都补出 lang=""', () => {
  const v2 = loadOpts(fakeStorage({ [SETTINGS_KEY]: JSON.stringify({ v: 2, primary: 'awm', map: 'transport-ship' }) }), false);
  assert.equal(v2.lang, '');
  assert.equal(v2.primary, 'awm'); // 其余字段不受影响
  const v1 = migrate(JSON.stringify({ sens: 1.7 }));
  assert.equal(v1.lang, '');
});

test('lang 字段：损坏/抛错 storage 下同样得到 lang=""，可继续游戏', () => {
  assert.equal(loadOpts(fakeStorage({ [SETTINGS_KEY]: '{oops' }), false).lang, '');
  const s = throwingStorage();
  const o = loadOpts(s, false);
  assert.equal(o.lang, '');
  assert.doesNotThrow(() => saveOpts(s, { ...o, lang: 'en' }));
});

test('lang 字段：save/load 往返保留玩家语言选择', () => {
  const s = fakeStorage();
  const o = loadOpts(s, false);
  o.lang = 'en';
  saveOpts(s, o);
  assert.equal(loadOpts(s, false).lang, 'en');
});
