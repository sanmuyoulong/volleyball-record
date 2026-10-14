import { app, escapeHTML as esc, toast, confirmDialog } from "./ui.js";
import { session, requireSession, navigate } from "./session.js";
import { repository, migrateLegacy } from "./console-repository.js";
import { copy, id, newMatch, locked, status, commonScores, finalResult, validateFinal } from "./console-domain.js";
import { normalizeState, defaultRoster } from "./state.js";
import { normalizeStatistics, validateStatistics } from "./statistics-state.js";
import { parseRosterFile, normalizeRosterRows } from "./roster-import.js";
import { computeStandings } from "./tournament-rules.js";

const params = new URLSearchParams(location.search), view = params.get("view") || "overview";
let teams = [], events = [], matches = [], busy = false;
const link = (v, key = "") => `?view=${v}${key ? `&id=${encodeURIComponent(key)}` : ""}`;
const button = (text, action, key = "", extra = "") => `<button class="ghost-button compact" data-action="${action}" data-id="${esc(key)}" ${extra}>${text}</button>`;
const input = (name, label, value = "", type = "text", required = false, disabled = false) => `<label class="field">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${required ? "required" : ""} ${disabled ? "disabled" : ""}></label>`;
const select = (name, label, options, value = "", disabled = false) => `<label class="field">${label}<select name="${name}" ${disabled ? "disabled" : ""}>${options.map(([v, t]) => `<option value="${esc(v)}" ${String(value) === String(v) ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`;
const empty = text => `<p class="event-empty">${text}</p>`;
const archiveAction = (kind, item) => button(item.archived ? "恢复" : "归档", `archive-${kind}`, item.id);
const matchRow = m => `<article class="console-card"><div><a href="${link("match", m.id)}"><h3>${esc(m.teams.map(t => t.name).join(" vs "))}</h3></a><p>${esc(m.meta.competition)} · ${esc(m.meta.date)} ${esc(m.meta.scheduledTime || "")} · ${esc(m.meta.venue || "待定场地")}</p><small>${esc(status(m))} · ${m.scoring?.match ? "正式计分" : "手动比分"}${m.tournamentId ? ` · ${esc(events.find(e => e.id === m.tournamentId)?.name || "赛事")}` : " · 独立比赛"}</small></div><div class="console-actions"><a class="ghost-button compact" href="${link("match", m.id)}">查看 / 继续</a>${archiveAction("matches", m)}</div></article>`;

async function refresh() { [teams, events, matches] = await Promise.all([repository.list("teams"), repository.list("events"), repository.list("matches")]); }
function frame(content) {
  app.innerHTML = `<section class="console-layout page-enter"><aside class="console-sidebar"><span class="eyebrow">LOCAL WORKSPACE</span><h1>控制台</h1><nav>${[["overview", "概览"], ["matches", "比赛"], ["events", "赛事"], ["teams", "队伍库"], ["backup", "备份与迁移"]].map(([v, t]) => `<a class="${view === v || view === v.slice(0, -1) ? "active" : ""}" href="${link(v)}">${t}</a>`).join("")}</nav><p>本机演示身份<br>数据保存在当前浏览器。清理浏览器会丢失记录，请定期备份。</p><button class="text-button" data-action="signout">退出控制台</button></aside><div class="console-main">${content}</div></section>`;
}
function header(title, description, action = "") { return `<div class="console-heading"><div><span class="eyebrow">VOLLEY RECORD</span><h2>${title}</h2><p>${description}</p></div>${action}</div>`; }
function render() {
  if (view === "match") return renderMatch();
  if (view === "event") return renderEvent();
  if (view === "adopt") return renderAdopt();
  if (view === "teams") return frame(header("可复用队伍库", "名单带入赛事或比赛后成为独立快照，修改队伍库不影响既有比赛。", button("新建队伍", "team-new")) + (teams.length ? teams.map(t => `<article class="console-card"><div><h3>${esc(t.name)}</h3><p>${t.roster.filter(p => p.name).length} 名队员 · ${esc(t.coach || "未填教练")} · ${t.archived ? "已归档" : "可使用"}</p></div><div class="console-actions">${button("查看 / 编辑名单", "team-edit", t.id)}${archiveAction("teams", t)}</div></article>`).join("") : empty("从新建队伍开始，也可导入 Excel / CSV 名单。")));
  if (view === "events") return frame(header("赛事", "手动选择参赛队伍建立比赛，汇总已确认的比赛结果。", button("创建赛事", "event-new")) + (events.length ? events.map(e => `<article class="console-card"><div><a href="${link("event", e.id)}"><h3>${esc(e.name)}</h3></a><p>${esc(e.startDate || "待定日期")} · ${esc(e.venue || "待定场地")} · ${e.teams.length} 支队伍 · ${e.archived ? "已归档" : "进行管理"}</p></div><div class="console-actions"><a class="ghost-button compact" href="${link("event", e.id)}">管理赛事</a>${archiveAction("events", e)}</div></article>`).join("") : empty("尚未创建赛事，独立比赛不需要先创建赛事。")));
  if (view === "matches") {
    const event = params.get("event") || "", filter = params.get("status") || "";
    const shown = matches.filter(m => (!event || m.tournamentId === event) && (!filter || status(m) === filter)).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
    return frame(header("比赛", "计分与两队技术统计共用一场比赛，记录内容分别保存。", button("创建比赛", "match-new")) + `<form id="match-filter" class="console-filter">${select("event", "赛事", [["", "全部赛事"], ...events.map(e => [e.id, e.name])], event)}${select("status", "状态", ["", "待开始", "进行中", "已结束", "已归档", "原记录缺失"].map(x => [x, x || "全部状态"]), filter)}<button class="ghost-button">筛选</button></form>` + (shown.length ? shown.map(matchRow).join("") : empty("没有符合条件的比赛。")));
  }
  if (view === "backup") return frame(header("备份与迁移", "网站和离线 HTML 的保存位置互相独立。用备份文件迁移；导入只新增记录，不覆盖现有比赛。") + `<section class="console-panel"><h3>完整控制台备份</h3><p>包含队伍、赛事、比赛计分、两队技术统计及原始迁移备份。</p><div class="console-actions">${button("导出完整备份", "backup-export")}${button("导入备份 / 单场记录", "backup-import")}</div><p>只导入你信任的 Volley Record JSON 文件。导入前会展示内容供确认。</p></section><section class="console-panel"><h3>本机演示的边界</h3><p>当前没有真实账号或云端同步，关闭标签页后需重新进入控制台。退出不会删除本机数据。浏览器隐私模式的数据可能在关闭后被清除。</p><p>以后接入真实账号与数据库时，将由你主动选择要迁移的数据。</p></section>`);
  const active = matches.filter(m => !m.archived);
  frame(header("本机工作台", "不登录也能使用比赛记录工具；这里集中管理你的队伍、赛事与多场比赛。", button("创建比赛", "match-new")) + `<div class="console-metrics">${[[active.length, "比赛"], [events.filter(e => !e.archived).length, "赛事"], [teams.filter(t => !t.archived).length, "队伍"]].map(([n, t]) => `<a class="console-panel" href="${link(t === "比赛" ? "matches" : t === "赛事" ? "events" : "teams")}"><strong>${n}</strong><span>${t}</span></a>`).join("")}</div><h3>最近的比赛</h3>${active.length ? active.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")).slice(0, 5).map(matchRow).join("") : empty("创建第一场比赛，或者将游客草稿另存到控制台。")}`);
}
function renderMatch() {
  const m = matches.find(x => x.id === params.get("id"));
  if (!m) return frame(empty("比赛不存在。请返回比赛列表。"));
  const r = commonScores(m);
  frame(header(esc(m.teams.map(t => t.name).join(" vs ")), `${esc(m.meta.competition)} · ${esc(status(m))}`, archiveAction("matches", m)) + `<section class="console-panel"><div class="console-actions">${button("编辑共同比赛信息", "match-edit", m.id)}${button("导出本场完整备份", "match-export", m.id)}</div><p>${esc(m.meta.date)} ${esc(m.meta.scheduledTime)} · ${esc(m.meta.city)} · ${esc(m.meta.venue)} · ${esc(m.meta.gender)} · ${m.meta.matchFormat === "3" ? "三局两胜" : "五局三胜"}</p><p>比分来源：${m.scoring?.match ? "正式计分（需在计分页赛后确认）" : "手动比分"} · ${r.setScores.filter(p => p.some(v => v !== "")).map(p => p.map(v => esc(v || "—")).join(" : ")).join(" / ") || "尚未填写"}</p>${!m.scoring?.match && !m.archived && !m.missing ? `<div class="console-actions">${button("填写比分", "manual-score", m.id)}${button(m.manualConfirmed ? "重新确认比赛结果" : "确认比赛结束", "confirm-result", m.id)}</div>` : ""}</section>${m.missing ? empty("旧比赛只有摘要，完整记录未找到；不会生成虚构的计分或统计数据。") : m.archived ? empty("请先恢复这场比赛，再继续记录。") : `<div class="record-mode-grid console-record-modes"><a class="console-panel" href="../record/?mode=score&match=${encodeURIComponent(m.id)}"><small>MATCH SCORING</small><h3>${m.scoring?.match ? "继续计分" : "开始计分"}</h3><p>填写规则、名单、裁判与首发轮次，记录正式比分。</p></a>${["home", "away"].map(side => `<a class="console-panel" href="../record/?mode=statistics&match=${encodeURIComponent(m.id)}&side=${side}"><small>TECHNICAL STATISTICS</small><h3>${side === "home" ? "主队" : "客队"}技术统计</h3><p>${esc(m.teams[side === "home" ? 0 : 1].name)} · 点击加减记录 · 分析报告 / PDF</p></a>`).join("")}</div>`}`);
}
function renderEvent() {
  const e = events.find(x => x.id === params.get("id"));
  if (!e) return frame(empty("赛事不存在。"));
  const records = matches.filter(m => m.tournamentId === e.id);
  const table = computeStandings(records.map(m => ({ result: finalResult(m) })), e.teams, e.groups || 1);
  frame(header(esc(e.name), `${esc(e.startDate || "日期待定")} · ${esc(e.venue || "场地待定")} · ${esc(e.note || "")}`, archiveAction("events", e)) + `<section class="console-panel"><div class="console-actions">${button("编辑赛事信息", "event-edit", e.id)}${!e.archived ? button("添加参赛队伍", "event-team", e.id) + button("手动创建比赛", "event-match", e.id) : ""}</div><h3>参赛队伍快照</h3>${e.teams.length ? e.teams.map(t => `<div class="console-team-line"><span>${esc(t.name)} · 第 ${(t.group || 0) + 1} 组 · ${t.roster?.filter(p => p.name).length || 0} 人</span>${!e.archived ? button("编辑参赛快照", "participant-edit", t.id) : ""}</div>`).join("") : empty("请从队伍库添加参赛队伍，或者新建临时队伍。")}</section><h3>比赛安排</h3>${records.length ? records.map(matchRow).join("") : empty("尚无比赛。手动选择两支参赛队伍创建对阵。")}<section class="console-panel"><h3>已确认比赛积分榜</h3><p>按胜场、局胜率、小分胜率排序，仅包含已确认结束且未归档的比赛。</p>${table.groups.map(g => `<h4>${g.label}</h4><div class="console-table-scroll"><table class="console-table"><thead><tr>${["队伍", "场次", "胜", "负", "胜局", "负局", "得分", "失分"].map(x => `<th>${x}</th>`).join("")}</tr></thead><tbody>${g.rows.map(r => `<tr>${[r.name, r.played, r.wins, r.losses, r.setsFor, r.setsAgainst, r.pointsFor, r.pointsAgainst].map(x => `<td>${esc(x)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`).join("")}</section>`);
}
function renderAdopt() {
  const kind = params.get("kind") === "statistics" ? "statistics" : "score";
  const key = kind === "score" ? "volley-record-state-v1" : "volley-record-statistics-v1";
  let raw; try { raw = JSON.parse(localStorage.getItem(key)); } catch {}
  if (!raw) return frame(empty("没有可另存的游客草稿。"));
  frame(header("将游客草稿另存到控制台", "将创建新的独立比赛，游客草稿仍然保留。不会按队名或日期自动合并。") + `<section class="console-panel"><h3>${esc(raw.meta?.competition || "未命名比赛")}</h3><p>${esc(kind === "score" ? raw.teams?.map(t => t.name).join(" vs ") : `${raw.meta?.homeTeam} vs ${raw.meta?.awayTeam}`)}</p><p>${kind === "score" ? "计分记录" : "技术统计（含二传统计和进攻归属）"}</p>${button("确认另存为独立比赛", "adopt", kind)}</section>`);
}
function modal(title, content, submit) {
  const root = document.querySelector("#modal-root");
  root.innerHTML = `<div class="modal-backdrop"><section class="modal wide console-modal" role="dialog" aria-modal="true"><div class="modal-head"><h2>${title}</h2><button type="button" class="icon-button" id="console-close" aria-label="关闭">×</button></div><form id="console-form">${content}<p id="console-error" role="alert"></p><div class="modal-actions"><button type="button" class="ghost-button" id="console-cancel">取消</button><button class="primary-button blue" id="console-submit">保存</button></div></form></section></div>`;
  root.querySelector("#console-close").onclick = root.querySelector("#console-cancel").onclick = () => { if (!busy) root.replaceChildren(); };
  root.querySelector("form").onsubmit = async event => {
    event.preventDefault(); if (busy) return; busy = true;
    const btn = root.querySelector("#console-submit"); btn.disabled = true;
    try { await submit(new FormData(event.target)); root.replaceChildren(); await refresh(); render(); toast("已保存到本机控制台。"); }
    catch (err) { root.querySelector("#console-error").textContent = err.message; }
    finally { busy = false; if (btn.isConnected) btn.disabled = false; }
  };
  root.querySelector("input, select")?.focus();
  return root;
}
function metaFields(m = {}, isLocked = false) {
  return `<div class="form-grid">${input("competition", "比赛名称", m.competition, "text", true)}${input("date", "日期", m.date || new Date().toLocaleDateString("en-CA"), "date", true)}${input("scheduledTime", "计划开始时间", m.scheduledTime, "time", true)}${input("venue", "场馆", m.venue, "text", true)}${input("city", "城市", m.city)}${input("matchNo", "场次编号", m.matchNo)}${select("gender", "性别", [["男子", "男子"], ["女子", "女子"], ["混合", "男女混合"]], m.gender || "男子", isLocked)}${select("matchFormat", "赛制", [["5", "五局三胜"], ["3", "三局两胜"]], m.matchFormat || "5", isLocked)}${select("profile", "规则", [["official", "FIVB 2025–2028 正式规则"], ["test2026", "FIVB 2026 指定赛事试行"]], m.profile || "official", isLocked)}</div>`;
}
function readMeta(values, old = {}) { const m = { ...old }; ["competition", "date", "scheduledTime", "venue", "city", "matchNo", "gender", "matchFormat"].forEach(k => { if (values.has(k)) m[k] = String(values.get(k)).trim(); }); return m; }
function teamFields(team = {}) {
  return `<div class="form-grid">${input("name", "队伍名称", team.name, "text", true)}${input("coach", "教练", team.coach)}${input("captain", "队长号码", team.captain)}</div><p>名单最多 14 人，可留空以后补充。男女混合比赛需要每名队员的性别。</p><label class="file-drop">导入 Excel / CSV 名单<input id="console-roster-file" type="file" accept=".xlsx,.csv"></label><p id="console-roster-preview"></p><div class="console-roster">${Array.from({ length: 14 }, (_, i) => { const p = team.roster?.[i] || {}; return `<div>${input(`number-${i}`, `${i + 1}. 号码`, p.number)}${input(`name-${i}`, "姓名", p.name)}${select(`gender-${i}`, "性别", [["", "待填写"], ["男", "男"], ["女", "女"]], p.gender)}<label><input type="checkbox" name="libero-${i}" ${p.libero ? "checked" : ""}>自由人</label></div>`; }).join("")}</div>`;
}
function readTeam(values, previous = {}) {
  const t = { ...copy(previous), id: previous.id || id("team"), name: String(values.get("name") || "").trim(), coach: String(values.get("coach") || "").trim(), captain: String(values.get("captain") || "").trim(), roster: [] };
  for (let i = 0; i < 14; i++) {
    const p = { number: String(values.get(`number-${i}`) || "").trim(), name: String(values.get(`name-${i}`) || "").trim(), gender: values.get(`gender-${i}`) || "", libero: values.has(`libero-${i}`) };
    if (Boolean(p.number) !== Boolean(p.name)) throw Error(`第 ${i + 1} 行需要同时填写号码和姓名。`);
    t.roster.push(p);
  }
  const used = t.roster.filter(p => p.name);
  if (!t.name) throw Error("请填写队伍名称。");
  if (new Set(used.map(p => p.number)).size !== used.length) throw Error("队员号码不能重复。");
  if (used.filter(p => p.libero).length > 2) throw Error("最多标记 2 名自由人。");
  if (t.captain && !used.some(p => p.number === t.captain)) throw Error("队长号码不在名单中。");
  return t;
}
function bindRosterImport(root) {
  root.querySelector("#console-roster-file").onchange = async e => {
    try {
      const file = e.target.files[0]; if (!file) return;
      const parsed = normalizeRosterRows(await parseRosterFile(file), { minimumPlayers: 1 });
      const preview = root.querySelector("#console-roster-preview");
      preview.textContent = `预览：${parsed.players.map(p => `${p.number} 号 ${p.name}`).join("、")}。${parsed.warnings.join(" ")}`;
      const apply = document.createElement("button"); apply.type = "button"; apply.className = "ghost-button compact"; apply.textContent = "将预览名单带入表单";
      preview.append(apply);
      apply.onclick = () => {
        parsed.players.concat(defaultRoster()).slice(0, 14).forEach((p, i) => { ["number", "name", "gender"].forEach(k => root.querySelector(`[name="${k}-${i}"]`).value = p[k] || ""); root.querySelector(`[name="libero-${i}"]`).checked = Boolean(p.libero); });
        ["teamName", "coach", "captain"].forEach(k => { if (parsed[k]) root.querySelector(`[name="${k === "teamName" ? "name" : k}"]`).value = parsed[k]; }); apply.remove();
      };
    } catch (err) { root.querySelector("#console-error").textContent = err.message; }
  };
}
function editTeam(key, participant = false) {
  const event = participant ? events.find(e => e.id === params.get("id")) : null;
  const t = (event ? event.teams : teams).find(x => x.id === key) || {};
  if (event && matches.some(m => m.tournamentId === event.id && m.teams.some(x => x.id === t.id) && locked(m))) throw Error("这支队伍已有开始记录的比赛。参赛快照已锁定，请在下一赛事使用新的名单。");
  const root = modal(participant ? "编辑参赛队伍快照" : key ? "编辑队伍库名单" : "新建队伍", teamFields(t) + (event ? select("group", "分组", Array.from({ length: event.groups || 1 }, (_, i) => [i, `第 ${i + 1} 组`]), t.group || 0) : ""), async values => {
    const next = readTeam(values, t);
    if (event) { const nextEvent = copy(event); next.group = Number(values.get("group")); nextEvent.teams = nextEvent.teams.map(x => x.id === key ? next : x); await repository.put("events", nextEvent, event.revision); }
    else await repository.put("teams", next, t.revision || 0);
  }); bindRosterImport(root);
}
function editEvent(key) {
  const e = events.find(x => x.id === key) || {};
  modal(key ? "编辑赛事" : "创建赛事", `<div class="form-grid">${input("name", "赛事名称", e.name, "text", true)}${input("startDate", "开始日期", e.startDate, "date")}${input("venue", "默认场馆", e.venue)}${input("note", "说明", e.note)}${select("groups", "分组数", Array.from({ length: 8 }, (_, i) => [i + 1, `${i + 1} 组`]), e.groups || 1)}</div>`, async v => {
    const groups = Number(v.get("groups"));
    if ((e.teams || []).some(t => t.group >= groups)) throw Error("已有队伍所在分组超出新分组数，请先调整队伍分组。");
    const saved = await repository.put("events", { ...copy(e), id: e.id || id("event"), name: v.get("name").trim(), startDate: v.get("startDate"), venue: v.get("venue").trim(), note: v.get("note").trim(), groups, teams: e.teams || [], archived: e.archived || false }, e.revision || 0);
    if (!key) navigate(link("event", saved.id));
  });
}
function addParticipant(key) {
  const e = events.find(x => x.id === key);
  const options = teams.filter(t => !t.archived && !e.teams.some(p => p.libraryId === t.id));
  const root = modal("添加参赛队伍", `${select("team", "从队伍库带入", [["", "新建临时队伍"], ...options.map(t => [t.id, t.name])])}${input("temporaryName", "临时队伍名称（未选择队伍库时必填）")}${select("group", "分组", Array.from({ length: e.groups || 1 }, (_, i) => [i, `第 ${i + 1} 组`]))}<p>参赛名单是快照，队伍库修改不会自动同步到本赛事。</p>`, async v => {
    const source = options.find(t => t.id === v.get("team"));
    if (!source && !v.get("temporaryName").trim()) throw Error("请选择队伍或填写临时队伍名称。");
    const t = source ? copy(source) : { name: v.get("temporaryName").trim(), coach: "", captain: "", roster: defaultRoster() };
    t.libraryId = source?.id || null; t.id = id("participant"); t.group = Number(v.get("group")); delete t.revision;
    if (e.teams.some(x => x.name === t.name)) throw Error("赛事中已有同名队伍，请使用可区分的名称。");
    await repository.put("events", { ...e, teams: [...e.teams, t] }, e.revision);
  }); return root;
}
function createMatch(eventId = "", editId = "") {
  const m = matches.find(x => x.id === editId), e = events.find(x => x.id === (m?.tournamentId || eventId));
  const candidates = e ? e.teams : teams.filter(t => !t.archived), isLocked = m && locked(m);
  const root = modal(m ? "编辑共同比赛信息" : "创建比赛", metaFields(m ? { ...m.meta, profile: m.scoring?.competitionProfile } : { competition: e?.name || "", date: e?.startDate, venue: e?.venue }, isLocked) + `<p>${isLocked ? "已开始记录，队伍、性别、赛制和规则固定。" : "选择队伍将带入独立名单快照。临时队伍可在计分赛前填写名单。"}</p><div class="form-grid">${[0, 1].map(i => select(`team-${i}`, i === 0 ? "主队" : "客队", [...(m ? [[`current-${i}`, `保留当前快照：${m.teams[i].name}`]] : []), ["", "临时队伍"], ...candidates.map(t => [t.id, t.name])], m ? `current-${i}` : "", Boolean(isLocked)) + input(`temporary-${i}`, `${i === 0 ? "主" : "客"}队名称 / 保留当前队伍`, m?.teams[i]?.name || "", "text", false, Boolean(isLocked))).join("")}</div>`, async v => {
    const meta = readMeta(v, m?.meta || {});
    const selected = isLocked ? copy(m.teams) : [0, 1].map(i => {
      if (m && v.get(`team-${i}`) === `current-${i}`) return copy(m.teams[i]);
      const picked = candidates.find(t => t.id === v.get(`team-${i}`));
      if (picked) return copy(picked);
      const name = String(v.get(`temporary-${i}`) || "").trim();
      if (!name) throw Error("请填写两支队伍的名称。");
      return m?.teams[i]?.name === name ? copy(m.teams[i]) : { id: id("temporary"), name, coach: "", captain: "", roster: defaultRoster() };
    });
    if (selected[0].id === selected[1].id || selected[0].name === selected[1].name) throw Error("主客队不能是同一队伍。");
    if (e && selected.some(t => !e.teams.some(p => p.id === t.id))) throw Error("赛事比赛必须选择两支参赛队伍。请先添加参赛队伍。");
    const next = m ? copy(m) : newMatch(meta, selected, e?.id || null);
    next.meta = meta; next.teams = selected;
    if (!isLocked) next.scoring.competitionProfile = v.get("profile") || "official";
    next.scoring.meta = { ...next.scoring.meta, ...meta }; next.scoring.teams = copy(selected);
    const saved = await repository.put("matches", next, m?.revision || 0);
    if (!m) navigate(link("match", saved.id));
  }); return root;
}
function manualScore(key) {
  const m = matches.find(x => x.id === key); if (m.scoring?.match) throw Error("正式计分已开始，请在计分页更改比分。");
  const r = commonScores(m);
  modal("填写共同比分", `<p>${esc(m.teams[0].name)}（主队） vs ${esc(m.teams[1].name)}（客队）。两队统计表均引用这里的比分。</p>${r.setScores.map((p, i) => `<fieldset class="console-score-row"><legend>第 ${i + 1} 局</legend>${input(`score-${i}-0`, "主队", p[0], "number")}${input(`score-${i}-1`, "客队", p[1], "number")}<label><input type="checkbox" name="ended-${i}" ${r.completedSets[i] ? "checked" : ""}>本局已结束</label></fieldset>`).join("")}`, async v => {
    const next = { setScores: r.setScores.map((_, i) => [0, 1].map(s => String(v.get(`score-${i}-${s}`)).trim())), completedSets: r.completedSets.map((_, i) => v.has(`ended-${i}`)), winner: "" };
    const { validateStatisticsScores } = await import("./statistics-state.js");
    const error = validateStatisticsScores(next.setScores, next.completedSets); if (error) throw Error(error);
    await repository.put("matches", { ...m, manualResult: next, manualConfirmed: false }, m.revision);
  });
}
function download(value, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function importedMatch(parsed) {
  if (parsed?.type === "volley-technical-statistics" && parsed.version === 1 && parsed.data?.version === 1 && Array.isArray(parsed.data.players)) {
    const stats = normalizeStatistics(parsed.data);
    if (parsed.data.setterStatistics?.players?.length > 4) throw Error("二传队员最多 4 人。");
    if (stats.screen === "table" && validateStatistics(stats)) throw Error(validateStatistics(stats));
    const t = [stats.meta.homeTeam || "主队", stats.meta.awayTeam || "客队"].map(name => ({ id: id("temporary"), name, coach: "", captain: "", roster: defaultRoster() }));
    t[stats.meta.teamSide === "away" ? 1 : 0].roster = stats.players.map(p => ({ number: p.number, name: p.name, gender: p.gender, libero: false }));
    const m = newMatch(stats.meta, t); m.statistics[stats.meta.teamSide] = stats;
    m.manualResult = { setScores: stats.setScores, completedSets: stats.completedSets, winner: stats.meta.winner }; return m;
  }
  const raw = parsed?.state || parsed;
  if (!raw?.meta || !Array.isArray(raw.teams) || raw.teams.length !== 2 || !raw.selectedRule) throw Error("不是有效的单场计分或技术统计记录。");
  const score = normalizeState(raw); score.teams.forEach(t => { t.id ||= id("temporary"); });
  const m = newMatch(score.meta, score.teams); score.matchId = m.id; score.tournamentId = null; m.scoring = score; return m;
}
function openImport() {
  let parsed, single;
  const root = modal("导入备份", '<label class="file-drop">选择 JSON 文件<input id="console-import-file" type="file" accept=".json,application/json"></label><div id="console-import-preview">选择文件后将显示导入预览。</div>', async () => {
    if (!parsed) throw Error("请先选择有效文件。");
    if (single) await repository.put("matches", single, 0); else await repository.restore(parsed);
  });
  root.querySelector("#console-import-file").onchange = async e => {
    parsed = null; single = null;
    try {
      const p = JSON.parse(await e.target.files[0].text());
      if (p.type === "volley-console-backup") {
        const { validateBackup } = await import("./console-repository.js"); validateBackup(p);
        root.querySelector("#console-import-preview").textContent = `${p.data.teams.length} 支队伍、${p.data.events.length} 个赛事、${p.data.matches.length} 场比赛。确认后全部作为新增数据导入，同编号会自动重编。`;
      } else { single = importedMatch(p); root.querySelector("#console-import-preview").textContent = `单场记录：${single.meta.competition || "未命名比赛"} · ${single.teams.map(t => t.name).join(" vs ")}。将创建独立比赛。`; }
      parsed = p;
    } catch (err) { root.querySelector("#console-error").textContent = err.message; }
  };
}
app.addEventListener("click", async event => {
  const action = event.target.closest("[data-action]"); if (!action || busy) return;
  const key = action.dataset.id, name = action.dataset.action;
  try {
    if (name === "signout") { await session.signOut(); navigate("../login/"); }
    else if (name === "team-new" || name === "team-edit") editTeam(key);
    else if (name === "participant-edit") editTeam(key, true);
    else if (name === "event-new" || name === "event-edit") editEvent(key);
    else if (name === "event-team") addParticipant(key);
    else if (name === "match-new" || name === "event-match") createMatch(name === "event-match" ? key : "");
    else if (name === "match-edit") createMatch("", key);
    else if (name === "manual-score") manualScore(key);
    else if (name === "confirm-result") {
      const m = matches.find(x => x.id === key), result = validateFinal(m);
      if (await confirmDialog("确认比赛已经结束？比分将进入赛事积分榜。")) { await repository.put("matches", { ...m, manualResult: result, manualConfirmed: true }, m.revision); await refresh(); render(); }
    } else if (name.startsWith("archive-")) {
      const kind = name.slice(8), item = ({ teams, events, matches })[kind].find(x => x.id === key);
      if (await confirmDialog(item.archived ? "恢复此记录？" : "归档后可随时恢复。归档的比赛不再计入积分榜，确定继续？")) { await repository.put(kind, { ...item, archived: !item.archived }, item.revision); await refresh(); render(); }
    } else if (name === "backup-export") download(await repository.backup(), "Volley-Record-控制台备份.json");
    else if (name === "match-export") {
      const m = matches.find(x => x.id === key), e = events.filter(x => x.id === m.tournamentId);
      download({ type: "volley-console-backup", version: 1, data: { teams: [], events: e, matches: [m], meta: [] } }, "Volley-Record-单场完整备份.json");
    } else if (name === "backup-import") openImport();
    else if (name === "adopt") {
      busy = true; action.disabled = true;
      try {
        const raw = JSON.parse(localStorage.getItem(key === "score" ? "volley-record-state-v1" : "volley-record-statistics-v1"));
        const m = importedMatch(key === "score" ? { state: raw } : { type: "volley-technical-statistics", version: 1, data: raw });
        await repository.put("matches", m); navigate(link("match", m.id));
      } finally { busy = false; }
    }
  } catch (err) { toast(err.message || "操作失败，请导出备份后重试。", "error"); }
});
app.addEventListener("submit", e => { if (e.target.id === "match-filter") { e.preventDefault(); const v = new FormData(e.target); navigate(`?view=matches&event=${encodeURIComponent(v.get("event"))}&status=${encodeURIComponent(v.get("status"))}`); } });

try {
  if (await requireSession()) { await migrateLegacy(); await refresh(); render(); if (params.get("create") === "1") createMatch(); }
} catch (err) {
  app.innerHTML = `<section class="console-panel"><h1>控制台暂时无法打开</h1><p>${esc(err.message)}</p><p>原游客记录与旧存档仍然保留。请检查浏览器是否允许本机存储。</p><a href="../record/">返回比赛记录</a></section>`;
}
