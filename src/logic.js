// 业务逻辑层：所有改变比赛事实的 mutation（加分、轮转、换人、自由人、判罚、暂停、比赛生命周期）。
// 依赖 state / audit / ui，并在完成修改后通过 render 层重渲染或打开弹窗。
// 与 render.js 存在循环导入（render 的事件绑定调用本层函数，本层修改后调用 render 重渲染），
// 由于两侧引用都在函数体内、运行时才执行，ES 模块循环导入安全。
import {
  RULESETS,
  canMakeLiberoReplacement,
  courtPositionForIndex,
  formatClock,
  isBackRowCourtIndex,
  isMatchComplete,
  isSetComplete,
  rotateServiceIndex,
  servicePlayer,
  validateLineup
} from "./rules.js";
import {
  state,
  currentSet,
  currentProfile,
  createSet,
  rosterNumbers,
  isLiberoNumber,
  liberoPlayers,
  allDesignatedLiberoNumbers,
  eligibleLiberoRegulars,
  liberoNeedsImmediateExit,
  matchSnapshot,
  saveRecoverySnapshot,
  roman
} from "./state.js";
import { recordAuditAction, reverseLatestAction, latestReversibleAction } from "./audit.js";
import { toast, modalRoot, app } from "./ui.js";
import { render, renderScore, openMatchEndConfirmationModal, openSetEndModal, openTimeoutModal } from "./render.js";

export function awardPoint(teamIndex, shouldRender = true, source = "rally") {
  const set = currentSet();
  if (set.ended) return;
  const before = source === "sanction" ? null : matchSnapshot();
  const wasServing = set.servingTeam === teamIndex;
  set.score[teamIndex] += 1;
  set.rallies.push({ winner: teamIndex, at: formatClock(), source, teamPoint: set.score[teamIndex] });
  if (!wasServing) {
    const previousTeam = set.servingTeam;
    closeActiveServiceRound(set, previousTeam);
    set.rotationIndex[teamIndex] = rotateServiceIndex(set.rotationIndex[teamIndex]);
    set.servingTeam = teamIndex;
    set.serviceRounds[teamIndex][set.rotationIndex[teamIndex]].push({
      active: true,
      startScore: `${set.score[teamIndex]}:${set.score[1 - teamIndex]}`,
      endScore: null
    });
    const server = servicePlayer(set.onCourt[teamIndex], set.rotationIndex[teamIndex]);
    set.events.push({ time: formatClock(), text: source === "sanction" ? `${state.teams[teamIndex].name} 因对方判罚得分并获得发球权，轮转后由 ${server} 号发球。` : `${state.teams[teamIndex].name} 得分并获得发球权，轮转后由 ${server} 号发球。` });
  } else {
    set.events.push({ time: formatClock(), text: source === "sanction" ? `${state.teams[teamIndex].name} 因对方判罚得分，继续发球。` : `${state.teams[teamIndex].name} 得分，继续发球。` });
  }
  if (set.number === state.match.maxSets && !set.courtChanged && Math.max(...set.score) >= 8) {
    set.courtChanged = true;
    set.events.push({ time: formatClock(), text: `领先队达到 8 分，双方交换场区；轮次保持不变。` });
  }
  if (isSetComplete(set.score[0], set.score[1], set.number, state.match.maxSets)) finishSet(set);
  if (source !== "sanction") recordAuditAction("score", `${state.teams[teamIndex].name} +1`, before, { teamIndex, source });
  if (shouldRender) {
    state.viewSetIndex = state.match.currentSetIndex;
    render();
  }
}

export function closeActiveServiceRound(set, teamIndex) {
  const rounds = set.serviceRounds[teamIndex][set.rotationIndex[teamIndex]];
  const active = [...rounds].reverse().find(round => round.active);
  if (active) {
    active.active = false;
    active.endScore = set.score[teamIndex];
  }
}

