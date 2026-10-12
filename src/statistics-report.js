import { escapeHTML as esc } from "./ui.js";
import { selectedTeam, matchResult } from "./statistics-state.js";
import { buildStatisticsAnalysis, formatPercentage as percent, RATE_LABELS } from "./statistics-analysis.js";
import { setterReportHTML } from "./setter-report.js";
import { attackComparisonReportHTML } from "./attack-comparison-view.js";

function header(data, subtitle, page) {
  const m = data.meta;
  return `<header class="analysis-heading"><div><span class="eyebrow">VOLLEY RECORD · MATCH ANALYSIS</span><h2>赛后分析报告 <small>${subtitle}</small></h2><p>${esc(m.competition)} · ${esc(selectedTeam(data))} · ${esc(m.date)} · 场序 ${esc(m.matchNo)}</p></div><span class="analysis-page-number">${page} / ${data.setterStatistics?.enabled ? 4 : 2}</span></header>`;
}

function bar(group) {
  if (!group.total) return '<span class="analysis-no-data">暂无记录</span>';
  return `<div class="analysis-bar" aria-label="${esc(group.label)}：${group.success} 次成功项、${group.normal} 次一般、${group.error} 次失误"><span class="analysis-bar-success" style="width:${group.success / group.total * 100}%"></span><span class="analysis-bar-normal" style="width:${group.normal / group.total * 100}%"></span><span class="analysis-bar-error" style="width:${group.error / group.total * 100}%"></span></div>`;
}

