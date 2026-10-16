import { setLabel } from "./statistics-sets.js";
import { escapeHTML as esc } from "./ui.js";
import { GROUPS } from "./statistics-state.js";
import { SETTER_GROUPS } from "./setter-statistics.js";
import { latestCounterChange } from "./statistics-history.js";

import { QUICK_KEYS } from "./statistics-keyboard.js";
export { handleCaptureKey } from "./statistics-keyboard.js";
const number = value => String(Number(value));
export function captureGroup(data) {
  const main = GROUPS.find(g => g.key === data.capture.group);
  return main ? { ...main, kind: "player" } : { ...(SETTER_GROUPS.find(g => g.key === data.capture.group) || SETTER_GROUPS[0]), kind: "setter" };
}
export function capturePlayers(data) { return captureGroup(data).kind === "setter" ? (data.setterStatistics.enabled ? data.setterStatistics.players : []) : data.players; }
export function captureRow(data) { return capturePlayers(data).findIndex(p => p.name && p.number && data.capture.selectedNumber !== "" && number(p.number) === number(data.capture.selectedNumber)); }
export function historyLabel(entry) {
  const group = [...GROUPS, ...SETTER_GROUPS].find(g => g.key === entry.group);
  return `${setLabel(entry.setKey || "unassigned")} · ${entry.number}号 ${entry.name} · ${group?.label || ""}${entry.outcome === "success" ? group?.success : entry.outcome === "normal" ? "一般" : "失误"} ${entry.delta > 0 ? "+1" : "−1"}`;
}
export function quickRecorderHTML(data, buffer = "", message = "") {
  const quick = data.capture.mode === "quick", group = captureGroup(data), row = captureRow(data), player = capturePlayers(data)[row];
  const groups = [...GROUPS, ...(data.setterStatistics.enabled ? SETTER_GROUPS : [])];
  const keyFor = key => Object.keys(QUICK_KEYS).find(k => QUICK_KEYS[k] === key)?.toUpperCase();
  const entries = [...(data.counterHistory || [])].reverse();
  return `<div class="statistics-mode-switch" role="group" aria-label="记录方式"><button class="${quick ? "primary-button blue" : "ghost-button"}" data-capture-mode="quick" aria-pressed="${quick}">键盘快速记录</button><button class="${quick ? "ghost-button" : "primary-button blue"}" data-capture-mode="table" aria-pressed="${!quick}">完整统计表</button><span>${quick ? "快捷键已启用 · 使用英文输入法；填写输入框或打开弹窗时自动暂停" : "原表点击加减；也可切换键盘快速记录"}</span></div>
    ${quick ? `<section class="quick-recorder" aria-label="键盘快速记录"><div class="quick-recorder-heading"><div><span class="eyebrow">LIVE CAPTURE</span><h2>快捷记录 · ${esc(data.meta.teamSide === "away" ? data.meta.awayTeam : data.meta.homeTeam)}</h2><p>${esc(data.meta.competition)} · ${data.meta.teamSide === "away" ? "客队" : "主队"}技术统计 · ${setLabel(data.setStatistics?.selected || "1")}</p><p>号码 + Enter 选人 → 字母选项目 → J / K / L 记录结果。项目会保持选中。</p></div><button class="ghost-button compact" data-capture-focus>返回键盘记录区</button></div>
      <div class="quick-groups" role="group" aria-label="技术项目">${groups.map(g => `<button data-capture-group="${g.key}" aria-pressed="${data.capture.group === g.key}" class="${data.capture.group === g.key ? "selected" : ""}"><kbd>${keyFor(g.key)}</kbd>${g.label}</button>`).join("")}</div>
      <div class="quick-players" role="group" aria-label="选择记录队员">${capturePlayers(data).map((p, i) => p.name && p.number ? `<button data-capture-player="${i}" aria-pressed="${i === row}" class="${i === row ? "selected" : ""}"><strong>${esc(p.number)}</strong><span>${esc(p.name)}</span></button>` : "").join("") || '<p>尚无可记录队员，请返回比赛信息填写名单。</p>'}</div>
      <div class="quick-current" id="quick-keyboard-area" tabindex="0" aria-label="键盘记录区域"><div><small>当前队员</small><strong>${player ? `${esc(player.number)}号 ${esc(player.name)}` : "尚未选人"}</strong></div><div><small>当前项目</small><strong>${group.label}</strong></div><div><small>输入号码 · Enter 确认</small><output id="quick-number-buffer">${esc(buffer || "—")}</output></div></div>
      <div class="quick-results">${[["success", "J", group.success], ["normal", "K", "一般"], ["error", "L", "失误"]].map(([o, key, label]) => `<button data-capture-outcome="${o}" ${player && data.setStatistics?.selected !== "all" ? "" : "disabled"}><kbd>${key}</kbd><strong>${label}</strong><span>${player ? player.counts[group.key][o] : 0} 次</span></button>`).join("")}</div>
      <p id="quick-feedback" class="quick-feedback" role="status" aria-live="polite">${esc(message || (player ? "已准备记录；同一队员、同一项目可直接连续按结果键。" : "请先输入号码并按 Enter，或点击上方队员。"))}</p>
      <details class="quick-help"><summary>快捷键说明与记录边界</summary><p>S 发球 · R 一传 · A 扣球 · B 拦网 · D 防守${data.setterStatistics.enabled ? " · E 到位球传球 · T 调整球传球 · X 二次进攻" : ""}。J 成功项（含得分 / 扣死 / 到位 / 好球），K 一般，L 失误。</p><p>号码支持 0–999；Enter 确认号码，Backspace 删除一位，Esc 取消待输入号码。Ctrl / Command + Z 撤销最近一次有效加减；长按按键不会连续计数。</p><p>扣球沿用上方选中的场上二传。二传专项需选择该二传的号码；二次进攻仍独立统计。未看清的动作不要猜填“一般”，可赛后对照录像补录。</p></details>
    </section>` : ""}
    <section class="statistics-history" aria-label="最近记录"><div class="statistics-history-heading"><div><h2>最近记录</h2><p>保留最近 30 次加减，表格与快捷键共用；旧数据没有历史，不影响累计总数。</p></div><button class="ghost-button" id="undo-statistic" ${latestCounterChange(data) ? "" : "disabled"}>撤销上一次${quick ? " · Ctrl / ⌘ Z" : ""}</button></div><details ${quick ? "open" : ""}><summary>${entries.length ? `最近：${esc(historyLabel(entries[0]))}${entries[0].undone ? "（已撤销）" : ""}` : "尚无近期加减记录"}</summary><ol>${entries.map(e => `<li class="${e.undone ? "undone" : ""}"><span>${esc(historyLabel(e))}</span><small>${esc(e.at ? new Date(e.at).toLocaleTimeString("zh-CN", { hour12: false }) : "")}${e.undone ? " · 已撤销" : ""}</small></li>`).join("")}</ol></details></section>`;
}