export function undoPoint(teamIndex) {
  const set = currentSet();
  if (set.rallies.at(-1)?.winner !== teamIndex || set.rallies.at(-1)?.source === "sanction") return toast("减分只用于撤销该队刚刚获得的普通得分；判罚得分请在操作日志中纠正。", "error");
  const latest = latestReversibleAction();
  if (latest?.type !== "score" || latest.meta?.teamIndex !== teamIndex) return toast("最后一个有效操作不是该队得分，请打开操作日志检查。", "error");
  const result = reverseLatestAction("记录员使用减分按钮撤销最后一次普通得分");
  if (!result.ok) return toast(result.message, "error");
  render();
  toast("已撤销上一分，发球轮次和记录表同步恢复。 ");
}

export function finishSet(set) {
  closeActiveServiceRound(set, set.servingTeam);
  set.ended = true;
  set.endTime = formatClock();
  set.winner = set.score[0] > set.score[1] ? 0 : 1;
  state.match.setsWon[set.winner] += 1;
  set.events.push({ time: set.endTime, text: `${state.teams[set.winner].name} 以 ${set.score[set.winner]}:${set.score[1 - set.winner]} 赢得本局。` });
  if (isMatchComplete(state.match.setsWon, state.match.setsToWin)) {
    state.match.endingPending = true;
    state.match.ended = false;
    state.match.endedAt = "";
    setTimeout(openMatchEndConfirmationModal, 60);
  } else {
    setTimeout(() => openSetEndModal(set), 60);
  }
}

export function requestTimeout(teamIndex) {
  const set = currentSet();
  if (set.timeouts[teamIndex].length >= RULESETS[state.selectedRule].timeoutsPerSet) return;
  const before = matchSnapshot();
  const score = `${set.score[teamIndex]}:${set.score[1 - teamIndex]}`;
  set.timeouts[teamIndex].push(score);
  set.events.push({ time: formatClock(), text: `${state.teams[teamIndex].name} 请求第 ${set.timeouts[teamIndex].length} 次暂停（${score}）。` });
  recordAuditAction("timeout", `${state.teams[teamIndex].name} 第 ${set.timeouts[teamIndex].length} 次暂停`, before, { teamIndex });
  renderScore();
  openTimeoutModal(teamIndex, RULESETS[state.selectedRule].timeoutSeconds);
}

export function resolveDelaySanction(teamIndex) {
  if (!state.match.delayWarnings[teamIndex]) {
    state.match.delayWarnings[teamIndex] = true;
    return { resolvedKind: "delayWarning", label: "延误警告", card: "D-W", pointAwarded: false };
  }
  return { resolvedKind: "delayPenalty", label: "延误判罚", card: "D-P", pointAwarded: true };
}

export function applySanction(teamIndex, requestedKind, target, note, shouldRender = true) {
  const set = currentSet();
  if (set.ended) return { ok: false, message: "本局已结束，不能继续登记判罚。" };
  if (![0, 1].includes(teamIndex)) return { ok: false, message: "请选择责任队伍。" };
  const before = matchSnapshot();
  let outcome;
  if (requestedKind === "improper") {
    state.match.improperRequests[teamIndex] += 1;
    outcome = state.match.improperRequests[teamIndex] === 1
      ? { resolvedKind: "improper", label: "不当请求", card: "IR", pointAwarded: false }
      : resolveDelaySanction(teamIndex);
  } else if (requestedKind === "delay") {
    outcome = resolveDelaySanction(teamIndex);
  } else {
    outcome = {
      warning: { resolvedKind: "warning", label: "行为警告", card: "黄牌", pointAwarded: false },
      penalty: { resolvedKind: "penalty", label: "行为罚分", card: "红牌", pointAwarded: true },
      expulsion: { resolvedKind: "expulsion", label: "驱逐", card: "红黄牌同持", pointAwarded: false },
      disqualification: { resolvedKind: "disqualification", label: "取消比赛资格", card: "红黄牌分持", pointAwarded: false }
    }[requestedKind];
  }
  if (!outcome) return { ok: false, message: "未知的判罚类型。" };
  const scoreBefore = `${set.score[0]}:${set.score[1]}`;
  const record = { id: `${Date.now()}-${state.match.sanctions.length + 1}`, teamIndex, team: state.teams[teamIndex].name, requestedKind, ...outcome, target: target || "球队", note, setNumber: set.number, scoreBefore, scoreAfter: scoreBefore, at: formatClock() };
  state.match.sanctions.push(record);
  set.sanctions.push(record);
  set.events.push({ time: record.at, text: `${state.teams[teamIndex].name}：${record.label}${target ? `（${target}）` : ""}${note ? `，${note}` : ""}。` });
  if (record.pointAwarded) {
    awardPoint(1 - teamIndex, false, "sanction");
    record.scoreAfter = `${set.score[0]}:${set.score[1]}`;
  }
  recordAuditAction("sanction", `${state.teams[teamIndex].name}：${record.label}`, before, { teamIndex, requestedKind, resolvedKind: record.resolvedKind, pointAwarded: record.pointAwarded });
  if (shouldRender) {
    modalRoot.replaceChildren();
    render();
    toast(record.pointAwarded ? `${record.label}已登记，对方获得一分和发球权。` : `${record.label}已写入记录表。`);
  }
  return { ok: true, record };
}

