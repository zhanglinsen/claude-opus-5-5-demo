// 构建（Task 11 / US-05）：esbuild 打包 -> 内联到单个 HTML，按编译目标输出。
//   node build.mjs --all                  三个目标全部构建（npm run build）
//   node build.mjs --target=offline       仅离线版 dist/index.html（file:// 可直接打开）
//   node build.mjs --target=y8            Y8 包 dist/y8/index.html + dist/y8/y8-package.zip
//   node build.mjs --target=gamemonetize  GM 包 dist/gamemonetize/index.html + 同名 ZIP
//   node build.mjs --configured           正式 ID 配置构建（npm run build:configured）：
//                                         从 platform-ids.json 读取本游戏公开客户端 ID，
//                                         只产出 dist/configured/{y8,gamemonetize} 两套
//                                         HTML+ZIP；在游戏主脚本前内联 window.__PLATFORM_IDS__，
//                                         默认三目标 mock 产物不写不动。ID 缺失/为空在
//                                         构建期明确失败，绝不产出伪正式包。
//                                         与 --all/--dev/--target= 混用直接失败（见下）。
// 目标以 __BUILD_TARGET__ define 注入：minify 将非目标分支整枝剔除，
// 平台适配器与官方 SDK 脚本地址只存在于对应目标的包里（三平台互不交叉）。
// 默认三构建包内不含任何真实平台 ID；--configured 包内联公开客户端 ID（非服务端密钥）。
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { makeZip } from './scripts/zip.mjs';
import { loadPlatformIds } from './scripts/platform-ids.mjs';

const TARGETS = ['offline', 'y8', 'gamemonetize'];
const CONFIGURED_TARGETS = ['y8', 'gamemonetize'];

const argTarget = (() => {
  const a = process.argv.find((s) => s.startsWith('--target='));
  return a ? a.slice('--target='.length) : null;
})();
const all = process.argv.includes('--all');
const dev = process.argv.includes('--dev');
const configured = process.argv.includes('--configured');
// --configured 与其他目标选择参数互斥：混用在写任何文件前明确失败（而非悄悄优先），
// 避免覆盖默认三目标产物，或经 --dev 产出未压缩的配置包。
if (configured) {
  const conflicts = [all && '--all', dev && '--dev', argTarget != null && `--target=${argTarget}`].filter(Boolean);
  if (conflicts.length) {
    console.error(`--configured 不能与 ${conflicts.join(' / ')} 混用：配置构建只产出 dist/configured/{y8,gamemonetize}`);
    process.exit(1);
  }
}
// 无参数且 --dev：离线开发构建（保持旧 dev 循环行为）；无参数：三目标全部构建。
const targets = configured
  ? CONFIGURED_TARGETS
  : all ? TARGETS : argTarget ? [argTarget] : dev ? ['offline'] : TARGETS;
let configuredIds = null;
if (configured) {
  configuredIds = loadPlatformIds(path.resolve('platform-ids.json'));
}
for (const t of targets) {
  if (!TARGETS.includes(t)) {
    console.error(`unknown build target "${t}" (expected: ${TARGETS.join(' | ')})`);
    process.exit(1);
  }
}