export function statisticsReportHTML(data) {
  const report = buildStatisticsAnalysis(data);
  const overviewNotes = [];
  if (report.leaders.length) overviewNotes.push(`得分领先：${report.leaders.map(p => `${p.number} 号 ${p.name}`).join("、")}，${report.leaders.length > 1 ? "各" : ""}${report.leaders[0].points} 分。`);
  else overviewNotes.push("暂未记录发球得分、扣死或拦死，尚无个人得分排名。");
  if (report.errorGroups.length) overviewNotes.push(`失误次数最多的项目：${report.errorGroups.map(g => g.label).join("、")}，${report.errorGroups.length > 1 ? "各" : ""}${report.errorGroups[0].error} 次；复盘时可结合该项总次数与失误率查看。`);
  else overviewNotes.push(report.actions ? "已录入的技术动作中暂无失误记录。" : "尚无技术动作记录，录入后将自动生成比例与排名。");
  const score = matchResult(data.setScores, data.completedSets);
  const cards = [["个人得分合计", report.points, "发球得分 + 扣死 + 拦死"], ["失误合计", report.errors, "五项技术失误次数之和"], ["有记录的队员", `${report.recordedPlayers} / ${report.players.length}`, "有技术动作记录 / 名单人数"], ["已结束局比分", score, `${data.meta.homeTeam} : ${data.meta.awayTeam}`]];
  return `<article class="statistics-analysis-report">
    <section class="analysis-print-page analysis-overview">
      ${header(data, "全队概览", 1)}
      <div class="analysis-summary">${cards.map(([label, value, note]) => `<div><span>${label}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></div>`).join("")}</div>
      <div class="analysis-section-heading"><h3>全队技术表现</h3><div class="analysis-legend"><span>成功 / 到位 / 好球</span><span>一般</span><span>失误</span></div></div>
      <div class="analysis-table-scroll"><table class="analysis-team-table"><thead><tr><th>技术项目</th><th>成功项</th><th>一般</th><th>失误</th><th>总次数</th><th>成功项占比</th><th>失误率</th><th>次数分布</th></tr></thead><tbody>${report.groups.map(g => `<tr><th>${g.label}<small>${RATE_LABELS[g.key]}</small></th><td>${g.success}</td><td>${g.normal}</td><td>${g.error}</td><td>${g.total}</td><td>${percent(g.successRate)}</td><td>${percent(g.errorRate)}</td><td>${bar(g)}</td></tr>`).join("")}</tbody></table></div>
      <div class="analysis-bottom-grid"><section><h3>个人得分排名</h3>${report.ranking.length ? `<div class="analysis-table-scroll"><table class="analysis-ranking-table"><thead><tr><th>排名</th><th>号码 / 姓名</th><th>发球得分</th><th>扣死</th><th>拦死</th><th>总得分</th></tr></thead><tbody>${report.ranking.slice(0, 5).map(p => `<tr><td>${p.rank}</td><th>${esc(p.number)} 号 ${esc(p.name)}</th>${["serve", "attack", "block"].map(key => `<td>${p.groups.find(g => g.key === key).success}</td>`).join("")}<td><b>${p.points}</b></td></tr>`).join("")}</tbody></table></div><p class="analysis-small-note">展示得分排序前 5 位队员；同分并列，全部队员见明细页。</p>` : '<p class="analysis-empty">暂无得分记录</p>'}</section><section class="analysis-observations"><h3>本场记录摘要</h3>${overviewNotes.map(note => `<p>${esc(note)}</p>`).join("")}<p>全队已记录 ${report.actions} 次技术动作。同一回合可包含多个技术动作，动作次数及失误次数不等于比赛回合数或比分。</p></section></div>
      <footer class="analysis-footnote">仅分析本表记录的队伍与动作。个人得分合计不包含对手失误或判罚得分；零记录项目显示“—”。进行中的局不计入已结束局比分。</footer>
    </section>
    <section class="analysis-print-page analysis-details">
      ${header(data, "队员明细", 2)}
      <p class="analysis-detail-intro">每项依次显示“成功项 / 总次数 · 成功项占比”和“失误次数 · 失误率”，便于同时查看表现与记录量。</p>
      <div class="analysis-table-scroll"><table class="analysis-player-table"><thead><tr><th>号码</th><th>队员姓名</th><th>得分</th><th>失误</th>${report.groups.map(g => `<th>${g.label}<small>${g.key === "serve" || g.key === "block" ? "得分率" : g.key === "attack" ? "成功率" : g.key === "receive" ? "到位率" : "好球率"}</small></th>`).join("")}</tr></thead><tbody>${report.players.map(p => `<tr><td>${esc(p.number)}</td><th>${esc(p.name)}${data.meta.gender === "混合" ? `<small>${esc(p.gender)}</small>` : ""}</th><td><b>${p.points}</b></td><td>${p.errors}</td>${p.groups.map(g => `<td><span>${g.success} / ${g.total} · <b>${percent(g.successRate)}</b></span><small>失误 ${g.error} · ${percent(g.errorRate)}</small></td>`).join("")}</tr>`).join("")}</tbody><tfoot><tr><th colspan="2">全队合计</th><td><b>${report.points}</b></td><td>${report.errors}</td>${report.groups.map(g => `<td><span>${g.success} / ${g.total} · <b>${percent(g.successRate)}</b></span><small>失误 ${g.error} · ${percent(g.errorRate)}</small></td>`).join("")}</tr></tfoot></table></div>
      <footer class="analysis-footnote analysis-calculation-notes"><p><b>计算说明：</b>成功项占比 = 得分 / 扣死 / 到位 / 拦死 / 好球次数 ÷ 对应技术总次数；失误率 = 该项失误次数 ÷ 该项总次数。总次数 = 成功项 + 一般 + 失误。全队比例按汇总次数计算，不取队员百分比的平均值。</p><p>个人得分 = 发球得分 + 扣死 + 拦死。百分比保留 1 位小数；分母为 0 时显示“—”。零记录队员不参与得分排名。报告覆盖当前已录入的数据，补录或纠正后重新导出即可更新。</p></footer>
    </section>
    ${setterReportHTML(data, header(data, "二传专项分析", 3))}
    ${attackComparisonReportHTML(data, header(data, "二传在场时进攻对比", 4))}
  </article>`;
}