export function performLiberoReplacement(teamIndex, action, regular, libero, shouldRender = true) {
  const set = currentSet();
  const control = set.liberoState[teamIndex];
  if (!canMakeLiberoReplacement(control.lastReplacementRally, set.rallies.length)) return { ok: false, message: "两次自由人替换之间必须完成一个回合。" };
  const before = matchSnapshot();
  let positionIndex = -1;
  let text = "";
  if (action === "enter") {
    if (control.active) return { ok: false, message: "已有自由人在场。" };
    const selectedLibero = liberoPlayers(teamIndex).find(player => player.number === libero);
    if (!selectedLibero) return { ok: false, message: "请选择已登记的自由人。" };
    const eligible = eligibleLiberoRegulars(teamIndex, set).find(item => item.number === regular);
    if (!eligible) return { ok: false, message: "所选球员当前不在可替换的后排位置。" };
    positionIndex = eligible.positionIndex;
    set.onCourt[teamIndex][positionIndex] = libero;
    control.active = { libero, regular, positionIndex };
    text = `${libero} 号自由人进入，替换 ${regular} 号常规球员`;
  } else if (action === "exit") {
    if (!control.active || control.active.regular !== regular) return { ok: false, message: "自由人对应关系已变化，请重新打开操作窗口。" };
    positionIndex = control.active.positionIndex;
    libero = control.active.libero;
    set.onCourt[teamIndex][positionIndex] = regular;
    control.active = null;
    text = `${regular} 号常规球员换回，${libero} 号自由人离场`;
  } else if (action === "switch") {
    if (!control.active) return { ok: false, message: "当前没有场上自由人。" };
    if (liberoNeedsImmediateExit(teamIndex, set)) return { ok: false, message: "自由人处于必须离场的位置，不能直接更换为第二自由人。" };
    const second = liberoPlayers(teamIndex).find(player => player.number === libero && player.number !== control.active.libero);
    if (!second || set.onCourt[teamIndex].includes(libero)) return { ok: false, message: "请选择场外的第二自由人。" };
    positionIndex = control.active.positionIndex;
    const previousLibero = control.active.libero;
    set.onCourt[teamIndex][positionIndex] = libero;
    control.active.libero = libero;
    text = `${previousLibero} 号自由人离场，${libero} 号第二自由人进入，继续替换 ${regular} 号`;
  } else {
    return { ok: false, message: "未知的自由人操作。" };
  }
  control.lastReplacementRally = set.rallies.length;
  const score = `${set.score[teamIndex]}:${set.score[1 - teamIndex]}`;
  const record = { team: state.teams[teamIndex].name, action, regular, libero, positionIndex, score, at: formatClock(), rallyIndex: set.rallies.length, text };
  set.liberoReplacements[teamIndex].push(record);
  set.events.push({ time: record.at, text: `${state.teams[teamIndex].name} 自由人替换：${text}（${score}）。` });
  recordAuditAction("libero", `${state.teams[teamIndex].name}：${text}`, before, { teamIndex, action, regular, libero });
  if (shouldRender) {
    modalRoot.replaceChildren();
    render();
    toast("自由人替换已写入电子控制记录。 ");
  }
  return { ok: true };
}

