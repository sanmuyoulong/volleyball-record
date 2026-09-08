// 数据层：比赛状态、本地存储、初始化/恢复/归一化、保存与快照，以及只读状态辅助函数。
// 其他模块通过 `import { state }` 获得实时绑定；对 state 重新赋值的操作会传播到所有导入方。
import {
  RULESETS,
  COMPETITION_PROFILES,
  courtPositionForIndex,
  formatClock,
  isBackRowCourtIndex,
  isMatchComplete,
  isSetComplete,
  rotateServiceIndex,
  servicePlayer,
  setTarget,
  validateLineup
} from "./rules.js";
import { resultFromMatch } from "./tournament-rules.js";

export const STORAGE_KEY = "volley-record-state-v1";
export const SNAPSHOT_KEY = "volley-record-recovery-v1";
export const TOURNAMENTS_KEY = "volley-record-tournaments-v1";
export const ACTIVE_MATCH_KEY = "volley-record-active-match-v1";
export const CONTACT_EMAIL = "2318390047@qq.com";
export const roman = ["I", "II", "III", "IV", "V", "VI"];

export const GENDERS = ["男", "女"];

// 队员性别只在混合比赛中需要逐人填写；男子/女子比赛整队一致，由比赛性别推导。
export function isMixedGender() {
  return state.meta?.gender === "混合";
}

export function genderFromMatch() {
  if (state.meta?.gender === "女子") return "女";
  if (state.meta?.gender === "男子") return "男";
  return "";
}

// 读取名单里的性别：混合比赛以本人填写为准（未填返回空，由 UI 提示补充），其余按比赛性别统一。
export function playerGender(player) {
  if (!isMixedGender()) return genderFromMatch();
  return GENDERS.includes(player?.gender) ? player.gender : "";
}

export function defaultRoster() {
  return Array.from({ length: 14 }, () => ({ number: "", name: "", libero: false, gender: "" }));
}

export function initialState() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return {
    screen: "record",
    selectedRule: "modern",
    setupStep: 1,
    tournamentId: null,
    matchId: null,
    competitionProfile: "official",
    meta: {
      competition: "",
      date: localDate,
      scheduledTime: "",
      venue: "",
      city: "",
      matchNo: "",
      category: "成年组",
      gender: "男子",
      matchFormat: "5"
    },
    teams: [
      { name: "", coach: "", captain: "", roster: defaultRoster() },
      { name: "", coach: "", captain: "", roster: defaultRoster() }
    ],
    officials: {
      firstReferee: "",
      secondReferee: "",
      scorer: "",
      assistantScorer: "",
      lineJudge1: "",
      lineJudge2: ""
    },
    firstLineups: [Array(6).fill(""), Array(6).fill("")],
    firstServer: 0,
    match: null,
    viewSetIndex: 0
  };
}

export function restoreState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.selectedRule && saved?.meta && Array.isArray(saved.teams)) return normalizeState(saved);
  } catch {}
  return initialState();
}

export function normalizeState(saved) {
  const base = initialState();
  const restored = { ...base, ...saved, meta: { ...base.meta, ...saved.meta }, officials: { ...base.officials, ...saved.officials } };
  restored.selectedRule = "modern";
  if (!["record", "setup", "score"].includes(restored.screen)) restored.screen = "record";
  if (!["official", "test2026"].includes(restored.competitionProfile)) restored.competitionProfile = "official";
  // 旧存档的队员没有 gender 字段，这里补齐，混合比赛选人时才有值可用。
  restored.teams = [0, 1].map(index => {
    const savedTeam = Array.isArray(saved.teams) ? saved.teams[index] : null;
    const roster = Array.isArray(savedTeam?.roster) && savedTeam.roster.length ? savedTeam.roster : base.teams[index].roster;
    return { ...base.teams[index], ...(savedTeam || {}), roster: roster.map(player => ({ number: "", name: "", libero: false, gender: "", ...player })) };
  });
  restored.meta.matchFormat = ["3", "5"].includes(String(restored.meta.matchFormat)) ? String(restored.meta.matchFormat) : "5";
  if (restored.match) {
    restored.match.maxSets = Number(restored.match.maxSets || restored.meta.matchFormat || 5);
    restored.match.setsToWin = Number(restored.match.setsToWin || Math.floor(restored.match.maxSets / 2) + 1);
    restored.match.auditLog = Array.isArray(restored.match.auditLog) ? restored.match.auditLog : [];
    restored.match.sanctions = Array.isArray(restored.match.sanctions) ? restored.match.sanctions : [];
    restored.match.improperRequests = restored.match.improperRequests || [0, 0];
    restored.match.delayWarnings = restored.match.delayWarnings || [false, false];
    restored.match.liberoControl = restored.match.liberoControl || [0, 1].map(() => ({ unavailable: [], redesignations: [] }));
    restored.match.endingPending = Boolean(restored.match.endingPending);
    restored.match.endConfirmation = restored.match.endConfirmation || null;
    restored.match.sets = restored.match.sets.map(set => ({
      ...set,
      liberoReplacements: set.liberoReplacements || [[], []],
      liberoState: set.liberoState || [0, 1].map(() => ({ active: null, lastReplacementRally: -1 })),
      sanctions: set.sanctions || []
    }));
  }
  return restored;
}

