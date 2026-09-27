// 测试替身：广告暂停的 controls 注入对象。
// 游戏侧语义：模拟暂停 = 用户暂停 或 广告暂停（广告是独立暂停原因）；
// persistedVolume 模拟玩家已保存音量 —— 若被会话触碰即为污染玩家设置。
export function makeControls(userPaused = false) {
  const s = { userPaused, adPaused: false, muted: false, persistedVolume: 0.8, pauseCalls: 0 };
  return {
    s,
    api: {
      isUserPaused: () => s.userPaused,
      enterAdPause() { s.adPaused = true; s.pauseCalls++; },
      exitAdPause() { s.adPaused = false; },
      setAdMuted(on) { s.muted = !!on; },
      setVolume() { s.persistedVolume = -1; },
    },
    get simPaused() { return s.userPaused || s.adPaused; },
  };
}
