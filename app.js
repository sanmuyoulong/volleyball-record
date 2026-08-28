import {
  RULESETS,
  COMPETITION_PROFILES,
  formatClock,
  isMatchComplete,
  isSetComplete,
  rotateServiceIndex,
  servicePlayer,
  setTarget,
  validateLineup
} from "./rules.js";

const app = document.querySelector("#app");
const modalRoot = document.querySelector("#modal-root");
const toastRoot = document.querySelector("#toast-root");
const STORAGE_KEY = "volley-record-state-v1";
const roman = ["I", "II", "III", "IV", "V", "VI"];

function defaultRoster() {
  return Array.from({ length: 14 }, () => ({ number: "", name: "", libero: false }));
}

function initialState() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return {
    screen: "landing",
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

let state = restoreState();

function restoreState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.selectedRule && saved?.meta && Array.isArray(saved.teams)) {
      const base = initialState();
      saved.selectedRule = "modern";
      if (!["official", "test2026"].includes(saved.competitionProfile)) saved.competitionProfile = "official";
      const restored = { ...base, ...saved, meta: { ...base.meta, ...saved.meta } };
      restored.meta.matchFormat = ["3", "5"].includes(String(restored.meta.matchFormat)) ? String(restored.meta.matchFormat) : "5";
      if (restored.match) {
        restored.match.maxSets = Number(restored.match.maxSets || restored.meta.matchFormat || 5);
        restored.match.setsToWin = Number(restored.match.setsToWin || Math.floor(restored.match.maxSets / 2) + 1);
      }
      return restored;
    }
  } catch {}
  return initialState();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  const label = document.querySelector("#save-label");
  if (label) label.textContent = `已保存 ${formatClock()}`;
}

function clone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toast(message, type = "normal") {
  const node = document.createElement("div");
  node.className = `toast ${type === "error" ? "error" : ""}`;
  node.textContent = message;
  toastRoot.replaceChildren(node);
  setTimeout(() => node.remove(), 3000);
}

function render() {
  modalRoot.replaceChildren();
  if (state.screen === "landing") renderLanding();
  if (state.screen === "setup") renderSetup();
  if (state.screen === "score") renderScore();
  saveState();
}

document.querySelector("#reset-app").addEventListener("click", () => {
  if (!confirm("确定清除当前比赛并重新开始吗？")) return;
  localStorage.removeItem(STORAGE_KEY);
  state = initialState();
  render();
});

function renderLanding() {
  app.replaceChildren(document.querySelector("#landing-template").content.cloneNode(true));
  app.querySelectorAll(".rule-card").forEach(card => {
    card.classList.toggle("selected", card.dataset.profile === state.competitionProfile);
    card.addEventListener("click", () => {
      state.selectedRule = "modern";
      state.competitionProfile = card.dataset.profile;
      renderLanding();
      saveState();
    });
  });
  app.querySelector("#start-setup").addEventListener("click", () => {
    state.screen = "setup";
    state.setupStep = 1;
    render();
  });
  app.querySelector("#load-demo").addEventListener("click", loadDemoMatch);
}

function setupHeading(title, subtitle, step) {
  return `
    <div class="form-heading">
      <div><h2>${title}</h2><p>${subtitle}</p></div>
      <span class="form-step-number">0${step}</span>
    </div>`;
}

function renderSetup() {
  app.replaceChildren(document.querySelector("#setup-template").content.cloneNode(true));
  const progress = app.querySelectorAll(".setup-progress button");
  progress.forEach(button => {
    const step = Number(button.dataset.step);
    button.classList.toggle("active", step === state.setupStep);
    button.classList.toggle("done", step < state.setupStep);
    button.addEventListener("click", () => {
      if (step > state.setupStep) return;
      readSetupStep(false);
      state.setupStep = step;
      renderSetup();
    });
  });
  const form = app.querySelector("#setup-form");
  if (state.setupStep === 1) form.innerHTML = matchInfoForm();
  if (state.setupStep === 2) form.innerHTML = teamForm();
  if (state.setupStep === 3) form.innerHTML = officialsForm();
  if (state.setupStep === 4) form.innerHTML = lineupForm();
  bindSetupActions();
}

function matchInfoForm() {
  const m = state.meta;
  const profile = COMPETITION_PROFILES[state.competitionProfile];
  const profileSummary = `
    <div class="rule-note field full"><span>i</span><p><strong>${profile.label}</strong>　${profile.description} 所有比赛均使用统一的专业记录表样式。</p></div>`;
  return `
    ${setupHeading("比赛信息", "用于记录表页眉和比赛时间轴。", 1)}
    <div class="form-grid">
      <div class="field full"><label>比赛名称 <span>*</span></label><input name="competition" value="${escapeHTML(m.competition)}" placeholder="例如：城市排球邀请赛" /></div>
      <div class="field"><label>比赛日期 <span>*</span></label><input name="date" type="date" value="${escapeHTML(m.date)}" /></div>
      <div class="field"><label>计划开始时间 <span>*</span></label><input name="scheduledTime" type="time" value="${escapeHTML(m.scheduledTime)}" /></div>
      <div class="field"><label>比赛场馆 <span>*</span></label><input name="venue" value="${escapeHTML(m.venue)}" placeholder="场馆名称" /></div>
      <div class="field"><label>城市</label><input name="city" value="${escapeHTML(m.city)}" placeholder="城市 / 赛区" /></div>
      <div class="field"><label>场次编号</label><input name="matchNo" value="${escapeHTML(m.matchNo)}" placeholder="例如：A-07" /></div>
      <div class="field"><label>比赛赛制 <span>*</span></label><select name="matchFormat"><option value="5" ${String(m.matchFormat) === "5" ? "selected" : ""}>五局三胜</option><option value="3" ${String(m.matchFormat) === "3" ? "selected" : ""}>三局两胜</option></select></div>
      <div class="field"><label>组别</label><select name="category">${["成年组","青年组","少年组"].map(v => `<option ${m.category === v ? "selected" : ""}>${v}</option>`).join("")}</select></div>
      <div class="field"><label>性别</label><select name="gender">${["男子","女子","混合"].map(v => `<option ${m.gender === v ? "selected" : ""}>${v}</option>`).join("")}</select></div>
      ${profileSummary}
    </div>
    ${setupActions(1)}`;
}

