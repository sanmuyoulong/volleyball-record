// 完整集成：2 队（各录入 6 名球员）→ 选两队建比赛 → 记录页 甲队 3-0 乙队
// → 返回赛事页，积分表甲队排名第一，且无对阵图。
// 用 window.__volley（仅 __VOLLEY_TEST__ 时挂载）驱动计分，避免脆弱的向导点击。
import { launchBrowser } from "./_browser.mjs";

const browser = await launchBrowser();
const baseUrl = process.env.VOLLEY_URL || "http://127.0.0.1:4173/";
const page = await browser.newPage();
await page.addInitScript(() => { window.__VOLLEY_TEST__ = true; });
page.on("pageerror", (e) => { console.error("PAGEERROR", e.message); process.exitCode = 1; });

async function fillTeams(count) {
  await page.fill("#team-count", String(count));
  await page.locator("#team-count").dispatchEvent("change");
  await page.waitForFunction((n) => document.querySelectorAll("#team-list .tn-team-row").length === n, count, { timeout: 5000 });
  const rows = await page.$$("#team-list .tn-team-row");
  const names = ["甲队", "乙队"];
  for (let i = 0; i < rows.length; i++) {
    await rows[i].$eval(".tn-team-name", (el, v) => { el.value = v; }, names[i]);
    const players = await rows[i].$$(".tn-player-row");
    for (let j = 0; j < players.length; j++) {
      await players[j].$eval(".tn-player-number", (el, v) => { el.value = v; }, String(j + 1));
      await players[j].$eval(".tn-player-name", (el, v) => { el.value = v; }, `P${j + 1}`);
    }
  }
}

await page.goto(baseUrl + "tournaments/", { waitUntil: "networkidle" });
const name = "记录同步-" + Date.now();
await page.fill("#tn-name", name);
await page.click("#create-tournament-form button[type='submit']");
await page.waitForSelector(".tn-detail-head", { timeout: 5000 });

await fillTeams(2);
await page.click("#save-format");
await page.waitForSelector("#standings-view", { timeout: 5000 });

// 选两队建比赛
await page.click("#create-match");
await page.waitForSelector(".modal-backdrop #cm-home", { timeout: 5000 });
await page.click(".modal-backdrop [data-act='ok']");
await page.waitForFunction(() => location.pathname.includes("/record/"), undefined, { timeout: 5000 });
await page.waitForFunction(() => window.__volley && window.__volley.getState, undefined, { timeout: 5000 });

const played = await page.evaluate(() => {
  const v = window.__volley;
  v.startMatch();
  for (let set = 0; set < 3; set++) {
    for (let i = 0; i < 25; i++) v.awardPoint(0); // 甲队连得 25 分，25-0 胜该局
    if (set < 2) v.startNextSet(set % 2 === 0 ? 1 : 0);
  }
  const s = v.getState();
  return { won: s.match.setsWon };
});
if (played.won[0] !== 3 || played.won[1] !== 0) { console.error("FAIL 应为甲队 3-0，实际", JSON.stringify(played.won)); process.exitCode = 1; }
else console.log("PASS 比赛已记录为 3-0");

// 返回赛事页
await page.goto(baseUrl + "tournaments/", { waitUntil: "networkidle" });
await page.click(".tn-card");
await page.waitForSelector("#standings-view .tn-standings tbody tr:first-child", { timeout: 5000 });
const topTeam = await page.$eval("#standings-view .tn-standings tbody tr:first-child td:nth-child(2)", (el) => el.textContent);
if (topTeam !== "甲队") { console.error("FAIL 积分表第一应为甲队，实际", topTeam); process.exitCode = 1; }
else console.log("PASS 积分表按排球规则排名（甲队第一）");

const hasSchedule = await page.$("#schedule-view");
if (hasSchedule) { console.error("FAIL 仍存在对阵图"); process.exitCode = 1; }
else console.log("PASS 对阵图已移除");

await browser.close();
if (process.exitCode) { console.error("record sync FAILED"); process.exit(1); }
console.log("tournament record→standings sync passed.");
