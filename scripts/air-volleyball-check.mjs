import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { launchBrowser } from "./_browser.mjs";

const offline = process.argv.includes("--offline");
const suffix = offline ? "offline" : "web";
const url = offline
  ? `${pathToFileURL(resolve("output/Volley-Record-离线版.html"))}?page=record&mode=score`
  : process.env.VOLLEY_URL || "http://127.0.0.1:4173/record/?mode=score";
const browser = await launchBrowser();
await mkdir("tmp/air-volleyball", { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true, offline });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("dialog", d => d.accept());
  await page.addInitScript(() => { window.__VOLLEY_TEST__ = true; window.__VOLLEY_PDF_TEST__ = true; });
  await page.goto(url);
  const snapshot = async () => {
    await page.waitForFunction(() => Boolean(window.__volley));
    return page.evaluate(() => structuredClone(window.__volley.getState()));
  };
  const action = (name, team = 0) => page.locator(`[data-score-action="${name}"][data-team="${team}"]`);
  const next = () => page.locator('[data-action="next"]').click();
  const points = async (team, count) => page.evaluate(({ team, count }) => {
    for (let i = 0; i < count; i++) window.__volley.awardPoint(team, i === count - 1);
  }, { team, count });
  await page.locator('[data-profile="air2026"]').click();
  await page.locator('[data-profile="official"]').click();
  assert.equal((await snapshot()).selectedRule, "modern");
  await page.locator('[data-profile="air2026"]').click();
  await page.reload();
  assert.equal(await page.locator('[data-profile="air2026"]').getAttribute("class"), "rule-card selected");
  await page.screenshot({ path: `tmp/air-volleyball/rules-${suffix}.png`, fullPage: true });
  await page.locator("#start-setup").click();
  assert.equal(await page.locator('[name="matchFormat"] option').count(), 1);
  await page.locator('[name="competition"]').fill("五人气排球验证赛");
  await page.locator('[name="scheduledTime"]').fill("19:30");
  await page.locator('[name="venue"]').fill("测试体育馆");
  await page.locator('[name="gender"]').selectOption("混合");
  await next();
  assert.equal(await page.locator('[name^="player-libero-"]').count(), 0);
  assert.equal(await page.locator('[name^="player-number-"]').count(), 20);
  // The downloadable template must itself be a valid five-player roster.
  const templateDownload = page.waitForEvent("download");
  await page.locator('[data-action="download-roster-template"]').click();
  const template = await templateDownload;
  const csv = await readFile(await template.path(), "utf8");
  assert.equal(csv.includes("自由人"), false);
  assert.equal(csv.trim().split(/\r?\n/).length, 6);
  for (let team = 0; team < 2; team++) {
    await page.locator(`[name="team-name-${team}"]`).fill(team ? "青禾队" : "海风队");
    const csvText = "号码,姓名,性别,队长\n" + Array.from({ length: 7 }, (_, i) => `${i + 1},队员${i + 1},${i < 3 ? "男" : "女"},${i === 0 ? "是" : ""}`).join("\n");
    await page.locator(`[data-action="import-roster"][data-team="${team}"]`).click();
    await page.locator("#roster-file").setInputFiles({ name: "气排球名单.csv", mimeType: "text/csv", buffer: Buffer.from(csvText) });
    await page.locator("#confirm-roster-import").click();
  }
  await next();
  for (const name of ["firstReferee", "secondReferee", "scorer"]) await page.locator(`[name="${name}"]`).fill("裁判员");
  await next();
  assert.equal(await page.locator(".court-position").count(), 10);
  for (let team = 0; team < 2; team++) for (let i = 0; i < 5; i++) await page.locator(`[name="setup-lineup-${team}-${i}"]`).fill(String(i + 1));
  await page.screenshot({ path: `tmp/air-volleyball/lineup-${suffix}.png`, fullPage: true });
  await next();
  assert.equal(await action("libero").count(), 0);
  assert.equal(await page.locator(".rotation-cell").count(), 10);
  assert.equal(await page.locator(".libero-control").count(), 0);
  await action("plus").click();
  await action("plus").click();
  assert.equal((await snapshot()).match.sets[0].rotationIndex[0], 2);
  await action("minus").click();
  assert.equal((await snapshot()).match.sets[0].rotationIndex[0], 1);
  await action("plus", 1).click();
  assert.deepEqual((await snapshot()).match.sets[0].rotationIndex, [1, 1]);
  for (const [out, incoming] of [["1", "6"], ["6", "7"], ["2", "1"], ["7", "6"], ["1", "2"], ["6", "7"]]) {
    await action("substitution").click();
    await page.locator("#sub-out").selectOption(out);
    await page.locator("#sub-in").selectOption(incoming);
    await page.locator("#confirm-sub").click();
    assert.equal(await page.locator("#confirm-sub").count(), 0);
  }
  assert.equal(await action("substitution").isDisabled(), true);
  for (let i = 0; i < 2; i++) {
    await action("timeout").click();
    assert.equal(await page.locator("#timeout-count").textContent(), "00:30");
    await page.locator("#end-timeout").click();
  }
  assert.equal(await action("timeout").isDisabled(), true);
  await page.reload();
  assert.equal((await snapshot()).selectedRule, "air");
  assert.deepEqual((await snapshot()).match.sets[0].rotationIndex, [1, 1]);
  for (let i = 0; i < 19; i++) { await points(0, 1); await points(1, 1); }
  await points(0, 1);
  assert.equal((await snapshot()).match.sets[0].ended, false); // 21:20
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `tmp/air-volleyball/mobile-${suffix}.png`, fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await points(0, 1); // 22:20
  await page.locator("#next-lineup").click();
  assert.equal(await page.locator('[name^="next-lineup-"]').count(), 10);
  await page.locator("#start-next-set").click();
  await points(1, 21);
  await page.locator("#next-lineup").click();
  await page.locator("#start-next-set").click();
  await points(0, 7);
  assert.equal((await snapshot()).match.sets[2].courtChanged, false);
  await points(0, 1);
  assert.equal((await snapshot()).match.sets[2].courtChanged, true);
  assert.match(await page.locator(".set-center").textContent(), /15/);
  await points(1, 14);
  await points(0, 7); // 15:14
  assert.equal((await snapshot()).match.sets[2].ended, false);
  await points(0, 1);
  await page.locator("#review-result").click();
  await action("minus").click();
  assert.equal((await snapshot()).match.sets[2].ended, false);
  await action("plus").click();
  await page.locator("#confirm-match-end").waitFor();
  for (const checkbox of await page.locator("[data-end-check]").all()) await checkbox.check();
  await page.locator("#confirm-match-end").click();
  await page.locator("#close-result").click();
  assert.equal((await snapshot()).match.ended, true);
  assert.deepEqual((await snapshot()).match.setsWon, [2, 1]);
  await page.locator('[data-score-action="print"]').click();
  assert.equal(await page.locator("#print-document .air-sheet").count(), 3);
  assert.equal(await page.locator("#print-document .rotation-cell").count(), 30);
  assert.equal(await page.locator("#print-document .libero-control").count(), 0);
  await page.emulateMedia({ media: "print" });
  const columns = await page.locator("#print-document .rotation-table").first().evaluate(e => getComputedStyle(e).gridTemplateColumns.split(" ").length);
  assert.equal(columns, 5);
  await page.pdf({ path: `tmp/air-volleyball/match-${suffix}.pdf`, format: "A4", landscape: true, printBackground: true });
  await page.screenshot({ path: `tmp/air-volleyball/print-${suffix}.png`, fullPage: true });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.emulateMedia({ media: "screen" });
  await page.locator("#data-manager").click();
  const downloadPending = page.waitForEvent("download");
  await page.locator("#export-json").click();
  const exported = await downloadPending;
  const payload = await readFile(await exported.path());
  assert.equal(JSON.parse(payload).state.selectedRule, "air");
  await page.locator("#import-json-file").setInputFiles({ name: "气排球.json", mimeType: "application/json", buffer: payload });
  await page.waitForFunction(() => !document.querySelector("#import-json-file"));
  assert.deepEqual((await snapshot()).match.sets.map(s => s.score), [[22, 20], [0, 21], [16, 14]]);
  assert.equal((await snapshot()).selectedRule, "air");
  // Managed matches share metadata with the console; changing rules must persist the format there too.
  const consoleURL = offline
    ? `${pathToFileURL(resolve("output/Volley-Record-离线版.html"))}?page=console&view=matches`
    : new URL("/console/?view=matches", url).href;
  await page.goto(consoleURL);
  await page.locator("#enter-demo").click();
  await page.goto(consoleURL);
  await page.getByText("创建比赛", { exact: true }).click();
  await page.locator('#console-form [name="competition"]').fill("控制台气排球验证赛");
  await page.locator('#console-form [name="scheduledTime"]').fill("19:30");
  await page.locator('#console-form [name="venue"]').fill("体育馆");
  await page.locator('#console-form [name="temporary-0"]').fill("控制台主队");
  await page.locator('#console-form [name="temporary-1"]').fill("控制台客队");
  await page.locator('#console-form [name="profile"]').selectOption("air2026");
  assert.equal(await page.locator('#console-form [name="matchFormat"]').inputValue(), "3");
  assert.equal(await page.locator('#console-form [name="matchFormat"]').isDisabled(), true);
  await page.locator("#console-submit").click();
  await page.getByText("开始计分", { exact: true }).click();
  await page.locator("#start-setup").waitFor();
  const settle = () => page.evaluate(() => window.__managedRecord.flush());
  await settle();
  assert.equal((await snapshot()).selectedRule, "air");
  await page.locator('[data-profile="official"]').click();
  await settle();
  assert.equal(await page.evaluate(() => window.__managedRecord.record.meta.matchFormat), "5");
  await page.locator('[data-profile="air2026"]').click();
  await settle();
  assert.equal(await page.evaluate(() => window.__managedRecord.record.meta.matchFormat), "3");
  await page.reload();
  await page.locator("#start-setup").click();
  await next();
  for (let team = 0; team < 2; team++) {
    await page.locator(`[name="captain-${team}"]`).fill("1");
    for (let i = 0; i < 5; i++) {
      await page.locator(`[name="player-number-${team}-${i}"]`).fill(String(i + 1));
      await page.locator(`[name="player-name-${team}-${i}"]`).fill(`队员${i + 1}`);
    }
  }
  await next();
  for (const name of ["firstReferee", "secondReferee", "scorer"]) await page.locator(`[name="${name}"]`).fill("裁判");
  await next();
  for (let team = 0; team < 2; team++) for (let i = 0; i < 5; i++) await page.locator(`[name="setup-lineup-${team}-${i}"]`).fill(String(i + 1));
  await next();
  await action("plus").click();
  await settle();
  await page.reload();
  assert.equal((await snapshot()).match.maxSets, 3);
  assert.equal((await snapshot()).match.sets[0].rotationIndex[0], 1);
  assert.equal(await page.locator(".rotation-cell").count(), 10);
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(`Air volleyball ${suffix} flow passed: setup, roster import, rotation, undo, substitutions, timeouts, deuce, deciding set, confirmation, JSON and print.`);
  await context.close();
} finally { await browser.close(); }
