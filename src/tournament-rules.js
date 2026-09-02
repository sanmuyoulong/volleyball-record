// 赛事纯函数引擎：积分计算与赛果推导。无 DOM / 存储依赖，可独立单测。
// 与 rules.js 同一定位——只算，不碰界面与本地存储。
// 对阵图（赛程）生成已移除，赛事下的比赛由用户在「赛事管理」中手动选择两队创建。

// 从一场已记录的比赛状态推导赛果：胜方、局数、小分。
// matchState: 项目里的 state 对象（含 match.sets、teams）。
export function resultFromMatch(matchState) {
  const sets = matchState?.match?.sets || [];
  const teams = matchState?.teams || [];
  const homeId = teams[0]?.id || null;
  const awayId = teams[1]?.id || null;
  let homeSets = 0;
  let awaySets = 0;
  let homePoints = 0;
  let awayPoints = 0;
  sets.forEach((s) => {
    const a = Number(s.score?.[0] ?? s.teamA?.points ?? 0);
    const b = Number(s.score?.[1] ?? s.teamB?.points ?? 0);
    homePoints += a;
    awayPoints += b;
    if (s.winner === 0) homeSets += 1;
    else if (s.winner === 1) awaySets += 1;
    else if (s.ended && a !== b) { if (a > b) homeSets += 1; else awaySets += 1; }
  });
  let winnerTeamId = null;
  if (homeSets > awaySets) winnerTeamId = homeId;
  else if (awaySets > homeSets) winnerTeamId = awayId;
  return { winnerTeamId, homeTeamId: homeId, awayTeamId: awayId, homeSets, awaySets, homePoints, awayPoints };
}

// 计算积分表。按 teams 的 group 分组（groups > 1 时），每组内按排球规则排名：
// 胜场 → 局胜率 → 小分胜率。
// matches: 赛事下已记录的比赛摘要数组，每项需含 result（由 resultFromMatch 产出）。
export function computeStandings(matches, teams, groups = 1) {
  const list = (teams || []).filter((t) => t && t.name);
  if (!list.length) return { groups: [] };
  const groupCount = Math.max(1, Math.min(8, groups || 1));
  const buckets = Array.from({ length: groupCount }, () => []);
  list.forEach((t) => {
    const g = groupCount > 1 ? Math.max(0, Math.min(groupCount - 1, t.group ?? 0)) : 0;
    buckets[g].push(t.id);
  });
  const stats = {};
  list.forEach((t) => {
    stats[t.id] = { teamId: t.id, name: t.name, played: 0, wins: 0, losses: 0, setsFor: 0, setsAgainst: 0, pointsFor: 0, pointsAgainst: 0 };
  });
  (matches || []).filter((m) => m && m.result && m.result.winnerTeamId).forEach((m) => {
    const r = m.result;
    const h = stats[r.homeTeamId];
    const a = stats[r.awayTeamId];
    if (!h || !a) return;
    h.played += 1; a.played += 1;
    h.setsFor += r.homeSets; h.setsAgainst += r.awaySets; h.pointsFor += r.homePoints; h.pointsAgainst += r.awayPoints;
    a.setsFor += r.awaySets; a.setsAgainst += r.homeSets; a.pointsFor += r.awayPoints; a.pointsAgainst += r.homePoints;
    if (r.winnerTeamId === r.homeTeamId) { h.wins += 1; a.losses += 1; }
    else if (r.winnerTeamId === r.awayTeamId) { a.wins += 1; h.losses += 1; }
  });
  const ratio = (x, y) => (y > 0 ? x / y : x > 0 ? 99 : 0);
  const sortRows = (rows) => rows.sort((p, q) =>
    q.wins - p.wins ||
    ratio(q.setsFor, q.setsAgainst) - ratio(p.setsFor, p.setsAgainst) ||
    ratio(q.pointsFor, q.pointsAgainst) - ratio(p.pointsFor, p.pointsAgainst) ||
    (p.name < q.name ? -1 : 1)
  );
  return {
    groups: buckets.map((ids, gi) => ({
      group: gi,
      label: groupCount > 1 ? `第 ${gi + 1} 组` : "积分榜",
      rows: sortRows(ids.map((id) => stats[id]))
    }))
  };
}