export function applyLiberoRedesignation(teamIndex, unavailableNumber, newLiberoNumber, reason, shouldRender = true) {
  const set = currentSet();
  const matchControl = state.match.liberoControl[teamIndex];
  const setControl = set.liberoState[teamIndex];
  const available = liberoPlayers(teamIndex);
  if (!available.some(player => player.number === unavailableNumber)) return { ok: false, message: "请选择当前仍可用的自由人。" };
  if (!reason) return { ok: false, message: "请填写自由人无法继续比赛的原因。" };
  const remaining = available.filter(player => player.number !== unavailableNumber);
  if (remaining.length && newLiberoNumber) return { ok: false, message: "球队仍有另一名可用自由人，目前不能重新指定。" };
  let newLibero = null;
  if (newLiberoNumber) {
    newLibero = state.teams[teamIndex].roster.find(player => player.number === newLiberoNumber);
    const active = setControl.active;
    if (!newLibero || set.onCourt[teamIndex].includes(newLiberoNumber) || allDesignatedLiberoNumbers(teamIndex).includes(newLiberoNumber) || newLiberoNumber === active?.regular) return { ok: false, message: "新自由人必须是当前场外、尚未担任自由人且不是对应常规替换球员的队员。" };
  }
  const before = matchSnapshot();
  matchControl.unavailable.push(unavailableNumber);
  let replacement = remaining[0]?.number || "";
  if (!remaining.length && newLibero) {
    const designation = { number: newLibero.number, replaces: unavailableNumber, reason, setNumber: set.number, at: formatClock() };
    matchControl.redesignations.push(designation);
    replacement = newLibero.number;
  }
  const active = setControl.active;
  let courtText = "";
  if (active?.libero === unavailableNumber) {
    if (replacement) {
      set.onCourt[teamIndex][active.positionIndex] = replacement;
      active.libero = replacement;
      courtText = `，由 ${replacement} 号自由人立即接替`;
    } else {
      set.onCourt[teamIndex][active.positionIndex] = active.regular;
      courtText = `，由 ${active.regular} 号常规球员换回`;
      setControl.active = null;
    }
    setControl.lastReplacementRally = set.rallies.length;
  }
  const text = newLibero ? `${unavailableNumber} 号自由人因${reason}无法继续，重新指定 ${newLibero.number} 号为自由人${courtText}` : `${unavailableNumber} 号自由人因${reason}无法继续${courtText}`;
  const record = { team: state.teams[teamIndex].name, action: "redesignation", regular: active?.regular || "—", libero: replacement || unavailableNumber, positionIndex: active?.positionIndex ?? -1, score: `${set.score[teamIndex]}:${set.score[1 - teamIndex]}`, at: formatClock(), rallyIndex: set.rallies.length, text };
  set.liberoReplacements[teamIndex].push(record);
  set.events.push({ time: record.at, text: `${state.teams[teamIndex].name}：${text}。` });
  recordAuditAction("libero", `${state.teams[teamIndex].name}：${text}`, before, { teamIndex, unavailableNumber, newLiberoNumber, reason });
  if (shouldRender) {
    modalRoot.replaceChildren();
    render();
    toast("自由人无法继续与重新指定信息已写入比赛记录。 ");
  }
  return { ok: true };
}

