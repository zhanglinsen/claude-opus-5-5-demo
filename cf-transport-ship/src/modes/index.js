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
};

export function getMode(id) { return MODES[id] || MODES.tdm; }
