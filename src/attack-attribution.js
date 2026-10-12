// 扣球原表是总数的唯一来源；每个结果用连续批次保存二传归属，减一撤回最近同类记录。
const OUTCOMES = ["success", "normal", "error"];
const count = n => Number.isSafeInteger(n) && n >= 0 ? n : 0;
const jersey = n => /^\d{1,3}$/.test(String(n).trim()) ? String(Number(n)) : null;
const empty = () => ({ success: 0, normal: 0, error: 0 });
const filled = p => p?.name?.trim() && jersey(p.number) !== null;

export function initialAttackAttribution(rowCount = 14) {
  return { activeSetter: null, setterNumbers: Array(4).fill(null), rows: Array.from({ length: rowCount }, () => Object.fromEntries(OUTCOMES.map(o => [o, []]))) };
}

function append(runs, setter, amount) {
  if (!amount) return;
  const last = runs.at(-1);
  if (last?.setter === setter) last.count += amount;
  else runs.push({ setter, count: amount });
}

export function normalizeAttackAttribution(data, saved = data.attackAttribution) {
  const result = initialAttackAttribution(data.players.length);
  const setters = data.setterStatistics?.players || [];
  result.setterNumbers = result.setterNumbers.map((_, i) => jersey(saved?.setterNumbers?.[i]));
  const active = saved?.activeSetter;
  result.activeSetter = Number.isInteger(active) && active >= 0 && active < 4 && filled(setters[active]) ? active : null;
  data.players.forEach((p, row) => OUTCOMES.forEach(o => {
    let remaining = count(p.counts?.attack?.[o]);
    const runs = Array.isArray(saved?.rows?.[row]?.[o]) ? saved.rows[row][o] : [];
    for (const run of runs) {
      if (!remaining) break;
      const amount = Math.min(count(run?.count), remaining);
      const s = run?.setter;
      // 无身份快照或身份不符的备份记录保留总数，归到未归属；不猜测二传。
      const valid = Number.isInteger(s) && s >= 0 && s < 4 && setters[s] && result.setterNumbers[s] !== null && result.setterNumbers[s] === jersey(setters[s].number);
      append(result.rows[row][o], valid ? s : null, amount);
      remaining -= amount;
    }
    append(result.rows[row][o], null, remaining);
  }));
  return result;
}

export function setActiveSetter(data, value) {
  const slot = value === "" || value === null ? null : Number(value);
  if (slot !== null && (!Number.isInteger(slot) || slot < 0 || slot >= 4 || !filled(data.setterStatistics?.players[slot]))) return false;
  data.attackAttribution ||= normalizeAttackAttribution(data);
  data.attackAttribution.activeSetter = slot;
  return true;
}

export function currentAttackSetter(data) {
  const slot = data.attackAttribution?.activeSetter;
  return data.setterStatistics?.enabled && Number.isInteger(slot) && filled(data.setterStatistics.players[slot]) ? slot : null;
}

export function latestAttackSetter(data, row, outcome) {
  return normalizeAttackAttribution(data).rows[row]?.[outcome]?.at(-1)?.setter ?? null;
}

// 在修改原表计数之前调用；保证归属次数与原表完全一致。
export function adjustAttackAttribution(data, row, outcome, delta) {
  data.attackAttribution = normalizeAttackAttribution(data);
  const ledger = data.attackAttribution;
  const runs = ledger.rows[row][outcome];
  if (delta === 1) {
    const slot = currentAttackSetter(data);
    if (slot !== null) ledger.setterNumbers[slot] = jersey(data.setterStatistics.players[slot].number);
    append(runs, slot, 1);
  } else {
    const last = runs.at(-1);
    if (last && --last.count === 0) runs.pop();
  }
}

export function hasAttributedAttacks(data, slot) {
  return data.attackAttribution?.rows?.some(row => OUTCOMES.some(o => row[o]?.some(run => run.setter === slot && count(run.count) > 0))) || false;
}

export function validateAttackAttribution(data) {
  for (let i = 0; i < 4; i++) {
    if (!hasAttributedAttacks(data, i)) continue;
    const p = data.setterStatistics?.players[i];
    if (!filled(p)) return `第 ${i + 1} 名二传已有在场进攻记录，姓名与号码不能清空。`;
    if (jersey(p.number) !== data.attackAttribution.setterNumbers[i]) return `第 ${i + 1} 名二传已有在场进攻记录，不能更换号码。`;
  }
  return "";
}

function metrics(c) {
  const total = c.success + c.normal + c.error;
  return { ...c, total, killRate: total ? c.success / total : null, efficiency: total ? (c.success - c.error) / total : null };
}

export function buildAttackComparison(data) {
  const ledger = normalizeAttackAttribution(data);
  const groups = (data.setterStatistics?.players || []).flatMap((p, slot) => filled(p) ? [{ slot, name: p.name, number: p.number, counts: empty(), excluded: 0, players: [] }] : []);
  const unassigned = { slot: null, name: "未归属二传", number: "", counts: empty(), excluded: 0, players: [] };
  const all = [...groups, unassigned];
  data.players.forEach((p, row) => {
    if (!filled(p)) return;
    const buckets = new Map(all.map(g => [g.slot, empty()]));
    OUTCOMES.forEach(o => ledger.rows[row][o].forEach(run => {
      const slot = buckets.has(run.setter) ? run.setter : null;
      buckets.get(slot)[o] += run.count;
    }));
    all.forEach(g => {
      const c = buckets.get(g.slot);
      const own = g.slot !== null && jersey(g.number) === jersey(p.number);
      if (own) g.excluded += metrics(c).total;
      else OUTCOMES.forEach(o => g.counts[o] += c[o]);
      g.players.push({ row, name: p.name, number: p.number, own, ...metrics(c) });
    });
  });
  return { groups: groups.map(g => ({ ...g, ...metrics(g.counts) })), unassigned: { ...unassigned, ...metrics(unassigned.counts) } };
}

export function sampleAttackAttribution(data) {
  const ledger = initialAttackAttribution(data.players.length);
  ledger.activeSetter = 0;
  ledger.setterNumbers[0] = jersey(data.setterStatistics.players[0].number);
  ledger.setterNumbers[1] = jersey(data.setterStatistics.players[1].number);
  data.players.forEach((p, row) => OUTCOMES.forEach(o => {
    const n = p.counts.attack[o];
    // 样例刻意分配给两名二传；真实旧记录迁移永远不这样分配。
    const first = row === 0 ? 0 : row === 1 ? n : Math.ceil(n * .65);
    append(ledger.rows[row][o], 0, first);
    append(ledger.rows[row][o], 1, n - first);
  }));
  return ledger;
}
