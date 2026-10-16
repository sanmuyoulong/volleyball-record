// Per-set buckets own the counters. Top-level counters remain the full-match projection
// for old exports, validation and consumers; old totals stay explicitly unassigned.
import { initialAttackAttribution, normalizeAttackAttribution } from "./attack-attribution.js";
export const SET_KEYS = ["1", "2", "3", "4", "5", "unassigned"];
const main = ["serve", "attack", "receive", "block", "defend"];
const setter = ["inSystem", "outOfSystem", "secondAttack"];
const outcomes = ["success", "normal", "error"];
const clone = x => JSON.parse(JSON.stringify(x));
const count = x => Number.isSafeInteger(x) && x >= 0 ? x : 0;
const empty = keys => Object.fromEntries(keys.map(k => [k, { success: 0, normal: 0, error: 0 }]));
const normalized = (source, keys) => Object.fromEntries(keys.map(k => [k, Object.fromEntries(outcomes.map(o => [o, count(source?.[k]?.[o])]))]));
export const setLabel = key => key === "all" ? "全场合计" : key === "unassigned" ? "未分局" : `第${key}局`;
export function bucketHasCounts(bucket) { return [...bucket.players, ...bucket.setterPlayers].some(c => Object.values(c).some(v => outcomes.some(o => v[o] > 0))); }
function emptyBucket() { return { recorded: false, players: Array.from({ length: 14 }, () => empty(main)), setterPlayers: Array.from({ length: 4 }, () => empty(setter)), attackAttribution: initialAttackAttribution(14) }; }
export function initializeSetStatistics(data, saved = data.setStatistics) {
  data.attackAttribution ||= initialAttackAttribution(14);
  const legacy = !saved || saved.version !== 1 || !saved.buckets || !Object.keys(saved.buckets).length;
  const buckets = Object.fromEntries(SET_KEYS.map(key => {
    const raw = saved?.buckets?.[key], b = emptyBucket();
    b.recorded = raw?.recorded === true;
    b.players = b.players.map((_, i) => normalized(raw?.players?.[i], main));
    b.setterPlayers = b.setterPlayers.map((_, i) => normalized(raw?.setterPlayers?.[i], setter));
    const view = { ...data, players: data.players.map((p, i) => ({ ...p, counts: b.players[i] })) };
    b.attackAttribution = normalizeAttackAttribution(view, raw?.attackAttribution);
    return [key, b];
  }));
  if (legacy) {
    buckets.unassigned.players = data.players.map(p => clone(p.counts));
    buckets.unassigned.setterPlayers = data.setterStatistics.players.map(p => clone(p.counts));
    buckets.unassigned.attackAttribution = normalizeAttackAttribution(data, data.attackAttribution);
  } else {
    // Preserve extra totals written by an older client; never guess their set or setter.
    for (const [type, players, keys] of [["players", data.players, main], ["setterPlayers", data.setterStatistics.players, setter]]) {
      players.forEach((p, i) => keys.forEach(k => outcomes.forEach(o => {
        const sum = SET_KEYS.reduce((n, key) => n + buckets[key][type][i][k][o], 0);
        if (p.counts[k][o] > sum) buckets.unassigned[type][i][k][o] += p.counts[k][o] - sum;
      })));
    }
    const b = buckets.unassigned;
    b.attackAttribution = normalizeAttackAttribution({ ...data, players: data.players.map((p, i) => ({ ...p, counts: b.players[i] })) }, b.attackAttribution);
  }
  const hasLegacy = bucketHasCounts(buckets.unassigned);
  data.setStatistics = { version: 1, selected: legacy && hasLegacy ? "unassigned" : ["all", ...SET_KEYS].includes(saved?.selected) ? saved.selected : "1", buckets };
  synchronizeSetTotals(data);
  return data.setStatistics;
}
export function statisticsSetView(data, key = data.setStatistics?.selected || "1") {
  if (!data.setStatistics?.buckets?.["1"]) initializeSetStatistics(data);
  if (key === "all") return data;
  const b = data.setStatistics.buckets[key] || data.setStatistics.buckets.unassigned;
  return { ...data, players: data.players.map((p, i) => ({ ...p, counts: b.players[i] })),
    setterStatistics: { ...data.setterStatistics, players: data.setterStatistics.players.map((p, i) => ({ ...p, counts: b.setterPlayers[i] })) },
    attackAttribution: { ...b.attackAttribution, activeSetter: data.attackAttribution?.activeSetter ?? null }, scopeKey: key };
}
export function commitSetView(data, view, key = data.setStatistics.selected) {
  const b = data.setStatistics.buckets[key];
  b.attackAttribution = view.attackAttribution;
  b.recorded = true;
  synchronizeSetTotals(data);
}
export function synchronizeSetTotals(data) {
  const buckets = data.setStatistics.buckets;
  for (const [type, players, keys] of [["players", data.players, main], ["setterPlayers", data.setterStatistics.players, setter]]) {
    players.forEach((p, i) => { p.counts = empty(keys); SET_KEYS.forEach(key => keys.forEach(k => outcomes.forEach(o => p.counts[k][o] += buckets[key][type][i][k][o]))); });
  }
  const ledger = initialAttackAttribution(14);
  ledger.activeSetter = data.attackAttribution?.activeSetter ?? null;
  ledger.setterNumbers = [...(data.attackAttribution?.setterNumbers || [null, null, null, null])];
  SET_KEYS.forEach(key => {
    const b = buckets[key];
    b.attackAttribution.setterNumbers.forEach((n, i) => { if (n !== null) ledger.setterNumbers[i] = n; });
    b.attackAttribution.rows.forEach((row, i) => outcomes.forEach(o => row[o].forEach(run => {
      const runs = ledger.rows[i][o], last = runs.at(-1);
      if (last?.setter === run.setter) last.count += run.count;
      else runs.push({ ...run });
    })));
  });
  data.attackAttribution = normalizeAttackAttribution(data, ledger);
}
export function recordedSetKeys(data) { return SET_KEYS.filter(k => k !== "unassigned" && (data.setStatistics?.buckets?.[k]?.recorded || data.setStatistics?.buckets?.[k] && bucketHasCounts(data.setStatistics.buckets[k]))); }
export function remapSetRosters(data, oldPlayers, newPlayers) {
  if (!data.setStatistics?.buckets?.["1"]) initializeSetStatistics(data);
  for (const b of Object.values(data.setStatistics.buckets)) {
    const indices = newPlayers.map(p => p.number.trim() ? oldPlayers.findIndex(old => old.number.trim() && Number(old.number) === Number(p.number) && old.name.trim() === p.name.trim()) : -1);
    b.players = indices.map(i => i < 0 ? empty(main) : clone(b.players[i]));
    b.attackAttribution.rows = indices.map(i => i < 0 ? { success: [], normal: [], error: [] } : clone(b.attackAttribution.rows[i]));
  }
}