export function performSubstitution(teamIndex, out, incoming, shouldRender = true) {
  const set = currentSet();
  const max = currentProfile().substitutionsPerSet;
  if (!out || !incoming) return { ok: false, message: "请选择离场和上场球员号码。" };
  if (set.subCount[teamIndex] >= max) return { ok: false, message: `本局已达到 ${max} 次普通换人上限。` };
  const courtIndex = set.onCourt[teamIndex].indexOf(out);
  if (courtIndex < 0) return { ok: false, message: `${out} 号当前不在场上。` };
  if (!rosterNumbers(teamIndex).includes(incoming)) return { ok: false, message: `${incoming} 号不在本队名单中。` };
  if (set.onCourt[teamIndex].includes(incoming)) return { ok: false, message: `${incoming} 号已经在场上。` };
  if (isLiberoNumber(teamIndex, incoming)) return { ok: false, message: "自由人替换不计入普通换人，应使用自由人控制流程。" };
  const before = matchSnapshot();
  const starter = set.lineups[teamIndex].includes(out);
  let original = out;
  if (starter) {
    const pair = set.subPairs[teamIndex][out];
    if (pair?.returned) return { ok: false, message: `${out} 号已完成一次离场和重新上场，不能再次进行普通换人。` };
    if (pair && pair.substitute !== incoming) return { ok: false, message: `${out} 号只能与先前登记的 ${pair.substitute} 号完成换回。` };
    if (!pair) set.subPairs[teamIndex][out] = { substitute: incoming, returned: false };
  } else {
    const entry = Object.entries(set.subPairs[teamIndex]).find(([, pair]) => pair.substitute === out && !pair.returned);
    if (!entry || entry[0] !== incoming) return { ok: false, message: `${out} 号替补只能由其对应的首发球员换回。` };
    original = incoming;
    entry[1].returned = true;
  }
  set.onCourt[teamIndex][courtIndex] = incoming;
  set.subCount[teamIndex] += 1;
  const score = `${set.score[teamIndex]}:${set.score[1 - teamIndex]}`;
  const positionIndex = set.lineups[teamIndex].indexOf(original);
  set.substitutions[teamIndex].push({ team: state.teams[teamIndex].name, out, in: incoming, score, positionIndex, at: formatClock() });
  set.events.push({ time: formatClock(), text: `${state.teams[teamIndex].name} 换人：${out} 号下，${incoming} 号上（${score}）。` });
  recordAuditAction("substitution", `${state.teams[teamIndex].name} 换人：${out} 号下，${incoming} 号上`, before, { teamIndex, out, incoming });
  if (shouldRender) {
    modalRoot.replaceChildren();
    render();
    toast("换人号码和换人时比分已写入记录表。 ");
  }
  return { ok: true };
}

export function startMatch() {
  const maxSets = Number(state.meta.matchFormat) === 3 ? 3 : 5;
  state.match = {
    startedAt: formatClock(),
    endedAt: "",
    maxSets,
    setsToWin: Math.floor(maxSets / 2) + 1,
    setsWon: [0, 0],
    sanctions: [],
    improperRequests: [0, 0],
    delayWarnings: [false, false],
    liberoControl: [0, 1].map(() => ({ unavailable: [], redesignations: [] })),
    auditLog: [],
    sets: [createSet(1, state.firstLineups, state.firstServer)],
    currentSetIndex: 0,
    undoStack: [],
    endingPending: false,
    endConfirmation: null,
    ended: false
  };
  state.viewSetIndex = 0;
  state.screen = "score";
  recordAuditAction("match", "比赛开始并写入第一局轮次", null, { firstServer: state.firstServer });
  saveRecoverySnapshot("比赛开始", true);
  render();
  toast("比赛已开始，第一局轮次已写入记录表。 ");
}

export function loadDemoMatch() {
  state.selectedRule = "modern";
  state.competitionProfile = "test2026";
  state.meta = {
    competition: "2026 城市排球邀请赛",
    date: "2026-08-28",
    scheduledTime: "19:30",
    venue: "滨江综合体育馆",
    city: "杭州",
    matchNo: "A-07",
    category: "成年组",
    gender: "男子",
    matchFormat: "5"
  };
  applyDemoRosters();
  state.officials = {
    firstReferee: "周远",
    secondReferee: "林蔚",
    scorer: "陈曦",
    assistantScorer: "许嘉",
    lineJudge1: "罗晨",
    lineJudge2: "方卓"
  };
  state.firstLineups = [["8", "4", "12", "2", "5", "13"], ["1", "9", "6", "11", "3", "7"]];
  state.firstServer = 0;
  startMatch();
  const sequence = [0,0,0,1,1,0,1,0,0,1,0,1,0,1];
  sequence.forEach(team => awardPoint(team, false));
  const set = currentSet();
  set.timeouts[1].push(`${set.score[1]}:${set.score[0]}`);
  set.events.push({ time: formatClock(), text: `${state.teams[1].name} 请求第 1 次暂停（${set.score[1]}:${set.score[0]}）。` });
  performSubstitution(0, "13", "7", false);
  render();
}

