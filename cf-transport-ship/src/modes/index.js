// 模式适配器注册表（纯数据/函数，node 可测）
// 每个模式提供：开局参数、结束判定、胜者判定与开局提示；game.js 依赖这些钩子而非硬编码规则。

export const MODES = {
  tdm: {
    id: 'tdm',
    name: '团队竞技',
    defaults: { goal: 50, time: 600, respawn: 4.0 },
    toast: (goal) => `团队竞技 · 率先达到 <b style="color:#f5b321">${goal}</b> 击杀的队伍获胜`,
    checkEnd: (score, goal) => score.BL >= goal || score.GR >= goal,
    result: (score, my) => {
      const other = my === 'BL' ? 'GR' : 'BL';
      return score[my] === score[other] ? null : score[my] > score[other];
    },
  },
  // 爆破：回合流转/计时/胜负全部来自 BombSession 持有的纯规则引擎 BombMatch；
  // 本适配器只描述 Game 需要的通用钩子（无重生、无对局时限、击杀不计比分）。
  bomb: {
    id: 'bomb',
    name: '爆破模式',
    defaults: { time: Infinity, respawn: null },
    scoreKills: false,
    toast: () => `爆破模式 · 5v5 固定阵营，先赢 <b style="color:#f5b321">7</b> 回合获胜`,
    checkEnd: () => false, // 对局结束由 matchEnded 事件驱动，与击杀无关
    result: (score, my) => {
      const other = my === 'BL' ? 'GR' : 'BL';
      if (score[my] >= 7) return true;
      if (score[other] >= 7) return false;
      return null;
    },
  },
  // 练习：无敌军、全图探索、任意换枪（规则在 PracticeRuntime/Game 侧生成），
  // 对局永不凭比分/时间结束，死亡短延迟重生；不参与军衔结算（awardMatch 不调用）。
  practice: {
    id: 'practice',
    name: '练习模式',
    defaults: { time: Infinity, respawn: 2.0 },
    toast: () => `练习模式 · 无敌军威胁，<b style="color:#f5b321">4</b> 号键轮换投掷物，靶场随意练枪`,
    checkEnd: () => false,
    result: () => null,
  },
};

// 菜单模式选项（按地图 supportedModes 顺序）；HUD/菜单渲染消费（lane 3），
// 未知地图安全返回空数组。mode 实际进入对局仍走 opts/URL ?mode= + getMode 兜底。
export function modeOptionsFor(mapDesc) {
  const ids = mapDesc && Array.isArray(mapDesc.supportedModes) ? mapDesc.supportedModes : [];
  return ids.filter((id) => MODES[id]).map((id) => ({ id, name: MODES[id].name }));
}

export function getMode(id) { return MODES[id] || MODES.tdm; }
