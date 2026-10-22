import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
    const context = await browser.newContext({ offline, acceptDownloads: true });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("dialog", dialog => dialog.accept());
    await page.addInitScript(() => { window.__VOLLEY_TEST__ = true; window.__VOLLEY_PDF_TEST__ = true; });
    await page.goto(url);
    await page.locator(`[data-profile="${profile}"]`).click();
    await page.locator("#load-demo").click();
    const order = () => page.locator(".scoreboard-top .team-score").evaluateAll(els => els.map(el => Number(el.dataset.team)));
    const snapshot = () => page.evaluate(() => structuredClone(window.__volley.getState()));
    const swap = () => page.locator('[data-score-action="swap-sides"]').click();
    const before = await snapshot();
    assert.deepEqual(await order(), [0, 1]);
    const sheet = await page.locator(".sheet-shell").innerHTML();
    await swap();
    assert.deepEqual(await order(), [1, 0]);
    const swapped = await snapshot();
    assert.deepEqual(swapped.match, before.match, "Swapping must not alter rallies, rotation, service or audit history");
    assert.deepEqual(swapped.teams, before.teams);
    assert.equal(await page.locator(".sheet-shell").innerHTML(), sheet, "Formal record keeps A/B order");
    for (const action of ["timeout", "substitution", ...(profile === "air2026" ? [] : ["libero"])]) {
      assert.deepEqual(await page.locator(`[data-score-action="${action}"]`).evaluateAll(els => els.map(el => Number(el.dataset.team))), [1, 0]);
    }
    const leftPlus = page.locator('.team-controls').first().locator('[data-score-action="plus"]');
    await leftPlus.click();
    assert.deepEqual((await snapshot()).match.sets[0].score, [8, 7], "Left button now scores for the away team");
    await swap();
    await page.locator('[data-score-action="minus"][data-team="1"]').click();
    assert.deepEqual((await snapshot()).match.sets[0].score, [8, 6]);
    assert.equal((await snapshot()).scoreSidesSwapped, false, "Undo must not restore an old screen orientation");
    await swap();
    await page.reload();
    await page.locator(".scoreboard").waitFor();
    assert.deepEqual(await order(), [1, 0], "Refresh preserves orientation");

    await page.locator("#data-manager").click();
    const downloadReady = page.waitForEvent("download");
    await page.locator("#export-json").click();
    const download = await downloadReady;
    const backupPath = await download.path();
    const backup = JSON.parse(await readFile(backupPath, "utf8"));
    assert.equal(backup.state.scoreSidesSwapped, true);
    await page.locator("#import-json-file").setInputFiles(backupPath);
    await page.locator("#close-modal").waitFor({ state: "detached" });
    assert.deepEqual(await order(), [1, 0], "Backup restore preserves orientation");
    await page.locator('[data-score-action="print"]').click();
    await page.locator("#print-document").waitFor({ state: "attached" });
    assert.deepEqual(await page.locator("#print-document .paper-team-name strong").allTextContents(), before.teams.map(team => team.name));
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    if (!offline && profile === "official") {
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        const button = page.locator('[data-score-action="swap-sides"]');
        await button.scrollIntoViewIfNeeded();
        const box = await button.boundingBox();
        assert(box && box.x >= 0 && box.x + box.width <= width);
        await page.screenshot({ path: `tmp/score-sides-${width}.png` });
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.evaluate(() => { while (!window.__volley.getState().match.sets[0].ended) window.__volley.awardPoint(0); });
      await page.locator("#next-lineup").click();
      await page.locator("#start-next-set").click();
      assert.match(await page.locator(".scoreboard .set-history-item").textContent(), /6\s*:\s*25/);
      assert.deepEqual(await order(), [1, 0], "Next set preserves the manual display choice");
    }
    // Older backups did not store the display preference.
    delete backup.state.scoreSidesSwapped;
    await page.locator("#data-manager").click();
    await page.locator("#import-json-file").setInputFiles({ name: "old-match.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });
    await page.locator("#close-modal").waitFor({ state: "detached" });
    assert.deepEqual(await order(), [0, 1]);
    assert.deepEqual(errors, []);
    console.log(`${offline ? "Offline" : "Web"} ${profile}: display swap, correct-team scoring, undo, reload, JSON, PDF order and legacy restore passed.`);
    await context.close();
  }
} finally { await browser.close(); }