// 公开页面静态元数据：平台版不得出现原作名称/标志性文案；离线版保留原地图名称。
const PAGE_META = {
  offline: {
    title: '沙漠灰 / 运输船 · 前线行动 3D',
    description: '前线行动 3D：沙漠灰与运输船双地图，支持爆破、团队竞技、练习及 AI 对战。',
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
const FAVICON_FILE = {
  offline: 'src/assets/studio/infinity-zh-transparent.png',
  y8: 'src/assets/studio/infinity-en-transparent.png',
  gamemonetize: 'src/assets/studio/infinity-en-transparent.png',
};

// 配置包 manifest：如实标记——ID 已配置（mock=false），但真实平台审核/广告未验证、
// 且平台包仍内嵌未开放的经典地图数据，两者都不允许作为可提交版对外发布。
function configuredManifest(target, ids) {
  return {
    target,
    mock: false,
    idsConfigured: true,
    ids: { ...ids },
    platformReview: 'pending',
    adsVerified: false,
    submissionAllowed: false,
    blockers: [
      'Real platform SDK review / ad serving not yet verified with the platform dashboard — do not submit this package publicly.',
      'This platform build still embeds non-released classic map data; asset removal is a separate pending task.',
    ],
    generatedAt: new Date().toISOString(),
  };
}

// 配置包 README（进 ZIP 根目录）：ID 已内联（无需宿主注入）、mock=false、
// 仍不可提交的如实说明。与默认 mock 包 README（"no real App ID"）措辞刻意区分。
function configuredPackageReadme(target, ids) {
  const idLines = target === 'y8'
    ? `- Y8 App ID: \`${ids.appId}\`\n- Y8 Game ID: \`${ids.gameId}\``
    : `- GameMonetize Game ID: \`${ids.gameId}\``;
  return `# Frontline Ops 3D — ${target} package (platform IDs configured)

## Upload
Extract nothing: upload \`index.html\` (this ZIP's root) as-is to the ${target === 'y8' ? 'Y8' : 'GameMonetize'} dashboard.
The package is fully self-contained (JS/CSS/textures inlined; PNG assets are data URLs) — no external runtime assets are required.

## Credentials (configured, mock = false)
This package embeds this game's public platform client IDs inline: \`window.__PLATFORM_IDS__\` is set by
an inline script placed **before** the game script, so no host-page injection is required or expected:
${idLines}
These are public browser-side SDK IDs, not server secrets. \`mock = false\`: the real platform adapter
is created at runtime (SDK failure still degrades safely to offline behavior).

## Status — NOT for public submission
- Real platform SDK review and ad serving have NOT been verified on the platform dashboard yet.
- Ads are only requested at natural breakpoints (match end / menu return); no ad is requested at load time.
- This platform build still embeds non-released classic map data; asset removal is a separate pending task.

## Isolation
This ${target} build loads only the official ${target} SDK; no other platform's SDK is referenced.
`;
}

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
  // 配置包：在游戏主脚本之前内联 window.__PLATFORM_IDS__（上传后平台宿主页不注入 ID）。
  // `<` 转义防 </script> 提前闭合；注入点即模板中主 <script> 标签原位前插。
  let page = configured
    ? tpl.replace('<script>/*__JS__*/</script>', () => `<script>window.__PLATFORM_IDS__=${
      JSON.stringify(configuredIds[target]).replace(/</g, '\\u003c')
    };</script><script>/*__JS__*/</script>`)
    : tpl;
  const favicon = `data:image/png;base64,${fs.readFileSync(FAVICON_FILE[target]).toString('base64')}`;
  let html = page
    .replace('/*__FAVICON__*/', () => favicon)
    .replace('/*__CSS__*/', () => css)
    .replace('/*__JS__*/', () => js.replace(/<\/script>/g, '<\\/script>'));
  if (target !== 'offline') {
    const meta = PAGE_META[target];
    html = html
      .replace(/<title>.*?<\/title>/s, `<title>${meta.title}</title>`)
      .replace(/(<meta name="description" content=").*?(">)/s, `$1${meta.description}$2`);
  }
  const dir = configured ? path.join('dist', 'configured', target) : OUT_DIR[target];
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  console.log(`built ${dir}/index.html (${target}${configured ? ', configured' : ''})`, (html.length / 1024).toFixed(1) + ' KB');

  // 平台 ZIP：根目录 index.html（+ README/manifest）；离线版不打包
  if (target !== 'offline') {
    const readme = configured ? configuredPackageReadme(target, configuredIds[target]) : packageReadme(target);
    const manifest = configured
      ? JSON.stringify(configuredManifest(target, configuredIds[target]), null, 2) + '\n'
      : JSON.stringify({ target, mock: true, note: 'No real App/Game ID embedded — inject via window.__PLATFORM_IDS__.', generatedAt: new Date().toISOString() }, null, 2) + '\n';
    const zip = makeZip([
      { name: 'index.html', data: html },
      { name: 'README.md', data: readme },
      { name: 'manifest.json', data: manifest },
    ]);
    fs.writeFileSync(path.join(dir, ZIP_NAME[target]), zip);
    console.log(`built ${dir}/${ZIP_NAME[target]}`, (zip.length / 1024).toFixed(1) + ' KB');
    if (configured) {
      console.warn(`[configured] ${target}: 已内联本游戏公开平台 ID（mock=false）。真实平台审核/广告未验证，且包内仍含未开放经典地图数据——此包不可作为公开提交版。`);
    }
  }
}
