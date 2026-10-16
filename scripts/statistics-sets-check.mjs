import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { launchBrowser } from "./_browser.mjs";
const offline = process.argv.includes("--offline"), pdf = process.argv.includes("--pdf");
const url = offline ? pathToFileURL(resolve("output/Volley-Record-离线版.html")).href + "?page=record&mode=statistics" : `${process.env.VOLLEY_ORIGIN || "http://127.0.0.1:4174"}/record/?mode=statistics`;
const browser = await launchBrowser(), context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
await context.addInitScript(() => { window.print = () => {}; });
const page = await context.newPage(), errors = [];
page.on("pageerror", e => errors.push(e.message));
const read = async () => page.evaluate(async () => { if (window.__managedRecord) { await window.__managedRecord.flush(); return window.__managedRecord.record.statistics[window.__managedRecord.side]; } return JSON.parse(localStorage.getItem("volley-record-statistics-v1")); });
const choose = key => page.locator(`[data-statistics-set="${key}"]`).click();
try {
  await page.goto(url); await page.locator("#load-statistics-demo").click(); await page.locator(".statistics-table").waitFor();
  const baseline = (await read()).players[2].counts.attack.success;
  assert.equal((await read()).setStatistics.selected, "unassigned");
  await choose("1"); await page.locator('[data-capture-mode="quick"]').click();
  await page.locator("#active-setter").selectOption("0"); await page.locator('[data-capture-player="2"]').click();
  await page.keyboard.press("j"); await page.keyboard.press("j");
  let d = await read(); assert.equal(d.setStatistics.buckets["1"].players[2].attack.success, 2); assert.equal(d.players[2].counts.attack.success, baseline + 2);
  await page.locator('[data-capture-group="inSystem"]').click(); await page.locator('[data-capture-player="0"]').click(); await page.keyboard.press("j");
  await page.locator("#next-statistics-set").click(); await page.locator('[data-act="ok"]').click();
  assert.equal((await read()).setStatistics.selected, "2");
  await page.locator("#active-setter").selectOption("1"); await page.locator('[data-capture-group="attack"]').click(); await page.locator('[data-capture-player="2"]').click(); await page.keyboard.press("l");
  await page.locator('[data-capture-group="secondAttack"]').click(); await page.locator('[data-capture-player="1"]').click(); await page.keyboard.press("j");
  await choose("1"); await page.locator("#undo-statistic").click();
  d = await read(); assert.equal(d.setStatistics.selected, "2"); assert.equal(d.setStatistics.buckets["2"].setterPlayers[1].secondAttack.success, 0); assert.equal(d.setStatistics.buckets["1"].setterPlayers[0].inSystem.success, 1);
  await choose("all");
  assert.equal(await page.locator('[data-capture-outcome="success"]').isDisabled(), true);
  const allBefore = JSON.stringify((await read()).players); await page.locator("[data-capture-focus]").click(); await page.keyboard.press("j"); assert.equal(JSON.stringify((await read()).players), allBefore);
  await choose("1"); await page.locator('[data-capture-group="attack"]').click(); await page.locator('[data-capture-player="2"]').click();
  await page.locator('[data-capture-mode="table"]').click();
  assert.equal(await page.locator('[data-player-row="2"] [data-row-total="2-attack"]').textContent(), "2");
  await choose("2"); assert.equal(await page.locator('[data-player-row="2"] [data-row-total="2-attack"]').textContent(), "1");
  await page.reload(); await page.locator(".statistics-table").waitFor(); assert.equal((await read()).setStatistics.selected, "2");
  await page.locator("#data-manager").click(); const downloadPromise = page.waitForEvent("download"); await page.locator("#export-statistics").click(); const download = await downloadPromise; const path = await download.path(); await page.locator("#close-statistics-data").click();
  await page.locator('[data-row="2"][data-group="attack"][data-outcome="success"][data-delta="1"]').click();
  await page.locator("#data-manager").click(); await page.locator("#import-statistics").setInputFiles(path); await page.locator('[data-act="ok"]').click(); await page.locator(".statistics-table").waitFor();
  assert.equal((await read()).setStatistics.buckets["2"].players[2].attack.success, 0);
  const stress = process.argv.includes("--stress");
  if (stress) { for (const key of ["3", "4", "5"]) { await choose(key); await page.locator('[data-row="0"][data-group="serve"][data-outcome="success"][data-delta="1"]').click(); } await choose("2"); }
  await page.locator("#view-statistics-analysis").click();
  assert.equal(await page.locator(".statistics-analysis-modal .analysis-print-page").count(), stress ? 25 : 13);
  assert.equal(await page.locator(".statistics-analysis-modal .analysis-set-comparison tbody tr").count(), stress ? 6 : 3);
  assert.match(await page.locator(".statistics-analysis-modal").innerText(), /第1局.*全队概览/s);
  assert.match(await page.locator(".statistics-analysis-modal").innerText(), /第2局.*二传专项分析/s);
  await page.locator("#close-statistics-analysis").click();
  await mkdir("tmp/sets-check", { recursive: true });
  if (pdf) {
    await page.locator("#print-statistics").click(); await page.pdf({ path: "tmp/sets-check/sets-report.pdf", format: "A4", landscape: true, preferCSSPageSize: true, printBackground: true });
    // PDF beforeprint projects all-match B6 numbers; afterprint restores the selected set.
    assert.equal(await page.locator('[data-player-row="2"] [data-row-total="2-attack"]').textContent(), "1");
  }
  await page.screenshot({ path: `tmp/sets-check/${offline ? "offline" : "web"}-desktop.png`, fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator(".statistics-set-selector").screenshot({ path: `tmp/sets-check/${offline ? "offline" : "web"}-mobile.png`, animations: "disabled" });
  await page.getByText("另存到控制台", { exact: true }).click(); await page.locator("#enter-demo").click(); await page.getByText("确认另存为独立比赛", { exact: true }).click(); await page.getByText("主队技术统计", { exact: true }).click(); await page.locator(".statistics-table").waitFor();
  d = await read(); assert.equal(d.setStatistics.buckets["1"].players[2].attack.success, 2); assert.equal(d.setStatistics.buckets["2"].players[2].attack.error, 1);
  assert.deepEqual(errors, []);
  console.log(`${offline ? "Offline" : "Web"} per-set statistics passed: migration, five skills, setters, attribution, scope undo, totals readonly, backup, report, mobile, managed match${pdf ? ", PDF" : ""}.`);
} finally { await browser.close(); }
