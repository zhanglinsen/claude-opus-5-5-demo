// 真实 CLI 行为在临时目录验证，失败参数不得写入或改写任何产物。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-map-cli-'));
  for (const file of ['src', 'scripts', 'platform-ids.json']) fs.symlinkSync(path.resolve(file), path.join(dir, file));
  const run = (...args) => spawnSync(process.execPath, [path.resolve('build.mjs'), ...args], { cwd: dir, encoding: 'utf8' });
  return { dir, run };
}

test('地图集参数错误、缺值、重复或两种拼写混用在写文件前失败', () => {
  const { dir, run } = fixture();
  try {
    fs.mkdirSync(path.join(dir, 'dist'));
    fs.writeFileSync(path.join(dir, 'dist/index.html'), 'unchanged-canary');
    const cases = [
      ['--map-set=classic', '--map-set=original'],
      ['--map-set=classic', '--map-set=classic'],
      ['--map-set=bad'], ['--map-set='], ['--map-set'],
      ['--maps=bad'], ['--maps='], ['--maps'],
      ['--maps=classic', '--maps=classic'], ['--maps=classic', '--maps=original'],
      ['--map-set=classic', '--maps=classic'], ['--maps=original', '--map-set=classic'],
    ];
    for (const args of cases) {
      const r = run('--target=offline', ...args);
      assert.equal(r.status, 1, args.join(' '));
      assert.match(r.stderr, /--map-set|--maps/);
      assert.equal(fs.readFileSync(path.join(dir, 'dist/index.html'), 'utf8'), 'unchanged-canary');
      assert.deepEqual(fs.readdirSync(path.join(dir, 'dist')), ['index.html']);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('canonical --map-set 与兼容 --maps 都支持 classic/original，未指定默认 classic', () => {
  const { dir, run } = fixture();
  try {
    for (const [args, set] of [
      [[], 'classic'], [['--map-set=classic'], 'classic'], [['--map-set=original'], 'original'],
      [['--maps=classic'], 'classic'], [['--maps=original'], 'original'],
    ]) {
      const r = run('--target=offline', ...args);
      assert.equal(r.status, 0, r.stderr);
      const html = fs.readFileSync(path.join(dir, 'dist/index.html'), 'utf8');
      assert.ok(html.includes(`<meta name="map-set" content="${set}">`), args.join(' '));
      const title = html.match(/<title>(.*?)<\/title>/s)[1];
      assert.match(title, set === 'classic' ? /沙漠灰.*运输船/ : /赤霞集市.*雾港码头/);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

function zipEntries(buf) {
  const entries = new Map();
  let off = 0;
  while (off + 30 <= buf.length && buf.readUInt32LE(off) === 0x04034b50) {
    assert.equal(buf.readUInt16LE(off + 8), 0);
    const size = buf.readUInt32LE(off + 18);
    const nameLen = buf.readUInt16LE(off + 26);
    const extraLen = buf.readUInt16LE(off + 28);
    const name = buf.toString('utf8', off + 30, off + 30 + nameLen);
    const start = off + 30 + nameLen + extraLen;
    entries.set(name, buf.toString('utf8', start, start + size));
    off = start + size;
  }
  return entries;
}

test('两种参数均支持 configured original，实际 ZIP 允许试用且审核/广告仍待验证', () => {
  const { dir, run } = fixture();
  try {
    for (const flag of ['--map-set=original', '--maps=original']) {
      const r = run('--configured', flag);
      assert.equal(r.status, 0, r.stderr);
      for (const [target, zip] of [['y8', 'y8-package.zip'], ['gamemonetize', 'gamemonetize-package.zip']]) {
        const entries = zipEntries(fs.readFileSync(path.join(dir, 'dist/configured', target, zip)));
        const manifest = JSON.parse(entries.get('manifest.json'));
        assert.equal(manifest.mapSet, 'original');
        assert.equal(manifest.mock, false);
        assert.equal(manifest.idsConfigured, true);
        assert.equal(manifest.trialUploadAllowed, true);
        assert.equal(manifest.releaseVerificationPending, true);
        assert.equal(manifest.platformReview, 'pending');
        assert.equal(manifest.adsVerified, false);
        assert.match(entries.get('README.md'), /platform trial upload allowed; release verification pending/i);
        assert.match(entries.get('README.md'), /original.*Chixia Bazaar.*Fog Harbor Quay/);
        assert.ok(!/do not submit.*publicly|non-released classic|asset removal/i.test(JSON.stringify(manifest)));
      }
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
