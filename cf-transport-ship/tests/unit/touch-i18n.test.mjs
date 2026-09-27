// 触屏按钮本地化单元测试（Task 9 / US-02，node --test）
// 契约：
//  - TouchControls 五个按钮标签（开火/跳/蹲/切/镜，含副开火共 6 个 DOM）走 touch.* 稳定键；
//  - 老调用（无语言服务、无 game.t）保持中文默认，行为与历史版本一致；
//  - 注入 LocaleService（构造时 game.locale 或事后 setLocaleService）后，语言切换即时刷新按钮；
//  - 订阅与销毁成对：替换服务先退订旧的，destroy() 后不再刷新。
import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGS, createLocaleService } from '../../src/i18n/index.js';
import { TouchControls } from '../../src/touch.js';

// ---------- 最小 DOM 桩：只覆盖 touch.js 构造路径用到的表面 ----------

function makeEl() {
  const el = {
    className: '', style: {}, textContent: '',
    listeners: new Map(), children: [],
    addEventListener(type, fn) {
      if (!el.listeners.has(type)) el.listeners.set(type, []);
      el.listeners.get(type).push(fn);
    },
    appendChild(child) { el.children.push(child); },
    append(...kids) { el.children.push(...kids); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 140, height: 140 }; },
    classList: { remove() {} },
  };
  return el;
}

function withDom(rootChildren) {
  const root = makeEl();
  const created = [];
  globalThis.document = {
    getElementById: (id) => (id === 'touch' ? root : null),
    createElement: () => { const e = makeEl(); created.push(e); return e; },
  };
  globalThis.window = { innerWidth: 900, innerHeight: 600, addEventListener() {} };
  globalThis.matchMedia = () => ({ matches: true });
  globalThis.location = { search: '' };
  return { root, created };
}

// 构造后按初始中文文案抓出 6 个可本地化按钮（开火×2、跳、蹲、切、镜）
function zhButtons() {
  const game = {};
  withDom();
  const tc = new TouchControls(game);
  const find = (text) => {
    const hits = [];
    const walk = (el) => { if (el.textContent === text) hits.push(el); (el.children || []).forEach(walk); };
    walk(globalThis.document.getElementById('touch'));
    return hits;
  };
  return { tc, fire: find('开火'), jump: find('跳'), crouch: find('蹲'), swap: find('切'), scope: find('镜') };
}

const EN = { fire: 'FIRE', jump: 'JUMP', crouch: 'CROUCH', swap: 'SWAP', scope: 'SCOPE' };
const enSvc = () => createLocaleService({ catalogs: CATALOGS, storage: null, browserLocale: 'en-US', defaultLocale: 'zh' });

// ---------- 老调用：无语言服务 → 保持中文 ----------

test('无语言服务构造：五个按钮标签保持中文（回归）', () => {
  const { tc, fire, jump, crouch, swap, scope } = zhButtons();
  assert.equal(tc.enabled, true);
  assert.equal(fire.length, 2); // 主开火 + 副开火
  assert.equal(fire[0].textContent, '开火');
  assert.equal(jump.length, 1);
  assert.equal(crouch[0].textContent, '蹲');
  assert.equal(swap[0].textContent, '切');
  assert.equal(scope[0].textContent, '镜');
  tc.destroy?.(); // 老调用无订阅，destroy 可选存在且安全
});

// ---------- 构造时经 game.locale 注入 en 服务 ----------

test('构造时 game.locale 为 en：按钮初始即英文', () => {
  const svc = enSvc();
  globalThis.document = undefined;
  withDom();
  const tc = new TouchControls({ locale: svc });
  const texts = tc._labeled.map((x) => x.el.textContent);
  assert.deepEqual(texts, [EN.fire, EN.fire, EN.jump, EN.crouch, EN.swap, EN.scope]);
});

// ---------- 即时切换：运行中 setLocale 不重建 DOM 即刷新 ----------

test('语言切换即时刷新按钮（zh → en → zh），不重建 DOM', () => {
  const { tc, fire, swap } = zhButtons();
  tc.setLocaleService(enSvc());
  assert.equal(fire[0].textContent, EN.fire);
  const svcZh = createLocaleService({ catalogs: CATALOGS, storage: null, defaultLocale: 'zh' });
  tc.setLocaleService(svcZh);
  assert.equal(fire[0].textContent, '开火');
  assert.equal(swap[0].textContent, '切');
  svcZh.setLocale('en'); // 运行中切换 → 订阅回调即时刷新
  assert.equal(fire[0].textContent, EN.fire);
  assert.equal(swap[0].textContent, EN.swap);
  svcZh.setLocale('zh');
  assert.equal(fire[0].textContent, '开火');
});

// ---------- 替换/销毁：订阅成对，旧服务不再触发刷新 ----------

test('setLocaleService 替换服务：旧服务切换不再生效；destroy 后不再刷新', () => {
  const { tc, scope } = zhButtons();
  const svcA = enSvc(), svcB = enSvc();
  tc.setLocaleService(svcA);
  assert.equal(scope[0].textContent, EN.scope);
  tc.setLocaleService(svcB); // 替换时应先退订 A
  svcA.setLocale('zh');
  assert.equal(scope[0].textContent, EN.scope); // A 已退订，其切换不影响按钮
  svcB.setLocale('zh');
  assert.equal(scope[0].textContent, '镜'); // B 接管刷新
  tc.destroy();
  svcB.setLocale('en');
  assert.equal(scope[0].textContent, '镜'); // 销毁后不再刷新
});

// ---------- game.t 兼容：无语言服务但有 game.t 时构造期翻译 ----------

test('无服务但 game.t 存在：构造期经 game.t 取标签', () => {
  globalThis.document = undefined;
  withDom();
  const tc = new TouchControls({ t: (k) => (CATALOGS.en[k] ?? k) });
  const texts = tc._labeled.map((x) => x.el.textContent);
  assert.deepEqual(texts, [EN.fire, EN.fire, EN.jump, EN.crouch, EN.swap, EN.scope]);
});
