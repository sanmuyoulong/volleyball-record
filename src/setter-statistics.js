export const SETTER_LIMIT = 4;
export const SETTER_GROUPS = [
  { key: "inSystem", label: "到位球传球", success: "到位", order: ["error", "normal", "success"] },
  { key: "outOfSystem", label: "调整球传球", success: "到位", order: ["error", "normal", "success"] },
  { key: "secondAttack", label: "二次进攻球", success: "得分", order: ["success", "normal", "error"] }
];
const OUTCOMES = ["success", "normal", "error"];
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;

export function emptySetterCounts() {
  return Object.fromEntries(SETTER_GROUPS.map(g => [g.key, { success: 0, normal: 0, error: 0 }]));
}

export function initialSetterStatistics() {
  return { enabled: false, players: Array.from({ length: SETTER_LIMIT }, () => ({ name: "", number: "", gender: "", counts: emptySetterCounts() })) };
}

export function normalizeSetterStatistics(saved) {
  const result = initialSetterStatistics();
  result.enabled = saved?.enabled === true;
  result.players.forEach((p, index) => {
    const source = saved?.players?.[index] || {};
    p.name = String(source.name || "");
    p.number = String(source.number || "");
    p.gender = ["男", "女"].includes(source.gender) ? source.gender : "";
    SETTER_GROUPS.forEach(g => OUTCOMES.forEach(o => p.counts[g.key][o] = count(source.counts?.[g.key]?.[o])));
  });
  return result;
}

export function setterGroupTotal(counts, group) {
  return OUTCOMES.reduce((sum, o) => sum + count(counts?.[group]?.[o]), 0);
}

export function hasSetterCounts(setters) {
  return setters?.players?.some(p => SETTER_GROUPS.some(g => setterGroupTotal(p.counts, g.key) > 0)) || false;
}

export function setterTotals(players) {
  const result = emptySetterCounts();
  players.forEach(p => SETTER_GROUPS.forEach(g => OUTCOMES.forEach(o => result[g.key][o] += count(p.counts?.[g.key]?.[o]))));
  return result;
}

export function adjustSetterStatistic(data, row, group, outcome, delta) {
  const setters = data.setterStatistics;
  const p = setters?.players?.[row];
  if (!setters?.enabled || !p?.name.trim() || !p.number.trim() || !SETTER_GROUPS.some(g => g.key === group) || !OUTCOMES.includes(outcome) || ![1, -1].includes(delta)) return false;
  const next = p.counts[group][outcome] + delta;
  if (!Number.isSafeInteger(next) || next < 0) return false;
  p.counts[group][outcome] = next;
  return true;
}

export function validateSetterStatistics(setters, gender) {
  if (!setters?.enabled) return "";
  if (!Array.isArray(setters.players) || setters.players.length > SETTER_LIMIT) return "二传队员最多填写 4 人。";
  const numbers = new Set();
  let filled = 0;
  for (const [index, p] of setters.players.entries()) {
    if (!p.name.trim() && !p.number.trim() && !hasSetterCounts({ players: [p] })) continue;
    if (!p.name.trim() || !p.number.trim()) return `请补全第 ${index + 1} 名二传队员的姓名与号码；已有统计的队员不能清空。`;
    if (!/^\d{1,3}$/.test(p.number.trim())) return `第 ${index + 1} 名二传队员号码应为 0–999 的整数。`;
    const number = Number(p.number);
    if (numbers.has(number)) return `二传队员号码 ${p.number} 重复，请检查。`;
    if (gender === "混合" && !["男", "女"].includes(p.gender)) return `请选择第 ${index + 1} 名二传队员的性别。`;
    numbers.add(number);
    filled++;
  }
  return filled ? "" : "已启用二传技术统计，请至少填写一名二传队员。";
}

function metrics(counts) {
  return SETTER_GROUPS.map(g => {
    const total = setterGroupTotal(counts, g.key);
    const values = Object.fromEntries(OUTCOMES.map(o => [o, count(counts?.[g.key]?.[o])]));
    return { ...g, ...values, total, successRate: total ? values.success / total : null, errorRate: total ? values.error / total : null };
  });
}

export function buildSetterAnalysis(data) {
  if (!data.setterStatistics?.enabled) return null;
  const players = data.setterStatistics.players.filter(p => p.name.trim() && p.number.trim()).map(p => ({ name: p.name, number: p.number, gender: p.gender, groups: metrics(p.counts) }));
  const groups = metrics(setterTotals(data.setterStatistics.players));
  const passing = groups.filter(g => g.key !== "secondAttack");
  return { players, groups, passingTotal: passing.reduce((sum, g) => sum + g.total, 0), passingAccurate: passing.reduce((sum, g) => sum + g.success, 0), secondPoints: groups.find(g => g.key === "secondAttack").success };
}
