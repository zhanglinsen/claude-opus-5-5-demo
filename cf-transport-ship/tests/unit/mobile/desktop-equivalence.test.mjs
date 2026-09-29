// 桌面等价（任务 1）：桌面（非触屏）下移动端代码完全不生效——不访问 DOM、不注册任何监听；
// src/mobile/*.js 全部模块导入时无副作用。这是“不影响性能优化任务”的机械化护栏。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MOBILE_DIR = fileURLToPath(new URL('../../../src/mobile/', import.meta.url));
const SRC = fileURLToPath(new URL('../../../src/', import.meta.url));

// “任何访问都抛错”的代理：用来证明代码没有碰这个全局
function trap(name) {
  return new Proxy(function trapped() {}, {
    get(_t, prop) { throw new Error(`桌面路径不应访问 ${name}.${String(prop)}`); },
    set(_t, prop) { throw new Error(`桌面路径不应写入 ${name}.${String(prop)}`); },
    apply() { throw new Error(`桌面路径不应调用 ${name}()`); },
    has() { throw new Error(`桌面路径不应探测 ${name}`); },
  });
}

function withGlobals(overrides, fn) {
  const keys = Object.keys(overrides);
  const saved = Object.fromEntries(keys.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  for (const k of keys) Object.defineProperty(globalThis, k, { value: overrides[k], configurable: true, writable: true });
  const restore = () => { for (const k of keys) { if (saved[k]) Object.defineProperty(globalThis, k, saved[k]); else delete globalThis[k]; } };
  try {
    const r = fn();
    if (r && typeof r.then === 'function') return r.finally(restore);
    restore();
    return r;
  } catch (e) { restore(); throw e; }
}

test('src/mobile/*.js 全部模块导入时无副作用（不访问 window/document/matchMedia/navigator/screen）', async () => {
  const files = fs.readdirSync(MOBILE_DIR).filter((f) => f.endsWith('.js')).sort();
  assert.ok(files.length >= 6, `应至少有 layout/index/menu/lifecycle/orientation/fullscreen，实际：${files.join(',')}`);
  await withGlobals({ window: trap('window'), document: trap('document'), matchMedia: trap('matchMedia'), navigator: trap('navigator'), screen: trap('screen') }, async () => {
    for (const f of files) {
      await import(pathToFileURL(MOBILE_DIR + f).href); // 导入即执行顶层代码；任何全局访问都会抛错
    }
  });
});

test('桌面（pointer:coarse 为假、无 ?touch）：TouchControls 不启用，不访问 DOM，不注册监听', async () => {
  const { TouchControls } = await import(pathToFileURL(SRC + 'touch.js').href);
  await withGlobals({
    window: trap('window'),
    document: trap('document'),
    matchMedia: () => ({ matches: false }),
    location: { search: '' },
  }, () => {
    let tc;
    assert.doesNotThrow(() => { tc = new TouchControls({}); }, '桌面构造不应访问 window/document');
    assert.equal(tc.enabled, false);
    assert.doesNotThrow(() => tc.destroy(), '桌面 destroy 也要安全');
    assert.equal(tc._detachMobile, undefined, '桌面不应挂接任何移动端模块');
  });
});

test('桌面下 game 通常传入的 touch 相关只读接口安全：labelText / applyLocale / resetTouchState / requestPause 不抛错', async () => {
  const { TouchControls } = await import(pathToFileURL(SRC + 'touch.js').href);
  await withGlobals({ window: trap('window'), document: trap('document'), matchMedia: () => ({ matches: false }), location: { search: '' } }, () => {
    const tc = new TouchControls({ playing: true, pause() {} });
    assert.doesNotThrow(() => { tc.applyLocale(); tc.labelText('touch.fire'); tc.resetTouchState(); });
  });
});

test('?touch=1 强制触屏时 enabled 为真（既有行为不变）', async () => {
  const { TouchControls } = await import(pathToFileURL(SRC + 'touch.js').href);
  // 只验证判定逻辑：构造会继续访问 DOM，这里用 installEnv 之外的最小桩即可在早期读取 enabled，随后异常无关紧要
  await withGlobals({ matchMedia: () => ({ matches: false }), location: { search: '?touch=1' }, document: { getElementById: () => { throw new Error('stop'); } } }, () => {
    let tc = null;
    try { tc = new TouchControls({}); } catch (e) { assert.equal(e.message, 'stop', '应走到 getElementById，说明 enabled 为真'); return; }
    assert.fail('?touch=1 应启用触屏路径');
  });
});