export let state = restoreState();

export function replaceState(nextState) {
  state = nextState;
}

export function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  syncActiveMatch();
  const label = document.querySelector("#save-label");
  if (label) label.textContent = `已保存 ${formatClock()}`;
}

export function clone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

export function matchSnapshot() {
  if (!state.match) return null;
  const snapshot = clone(state.match);
  delete snapshot.auditLog;
  delete snapshot.undoStack;
  return snapshot;
}

let lastRecoverySnapshotAt = 0;

export function recoverySnapshots() {
  try { return JSON.parse(localStorage.getItem(SNAPSHOT_KEY)) || []; } catch { return []; }
}

export function saveRecoverySnapshot(label, force = false) {
  if (!state.match) return;
  const now = Date.now();
  if (!force && now - lastRecoverySnapshotAt < 15000) return;
  lastRecoverySnapshotAt = now;
  try {
    const snapshots = recoverySnapshots();
    snapshots.unshift({ id: `${now}`, at: new Date().toISOString(), label, state: clone(state) });
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshots.slice(0, 5)));
  } catch {}
}

// 赛事与比赛归档层。
// STORAGE_KEY 始终代表"当前正在记录的一场"，现有记分逻辑不感知赛事的存在；
// 赛事索引只保存摘要，每场比赛的完整数据按 matchId 归档到独立键，切换比赛时通过活动槽载入。
export function tournaments() {
  try { return JSON.parse(localStorage.getItem(TOURNAMENTS_KEY)) || []; } catch { return []; }
}

export function saveTournaments(list) {
  try { localStorage.setItem(TOURNAMENTS_KEY, JSON.stringify(list)); return true; } catch { return false; }
}

// 赛事默认赛制：单循环。分组循环+淘汰 / 单淘汰在设置界面覆盖。
export function defaultFormat() {
  return { type: "single-round-robin", groups: 2, advancePerGroup: 1, thirdPlace: false };
}

export function matchKey(matchId) {
  return `volley-record-match-${matchId}`;
}

export function readMatch(matchId) {
  if (!matchId) return null;
  try { return JSON.parse(localStorage.getItem(matchKey(matchId))); } catch { return null; }
}

export function writeMatch(matchId, data) {
  if (!matchId) return false;
  try { localStorage.setItem(matchKey(matchId), JSON.stringify(data)); return true; } catch { return false; }
}

export function deleteMatch(matchId) {
  if (!matchId) return;
  try { localStorage.removeItem(matchKey(matchId)); } catch {}
}

export function activeMatch() {
  try { return JSON.parse(localStorage.getItem(ACTIVE_MATCH_KEY)); } catch { return null; }
}

export function setActiveMatch(matchId, tournamentId = null) {
  try {
    if (!matchId) localStorage.removeItem(ACTIVE_MATCH_KEY);
    else localStorage.setItem(ACTIVE_MATCH_KEY, JSON.stringify({ matchId, tournamentId }));
  } catch {}
}

export function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function matchSummary(source = state) {
  const teamNames = (source.teams || []).map(team => team.name || "待填写");
  const match = source.match;
  let status = "待开始";
  let scoreText = "尚未开始";
  if (match) {
    const sets = match.sets || [];
    const wins = [0, 0];
    sets.forEach(set => { if (set.ended && set.winner != null) wins[set.winner] += 1; });
    const current = sets[match.currentSetIndex];
    scoreText = `局分 ${wins[0]} : ${wins[1]}`;
    if (current && !current.ended) scoreText += ` · 本局 ${current.score[0]} : ${current.score[1]}`;
    const setsToWin = match.setsToWin || Math.floor((match.maxSets || 5) / 2) + 1;
    status = isMatchComplete(wins, setsToWin) ? "已结束" : "进行中";
  } else if (source.screen === "setup") {
    status = "填写赛前信息";
  }
  return {
    id: source.matchId,
    teamA: teamNames[0] || "待填写",
    teamB: teamNames[1] || "待填写",
    scoreText,
    status,
    updatedAt: new Date().toISOString()
  };
}

