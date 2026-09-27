// 设置兼容适配层（CF 专属，与可移植核心分离）：
// 把 LocaleService 需要的 { getItem, setItem } 存储接口桥接到现有 cf_opts_v2
// 设置存取（src/settings.js 的 loadOpts/saveOpts），语言选择落在 lang 字段（'' = 自动）。
// 这样语言选择沿用既有设置存储，旧记录无需迁移即可读。

import { loadOpts, saveOpts, acquireStorage } from '../settings.js';

// 创建桥接 cf_opts_v2 的语言存储。storage 默认走 acquireStorage()
//（localStorage 不可用时内部已是内存兜底，load/save 本身不抛错）。
export function createOptsLangAdapter({ storage = acquireStorage(), touch = false } = {}) {
  return {
    getItem(key) {
      const v = loadOpts(storage, touch)[key];
      return v == null ? null : String(v);
    },
    setItem(key, value) {
      const o = loadOpts(storage, touch);
      o[key] = value;
      saveOpts(storage, o);
    },
  };
}
