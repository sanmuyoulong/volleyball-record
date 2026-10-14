// Shared match envelope. The recording engines keep their original payloads.
import { initialState, normalizeState } from "./state.js";
import { initialStatistics, normalizeStatistics, validateStatisticsScores } from "./statistics-state.js";
import { resultFromMatch } from "./tournament-rules.js";

export const copy = value => JSON.parse(JSON.stringify(value));
export const id = prefix => `${prefix}-${crypto.randomUUID()}`;
export function newMatch(meta, teams, tournamentId = null) {
  const scoring = initialState();
  scoring.screen = "record";
  scoring.meta = { ...scoring.meta, ...meta };
  scoring.teams = copy(teams);
  const record = { id: id("match"), tournamentId, meta: copy(scoring.meta), teams: copy(teams), scoring,
    statistics: { home: null, away: null }, manualResult: null, manualConfirmed: false, archived: false };
  scoring.matchId = record.id;
  scoring.tournamentId = tournamentId;
  return record;
}
export function locked(match) {
  return Boolean(match.scoring?.match || ["home", "away"].some(side => match.statistics?.[side]?.screen === "table"));
}
export function scoreData(record) {
  const payload = normalizeState(copy(record.scoring));
  payload.meta = { ...payload.meta, ...record.meta };
  payload.teams = payload.teams.map((team, i) => ({ ...team, id: record.teams[i].id, name: record.teams[i].name }));
  payload.matchId = record.id;
  payload.tournamentId = record.tournamentId;
  return payload;
}
export function commonScores(record) {
  if (record.scoring?.match) {
    const match = record.scoring.match;
    const sets = match.sets || [];
    const wins = [0, 0];
    sets.forEach(s => { if (s.ended && [0, 1].includes(s.winner)) wins[s.winner]++; });
    return { setScores: Array.from({ length: 5 }, (_, i) => sets[i]?.score?.map(String) || ["", ""]),
      completedSets: Array.from({ length: 5 }, (_, i) => Boolean(sets[i]?.ended)),
      winner: match.ended ? (wins[0] > wins[1] ? "home" : "away") : "" };
  }
  return record.manualResult || { setScores: Array.from({ length: 5 }, () => ["", ""]), completedSets: Array(5).fill(false), winner: "" };
}
export function statsData(record, side) {
  const existed = record.statistics?.[side];
  const data = existed ? normalizeStatistics(copy(existed)) : initialStatistics();
  const m = record.meta;
  Object.assign(data.meta, { competition: m.competition, matchNo: m.matchNo, gender: m.gender,
    date: m.date, city: m.city, venue: m.venue, homeTeam: record.teams[0].name, awayTeam: record.teams[1].name, teamSide: side });
  if (!existed) record.teams[side === "home" ? 0 : 1].roster?.slice(0, 14).forEach((p, i) => Object.assign(data.players[i], { name: p.name, number: p.number, gender: p.gender || "" }));
  const scores = commonScores(record);
  data.setScores = copy(scores.setScores);
  data.completedSets = copy(scores.completedSets);
  data.meta.winner = scores.winner;
  return data;
}
export function validateFinal(record) {
  if (record.scoring?.match) throw Error("正式计分已经开始，请在计分页完成赛后确认。");
  const r = commonScores(record);
  const error = validateStatisticsScores(r.setScores, r.completedSets);
  if (error) throw Error(error);
  const max = Number(record.meta.matchFormat || 5), target = Math.floor(max / 2) + 1, wins = [0, 0];
  let ended = false, gap = false;
  r.setScores.forEach((pair, i) => {
    if (!r.completedSets[i]) { if (pair.some(v => v !== "")) throw Error("还有未结束的局，请先完成比分。"); gap = true; return; }
    if (gap || ended || i >= max) throw Error("局比分顺序或局数不符合赛制。");
    const a = Number(pair[0]), b = Number(pair[1]), goal = i === max - 1 ? 15 : 25;
    if (Math.max(a, b) < goal || Math.abs(a - b) < 2 || (Math.max(a, b) > goal && Math.abs(a - b) !== 2)) throw Error(`第 ${i + 1} 局比分不符合比赛规则。`);
    wins[a > b ? 0 : 1]++;
    ended = wins.some(n => n === target);
  });
  if (!ended) throw Error("尚未达到获胜局数。");
  const winner = wins[0] > wins[1] ? "home" : "away";
  if (r.winner && r.winner !== winner) throw Error("胜队与局比分不一致。");
  return { ...copy(r), winner };
}
export function finalResult(record) {
  if (record.archived || record.missing) return null;
  if (record.scoring?.match) return record.scoring.match.ended ? resultFromMatch(scoreData(record)) : null;
  if (!record.manualConfirmed) return null;
  const r = commonScores(record), wins = [0, 0], points = [0, 0];
  r.setScores.forEach((p, i) => { if (r.completedSets[i]) { wins[Number(p[0]) > Number(p[1]) ? 0 : 1]++; points[0] += Number(p[0]); points[1] += Number(p[1]); } });
  return { homeTeamId: record.teams[0].id, awayTeamId: record.teams[1].id, winnerTeamId: record.teams[r.winner === "home" ? 0 : 1].id,
    homeSets: wins[0], awaySets: wins[1], homePoints: points[0], awayPoints: points[1] };
}
export function status(record) {
  if (record.archived) return "已归档";
  if (record.missing) return "原记录缺失";
  if (finalResult(record)) return "已结束";
  return locked(record) ? "进行中" : "待开始";
}
