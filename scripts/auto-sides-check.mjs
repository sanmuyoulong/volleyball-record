import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { launchBrowser } from "./_browser.mjs";

const offline = process.argv.includes("--offline");
const url = offline ? `${pathToFileURL(resolve("output/Volley-Record-离线版.html"))}?page=record&mode=score`
  : process.env.VOLLEY_URL || "http://127.0.0.1:4173/record/?mode=score";
const cases = [
  { profile: "official", maxSets: 5, left: [0, 1, 0, 1, 1], toss: "1" },
  { profile: "official", maxSets: 3, left: [1, 0, 0], toss: "0", initialManual: true },
  { profile: "test2026", maxSets: 5, left: [0, 0, 1, 1, 1] },
  { profile: "test2026", maxSets: 5, configured: "standard", left: [0, 1, 0, 1, 0], toss: "0" },
  { profile: "test2026", maxSets: 3, left: [0, 1, 1], toss: "1" },
  { profile: "air2026", maxSets: 3, left: [0, 1, 1], toss: "1" }
];
const browser = await launchBrowser();
try {
  for (const scenario of cases) {
    const context = await browser.newContext({ offline });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("dialog", d => d.accept());
    await page.addInitScript(() => { window.__VOLLEY_TEST__ = true; });
    await page.goto(url);
    await page.locator(`[data-profile="${scenario.profile}"]`).click();
    await page.locator("#load-demo").click();
    await page.evaluate(maxSets => {
      window.__volley.getState().meta.matchFormat = String(maxSets);
      window.__volley.startMatch();
    }, scenario.maxSets);
    const snapshot = () => page.evaluate(() => structuredClone(window.__volley.getState()));
    const order = () => page.locator(".scoreboard-top .team-score").evaluateAll(els => els.map(el => Number(el.dataset.team)));
    const swap = () => page.locator('[data-score-action="swap-sides"]').click();
    const plus = team => page.locator(`[data-score-action="plus"][data-team="${team}"]`).click();
    const minus = team => page.locator(`[data-score-action="minus"][data-team="${team}"]`).click();
    if (scenario.initialManual) await swap();
    if (scenario.configured) {
      await page.locator('[data-score-action="court-settings"]').click();
      await page.locator('[name="courtSwitchPolicy"]').selectOption(scenario.configured);
      await page.locator("#save-court-settings").click();
      await page.reload();
      await page.locator(".scoreboard").waitFor();
      assert.equal((await snapshot()).meta.courtSwitchPolicy, scenario.configured);
    }
    for (let n = 1; n < scenario.maxSets; n++) {
      assert.deepEqual(await order(), [scenario.left[n - 1], 1 - scenario.left[n - 1]], `Set ${n} opening court`);
      const winner = (n - 1) % 2;
      await page.evaluate(team => { for (let i = 0; i < 8; i++) window.__volley.awardPoint(team); }, winner);
      assert.deepEqual(await order(), [scenario.left[n - 1], 1 - scenario.left[n - 1]], "Ordinary set 8 points must not switch");
      await page.evaluate(team => {
        while (!window.__volley.getState().match.sets.at(-1).ended) window.__volley.awardPoint(team);
      }, winner);
      assert.deepEqual(await order(), [scenario.left[n - 1], 1 - scenario.left[n - 1]], "Keep ended-set courts until next set starts");
      await page.locator("#next-lineup").click();
      if (n + 1 === scenario.maxSets && scenario.toss !== undefined) {
        await page.locator("#start-next-set").click();
        assert.match(await page.locator("#modal-validation").textContent(), /掷币/);
        // Toss selection is an actual screen side, including after a manual calibration.
        await page.locator("#next-left-team").selectOption(scenario.toss);
      } else assert.equal(await page.locator("#next-left-team").count(), 0);
      await page.locator("#start-next-set").click();
      await page.locator("#start-next-set").waitFor({ state: "detached" });
    }
    const initial = scenario.left.at(-1);
    assert.deepEqual(await order(), [initial, 1 - initial]);
    await swap(); // manual offset and automatic transition must compose, including undo.
    const beforeEightOrder = [1 - initial, initial];
    await page.evaluate(() => {
      for (let i = 0; i < 7; i++) window.__volley.awardPoint(0);
      for (let i = 0; i < 7; i++) window.__volley.awardPoint(1);
    });
    assert.deepEqual(await order(), beforeEightOrder);
    const beforeEight = (await snapshot()).match.sets.at(-1);
    const manualBeforeEight = (await snapshot()).scoreSidesSwapped;
    await plus(1);
    assert.deepEqual(await order(), beforeEightOrder.toReversed());
    const afterEight = (await snapshot()).match.sets.at(-1);
    assert.deepEqual(afterEight.score, [7, 8]);
    assert.deepEqual(afterEight.onCourt, beforeEight.onCourt);
    assert.equal(afterEight.servingTeam, beforeEight.servingTeam);
    assert.deepEqual(afterEight.rotationIndex, scenario.profile === "air2026"
      ? [beforeEight.rotationIndex[0], (beforeEight.rotationIndex[1] + 1) % 5] : beforeEight.rotationIndex);
    assert.equal(afterEight.events.filter(e => e.text.includes("领先队达到 8 分")).length, 1);
    await page.reload();
    await page.locator(".scoreboard").waitFor();
    assert.deepEqual(await order(), beforeEightOrder.toReversed());
    await minus(1);
    assert.deepEqual(await order(), beforeEightOrder, "Undo crossing 8 restores courts");
    assert.equal((await snapshot()).scoreSidesSwapped, manualBeforeEight, "Undo retains manual calibration");
    await plus(1);
    await plus(1);
    assert.deepEqual(await order(), beforeEightOrder.toReversed(), "9 points must not switch again");
    await swap();
    await minus(1); // 9 back to 8: keep the automatic half-set change.
    assert.deepEqual(await order(), [1 - initial, initial]);
    await minus(1); // 8 back to 7: remove the automatic half-set change.
    assert.deepEqual(await order(), [initial, 1 - initial]);
    assert.deepEqual(errors, []);
    console.log(`${offline ? "Offline" : "Web"} ${scenario.profile}/${scenario.maxSets}/${scenario.configured || "default"}: all set intervals, toss, 8-point switch, undo, manual calibration and reload passed.`);
    await context.close();
  }
} finally { await browser.close(); }
