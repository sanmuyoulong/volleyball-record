// 赛事管理页面：赛事列表、创建赛事、赛事详情（比赛列表 / 选两队建比赛 / 删除比赛）。
// 只调用数据层原语，不加载记分应用本身；进入比赛一律通过跳转 /record/?match=<id> 完成，
// 因此记分逻辑对赛事的存在完全无感知。
import {
  STORAGE_KEY,
  tournaments,
  saveTournaments,
  initialState,
  defaultRoster,
  newId,
  writeMatch,
  deleteMatch,
  setActiveMatch
} from "./state.js";
import { escapeHTML, toast, confirmDialog } from "./ui.js";
import { computeStandings } from "./tournament-rules.js";

const root = document.querySelector("#tournament-app");
const params = new URLSearchParams(location.search);
const currentId = params.get("id");

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function findTournament(id) {
  return tournaments().find(item => item.id === id) || null;
}

// 切换或新建比赛前，先把当前活动槽里的比赛写回归档，避免未归档的进度丢失。
function archiveCurrentMatch() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const current = JSON.parse(raw);
    if (current?.matchId) writeMatch(current.matchId, current);
  } catch {}
}

function createTournament(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const name = form.elements.name.value.trim();
  if (!name) {
    toast("请填写赛事名称", "error");
    form.elements.name.focus();
    return;
  }
  const list = tournaments();
  const tournament = {
    id: newId("tn"),
    name,
    venue: form.elements.venue.value.trim(),
    startDate: form.elements.startDate.value,
    note: form.elements.note.value.trim(),
    createdAt: new Date().toISOString(),
    matches: [],
    groups: 1,
    teams: []
  };
  list.unshift(tournament);
  if (!saveTournaments(list)) {
    toast("保存失败：本机存储空间可能已满", "error");
    return;
  }
  location.href = `./?id=${encodeURIComponent(tournament.id)}`;
}

// 把赛事里的队伍完整对象（含名单）转成比赛归档里的队伍结构。
function fullTeam(team) {
  return {
    id: team.id,
    name: team.name,
    coach: team.coach || "",
    captain: team.captain || "",
    roster: Array.isArray(team.roster) && team.roster.length ? team.roster : defaultRoster()
  };
}

// 选择两支队伍创建比赛，双方名单一并带入记录页。
async function createMatch(tournamentId) {
  const tournament = findTournament(tournamentId);
  if (!tournament) return;
  const named = (tournament.teams || []).filter(t => t.name);
  if (named.length < 2) {
    toast("请先在「赛制与队伍」中录入至少 2 支有名称的队伍", "error");
    return;
  }
  const pick = await createMatchDialog(tournament, named);
  if (!pick) return;
  const byId = Object.fromEntries((tournament.teams || []).map(t => [t.id, t]));
  const home = byId[pick.homeId];
  const away = byId[pick.awayId];
  if (!home || !away) { toast("请选择两支有效队伍", "error"); return; }
  archiveCurrentMatch();
  const matchId = newId("match");
  const next = initialState();
  next.matchId = matchId;
  next.tournamentId = tournamentId;
  next.teams = [fullTeam(home), fullTeam(away)];
  next.meta = { ...next.meta, competition: tournament.name || "" };
  next.screen = "setup";
  next.setupStep = 1;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {
    toast("保存失败：本机存储空间可能已满", "error");
    return;
  }
  writeMatch(matchId, next);
  setActiveMatch(matchId, tournamentId);
  const list = tournaments();
  const target = list.find(item => item.id === tournamentId);
  if (target) {
    target.matches = Array.isArray(target.matches) ? target.matches : [];
    target.matches.push({
      id: matchId,
      teamA: home.name,
      teamB: away.name,
      scoreText: "尚未开始",
      status: "待开始",
      updatedAt: new Date().toISOString()
    });
    saveTournaments(list);
  }
  location.href = `../record/?match=${encodeURIComponent(matchId)}`;
}