// 每次保存都把当前比赛写回归档，并刷新所属赛事里的摘要。
// 没有 matchId 表示这是一场独立比赛（不归属任何赛事），直接跳过。
export function syncActiveMatch() {
  if (!state.matchId) return;
  const active = activeMatch();
  writeMatch(state.matchId, state);
  if (!active?.tournamentId) return;
  const list = tournaments();
  const tournament = list.find(item => item.id === active.tournamentId);
  if (!tournament) return;
  tournament.matches = Array.isArray(tournament.matches) ? tournament.matches : [];
  const summary = matchSummary(state);
  summary.result = resultFromMatch(state);
  const index = tournament.matches.findIndex(item => item.id === state.matchId);
  if (index >= 0) tournament.matches[index] = { ...tournament.matches[index], ...summary };
  else tournament.matches.push(summary);
  // 若这场比赛属于赛程中的某个 fixture，把赛果回填，对阵图/积分表才能实时更新。
  if (Array.isArray(tournament.schedule)) {
    const fx = tournament.schedule.find(item => item.matchId === state.matchId);
    if (fx) fx.result = resultFromMatch(state);
  }
  saveTournaments(list);
}

export function currentSet() {
  return state.match.sets[state.match.currentSetIndex];
}

export function currentProfile() {
  return COMPETITION_PROFILES[state.competitionProfile] || COMPETITION_PROFILES.official;
}

export function matchFormatLabel() {
  return Number(state.match?.maxSets || state.meta.matchFormat) === 3 ? "三局两胜" : "五局三胜";
}

export function createSet(number, lineups, firstServer) {
  const set = {
    number,
    startTime: formatClock(),
    endTime: "",
    score: [0, 0],
    lineups: clone(lineups),
    onCourt: clone(lineups),
    firstServer,
    servingTeam: firstServer,
    rotationIndex: [0, 0],
    serviceRounds: Array.from({ length: 2 }, () => Array.from({ length: 6 }, () => [])),
    timeouts: [[], []],
    substitutions: [[], []],
    liberoReplacements: [[], []],
    liberoState: [0, 1].map(() => ({ active: null, lastReplacementRally: -1 })),
    sanctions: [],
    subCount: [0, 0],
    subPairs: [{}, {}],
    rallies: [],
    events: [],
    courtChanged: false,
    ended: false,
    winner: null
  };
  set.serviceRounds[firstServer][0].push({ active: true, startScore: "0:0", endScore: null });
  set.events.push({ time: set.startTime, text: `第 ${number} 局开始，${state.teams[firstServer].name} 先发球。` });
  return set;
}

export function rosterNumbers(teamIndex) {
  return state.teams[teamIndex].roster.filter(player => player.number && player.name).map(player => player.number);
}

export function playerName(teamIndex, number) {
  return state.teams[teamIndex].roster.find(player => player.number === String(number))?.name || "";
}

export function liberoPlayers(teamIndex) {
  const control = state.match?.liberoControl?.[teamIndex];
  const redesignated = new Set((control?.redesignations || []).map(item => item.number));
  const unavailable = new Set(control?.unavailable || []);
  return state.teams[teamIndex].roster.filter(player => player.number && player.name && (player.libero || redesignated.has(player.number)) && !unavailable.has(player.number));
}

export function isLiberoNumber(teamIndex, number) {
  return liberoPlayers(teamIndex).some(player => player.number === String(number));
}

export function allDesignatedLiberoNumbers(teamIndex) {
  const original = state.teams[teamIndex].roster.filter(player => player.libero).map(player => player.number);
  const redesignated = (state.match?.liberoControl?.[teamIndex]?.redesignations || []).map(item => item.number);
  return [...new Set([...original, ...redesignated])];
}

export function liberoStatusText(teamIndex, set = currentSet()) {
  const active = set.liberoState[teamIndex].active;
  if (!liberoPlayers(teamIndex).length) return "未登记";
  if (!active) return `${set.liberoReplacements[teamIndex].length} 次 · 场外`;
  return `${active.libero} 号在场${liberoNeedsImmediateExit(teamIndex, set) ? " · 需离场" : ""}`;
}

export function liberoNeedsImmediateExit(teamIndex, set = currentSet()) {
  const active = set.liberoState[teamIndex]?.active;
  if (!active) return false;
  const position = courtPositionForIndex(active.positionIndex, set.rotationIndex[teamIndex]);
  return [1, 2, 3].includes(position) || (position === 0 && set.servingTeam === teamIndex);
}

export function eligibleLiberoRegulars(teamIndex, set = currentSet()) {
  return set.onCourt[teamIndex].map((number, positionIndex) => ({
    number,
    positionIndex,
    courtPosition: courtPositionForIndex(positionIndex, set.rotationIndex[teamIndex])
  })).filter(item => {
    if (isLiberoNumber(teamIndex, item.number) || !isBackRowCourtIndex(item.positionIndex, set.rotationIndex[teamIndex])) return false;
    if (item.courtPosition === 0 && set.servingTeam === teamIndex) return false;
    return true;
  });
}
