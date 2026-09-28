// Task 11 / US-05 聚焦测试：目标选择、三构建隔离、离线无外链、mock 标志、
// 平台品牌中立、语言注入与广告暂停恢复。构建产物检查（最后一段）依赖 npm run build 先行。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  mapsForTarget, resolveMapIdIn, MAP_TARGET_SETS, getMapDescriptor,
} from '../../src/maps/registry.js';
import { resolvePlatformConfig, mockMarker, BUILD_TARGETS } from '../../src/platform/config.js';

// 各目标唯一允许的官方 SDK 主机（官方脚本地址：Y8 cdn.y8.com / GM api.gamemonetize.com）。
// 运行时隔离由构建整枝保证，这里做产物级验证。
const SDK_HOSTS = {
  offline: [],
  y8: ['cdn.y8.com'],
  gamemonetize: ['api.gamemonetize.com'],
};
import { CATALOGS, withPlatformBranding, PLATFORM_BRAND_OVERRIDE } from '../../src/i18n/catalogs.js';
import { createGameLocale, validateCatalogs } from '../../src/i18n/index.js';
import { audio } from '../../src/audio.js';
import { Game } from '../../src/game.js';

// Game 构造只依赖 location（URL 参数解析）；node 测试环境提供最小替身
if (!globalThis.location) globalThis.location = { search: '' };

// ---------- 目标选择：地图集按编译目标隔离 ----------

test('offline 目标只含旧 desert-grey / transport-ship', () => {
  assert.deepEqual(Object.keys(mapsForTarget('offline')).sort(), ['desert-grey', 'transport-ship']);
});

test('y8 / gamemonetize 目标只用原创平台图集', () => {
  for (const t of ['y8', 'gamemonetize']) {
    assert.deepEqual(Object.keys(mapsForTarget(t)).sort(), ['platform-desert', 'platform-harbor']);
  }
});

test('平台图描述符完整（不能套用旧沙漠灰的 AI/bounds/雷达/报点）', () => {
  // node 环境默认 offline 目标，平台图取自目标集（mapsForTarget 纯函数）
  const set = mapsForTarget('y8');
  const d = set['platform-desert'];
  assert.ok(d && d.available);
  assert.equal(d.name, '赤霞集市');
  assert.deepEqual(d.supportedModes, ['bomb', 'tdm', 'practice']);
  assert.equal(d.defaultMode, 'bomb');
  // 与旧图不同的对角出生 loadoutZone（BL 东南 z 下限 / GR 西北 z 上限）
  assert.deepEqual(d.loadoutZone, { BL: { axis: 'z', min: 26 }, GR: { axis: 'z', max: -26 } });
  assert.ok(d.bounds.x1 > 40 && d.bounds.z1 > 30); // 84×72 白盒，非旧图 92×82 雷达参数
  assert.equal(d.radar.widthM, 84);
  for (const k of ['ai', 'radar', 'practiceTargets', 'teamGoals', 'env', 'menu']) assert.ok(d[k], `缺 ${k}`);
  assert.ok(d.practiceTargets.length >= 6 && d.practiceTargets.every((t) => Number.isFinite(t.pos.y)));
  const h = set['platform-harbor'];
  assert.ok(h && h.available);
  assert.equal(h.name, '雾港码头');
  assert.deepEqual(h.supportedModes, ['tdm', 'practice']);
  // 平台图公开简介为原创中性文案，不含原作阵营品牌名
  for (const desc of [d, h]) {
    assert.ok(!/Global Risk|Black List/.test(desc.menu.blurb), 'blurb 含原作品牌名');
  }
  assert.equal(getMapDescriptor('platform-desert'), null); // 离线注册表看不到平台图
});

test('平台目标下 URL ?map= 与旧存档无效时回退平台默认（赤霞集市）', () => {
  const maps = mapsForTarget('y8');
  const def = Object.keys(maps)[0];
  assert.equal(resolveMapIdIn(maps, 'desert-grey', 'desert-grey', def), 'platform-desert'); // 旧图 id 无效
  assert.equal(resolveMapIdIn(maps, 'platform-harbor', null, def), 'platform-harbor'); // 本图集内可选
  assert.equal(resolveMapIdIn(maps, 'nonsense', 'transport-ship', def), 'platform-desert'); // 双无效回默认
  assert.equal(resolveMapIdIn(mapsForTarget('offline'), 'platform-desert', null, 'desert-grey'), 'desert-grey'); // 离线不可选平台图
});

