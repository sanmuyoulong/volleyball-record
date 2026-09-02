// 验证赛事管理删除功能：创建赛事 → 录入 2 队 → 选两队建比赛 → 返回详情 →
// 删除比赛（应用内弹窗）→ 比赛消失 → 删除赛事（应用内弹窗）→ 回到列表且赛事消失。
// 流程：创建赛事 → 新建比赛 → 返回详情 → 删除比赛（确认弹窗）→ 比赛消失
//      → 删除赛事（确认弹窗）→ 回到列表且赛事消失。
import { launchBrowser } from "./_browser.mjs";

const browser = await launchBrowser();
const baseUrl = process.env.VOLLEY_URL || "http://127.0.0.1:4173/";
const page = await browser.newPage();
page.on("pageerror", (e) => { console.error("PAGEERROR", e.message); process.exitCode = 1; });

async function confirmDialog() {
  await page.waitForSelector(".modal-backdrop .modal-actions [data-act='ok']", { timeout: 5000 });
  await page.click(".modal-backdrop .modal-actions [data-act='ok']");
}

await page.goto(baseUrl + "tournaments/", { waitUntil: "networkidle" });
const name = "删除测试-" + Date.now();
await page.fill("#tn-name", name);
await page.click("#create-tournament-form button[type='submit']");
await page.waitForSelector(".tn-detail-head", { timeout: 5000 });

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
await page.waitForFunction(() => location.pathname.includes("/record/"), undefined, { timeout: 5000 });
await page.goto(baseUrl + "tournaments/", { waitUntil: "networkidle" });
await page.click(".tn-card");
await page.waitForSelector(".tn-match-list .tn-match", { timeout: 5000 });
const beforeCount = await page.$$eval(".tn-match", (els) => els.length);

// 删除比赛
await page.click(".tn-match [data-remove-match]");
await confirmDialog();
await page.waitForFunction(
  (n) => document.querySelectorAll(".tn-match").length === n - 1,
  beforeCount,
  { timeout: 5000 }
);
console.log("PASS 删除比赛（应用内弹窗生效）");

// 删除赛事
await page.click("#remove-tournament");
await confirmDialog();
await page.waitForSelector(".tn-grid, .tn-empty", { timeout: 5000 });
const gone = await page.$$eval(".tn-card", (els) => els.every((e) => !e.textContent.includes(name)));
if (!gone) { console.error("FAIL 赛事未从列表消失"); process.exitCode = 1; }
else console.log("PASS 删除赛事（连带比赛归档清理）");

await browser.close();
if (process.exitCode) { console.error("delete flow FAILED"); process.exit(1); }
console.log("tournament delete flow passed.");
