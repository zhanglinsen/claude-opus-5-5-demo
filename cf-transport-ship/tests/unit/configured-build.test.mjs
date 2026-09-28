// 正式平台 ID 配置构建（npm run build:configured）聚焦测试：
// 配置层校验（缺失/空 ID 构建期明确失败）、configured 双包产物路径、ID 内联与隔离、
// manifest 如实标记（mock=false、审核未完成、不可提交）、ZIP 根目录 index.html、
// 默认三构建 mock 包不被覆盖。构建产物段（后半）依赖先运行：
//   npm run build && node build.mjs --configured
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { parsePlatformIds, loadPlatformIds } from '../../scripts/platform-ids.mjs';

// 公开客户端 ID（平台 SDK 浏览器端使用，非服务端密钥；与 platform-ids.json 一致）
const REAL = {
  y8App: '6aba62bc25efe452cfc6c1b2',
  y8Game: '284915',
  gmGame: '6ju85rfh4ie5stg3q5xpw52cftpwcqsa',
};

// ---------- 配置层：platform-ids.json 校验（纯函数，node 可测） ----------

test('parsePlatformIds：三项 ID 齐全时按目标归位（y8 双 ID / GM 单 ID）', () => {
  const ids = parsePlatformIds({
    y8: { appId: REAL.y8App, gameId: REAL.y8Game },
    gamemonetize: { gameId: REAL.gmGame },
  });
  assert.deepEqual(ids.y8, { appId: REAL.y8App, gameId: REAL.y8Game });
  assert.deepEqual(ids.gamemonetize, { gameId: REAL.gmGame });
});

test('parsePlatformIds：缺失/空/非字符串 ID 明确失败，字段可定位（不产伪正式包）', () => {
  assert.throws(() => parsePlatformIds(null), /platform-ids/);
  assert.throws(() => parsePlatformIds({}), /y8/);
  assert.throws(
    () => parsePlatformIds({ y8: { appId: '', gameId: REAL.y8Game }, gamemonetize: { gameId: REAL.gmGame } }),
    /y8\.appId/,
  );
  assert.throws(
    () => parsePlatformIds({ y8: { appId: REAL.y8App, gameId: REAL.y8Game } }),
    /gamemonetize\.gameId/,
  );
  assert.throws(
    () => parsePlatformIds({ y8: { appId: REAL.y8App, gameId: REAL.y8Game }, gamemonetize: { gameId: 123 } }),
    /gamemonetize\.gameId/,
  );
});

test('loadPlatformIds：从仓库根读取真实 platform-ids.json', () => {
  const ids = loadPlatformIds(path.resolve('platform-ids.json'));
  assert.equal(ids.y8.appId, REAL.y8App);
  assert.equal(ids.y8.gameId, REAL.y8Game);
  assert.equal(ids.gamemonetize.gameId, REAL.gmGame);
});

// ---------- 构建期参数冲突：--configured 与其他目标选择互斥（写文件前失败） ----------

test('build.mjs --configured 与 --dev/--all/--target= 混用：非零退出、点名互斥、产物不被重写', () => {
  const canary = 'dist/configured/y8/index.html';
  const before = fs.readFileSync(canary);
  for (const extra of ['--dev', '--all', '--target=y8']) {
    const r = spawnSync(process.execPath, ['build.mjs', '--configured', extra], { encoding: 'utf8' });
    assert.equal(r.status, 1, `--configured ${extra} 应非零退出`);
    assert.match(r.stderr, /--configured/, `--configured ${extra} 的报错应点名互斥`);
    assert.ok(r.stderr.includes(extra), `报错应指明冲突参数 ${extra}`);
  }
  assert.deepEqual(fs.readFileSync(canary), before, '冲突失败发生在写文件前，配置包产物不得被重写');
});

// ---------- 构建产物：configured 双包（依赖 node build.mjs --configured 先行） ----------

const Y8_CONFIGURED = 'dist/configured/y8/index.html';
const GM_CONFIGURED = 'dist/configured/gamemonetize/index.html';

// 仓库 zip.mjs 为 store（不压缩）格式：按本地文件头顺序平铺，可直接顺序解出条目
function zipEntries(buf) {
  const entries = new Map();
  let off = 0;
  while (off + 30 <= buf.length && buf.readUInt32LE(off) === 0x04034b50) {
    const method = buf.readUInt16LE(off + 8);
    const size = buf.readUInt32LE(off + 18);
    const nameLen = buf.readUInt16LE(off + 26);
    const extraLen = buf.readUInt16LE(off + 28);
    const name = buf.toString('utf8', off + 30, off + 30 + nameLen);
    if (method !== 0) throw new Error(`zip 条目 ${name} 意外压缩，测试解析器只支持 store`);
    const dataStart = off + 30 + nameLen + extraLen;
    entries.set(name, buf.toString('utf8', dataStart, dataStart + size));
    off = dataStart + size;
  }
  return entries;
}

test('configured 只生成 y8/gamemonetize 两套 HTML+ZIP（不落 offline、不动默认产物路径）', () => {
  for (const f of [
    Y8_CONFIGURED,
    GM_CONFIGURED,
    'dist/configured/y8/y8-package.zip',
    'dist/configured/gamemonetize/gamemonetize-package.zip',
  ]) {
    assert.ok(fs.existsSync(f), `缺少 ${f}（先运行 node build.mjs --configured）`);
  }
  assert.deepEqual(fs.readdirSync('dist/configured').sort(), ['gamemonetize', 'y8']);
  assert.ok(!fs.existsSync('dist/configured/index.html'));
  assert.ok(!fs.existsSync('dist/configured/y8/y8-package.zip.tmp'));
});

