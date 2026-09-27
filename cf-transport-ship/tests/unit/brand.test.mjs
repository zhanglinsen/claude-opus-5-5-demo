// 品牌资源选择（US-01）单元测试（node --test）
// 纯选择逻辑走 selectBrandMark；原图完整性（SHA-256 / 175×175 / alpha）用 fs 直接核对字节。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { selectBrandMark, resolveBrandLocale, BRAND_ASSET_IDS, BRAND_DIMENSIONS } from '../../src/brand/brand-mark.js';

const ASSET_DIR = fileURLToPath(new URL('../../src/assets/studio/', import.meta.url));

// 三张原图的字节指纹（与保存记录一致；改动任何字节都视为覆盖原图）
const SHA256 = {
  'infinity-zh-dark.png': '40d3e15ac09fce8eeba2d807d902b133253cf1c3ce26f04fc291e8ab0881ed7e',
  'infinity-zh-transparent.png': 'e3b501cdd8094af1fbbf7ab621c1d520cc89d4424da242666252cd8b82fe7f45',
  'infinity-en-transparent.png': 'f5520a66b78efff0400800efa6e65e105b2a7dfeef371cd82afe77a47a4b74d0',
};

function ihdr(buf) {
  // PNG 签名 8 字节 + IHDR 长度/类型 8 字节 → 宽 16..20、高 20..24、位深 24、颜色类型 25
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bitDepth: buf[24], colorType: buf[25] };
}

test('三张原图字节未动：SHA-256 与保存记录一致', () => {
  for (const [name, expected] of Object.entries(SHA256)) {
    const buf = readFileSync(ASSET_DIR + name);
    const actual = createHash('sha256').update(buf).digest('hex');
    assert.equal(actual, expected, `${name} 的字节与保存记录不符`);
  }
});

test('三张原图均为 175×175；两张透明图为 RGBA（colorType 6）', () => {
  for (const name of Object.keys(SHA256)) {
    const info = ihdr(readFileSync(ASSET_DIR + name));
    assert.equal(info.width, 175, `${name} 宽度`);
    assert.equal(info.height, 175, `${name} 高度`);
    assert.equal(info.bitDepth, 8, `${name} 位深`);
    if (name.includes('transparent')) assert.equal(info.colorType, 6, `${name} 应保留 alpha 通道`);
  }
  assert.deepEqual(BRAND_DIMENSIONS, { width: 175, height: 175 });
});

// ── 选择逻辑：语言 × 背景 → 资源 + 替代文本 ──────────────

const ASSETS = Object.fromEntries(BRAND_ASSET_IDS.map((id) => [id, { src: `data:${id}` }]));
const ALT = { zh: '无限工作室标志', en: 'Infinity studio logo' };
const OPTS = { assets: ASSETS, altTexts: ALT };

test('中文界面按背景选深底/透明，英文界面统一英文透明', () => {
  assert.equal(selectBrandMark('zh', 'dark', OPTS).id, 'zh-dark');
  assert.equal(selectBrandMark('zh', 'transparent', OPTS).id, 'zh-transparent');
  assert.equal(selectBrandMark('en', 'dark', OPTS).id, 'en-transparent');
  assert.equal(selectBrandMark('en', 'transparent', OPTS).id, 'en-transparent');
});

test('区域变体解析到主语言；未知语言安全回退默认中文', () => {
  assert.equal(resolveBrandLocale('zh-CN'), 'zh');
  assert.equal(resolveBrandLocale('en-US'), 'en');
  assert.equal(resolveBrandLocale('ZH-hans'), 'zh');
  assert.equal(resolveBrandLocale('fr-FR'), 'zh'); // 未知 → 默认
  assert.equal(selectBrandMark('zh-CN', 'dark', OPTS).id, 'zh-dark');
  const fr = selectBrandMark('fr-FR', 'transparent', OPTS);
  assert.equal(fr.id, 'zh-transparent');
  assert.equal(fr.locale, 'zh');
  // 垃圾输入/非字符串同样回退，不抛异常
  assert.equal(selectBrandMark('', 'dark', OPTS).id, 'zh-dark');
  assert.equal(selectBrandMark(null, 'dark', OPTS).id, 'zh-dark');
});

test('返回值带替代文本、尺寸与实际 src', () => {
  const m = selectBrandMark('zh', 'dark', OPTS);
  assert.equal(m.alt, '无限工作室标志');
  assert.deepEqual({ width: m.width, height: m.height }, { width: 175, height: 175 });
  assert.equal(m.src, 'data:zh-dark');
  const en = selectBrandMark('en', 'transparent', OPTS);
  assert.equal(en.alt, 'Infinity studio logo');
});

test('深底资源缺失时回退中文透明；alt 缺失时安全兜底', () => {
  const noDark = { assets: { 'zh-transparent': ASSETS['zh-transparent'], 'en-transparent': ASSETS['en-transparent'] }, altTexts: ALT };
  assert.equal(selectBrandMark('zh', 'dark', noDark).id, 'zh-transparent');
  const noAlt = { assets: ASSETS, altTexts: {} };
  assert.equal(selectBrandMark('zh', 'dark', noAlt).alt, '');
});