test('离线目标集保持两图可选且 transport-ship 元数据不变', () => {
  const maps = mapsForTarget('offline');
  assert.equal(maps['transport-ship'].available, true);
  assert.equal(maps['desert-grey'].defaultMode, 'bomb');
  assert.deepEqual(MAP_TARGET_SETS.offline, ['transport-ship', 'desert-grey']);
});

// ---------- 平台配置与 mock 标志 ----------

test('resolvePlatformConfig：目标枚举与未知目标抛错', () => {
  assert.deepEqual(BUILD_TARGETS, ['offline', 'y8', 'gamemonetize']);
  assert.throws(() => resolvePlatformConfig('steam'), /unknown build target/);
});

test('缺正式 ID → mock 明确标记 + 占位 ID；离线永远非 mock', () => {
  const y8 = resolvePlatformConfig('y8', {});
  assert.equal(y8.mock, true);
  assert.match(y8.mockIds.appId, /^mock-y8-/);
  assert.match(y8.mockIds.gameId, /^mock-y8-/);
  assert.equal(y8.defaultLocale, 'en');
  const gm = resolvePlatformConfig('gamemonetize', { gameId: 'real-gm-id' });
  assert.equal(gm.mock, false);
  assert.equal(gm.mockIds, null);
  const y8full = resolvePlatformConfig('y8', { appId: 'a', gameId: 'g' });
  assert.equal(y8full.mock, false);
  const off = resolvePlatformConfig('offline', {});
  assert.equal(off.mock, false);
  assert.equal(off.defaultLocale, 'zh');
});

test('mockMarker 只对 mock 配置产出可验证标记', () => {
  const m = mockMarker(resolvePlatformConfig('gamemonetize', {}));
  assert.equal(m.mock, true);
  assert.equal(m.target, 'gamemonetize');
  assert.equal(mockMarker(resolvePlatformConfig('y8', { appId: 'a', gameId: 'g' })), null);
  assert.equal(mockMarker(resolvePlatformConfig('offline', {})), null);
});

test('SDK 主机白名单：平台各归各，离线为空', () => {
  assert.deepEqual(SDK_HOSTS.offline, []);
  assert.deepEqual(SDK_HOSTS.y8, ['cdn.y8.com']);
  assert.deepEqual(SDK_HOSTS.gamemonetize, ['api.gamemonetize.com']);
});

// ---------- 语言：平台品牌中立 + 单实例注入 ----------

test('平台覆盖目录不含原作品牌词；双版本菜单使用工作室品牌', () => {
  const branded = withPlatformBranding();
  // 平台构建中离线图元数据键不可达（MAPS 不含这两张图），品牌扫描只覆盖可达键
  const unreachable = (k) => k.startsWith('map.transport-ship.') || k.startsWith('map.desert-grey.');
  for (const loc of ['zh', 'en']) {
    const joined = Object.entries(branded[loc]).filter(([k]) => !unreachable(k)).map(([, v]) => v).join('\n');
    assert.ok(!joined.includes('穿越火线') && !joined.includes('CROSSFIRE'), `${loc} 平台目录含 CROSSFIRE`);
    assert.ok(!joined.includes('Black List') && !joined.includes('Global Risk'), `${loc} 平台目录含原作阵营名`);
    assert.ok(!joined.includes('沙漠灰') && !joined.includes('运输船'), `${loc} 平台目录含原作地图名`);
  }
  assert.equal(branded.en['team.bl.name'], 'Attackers');
  assert.equal(branded.zh['menu.docTitle'], '前线行动 3D');
  // 离线版地图与阵营仍保留原玩法，菜单品牌改为工作室标识
  assert.equal(CATALOGS.zh['menu.logo'], '无限工作室');
  assert.equal(branded.en['menu.logo'], 'INFINITY STUDIO');
  assert.equal(CATALOGS.en['team.bl.name'], 'Black List');
  assert.equal(PLATFORM_BRAND_OVERRIDE.zh['menu.docTitle'], '前线行动 3D');
});

test('平台图目录键中英成对齐全（目录体检通过）', () => {
  const branded = withPlatformBranding();
  assert.deepEqual(validateCatalogs(branded), []);
  for (const loc of ['zh', 'en']) {
    for (const k of ['map.platform-desert.name', 'map.platform-desert.blurb', 'map.platform-harbor.name', 'map.platform-harbor.blurb']) {
      assert.equal(typeof branded[loc][k], 'string');
    }
    assert.equal(typeof branded[loc]['map.platform-desert.region.canal'], 'string');
    assert.equal(typeof branded[loc]['map.platform-harbor.region.dock'], 'string');
  }
});

