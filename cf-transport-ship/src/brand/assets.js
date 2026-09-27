// 品牌原图资源（US-01）：三张 175×175 用户原图，字节保持不变。
// esbuild 以 dataurl loader 内联（见 build.mjs loader 配置），运行时无网络请求。
// 原图只读：不得覆盖、缩放或重编码；平台如需其他尺寸，另生成导出文件。
import zhDarkUrl from '../assets/studio/infinity-zh-dark.png';
import zhTransparentUrl from '../assets/studio/infinity-zh-transparent.png';
import enTransparentUrl from '../assets/studio/infinity-en-transparent.png';
import { BRAND_ALT } from './brand-mark.js';

export const BRAND_ASSETS = {
  'zh-dark': { src: zhDarkUrl },
  'zh-transparent': { src: zhTransparentUrl },
  'en-transparent': { src: enTransparentUrl },
};

export { BRAND_ALT };
