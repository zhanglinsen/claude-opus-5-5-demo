// 品牌组件稳定公共入口：绑定原图资源与替代文本，供菜单/关于页等后续任务接入。
// 未集成前不触碰 HUD / 菜单 / game.js（由后续整合任务接线）。
import { selectBrandMark, resolveBrandLocale, BRAND_ASSET_IDS, BRAND_DIMENSIONS, BRAND_ALT } from './brand-mark.js';
import { BRAND_ASSETS } from './assets.js';

export { selectBrandMark, resolveBrandLocale, BRAND_ASSET_IDS, BRAND_DIMENSIONS, BRAND_ALT, BRAND_ASSETS };

// 创建绑定资源的品牌组件。
//   getLocale：() => 'zh' | 'en' | 任意 BCP47 标签（可接 LocaleService 的 getLocale）
//   getMark(background) 返回 { id, src, alt, width, height, locale, background }
export function createBrandMark({ getLocale = () => 'zh' } = {}) {
  return {
    getMark(background = 'dark') {
      return selectBrandMark(getLocale(), background, { assets: BRAND_ASSETS, altTexts: BRAND_ALT });
    },
  };
}
