// 验证赛事「赛制与队伍」新模型：用「队伍数量」一次建 4 队并录入名单；
// 移除对阵图（无 #schedule-view）；「新建比赛」弹窗选两队带入记录页；无记录时积分表显示提示。
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
  for (let i = 0; i < rows.length; i++) {
    await rows[i].$eval(".tn-team-name", (el, v) => { el.value = v; }, `队${i + 1}`);
    const players = await rows[i].$$(".tn-player-row");
    for (let j = 0; j < players.length; j++) {
      await players[j].$eval(".tn-player-number", (el, v) => { el.value = v; }, String(j + 1));
      await players[j].$eval(".tn-player-name", (el, v) => { el.value = v; }, `球员${j + 1}`);
    }
  }
  return rows;
}

await page.goto(baseUrl + "tournaments/", { waitUntil: "networkidle" });
const name = "赛制功能-" + Date.now();
await page.fill("#tn-name", name);
await page.click("#create-tournament-form button[type='submit']");
await page.waitForSelector(".tn-detail-head", { timeout: 5000 });

await fillTeams(4);
console.log("PASS 队伍数量生成 4 队并录入名单");

// 设为 2 组
await page.fill("#group-count", "2");
await page.locator("#group-count").dispatchEvent("change");
await page.waitForSelector(".tn-team-group", { timeout: 5000 });
console.log("PASS 分组数生效（出现分组选择）");

await page.click("#save-format");
await page.waitForSelector("#standings-view", { timeout: 5000 });

// 对阵图功能已移除
const hasSchedule = await page.$("#schedule-view");
if (hasSchedule) { console.error("FAIL 仍存在对阵图区块"); process.exitCode = 1; }
else console.log("PASS 对阵图功能已移除（无 #schedule-view）");

// 新建比赛：弹窗选两队 → 进入记录页并带入名单
await page.click("#create-match");
await page.waitForSelector(".modal-backdrop #cm-home", { timeout: 5000 });
await page.click(".modal-backdrop [data-act='ok']");
await page.waitForFunction(() => location.pathname.includes("/record/"), undefined, { timeout: 5000 });
await page.waitForFunction(() => window.__volley && window.__volley.getState, undefined, { timeout: 5000 });
const imported = await page.evaluate(() => {
  const t = window.__volley.getState().teams.map(x => x.name);
  return t;
});
if (imported.length !== 2 || !imported.includes("队1") || !imported.includes("队2")) {
  console.error("FAIL 记录页未带入所选两队，实际", JSON.stringify(imported));
  process.exitCode = 1;
} else console.log("PASS 选队建比赛并带入名单（记录页两队为 队1/队2）");

// 返回赛事，积分表无记录时显示提示
await page.goto(baseUrl + "tournaments/", { waitUntil: "networkidle" });
await page.click(".tn-card");
await page.waitForSelector("#standings-view", { timeout: 5000 });
const standingsText = await page.$eval("#standings-view", (el) => el.textContent);
if (!standingsText.includes("还没有已记录的比赛")) { console.error("FAIL 积分表未显示空提示:", standingsText); process.exitCode = 1; }
else console.log("PASS 积分表在无记录时显示提示");

await browser.close();
if (process.exitCode) { console.error("tournament features FAILED"); process.exit(1); }
console.log("tournament features flow passed.");
