import { resolve } from "node:path";
import { launchBrowser } from "./_browser.mjs";

const baseUrl = process.env.VOLLEY_URL || "http://127.0.0.1:4173/";
const screenshotPath = resolve(process.argv[2] || "sample-page.png");
const browser = await launchBrowser();
const errors = [];

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on("console", message => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  page.on("pageerror", error => errors.push(`page: ${error.message}`));
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator("#load-demo").click();
  await page.locator(".scoreboard").waitFor();
  await page.locator(".score-page").evaluate(element => { element.dataset.stabilityProbe = "score"; });
  const scores = await page.locator(".big-score").allTextContents();
  if (scores.join(":") !== "8:6") throw new Error(`Demo score mismatch: ${scores.join(":")}`);
  await page.locator('[data-score-action="plus"][data-team="0"]').click();
  if (await page.locator(".score-page").getAttribute("data-stability-probe") !== "score") throw new Error("Score action replaced the score page root");
  await page.locator('[data-score-action="minus"][data-team="0"]').click();
  if (await page.locator(".score-page").getAttribute("data-stability-probe") !== "score") throw new Error("Undo action replaced the score page root");
  const restoredScores = await page.locator(".big-score").allTextContents();
  if (restoredScores.join(":") !== "8:6") throw new Error(`Undo mismatch: ${restoredScores.join(":")}`);
  await page.locator('[data-score-action="timeout"][data-team="0"]').click();
  await page.locator("#timeout-count").waitFor();
  await page.locator("#end-timeout").click();
  await page.locator('[data-score-action="substitution"][data-team="1"]').click();
  await page.locator("#sub-out").selectOption("7");
  await page.locator("#sub-in").selectOption("8");
  await page.locator("#confirm-sub").click();
  await page.locator(".sheet-shell").waitFor();
  for (let i = 0; i < 17; i += 1) await page.locator('[data-score-action="plus"][data-team="0"]').click();
  await page.locator("#next-lineup").waitFor();
  if (!await page.getByText("填写第 2 局位置轮次表").isVisible()) throw new Error("Next-set prompt did not appear");
  if (!await page.locator(".set-history.compact").getByText("第 1 局").isVisible()) throw new Error("Completed-set score missing from the set-end prompt");
  await page.locator("#next-lineup").click();
  await page.locator("#start-next-set").click();
  await page.locator(".scoreboard .set-history-item").waitFor();
  const historyText = await page.locator(".scoreboard .set-history-item").innerText();
  if (!historyText.includes("第 1 局") || !historyText.includes("25 : 6")) throw new Error(`Previous-set score mismatch: ${historyText}`);
  if (!await page.locator(".sheet-personnel").getByText("秦牧").isVisible()) throw new Error("Coach missing from score sheet");
  if (await page.locator(".sheet-player").count() < 12) throw new Error("Team rosters missing from score sheet");
  if (await page.locator(".sheet-lineup-summary").count() !== 2) throw new Error("Current-set lineups missing from score sheet");
  await context.close();

  const shotContext = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  const shotPage = await shotContext.newPage();
  shotPage.on("console", message => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  shotPage.on("pageerror", error => errors.push(`page: ${error.message}`));
  await shotPage.goto(baseUrl, { waitUntil: "networkidle" });
  await shotPage.locator("#load-demo").click();
  await shotPage.locator(".scoreboard").waitFor();
  for (let i = 0; i < 17; i += 1) await shotPage.locator('[data-score-action="plus"][data-team="0"]').click();
  await shotPage.locator("#next-lineup").click();
  await shotPage.locator("#start-next-set").click();
  await shotPage.locator(".scoreboard .set-history-item").waitFor();
  await shotPage.screenshot({ path: screenshotPath, fullPage: true });
  await shotContext.close();
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(`Visual flow passed. Screenshot: ${screenshotPath}`);
} finally {
  await browser.close();
}
