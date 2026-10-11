import { app, escapeHTML } from "./ui.js";
import { STATISTICS_KEY, normalizeStatistics, selectedTeam } from "./statistics-state.js";

const query = new URLSearchParams(location.search);
const mode = query.get("mode");
const scoring = mode === "score" || query.has("match");

if (scoring || mode === "statistics") {
  const actions = document.querySelector(".topbar-actions");
  const back = document.createElement("a");
  back.className = "text-button record-mode-back";
  back.href = "./";
  back.textContent = "切换记录方式";
  actions.prepend(back);
  if (scoring) await import("./app.js");
  else {
    const { startStatistics } = await import("./statistics.js");
    startStatistics();
  }
} else {
  document.querySelector(".topbar-actions").hidden = true;
  let savedScore;
  let savedStatistics;
  try { savedScore = JSON.parse(localStorage.getItem("volley-record-state-v1")); } catch {}
  try {
    const raw = JSON.parse(localStorage.getItem(STATISTICS_KEY));
    if (raw) savedStatistics = normalizeStatistics(raw);
  } catch {}
  app.innerHTML = `
    <section class="record-choice page-enter" aria-labelledby="record-choice-title">
      <div class="record-choice-heading"><span class="eyebrow">MATCH RECORD</span><h1 id="record-choice-title">比赛记录</h1><p>选择本场比赛的记录方式，从赛前准备到场上每一个回合。</p></div>
      <div class="record-mode-grid">
        <a class="record-mode-card" id="choose-scoring" href="?mode=score">
          <span class="record-mode-icon" aria-hidden="true">25<span>:</span>23</span>
          <small>MATCH SCORING</small><h2>计分</h2><p>选择比赛规则，登记名单与轮次，记录得分、暂停、换人和临场事件。</p>
          <span class="record-mode-tags"><span>规则选择</span><span>比分与轮转</span><span>比赛记录表</span></span>
          <strong>${savedScore?.screen && savedScore.screen !== "record" ? "继续计分" : "进入计分"} <span>→</span></strong>
          ${savedScore?.screen && savedScore.screen !== "record" ? `<em>已保存：${escapeHTML(savedScore.meta?.competition || "未命名比赛")}</em>` : ""}
        </a>
        <a class="record-mode-card statistics-choice" id="choose-statistics" href="?mode=statistics">
          <span class="record-mode-icon" aria-hidden="true">▥<span>＋</span></span>
          <small>TECHNICAL STATISTICS</small><h2>技术统计</h2><p>填写赛前信息与队员名单，按 B6 联赛技术统计表逐人记录五项技术表现。</p>
          <span class="record-mode-tags"><span>原表格式</span><span>点击加减</span><span>自动汇总</span></span>
          <strong>${savedStatistics?.screen === "table" ? "继续技术统计" : "填写赛前信息"} <span>→</span></strong>
          ${savedStatistics ? `<em>已保存：${escapeHTML(savedStatistics.meta.competition || "赛前信息草稿")}${selectedTeam(savedStatistics) ? ` · ${escapeHTML(selectedTeam(savedStatistics))}` : ""}</em>` : ""}
        </a>
      </div>
      <p class="record-choice-note">计分与技术统计分别自动保存在本机，可随时切换并继续记录。</p>
    </section>`;
}
