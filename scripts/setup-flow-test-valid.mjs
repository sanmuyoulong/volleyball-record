import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/23183/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
  await page.locator('[data-profile="official"]').click();
  await page.locator("#start-setup").click();
  await page.locator('[name="competition"]').fill("流程测试赛");
  await page.locator('[name="scheduledTime"]').fill("18:30");
  await page.locator('[name="venue"]').fill("测试体育馆");
  await page.locator('[name="matchFormat"]').selectOption("3");
  await page.locator('[data-action="next"]').click();
  await page.locator('[data-action="demo-roster"]').click();
  await page.locator('[data-action="next"]').click();
  await page.locator('[name="firstReferee"]').fill("第一裁判");
  await page.locator('[name="secondReferee"]').fill("第二裁判");
  await page.locator('[name="scorer"]').fill("记录员");
  await page.locator('[data-action="next"]').click();
  const lineups = [["1","2","3","4","5","7"], ["1","2","3","4","6","7"]];
  for (let team = 0; team < 2; team += 1) {
    for (let position = 0; position < 6; position += 1) {
      await page.locator(`[name="setup-lineup-${team}-${position}"]`).fill(lineups[team][position]);
    }
  }
  await page.locator('[data-action="next"]').click();
  await page.locator(".scoreboard").waitFor();
  const scores = await page.locator(".big-score").allTextContents();
  if (scores.join(":") !== "0:0") throw new Error(`Initial score mismatch: ${scores.join(":")}`);
  if (!await page.getByText("2025–2028 正式基线").first().isVisible()) throw new Error("Official rule badge missing");
  if (!await page.getByText("三局两胜").first().isVisible()) throw new Error("Best-of-three format missing from score page");
  const matchFormat = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("volley-record-state-v1"));
    return [saved.match.maxSets, saved.match.setsToWin];
  });
  if (matchFormat.join(":") !== "3:2") throw new Error(`Best-of-three state mismatch: ${matchFormat.join(":")}`);
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("Official-rule blank setup flow passed.");
  await context.close();
} finally {
  await browser.close();
}
