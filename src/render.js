// 渲染与弹窗层：render() 调度器、三屏渲染、所有 HTML 模板、事件绑定与各类弹窗，以及 JSON/PDF 导出。
// 依赖 state / audit / ui / logic（与 logic.js 循环导入，运行时调用安全）。
import {
  RULESETS,
  COMPETITION_PROFILES,
  setTarget,
  servicePlayer,
  validateLineup,
  canMakeLiberoReplacement,
  courtPositionForIndex,
  formatClock
} from "./rules.js";
import {
  state,
  currentSet,
  currentProfile,
  matchFormatLabel,
  createSet,
  rosterNumbers,
  playerName,
  isLiberoNumber,
  liberoPlayers,
  allDesignatedLiberoNumbers,
  eligibleLiberoRegulars,
  liberoStatusText,
  liberoNeedsImmediateExit,
  matchSnapshot,
  clone,
  saveRecoverySnapshot,
  recoverySnapshots,
  normalizeState,
  saveState,
  roman,
  defaultRoster,
  CONTACT_EMAIL,
  replaceState
} from "./state.js";
import { latestReversibleAction, reverseLatestAction, recordAuditAction } from "./audit.js";
import { app, modalRoot, escapeHTML, toast, showValidation, safeFilename } from "./ui.js";
import {
  awardPoint,
  undoPoint,
  requestTimeout,
  loadDemoMatch,
  readSetupStep,
  applyDemoRosters,
  startMatch,
  performSubstitution,
  applySanction,
  performLiberoReplacement,
  applyLiberoRedesignation
} from "./logic.js";
import { normalizeRosterRows, parseRosterFile } from "./roster-import.js";

export function render() {
  modalRoot.replaceChildren();
  if (state.screen === "record") renderRecordEntry();
  if (state.screen === "setup") renderSetup();
  if (state.screen === "score") renderScore();
  saveState();
}

export function renderRecordEntry() {
  let landing = app.querySelector(".landing");
  if (!landing) {
    app.replaceChildren(document.querySelector("#record-template").content.cloneNode(true));
    landing = app.querySelector(".landing");
  }
  const ruleCards = [...app.querySelectorAll(".rule-card")];
  ruleCards.forEach(card => {
    card.classList.toggle("selected", card.dataset.profile === state.competitionProfile);
    card.onclick = () => {
      state.selectedRule = "modern";
      state.competitionProfile = card.dataset.profile;
      ruleCards.forEach(item => item.classList.toggle("selected", item === card));
      saveState();
    };
  });
  app.querySelector("#start-setup").onclick = () => {
    state.screen = "setup";
    state.setupStep = 1;
    render();
  };
  app.querySelector("#contact-developer").onclick = openContactModal;
  app.querySelector("#load-demo").onclick = loadDemoMatch;
}

export function openContactModal() {
  const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Volley Record 使用反馈")}`;
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal"><div class="modal-head"><div><h2>联系与反馈</h2><p>Volley Record 目前仍在测试中，欢迎提供改进意见并反馈遇到的 Bug。</p></div><button class="icon-button" id="close-contact" type="button" aria-label="关闭联系窗口">×</button></div><div class="contact-card"><span>联系邮箱</span><a href="${mailto}">${CONTACT_EMAIL}</a><small>反馈时可以附上操作步骤、页面截图和使用设备，方便定位问题。</small></div><div class="modal-actions"><button class="ghost-button" id="cancel-contact" type="button">关闭</button><a class="primary-button blue" href="${mailto}">发送邮件</a></div></section></div>`;
  const close = () => modalRoot.replaceChildren();
  modalRoot.querySelector("#close-contact").addEventListener("click", close);
  modalRoot.querySelector("#cancel-contact").addEventListener("click", close);
}

export function setupHeading(title, subtitle, step) {
  return `
    <div class="form-heading">
      <div><h2>${title}</h2><p>${subtitle}</p></div>
      <span class="form-step-number">0${step}</span>
    </div>`;
}

export function renderSetup() {
  let form = app.querySelector("#setup-form");
  if (!form) {
    app.replaceChildren(document.querySelector("#setup-template").content.cloneNode(true));
    form = app.querySelector("#setup-form");
  }
  const progress = app.querySelectorAll(".setup-progress button");
  progress.forEach(button => {
    const step = Number(button.dataset.step);
    button.classList.toggle("active", step === state.setupStep);
    button.classList.toggle("done", step < state.setupStep);
    button.onclick = () => {
      if (step > state.setupStep) return;
      readSetupStep(false);
      state.setupStep = step;
      renderSetup();
    };
  });
  if (state.setupStep === 1) form.innerHTML = matchInfoForm();
  if (state.setupStep === 2) form.innerHTML = teamForm();
  if (state.setupStep === 3) form.innerHTML = officialsForm();
  if (state.setupStep === 4) form.innerHTML = lineupForm();
  bindSetupActions();
}

