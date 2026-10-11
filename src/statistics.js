import { app, modalRoot, escapeHTML as esc, toast, safeFilename, confirmDialog } from "./ui.js";
import {
  STATISTICS_KEY, GROUPS, OUTCOMES, initialStatistics, normalizeStatistics,
  groupTotal, teamTotals, adjustStatistic, selectedTeam, statisticsPlayerGender, matchResult, validateStatistics, validateStatisticsScores, prepareStatisticsRosterImport
} from "./statistics-state.js";
import { parseRosterFile, normalizeRosterRows } from "./roster-import.js";

let data;

function save() {
  const label = document.querySelector("#save-label");
  try {
    localStorage.setItem(STATISTICS_KEY, JSON.stringify(data));
    label.textContent = `已保存 ${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`;
    return true;
  } catch {
    label.textContent = "保存失败，请导出备份";
    toast("本机保存失败，请通过数据管理导出技术统计备份。", "error");
    return false;
  }
}

export function startStatistics() {
  try { data = normalizeStatistics(JSON.parse(localStorage.getItem(STATISTICS_KEY))); }
  catch { data = initialStatistics(); }
  document.querySelector("#data-manager").onclick = openStatisticsData;
  document.querySelector("#reset-app").textContent = "新建技术统计";
  document.querySelector("#reset-app").onclick = async () => {
    if (!await confirmDialog("新建技术统计将清除当前技术统计表。请先在数据管理中导出需要保留的数据。", { okText: "新建", danger: true })) return;
    data = initialStatistics();
    save();
    renderStatistics();
  };
  renderStatistics();
}

function renderStatistics() {
  modalRoot.replaceChildren();
  if (data.screen === "table") renderTable();
  else renderSetup();
  save();
}

function field(key, label, { type = "text", required = false, placeholder = "" } = {}) {
  return `<div class="field"><label for="stats-${key}">${label}${required ? ' <span>*</span>' : ""}</label><input id="stats-${key}" name="${key}" type="${type}" value="${esc(data.meta[key])}" ${required ? "required" : ""} placeholder="${esc(placeholder)}" /></div>`;
}

function rosterRowsHTML() {
  const mixed = data.meta.gender === "混合";
  return data.players.map((p, index) => `<div class="statistics-roster-row ${mixed ? "with-gender" : ""}"><span>${String(index + 1).padStart(2, "0")}</span><input name="name-${index}" aria-label="第 ${index + 1} 行队员姓名" value="${esc(p.name)}" placeholder="队员姓名" /><input name="number-${index}" aria-label="第 ${index + 1} 行队员号码" value="${esc(p.number)}" placeholder="号码" inputmode="numeric" maxlength="3" />${mixed ? `<select name="gender-${index}" aria-label="第 ${index + 1} 行队员性别"><option value="">性别</option>${["男", "女"].map(g => `<option value="${g}" ${p.gender === g ? "selected" : ""}>${g}</option>`).join("")}</select>` : ""}</div>`).join("");
}