function teamForm() {
  return `
    ${setupHeading("球队名单", "号码在同一队内必须唯一；L 表示自由人。", 2)}
    <div class="team-editor-grid">
      ${state.teams.map((team, teamIndex) => teamEditor(team, teamIndex)).join("")}
    </div>
    ${setupActions(2)}`;
}

function teamEditor(team, teamIndex) {
  return `
    <section class="team-editor">
      <div class="team-editor-head"><span class="team-letter">${teamIndex === 0 ? "A" : "B"}</span><input name="team-name-${teamIndex}" value="${escapeHTML(team.name)}" placeholder="队伍名称" aria-label="${teamIndex === 0 ? "A" : "B"}队名称" /></div>
      <div class="roster-head"><span>号码</span><span>队员姓名</span><span>自由人</span></div>
      <div class="roster-list">
        ${team.roster.map((player, playerIndex) => `
          <div class="roster-row">
            <input name="player-number-${teamIndex}-${playerIndex}" value="${escapeHTML(player.number)}" inputmode="numeric" aria-label="球员号码" />
            <input name="player-name-${teamIndex}-${playerIndex}" value="${escapeHTML(player.name)}" aria-label="球员姓名" />
            <label><input name="player-libero-${teamIndex}-${playerIndex}" type="checkbox" ${player.libero ? "checked" : ""} /> L</label>
          </div>`).join("")}
      </div>
      <div class="team-footer-fields">
        <div class="inline-field"><label>主教练</label><input name="coach-${teamIndex}" value="${escapeHTML(team.coach)}" /></div>
        <div class="inline-field"><label>队长号码</label><input name="captain-${teamIndex}" value="${escapeHTML(team.captain)}" inputmode="numeric" /></div>
      </div>
    </section>`;
}

function officialsForm() {
  const o = state.officials;
  const fields = [
    ["firstReferee", "第一裁判员", true], ["secondReferee", "第二裁判员", true],
    ["scorer", "记录员", true], ["assistantScorer", "助理记录员", false],
    ["lineJudge1", "司线员 1", false], ["lineJudge2", "司线员 2", false]
  ];
  return `
    ${setupHeading("裁判组", "姓名会进入比赛确认与签字区域。", 3)}
    <div class="form-grid">
      ${fields.map(([name, label, required]) => `<div class="field"><label>${label} ${required ? "<span>*</span>" : ""}</label><input name="${name}" value="${escapeHTML(o[name])}" placeholder="请输入姓名" /></div>`).join("")}
      <div class="rule-note field full"><span>i</span><p>比赛结束时，系统将按“记录员 → 两队队长 → 第二裁判员 → 第一裁判员”的顺序提示确认。</p></div>
    </div>
    ${setupActions(3)}`;
}

function lineupForm() {
  return `
    ${setupHeading("第一局位置轮次", "按位置表填写 I–VI；I 号位为发球位置。", 4)}
    <div class="lineup-section">
      ${state.teams.map((team, index) => lineupCard(team, index, state.firstLineups[index], "setup")).join("")}
    </div>
    <div class="serve-choice">
      ${state.teams.map((team, index) => `<label><input type="radio" name="firstServer" value="${index}" ${state.firstServer === index ? "checked" : ""} /> ${escapeHTML(team.name || `球队 ${index === 0 ? "A" : "B"}`)} 第一局先发球</label>`).join("")}
    </div>
    <div class="rule-note"><span>i</span><p>开始后系统会把首发号码写入记录表。接发球队第一次获得发球权时会自动轮转，由 II 号位球员发球。</p></div>
    ${setupActions(4, true)}`;
}

function lineupCard(team, teamIndex, lineup, scope) {
  const order = [3, 2, 1, 4, 5, 0];
  return `
    <section class="lineup-card">
      <div class="lineup-card-head"><strong>${escapeHTML(team.name || `球队 ${teamIndex === 0 ? "A" : "B"}`)}</strong><span class="team-letter">${teamIndex === 0 ? "A" : "B"}</span></div>
      <div class="court-grid">
        ${order.map(positionIndex => `<label class="court-position ${positionIndex === 0 ? "position-i" : ""}"><span>${roman[positionIndex]}</span><input name="${scope}-lineup-${teamIndex}-${positionIndex}" value="${escapeHTML(lineup[positionIndex] || "")}" inputmode="numeric" aria-label="${team.name} ${roman[positionIndex]}号位" /></label>`).join("")}
      </div>
    </section>`;
}

function setupActions(step, final = false) {
  return `
    <div id="validation-slot"></div>
    <div class="form-actions">
      <button class="text-button" type="button" data-action="back">${step === 1 ? "返回规则选择" : "← 上一步"}</button>
      <div class="right">
        ${step === 2 ? '<button class="ghost-button" type="button" data-action="demo-roster">填入示例名单</button>' : ""}
        <button class="primary-button ${final ? "blue" : ""}" type="button" data-action="next">${final ? "确认并开始比赛" : "保存并继续 →"}</button>
      </div>
    </div>`;
}