export function matchInfoForm() {
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

export function teamForm() {
  return `
    ${setupHeading("球队名单", "号码在同一队内必须唯一；L 表示自由人。", 2)}
    <div class="roster-import-note"><span>Excel / CSV</span><p>可分别为 A、B 队导入名单。支持第一工作表中的“号码、姓名、自由人、队长、队伍名称、主教练”等列。</p><button class="text-button" type="button" data-action="download-roster-template">下载 CSV 模板</button></div>
    <div class="team-editor-grid">
      ${state.teams.map((team, teamIndex) => teamEditor(team, teamIndex)).join("")}
    </div>
    ${setupActions(2)}`;
}

export function teamEditor(team, teamIndex) {
  return `
    <section class="team-editor">
      <div class="team-editor-head"><span class="team-letter">${teamIndex === 0 ? "A" : "B"}</span><input name="team-name-${teamIndex}" value="${escapeHTML(team.name)}" placeholder="队伍名称" aria-label="${teamIndex === 0 ? "A" : "B"}队名称" /><button class="ghost-button compact" type="button" data-action="import-roster" data-team="${teamIndex}">导入名单</button></div>
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

export function officialsForm() {
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

export function lineupForm() {
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

export function lineupCard(team, teamIndex, lineup, scope) {
  const order = [3, 2, 1, 4, 5, 0];
  return `
    <section class="lineup-card">
      <div class="lineup-card-head"><strong>${escapeHTML(team.name || `球队 ${teamIndex === 0 ? "A" : "B"}`)}</strong><span class="team-letter">${teamIndex === 0 ? "A" : "B"}</span></div>
      <div class="court-grid">
        ${order.map(positionIndex => `<label class="court-position ${positionIndex === 0 ? "position-i" : ""}"><span>${roman[positionIndex]}</span><input name="${scope}-lineup-${teamIndex}-${positionIndex}" value="${escapeHTML(lineup[positionIndex] || "")}" inputmode="numeric" aria-label="${team.name} ${roman[positionIndex]}号位" /></label>`).join("")}
      </div>
    </section>`;
}

export function setupActions(step, final = false) {
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

export function bindSetupActions() {
  app.querySelector('[data-action="back"]').addEventListener("click", () => {
    readSetupStep(false);
    if (state.setupStep === 1) {
      state.screen = "record";
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
  app.querySelector('[data-action="download-roster-template"]')?.addEventListener("click", downloadRosterTemplate);
  app.querySelectorAll('[data-action="import-roster"]').forEach(button => button.addEventListener("click", () => {
    readSetupStep(false);
    openRosterImportModal(Number(button.dataset.team));
  }));
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

export function downloadRosterTemplate() {
  const csv = "\uFEFF队伍名称,主教练,队长号码,号码,队员姓名,自由人,队长\r\n示例队,教练姓名,8,1,队员姓名,,\r\n示例队,教练姓名,8,8,队长姓名,,是\r\n示例队,教练姓名,8,14,自由人姓名,是,";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "排球球队名单导入模板.csv";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

export function rosterImportPreviewHTML(result) {
  return `<section class="import-preview"><div class="import-summary"><div><small>有效队员</small><strong>${result.players.length}</strong></div><div><small>自由人</small><strong>${result.players.filter(player => player.libero).length}</strong></div><div><small>队长</small><strong>${escapeHTML(result.captain || "待填写")}</strong></div></div>${result.warnings.length ? `<div class="import-warnings">${result.warnings.map(message => `<p>${escapeHTML(message)}</p>`).join("")}</div>` : ""}<div class="import-table"><b>号码</b><b>队员姓名</b><b>身份</b>${result.players.map(player => `<span>${escapeHTML(player.number)}</span><span>${escapeHTML(player.name)}</span><span>${player.number === result.captain ? "C" : ""}${player.libero ? `${player.number === result.captain ? " · " : ""}L` : ""}</span>`).join("")}</div></section>`;
}

export function openRosterImportModal(teamIndex) {
  const letter = teamIndex === 0 ? "A" : "B";
  let imported = null;
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal wide"><div class="modal-head"><div><h2>导入 ${letter} 队名单</h2><p>支持 .xlsx 和 .csv；XLSX 读取第一个工作表。文件只在当前浏览器中解析，不会上传。</p></div><button class="icon-button" id="close-roster-import" type="button">×</button></div><label class="file-drop" for="roster-file"><strong>选择 Excel / CSV 文件</strong><span>至少包含“号码”和“姓名”列；旧版 .xls 请先另存为 .xlsx。</span><input id="roster-file" type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" /></label><div id="roster-import-result"><div class="event-empty">选择文件后将在这里预览导入结果。</div></div><div class="modal-actions"><button class="ghost-button" id="cancel-roster-import" type="button">取消</button><button class="primary-button blue" id="confirm-roster-import" type="button" disabled>确认覆盖 ${letter} 队名单</button></div></section></div>`;
  const close = () => modalRoot.replaceChildren();
  const confirm = modalRoot.querySelector("#confirm-roster-import");
  const resultSlot = modalRoot.querySelector("#roster-import-result");
  modalRoot.querySelector("#close-roster-import").addEventListener("click", close);
  modalRoot.querySelector("#cancel-roster-import").addEventListener("click", close);
  modalRoot.querySelector("#roster-file").addEventListener("change", async event => {
    imported = null;
    confirm.disabled = true;
    resultSlot.innerHTML = '<div class="event-empty">正在读取并校验名单…</div>';
    try {
      const file = event.target.files?.[0];
      if (!file) return;
      imported = normalizeRosterRows(await parseRosterFile(file));
      resultSlot.innerHTML = rosterImportPreviewHTML(imported);
      confirm.disabled = false;
    } catch (error) {
      resultSlot.innerHTML = `<div class="validation-banner">${escapeHTML(error.message || "名单文件读取失败。")}</div>`;
    }
  });
  confirm.addEventListener("click", () => {
    if (!imported) return;
    const team = state.teams[teamIndex];
    const numbers = imported.players.map(player => player.number);
    team.name = imported.teamName || team.name;
    team.coach = imported.coach || team.coach;
    team.captain = imported.captain || (numbers.includes(team.captain) ? team.captain : "");
    team.roster = [...imported.players, ...defaultRoster()].slice(0, 14);
    modalRoot.replaceChildren();
    renderSetup();
    saveState();
    toast(`${letter} 队已导入 ${imported.players.length} 名队员。${team.captain ? "" : " 请补充队长号码。"}`);
  });
}

export function openDataManager() {
  const snapshots = recoverySnapshots();
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal wide"><div class="modal-head"><div><h2>数据管理与恢复</h2><p>JSON 包含比赛信息、名单、全部局记录、判罚和操作日志，可用于迁移或恢复。</p></div><button class="icon-button" id="close-modal" type="button">×</button></div><div class="data-actions"><button class="primary-button blue" id="export-json" type="button">导出完整比赛 JSON</button><button class="ghost-button" id="import-json" type="button">从 JSON 恢复</button><input id="import-json-file" type="file" accept="application/json,.json" hidden /></div><section class="snapshot-panel"><div><h3>自动恢复快照</h3><p>最多保留最近 5 个关键状态；恢复前会先备份当前数据。</p></div><div class="snapshot-list">${snapshots.length ? snapshots.map(item => `<article><div><b>${escapeHTML(item.label)}</b><small>${escapeHTML(new Date(item.at).toLocaleString("zh-CN", { hour12: false }))}</small></div><button class="ghost-button compact" type="button" data-restore-snapshot="${escapeHTML(item.id)}">恢复</button></article>`).join("") : '<div class="event-empty">尚无恢复快照。比赛开始并产生操作后会自动生成。</div>'}</div></section><div id="modal-validation"></div></section></div>`;
  modalRoot.querySelector("#close-modal").addEventListener("click", () => modalRoot.replaceChildren());
  modalRoot.querySelector("#export-json").addEventListener("click", exportMatchJSON);
  const fileInput = modalRoot.querySelector("#import-json-file");
  modalRoot.querySelector("#import-json").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    try {
      const file = fileInput.files?.[0];
      if (!file) return;
      const parsed = JSON.parse(await file.text());
      const imported = parsed.state || parsed;
      if (!imported?.meta || !Array.isArray(imported.teams) || imported.teams.length !== 2) throw new Error("文件不包含有效的 Volley Record 比赛数据。");
      if (!confirm("从 JSON 恢复会替换当前页面中的比赛数据，是否继续？")) return;
      saveRecoverySnapshot("JSON 导入前自动备份", true);
      replaceState(normalizeState(imported));
      modalRoot.replaceChildren();
      render();
      toast("比赛数据已从 JSON 恢复。 ");
    } catch (error) {
      modalRoot.querySelector("#modal-validation").innerHTML = `<div class="validation-banner">${escapeHTML(error.message || "JSON 文件读取失败。")}</div>`;
    }
  });
  modalRoot.querySelectorAll("[data-restore-snapshot]").forEach(button => button.addEventListener("click", () => {
    const snapshot = snapshots.find(item => item.id === button.dataset.restoreSnapshot);
    if (!snapshot || !confirm(`恢复“${snapshot.label}”会替换当前页面状态，是否继续？`)) return;
    saveRecoverySnapshot("快照恢复前自动备份", true);
    replaceState(normalizeState(snapshot.state));
    modalRoot.replaceChildren();
    render();
    toast(`已恢复快照：${snapshot.label}`);
  }));
}

