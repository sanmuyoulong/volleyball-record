import { launchBrowser } from "./_browser.mjs";

const browser = await launchBrowser();

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:4173/record/", { waitUntil: "networkidle" });
  await page.locator(".landing").evaluate(element => { element.dataset.stabilityProbe = "landing"; });
  await page.locator('[data-profile="test2026"]').click();
  if (await page.locator(".landing").getAttribute("data-stability-probe") !== "landing") throw new Error("Rule selection replaced the landing page root");
  await page.locator('[data-profile="official"]').click();
  await page.locator("#contact-developer").click();
  if (!await page.getByText("2318390047@qq.com", { exact: true }).isVisible()) throw new Error("Contact email is missing");
  if (!await page.getByText("目前仍在测试中", { exact: false }).isVisible()) throw new Error("Contact testing notice is missing");
  const contactHref = await page.getByRole("link", { name: "发送邮件" }).getAttribute("href");
  if (!contactHref?.startsWith("mailto:2318390047@qq.com")) throw new Error(`Unexpected contact link: ${contactHref}`);
  await page.locator("#cancel-contact").click();
  await page.locator("#start-setup").click();
  await page.locator(".setup-layout").evaluate(element => { element.dataset.stabilityProbe = "setup"; });
  const assertSetupRootStable = async label => {
    if (await page.locator(".setup-layout").getAttribute("data-stability-probe") !== "setup") throw new Error(`${label} replaced the setup page root`);
  };
  await page.locator('[name="competition"]').fill("流程测试赛");
  await page.locator('[name="scheduledTime"]').fill("18:30");
  await page.locator('[name="venue"]').fill("测试体育馆");
  await page.locator('[name="matchFormat"]').selectOption("3");
  await page.locator('[data-action="next"]').click();
  await assertSetupRootStable("Match info step");
  await page.locator('[data-action="demo-roster"]').click();
  await assertSetupRootStable("Demo roster action");
  await page.locator('[data-action="next"]').click();
  await assertSetupRootStable("Roster step");
  await page.locator('[name="firstReferee"]').fill("第一裁判");
  await page.locator('[name="secondReferee"]').fill("第二裁判");
  await page.locator('[name="scorer"]').fill("记录员");
  await page.locator('[data-action="next"]').click();
  await assertSetupRootStable("Officials step");
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