// 选队弹窗：返回 { homeId, awayId } 或 null（取消）。
function createMatchDialog(tournament, named) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-backdrop";
    const options = named.map(t => `<option value="${escapeHTML(t.id)}">${escapeHTML(t.name)}</option>`).join("");
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <p class="modal-message">选择两支队伍创建比赛，双方名单会一起带入记录页。</p>
        <div class="tn-match-form">
          <label>主队<select id="cm-home">${options}</select></label>
          <label>客队<select id="cm-away">${options}</select></label>
        </div>
        <div class="modal-actions">
          <button class="ghost-button" type="button" data-act="cancel">取消</button>
          <button class="primary-button blue" type="button" data-act="ok">创建比赛</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    // 默认客队选第二支，避免主客同为第一队被校验拦截。
    const awaySel = overlay.querySelector("#cm-away");
    if (awaySel && awaySel.options.length > 1) awaySel.selectedIndex = 1;
    const close = (value) => { overlay.remove(); resolve(value); };
    overlay.addEventListener("click", (event) => {
      const act = event.target.closest("[data-act]")?.dataset.act;
      if (act === "cancel") close(null);
      else if (act === "ok") {
        const home = overlay.querySelector("#cm-home").value;
        const away = overlay.querySelector("#cm-away").value;
        if (!home || !away || home === away) { toast("请选择两支不同的队伍", "error"); return; }
        close({ homeId: home, awayId: away });
      } else if (event.target === overlay) close(null);
    });
    overlay.querySelector('[data-act="ok"]')?.focus();
  });
}

async function removeMatch(tournamentId, matchId) {
  if (!(await confirmDialog("确定删除这场比赛吗？该场比赛的记录会一并删除，且无法恢复。", { okText: "删除", danger: true }))) return;
  const list = tournaments();
  const target = list.find(item => item.id === tournamentId);
  if (!target) return;
  target.matches = (target.matches || []).filter(item => item.id !== matchId);
  saveTournaments(list);
  deleteMatch(matchId);
  toast("比赛已删除");
  render();
}

async function removeTournament(tournamentId) {
  const tournament = findTournament(tournamentId);
  if (!tournament) return;
  const count = (tournament.matches || []).length;
  if (!(await confirmDialog(`确定删除赛事「${tournament.name}」吗？其下 ${count} 场比赛的记录会一并删除，且无法恢复。`, { okText: "删除赛事", danger: true }))) return;
  (tournament.matches || []).forEach(item => deleteMatch(item.id));
  const list = tournaments().filter(item => item.id !== tournamentId);
  if (!saveTournaments(list)) {
    toast("删除失败：保存本机数据出错", "error");
    return;
  }
  toast("赛事已删除");
  location.href = "./";
}

function tournamentCardHTML(item) {
  const count = (item.matches || []).length;
  const meta = [item.startDate, item.venue].filter(Boolean).join(" · ");
  return `
    <a class="tn-card" href="./?id=${encodeURIComponent(item.id)}">
      <span class="tn-card-top"><b>${escapeHTML(item.name)}</b><i>${count} 场</i></span>
      <span class="tn-meta">${escapeHTML(meta || "未填写地点与时间")}</span>
      ${item.note ? `<span class="tn-note">${escapeHTML(item.note)}</span>` : ""}
      <span class="tn-card-foot">进入赛事 <span>→</span></span>
    </a>`;
}

function matchRowHTML(item) {
  return `
    <article class="tn-match">
      <div class="tn-match-main">
        <b>${escapeHTML(item.teamA)} vs ${escapeHTML(item.teamB)}</b>
        <span class="tn-meta">${escapeHTML(item.status)} · ${escapeHTML(item.scoreText)}</span>
        <span class="tn-time">更新于 ${escapeHTML(formatTime(item.updatedAt))}</span>
      </div>
      <div class="tn-match-actions">
        <a class="primary-button compact blue" href="../record/?match=${encodeURIComponent(item.id)}">继续记录 <span>→</span></a>
        <button class="ghost-button compact" type="button" data-remove-match="${escapeHTML(item.id)}">删除</button>
      </div>
    </article>`;
}

