// 构建（Task 11 / US-05）：esbuild 打包 -> 内联到单个 HTML，按编译目标输出。
//   node build.mjs --all                  三个目标全部构建（npm run build）
//   node build.mjs --target=offline       仅离线版 dist/index.html（file:// 可直接打开）
//   node build.mjs --target=y8            Y8 包 dist/y8/index.html + dist/y8/y8-package.zip
//   node build.mjs --target=gamemonetize  GM 包 dist/gamemonetize/index.html + 同名 ZIP
// 目标以 __BUILD_TARGET__ define 注入：minify 将非目标分支整枝剔除，
// 平台适配器与官方 SDK 脚本地址只存在于对应目标的包里（三平台互不交叉）。
// 包内不含任何真实密钥；正式 App/Game ID 由部署页 window.__PLATFORM_IDS__ 注入。
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { makeZip } from './scripts/zip.mjs';

const TARGETS = ['offline', 'y8', 'gamemonetize'];

const argTarget = (() => {
  const a = process.argv.find((s) => s.startsWith('--target='));
  return a ? a.slice('--target='.length) : null;
})();
const all = process.argv.includes('--all');
const dev = process.argv.includes('--dev');
// 无参数且 --dev：离线开发构建（保持旧 dev 循环行为）；无参数：三目标全部构建
const targets = all ? TARGETS : argTarget ? [argTarget] : dev ? ['offline'] : TARGETS;
for (const t of targets) {
  if (!TARGETS.includes(t)) {
    console.error(`unknown build target "${t}" (expected: ${TARGETS.join(' | ')})`);
    process.exit(1);
  }
}

// 公开页面静态元数据：平台版不得出现原作名称/标志性文案；离线版保留原体验
const PAGE_META = {
  offline: {
    title: '沙漠灰 / 运输船 · 穿越火线 3D',
    description: '穿越火线经典地图「沙漠灰」与「运输船」网页 3D 复刻：爆破、团队竞技、练习与 AI 对战。',
  },
  y8: {
    title: 'Chixia Bazaar & Fog Harbor Quay · Frontline Ops 3D',
    description: 'Original web 3D frontline maps: bomb, team deathmatch and practice modes with AI bots. Playable in the browser.',
  },
  gamemonetize: {
    title: 'Chixia Bazaar & Fog Harbor Quay · Frontline Ops 3D',
    description: 'Original web 3D frontline maps: bomb, team deathmatch and practice modes with AI bots. Playable in the browser.',
  },
};

const OUT_DIR = { offline: 'dist', y8: 'dist/y8', gamemonetize: 'dist/gamemonetize' };
const ZIP_NAME = { y8: 'y8-package.zip', gamemonetize: 'gamemonetize-package.zip' };

// 平台包 README（进 ZIP 根目录）：说明包形态与 mock 限制，不要求任何外部运行资产
function packageReadme(target) {
  return `# Frontline Ops 3D — ${target} package

## Upload
Extract nothing: upload \`index.html\` (this ZIP's root) as-is to the ${target === 'y8' ? 'Y8' : 'GameMonetize'} dashboard.
The package is fully self-contained (JS/CSS/textures inlined; PNG assets are data URLs) — no external runtime assets are required.

## Mock mode / credentials
This package contains **no real App ID / Game ID**. At runtime the host page may inject credentials:

    <script>window.__PLATFORM_IDS__ = { appId: "…", gameId: "…" };</script>

Without injected credentials the game runs in **explicit mock mode** (offline ads, no platform SDK
requests) and marks itself: \`window.__PLATFORM_MOCK__\`, \`<html data-platform-mock="true">\`.
A mock-marked build must NOT be submitted as a release build.

## Isolation
This ${target} build loads only the official ${target} SDK; no other platform's SDK is referenced.
`;
}

const tpl = fs.readFileSync('src/index.html', 'utf8');
const css = fs.readFileSync('src/style.css', 'utf8');

for (const target of targets) {
  const res = await esbuild.build({
    entryPoints: ['src/main.js'],
    bundle: true,
    format: 'iife',
    minify: !dev,
    sourcemap: false,
    target: ['es2020'],
    write: false,
    legalComments: 'none',
    loader: { '.png': 'dataurl' },
    define: {
      'process.env.NODE_ENV': '"production"',
      __BUILD_TARGET__: JSON.stringify(target),
    },
  });
  const js = res.outputFiles[0].text;
  let html = tpl.replace('/*__CSS__*/', () => css).replace('/*__JS__*/', () => js.replace(/<\/script>/g, '<\\/script>'));
  if (target !== 'offline') {
    const meta = PAGE_META[target];
    html = html
      .replace(/<title>.*?<\/title>/s, `<title>${meta.title}</title>`)
      .replace(/(<meta name="description" content=").*?(">)/s, `$1${meta.description}$2`);
  }
  const dir = OUT_DIR[target];
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  console.log(`built ${dir}/index.html (${target})`, (html.length / 1024).toFixed(1) + ' KB');

  // 平台 ZIP：根目录 index.html（+ README/mock manifest）；离线版不打包
  if (target !== 'offline') {
    const zip = makeZip([
      { name: 'index.html', data: html },
      { name: 'README.md', data: packageReadme(target) },
      {
        name: 'manifest.json',
        data: JSON.stringify({ target, mock: true, note: 'No real App/Game ID embedded — inject via window.__PLATFORM_IDS__.', generatedAt: new Date().toISOString() }, null, 2) + '\n',
      },
    ]);
    fs.writeFileSync(path.join(dir, ZIP_NAME[target]), zip);
    console.log(`built ${dir}/${ZIP_NAME[target]}`, (zip.length / 1024).toFixed(1) + ' KB');
  }
}
