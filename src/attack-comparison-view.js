import { escapeHTML as esc } from "./ui.js";
import { formatPercentage as percent } from "./statistics-analysis.js";
import { buildAttackComparison, currentAttackSetter } from "./attack-attribution.js";

export function attackSetterLabel(data, slot) {
  const p = slot === null ? null : data.setterStatistics.players[slot];
  return p ? `${p.number} 号 ${p.name}` : "未归属二传";
}

export function activeSetterHTML(data) {
  if (!data.setterStatistics.enabled) return "";
  const active = currentAttackSetter(data);
  return `<section class="active-setter-panel" aria-label="场上二传与队员进攻"><div class="active-setter-heading"><label for="active-setter">场上二传<select id="active-setter"><option value="" ${active === null ? "selected" : ""}>未选择（进攻记为未归属）</option>${data.setterStatistics.players.map((p, i) => p.name.trim() && p.number.trim() ? `<option value="${i}" ${active === i ? "selected" : ""}>${esc(p.number)} 号 ${esc(p.name)}</option>` : "").join("")}</select></label><p>换二传后，新录入的扣球自动跟随所选二传；原表累计数据继续相加。二传自己的扣球保留在原表，队友效率对比不包含本人。</p></div><div id="active-setter-summary" role="status" aria-live="polite">${activeSetterSummaryHTML(data)}</div><details id="active-setter-details"><summary>查看当前二传在场的队员进攻明细</summary><div id="active-setter-players">${activeSetterPlayersHTML(data)}</div></details><p class="active-setter-note">点扣球“−”撤回该队员、该结果最近一次记录，并扣回原二传的归属。旧记录及未选择二传时的记录保留为“未归属”。</p></section>`;
}

function activeGroup(data) {
  const comparison = buildAttackComparison(data);
  return comparison.groups.find(g => g.slot === currentAttackSetter(data)) || comparison.unassigned;
}

export function activeSetterSummaryHTML(data) {
  const g = activeGroup(data);
  return `<b>${esc(attackSetterLabel(data, g.slot))}</b><span>队友进攻 ${g.total} 次</span><span>扣死 ${g.success} · 一般 ${g.normal} · 失误 ${g.error}</span><span>进攻效率 <strong>${percent(g.efficiency)}</strong> · 扣死率 ${percent(g.killRate)}</span>`;
}

export function activeSetterPlayersHTML(data) {
  const g = activeGroup(data);
  return `<div class="analysis-table-scroll"><table class="active-setter-player-table"><thead><tr><th>队员</th><th>扣死</th><th>一般</th><th>失误</th><th>次数</th><th>进攻效率</th><th>扣死率</th></tr></thead><tbody>${g.players.filter(p => !p.own).map(p => `<tr><th>${esc(p.number)} 号 ${esc(p.name)}</th><td>${p.success}</td><td>${p.normal}</td><td>${p.error}</td><td>${p.total}</td><td>${percent(p.efficiency)}</td><td>${percent(p.killRate)}</td></tr>`).join("")}</tbody></table></div>`;
}

export function attackComparisonReportHTML(data, heading) {
  if (!data.setterStatistics.enabled) return "";
  const report = buildAttackComparison(data);
  const groups = [...report.groups, report.unassigned];
  const players = groups[0]?.players || [];
  return `<section class="analysis-print-page analysis-attack-comparison">${heading}
    <p class="analysis-detail-intro">按录入时选择的场上二传分组，对比其他队员的扣球表现。仅计算原表扣球，二传本人和独立记录的二次进攻不纳入队友效率。</p>
    <h3>二传在场时 · 队友进攻汇总</h3>
    <div class="analysis-table-scroll"><table class="attack-comparison-summary"><thead><tr><th>场上二传</th><th>扣死</th><th>一般</th><th>失误</th><th>总进攻</th><th>进攻效率</th><th>扣死率</th><th>本人进攻（排除）</th></tr></thead><tbody>${groups.map(g => `<tr data-comparison-setter="${g.slot ?? "unassigned"}"><th>${esc(attackSetterLabel(data, g.slot))}</th><td>${g.success}</td><td>${g.normal}</td><td>${g.error}</td><td>${g.total}</td><td><b>${percent(g.efficiency)}</b></td><td>${percent(g.killRate)}</td><td>${g.excluded}</td></tr>`).join("")}</tbody></table></div>
    <h3 class="attack-comparison-detail-heading">同一队员 · 不同二传在场时的进攻表现</h3>
    <p class="analysis-small-note">各格显示“扣死 / 一般 / 失误 · 总次数”，下一行显示“进攻效率 · 扣死率”。</p>
    <div class="analysis-table-scroll"><table class="attack-comparison-players"><thead><tr><th>队员</th>${groups.map(g => `<th>${esc(attackSetterLabel(data, g.slot))}</th>`).join("")}</tr></thead><tbody>${players.map((p, i) => `<tr><th>${esc(p.number)} 号 ${esc(p.name)}</th>${groups.map(g => {
      const a = g.players[i];
      return a.own ? '<td class="attack-own">二传本人（不比较）</td>' : `<td><span>${a.success} / ${a.normal} / ${a.error} · ${a.total} 次</span><small>效率 <b>${percent(a.efficiency)}</b> · 扣死 ${percent(a.killRate)}</small></td>`;
    }).join("")}</tr>`).join("")}</tbody></table></div>
    <footer class="analysis-footnote analysis-calculation-notes"><p><b>进攻效率 =（扣死 − 失误）÷ 总进攻次数；扣死率 = 扣死 ÷ 总进攻次数。</b>总进攻次数 = 扣死 + 一般 + 失误，分母为 0 显示“—”，效率可以为负。汇总按次数计算。</p><p>各二传归属记录 + 未归属记录（含各自本人进攻）与原表扣球总数一致。“未归属”不参与二传对比。记录量、一传质量、对手及轮次均可能影响结果，本表不据此判定二传导致效率差异。</p></footer>
  </section>`;
}
