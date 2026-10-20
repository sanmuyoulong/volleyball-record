export const RULESETS = {
  modern: {
    id: "modern",
    label: "FIVB 当前规则",
    edition: "2025–2028 / 2026 国际赛事细则",
    accent: "#155eef",
    defaultCompetitionProfile: "test2026",
    playersOnCourt: 6,
    regularTarget: 25,
    maxSets: 5,
    rotateEveryPoint: false,
    unrestrictedSubstitutions: false,
    rosterMin: 6,
    rosterMax: 14,
    liberoMax: 2,
    timeoutsPerSet: 2,
    timeoutSeconds: 30,
    pointsColumns: [48, 48, 48, 48, 30],
    source: "https://www.fivb.com/wp-content/uploads/2025/01/FIVB-Volleyball_Rules2025_2028-EN-v05.pdf"
  },
  air: {
    id: "air",
    label: "气排球记录（五人制）",
    edition: "2026–2029",
    accent: "#155eef",
    defaultCompetitionProfile: "air2026",
    playersOnCourt: 5,
    regularTarget: 21,
    maxSets: 3,
    rotateEveryPoint: true,
    unrestrictedSubstitutions: true,
    rosterMin: 5,
    rosterMax: 10,
    liberoMax: 0,
    timeoutsPerSet: 2,
    timeoutSeconds: 30,
    pointsColumns: [30, 30, 24],
    source: "https://www.cesa.org.cn/Htmlfolder/bmxx/Content_8321.shtml"
  }
};

export const COMPETITION_PROFILES = {
  air2026: {
    id: "air2026",
    label: "气排球 2026–2029 · 五人制",
    substitutionsPerSet: 6,
    description: "三局两胜，前两局 21 分、决胜局 15 分，均须领先 2 分且无封顶；得分方每球轮转发球。每队每局 2 次 30 秒暂停、6 人次换人，不设自由人。"
  },
  official: {
    id: "official",
    label: "2025–2028 正式基线",
    substitutionsPerSet: 6,
    description: "现行正式规则：每队每局最多 2 次暂停、6 次换人。"
  },
  test2026: {
    id: "test2026",
    label: "2026 指定国际赛事试行",
    substitutionsPerSet: 8,
    description: "适用于 2026 VNL、U17 世锦赛和洲际锦标赛等指定赛事：每局试行 8 次换人。"
  }
};

export function setTarget(setNumber, maxSets = 5, ruleId = "modern") {
  return setNumber === maxSets ? 15 : (RULESETS[ruleId] || RULESETS.modern).regularTarget;
}

export function isSetComplete(scoreA, scoreB, setNumber, maxSets = 5, ruleId = "modern") {
  const target = setTarget(setNumber, maxSets, ruleId);
  return Math.max(scoreA, scoreB) >= target && Math.abs(scoreA - scoreB) >= 2;
}

export function isMatchComplete(setsWon, setsToWin = 3) {
  return Math.max(...setsWon) >= setsToWin;
}

export function rotateServiceIndex(index, playersOnCourt = 6) {
  return (index + 1) % playersOnCourt;
}

export function servicePlayer(lineup, index) {
  return lineup[index] ?? "—";
}

export function courtPositionForIndex(courtIndex, rotationIndex) {
  return (courtIndex - rotationIndex + 6) % 6;
}

export function isBackRowCourtIndex(courtIndex, rotationIndex) {
  return [0, 4, 5].includes(courtPositionForIndex(courtIndex, rotationIndex));
}

export function canMakeLiberoReplacement(lastReplacementRally, completedRallies) {
  return lastReplacementRally < 0 || completedRallies > lastReplacementRally;
}

export function formatClock(date = new Date()) {
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function validateLineup(lineup, rosterNumbers, playersOnCourt = 6) {
  const cleaned = lineup.map(String).map(value => value.trim());
  if (cleaned.length !== playersOnCourt || cleaned.some(value => !value)) {
    return { ok: false, message: playersOnCourt === 5 ? "请完整填写 I–V 五个首发号码。" : "请完整填写 I–VI 六个首发号码。" };
  }
  if (new Set(cleaned).size !== playersOnCourt) {
    return { ok: false, message: "首发号码不能重复。" };
  }
  const missing = cleaned.filter(value => !rosterNumbers.includes(value));
  if (missing.length) {
    return { ok: false, message: `号码 ${missing.join("、")} 不在本队名单中。` };
  }
  return { ok: true };
}

export function canWinSet(score, opponentScore, setNumber, maxSets = 5, ruleId = "modern") {
  const next = score + 1;
  return isSetComplete(next, opponentScore, setNumber, maxSets, ruleId);
}
