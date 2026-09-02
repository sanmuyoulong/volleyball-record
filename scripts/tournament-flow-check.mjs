// 赛事管理闭环验证（新模型）：创建赛事 → 录入 2 队 → 选两队建比赛 →
// 进入记分页（落在赛前设置，因队伍已带入）→ 用测试钩子直接开赛并记录 3-0 →
// 记录数据回写赛事摘要（队名+比分）→ 再次进入继续记录 → 持久化。
// 注意：从赛事新建的比赛 screen 为 "setup"，落在设置向导而非落地页，落地页的
// #load-demo 并不存在；因此用 window.__volley（仅 __VOLLEY_TEST__ 时挂载）驱动计分。
import { launchBrowser } from "./_browser.mjs";

const baseUrl = process.env.VOLLEY_URL || "http://127.0.0.1:4173/";
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.addInitScript(() => { window.__VOLLEY_TEST__ = true; });
const problems = [];
page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
page.on("console", message => {
  if (message.type() === "error") problems.push(`console: ${message.text()}`);
});

try {
  await page.goto(`${baseUrl}tournaments/`, { waitUntil: "networkidle" });
  await page.fill("#tn-name", "自动化验证赛事");
  await page.fill("#tn-venue", "验证场馆");
  await page.click("#create-tournament-form button[type=submit]");
  await page.waitForURL(/tournaments\/\?id=/, { timeout: 15000 });

  const tournamentUrl = page.url();
  const heading = (await page.textContent(".tn-detail-head h1")).trim();
  if (!heading.includes("自动化验证赛事")) throw new Error(`赛事详情标题不正确：${heading}`);

  // 录入 2 队
  await page.fill("#team-count", "2");
  await page.locator("#team-count").dispatchEvent("change");
  await page.waitForFunction((n) => document.querySelectorAll("#team-list .tn-team-row").length === n, 2, { timeout: 5000 });
  let rows = await page.$$("#team-list .tn-team-row");
  await rows[0].$eval(".tn-team-name", (el, v) => { el.value = v; }, "甲队");
  await rows[1].$eval(".tn-team-name", (el, v) => { el.value = v; }, "乙队");
  await page.click("#save-format");
  await page.waitForSelector("#standings-view", { timeout: 5000 });

  // 选两队建比赛
  await page.click("#create-match");
  await page.waitForSelector(".modal-backdrop #cm-home", { timeout: 5000 });
  await page.click(".modal-backdrop [data-act='ok']");
  await page.waitForURL(/record\/\?match=/, { timeout: 15000 });
  const matchId = new URL(page.url()).searchParams.get("match");
  if (!matchId) throw new Error("新建比赛后未带 match 参数跳转");

  // 比赛落在赛前设置（teams 已带入），用测试钩子直接开赛并记录甲队 3-0。
  await page.waitForFunction(() => window.__volley && window.__volley.getState, undefined, { timeout: 5000 });
  const won = await page.evaluate(() => {
    const v = window.__volley;
    v.startMatch();
    for (let set = 0; set < 3; set++) {
      for (let i = 0; i < 25; i++) v.awardPoint(0); // 甲队连得 25 分，25-0 胜该局
      if (set < 2) v.startNextSet(set % 2 === 0 ? 1 : 0);
    }
    return v.getState().match.setsWon;
  });
  if (won[0] !== 3 || won[1] !== 0) throw new Error(`应为甲队 3-0，实际 ${JSON.stringify(won)}`);
  await page.waitForSelector("#score-content", { timeout: 5000 });

  await page.goto(tournamentUrl, { waitUntil: "networkidle" });
  const matchCount = await page.locator(".tn-match").count();
  if (matchCount !== 1) throw new Error(`赛事中应有 1 场比赛，实际 ${matchCount}`);
  const matchText = (await page.textContent(".tn-match")).replace(/\s+/g, " ");
  if (matchText.includes("待填写 vs 待填写")) throw new Error("比赛摘要未同步队名");
  if (!/局分 \d+ : \d+/.test(matchText)) throw new Error(`比赛摘要未同步比分：${matchText}`);

  await page.click(".tn-match .primary-button");
  await page.waitForURL(/record\/\?match=/, { timeout: 15000 });
  await page.waitForSelector("#score-content", { timeout: 15000 });
  const scoreText = (await page.textContent("#score-content")).replace(/\s+/g, " ");
  if (!scoreText) throw new Error("重新进入比赛后记分内容为空");

  const stored = await page.evaluate(() => localStorage.getItem("volley-record-tournaments-v1"));
  if (!stored || !stored.includes("自动化验证赛事")) throw new Error("赛事未持久化到本机存储");

  if (problems.length) throw new Error(`页面报错：\n${problems.join("\n")}`);
  console.log("Tournament create / match create / scoring sync flow passed.");
} finally {
  await browser.close();
}
