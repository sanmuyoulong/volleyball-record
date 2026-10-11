// 验证「赛制与队伍」输入在增减队伍时不被丢弃（新模型：队伍数量 + 分组数 + 名单）：
// 1) 设为 4 组并填队名/球员名，再增加队伍数，分组数与已填输入仍保留；
// 2) 移除一队后其余输入仍保留。
import { launchBrowser } from "./_browser.mjs";

const browser = await launchBrowser();
const baseUrl = process.env.VOLLEY_URL || "http://127.0.0.1:4173/";
const page = await browser.newPage();
page.on("pageerror", (e) => { console.error("PAGEERROR", e.message); process.exitCode = 1; });

await page.goto(baseUrl + "tournaments/", { waitUntil: "networkidle" });
const name = "队伍编辑-" + Date.now();
await page.fill("#tn-name", name);
await page.click("#create-tournament-form button[type='submit']");
await page.waitForSelector(".tn-detail-head", { timeout: 5000 });

await page.fill("#team-count", "3");
await page.locator("#team-count").dispatchEvent("change");
await page.waitForFunction(() => document.querySelectorAll("#team-list .tn-team-row").length === 3, { timeout: 5000 });
let rows = await page.$$("#team-list .tn-team-row");
await rows[0].$eval(".tn-team-name", (el) => { el.value = "甲队"; });
await rows[1].$eval(".tn-team-name", (el) => { el.value = "乙队"; });
await rows[0].$eval(".tn-player-name", (el) => { el.value = "甲1"; });

await page.fill("#group-count", "4");
await page.locator("#group-count").dispatchEvent("change");
await page.waitForSelector(".tn-team-group", { timeout: 5000 });

// 增加到 4 队：分组数、队名、球员名都应保留
await page.fill("#team-count", "4");
await page.locator("#team-count").dispatchEvent("change");
await page.waitForFunction(() => document.querySelectorAll("#team-list .tn-team-row").length === 4, { timeout: 5000 });
const groupVal = await page.$eval("#group-count", (el) => el.value);
if (groupVal !== "4") { console.error("FAIL 分组数回退为", groupVal); process.exitCode = 1; }
else console.log("PASS 增队后分组数保留为 4");
const names = await page.$$eval("#team-list .tn-team-name", (els) => els.map((e) => e.value));
if (names[0] !== "甲队" || names[1] !== "乙队") { console.error("FAIL 队名丢失", JSON.stringify(names)); process.exitCode = 1; }
else console.log("PASS 增队后已填队名保留");
const playerName = await page.$eval("#team-list .tn-team-row .tn-player-name", (el) => el.value);
if (playerName !== "甲1") { console.error("FAIL 球员名丢失", playerName); process.exitCode = 1; }
else console.log("PASS 增队后已填球员名保留");

// 移除一队：其余输入仍保留
rows = await page.$$("#team-list .tn-team-row");
await rows[3].$eval("[data-remove-team]", (el) => el.click());
await page.waitForFunction(() => document.querySelectorAll("#team-list .tn-team-row").length === 3, { timeout: 5000 });
const names2 = await page.$$eval("#team-list .tn-team-name", (els) => els.map((e) => e.value));
if (names2[0] !== "甲队" || names2[1] !== "乙队") { console.error("FAIL 移除后队名丢失", JSON.stringify(names2)); process.exitCode = 1; }
else console.log("PASS 移除队伍后已填队名保留");
const groupVal2 = await page.$eval("#group-count", (el) => el.value);
if (groupVal2 !== "4") { console.error("FAIL 移除后分组数回退", groupVal2); process.exitCode = 1; }
else console.log("PASS 移除队伍后分组数保留为 4");

await browser.close();
if (process.exitCode) { console.error("teams edit FAILED"); process.exit(1); }
console.log("tournament teams edit flow passed.");