export function renderScore() {
  let content = app.querySelector("#score-content");
  if (!content) {
    app.replaceChildren(document.querySelector("#score-template").content.cloneNode(true));
    content = app.querySelector("#score-content");
  }
  const set = currentSet();
  const profile = currentProfile();
  content.innerHTML = `
    <div class="match-toolbar">
      <div class="match-context">
        <span class="rule-badge">${escapeHTML(profile.label)}</span>
        <span>${matchFormatLabel()}</span><span>·</span><span>专业记录表</span><span>·</span><span>${escapeHTML(state.meta.matchNo || "未编号")}</span><span>·</span><span>${escapeHTML(state.meta.venue)}</span>
      </div>
      <div class="match-toolbar-actions">
        ${state.match.endingPending && !state.match.ended ? '<button class="primary-button compact" type="button" data-score-action="confirm-end">确认比赛结束</button>' : ""}
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

export function scoreboardHTML(set) {
  const liberoBlock = [0, 1].find(teamIndex => liberoNeedsImmediateExit(teamIndex, set));
  const scoreStatus = liberoBlock !== undefined
    ? `请先完成 ${escapeHTML(state.teams[liberoBlock].name)} 的自由人离场`
    : (state.match.endingPending && !state.match.ended ? "比赛结果待确认" : (set.ended ? "本局已结束" : `${escapeHTML(servicePlayer(set.onCourt[set.servingTeam], set.rotationIndex[set.servingTeam]))} 号发球`));
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
          <button class="score-button plus" type="button" data-score-action="plus" data-team="0" ${set.ended || liberoBlock !== undefined ? "disabled" : ""}>+ 1</button>
        </div>
        <div class="score-status ${liberoBlock !== undefined ? "attention" : ""}">${scoreStatus}</div>
        <div class="team-controls">
          <button class="score-button plus" type="button" data-score-action="plus" data-team="1" ${set.ended || liberoBlock !== undefined ? "disabled" : ""}>+ 1</button>
          <button class="score-button" type="button" data-score-action="minus" data-team="1" ${canUndoTeam(1) ? "" : "disabled"}>− 1</button>
        </div>
      </div>
    </section>`;
}

export function teamScoreHTML(teamIndex, set) {
  const server = set.servingTeam === teamIndex && !set.ended;
  const scoreFirst = teamIndex === 1;
  const info = `<div class="team-score-info"><small>TEAM ${teamIndex === 0 ? "A" : "B"}</small><h2>${escapeHTML(state.teams[teamIndex].name)}</h2><span class="sets-won">已胜 ${state.match.setsWon[teamIndex]} / ${state.match.setsToWin} 局</span>${server ? `<span class="server-dot">${escapeHTML(servicePlayer(set.onCourt[teamIndex], set.rotationIndex[teamIndex]))} 号发球</span>` : ""}</div>`;
  const score = `<strong class="big-score">${set.score[teamIndex]}</strong>`;
  return `<div class="team-score">${scoreFirst ? score + info : info + score}</div>`;
}

export function setHistoryHTML(compact = false) {
  const completed = state.match.sets.filter(item => item.ended);
  return `<div class="set-history ${compact ? "compact" : ""}">
    <span class="set-history-label">此前各局</span>
    ${completed.length ? completed.map(item => `<span class="set-history-item winner-${item.winner === 0 ? "a" : "b"}"><b>第 ${item.number} 局</b>${item.score[0]} : ${item.score[1]}</span>`).join("") : `<span class="set-history-empty">${matchFormatLabel()} · 尚无已结束局</span>`}
  </div>`;
}