function bindSetupActions() {
  app.querySelector('[data-action="back"]').addEventListener("click", () => {
    readSetupStep(false);
    if (state.setupStep === 1) {
      state.screen = "landing";
    } else {
      state.setupStep -= 1;
    }
    render();
  });
  const demoRoster = app.querySelector('[data-action="demo-roster"]');
  if (demoRoster) demoRoster.addEventListener("click", () => {
    applyDemoRosters();
    renderSetup();
  });
  app.querySelector('[data-action="next"]').addEventListener("click", () => {
    const validation = readSetupStep(true);
    if (!validation.ok) return showValidation(validation.message);
    if (state.setupStep < 4) {
      state.setupStep += 1;
      renderSetup();
      saveState();
      return;
    }
    startMatch();
  });
}

function showValidation(message) {
  const slot = app.querySelector("#validation-slot");
  if (slot) slot.innerHTML = `<div class="validation-banner">${escapeHTML(message)}</div>`;
}

function readSetupStep(validate) {
  const form = app.querySelector("#setup-form");
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

function rosterNumbers(teamIndex) {
  return state.teams[teamIndex].roster.filter(player => player.number && player.name).map(player => player.number);
}

function playerName(teamIndex, number) {
  return state.teams[teamIndex].roster.find(player => player.number === String(number))?.name || "";
}

function currentProfile() {
  return COMPETITION_PROFILES[state.competitionProfile] || COMPETITION_PROFILES.official;
}

function matchFormatLabel() {
  return Number(state.match?.maxSets || state.meta.matchFormat) === 3 ? "三局两胜" : "五局三胜";
}

function createSet(number, lineups, firstServer) {
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

function startMatch() {
  const maxSets = Number(state.meta.matchFormat) === 3 ? 3 : 5;
  state.match = {
    startedAt: formatClock(),
    endedAt: "",
    maxSets,
    setsToWin: Math.floor(maxSets / 2) + 1,
    setsWon: [0, 0],
    sets: [createSet(1, state.firstLineups, state.firstServer)],
    currentSetIndex: 0,
    undoStack: [],
    ended: false
  };
  state.viewSetIndex = 0;
  state.screen = "score";
  render();
  toast("比赛已开始，第一局轮次已写入记录表。 ");
}

function loadDemoMatch() {
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

function applyDemoRosters() {
  const namesA = ["程野","陆骁","陈放","高桥","梁川","吴桐","韩序","沈舟","邵一","孟驰","许燃","唐越","季风","宋扬"];
  const namesB = ["顾北","裴安","程屿","苏秦","闻舟","江澄","贺朗","秦屿","林哲","周野","顾言","许川","沈言","白屿"];
  state.teams = [
    { name: "海风俱乐部", coach: "秦牧", captain: "8", roster: namesA.map((name, index) => ({ number: String(index + 1), name, libero: [5, 9].includes(index) })) },
    { name: "北辰体育", coach: "陆明", captain: "1", roster: namesB.map((name, index) => ({ number: String(index + 1), name, libero: [4, 13].includes(index) })) }
  ];
}

function currentSet() {
  return state.match.sets[state.match.currentSetIndex];
}

function renderScore() {
  app.replaceChildren(document.querySelector("#score-template").content.cloneNode(true));
  const content = app.querySelector("#score-content");
  const set = currentSet();
  const profile = currentProfile();
  content.innerHTML = `
    <div class="match-toolbar">
      <div class="match-context">
        <span class="rule-badge">${escapeHTML(profile.label)}</span>
        <span>${matchFormatLabel()}</span><span>·</span><span>专业记录表</span><span>·</span><span>${escapeHTML(state.meta.matchNo || "未编号")}</span><span>·</span><span>${escapeHTML(state.meta.venue)}</span>
      </div>
      <div class="match-toolbar-actions">
        <button class="ghost-button compact" type="button" data-score-action="print">导出完整比赛 PDF</button>
        <button class="ghost-button compact" type="button" data-score-action="edit-info">查看赛前信息</button>
      </div>
    </div>
    <div class="match-grid">
      <div>
        ${scoreboardHTML(set)}
        ${sheetHTML(state.match.sets[state.viewSetIndex] || set)}
      </div>
      ${operationsHTML(set)}
    </div>`;
  bindScoreActions();
}

function scoreboardHTML(set) {
  return `
    <section class="scoreboard">
      <div class="scoreboard-top">
        ${teamScoreHTML(0, set)}
        <div class="set-center"><small>CURRENT SET</small><strong>${set.number}</strong><span>目标 ${setTarget(set.number, state.match.maxSets)} 分 · 领先 2 分</span></div>
        ${teamScoreHTML(1, set)}
      </div>
      ${setHistoryHTML()}
      <div class="score-controls">
        <div class="team-controls">
          <button class="score-button" type="button" data-score-action="minus" data-team="0" ${canUndoTeam(0) ? "" : "disabled"}>− 1</button>
          <button class="score-button plus" type="button" data-score-action="plus" data-team="0" ${set.ended ? "disabled" : ""}>+ 1</button>
        </div>
        <div class="score-status">${set.ended ? "本局已结束" : `${escapeHTML(servicePlayer(set.onCourt[set.servingTeam], set.rotationIndex[set.servingTeam]))} 号发球`}</div>
        <div class="team-controls">
          <button class="score-button plus" type="button" data-score-action="plus" data-team="1" ${set.ended ? "disabled" : ""}>+ 1</button>
          <button class="score-button" type="button" data-score-action="minus" data-team="1" ${canUndoTeam(1) ? "" : "disabled"}>− 1</button>
        </div>
      </div>
    </section>`;
}

function teamScoreHTML(teamIndex, set) {
  const server = set.servingTeam === teamIndex && !set.ended;
  const scoreFirst = teamIndex === 1;
  const info = `<div class="team-score-info"><small>TEAM ${teamIndex === 0 ? "A" : "B"}</small><h2>${escapeHTML(state.teams[teamIndex].name)}</h2><span class="sets-won">已胜 ${state.match.setsWon[teamIndex]} / ${state.match.setsToWin} 局</span>${server ? `<span class="server-dot">${escapeHTML(servicePlayer(set.onCourt[teamIndex], set.rotationIndex[teamIndex]))} 号发球</span>` : ""}</div>`;
  const score = `<strong class="big-score">${set.score[teamIndex]}</strong>`;
  return `<div class="team-score">${scoreFirst ? score + info : info + score}</div>`;
}

function setHistoryHTML(compact = false) {
  const completed = state.match.sets.filter(item => item.ended);
  return `<div class="set-history ${compact ? "compact" : ""}">
    <span class="set-history-label">此前各局</span>
    ${completed.length ? completed.map(item => `<span class="set-history-item winner-${item.winner === 0 ? "a" : "b"}"><b>第 ${item.number} 局</b>${item.score[0]} : ${item.score[1]}</span>`).join("") : `<span class="set-history-empty">${matchFormatLabel()} · 尚无已结束局</span>`}
  </div>`;
}

function canUndoTeam(teamIndex) {
  const set = currentSet();
  return !set.ended && set.rallies.at(-1)?.winner === teamIndex && state.match.undoStack.length > 0;
}

function operationsHTML(set) {
  const maxSubs = currentProfile().substitutionsPerSet;
  return `<aside class="operations">
    <section class="operation-card">
      <h3>暂停</h3><p>记录申请时比分，并启动 ${RULESETS[state.selectedRule].timeoutSeconds} 秒计时。</p>
      <div class="operation-row">
        ${[0,1].map(team => `<button class="action-button" type="button" data-score-action="timeout" data-team="${team}" ${set.ended || set.timeouts[team].length >= RULESETS[state.selectedRule].timeoutsPerSet ? "disabled" : ""}>${escapeHTML(state.teams[team].name)}<strong>${set.timeouts[team].length} / 2</strong></button>`).join("")}
      </div>
    </section>
    <section class="operation-card">
      <h3>换人</h3><p>校验场上球员、原始配对与本局换人次数。</p>
      <div class="operation-row">
        ${[0,1].map(team => `<button class="action-button" type="button" data-score-action="substitution" data-team="${team}" ${set.ended || set.subCount[team] >= maxSubs ? "disabled" : ""}>${escapeHTML(state.teams[team].name)}<strong>${set.subCount[team]} / ${maxSubs}</strong></button>`).join("")}
      </div>
    </section>
    <section class="operation-card">
      <h3>比赛事件</h3><p>最近的得分、轮转、暂停和换人记录。</p>
      <div class="event-list">
        ${set.events.length ? [...set.events].reverse().slice(0, 12).map(event => `<div class="event-item"><time>${escapeHTML(event.time)}</time><p>${escapeHTML(event.text)}</p></div>`).join("") : '<div class="event-empty">暂无事件</div>'}
      </div>
    </section>
  </aside>`;
}

function sheetHTML(set, printMode = false) {
  return `
    <section class="sheet-shell">
      <div class="sheet-head">
        <div class="sheet-title"><span>VR</span><div><h3>国际排球电子记录表</h3><small>BASED ON FIVB SCOREKEEPING WORKFLOW</small></div></div>
        ${printMode ? `<div class="print-set-label">第 ${set.number} 局 · ${set.ended ? `${set.score[0]} : ${set.score[1]}` : "进行中"}</div>` : `<div class="set-tabs">${state.match.sets.map((item, index) => `<button class="set-tab ${state.viewSetIndex === index ? "active" : ""} ${item.ended ? `won-${item.winner === 0 ? "a" : "b"}` : ""}" type="button" data-score-action="view-set" data-index="${index}">第${index + 1}局</button>`).join("")}</div>`}
      </div>
      <div class="paper-meta">
        <div><b>比赛名称</b>${escapeHTML(state.meta.competition)}</div>
        <div><b>日期</b>${escapeHTML(state.meta.date)}</div>
        <div><b>场次</b>${escapeHTML(state.meta.matchNo || "—")}</div>
        <div><b>赛制</b>${matchFormatLabel()}</div>
        <div><b>局时</b>${escapeHTML(set.startTime)} – ${escapeHTML(set.endTime || "进行中")}</div>
      </div>
      ${sheetPersonnelHTML(set)}
      <div class="set-record">${paperTeamHTML(0, set)}${paperTeamHTML(1, set)}</div>
      <div class="sheet-summary">
        <div class="summary-events"><h4>备　注 / 自动记录</h4>${set.substitutions.flat().length ? set.substitutions.flat().map(sub => `<p>第 ${set.number} 局 · ${escapeHTML(sub.team)}：${escapeHTML(sub.out)} 号下，${escapeHTML(sub.in)} 号上（${escapeHTML(sub.score)}）</p>`).join("") : "<p>本局暂无换人记录。</p>"}${set.courtChanged ? "<p>决胜局领先队达到 8 分，已记录交换场区。</p>" : ""}</div>
        <div class="match-results"><h4>比　赛　结　果</h4>${state.match.sets.map(item => `<div class="result-row"><b>${item.number}</b><span>${item.endTime ? `${item.startTime}–${item.endTime}` : "进行中"}</span><strong>${item.score[0]}</strong><strong>${item.score[1]}</strong></div>`).join("")}</div>
      </div>
    </section>`;
}

function sheetPersonnelHTML(set) {
  return `<section class="sheet-personnel">
    <div class="sheet-section-label">双方名单 · 教练员 · 第 ${set.number} 局轮次表</div>
    <div class="sheet-team-details">
      ${state.teams.map((team, teamIndex) => {
        const players = team.roster.filter(player => player.number && player.name);
        return `<article class="sheet-roster-card">
          <div class="sheet-roster-head"><span>${teamIndex === 0 ? "A" : "B"}</span><strong>${escapeHTML(team.name)}</strong><small><b>主教练</b> ${escapeHTML(team.coach || "—")}</small></div>
          <div class="sheet-lineup-summary">${roman.map((position, index) => `<span><b>${position}</b>${escapeHTML(set.lineups[teamIndex][index])}</span>`).join("")}</div>
          <div class="sheet-roster-grid">${players.map(player => `<span class="sheet-player"><b>${escapeHTML(player.number)}</b>${escapeHTML(player.name)}${player.number === team.captain ? " <i>C</i>" : ""}${player.libero ? " <i>L</i>" : ""}</span>`).join("")}</div>
        </article>`;
      }).join("")}
    </div>
  </section>`;
}

function printOverviewHTML() {
  const winner = state.match.ended ? (state.match.setsWon[0] > state.match.setsWon[1] ? 0 : 1) : null;
  const resultRows = state.match.sets.map(set => `<tr><td>第 ${set.number} 局</td><td>${escapeHTML(set.startTime)}${set.endTime ? ` - ${escapeHTML(set.endTime)}` : " - 进行中"}</td><td>${set.score[0]}</td><td>${set.score[1]}</td></tr>`).join("");
  return `<section class="print-match-overview">
    <div class="print-cover-brand"><span>VR</span><div><h1>排球比赛完整记录</h1><p>VOLLEYBALL MATCH RECORD</p></div></div>
    <div class="print-cover-title"><small>${escapeHTML(state.meta.competition)}</small><h2>${escapeHTML(state.teams[0].name)} <i>VS</i> ${escapeHTML(state.teams[1].name)}</h2><p>${matchFormatLabel()} · ${escapeHTML(currentProfile().label)}</p></div>
    <div class="print-overview-grid">
      <div><b>日期与时间</b><span>${escapeHTML(state.meta.date)} ${escapeHTML(state.meta.scheduledTime)}</span></div>
      <div><b>比赛场馆</b><span>${escapeHTML(state.meta.venue)}${state.meta.city ? ` · ${escapeHTML(state.meta.city)}` : ""}</span></div>
      <div><b>场次编号</b><span>${escapeHTML(state.meta.matchNo || "—")}</span></div>
      <div><b>比赛状态</b><span>${state.match.ended ? `${escapeHTML(state.teams[winner].name)} 获胜` : "比赛进行中"}</span></div>
    </div>
    <div class="print-score-summary"><div><small>TEAM A</small><strong>${escapeHTML(state.teams[0].name)}</strong><b>${state.match.setsWon[0]}</b></div><span>总局分</span><div><small>TEAM B</small><strong>${escapeHTML(state.teams[1].name)}</strong><b>${state.match.setsWon[1]}</b></div></div>
    <div class="print-cover-columns">
      <section><h3>各局比分</h3><table><thead><tr><th>局次</th><th>时间</th><th>${escapeHTML(state.teams[0].name)}</th><th>${escapeHTML(state.teams[1].name)}</th></tr></thead><tbody>${resultRows}</tbody></table></section>
      <section><h3>裁判组</h3><dl><div><dt>第一裁判员</dt><dd>${escapeHTML(state.officials.firstReferee || "—")}</dd></div><div><dt>第二裁判员</dt><dd>${escapeHTML(state.officials.secondReferee || "—")}</dd></div><div><dt>记录员</dt><dd>${escapeHTML(state.officials.scorer || "—")}</dd></div><div><dt>助理记录员</dt><dd>${escapeHTML(state.officials.assistantScorer || "—")}</dd></div><div><dt>司线员</dt><dd>${escapeHTML([state.officials.lineJudge1, state.officials.lineJudge2].filter(Boolean).join("、") || "—")}</dd></div></dl></section>
    </div>
    <footer>本文件由 Volley Record 依据比赛过程自动生成 · 共 ${state.match.sets.length} 局记录</footer>
  </section>`;
}

function exportFullMatchPDF() {
  document.querySelector("#print-document")?.remove();
  const printDocument = document.createElement("main");
  printDocument.id = "print-document";
  printDocument.innerHTML = `${printOverviewHTML()}${state.match.sets.map(set => `<div class="print-set-page">${sheetHTML(set, true)}</div>`).join("")}`;
  document.body.append(printDocument);
  document.body.classList.add("printing-full-match");
  const previousTitle = document.title;
  document.title = `${state.meta.competition || "排球比赛"}-${state.teams[0].name || "A队"}-vs-${state.teams[1].name || "B队"}-完整记录`;
  const cleanup = () => {
    document.body.classList.remove("printing-full-match");
    printDocument.remove();
    document.title = previousTitle;
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup, { once: true });
  if (window.__VOLLEY_PDF_TEST__) return;
  requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
}

function paperTeamHTML(teamIndex, set) {
  const team = state.teams[teamIndex];
  const pointBase = set.number === state.match.maxSets ? 30 : 48;
  const pointCount = Math.max(pointBase, set.score[teamIndex]);
  return `<section class="paper-team">
    <div class="paper-team-head">
      <span>${teamIndex === 0 ? "A" : "B"}</span>
      <div class="paper-team-name"><strong>${escapeHTML(team.name)}</strong><small>${set.ended ? `本局 ${set.score[teamIndex]} 分` : `${escapeHTML(servicePlayer(set.onCourt[teamIndex], set.rotationIndex[teamIndex]))} 号处于发球轮次`}</small></div>
      <div class="serve-receive"><i class="${set.firstServer === teamIndex ? "active" : ""}">S</i><i class="${set.firstServer !== teamIndex ? "active" : ""}">R</i></div>
    </div>
    <div class="rotation-table">
      ${roman.map((label, index) => rotationCellHTML(teamIndex, index, set)).join("")}
    </div>
    <div class="paper-lower">
      <div class="point-area">
        <div class="point-area-head"><span>POINTS · 比分</span><span>${set.score[teamIndex]}</span></div>
        <div class="point-grid">${Array.from({ length: pointCount }, (_, index) => index + 1).map(point => `<span class="point-cell ${point <= set.score[teamIndex] ? "marked" : ""} ${set.ended && point === set.score[teamIndex] ? "last" : ""}">${point}</span>`).join("")}</div>
      </div>
      <div class="timeout-area"><h4>暂停 T</h4>${[0,1].map(index => `<div class="timeout-slot">${escapeHTML(set.timeouts[teamIndex][index] || "— : —")}</div>`).join("")}</div>
    </div>
  </section>`;
}

function rotationCellHTML(teamIndex, positionIndex, set) {
  const starter = set.lineups[teamIndex][positionIndex];
  const subs = set.substitutions[teamIndex].filter(item => item.positionIndex === positionIndex);
  const rounds = set.serviceRounds[teamIndex][positionIndex];
  return `<div class="rotation-cell">
    <div class="roman">${roman[positionIndex]}</div>
    <div class="starter">${escapeHTML(starter)}</div>
    <div class="sub-line">${subs.length ? subs.map(item => `<b>${escapeHTML(item.in)}</b><br>${escapeHTML(item.score)}`).join("<br>") : "换人<br>—"}</div>
    <div class="service-rounds">${rounds.length ? rounds.map((round, index) => `<span class="round-token ${round.active ? "active" : ""}">${index + 1}${round.endScore !== null ? ` · ${round.endScore}` : ""}</span>`).join("") : '<span class="round-token">—</span>'}</div>
  </div>`;
}

function bindScoreActions() {
  app.querySelectorAll("[data-score-action]").forEach(button => button.addEventListener("click", () => {
    const action = button.dataset.scoreAction;
    const team = Number(button.dataset.team);
    if (action === "plus") awardPoint(team);
    if (action === "minus") undoPoint(team);
    if (action === "timeout") requestTimeout(team);
    if (action === "substitution") openSubstitutionModal(team);
    if (action === "view-set") { state.viewSetIndex = Number(button.dataset.index); renderScore(); }
    if (action === "print") exportFullMatchPDF();
    if (action === "edit-info") openInfoModal();
  }));
}

function awardPoint(teamIndex, shouldRender = true) {
  const set = currentSet();
  if (set.ended) return;
  state.match.undoStack.push({ set: clone(set), setsWon: clone(state.match.setsWon), matchEnded: state.match.ended });
  if (state.match.undoStack.length > 80) state.match.undoStack.shift();
  const wasServing = set.servingTeam === teamIndex;
  set.score[teamIndex] += 1;
  set.rallies.push({ winner: teamIndex, at: formatClock() });
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
    set.events.push({ time: formatClock(), text: `${state.teams[teamIndex].name} 得分并获得发球权，轮转后由 ${server} 号发球。` });
  } else {
    set.events.push({ time: formatClock(), text: `${state.teams[teamIndex].name} 得分，继续发球。` });
  }
  if (set.number === state.match.maxSets && !set.courtChanged && Math.max(...set.score) >= 8) {
    set.courtChanged = true;
    set.events.push({ time: formatClock(), text: `领先队达到 8 分，双方交换场区；轮次保持不变。` });
  }
  if (isSetComplete(set.score[0], set.score[1], set.number, state.match.maxSets)) finishSet(set);
  if (shouldRender) {
    state.viewSetIndex = state.match.currentSetIndex;
    render();
  }
}

function closeActiveServiceRound(set, teamIndex) {
  const rounds = set.serviceRounds[teamIndex][set.rotationIndex[teamIndex]];
  const active = [...rounds].reverse().find(round => round.active);
  if (active) {
    active.active = false;
    active.endScore = set.score[teamIndex];
  }
}

function undoPoint(teamIndex) {
  const set = currentSet();
  if (set.rallies.at(-1)?.winner !== teamIndex) return toast("减分只用于撤销该队刚刚获得的最后一分。", "error");
  const snapshot = state.match.undoStack.pop();
  if (!snapshot) return;
  state.match.sets[state.match.currentSetIndex] = snapshot.set;
  state.match.setsWon = snapshot.setsWon;
  state.match.ended = snapshot.matchEnded;
  render();
  toast("已撤销上一分，发球轮次和记录表同步恢复。 ");
}

function finishSet(set) {
  closeActiveServiceRound(set, set.servingTeam);
  set.ended = true;
  set.endTime = formatClock();
  set.winner = set.score[0] > set.score[1] ? 0 : 1;
  state.match.setsWon[set.winner] += 1;
  set.events.push({ time: set.endTime, text: `${state.teams[set.winner].name} 以 ${set.score[set.winner]}:${set.score[1 - set.winner]} 赢得本局。` });
  if (isMatchComplete(state.match.setsWon, state.match.setsToWin)) {
    state.match.ended = true;
    state.match.endedAt = set.endTime;
    setTimeout(openMatchEndModal, 60);
  } else {
    setTimeout(() => openSetEndModal(set), 60);
  }
}

function requestTimeout(teamIndex) {
  const set = currentSet();
  if (set.timeouts[teamIndex].length >= RULESETS[state.selectedRule].timeoutsPerSet) return;
  const score = `${set.score[teamIndex]}:${set.score[1 - teamIndex]}`;
  set.timeouts[teamIndex].push(score);
  set.events.push({ time: formatClock(), text: `${state.teams[teamIndex].name} 请求第 ${set.timeouts[teamIndex].length} 次暂停（${score}）。` });
  renderScore();
  openTimeoutModal(teamIndex, RULESETS[state.selectedRule].timeoutSeconds);
}

function openTimeoutModal(teamIndex, seconds) {
  let remaining = seconds;
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal"><div class="modal-head"><div><h2>${escapeHTML(state.teams[teamIndex].name)} 暂停</h2><p>暂停时比分已写入记录表。</p></div></div><div class="timeout-display"><strong id="timeout-count">00:${String(remaining).padStart(2,"0")}</strong><span>TIME-OUT</span></div><div class="modal-actions"><button class="primary-button" type="button" id="end-timeout">提前结束暂停</button></div></section></div>`;
  const count = modalRoot.querySelector("#timeout-count");
  const timer = setInterval(() => {
    remaining -= 1;
    if (count) count.textContent = `00:${String(Math.max(remaining, 0)).padStart(2,"0")}`;
    if (remaining <= 0) {
      clearInterval(timer);
      modalRoot.replaceChildren();
      toast("暂停时间结束。 ");
    }
  }, 1000);
  modalRoot.querySelector("#end-timeout").addEventListener("click", () => {
    clearInterval(timer);
    modalRoot.replaceChildren();
  });
}

function openSubstitutionModal(teamIndex) {
  const set = currentSet();
  const onCourt = set.onCourt[teamIndex];
  const bench = rosterNumbers(teamIndex).filter(number => !onCourt.includes(number) && !state.teams[teamIndex].roster.find(player => player.number === number)?.libero);
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal"><div class="modal-head"><div><h2>${escapeHTML(state.teams[teamIndex].name)} 换人</h2><p>本局已使用 ${set.subCount[teamIndex]} / ${currentProfile().substitutionsPerSet} 次普通换人。</p></div><button class="icon-button" id="close-modal" type="button">×</button></div><div class="substitution-visual"><div class="field"><label>离场号码</label><select id="sub-out"><option value="">请选择场上球员</option>${onCourt.map(number => `<option value="${escapeHTML(number)}">${escapeHTML(number)} · ${escapeHTML(playerName(teamIndex, number))}</option>`).join("")}</select></div><div class="substitution-arrow">→</div><div class="field"><label>上场号码</label><select id="sub-in"><option value="">请选择替补球员</option>${bench.map(number => `<option value="${escapeHTML(number)}">${escapeHTML(number)} · ${escapeHTML(playerName(teamIndex, number))}</option>`).join("")}</select></div></div><div id="modal-validation"></div><div class="modal-actions"><button class="ghost-button" id="cancel-modal" type="button">取消</button><button class="primary-button blue" id="confirm-sub" type="button">确认换人</button></div></section></div>`;
  const close = () => modalRoot.replaceChildren();
  modalRoot.querySelector("#close-modal").addEventListener("click", close);
  modalRoot.querySelector("#cancel-modal").addEventListener("click", close);
  modalRoot.querySelector("#confirm-sub").addEventListener("click", () => {
    const out = modalRoot.querySelector("#sub-out").value;
    const incoming = modalRoot.querySelector("#sub-in").value;
    const result = performSubstitution(teamIndex, out, incoming, true);
    if (!result.ok) modalRoot.querySelector("#modal-validation").innerHTML = `<div class="validation-banner">${escapeHTML(result.message)}</div>`;
  });
}

function performSubstitution(teamIndex, out, incoming, shouldRender = true) {
  const set = currentSet();
  const max = currentProfile().substitutionsPerSet;
  if (!out || !incoming) return { ok: false, message: "请选择离场和上场球员号码。" };
  if (set.subCount[teamIndex] >= max) return { ok: false, message: `本局已达到 ${max} 次普通换人上限。` };
  const courtIndex = set.onCourt[teamIndex].indexOf(out);
  if (courtIndex < 0) return { ok: false, message: `${out} 号当前不在场上。` };
  if (!rosterNumbers(teamIndex).includes(incoming)) return { ok: false, message: `${incoming} 号不在本队名单中。` };
  if (set.onCourt[teamIndex].includes(incoming)) return { ok: false, message: `${incoming} 号已经在场上。` };
  const player = state.teams[teamIndex].roster.find(item => item.number === incoming);
  if (player?.libero) return { ok: false, message: "自由人替换不计入普通换人，应使用自由人控制流程。" };
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
  if (shouldRender) {
    modalRoot.replaceChildren();
    render();
    toast("换人号码和换人时比分已写入记录表。 ");
  }
  return { ok: true };
}

function openSetEndModal(set) {
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal"><div class="winner-banner"><small>SET ${set.number} COMPLETE</small><h2>${escapeHTML(state.teams[set.winner].name)}</h2><strong>${set.score[set.winner]} : ${set.score[1 - set.winner]}</strong></div>${setHistoryHTML(true)}<div class="modal-actions"><button class="primary-button blue" id="next-lineup" type="button">填写第 ${set.number + 1} 局位置轮次表</button></div></section></div>`;
  modalRoot.querySelector("#next-lineup").addEventListener("click", () => openLineupModal(set.number + 1));
}

function openLineupModal(nextNumber) {
  const previous = currentSet();
  const suggestedLineups = previous.lineups.map((lineup, teamIndex) => lineup.map(number => previous.onCourt[teamIndex].includes(number) ? number : previous.onCourt[teamIndex][lineup.indexOf(number)]));
  const isDecidingSet = nextNumber === state.match.maxSets;
  const suggestedServer = isDecidingSet ? 0 : 1 - previous.firstServer;
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal wide"><div class="modal-head"><div><h2>第 ${nextNumber} 局位置轮次表</h2><p>${isDecidingSet ? "决胜局应重新掷边，请确认首先发球的队伍。" : "请按教练提交的位置表重新填写，系统不会沿用上一局换人关系。"}</p></div></div>${setHistoryHTML(true)}<div class="lineup-modal-grid">${state.teams.map((team, index) => lineupCard(team, index, suggestedLineups[index], "next")).join("")}</div><div class="serve-choice">${state.teams.map((team, index) => `<label><input type="radio" name="nextServer" value="${index}" ${suggestedServer === index ? "checked" : ""} /> ${escapeHTML(team.name)} 先发球</label>`).join("")}</div><div id="modal-validation"></div><div class="modal-actions"><button class="primary-button blue" id="start-next-set" type="button">确认轮次并开始第 ${nextNumber} 局</button></div></section></div>`;
  modalRoot.querySelector("#start-next-set").addEventListener("click", () => {
    const lineups = state.teams.map((_, teamIndex) => roman.map((__, positionIndex) => modalRoot.querySelector(`[name="next-lineup-${teamIndex}-${positionIndex}"]`).value.trim()));
    for (let teamIndex = 0; teamIndex < 2; teamIndex++) {
      const result = validateLineup(lineups[teamIndex], rosterNumbers(teamIndex));
      if (!result.ok) {
        modalRoot.querySelector("#modal-validation").innerHTML = `<div class="validation-banner">${escapeHTML(state.teams[teamIndex].name)}：${escapeHTML(result.message)}</div>`;
        return;
      }
      const liberos = state.teams[teamIndex].roster.filter(player => player.libero).map(player => player.number);
      if (lineups[teamIndex].some(number => liberos.includes(number))) {
        modalRoot.querySelector("#modal-validation").innerHTML = `<div class="validation-banner">${escapeHTML(state.teams[teamIndex].name)}：首发轮次中不能直接登记自由人。</div>`;
        return;
      }
    }
    const firstServer = Number(modalRoot.querySelector('[name="nextServer"]:checked').value);
    state.match.sets.push(createSet(nextNumber, lineups, firstServer));
    state.match.currentSetIndex += 1;
    state.match.undoStack = [];
    state.viewSetIndex = state.match.currentSetIndex;
    modalRoot.replaceChildren();
    render();
  });
}

function openMatchEndModal() {
  const winner = state.match.setsWon[0] > state.match.setsWon[1] ? 0 : 1;
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal"><div class="winner-banner"><small>MATCH COMPLETE · ${matchFormatLabel()}</small><h2>${escapeHTML(state.teams[winner].name)}</h2><strong>${state.match.setsWon[0]} : ${state.match.setsWon[1]}</strong></div>${setHistoryHTML(true)}<div class="rule-note"><span>✓</span><p><strong>赛后确认</strong>　请依次由记录员、两队队长、第二裁判员和第一裁判员确认比赛结果。电子签字功能将在正式部署版本接入。</p></div><div class="modal-actions"><button class="ghost-button" id="close-result" type="button">查看记录表</button><button class="primary-button blue" id="print-result" type="button">打印比赛记录</button></div></section></div>`;
  modalRoot.querySelector("#close-result").addEventListener("click", () => modalRoot.replaceChildren());
  modalRoot.querySelector("#print-result").addEventListener("click", () => { modalRoot.replaceChildren(); exportFullMatchPDF(); });
}

function openInfoModal() {
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal"><div class="modal-head"><div><h2>赛前信息</h2><p>${escapeHTML(state.meta.competition)} · ${escapeHTML(state.meta.date)} ${escapeHTML(state.meta.scheduledTime)}</p></div><button class="icon-button" id="close-info" type="button">×</button></div><div class="form-grid"><div class="field"><span class="field-label">场馆</span><strong>${escapeHTML(state.meta.venue)}</strong></div><div class="field"><span class="field-label">规则</span><strong>${escapeHTML(currentProfile().label)}</strong></div><div class="field"><span class="field-label">赛制</span><strong>${matchFormatLabel()}</strong></div><div class="field"><span class="field-label">第一裁判员</span><strong>${escapeHTML(state.officials.firstReferee)}</strong></div><div class="field"><span class="field-label">第二裁判员</span><strong>${escapeHTML(state.officials.secondReferee)}</strong></div><div class="field"><span class="field-label">记录员</span><strong>${escapeHTML(state.officials.scorer)}</strong></div><div class="field"><span class="field-label">换人上限</span><strong>每队每局 ${currentProfile().substitutionsPerSet} 次</strong></div></div></section></div>`;
  modalRoot.querySelector("#close-info").addEventListener("click", () => modalRoot.replaceChildren());
}

render();
