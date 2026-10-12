import { GROUPS, OUTCOMES, groupTotal, teamTotals } from "./statistics-state.js";

export const RATE_LABELS = {
  serve: "发球得分率", attack: "扣球成功率", receive: "一传到位率",
  block: "拦网得分率", defend: "防守好球率"
};

export function formatPercentage(value) {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function metrics(counts) {
  return GROUPS.map(group => {
    const total = groupTotal(counts, group.key);
    const values = Object.fromEntries(OUTCOMES.map(outcome => [outcome, Number.isSafeInteger(counts?.[group.key]?.[outcome]) && counts[group.key][outcome] >= 0 ? counts[group.key][outcome] : 0]));
    return { ...group, ...values, total, successRate: total ? values.success / total : null, errorRate: total ? values.error / total : null };
  });
}

function summarize(groups) {
  return {
    points: groups.filter(g => ["serve", "attack", "block"].includes(g.key)).reduce((sum, g) => sum + g.success, 0),
    errors: groups.reduce((sum, g) => sum + g.error, 0),
    actions: groups.reduce((sum, g) => sum + g.total, 0)
  };
}

// 每次从当前原始计数派生，不保存分析副本，保证纠正计数后报告同步更新。
export function buildStatisticsAnalysis(data) {
  const players = data.players.filter(p => p.name.trim() && p.number.trim()).map(player => {
    const groups = metrics(player.counts);
    return { name: player.name, number: player.number, gender: player.gender, groups, ...summarize(groups) };
  });
  const groups = metrics(teamTotals(data.players));
  const summary = summarize(groups);
  const ranked = players.filter(p => p.points > 0).slice().sort((a, b) => b.points - a.points || Number(a.number) - Number(b.number));
  let rank = 0;
  const ranking = ranked.map((player, index) => {
    if (!index || player.points !== ranked[index - 1].points) rank = index + 1;
    return { ...player, rank };
  });
  const leaders = ranking.filter(player => player.rank === 1);
  const recordedGroups = groups.filter(group => group.total > 0);
  const maxErrors = Math.max(0, ...recordedGroups.map(group => group.error));
  const errorGroups = maxErrors ? recordedGroups.filter(group => group.error === maxErrors) : [];
  return { ...summary, groups, players, ranking, leaders, errorGroups, recordedPlayers: players.filter(p => p.actions > 0).length };
}