export function canUndoTeam(teamIndex) {
  const set = currentSet();
  const latest = latestReversibleAction();
  return (!set.ended || state.match.endingPending) && latest?.type === "score" && latest.meta?.teamIndex === teamIndex && latest.meta?.source !== "sanction";
}

export function operationsHTML(set) {
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
      <h3>自由人替换</h3><p>不计普通换人；自动校验后排位置和已完成回合。</p>
      <div class="operation-row">
        ${[0,1].map(team => `<button class="action-button ${liberoNeedsImmediateExit(team, set) ? "needs-action" : ""}" type="button" data-score-action="libero" data-team="${team}" ${set.ended ? "disabled" : ""}>${escapeHTML(state.teams[team].name)}<strong>${escapeHTML(liberoStatusText(team, set))}</strong></button>`).join("")}
      </div>
    </section>
    <section class="operation-card sanction-card">
      <h3>判罚与延误</h3><p>记录不当请求、延误及行为判罚；罚分会自动计入对方比分。</p>
      <button class="action-button wide" type="button" data-score-action="sanction" ${set.ended ? "disabled" : ""}>登记判罚<strong>${state.match.sanctions.length} 条</strong></button>
    </section>
    <section class="operation-card">
      <h3>操作日志与纠错</h3><p>保留所有关键操作；只能安全撤销最近一个有效操作。</p>
      <button class="action-button wide" type="button" data-score-action="audit">查看操作日志<strong>${state.match.auditLog.length} 条</strong></button>
    </section>
    <section class="operation-card">
      <h3>比赛事件</h3><p>最近的得分、轮转、暂停和换人记录。</p>
      <div class="event-list">
        ${set.events.length ? [...set.events].reverse().slice(0, 12).map(event => `<div class="event-item"><time>${escapeHTML(event.time)}</time><p>${escapeHTML(event.text)}</p></div>`).join("") : '<div class="event-empty">暂无事件</div>'}
      </div>
    </section>
  </aside>`;
}

export function sheetHTML(set, printMode = false) {
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
      ${liberoControlHTML(set)}
      ${sanctionControlHTML(set)}
      <div class="sheet-summary">
        <div class="summary-events"><h4>备　注 / 自动记录</h4>${set.substitutions.flat().length ? set.substitutions.flat().map(sub => `<p>第 ${set.number} 局 · ${escapeHTML(sub.team)}：${escapeHTML(sub.out)} 号下，${escapeHTML(sub.in)} 号上（${escapeHTML(sub.score)}）</p>`).join("") : "<p>本局暂无普通换人记录。</p>"}${set.courtChanged ? "<p>决胜局领先队达到 8 分，已记录交换场区。</p>" : ""}${state.match.auditLog.filter(entry => entry.type === "correction" && entry.setNumber === set.number).map(entry => `<p>纠错：${escapeHTML(entry.label)}；原因：${escapeHTML(entry.meta?.reason || "—")}</p>`).join("")}</div>
        <div class="match-results"><h4>比　赛　结　果</h4>${state.match.sets.map(item => `<div class="result-row"><b>${item.number}</b><span>${item.endTime ? `${item.startTime}–${item.endTime}` : "进行中"}</span><strong>${item.score[0]}</strong><strong>${item.score[1]}</strong></div>`).join("")}</div>
      </div>
    </section>`;
}

export function liberoControlHTML(set) {
  return `<section class="libero-control"><h4>自由人控制记录 / LIBERO CONTROL</h4><div>${[0, 1].map(teamIndex => `<article><b>${teamIndex === 0 ? "A" : "B"} · ${escapeHTML(state.teams[teamIndex].name)}</b>${set.liberoReplacements[teamIndex].length ? set.liberoReplacements[teamIndex].map(item => `<span>${escapeHTML(item.at)}　${escapeHTML(item.text)}（${escapeHTML(item.score)}）</span>`).join("") : "<span>本局暂无自由人替换。</span>"}</article>`).join("")}</div></section>`;
}

export function sanctionControlHTML(set) {
  return `<section class="sanction-control"><h4>判罚与延误 / SANCTIONS</h4>${set.sanctions.length ? `<div class="sanction-table"><b>队伍</b><b>成员</b><b>判罚</b><b>比分</b>${set.sanctions.map(item => `<span>${item.teamIndex === 0 ? "A" : "B"}</span><span>${escapeHTML(item.target)}</span><span>${escapeHTML(item.label)} · ${escapeHTML(item.card)}</span><span>${escapeHTML(item.scoreBefore)}${item.pointAwarded ? ` → ${escapeHTML(item.scoreAfter)}` : ""}</span>`).join("")}</div>` : "<p>本局暂无判罚记录。</p>"}</section>`;
}

export function sheetPersonnelHTML(set) {
  return `<section class="sheet-personnel">
    <div class="sheet-section-label">双方名单 · 教练员 · 第 ${set.number} 局轮次表</div>
    <div class="sheet-team-details">
      ${state.teams.map((team, teamIndex) => {
        const players = team.roster.filter(player => player.number && player.name);
        return `<article class="sheet-roster-card">
          <div class="sheet-roster-head"><span>${teamIndex === 0 ? "A" : "B"}</span><strong>${escapeHTML(team.name)}</strong><small><b>主教练</b> ${escapeHTML(team.coach || "—")}</small></div>
          <div class="sheet-lineup-summary">${roman.map((position, index) => `<span><b>${position}</b>${escapeHTML(set.lineups[teamIndex][index])}</span>`).join("")}</div>
          <div class="sheet-roster-grid">${players.map(player => `<span class="sheet-player"><b>${escapeHTML(player.number)}</b>${escapeHTML(player.name)}${player.number === team.captain ? " <i>C</i>" : ""}${isLiberoNumber(teamIndex, player.number) ? " <i>L</i>" : ""}</span>`).join("")}</div>
        </article>`;
      }).join("")}
    </div>
  </section>`;
}

