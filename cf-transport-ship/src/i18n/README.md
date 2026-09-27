# i18n 可移植插件

语言服务做成可移植插件：通用核心与游戏词典完全分离，其他游戏复制本目录后
**只需替换 `catalogs.js`、删除 `adapter-settings.js`（或换成自己的存储适配层）、
改写 `index.js` 的装配默认值** 即可使用，无 `game.js` 或 CF 专属名称依赖，无运行时外部依赖。

## 文件结构

| 文件 | 可移植性 | 说明 |
|---|---|---|
| `locale-service.js` | 通用核心 | `createLocaleService` / `normalizeTag` / `matchLocale` / `resolveLocale` / `validateCatalogs`，无任何游戏名引用 |
| `catalogs.js` | 本游戏 | zh/en 词典，稳定点分键 |
| `adapter-settings.js` | 本游戏 | 把存储接口桥接到 `cf_opts_v2` 的 `lang` 字段（其他游戏换成自己的持久层） |
| `index.js` | 本游戏 | 装配默认值并导出稳定入口 |

## 核心 API（`locale-service.js`）

```js
const svc = createLocaleService({
  catalogs,          // 必填：{ en: {...}, zh: {...} }
  storage,           // 可选：{ getItem(key), setItem(key, value) }；读写抛错均被吞掉
  storageKey: 'lang',
  platformLocale,    // 平台语言：字符串或 () => string|null
  browserLocale,     // 浏览器语言：字符串或 () => string|null
  defaultLocale: 'en',          // 构建默认语言
  onMissing: (key, locale) => {}, // 缺键诊断回调（可选）
});

svc.getLocale();      // 当前生效语言（目录键）
svc.isAuto();         // 用户未指定语言（保存值为 '' / null）
svc.getSavedLocale(); // 原始保存值；无存储时为 null
svc.t(key, params);   // 翻译 + {name} 插值；缺键回退默认语言，再回退键名并记录
svc.setLocale('zh');  // 显式选择并持久化；'' = 回到自动；未知语言返回 false
const off = svc.subscribe((locale) => {}); // 切换通知；off() 退订
svc.getMissingKeys(); // [{ locale, key }]
svc.destroy();        // 清空订阅；销毁后写入类操作失效，只读查询仍可用
```

语言来源优先级：**保存的选择 > 平台语言 > 浏览器语言 > 构建默认**。
保存值 `''`/`null` 表示自动；每一级都必须命中目录（`zh-CN` → `zh`），
未知语言逐级跳过，最终安全回退到构建默认。

## 其他游戏最小接入示例

```js
// 1) 准备自己的词典（键两语言必须一致，可用 validateCatalogs 自检）
import { createLocaleService, validateCatalogs } from './i18n/locale-service.js';

const catalogs = {
  zh: { 'menu.start': '开始游戏', 'hud.hp': '生命 {n}' },
  en: { 'menu.start': 'START',     'hud.hp': 'HP {n}' },
};
if (process.env.NODE_ENV !== 'production') console.warn(validateCatalogs(catalogs));

// 2) 显式注入配置创建服务（平台构建传 defaultLocale: 'en'，本地版传 'zh'）
const locale = createLocaleService({
  catalogs,
  storage: window.localStorage,   // 或自己的存档适配层；隐私模式抛错也能继续
  platformLocale: () => window.PlatformSDK?.getLocale?.() ?? null,
  browserLocale: navigator.language,
  defaultLocale: 'en',
});

// 3) 翻译 + 即时切换
locale.t('hud.hp', { n: 100 });   // 'HP 100'
const off = locale.subscribe(() => renderAllTexts());
locale.setLocale('zh');           // 订阅者立即收到 'zh'
```

本游戏的等价入口是 `createGameLocale()`（见 `index.js`），词典与设置桥接已装好：

```js
import { createGameLocale, createOptsLangAdapter } from './i18n/index.js';
const locale = createGameLocale({ platformLocale: y8Locale, defaultLocale: 'en' }); // 平台构建
const offline = createGameLocale(); // 离线构建：默认中文，语言选择存 cf_opts_v2.lang
```

## 限制

- 目录键为新增稳定 ID，本任务不改任何调用点（由 Task 9/10 接入）。
- 复数、日期等本地化格式不在范围内，插值仅支持 `{name}` 占位符。
- `setLocale` 只接受目录中存在的语言（含区域变体，如 `zh-CN`）；未知值被拒绝且不持久化。