function renderSetup() {
  const hasCounts = data.players.some(p => GROUPS.some(g => groupTotal(p.counts, g.key)));
  app.innerHTML = `<section class="statistics-setup page-enter">
    <div class="statistics-setup-heading"><span class="eyebrow">TECHNICAL STATISTICS · PRE-MATCH</span><h1>技术统计 · 赛前信息</h1><p>填写 B6 表所需的比赛信息和本队队员名单，开始后点击单元格的加减按钮即可记录。</p></div>
    <form id="statistics-form">
      <section class="statistics-form-section"><div class="form-heading"><div><h2>比赛信息</h2><p>主客队顺序用于比赛结果与各局比分，队名对应本次统计的队伍。</p></div><span class="form-step-number">01</span></div>
        <div class="form-grid">
          ${field("competition", "比赛名称", { required: true, placeholder: "例如：校园排球联赛" })}
          ${field("matchNo", "场序", { required: true, placeholder: "例如：第 6 场" })}
          ${field("homeTeam", "主队", { required: true })}${field("awayTeam", "客队", { required: true })}
          <div class="field"><label for="stats-teamSide">统计队名 <span>*</span></label><select id="stats-teamSide" name="teamSide" ${hasCounts ? "disabled" : ""}><option value="home" ${data.meta.teamSide === "home" ? "selected" : ""}>主队</option><option value="away" ${data.meta.teamSide === "away" ? "selected" : ""}>客队</option></select><small id="statistics-team-hint">本表统计：${esc(selectedTeam(data) || "请填写对应队名")}${hasCounts ? "（已记录数据，统计队伍固定）" : ""}</small></div>
          <div class="field"><label for="stats-gender">性别</label><select id="stats-gender" name="gender">${["男子", "女子", "混合"].map(g => `<option value="${g}" ${g === data.meta.gender ? "selected" : ""}>${g === "混合" ? "男女混合" : g}</option>`).join("")}</select></div>
          ${field("date", "日期", { type: "date", required: true })}${field("city", "比赛城市", { required: true })}${field("venue", "比赛馆", { required: true })}
        </div>
      </section>
      <section class="statistics-form-section"><div class="form-heading"><div><h2>队员名单</h2><p>与原表一致，共 14 行；未参赛的行可留空，号码在本队内不能重复。</p></div><span class="form-step-number">02</span></div>
        <div class="roster-import-note statistics-roster-import-note"><span>Excel / CSV</span><p>支持第一工作表中的“号码、姓名、队伍名称、性别”列，也可直接使用计分页的名单文件。男女混合比赛需为每名队员选择男或女；未在文件中填写的性别可在导入后补充。导入前可预览，已有统计按号码保留。</p><div class="statistics-roster-import-actions"><button class="text-button" id="download-statistics-roster-template" type="button">下载 CSV 模板</button><button class="ghost-button compact" id="import-statistics-roster" type="button">导入名单</button></div></div>
        <div class="statistics-roster-grid">${rosterRowsHTML()}</div>
      </section>
      <div id="validation-slot" role="alert"></div>
      <div class="statistics-setup-actions"><a class="ghost-button" href="./">返回比赛记录</a><button class="primary-button blue" type="submit">${hasCounts ? "保存并返回统计表" : "开始技术统计"} <span>→</span></button></div>
    </form>
  </section>`;
  const form = app.querySelector("#statistics-form");
  function readForm() {
    const values = new FormData(form);
    for (const key of Object.keys(data.meta)) {
      if (values.has(key)) data.meta[key] = String(values.get(key)).trim();
    }
    data.players.forEach((p, index) => {
      p.name = String(values.get(`name-${index}`) || "").trim();
      p.number = String(values.get(`number-${index}`) || "").trim();
      if (values.has(`gender-${index}`)) p.gender = String(values.get(`gender-${index}`));
    });
  }
  app.querySelector("#download-statistics-roster-template").onclick = downloadStatisticsRosterTemplate;
  app.querySelector("#import-statistics-roster").onclick = () => {
    readForm();
    save();
    openStatisticsRosterImport();
  };
  form.addEventListener("input", () => {
    readForm();
    app.querySelector("#statistics-team-hint").textContent = `本表统计：${selectedTeam(data) || "请填写对应队名"}${hasCounts ? "（已记录数据，统计队伍固定）" : ""}`;
    save();
  });
  app.querySelector("#stats-gender").addEventListener("change", () => {
    readForm();
    app.querySelector(".statistics-roster-grid").innerHTML = rosterRowsHTML();
    app.querySelector("#validation-slot").replaceChildren();
    save();
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    readForm();
    const error = validateStatistics(data);
    if (error) {
      app.querySelector("#validation-slot").innerHTML = `<div class="validation-banner">${esc(error)}</div>`;
      app.querySelector("#validation-slot").scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    data.screen = "table";
    renderStatistics();
    window.scrollTo(0, 0);
  });
}

function downloadStatisticsRosterTemplate() {
  const team = selectedTeam(data) || "示例队";
  const gender = data.meta.gender === "女子" ? "女" : "男";
  const rows = [["队伍名称", "号码", "队员姓名", "性别"], [team, "1", "队员一", gender], [team, "2", "队员二", data.meta.gender === "混合" ? "女" : gender], [team, "3", "队员三", gender]];
  const csv = "\uFEFF" + rows.map(row => row.map(value => `"${value.replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "技术统计队员名单导入模板.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function openStatisticsRosterImport() {
  let prepared = null;
  let requestId = 0;
  const side = data.meta.teamSide === "away" ? "客队" : "主队";
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal wide" role="dialog" aria-modal="true" aria-labelledby="statistics-roster-title"><div class="modal-head"><div><h2 id="statistics-roster-title">导入技术统计队员名单</h2><p>导入到${side} ${esc(selectedTeam(data))}。支持 .xlsx 和 .csv，XLSX 读取第一个工作表。</p></div><button class="icon-button" id="close-roster-import" type="button" aria-label="关闭">×</button></div><label class="file-drop" for="roster-file"><strong>选择 Excel / CSV 文件</strong><span>至少包含“号码”和“姓名”列，支持 1–14 名队员；旧版 .xls 请先另存为 .xlsx。</span><input id="roster-file" type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" /></label><div id="roster-import-result" role="status"><div class="event-empty">选择文件后将在这里预览导入结果。</div></div><div class="modal-actions"><button class="ghost-button" id="cancel-roster-import" type="button">取消</button><button class="primary-button blue" id="confirm-roster-import" type="button" disabled>确认导入名单</button></div></section></div>`;
  const confirm = modalRoot.querySelector("#confirm-roster-import");
  const resultSlot = modalRoot.querySelector("#roster-import-result");
  const close = () => { requestId++; modalRoot.replaceChildren(); };
  modalRoot.querySelector("#close-roster-import").onclick = close;
  modalRoot.querySelector("#cancel-roster-import").onclick = close;
  modalRoot.querySelector("#roster-file").onchange = async event => {
    const currentRequest = ++requestId;
    prepared = null;
    confirm.disabled = true;
    const file = event.target.files?.[0];
    if (!file) { resultSlot.innerHTML = '<div class="event-empty">请选择名单文件。</div>'; return; }
    resultSlot.innerHTML = '<div class="event-empty">正在读取并校验名单…</div>';
    try {
      const imported = normalizeRosterRows(await parseRosterFile(file), { minimumPlayers: 1 });
      if (currentRequest !== requestId) return;
      prepared = prepareStatisticsRosterImport(data, imported);
      const warnings = [];
      if (!imported.teamName) warnings.push("文件中未填写队伍名称，将保留页面现有队名。");
      else if (imported.teamName !== selectedTeam(data)) warnings.push(`统计队名将更新为“${imported.teamName}”。`);
      warnings.push(prepared.retainedCount ? `保留 ${prepared.retainedCount} 名队员已有的技术统计，新队员从零开始。` : "确认后将替换页面现有名单，技术统计从零开始。");
      const missingGender = prepared.players.slice(0, prepared.importedCount).filter(p => !statisticsPlayerGender(data, p)).length;
      if (missingGender) warnings.push(`${missingGender} 名队员缺少性别，确认导入后请补选男或女。`);
      resultSlot.innerHTML = `<section class="import-preview"><div class="import-summary"><div><small>有效队员</small><strong>${prepared.importedCount}</strong></div><div><small>保留统计队员</small><strong>${prepared.retainedCount}</strong></div></div><div class="import-warnings">${warnings.map(message => `<p>${esc(message)}</p>`).join("")}</div><div class="import-table with-gender"><b>号码</b><b>队员姓名</b><b>性别</b><b>已有记录</b>${prepared.players.slice(0, prepared.importedCount).map(p => `<span>${esc(p.number)}</span><span>${esc(p.name)}</span><span>${esc(statisticsPlayerGender(data, p) || "待补")}</span><span>${GROUPS.some(g => groupTotal(p.counts, g.key)) ? "保留" : "—"}</span>`).join("")}</div></section>`;
      confirm.disabled = false;
    } catch (error) {
      if (currentRequest !== requestId) return;
      resultSlot.innerHTML = `<div class="validation-banner">${esc(error.message || "名单文件读取失败。")}</div>`;
    }
  };
  confirm.onclick = () => {
    if (!prepared) return;
    data.players = prepared.players;
    data.meta[data.meta.teamSide === "away" ? "awayTeam" : "homeTeam"] = prepared.teamName;
    renderStatistics();
    app.querySelector("#import-statistics-roster").scrollIntoView({ block: "center" });
    toast(`已导入 ${prepared.importedCount} 名队员${prepared.retainedCount ? `，保留 ${prepared.retainedCount} 名队员的技术统计` : ""}。`);
  };
}

function valueCell(row, group, outcome, label) {
  const player = data.players[row];
  const value = player.counts[group][outcome];
  const filled = Boolean(player.name && player.number);
  const description = `${player.number}号 ${player.name} ${label}`;
  return `<td data-cell="${row}-${group}-${outcome}"><div class="statistics-counter"><button type="button" data-row="${row}" data-group="${group}" data-outcome="${outcome}" data-delta="-1" aria-label="${esc(description)} 减少一次" ${!filled || !value ? "disabled" : ""}>−</button><span class="statistics-count">${value}</span><button type="button" data-row="${row}" data-group="${group}" data-outcome="${outcome}" data-delta="1" aria-label="${esc(description)} 增加一次" ${!filled ? "disabled" : ""}>＋</button></div></td>`;
}

function totalsHTML() {
  const totals = teamTotals(data.players);
  return `<tr><th colspan="2" scope="row">全队合计</th>${GROUPS.map(({ key }) => `${OUTCOMES.map(outcome => `<td data-team-total="${key}-${outcome}">${totals[key][outcome]}</td>`).join("")}<td class="statistics-total" data-team-total="${key}-total">${groupTotal(totals, key)}</td>`).join("")}</tr>`;
}

function renderTable() {
  const m = data.meta;
  app.innerHTML = `<section class="statistics-page page-enter">
    <div class="statistics-toolbar"><div><span class="eyebrow">TECHNICAL STATISTICS · LIVE</span><h1>技术统计</h1><p>点击 ＋ 记录一次，点击 − 纠正一次；总数自动相加，数据实时保存。</p></div><div><button class="ghost-button" id="edit-statistics" type="button">比赛信息与名单</button><button class="ghost-button" id="edit-statistics-scores" type="button">填写比分</button><button class="ghost-button" id="edit-statistics-signatures" type="button">填写签名</button><button class="primary-button blue" id="print-statistics" type="button">打印 / 导出 PDF</button></div></div>
    <div class="statistics-scroll-hint">表格可左右滑动，队员姓名和号码固定在左侧。</div>
    <div class="statistics-sheet-scroll" role="region" aria-label="B6 技术统计表，可左右滚动" tabindex="0"><article class="statistics-sheet">
      <div class="statistics-paper-heading"><div class="statistics-paper-meta"><div><span>比赛名称</span><b>${esc(m.competition)}</b></div><div><span>场序</span><b>${esc(m.matchNo)}</b></div><div><span>队名</span><b>${esc(selectedTeam(data))}</b></div></div></div>
      <div class="statistics-paper-context"><span>主队：${esc(m.homeTeam)}</span><span>客队：${esc(m.awayTeam)}</span><span>男 ${m.gender === "男子" ? "☑" : "□"}　女 ${m.gender === "女子" ? "☑" : "□"}${m.gender === "混合" ? "　男女混合 ☑" : ""}</span><span>日期：${esc(m.date)}</span><span>比赛城市：${esc(m.city)}</span><span>比赛馆：${esc(m.venue)}</span></div>
      <div class="statistics-paper-result">${paperResultHTML()}</div>
      <table class="statistics-table"><caption class="sr-only">${esc(selectedTeam(data))}队员技术统计；每项总数等于前三项之和</caption><colgroup><col class="statistics-name-col" /><col class="statistics-number-col" />${GROUPS.map(() => '<col /><col /><col /><col class="statistics-total-col" />').join("")}</colgroup>
        <thead><tr><th rowspan="2" scope="col" class="statistics-name-cell">队员<br />姓名</th><th rowspan="2" scope="col" class="statistics-number-cell">队员<br />号码</th>${GROUPS.map(g => `<th colspan="4" scope="colgroup">${g.label}</th>`).join("")}</tr><tr>${GROUPS.map(g => `<th scope="col">${g.success}</th><th scope="col">一般</th><th scope="col">失误</th><th scope="col" class="statistics-total">总数</th>`).join("")}</tr></thead>
        <tbody>${data.players.map((p, row) => `<tr data-player-row="${row}"><th scope="row" class="statistics-name-cell">${esc(p.name)}${m.gender === "混合" && p.name ? `<small class="statistics-player-gender">${esc(p.gender)}</small>` : ""}</th><td class="statistics-number-cell">${esc(p.number)}</td>${GROUPS.map(g => `${valueCell(row, g.key, "success", `${g.label}${g.success}`)}${valueCell(row, g.key, "normal", `${g.label}一般`)}${valueCell(row, g.key, "error", `${g.label}失误`)}<td class="statistics-total" data-row-total="${row}-${g.key}">${groupTotal(p.counts, g.key)}</td>`).join("")}</tr>`).join("")}</tbody>
        <tfoot>${totalsHTML()}</tfoot>
      </table>
      <div class="statistics-paper-signatures"><div>统计员签名：<b data-signature="statistician">${esc(m.statistician)}</b></div><div>技术代表签名：<b data-signature="representative">${esc(m.representative)}</b></div></div>
    </article></div>
    <p class="statistics-table-note">总数 = ${"得分 / 扣死 / 到位 / 拦死 / 好球"} + 一般 + 失误；全队合计自动汇总所有队员。空白队员行需先在名单中填写姓名与号码。</p>
    <p class="statistics-last-action" id="statistics-last-action" role="status" aria-live="polite">已载入本机技术统计记录。</p>
  </section>`;
  app.querySelector("#edit-statistics").onclick = () => { data.screen = "setup"; renderStatistics(); window.scrollTo(0, 0); };
  app.querySelector("#edit-statistics-scores").onclick = openStatisticsScores;
  app.querySelector("#edit-statistics-signatures").onclick = openStatisticsSignatures;
  app.querySelector("#print-statistics").onclick = () => window.print();
  app.querySelector(".statistics-table").addEventListener("click", event => {
    const button = event.target.closest("button[data-delta]");
    if (!button) return;
    const { row, group, outcome, delta } = button.dataset;
    if (!adjustStatistic(data, Number(row), group, outcome, Number(delta))) return;
    const cell = button.closest("td");
    const p = data.players[Number(row)];
    cell.querySelector(".statistics-count").textContent = p.counts[group][outcome];
    cell.querySelector('[data-delta="-1"]').disabled = p.counts[group][outcome] === 0;
    app.querySelector(`[data-row-total="${row}-${group}"]`).textContent = groupTotal(p.counts, group);
    const totals = teamTotals(data.players);
    for (const result of [...OUTCOMES, "total"]) {
      app.querySelector(`[data-team-total="${group}-${result}"]`).textContent = result === "total" ? groupTotal(totals, group) : totals[group][result];
    }
    const g = GROUPS.find(g => g.key === group);
    app.querySelector("#statistics-last-action").textContent = `${p.number} 号 ${p.name} · ${g.label}${outcome === "success" ? g.success : outcome === "normal" ? "一般" : "失误"} ${Number(delta) > 0 ? "+1" : "−1"}，当前 ${p.counts[group][outcome]} 次。`;
    save();
  });
}

function paperResultHTML() {
  const m = data.meta;
  return `<div>比赛结果 <b>${matchResult(data.setScores, data.completedSets)}</b></div><div class="statistics-paper-sets">局比分 ${data.setScores.map((pair, i) => `<span title="第 ${i + 1} 局${data.completedSets[i] ? '（已结束）' : '（未结束）'}">${pair.map(v => esc(v || "—")).join(" : ")}</span>`).join("")}</div><div>胜队 <b>${esc(m.winner ? (m.winner === "home" ? m.homeTeam : m.awayTeam) : "—")}</b></div>`;
}

function openStatisticsSignatures() {
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="statistics-signatures-title"><div class="modal-head"><div><h2 id="statistics-signatures-title">填写签名</h2><p>比赛结束核对后，可在这里填写统计员和技术代表签名。</p></div><button class="icon-button" id="close-statistics-signatures" type="button" aria-label="关闭">×</button></div><form id="statistics-signatures-form"><div class="form-grid">${field("statistician", "统计员签名")}${field("representative", "技术代表签名")}</div><div class="modal-actions"><button class="ghost-button" id="cancel-statistics-signatures" type="button">取消</button><button class="primary-button blue" type="submit">保存签名</button></div></form></section></div>`;
  const close = () => modalRoot.replaceChildren();
  modalRoot.querySelector("#close-statistics-signatures").onclick = close;
  modalRoot.querySelector("#cancel-statistics-signatures").onclick = close;
  const form = modalRoot.querySelector("#statistics-signatures-form");
  form.addEventListener("submit", event => {
    event.preventDefault();
    const values = new FormData(form);
    for (const key of ["statistician", "representative"]) {
      data.meta[key] = String(values.get(key) || "").trim();
      app.querySelector(`[data-signature="${key}"]`).textContent = data.meta[key];
    }
    save();
    close();
    toast("签名已保存。");
  });
}

function openStatisticsScores() {
  const m = data.meta;
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal wide" role="dialog" aria-modal="true" aria-labelledby="statistics-scores-title"><div class="modal-head"><div><h2 id="statistics-scores-title">填写比分</h2><p>主队：${esc(m.homeTeam)} · 客队：${esc(m.awayTeam)}。比赛中可随时更新比分，勾选“本局已结束”后计入比赛结果。</p></div><button class="icon-button" id="close-statistics-scores" type="button" aria-label="关闭">×</button></div>
    <form id="statistics-scores-form"><div class="statistics-set-inputs statistics-live-set-inputs">${data.setScores.map((pair, index) => `<fieldset><legend>第 ${index + 1} 局</legend><div class="statistics-score-pair"><input type="number" min="0" max="999" name="set-${index}-0" value="${esc(pair[0])}" aria-label="第 ${index + 1} 局主队比分" placeholder="主队" /><span>:</span><input type="number" min="0" max="999" name="set-${index}-1" value="${esc(pair[1])}" aria-label="第 ${index + 1} 局客队比分" placeholder="客队" /></div><label class="statistics-set-completed"><input type="checkbox" name="completed-${index}" ${data.completedSets[index] ? "checked" : ""} />本局已结束</label></fieldset>`).join("")}</div>
    <div class="form-grid statistics-result-fields"><div class="field"><label>比赛结果（主队 : 客队）</label><output id="statistics-result">${matchResult(data.setScores, data.completedSets)}</output></div><div class="field"><label for="stats-winner">胜队</label><select id="stats-winner" name="winner"><option value="">暂未确定</option><option value="home" ${m.winner === "home" ? "selected" : ""}>${esc(m.homeTeam)}</option><option value="away" ${m.winner === "away" ? "selected" : ""}>${esc(m.awayTeam)}</option></select></div></div>
    <div id="statistics-scores-error" role="alert"></div><div class="modal-actions"><button class="ghost-button" id="cancel-statistics-scores" type="button">取消</button><button class="primary-button blue" type="submit">保存比分</button></div></form></section></div>`;
  const close = () => modalRoot.replaceChildren();
  modalRoot.querySelector("#close-statistics-scores").onclick = close;
  modalRoot.querySelector("#cancel-statistics-scores").onclick = close;
  const form = modalRoot.querySelector("#statistics-scores-form");
  const readScores = () => {
    const values = new FormData(form);
    return {
      setScores: data.setScores.map((_, index) => [0, 1].map(side => String(values.get(`set-${index}-${side}`) || "").trim())),
      completedSets: data.completedSets.map((_, index) => values.has(`completed-${index}`)),
      winner: String(values.get("winner") || "")
    };
  };
  form.addEventListener("input", () => {
    const draft = readScores();
    form.querySelector("#statistics-result").textContent = matchResult(draft.setScores, draft.completedSets);
    form.querySelector("#statistics-scores-error").replaceChildren();
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    const draft = readScores();
    const error = validateStatisticsScores(draft.setScores, draft.completedSets);
    if (error) { form.querySelector("#statistics-scores-error").innerHTML = `<div class="validation-banner">${esc(error)}</div>`; return; }
    data.setScores = draft.setScores;
    data.completedSets = draft.completedSets;
    data.meta.winner = draft.winner;
    app.querySelector(".statistics-paper-result").innerHTML = paperResultHTML();
    save();
    close();
    toast("比分已保存。");
  });
}

function openStatisticsData() {
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="statistics-data-title"><div class="modal-head"><div><h2 id="statistics-data-title">技术统计数据管理</h2><p>导出备份可保留当前比赛；导入将替换当前技术统计表。</p></div><button class="icon-button" id="close-statistics-data" type="button" aria-label="关闭">×</button></div><div class="data-actions"><button class="primary-button blue" id="export-statistics" type="button">导出技术统计 JSON</button><label class="ghost-button">导入技术统计 JSON<input id="import-statistics" type="file" accept=".json,application/json" hidden /></label></div><div id="statistics-import-error" role="alert"></div></section></div>`;
  modalRoot.querySelector("#close-statistics-data").onclick = () => modalRoot.replaceChildren();
  modalRoot.querySelector("#export-statistics").onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ type: "volley-technical-statistics", version: 1, data }, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeFilename(data.meta.competition)}-${safeFilename(selectedTeam(data) || "技术统计")}-B6.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  modalRoot.querySelector("#import-statistics").onchange = async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      if (imported.type !== "volley-technical-statistics" || imported.version !== 1 || imported.data?.version !== 1 || !Array.isArray(imported.data.players)) throw new Error("请选择由本功能导出的技术统计 JSON 文件。");
      const next = normalizeStatistics(imported.data);
      if (imported.data.screen === "table" && validateStatistics(next)) throw new Error(validateStatistics(next));
      if (!await confirmDialog("导入将替换当前技术统计数据，确定继续吗？", { okText: "导入", danger: true })) return;
      data = next;
      renderStatistics();
      toast("技术统计数据已导入。");
    } catch (error) {
      modalRoot.querySelector("#statistics-import-error").textContent = error.message || "导入失败，请检查文件。";
    } finally {
      event.target.value = "";
    }
  };
}