export function applyDemoRosters() {
  const namesA = ["程野","陆骁","陈放","高桥","梁川","吴桐","韩序","沈舟","邵一","孟驰","许燃","唐越","季风","宋扬"];
  const namesB = ["顾北","裴安","程屿","苏秦","闻舟","江澄","贺朗","秦屿","林哲","周野","顾言","许川","沈言","白屿"];
  state.teams = [
    { name: "海风俱乐部", coach: "秦牧", captain: "8", roster: namesA.map((name, index) => ({ number: String(index + 1), name, libero: [5, 9].includes(index) })) },
    { name: "北辰体育", coach: "陆明", captain: "1", roster: namesB.map((name, index) => ({ number: String(index + 1), name, libero: [4, 13].includes(index) })) }
  ];
}

export function readSetupStep(validate) {
  const form = app?.querySelector("#setup-form");
  const data = new FormData(form);
  if (state.setupStep === 1) {
    Object.keys(state.meta).forEach(key => {
      if (data.has(key)) state.meta[key] = String(data.get(key)).trim();
    });
    if (validate && ["competition", "date", "scheduledTime", "venue"].some(key => !state.meta[key])) return { ok: false, message: "请填写比赛名称、日期、计划开始时间和比赛场馆。" };
  }
  if (state.setupStep === 2) {
    state.teams.forEach((team, teamIndex) => {
      team.name = String(data.get(`team-name-${teamIndex}`) || "").trim();
      team.coach = String(data.get(`coach-${teamIndex}`) || "").trim();
      team.captain = String(data.get(`captain-${teamIndex}`) || "").trim();
      team.roster = team.roster.map((player, playerIndex) => ({
        number: String(data.get(`player-number-${teamIndex}-${playerIndex}`) || "").trim(),
        name: String(data.get(`player-name-${teamIndex}-${playerIndex}`) || "").trim(),
        libero: data.has(`player-libero-${teamIndex}-${playerIndex}`)
      }));
    });
    if (validate) {
      if (state.teams.some(team => !team.name)) return { ok: false, message: "请填写两支队伍的名称。" };
      for (const team of state.teams) {
        const players = team.roster.filter(player => player.number && player.name);
        if (players.length < 6) return { ok: false, message: `${team.name} 至少需要 6 名有号码和姓名的球员。` };
        const numbers = players.map(player => player.number);
        if (new Set(numbers).size !== numbers.length) return { ok: false, message: `${team.name} 存在重复号码。` };
        if (players.filter(player => player.libero).length > 2) return { ok: false, message: `${team.name} 最多标记 2 名自由人。` };
        if (!numbers.includes(team.captain)) return { ok: false, message: `${team.name} 的队长号码不在名单中。` };
      }
    }
  }
  if (state.setupStep === 3) {
    Object.keys(state.officials).forEach(key => state.officials[key] = String(data.get(key) || "").trim());
    if (validate && ["firstReferee", "secondReferee", "scorer"].some(key => !state.officials[key])) return { ok: false, message: "请至少填写第一裁判员、第二裁判员和记录员。" };
  }
  if (state.setupStep === 4) {
    state.firstLineups = state.teams.map((_, teamIndex) => roman.map((__, positionIndex) => String(data.get(`setup-lineup-${teamIndex}-${positionIndex}`) || "").trim()));
    state.firstServer = Number(data.get("firstServer") || 0);
    if (validate) {
      for (let teamIndex = 0; teamIndex < 2; teamIndex++) {
        const result = validateLineup(state.firstLineups[teamIndex], rosterNumbers(teamIndex));
        if (!result.ok) return { ok: false, message: `${state.teams[teamIndex].name}：${result.message}` };
        const liberos = state.teams[teamIndex].roster.filter(player => player.libero).map(player => player.number);
        if (state.firstLineups[teamIndex].some(number => liberos.includes(number))) return { ok: false, message: `${state.teams[teamIndex].name} 的首发轮次中不能直接登记自由人。` };
      }
    }
  }
  return { ok: true };
}