export function printOverviewHTML() {
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

export function exportFullMatchPDF() {
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

export function paperTeamHTML(teamIndex, set) {
  const team = state.teams[teamIndex];
  const pointBase = set.number === state.match.maxSets ? 30 : 48;
  const pointCount = Math.max(pointBase, set.score[teamIndex]);
  const sanctionPoints = new Set(set.rallies.filter(rally => rally.winner === teamIndex && rally.source === "sanction").map(rally => rally.teamPoint));
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
        <div class="point-grid">${Array.from({ length: pointCount }, (_, index) => index + 1).map(point => `<span class="point-cell ${point <= set.score[teamIndex] ? "marked" : ""} ${set.ended && point === set.score[teamIndex] ? "last" : ""} ${sanctionPoints.has(point) ? "penalty" : ""}">${point}</span>`).join("")}</div>
      </div>
      <div class="timeout-area"><h4>暂停 T</h4>${[0,1].map(index => `<div class="timeout-slot">${escapeHTML(set.timeouts[teamIndex][index] || "— : —")}</div>`).join("")}</div>
    </div>
  </section>`;
}

export function rotationCellHTML(teamIndex, positionIndex, set) {
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

export function bindScoreActions() {
  app.querySelectorAll("[data-score-action]").forEach(button => button.addEventListener("click", () => {
    const action = button.dataset.scoreAction;
    const team = Number(button.dataset.team);
    if (action === "plus") awardPoint(team);
    if (action === "minus") undoPoint(team);
    if (action === "timeout") requestTimeout(team);
    if (action === "substitution") openSubstitutionModal(team);
    if (action === "libero") openLiberoModal(team);
    if (action === "sanction") openSanctionModal();
    if (action === "audit") openAuditModal();
    if (action === "view-set") { state.viewSetIndex = Number(button.dataset.index); renderScore(); }
    if (action === "print") exportFullMatchPDF();
    if (action === "edit-info") openInfoModal();
    if (action === "confirm-end") openMatchEndConfirmationModal();
  }));
}

export function openTimeoutModal(teamIndex, seconds) {
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

export function openSanctionModal() {
  const set = currentSet();
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal"><div class="modal-head"><div><h2>判罚与延误登记</h2><p>根据 FIVB 规则自动判断不当请求和延误的后续处理。</p></div><button class="icon-button" id="close-modal" type="button">×</button></div><div class="form-grid"><div class="field"><label>责任队伍</label><select id="sanction-team">${state.teams.map((team, index) => `<option value="${index}">${index === 0 ? "A" : "B"} · ${escapeHTML(team.name)}</option>`).join("")}</select></div><div class="field"><label>登记类型</label><select id="sanction-kind"><option value="improper">不当请求</option><option value="delay">比赛延误</option><option value="warning">行为警告（黄牌）</option><option value="penalty">行为罚分（红牌）</option><option value="expulsion">驱逐（红黄牌同持）</option><option value="disqualification">取消比赛资格（红黄牌分持）</option></select></div><div class="field full"><label>责任成员</label><input id="sanction-target" placeholder="例如：8 号球员 / 主教练 / 球队" /></div><div class="field full"><label>原因或备注</label><textarea id="sanction-note" rows="3" placeholder="记录裁判员说明，便于赛后审核"></textarea></div></div><div class="rule-note"><span>i</span><p>首次不当请求只记录；重复不当请求按延误处理。首次延误为警告，之后的延误罚对方一分并给予发球权。</p></div><div id="modal-validation"></div><div class="modal-actions"><button class="ghost-button" id="cancel-modal" type="button">取消</button><button class="primary-button blue" id="confirm-sanction" type="button">确认登记</button></div></section></div>`;
  const close = () => modalRoot.replaceChildren();
  modalRoot.querySelector("#close-modal").addEventListener("click", close);
  modalRoot.querySelector("#cancel-modal").addEventListener("click", close);
  modalRoot.querySelector("#confirm-sanction").addEventListener("click", () => {
    const result = applySanction(
      Number(modalRoot.querySelector("#sanction-team").value),
      modalRoot.querySelector("#sanction-kind").value,
      modalRoot.querySelector("#sanction-target").value.trim(),
      modalRoot.querySelector("#sanction-note").value.trim()
    );
    if (!result.ok) modalRoot.querySelector("#modal-validation").innerHTML = `<div class="validation-banner">${escapeHTML(result.message)}</div>`;
  });
}

export function openAuditModal() {
  const entries = [...state.match.auditLog].reverse();
  const latest = latestReversibleAction();
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal wide"><div class="modal-head"><div><h2>操作日志与纠错</h2><p>日志按时间倒序显示。为保持轮次和记录一致，只能撤销最近一个有效操作。</p></div><button class="icon-button" id="close-modal" type="button">×</button></div><div class="audit-list">${entries.length ? entries.map(entry => `<article class="audit-entry ${entry.reversed ? "reversed" : ""} ${entry.type === "correction" ? "correction" : ""}"><time>${escapeHTML(entry.at)}</time><span class="audit-type">${escapeHTML(entry.type)}</span><div><b>${escapeHTML(entry.label)}</b><small>第 ${entry.setNumber || "—"} 局 · 比分 ${escapeHTML(entry.score)}${entry.meta?.reason ? ` · 原因：${escapeHTML(entry.meta.reason)}` : ""}</small></div>${entry.reversed ? "<em>已撤销</em>" : ""}</article>`).join("") : '<div class="event-empty">暂无操作日志</div>'}</div>${latest ? `<div class="audit-correction"><div><b>可撤销的最近操作</b><span>${escapeHTML(latest.label)} · 第 ${latest.setNumber} 局 · ${escapeHTML(latest.score)}</span></div><div class="field"><label>纠错原因 <span>*</span></label><input id="correction-reason" placeholder="例如：裁判员更正判定 / 记录员误触" /></div><button class="danger-button" id="reverse-action" type="button">撤销此操作</button></div>` : '<div class="rule-note"><span>✓</span><p>当前没有可撤销的操作。</p></div>'}<div id="modal-validation"></div></section></div>`;
  modalRoot.querySelector("#close-modal").addEventListener("click", () => modalRoot.replaceChildren());
  modalRoot.querySelector("#reverse-action")?.addEventListener("click", () => {
    const reason = modalRoot.querySelector("#correction-reason").value.trim();
    if (!reason) {
      modalRoot.querySelector("#modal-validation").innerHTML = '<div class="validation-banner">请填写纠错原因。</div>';
      return;
    }
    const result = reverseLatestAction(reason);
    if (!result.ok) {
      modalRoot.querySelector("#modal-validation").innerHTML = `<div class="validation-banner">${escapeHTML(result.message)}</div>`;
      return;
    }
    modalRoot.replaceChildren();
    state.viewSetIndex = state.match.currentSetIndex;
    render();
    toast(`已撤销“${result.entry.label}”，纠错原因已写入日志。`);
    const set = currentSet();
    if (set?.ended && state.match.ended) setTimeout(openMatchEndModal, 80);
    else if (set?.ended) setTimeout(() => openSetEndModal(set), 80);
  });
}

export function openLiberoModal(teamIndex) {
  const set = currentSet();
  const team = state.teams[teamIndex];
  const liberos = liberoPlayers(teamIndex);
  const control = set.liberoState[teamIndex];
  const canReplace = canMakeLiberoReplacement(control.lastReplacementRally, set.rallies.length);
  if (!liberos.length) {
    modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal"><div class="modal-head"><div><h2>${escapeHTML(team.name)} 自由人替换</h2><p>赛前名单中没有登记自由人。</p></div><button class="icon-button" id="close-modal" type="button">×</button></div><div class="rule-note"><span>i</span><p>如需使用自由人，请重新开始比赛并在球队名单中标记自由人。</p></div></section></div>`;
    modalRoot.querySelector("#close-modal").addEventListener("click", () => modalRoot.replaceChildren());
    return;
  }
  const gapWarning = canReplace ? "" : `<div class="validation-banner">上一次自由人替换后尚未完成一个回合，当前不能再次替换。</div>`;
  if (control.active) {
    const active = control.active;
    const secondLiberos = liberos.filter(player => player.number !== active.libero && !set.onCourt[teamIndex].includes(player.number));
    const mustExit = liberoNeedsImmediateExit(teamIndex, set);
    modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal"><div class="modal-head"><div><h2>${escapeHTML(team.name)} 自由人替换</h2><p>${escapeHTML(active.libero)} 号自由人当前替换 ${escapeHTML(active.regular)} 号，位于 ${roman[courtPositionForIndex(active.positionIndex, set.rotationIndex[teamIndex])]} 号位。</p></div><button class="icon-button" id="close-modal" type="button">×</button></div>${mustExit ? '<div class="validation-banner">自由人即将进入前排或处于发球位置，必须由对应常规球员换回。</div>' : gapWarning}<div class="choice-stack"><label><input type="radio" name="libero-action" value="exit" checked /> <span><b>${escapeHTML(active.regular)} 号常规球员换回</b><small>自由人离场，本次不计普通换人。</small></span></label>${!mustExit && secondLiberos.length ? `<label><input type="radio" name="libero-action" value="switch" /> <span><b>更换为第二自由人</b><small>对应常规球员仍为 ${escapeHTML(active.regular)} 号。</small></span></label><div class="field"><label>第二自由人</label><select id="second-libero">${secondLiberos.map(player => `<option value="${escapeHTML(player.number)}">${escapeHTML(player.number)} · ${escapeHTML(player.name)}</option>`).join("")}</select></div>` : ""}</div><div id="modal-validation"></div><div class="modal-actions"><button class="ghost-button" id="cancel-modal" type="button">取消</button><button class="primary-button blue" id="confirm-libero" type="button" ${!canReplace ? "disabled" : ""}>确认自由人替换</button></div></section></div>`;
  } else {
    const regulars = eligibleLiberoRegulars(teamIndex, set);
    modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal"><div class="modal-head"><div><h2>${escapeHTML(team.name)} 自由人进入</h2><p>只能替换当前后排常规球员；发球队的 I 号位球员不能被自由人替换。</p></div><button class="icon-button" id="close-modal" type="button">×</button></div>${gapWarning}<div class="substitution-visual"><div class="field"><label>离场常规球员</label><select id="libero-regular"><option value="">请选择</option>${regulars.map(item => `<option value="${escapeHTML(item.number)}">${escapeHTML(item.number)} · ${escapeHTML(playerName(teamIndex, item.number))}（${roman[item.courtPosition]}）</option>`).join("")}</select></div><div class="substitution-arrow">→</div><div class="field"><label>进入自由人</label><select id="libero-in"><option value="">请选择</option>${liberos.filter(player => !set.onCourt[teamIndex].includes(player.number)).map(player => `<option value="${escapeHTML(player.number)}">${escapeHTML(player.number)} · ${escapeHTML(player.name)}</option>`).join("")}</select></div></div><div id="modal-validation"></div><div class="modal-actions"><button class="ghost-button" id="cancel-modal" type="button">取消</button><button class="primary-button blue" id="confirm-libero" type="button" ${!canReplace || !regulars.length ? "disabled" : ""}>确认自由人进入</button></div></section></div>`;
  }
  modalRoot.querySelector(".modal-actions").insertAdjacentHTML("beforebegin", '<div class="libero-redesignate-row"><span>自由人受伤、患病、被驱逐或被取消资格？</span><button class="text-button" id="open-libero-redesignation" type="button">登记无法继续 / 重新指定</button></div>');
  const close = () => modalRoot.replaceChildren();
  modalRoot.querySelector("#close-modal").addEventListener("click", close);
  modalRoot.querySelector("#cancel-modal").addEventListener("click", close);
  modalRoot.querySelector("#open-libero-redesignation").addEventListener("click", () => openLiberoRedesignationModal(teamIndex));
  modalRoot.querySelector("#confirm-libero")?.addEventListener("click", () => {
    const action = modalRoot.querySelector('[name="libero-action"]:checked')?.value || "enter";
    const regular = control.active?.regular || modalRoot.querySelector("#libero-regular")?.value || "";
    const libero = action === "switch" ? modalRoot.querySelector("#second-libero")?.value : (control.active?.libero || modalRoot.querySelector("#libero-in")?.value || "");
    const result = performLiberoReplacement(teamIndex, action, regular, libero);
    if (!result.ok) modalRoot.querySelector("#modal-validation").innerHTML = `<div class="validation-banner">${escapeHTML(result.message)}</div>`;
  });
}

export function openLiberoRedesignationModal(teamIndex) {
  const set = currentSet();
  const team = state.teams[teamIndex];
  const control = state.match.liberoControl[teamIndex];
  const available = liberoPlayers(teamIndex);
  const active = set.liberoState[teamIndex].active;
  const designatedNumbers = new Set(allDesignatedLiberoNumbers(teamIndex));
  const candidates = team.roster.filter(player => player.number && player.name && !set.onCourt[teamIndex].includes(player.number) && !designatedNumbers.has(player.number) && player.number !== active?.regular);
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal"><div class="modal-head"><div><h2>${escapeHTML(team.name)} 自由人无法继续 / 重新指定</h2><p>被宣布无法继续的自由人本场不得再次参赛。仍有另一名可用自由人时，不允许重新指定。</p></div><button class="icon-button" id="close-modal" type="button">×</button></div><div class="form-grid"><div class="field full"><label>无法继续比赛的自由人</label><select id="unavailable-libero"><option value="">请选择</option>${available.map(player => `<option value="${escapeHTML(player.number)}">${escapeHTML(player.number)} · ${escapeHTML(player.name)}${active?.libero === player.number ? "（当前在场）" : ""}</option>`).join("")}</select></div><div class="field full"><label>重新指定的新自由人</label><select id="redesignated-libero"><option value="">暂不重新指定</option>${candidates.map(player => `<option value="${escapeHTML(player.number)}">${escapeHTML(player.number)} · ${escapeHTML(player.name)}</option>`).join("")}</select></div><div class="field full"><label>原因</label><input id="libero-unavailable-reason" placeholder="例如：受伤 / 患病 / 被驱逐 / 被取消比赛资格" /></div></div><div class="rule-note"><span>i</span><p>重新指定者必须在当前场外，且不能是场上自由人的对应常规替换球员。进一步的重新指定仍会保留完整记录。</p></div><div id="modal-validation"></div><div class="modal-actions"><button class="ghost-button" id="cancel-modal" type="button">取消</button><button class="primary-button blue" id="confirm-redesignation" type="button">确认登记</button></div></section></div>`;
  const close = () => modalRoot.replaceChildren();
  modalRoot.querySelector("#close-modal").addEventListener("click", close);
  modalRoot.querySelector("#cancel-modal").addEventListener("click", close);
  modalRoot.querySelector("#confirm-redesignation").addEventListener("click", () => {
    const result = applyLiberoRedesignation(teamIndex, modalRoot.querySelector("#unavailable-libero").value, modalRoot.querySelector("#redesignated-libero").value, modalRoot.querySelector("#libero-unavailable-reason").value.trim());
    if (!result.ok) modalRoot.querySelector("#modal-validation").innerHTML = `<div class="validation-banner">${escapeHTML(result.message)}</div>`;
  });
}

export function openSubstitutionModal(teamIndex) {
  const set = currentSet();
  const activeLibero = set.liberoState[teamIndex].active;
  const onCourt = set.onCourt[teamIndex].filter(number => !isLiberoNumber(teamIndex, number));
  const bench = rosterNumbers(teamIndex).filter(number => !set.onCourt[teamIndex].includes(number) && number !== activeLibero?.regular && !isLiberoNumber(teamIndex, number));
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

export function openSetEndModal(set) {
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal"><div class="winner-banner"><small>SET ${set.number} COMPLETE</small><h2>${escapeHTML(state.teams[set.winner].name)}</h2><strong>${set.score[set.winner]} : ${set.score[1 - set.winner]}</strong></div>${setHistoryHTML(true)}<div class="modal-actions"><button class="primary-button blue" id="next-lineup" type="button">填写第 ${set.number + 1} 局位置轮次表</button></div></section></div>`;
  modalRoot.querySelector("#next-lineup").addEventListener("click", () => openLineupModal(set.number + 1));
}

export function openLineupModal(nextNumber) {
  const previous = currentSet();
  const suggestedLineups = previous.onCourt.map((lineup, teamIndex) => lineup.map(number => {
    return isLiberoNumber(teamIndex, number) ? (previous.liberoState[teamIndex].active?.regular || previous.lineups[teamIndex][lineup.indexOf(number)]) : number;
  }));
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
      const liberos = liberoPlayers(teamIndex).map(player => player.number);
      if (lineups[teamIndex].some(number => liberos.includes(number))) {
        modalRoot.querySelector("#modal-validation").innerHTML = `<div class="validation-banner">${escapeHTML(state.teams[teamIndex].name)}：首发轮次中不能直接登记自由人。</div>`;
        return;
      }
    }
    const firstServer = Number(modalRoot.querySelector('[name="nextServer"]:checked').value);
    const before = matchSnapshot();
    state.match.sets.push(createSet(nextNumber, lineups, firstServer));
    state.match.currentSetIndex += 1;
    state.match.undoStack = [];
    state.viewSetIndex = state.match.currentSetIndex;
    recordAuditAction("set", `开始第 ${nextNumber} 局并写入双方轮次`, before, { nextNumber, firstServer });
    modalRoot.replaceChildren();
    render();
  });
}