function renderList() {
  const list = tournaments();
  root.innerHTML = `
    <section class="tn-wrap">
      <div class="tn-hero">
        <div>
          <span class="eyebrow">TOURNAMENT MANAGEMENT</span>
          <h1>把分散的场次，<br />组织成一届完整赛事。</h1>
          <p>先创建赛事，再录入队伍与名单，然后选择两支队伍创建比赛。每场比赛的记录逻辑与独立记分完全一致，赛事只负责把这些比赛归拢并统计积分。</p>
        </div>
        <form class="tn-form" id="create-tournament-form">
          <span class="tn-form-title">新建赛事</span>
          <div class="field"><label for="tn-name">赛事名称 <span>*</span></label><input id="tn-name" name="name" type="text" placeholder="例如：2026 校际排球邀请赛" autocomplete="off" /></div>
          <div class="field"><label for="tn-venue">地点</label><input id="tn-venue" name="venue" type="text" placeholder="选填" autocomplete="off" /></div>
          <div class="field"><label for="tn-date">开始日期</label><input id="tn-date" name="startDate" type="date" /></div>
          <div class="field full"><label for="tn-note">备注</label><input id="tn-note" name="note" type="text" placeholder="选填" autocomplete="off" /></div>
          <button class="primary-button blue" type="submit">创建赛事 <span>→</span></button>
        </form>
      </div>
      <div class="tn-section">
        <div class="tn-section-head"><h2>我的赛事</h2><span>${list.length} 个</span></div>
        ${list.length
          ? `<div class="tn-grid">${list.map(tournamentCardHTML).join("")}</div>`
          : `<div class="tn-empty">还没有赛事。用右侧表单创建第一个赛事，然后就能在赛事里新建比赛。</div>`}
      </div>
    </section>`;
  root.querySelector("#create-tournament-form").addEventListener("submit", createTournament);
}

function renderDetail(tournament) {
  const matches = tournament.matches || [];
  const meta = [tournament.startDate, tournament.venue].filter(Boolean).join(" · ");
  root.innerHTML = `
    <section class="tn-wrap">
      <a class="tn-back" href="./">← 返回赛事列表</a>
      <div class="tn-detail-head">
        <div>
          <span class="eyebrow">TOURNAMENT</span>
          <h1>${escapeHTML(tournament.name)}</h1>
          <span class="tn-meta">${escapeHTML(meta || "未填写地点与时间")}${tournament.note ? ` · ${escapeHTML(tournament.note)}` : ""}</span>
        </div>
        <button class="primary-button blue" type="button" id="create-match">新建比赛 <span>→</span></button>
        <button class="ghost-button danger-text" type="button" id="remove-tournament">删除赛事</button>
      </div>
      <div class="tn-section">
        <div class="tn-section-head"><h2>比赛</h2><span>${matches.length} 场</span></div>
        ${matches.length
          ? `<div class="tn-match-list">${matches.map(matchRowHTML).join("")}</div>`
          : `<div class="tn-empty">这个赛事还没有比赛。点「新建比赛」选择两支队伍即可开始记录。</div>`}
      </div>
      <div class="tn-section">
        <div class="tn-section-head"><h2>赛制与队伍</h2><span>${(tournament.teams || []).length} 队</span></div>
        <div id="format-teams"></div>
      </div>
      <div class="tn-section">
        <div class="tn-section-head"><h2>积分表</h2></div>
        <div id="standings-view"></div>
      </div>
    </section>`;
  root.querySelector("#create-match").addEventListener("click", () => createMatch(tournament.id));
  root.querySelector("#remove-tournament").addEventListener("click", () => removeTournament(tournament.id));
  root.querySelectorAll("[data-remove-match]").forEach(button => {
    button.addEventListener("click", () => removeMatch(tournament.id, button.dataset.removeMatch));
  });
  renderFormatTeams(tournament);
  renderStandings(tournament);
}

function seedRoster() {
  return Array.from({ length: 6 }, () => ({ number: "", name: "", libero: false }));
}

function playerRowHTML(teamId, player, index) {
  return `
    <div class="tn-player-row" data-player-index="${index}">
      <input class="tn-player-number" data-team-id="${escapeHTML(teamId)}" data-player-index="${index}" value="${escapeHTML(player.number)}" placeholder="号" inputmode="numeric" autocomplete="off" />
      <input class="tn-player-name" data-team-id="${escapeHTML(teamId)}" data-player-index="${index}" value="${escapeHTML(player.name)}" placeholder="姓名" autocomplete="off" />
      <label class="tn-libero"><input type="checkbox" data-team-id="${escapeHTML(teamId)}" data-player-index="${index}" ${player.libero ? "checked" : ""} /> 自由人</label>
      <button class="ghost-button compact" type="button" data-remove-player="${escapeHTML(teamId)}" data-player-index="${index}">×</button>
    </div>`;
}

