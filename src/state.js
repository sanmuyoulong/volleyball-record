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

export const STORAGE_KEY = "volley-record-state-v1";
export const SNAPSHOT_KEY = "volley-record-recovery-v1";
export const CONTACT_EMAIL = "2318390047@qq.com";
export const roman = ["I", "II", "III", "IV", "V", "VI"];

export function defaultRoster() {
  return Array.from({ length: 14 }, () => ({ number: "", name: "", libero: false }));
}

export function initialState() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return {
    screen: "record",
    selectedRule: "modern",
    setupStep: 1,
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
