export const RULESETS = {
  modern: {
    id: "modern",
    label: "FIVB 当前规则",
    edition: "2025–2028 / 2026 国际赛事细则",
    accent: "#155eef",
    defaultCompetitionProfile: "test2026",
    rosterMin: 6,
    rosterMax: 14,
    liberoMax: 2,
    timeoutsPerSet: 2,
    timeoutSeconds: 30,
    pointsColumns: [48, 48, 48, 48, 30],
    source: "https://www.fivb.com/wp-content/uploads/2025/01/FIVB-Volleyball_Rules2025_2028-EN-v05.pdf"
  }
};

export const COMPETITION_PROFILES = {
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

export function setTarget(setNumber, maxSets = 5) {
  return setNumber === maxSets ? 15 : 25;
}

export function isSetComplete(scoreA, scoreB, setNumber, maxSets = 5) {
  const target = setTarget(setNumber, maxSets);
  return Math.max(scoreA, scoreB) >= target && Math.abs(scoreA - scoreB) >= 2;
}

export function isMatchComplete(setsWon, setsToWin = 3) {
  return Math.max(...setsWon) >= setsToWin;
}

export function rotateServiceIndex(index) {
  return (index + 1) % 6;
}

export function servicePlayer(lineup, index) {
  return lineup[index] ?? "—";
}

export function formatClock(date = new Date()) {
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function validateLineup(lineup, rosterNumbers) {
  const cleaned = lineup.map(String).map(value => value.trim());
  if (cleaned.length !== 6 || cleaned.some(value => !value)) {
    return { ok: false, message: "请完整填写 I–VI 六个首发号码。" };
  }
  if (new Set(cleaned).size !== 6) {
    return { ok: false, message: "首发号码不能重复。" };
  }
  const missing = cleaned.filter(value => !rosterNumbers.includes(value));
  if (missing.length) {
    return { ok: false, message: `号码 ${missing.join("、")} 不在本队名单中。` };
  }
  return { ok: true };
}

export function canWinSet(score, opponentScore, setNumber, maxSets = 5) {
  const next = score + 1;
  return isSetComplete(next, opponentScore, setNumber, maxSets);
}
