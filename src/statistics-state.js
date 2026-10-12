// B6 技术统计数据独立保存，不占用比赛计分和赛事归档的存储槽。
export const STATISTICS_KEY = "volley-record-statistics-v1";
export const GROUPS = [
  { key: "serve", label: "发球", success: "得分" },
  { key: "attack", label: "扣球", success: "扣死" },
  { key: "receive", label: "一传", success: "到位" },
  { key: "block", label: "拦网", success: "拦死" },
  { key: "defend", label: "防守", success: "好球" }
];
export const OUTCOMES = ["success", "normal", "error"];
export const ROW_COUNT = 14;

export function emptyCounts() {
  return Object.fromEntries(GROUPS.map(({ key }) => [key, { success: 0, normal: 0, error: 0 }]));
}

export function initialStatistics() {
  const now = new Date();
  return {
    version: 1,
    screen: "setup",
    meta: {
      competition: "", matchNo: "", homeTeam: "", awayTeam: "", teamSide: "home",
      gender: "男子", date: new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10),
      city: "", venue: "", statistician: "", representative: "", winner: ""
    },
    setScores: Array.from({ length: 5 }, () => ["", ""]),
    completedSets: Array(5).fill(false),
    players: Array.from({ length: ROW_COUNT }, () => ({ name: "", number: "", gender: "", counts: emptyCounts() }))
  };
}

export function sampleStatistics() {
  const data = initialStatistics();
  data.screen = "table";
  Object.assign(data.meta, {
    competition: "2026 校园排球联赛（样例比赛）", matchNo: "A-07",
    homeTeam: "海风俱乐部", awayTeam: "北辰体育", teamSide: "home", gender: "混合",
    city: "杭州", venue: "滨江综合体育馆", statistician: "示例统计员", representative: "示例技术代表", winner: "home"
  });
  data.setScores = [["25", "20"], ["21", "25"], ["25", "19"], ["25", "22"], ["", ""]];
  data.completedSets = [true, true, true, true, false];
  const names = ["程野", "陆骁", "陈放", "高桥", "梁川", "吴桐", "韩序", "沈舟", "邵一", "孟驰", "许燃", "唐越", "季风", "宋扬"];
  const genders = ["男", "男", "女", "男", "男", "女", "男", "男", "女", "男", "女", "男", "女", "女"];
  // 每行依次为发球、扣球、一传、拦网、防守的成功项 / 一般 / 失误。
  const records = [
    [[2, 11, 1], [14, 12, 3], [5, 2, 1], [3, 4, 1], [7, 4, 1]],
    [[1, 10, 1], [12, 11, 2], [4, 3, 0], [2, 5, 1], [8, 5, 1]],
    [[1, 8, 0], [8, 10, 2], [9, 6, 2], [1, 2, 0], [9, 6, 1]],
    [[0, 12, 2], [6, 8, 1], [3, 3, 1], [3, 6, 1], [5, 4, 0]],
    [[2, 13, 1], [2, 4, 1], [13, 5, 1], [0, 2, 0], [11, 8, 2]],
    [[0, 0, 0], [0, 0, 0], [19, 8, 1], [0, 0, 0], [17, 7, 2]],
    [[1, 3, 0], [4, 6, 1], [2, 2, 0], [1, 2, 0], [3, 2, 0]],
    [[0, 4, 0], [3, 4, 1], [4, 2, 0], [0, 1, 0], [4, 3, 1]]
  ];
  data.players.forEach((p, index) => {
    Object.assign(p, { name: names[index], number: String(index + 1), gender: genders[index] });
    GROUPS.forEach((g, group) => OUTCOMES.forEach((outcome, result) => {
      p.counts[g.key][outcome] = records[index]?.[group]?.[result] || 0;
    }));
  });
  return data;
}

export function hasStatisticsContent(data) {
  return ["competition", "matchNo", "homeTeam", "awayTeam", "city", "venue", "statistician", "representative", "winner"].some(key => data.meta[key]?.trim())
    || data.players.some(p => p.name.trim() || p.number.trim() || GROUPS.some(g => groupTotal(p.counts, g.key)))
    || data.setScores.some(pair => pair.some(value => value !== ""));
}

