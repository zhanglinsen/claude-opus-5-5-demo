// 档案基础设施：版本化 localStorage 适配器（与 cf_opts_v2 设置分离）。
// storage 由调用方注入；所有读写都做保护，隐私模式/配额错误/损坏 JSON 都不抛出。

export const PROFILE_KEY = 'cf_profile_v1';

function safeGet(storage, key) {
  try { return storage.getItem(key); } catch (e) { return null; }
}

function safeSet(storage, key, value) {
  try { storage.setItem(key, value); return true; } catch (e) { return false; }
}

// 原始记录解析：非字符串/坏 JSON/非对象/无版本号都视为不存在（上层按全新档案重建）
export function parseProfileRaw(raw) {
  if (typeof raw !== 'string' || raw === '') return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.v !== 'number') return null;
    return parsed;
  } catch (e) { return null; }
}

export function createProfileRepository(storage) {
  return {
    key: PROFILE_KEY,
    load() { return parseProfileRaw(safeGet(storage, PROFILE_KEY)); },
    save(profile) { return safeSet(storage, PROFILE_KEY, JSON.stringify(profile)); },
  };
}