export function openMatchEndModal() {
  const winner = state.match.setsWon[0] > state.match.setsWon[1] ? 0 : 1;
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal"><div class="winner-banner"><small>MATCH COMPLETE · ${matchFormatLabel()}</small><h2>${escapeHTML(state.teams[winner].name)}</h2><strong>${state.match.setsWon[0]} : ${state.match.setsWon[1]}</strong></div>${setHistoryHTML(true)}<div class="rule-note"><span>✓</span><p><strong>赛后确认</strong>　请依次由记录员、两队队长、第二裁判员和第一裁判员确认比赛结果。电子签字功能将在正式部署版本接入。</p></div><div class="modal-actions"><button class="ghost-button" id="close-result" type="button">查看记录表</button><button class="primary-button blue" id="print-result" type="button">打印比赛记录</button></div></section></div>`;
  modalRoot.querySelector("#close-result").addEventListener("click", () => modalRoot.replaceChildren());
  modalRoot.querySelector("#print-result").addEventListener("click", () => { modalRoot.replaceChildren(); exportFullMatchPDF(); });
}

export function openMatchEndConfirmationModal() {
  if (!state.match?.endingPending || state.match.ended) return openMatchEndModal();
  const winner = state.match.setsWon[0] > state.match.setsWon[1] ? 0 : 1;
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal"><div class="winner-banner pending"><small>MATCH RESULT · 待正式确认</small><h2>${escapeHTML(state.teams[winner].name)}</h2><strong>${state.match.setsWon[0]} : ${state.match.setsWon[1]}</strong></div>${setHistoryHTML(true)}<div class="end-confirmation-list"><label><input type="checkbox" data-end-check /><span><b>记录员已核对各局比分与总局分</b><small>${escapeHTML(state.officials.scorer || "记录员未填写姓名")}</small></span></label><label><input type="checkbox" data-end-check /><span><b>双方队长已确认比赛结果</b><small>${escapeHTML(state.teams[0].captain || "A 队队长未填写")} 号 / ${escapeHTML(state.teams[1].captain || "B 队队长未填写")} 号</small></span></label><label><input type="checkbox" data-end-check /><span><b>第二裁判员与第一裁判员已完成确认</b><small>${escapeHTML(state.officials.secondReferee || "第二裁判员未填写")} / ${escapeHTML(state.officials.firstReferee || "第一裁判员未填写")}</small></span></label></div><div class="form-grid end-confirmation-fields"><div class="field"><label>正式结束时间</label><input id="confirmed-end-time" type="time" step="1" value="${escapeHTML(formatClock())}" /></div><div class="field full"><label>赛后备注</label><textarea id="end-confirmation-note" rows="2" placeholder="可选：记录申诉、特殊情况或签字说明"></textarea></div></div><div id="end-confirmation-validation"></div><div class="modal-actions"><button class="ghost-button" id="review-result" type="button">返回检查，可撤回最后一分</button><button class="primary-button blue" id="confirm-match-end" type="button" disabled>正式结束比赛</button></div></section></div>`;
  const checks = [...modalRoot.querySelectorAll("[data-end-check]")];
  const confirm = modalRoot.querySelector("#confirm-match-end");
  const update = () => { confirm.disabled = !checks.every(input => input.checked); };
  checks.forEach(input => input.addEventListener("change", update));
  modalRoot.querySelector("#review-result").addEventListener("click", () => modalRoot.replaceChildren());
  confirm.addEventListener("click", () => {
    const endTime = modalRoot.querySelector("#confirmed-end-time").value;
    if (!endTime) {
      modalRoot.querySelector("#end-confirmation-validation").innerHTML = '<div class="validation-banner">请填写正式结束时间。</div>';
      return;
    }
    state.match.endingPending = false;
    state.match.ended = true;
    state.match.endedAt = endTime;
    state.match.endConfirmation = {
      confirmedAt: new Date().toISOString(),
      endTime,
      scorer: state.officials.scorer,
      teamCaptains: state.teams.map(team => team.captain),
      secondReferee: state.officials.secondReferee,
      firstReferee: state.officials.firstReferee,
      note: modalRoot.querySelector("#end-confirmation-note").value.trim()
    };
    currentSet().events.push({ time: endTime, text: "记录员、双方队长及裁判员已确认比赛结果，比赛正式结束。" });
    recordAuditAction("match", "比赛结果已完成赛后确认并正式结束", null, { endTime, confirmation: clone(state.match.endConfirmation) });
    render();
    openMatchEndModal();
    toast("比赛结果已确认并封存。 ");
  });
}

