import { escapeHTML as esc } from "./ui.js";
import { buildSetterAnalysis } from "./setter-statistics.js";
import { formatPercentage as percent } from "./statistics-analysis.js";

function cells(g) {
  return `<td>${g.error}</td><td>${g.normal}</td><td>${g.success}</td><td>${g.total}</td><td><b>${percent(g.successRate)}</b></td><td>${percent(g.errorRate)}</td>`;
}

export function setterReportHTML(data, heading) {
  const report = buildSetterAnalysis(data);
  if (!report) return "";
  const cards = [["传球总次数", report.passingTotal, "到位球传球 + 调整球传球"], ["传球到位率", percent(report.passingTotal ? report.passingAccurate / report.passingTotal : null), `${report.passingAccurate} / ${report.passingTotal} 次到位`], ["二次进攻得分", report.secondPoints, "单独统计，不重复叠加原表得分"], ["二传队员", report.players.length, "本表独立填写的二传名单"]];
  const heads = '<th>失误</th><th>一般</th><th>到位 / 得分</th><th>总次数</th><th>到位 / 得分率</th><th>失误率</th>';
  return `<section class="analysis-print-page analysis-setters">${heading}<div class="analysis-summary">${cards.map(([label, value, note]) => `<div><span>${label}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></div>`).join("")}</div>
    <h3>二传整体表现</h3><div class="analysis-table-scroll"><table class="analysis-setter-team-table"><thead><tr><th>技术类别</th>${heads}</tr></thead><tbody>${report.groups.map(g => `<tr><th>${g.label}<small>${g.key === "secondAttack" ? "得分率" : "传球到位率"}</small></th>${cells(g)}</tr>`).join("")}</tbody></table></div>
    <h3 class="analysis-setter-details-heading">二传队员明细</h3><div class="analysis-table-scroll"><table class="analysis-setter-player-table"><thead><tr><th>号码 / 姓名</th><th>技术类别</th>${heads}</tr></thead><tbody>${report.players.map(p => p.groups.map((g, index) => `<tr>${index === 0 ? `<th rowspan="3" scope="rowgroup">${esc(p.number)} 号 ${esc(p.name)}${data.meta.gender === "混合" ? `<small>${esc(p.gender)}</small>` : ""}</th>` : ""}<th scope="row">${g.label}</th>${cells(g)}</tr>`).join("")).join("")}</tbody></table></div>
    <footer class="analysis-footnote analysis-calculation-notes"><p>到位球传球、调整球传球：到位率 = 到位次数 ÷ 该类别总次数；二次进攻球：得分率 = 得分次数 ÷ 二次进攻总次数。失误率 = 该类别失误次数 ÷ 该类别总次数，零记录显示“—”。整体传球到位率按两类传球的汇总次数计算。</p><p>本页保留二传三类技术的原始计数。二次进攻独立记录，不自动写入原表扣球，也不重复叠加到个人得分榜或原表失误合计。</p></footer>
  </section>`;
}