function teamRowHTML(team, groupCount) {
  const groupOptions = Array.from({ length: groupCount }, (_, i) =>
    `<option value="${i}" ${Number(team.group) === i ? "selected" : ""}>第 ${i + 1} 组</option>`
  ).join("");
  const roster = Array.isArray(team.roster) && team.roster.length ? team.roster : seedRoster();
  return `
    <div class="tn-team-row" data-team-id="${escapeHTML(team.id)}">
      <div class="tn-team-head">
        <input class="tn-team-name" data-team-id="${escapeHTML(team.id)}" value="${escapeHTML(team.name)}" placeholder="队伍名称" autocomplete="off" />
        ${groupCount > 1 ? `<select class="tn-team-group" data-team-id="${escapeHTML(team.id)}">${groupOptions}</select>` : ""}
        <button class="ghost-button compact" type="button" data-remove-team="${escapeHTML(team.id)}">移除</button>
      </div>
      <div class="tn-roster">
        <div class="tn-roster-head"><span>名单（至少 6 人）</span><button class="ghost-button compact" type="button" data-add-player="${escapeHTML(team.id)}">+ 球员</button></div>
        <div class="tn-player-list">${roster.map((p, i) => playerRowHTML(team.id, p, i)).join("")}</div>
      </div>
    </div>`;
}

function renderFormatTeams(tournament) {
  const container = root.querySelector("#format-teams");
  if (!container) return;
  const teams = tournament.teams || [];
  const groupCount = Math.max(1, Math.min(8, tournament.groups || 1));
  container.innerHTML = `
    <div class="tn-field-row">
      <label>队伍数量</label>
      <input id="team-count" type="number" min="2" max="32" value="${teams.length}" />
      <label>分组数</label>
      <input id="group-count" type="number" min="1" max="8" value="${groupCount}" />
    </div>
    <div class="tn-teams">
      <div class="tn-section-head"><h3>队伍与名单</h3></div>
      <div id="team-list">
        ${teams.length ? teams.map(t => teamRowHTML(t, groupCount)).join("") : `<div class="tn-empty">设置队伍数量后这里会显示各队录入框。</div>`}
      </div>
    </div>
    <div class="tn-field-row tn-actions">
      <button class="primary-button blue" id="save-format" type="button">保存队伍</button>
    </div>`;
  container.querySelector("#team-count").addEventListener("change", (e) => setTeamCount(tournament.id, parseInt(e.target.value, 10) || 2));
  container.querySelector("#group-count").addEventListener("change", (e) => changeGroups(tournament.id, parseInt(e.target.value, 10) || 1));
  container.querySelectorAll("[data-remove-team]").forEach(btn => {
    btn.addEventListener("click", () => removeTeam(tournament.id, btn.dataset.removeTeam));
  });
  container.querySelectorAll("[data-add-player]").forEach(btn => {
    btn.addEventListener("click", () => addPlayer(tournament.id, btn.dataset.addPlayer));
  });
  container.querySelectorAll("[data-remove-player]").forEach(btn => {
    btn.addEventListener("click", () => removePlayer(tournament.id, btn.dataset.removePlayer, parseInt(btn.dataset.playerIndex, 10)));
  });
  container.querySelector("#save-format").addEventListener("click", () => saveFormatTeams(tournament.id));
}

// 把当前「赛制与队伍」面板上用户已输入的内容（队伍名、分组、名单）读回数据对象。
// 不校验、不过滤空名，供新增/移除队伍或球员等会触发重渲染的操作复用，避免未点「保存」就丢失输入。
function readFormatTeamsFromUI(tournament) {
  const container = root.querySelector("#format-teams");
  const groupCount = Math.max(1, Math.min(8, parseInt(container?.querySelector("#group-count")?.value, 10) || tournament.groups || 1));
  const teams = [];
  container?.querySelectorAll(".tn-team-row").forEach(row => {
    const id = row.dataset.teamId;
    const name = row.querySelector(".tn-team-name").value.trim();
    const groupSel = row.querySelector(".tn-team-group");
    const group = groupSel ? parseInt(groupSel.value, 10) : 0;
    const roster = [];
    row.querySelectorAll(".tn-player-row").forEach(p => {
      const number = p.querySelector(".tn-player-number").value.trim();
      const pname = p.querySelector(".tn-player-name").value.trim();
      const libero = p.querySelector(".tn-libero input")?.checked || false;
      roster.push({ number, name: pname, libero });
    });
    teams.push({ id, name, group, coach: "", captain: "", roster });
  });
  return { teams, groups: groupCount };
}