function count(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function normalizeStatistics(saved) {
  const base = initialStatistics();
  if (!saved || saved.version !== 1 || !Array.isArray(saved.players)) return base;
  base.screen = saved.screen === "table" ? "table" : "setup";
  for (const key of Object.keys(base.meta)) {
    if (typeof saved.meta?.[key] === "string") base.meta[key] = saved.meta[key];
  }
  if (!["home", "away"].includes(base.meta.teamSide)) base.meta.teamSide = "home";
  if (base.meta.gender === "男女混合") base.meta.gender = "混合";
  if (!["男子", "女子", "混合"].includes(base.meta.gender)) base.meta.gender = "男子";
  if (!["", "home", "away"].includes(base.meta.winner)) base.meta.winner = "";
  base.setScores = base.setScores.map((_, index) => [0, 1].map(side => {
    const value = String(saved.setScores?.[index]?.[side] ?? "");
    return /^\d{1,3}$/.test(value) ? value : "";
  }));
  // 旧版只允许填写结束局，迁移时保留这些比分对应的局分。
  base.completedSets = base.setScores.map((pair, index) => Array.isArray(saved.completedSets)
    ? saved.completedSets[index] === true
    : pair.every(value => value !== "") && Number(pair[0]) !== Number(pair[1]));
  base.players = base.players.map((_, index) => {
    const player = saved.players[index] || {};
    const counts = emptyCounts();
    for (const { key } of GROUPS) {
      for (const outcome of OUTCOMES) counts[key][outcome] = count(player.counts?.[key]?.[outcome]);
    }
    return { name: String(player.name || ""), number: String(player.number || ""), gender: ["男", "女"].includes(player.gender) ? player.gender : "", counts };
  });
  if (base.screen === "table" && validateStatistics(base)) base.screen = "setup";
  return base;
}

export function groupTotal(counts, key) {
  return OUTCOMES.reduce((sum, outcome) => sum + count(counts?.[key]?.[outcome]), 0);
}

export function teamTotals(players) {
  const totals = emptyCounts();
  for (const player of players) {
    for (const { key } of GROUPS) {
      for (const outcome of OUTCOMES) totals[key][outcome] += count(player.counts?.[key]?.[outcome]);
    }
  }
  return totals;
}

export function adjustStatistic(data, row, group, outcome, delta) {
  const player = data.players[row];
  if (!player?.name.trim() || !player.number.trim() || !GROUPS.some(g => g.key === group) || !OUTCOMES.includes(outcome) || ![1, -1].includes(delta)) return false;
  const next = player.counts[group][outcome] + delta;
  if (!Number.isSafeInteger(next) || next < 0) return false;
  player.counts[group][outcome] = next;
  return true;
}

export function selectedTeam(data) {
  return data.meta.teamSide === "away" ? data.meta.awayTeam : data.meta.homeTeam;
}

export function statisticsPlayerGender(data, player) {
  return data.meta.gender === "混合" ? player.gender || "" : data.meta.gender === "女子" ? "女" : "男";
}

// 按号码匹配统计数据，名单顺序变化不会把数据转给另一位队员。
// 导入前完整校验；不能用缺失或不同身份的名单覆盖已有计数。
export function prepareStatisticsRosterImport(data, imported) {
  if (!imported.players?.length || imported.players.length > ROW_COUNT) throw new Error("技术统计名单需要 1–14 名队员。");
  const numbers = new Set();
  const incoming = imported.players.map(player => {
    const name = String(player.name || "").trim();
    const number = String(player.number || "").trim();
    if (!name || !/^\d{1,3}$/.test(number)) throw new Error("每名队员需填写姓名和 0–999 的整数号码。");
    const id = Number(number);
    if (numbers.has(id)) throw new Error(`队员号码 ${number} 重复，请检查。`);
    numbers.add(id);
    const previous = data.players.find(p => Number(p.number) === id && p.name.trim() === name);
    const gender = ["男", "女"].includes(player.gender) ? player.gender : previous?.gender || "";
    return { name, number, gender };
  });
  const recorded = data.players.filter(p => GROUPS.some(g => groupTotal(p.counts, g.key) > 0));
  const teamName = String(imported.teamName || "").trim();
  if (recorded.length && teamName && teamName !== selectedTeam(data)) throw new Error("文件队名与当前统计队伍不同。已有技术统计时，请导入同一队伍的名单。");
  const recordedNumbers = new Set();
  for (const player of recorded) {
    if (!/^\d{1,3}$/.test(player.number.trim()) || recordedNumbers.has(Number(player.number))) throw new Error("当前已统计队员的号码无效或重复，请先在名单中修正。");
    recordedNumbers.add(Number(player.number));
    const match = incoming.find(p => Number(p.number) === Number(player.number));
    if (!match) throw new Error(`${player.number} 号 ${player.name} 已有技术统计，不能从导入名单中移除。`);
    if (match.name !== player.name.trim()) throw new Error(`${player.number} 号队员姓名与已有技术统计不一致，请核对名单。`);
  }
  const players = incoming.map(player => {
    const previous = recorded.find(p => Number(p.number) === Number(player.number));
    return { ...player, counts: previous ? structuredClone(previous.counts) : emptyCounts() };
  });
  while (players.length < ROW_COUNT) players.push({ name: "", number: "", gender: "", counts: emptyCounts() });
  return { players, teamName: teamName || selectedTeam(data), retainedCount: recorded.length, importedCount: incoming.length };
}

export function matchResult(setScores, completedSets) {
  const wins = [0, 0];
  let recorded = false;
  for (const [index, [home, away]] of setScores.entries()) {
    if (completedSets && !completedSets[index]) continue;
    if (home === "" || away === "" || Number(home) === Number(away)) continue;
    wins[Number(home) > Number(away) ? 0 : 1] += 1;
    recorded = true;
  }
  return recorded ? wins.join(" : ") : "— : —";
}

// 返回用户可读的第一个问题；空字符串表示通过。
export function validateStatistics(data) {
  const m = data.meta;
  for (const [key, label] of [["competition", "比赛名称"], ["matchNo", "场序"], ["homeTeam", "主队"], ["awayTeam", "客队"], ["date", "日期"], ["city", "比赛城市"], ["venue", "比赛馆"]]) {
    if (!m[key]?.trim()) return `请填写${label}。`;
  }
  if (m.homeTeam.trim() === m.awayTeam.trim()) return "主队与客队名称不能相同。";
  const numbers = new Set();
  let filled = 0;
  for (let index = 0; index < data.players.length; index++) {
    const p = data.players[index];
    const hasCounts = GROUPS.some(({ key }) => groupTotal(p.counts, key) > 0);
    if (!p.name.trim() && !p.number.trim() && !hasCounts) continue;
    if (!p.name.trim() || !p.number.trim()) return `请补全第 ${index + 1} 行队员的姓名和号码；已记录数据的队员不能清空。`;
    if (!/^\d{1,3}$/.test(p.number.trim())) return `第 ${index + 1} 行队员号码应为 0–999 的整数。`;
    if (m.gender === "混合" && !["男", "女"].includes(p.gender)) return `请选择第 ${index + 1} 行队员的性别（男或女）。`;
    const number = Number(p.number.trim());
    if (numbers.has(number)) return `队员号码 ${p.number.trim()} 重复，请检查。`;
    numbers.add(number);
    filled++;
  }
  if (!filled) return "请至少填写一名队员的姓名和号码。";
  return validateStatisticsScores(data.setScores, data.completedSets);
}

export function validateStatisticsScores(setScores, completedSets) {
  for (let i = 0; i < setScores.length; i++) {
    const pair = setScores[i];
    const completed = completedSets ? completedSets[i] : true;
    if (pair.every(value => value === "") && !completed) continue;
    // 兼容旧版无局状态的空白比分。
    if (!completedSets && pair.every(value => value === "")) continue;
    if (!pair.every(value => /^\d{1,3}$/.test(value))) return `请补全第 ${i + 1} 局双方比分（0–999），未开始的局请留空。`;
    if (completed && Number(pair[0]) === Number(pair[1])) return `第 ${i + 1} 局比分相同，不能标记为已结束。`;
  }
  return "";
}