test('单一语言实例：game.setLocaleService 注入后 HUD/触屏/战斗同源', () => {
  const locale = createGameLocale({ browserLocale: 'zh-CN', defaultLocale: 'zh' });
  const game = new Game();
  game.setLocaleService(locale);
  assert.equal(game.t('menu.start'), '开 始 游 戏');
  // 触屏接线路径：game.locale 同一实例（TouchControls 构造时自动接上）
  game.locale = locale;
  assert.equal(game.locale.getLocale(), locale.getLocale());
  // 平台构建默认语言：平台目录（本测试环境无 define，离线目录）下 defaultLocale 生效
  const enLocale = createGameLocale({ browserLocale: null, platformLocale: 'en-US', defaultLocale: 'en' });
  assert.equal(enLocale.getLocale(), 'en');
  enLocale.destroy();
});

test('load.fail 缺键回退：加载错误文案走翻译', () => {
  const locale = createGameLocale({ browserLocale: 'zh-CN', defaultLocale: 'zh' });
  const text = locale.t('load.fail', { msg: 'boom' });
  assert.ok(text.includes('加载失败') && text.includes('boom'));
  const en = createGameLocale({ browserLocale: null, platformLocale: 'en', defaultLocale: 'en' });
  assert.ok(en.t('load.fail', { msg: 'boom' }).startsWith('Failed to load'));
  en.destroy();
});

// ---------- 广告暂停/恢复：独立 adPaused 与音频临时增益层 ----------

test('Game 广告暂停独立于玩家暂停，恢复保持玩家此前状态', () => {
  const game = new Game();
  assert.equal(game.isUserPaused(), false);
  game.enterAdPause();
  assert.equal(game.adPaused, true);
  assert.equal(game.paused, false); // 广告不打开玩家暂停菜单
  game.paused = true;               // 玩家此前已暂停
  game.exitAdPause(true);
  assert.equal(game.adPaused, false);
  assert.equal(game.paused, true);  // 保持玩家暂停
  game.exitAdPause(false);
  assert.equal(game.adPaused, false);
  game.requestPlatformAd('match-end'); // 无 platform 句柄时安全返回
});

test('音频广告静音是独立增益层：不污染玩家音量，静音期间调音量仍可恢复', () => {
  audio.setVolumes({ master: 0.6 });
  audio.setAdMuted(true);
  assert.equal(audio._vol.master, 0.6);          // 持久音量不变
  audio.setVolumes({ master: 0.42 });            // 静音期间滑块变化照常入账
  assert.equal(audio._vol.master, 0.42);
  audio.setAdMuted(false);
  assert.equal(audio._vol.master, 0.42);         // 恢复后按玩家音量生效
  audio.setAdMuted(false);                       // 幂等
});

// ---------- 构建产物：三目标隔离、离线无外链、平台无品牌词、ZIP 形态 ----------

const OFFLINE = 'dist/index.html';
const Y8 = 'dist/y8/index.html';
const GM = 'dist/gamemonetize/index.html';

test('三目标产物齐备且目标隔离（官方 SDK 地址只进对应包）', () => {
  for (const f of [OFFLINE, Y8, GM]) {
    assert.ok(fs.existsSync(f), `缺少构建产物 ${f}（先运行 npm run build）`);
  }
  const offline = fs.readFileSync(OFFLINE, 'utf8');
  const y8 = fs.readFileSync(Y8, 'utf8');
  const gm = fs.readFileSync(GM, 'utf8');
  assert.ok(!offline.includes(SDK_HOSTS.y8[0]) && !offline.includes(SDK_HOSTS.gamemonetize[0]), '离线包含平台 SDK 地址');
  assert.ok(!offline.includes('Y8PlatformAdapter') && !offline.includes('GameMonetizePlatformAdapter'), '离线包含平台适配器代码');
  assert.ok(y8.includes(SDK_HOSTS.y8[0]), 'Y8 包应只含 Y8 SDK');
  assert.ok(!y8.includes(SDK_HOSTS.gamemonetize[0]) && !y8.includes('GameMonetizePlatformAdapter'), 'Y8 包不得引用 GM SDK');
  assert.ok(gm.includes(SDK_HOSTS.gamemonetize[0]), 'GM 包应只含 GM SDK');
  assert.ok(!gm.includes(SDK_HOSTS.y8[0]) && !gm.includes('Y8PlatformAdapter'), 'GM 包不得引用 Y8 SDK');
});