test('ID 内联在主脚本之前，且各包只含自己目标的 ID（y8 双 ID / GM 单 ID 互不交叉）', () => {
  const y8 = fs.readFileSync(Y8_CONFIGURED, 'utf8');
  const gm = fs.readFileSync(GM_CONFIGURED, 'utf8');
  for (const html of [y8, gm]) {
    const idsAt = html.indexOf('window.__PLATFORM_IDS__=');
    assert.ok(idsAt >= 0, '未内联 window.__PLATFORM_IDS__');
    const mainScriptAt = html.lastIndexOf('<script>');
    assert.ok(idsAt < mainScriptAt, 'PLATFORM_IDS 注入必须先于游戏主脚本');
  }
  // Y8 包：只含自己的 App/Game ID，不含 GM Game ID
  assert.ok(y8.includes(REAL.y8App) && y8.includes(REAL.y8Game), 'Y8 包缺自己的 ID');
  assert.ok(!y8.includes(REAL.gmGame), 'Y8 包不得含 GM Game ID');
  // GM 包：只含自己的 Game ID，不含 Y8 双 ID
  assert.ok(gm.includes(REAL.gmGame), 'GM 包缺自己的 Game ID');
  assert.ok(!gm.includes(REAL.y8App) && !gm.includes(REAL.y8Game), 'GM 包不得含 Y8 ID');
});

test('configured manifest/README 如实标记：mock=false、ID 已配置、审核未完成、不可提交（含经典图数据原因）', () => {
  for (const [zipPath, target] of [
    ['dist/configured/y8/y8-package.zip', 'y8'],
    ['dist/configured/gamemonetize/gamemonetize-package.zip', 'gamemonetize'],
  ]) {
    const entries = zipEntries(fs.readFileSync(zipPath));
    assert.ok(entries.has('index.html') && entries.has('README.md') && entries.has('manifest.json'));
    const manifest = JSON.parse(entries.get('manifest.json'));
    assert.equal(manifest.target, target);
    assert.equal(manifest.mock, false);
    assert.equal(manifest.idsConfigured, true);
    assert.equal(manifest.submissionAllowed, false);
    assert.equal(manifest.adsVerified, false);
    const blockers = (manifest.blockers || []).join('\n');
    assert.match(blockers, /review/i, 'manifest 应写明平台审核未完成');
    assert.match(blockers, /classic map/i, 'manifest 应写明仍内嵌未开放经典地图数据');
    const readme = entries.get('README.md');
    assert.match(readme, /mock = false/i);
    assert.match(readme, /NOT for public submission/i);
    assert.match(readme, /natural breakpoints/i, 'README 应写明广告只在自然断点请求');
  }
  // manifest 携带的 ID 与目标一致：y8 双 ID / GM 单 ID
  const y8m = JSON.parse(zipEntries(fs.readFileSync('dist/configured/y8/y8-package.zip')).get('manifest.json'));
  assert.deepEqual(y8m.ids, { appId: REAL.y8App, gameId: REAL.y8Game });
  const gmm = JSON.parse(zipEntries(fs.readFileSync('dist/configured/gamemonetize/gamemonetize-package.zip')).get('manifest.json'));
  assert.deepEqual(gmm.ids, { gameId: REAL.gmGame });
});

test('configured ZIP 根目录第一项即 index.html（平台上传约定）', () => {
  for (const zipPath of ['dist/configured/y8/y8-package.zip', 'dist/configured/gamemonetize/gamemonetize-package.zip']) {
    const buf = fs.readFileSync(zipPath);
    assert.equal(buf.readUInt32LE(0), 0x04034b50, 'ZIP 签名无效');
    const nameLen = buf.readUInt16LE(26);
    assert.equal(buf.toString('utf8', 30, 30 + nameLen), 'index.html');
  }
});

test('默认 mock 三构建不被覆盖：产物仍在原位、无 PLATFORM_IDS 内联、不含真实 ID、manifest 仍 mock:true', () => {
  for (const f of ['dist/index.html', 'dist/y8/index.html', 'dist/gamemonetize/index.html']) {
    assert.ok(fs.existsSync(f), `缺少默认产物 ${f}（先运行 npm run build）`);
  }
  const offline = fs.readFileSync('dist/index.html', 'utf8');
  const y8mock = fs.readFileSync('dist/y8/index.html', 'utf8');
  const gmmock = fs.readFileSync('dist/gamemonetize/index.html', 'utf8');
  for (const [name, html] of [['offline', offline], ['y8', y8mock], ['gamemonetize', gmmock]]) {
    // main.js 运行时本就会"读取" window.__PLATFORM_IDS__（宿主注入路径）；默认包
    // 不得出现的是构建期内联赋值（--configured 注入形如 window.__PLATFORM_IDS__=…）
    assert.ok(!html.includes('window.__PLATFORM_IDS__='), `默认 ${name} 包不应内联注入 PLATFORM_IDS`);
    for (const id of [REAL.y8App, REAL.y8Game, REAL.gmGame]) {
      assert.ok(!html.includes(id), `默认 ${name} 包不得含真实 ID`);
    }
  }
  // mock ZIP manifest 仍为 mock:true 且不含真实 ID（store 格式直读）
  const y8zip = fs.readFileSync('dist/y8/y8-package.zip').toString('utf8');
  assert.ok(y8zip.includes('"mock": true'), '默认 Y8 包 manifest 应仍标 mock:true');
  assert.ok(!y8zip.includes(REAL.y8App) && !y8zip.includes(REAL.gmGame));
  const gmzip = fs.readFileSync('dist/gamemonetize/gamemonetize-package.zip').toString('utf8');
  assert.ok(gmzip.includes('"mock": true'), '默认 GM 包 manifest 应仍标 mock:true');
  assert.ok(!gmzip.includes(REAL.gmGame));
});
