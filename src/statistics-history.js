// A bounded correction log shared by table clicks and keyboard recording.
// It stores counter changes, not match-wide snapshots, and identifies players by jersey/name.
export const HISTORY_LIMIT = 30;
const clone = value => JSON.parse(JSON.stringify(value));
const jersey = value => /^\d{1,3}$/.test(String(value).trim()) ? String(Number(value)) : null;
const groups = { player: ["serve", "receive", "attack", "block", "defend"], setter: ["inSystem", "outOfSystem", "secondAttack"] };
const validRuns = runs => Array.isArray(runs) && runs.every(r => Number.isSafeInteger(r.count) && r.count > 0 && (r.setter === null || Number.isInteger(r.setter) && r.setter >= 0 && r.setter < 4));
export function normalizeHistory(saved) {
  return (Array.isArray(saved) ? saved : []).filter(e => e && typeof e.id === "string" && ["player", "setter"].includes(e.kind)
    && jersey(e.number) !== null && typeof e.name === "string" && groups[e.kind].includes(e.group)
    && ["success", "normal", "error"].includes(e.outcome) && [1, -1].includes(e.delta)
    && Number.isSafeInteger(e.before) && e.before >= 0 && e.after === e.before + e.delta && e.after >= 0
    && (e.group !== "attack" || validRuns(e.beforeRuns) && validRuns(e.afterRuns)
      && e.beforeRuns.reduce((s, r) => s + r.count, 0) === e.before && e.afterRuns.reduce((s, r) => s + r.count, 0) === e.after))
    .slice(-HISTORY_LIMIT).map(e => ({ id: e.id, kind: e.kind, number: e.number, name: e.name, group: e.group, outcome: e.outcome,
      delta: e.delta, before: e.before, after: e.after, at: typeof e.at === "string" ? e.at : "", undone: e.undone === true,
      ...(e.group === "attack" ? { beforeRuns: clone(e.beforeRuns), afterRuns: clone(e.afterRuns), setterNumbers: Array.isArray(e.setterNumbers) ? e.setterNumbers.slice(0, 4) : [] } : {}) }));
}
export function recordCounterChange(data, entry) {
  data.counterHistory = [...normalizeHistory(data.counterHistory), { ...entry, id: globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`, at: new Date().toISOString(), undone: false }].slice(-HISTORY_LIMIT);
}
export function latestCounterChange(data) { return [...(data.counterHistory || [])].reverse().find(e => !e.undone) || null; }
export function undoCounterChange(data) {
  const e = latestCounterChange(data);
  if (!e) return { error: "没有可撤销的近期记录。" };
  const players = e.kind === "setter" ? data.setterStatistics.players : data.players;
  const row = players.findIndex(p => jersey(p.number) === jersey(e.number) && p.name === e.name);
  const p = players[row];
  if (!p || p.counts?.[e.group]?.[e.outcome] !== e.after) return { error: "队员身份或计数已发生变化，无法安全撤销。请在原表中核对并纠正。" };
  if (e.group === "attack") {
    const current = data.attackAttribution.rows[row][e.outcome];
    const slots = new Set([...e.beforeRuns, ...e.afterRuns].map(r => r.setter).filter(s => s !== null));
    if (JSON.stringify(current) !== JSON.stringify(e.afterRuns) || [...slots].some(slot => jersey(data.setterStatistics.players[slot]?.number) !== jersey(e.setterNumbers[slot]))) {
      return { error: "进攻归属或二传身份已变化，无法安全撤销。请在原表中核对。" };
    }
    data.attackAttribution.rows[row][e.outcome] = clone(e.beforeRuns);
  }
  p.counts[e.group][e.outcome] = e.before;
  e.undone = true;
  return { entry: e, row };
}
