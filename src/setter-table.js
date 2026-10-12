import { escapeHTML as esc } from "./ui.js";
import { SETTER_GROUPS, setterGroupTotal, setterTotals } from "./setter-statistics.js";

function valueCell(p, row, group, outcome) {
  const value = p.counts[group.key][outcome];
  const label = outcome === "success" ? group.success : outcome === "normal" ? "一般" : "失误";
  const description = `${p.number}号 ${p.name} ${group.label}${label}`;
  const filled = Boolean(p.name && p.number);
  return `<td data-setter-cell="${row}-${group.key}-${outcome}"><div class="statistics-counter"><button type="button" data-setter-row="${row}" data-group="${group.key}" data-outcome="${outcome}" data-delta="-1" aria-label="${esc(description)} 减少一次" ${!filled || !value ? "disabled" : ""}>−</button><span class="statistics-count">${value}</span><button type="button" data-setter-row="${row}" data-group="${group.key}" data-outcome="${outcome}" data-delta="1" aria-label="${esc(description)} 增加一次" ${!filled ? "disabled" : ""}>＋</button></div></td>`;
}

export function setterTableHTML(data) {
  if (!data.setterStatistics.enabled) return "";
  const totals = setterTotals(data.setterStatistics.players);
  return `<section class="setter-live-section"><h2>二传技术统计</h2><p>传球质量与二次进攻单独记录，总数自动计算；二次进攻不自动写入原表扣球。PDF 的“二传专项分析”同时保留这些原始计数。</p><div class="setter-sheet-scroll" role="region" aria-label="二传技术统计表，可左右滚动" tabindex="0"><table class="setter-table"><colgroup><col class="setter-name-col" /><col class="setter-number-col" />${SETTER_GROUPS.map(() => '<col /><col /><col /><col />').join("")}</colgroup><thead><tr><th rowspan="2" scope="col" class="setter-name-cell">二传姓名</th><th rowspan="2" scope="col" class="setter-number-cell">号码</th>${SETTER_GROUPS.map(g => `<th colspan="4" scope="colgroup">${g.label}</th>`).join("")}</tr><tr>${SETTER_GROUPS.map(g => g.order.map(o => `<th scope="col">${o === "success" ? g.success : o === "normal" ? "一般" : "失误"}</th>`).join("") + '<th scope="col" class="statistics-total">总数</th>').join("")}</tr></thead><tbody>${data.setterStatistics.players.map((p, row) => `<tr><th scope="row" class="setter-name-cell">${esc(p.name)}${data.meta.gender === "混合" && p.name ? `<small class="statistics-player-gender">${esc(p.gender)}</small>` : ""}</th><td class="setter-number-cell">${esc(p.number)}</td>${SETTER_GROUPS.map(g => g.order.map(o => valueCell(p, row, g, o)).join("") + `<td class="statistics-total" data-setter-row-total="${row}-${g.key}">${setterGroupTotal(p.counts, g.key)}</td>`).join("")}</tr>`).join("")}</tbody><tfoot><tr><th colspan="2" scope="row">二传合计</th>${SETTER_GROUPS.map(g => g.order.map(o => `<td data-setter-team-total="${g.key}-${o}">${totals[g.key][o]}</td>`).join("") + `<td class="statistics-total" data-setter-team-total="${g.key}-total">${setterGroupTotal(totals, g.key)}</td>`).join("")}</tr></tfoot></table></div></section>`;
}
