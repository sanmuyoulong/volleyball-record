import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { launchBrowser } from "./_browser.mjs";

const offline = process.argv.includes("--offline");
const url = offline
  ? `${pathToFileURL(resolve("output/Volley-Record-离线版.html"))}?page=record&mode=score`
  : process.env.VOLLEY_URL || "http://127.0.0.1:4173/record/?mode=score";
const browser = await launchBrowser();
try {
  for (const profile of ["official", "test2026", "air2026"]) {
    const air = profile === "air2026";
    const count = air ? 5 : 6;
    const context = await browser.newContext({ offline });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    await page.addInitScript(() => { window.__VOLLEY_TEST__ = true; });
    await page.goto(url);
    await page.locator(`[data-profile="${profile}"]`).click();
    await page.locator("#load-demo").click();
    await page.locator(".scoreboard").waitFor();
    const state = await page.evaluate(() => structuredClone(window.__volley.getState()));
    assert.equal(state.competitionProfile, profile);
    assert.equal(state.selectedRule, air ? "air" : "modern");
    assert.equal(state.match.maxSets, air ? 3 : 5);
    assert.equal(state.match.setsToWin, air ? 2 : 3);
    assert.deepEqual(state.match.sets[0].score, [8, 6]);
    assert.equal(await page.locator(".rotation-cell").count(), count * 2);
    for (let team = 0; team < 2; team++) {
      const set = state.match.sets[0];
      assert.equal(set.lineups[team].length, count);
      assert.equal(set.onCourt[team].length, count);
      assert.equal(set.serviceRounds[team].length, count);
      const roster = state.teams[team].roster;
      assert.equal(roster.length, air ? 10 : 14);
      assert.equal(set.lineups[team].every(n => roster.some(p => p.number === n && !p.libero)), true);
      if (air) assert.equal(roster.some(p => p.libero), false);
    }
    assert.equal(state.match.sets[0].subCount[0], 1);
    assert.equal(state.match.sets[0].timeouts[1].length, 1);
    assert.match(await page.locator('.action-button[data-score-action="substitution"]').first().textContent(), new RegExp(`1 / ${profile === "test2026" ? 8 : 6}`));
    assert.match(await page.locator(".set-center").textContent(), new RegExp(`目标 ${air ? 21 : 25} 分`));
    const serving = state.match.sets[0].servingTeam;
    const before = state.match.sets[0].rotationIndex[serving];
    await page.locator(`[data-score-action="plus"][data-team="${serving}"]`).click();
    const next = await page.evaluate(() => structuredClone(window.__volley.getState()));
    assert.equal(next.match.sets[0].rotationIndex[serving], air ? (before + 1) % count : before);
    await page.reload();
    await page.locator(".scoreboard").waitFor();
    assert.equal(await page.evaluate(() => window.__volley.getState().competitionProfile), profile);
    assert.equal(errors.length, 0, errors.join("\n"));
    console.log(`${offline ? "Offline" : "Web"} ${profile} demo passed: selected rule, roster, rotation, substitutions, timeouts and reload.`);
    await context.close();
  }
} finally { await browser.close(); }
