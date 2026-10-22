import { repository, migrateLegacy } from "./console-repository.js";
import { requireSession, navigate } from "./session.js";
import { copy, scoreData, statsData, locked } from "./console-domain.js";
import { toast, escapeHTML as esc } from "./ui.js";

export async function prepareManagedRecord() {
  const params = new URLSearchParams(location.search), matchId = params.get("match");
  if (!matchId) return true;
  if (!await requireSession()) return false;
  await migrateLegacy();
  let record = await repository.get("matches", matchId);
  if (!record || record.missing || record.archived) throw Error("这场比赛不存在、已归档或原记录缺失，请返回控制台查看。");
  const mode = params.get("mode") === "statistics" ? "statistics" : "score", side = params.get("side") === "away" ? "away" : "home";
  let tail = Promise.resolve(), error = null, pending = 0, current = null;
  const ctx = {
    mode, side, record,
    scoring: scoreData(record), statistics: statsData(record, side),
    hasOfficialScore: () => Boolean(record.scoring?.match),
    save(payload) {
      current = copy(payload);
      const snapshot = copy(payload); pending++;
      const label = document.querySelector("#save-label"); if (label) label.textContent = "正在保存…";
      tail = tail.then(async () => {
        if (error) throw error;
        const next = copy(record);
        if (mode === "score") {
          if (!locked(record)) next.meta.matchFormat = snapshot.meta.matchFormat;
          // 换边安排可在计分页按赛事规程调整；共享元信息不能覆盖刚保存的选择。
          next.meta.courtSwitchPolicy = snapshot.meta.courtSwitchPolicy || "auto";
          next.scoring = snapshot;
          next.scoring.matchId = next.id; next.scoring.tournamentId = next.tournamentId;
          // Only roster edits before the first recorded action change the shared snapshot.
          if (!record.scoring?.match) next.teams = snapshot.teams.map((team, i) => ({ ...copy(team), id: record.teams[i].id, name: record.teams[i].name }));
          next.scoring.meta = { ...snapshot.meta, ...next.meta };
          next.scoring.teams = snapshot.teams.map((team, i) => ({ ...copy(team), id: next.teams[i].id, name: next.teams[i].name }));
        } else {
          const normalized = statsData({ ...next, statistics: { ...next.statistics, [side]: snapshot } }, side);
          if (!next.scoring?.match) {
            const result = { setScores: snapshot.setScores, completedSets: snapshot.completedSets, winner: snapshot.meta.winner };
            if (JSON.stringify(result) !== JSON.stringify(next.manualResult)) next.manualConfirmed = false;
            next.manualResult = copy(result);
            normalized.setScores = copy(result.setScores); normalized.completedSets = copy(result.completedSets); normalized.meta.winner = result.winner;
          }
          next.statistics[side] = normalized;
        }
        record = await repository.put("matches", next, record.revision);
        ctx.record = record;
      }).catch(e => { error = e; toast(e.message, "error"); }).finally(() => {
        pending--;
        if (label) label.textContent = error ? "未保存 · 请导出备份" : pending ? "正在保存…" : `已保存 ${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`;
      });
      return tail;
    },
    async flush() { await tail; if (error) throw error; },
    async refreshScores() {
      await ctx.flush();
      const latest = await repository.get("matches", record.id);
      // A revision change requires reload: do not silently replace this editor's base.
      if (!latest || latest.revision !== record.revision) throw Error("这场比赛已在其他页面更新。请导出当前备份并重新载入。");
      return statsData(record, side);
    },
    exportCurrent() {
      const value = current || (mode === "score" ? ctx.scoring : ctx.statistics);
      const data = mode === "score" ? { schemaVersion: 2, app: "Volley Record", state: value } : { type: "volley-technical-statistics", version: 1, data: value };
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = document.createElement("a"); a.href = url; a.download = "当前记录-备份.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };
  window.__managedRecord = ctx;
  window.addEventListener("beforeunload", e => { if (pending || error) { e.preventDefault(); e.returnValue = ""; } });
  document.addEventListener("click", async e => {
    const a = e.target.closest?.("a[href]");
    if (!a || a.hasAttribute("download") || a.target === "_blank" || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    if (a.href.startsWith("blob:") || a.getAttribute("href").startsWith("#")) return;
    e.preventDefault();
    try { await ctx.flush(); navigate(a.href); } catch (err) { toast(err.message, "error"); }
  });
  return true;
}

export function attachManagedControls() {
  const ctx = window.__managedRecord;
  if (!ctx) return;
  document.querySelector(".record-mode-back").href = `../console/?view=match&id=${encodeURIComponent(ctx.record.id)}`;
  document.querySelector(".record-mode-back").textContent = "返回比赛详情";
  const oldReset = document.querySelector("#reset-app"), newReset = oldReset.cloneNode(true); oldReset.replaceWith(newReset);
  newReset.textContent = "新建比赛";
  newReset.onclick = async e => { e.stopImmediatePropagation(); try { await ctx.flush(); navigate("../console/?view=matches&create=1"); } catch (err) { toast(err.message, "error"); } };
  const manager = document.querySelector("#data-manager");
  // Existing recovery snapshots belong to the guest workspace, never to a managed match.
  const replacement = manager.cloneNode(true); manager.replaceWith(replacement);
  replacement.textContent = "导出当前备份"; replacement.onclick = () => ctx.exportCurrent();
  const banner = document.createElement("div"); banner.className = "managed-banner";
  banner.innerHTML = `<span>本机控制台 · ${esc(ctx.record.teams.map(t => t.name).join(" vs "))} · ${ctx.mode === "score" ? "计分" : ctx.side === "home" ? "主队技术统计" : "客队技术统计"}</span><button class="text-button" id="managed-reload">重新载入</button>`;
  document.querySelector("#app").before(banner);
  banner.querySelector("button").onclick = () => { if (confirm("重新载入会丢弃尚未保存的修改。请先导出备份。")) location.reload(); };
  const lockFields = () => {
    const fields = ctx.mode === "statistics" ? ["competition", "matchNo", "homeTeam", "awayTeam", "teamSide", "gender", "date", "city", "venue"] : ["competition", "matchNo", "gender", "date", "city", "venue", "scheduledTime", "matchFormat"];
    fields.forEach(name => document.querySelectorAll(`#app [name="${name}"]`).forEach(el => { el.disabled = true; el.title = "共同比赛信息在控制台的比赛详情中修改"; }));
    if (ctx.mode === "score") document.querySelectorAll('#app [name^="team-name-"]').forEach(el => { el.readOnly = true; });
    if (locked(ctx.record)) document.querySelectorAll("#app .rule-card").forEach(el => { el.disabled = true; });
    document.querySelectorAll("#load-statistics-demo, #load-demo, [data-action=demo-roster]").forEach(el => { el.hidden = true; });
  };
  new MutationObserver(lockFields).observe(document.querySelector("#app"), { childList: true, subtree: true }); lockFields();
}