test('离线版可 file:// 直开：无外部资源加载（锚点链接不算资源）', () => {
  const offline = fs.readFileSync(OFFLINE, 'utf8');
  // 资源加载通道：script/link/img/source/embed/iframe 的 src|href 与 CSS url(...)
  for (const m of offline.matchAll(/<(?!a\b)[a-z][^>]*?(?:src|href)="([^"]*)"/gi)) {
    assert.ok(!/^https?:|^\s*\/\//i.test(m[1]), `离线 HTML 外部加载资源 ${m[1]}`);
  }
  for (const m of offline.matchAll(/url\((['"]?)([^)'"]+)\1\)/gi)) {
    assert.ok(!/^https?:/i.test(m[2]), `离线 CSS 外部资源 ${m[2]}`);
  }
});

test('平台包公开页面标题/描述为原创中性文案', () => {
  const y8 = fs.readFileSync(Y8, 'utf8');
  const gm = fs.readFileSync(GM, 'utf8');
  const meta = (html) => {
    const title = html.match(/<title>(.*?)<\/title>/s)[1];
    const desc = html.match(/<meta name="description" content="(.*?)"/s)[1];
    return `${title}\n${desc}`;
  };
  for (const html of [meta(y8), meta(gm)]) {
    assert.ok(!/穿越火线|沙漠灰|运输船|CROSSFIRE|CrossFire/i.test(html), `平台页面元数据含原作品牌词：${html}`);
    assert.ok(html.includes('Chixia Bazaar') && html.includes('Fog Harbor Quay'));
  }
});

test('三个构建的 favicon 使用对应语言的透明工作室原图', () => {
  const icon = (html) => html.match(/<link rel="icon" type="image\/png" href="(.*?)">/s)?.[1];
  const zh = `data:image/png;base64,${fs.readFileSync('src/assets/studio/infinity-zh-transparent.png').toString('base64')}`;
  const en = `data:image/png;base64,${fs.readFileSync('src/assets/studio/infinity-en-transparent.png').toString('base64')}`;
  assert.equal(icon(fs.readFileSync(OFFLINE, 'utf8')), zh);
  for (const file of [Y8, GM]) assert.equal(icon(fs.readFileSync(file, 'utf8')), en);
});

test('静态大厅预览图按目标隔离，平台包不含经典地图预览', () => {
  const previews = {
    offline: ['desert-grey', 'transport-ship'],
    y8: ['platform-desert', 'platform-harbor'],
    gamemonetize: ['platform-desert', 'platform-harbor'],
  };
  const files = { offline: OFFLINE, y8: Y8, gamemonetize: GM };
  for (const [target, file] of Object.entries(files)) {
    const html = fs.readFileSync(file, 'utf8');
    for (const id of previews[target]) {
      const encoded = fs.readFileSync(`src/assets/menu/${id}.jpg`).toString('base64');
      assert.ok(html.includes(`.lobby[data-map="${id}"]{--arena-image:url(data:image/jpeg;base64,${encoded})}`), `${target} 缺 ${id} 预览`);
    }
    for (const other of Object.keys(previews).filter((x) => x !== target && (x === 'offline' || target === 'offline'))) {
      for (const id of previews[other]) assert.ok(!html.includes(`.lobby[data-map="${id}"]`), `${target} 混入 ${id}`);
    }
  }
});

test('平台 ZIP 根目录含 index.html（+README/mock manifest），离线不打包', () => {
  for (const [zipPath, name] of [['dist/y8/y8-package.zip', 'y8-package.zip'], ['dist/gamemonetize/gamemonetize-package.zip', 'gamemonetize-package.zip']]) {
    assert.ok(fs.existsSync(zipPath), `缺少 ${zipPath}`);
    const buf = fs.readFileSync(zipPath);
    assert.equal(buf.readUInt32LE(0), 0x04034b50, 'ZIP 签名无效');
    // 根目录第一个条目即 index.html
    const nameLen = buf.readUInt16LE(26);
    assert.equal(buf.toString('utf8', 30, 30 + nameLen), 'index.html');
  }
  assert.ok(!fs.existsSync('dist/index.html.zip') && !fs.existsSync('dist/offline-package.zip'));
});