export function openInfoModal() {
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal"><div class="modal-head"><div><h2>赛前信息</h2><p>${escapeHTML(state.meta.competition)} · ${escapeHTML(state.meta.date)} ${escapeHTML(state.meta.scheduledTime)}</p></div><button class="icon-button" id="close-info" type="button">×</button></div><div class="form-grid"><div class="field"><span class="field-label">场馆</span><strong>${escapeHTML(state.meta.venue)}</strong></div><div class="field"><span class="field-label">规则</span><strong>${escapeHTML(currentProfile().label)}</strong></div><div class="field"><span class="field-label">赛制</span><strong>${matchFormatLabel()}</strong></div><div class="field"><span class="field-label">第一裁判员</span><strong>${escapeHTML(state.officials.firstReferee)}</strong></div><div class="field"><span class="field-label">第二裁判员</span><strong>${escapeHTML(state.officials.secondReferee)}</strong></div><div class="field"><span class="field-label">记录员</span><strong>${escapeHTML(state.officials.scorer)}</strong></div><div class="field"><span class="field-label">换人上限</span><strong>每队每局 ${currentProfile().substitutionsPerSet} 次</strong></div></div></section></div>`;
  modalRoot.querySelector("#close-info").addEventListener("click", () => modalRoot.replaceChildren());
}

export function exportMatchJSON() {
  const payload = { schemaVersion: 2, app: "Volley Record", exportedAt: new Date().toISOString(), state: clone(state) };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${safeFilename(state.meta.competition)}-${safeFilename(state.teams[0].name || "A队")}-vs-${safeFilename(state.teams[1].name || "B队")}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  toast("完整比赛 JSON 已导出。 ");
}