// 按「队伍数量」增减队伍行：保留已填内容，多出的新建空队，少的裁剪。
function setTeamCount(tournamentId, n) {
  const t = findTournament(tournamentId);
  if (!t) return;
  const { teams } = readFormatTeamsFromUI(t);
  n = Math.max(2, Math.min(32, n || 2));
  const next = [];
  for (let i = 0; i < n; i++) {
    next.push(teams[i] || { id: newId("team"), name: "", group: 0, coach: "", captain: "", roster: seedRoster() });
  }
  t.teams = next;
  const list = tournaments().map(x => (x.id === tournamentId ? t : x));
  saveTournaments(list);
  render();
}

function changeGroups(tournamentId, n) {
  const t = findTournament(tournamentId);
  if (!t) return;
  const { teams } = readFormatTeamsFromUI(t);
  t.teams = teams;
  t.groups = Math.max(1, Math.min(8, n || 1));
  const list = tournaments().map(x => (x.id === tournamentId ? t : x));
  saveTournaments(list);
  render();
}

function removeTeam(tournamentId, teamId) {
  const t = findTournament(tournamentId);
  if (!t) return;
  const { teams } = readFormatTeamsFromUI(t);
  t.teams = teams.filter(x => x.id !== teamId);
  const list = tournaments().map(x => (x.id === tournamentId ? t : x));
  saveTournaments(list);
  render();
}

function addPlayer(tournamentId, teamId) {
  const t = findTournament(tournamentId);
  if (!t) return;
  const { teams } = readFormatTeamsFromUI(t);
  const team = teams.find(x => x.id === teamId);
  if (team) team.roster = (team.roster || []).concat({ number: "", name: "", libero: false });
  t.teams = teams;
  const list = tournaments().map(x => (x.id === tournamentId ? t : x));
  saveTournaments(list);
  render();
}

function removePlayer(tournamentId, teamId, index) {
  const t = findTournament(tournamentId);
  if (!t) return;
  const { teams } = readFormatTeamsFromUI(t);
  const team = teams.find(x => x.id === teamId);
  if (team && team.roster) team.roster = team.roster.filter((_, i) => i !== index);
  t.teams = teams;
  const list = tournaments().map(x => (x.id === tournamentId ? t : x));
  saveTournaments(list);
  render();
}

function saveFormatTeams(tournamentId) {
  const t = findTournament(tournamentId);
  if (!t) return;
  const { teams, groups } = readFormatTeamsFromUI(t);
  if (teams.filter(x => x.name).length < 2) { toast("请至少录入 2 支有名称的队伍", "error"); return; }
  t.teams = teams;
  t.groups = groups;
  const list = tournaments().map(x => (x.id === tournamentId ? t : x));
  saveTournaments(list);
  toast("已保存队伍");
  render();
}

function renderStandings(tournament) {
  const container = root.querySelector("#standings-view");
  if (!container) return;
  const teams = tournament.teams || [];
  if (!teams.length) { container.innerHTML = `<div class="tn-empty">尚未录入队伍，积分表将在记录比赛后生成。</div>`; return; }
  const groups = tournament.groups || 1;
  const { groups: result } = computeStandings(tournament.matches || [], teams, groups);
  if (!result.length || !result.some(g => g.rows.some(r => r.played > 0))) {
    container.innerHTML = `<div class="tn-empty">还没有已记录的比赛，积分将在记录后自动计算。</div>`;
    return;
  }
  container.innerHTML = result.map(g => `
    <div class="tn-stage">
      <h3>${escapeHTML(g.label)}</h3>
      <table class="tn-standings">
        <thead><tr><th>#</th><th>队伍</th><th>场</th><th>胜</th><th>负</th><th>局</th><th>小分</th></tr></thead>
        <tbody>
          ${g.rows.map((r, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${escapeHTML(r.name)}</td>
              <td>${r.played}</td>
              <td>${r.wins}</td>
              <td>${r.losses}</td>
              <td>${r.setsFor}-${r.setsAgainst}</td>
              <td>${r.pointsFor}-${r.pointsAgainst}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`).join("");
}

function render() {
  if (!currentId) {
    renderList();
    return;
  }
  const tournament = findTournament(currentId);
  if (tournament) renderDetail(tournament);
  else root.innerHTML = `<section class="tn-wrap"><div class="tn-empty">找不到这个赛事。<a href="./">返回赛事列表</a></div></section>`;
}

render();
