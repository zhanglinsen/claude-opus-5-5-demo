// 平台语言宿主桥接（Task 11 集成审核 P1 修复）。
// 问题：适配器在 SDK init 前的 language 是内部 fallback（Y8 为 'zh-cn'），不是真实
// 平台语言——主控若直接以 () => adapter.language 作 platformLocale，浏览器 en 的
// 玩家会初始显示 zh，且 SDK 就绪后真实平台语言不再触发自动档重解析。
//
// 契约：
//   - platformLocale()：就绪前返回 null（i18n 层跳过平台级 → 浏览器语言 → 构建默认）；
//     就绪后返回适配器真实平台语言。内部 fallback 绝不由此泄漏。
//   - attach(handle, locale)：平台 ready 成功（handle.ready resolve true）后，
//     仅当语言仍在自动档（locale.isAuto()）时以 setLocale('') 重解析一次
//     （玩家保存 > 平台 > 浏览器 > 构建默认）并通知订阅者（HUD/触屏）；
//     玩家已显式选择语言则绝不覆盖；ready 失败保持浏览器/默认。
//
// 主控接线（src/main.js）：
//   const bridge = createPlatformLocaleBridge({ getLanguage: () => adapter.language });
//   const locale = createGameLocale({ platformLocale: bridge.platformLocale, ... });
//   bridge.attach(platform, locale);
//
// 本模块不依赖 i18n 与具体适配器：locale 只需 isAuto/setLocale，handle 只需 ready。
// 依赖注入便于 Node 单测（见 tests/unit/locale-bridge.test.mjs）。

export function createPlatformLocaleBridge({ getLanguage } = {}) {
  if (typeof getLanguage !== 'function') {
    throw new TypeError('createPlatformLocaleBridge: getLanguage 必须是 () => string 的取词函数');
  }
  let ready = false;
  return {
    // 传给 createGameLocale 的 platformLocale（字符串或 () => string 中的函数形态）
    platformLocale() {
      return ready ? getLanguage() : null;
    },
    get ready() { return ready; },
    // 平台句柄 ready 后接线；ready 只结算一次，重复 attach 无害。返回 promise 供测试等待。
    attach(handle, locale) {
      const readyPromise = handle && typeof handle.then === 'function' ? handle : handle && handle.ready;
      if (!readyPromise || typeof readyPromise.then !== 'function' ||
          !locale || typeof locale.isAuto !== 'function' || typeof locale.setLocale !== 'function') {
        return Promise.resolve(false);
      }
      return Promise.resolve(readyPromise).then((ok) => {
        ready = ok === true; // 失败保持未就绪：getter 继续 null，浏览器/默认不变
        if (ready && locale.isAuto()) locale.setLocale('');
        return ready;
      });
    },
  };
}
