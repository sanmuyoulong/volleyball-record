import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { launchBrowser } from "./_browser.mjs";
const offline = process.argv.includes("--offline"), pdf = process.argv.includes("--pdf");
const base = offline ? pathToFileURL(resolve("output/Volley-Record-离线版.html")).href + "?page=record&mode=statistics" : `${process.env.VOLLEY_ORIGIN || "http://127.0.0.1:4174"}/record/?mode=statistics`;
const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
await context.addInitScript(() => { window.print = () => {}; });
const page = await context.newPage(), errors = [];
page.on("pageerror", e => errors.push(e.message));
const read = async () => page.evaluate(async () => {
  if (window.__managedRecord) { await window.__managedRecord.flush(); return window.__managedRecord.record.statistics[window.__managedRecord.side]; }
  return JSON.parse(localStorage.getItem("volley-record-statistics-v1"));
});
const snapshot = async () => { const d = await read(); return JSON.stringify([d.players, d.setterStatistics, d.attackAttribution.rows]); };
const select = async number => { await page.keyboard.type(number); await page.keyboard.press("Enter"); };
const attack = d => d.players[2].counts.attack.success;
try {
  await page.goto(base); await page.locator("#load-statistics-demo").click(); await page.locator(".statistics-table").waitFor();
  await page.locator('[data-capture-mode="quick"]').click(); await page.locator(".quick-recorder").waitFor();
  assert.equal(await page.locator(".statistics-sheet-scroll").isVisible(), false);
  const initial = attack(await read());
  await page.keyboard.press("j"); assert.equal(attack(await read()), initial);
  await page.locator("#active-setter").selectOption("0"); await page.locator("[data-capture-focus]").click();
  await select("3"); await page.keyboard.press("a"); await page.keyboard.press("j");
  assert.equal(attack(await read()), initial + 1);
  assert.equal((await read()).attackAttribution.rows[2].success.at(-1).setter, 0);
  await page.keyboard.down("j"); await page.keyboard.down("j"); await page.keyboard.up("j");
  assert.equal(attack(await read()), initial + 2);
  await page.locator("#active-setter").selectOption("1"); await page.locator("[data-capture-focus]").click(); await page.keyboard.press("Control+z");
  assert.equal(attack(await read()), initial + 1);
  assert.equal((await read()).attackAttribution.activeSetter, 1);
  const beforeInvalid = await snapshot();
  await page.keyboard.type("99"); await page.keyboard.press("j"); assert.equal(await snapshot(), beforeInvalid);
  await page.keyboard.press("Enter"); await page.keyboard.press("j"); assert.equal(await snapshot(), beforeInvalid);
  await page.keyboard.press("Escape");
  await select("12"); assert.equal((await read()).capture.selectedNumber, "12");
  await page.keyboard.press("r"); const reception = (await read()).players[11].counts.receive.normal;
  await page.keyboard.press("k"); assert.equal((await read()).players[11].counts.receive.normal, reception + 1);
  const beforeModal = await snapshot();
  await page.locator("#edit-statistics-signatures").click();
  await page.locator('#statistics-signatures-form input').first().fill("jkl123");
  await page.keyboard.press("Control+z"); assert.equal(await snapshot(), beforeModal);
  await page.locator("#close-statistics-signatures").focus(); await page.keyboard.press("j"); assert.equal(await snapshot(), beforeModal);
  await page.locator("#close-statistics-signatures").click();
  await page.locator("[data-capture-focus]").click(); await page.keyboard.press("e"); await select("1");
  const setter = (await read()).setterStatistics.players[0].counts.inSystem.success;
  await page.keyboard.press("j"); assert.equal((await read()).setterStatistics.players[0].counts.inSystem.success, setter + 1);
  await page.keyboard.press("Control+z"); assert.equal((await read()).setterStatistics.players[0].counts.inSystem.success, setter);
  await page.reload(); await page.locator(".quick-recorder").waitFor();
  assert.equal((await read()).capture.mode, "quick");
  await page.locator("#undo-statistic").click(); assert.equal((await read()).players[11].counts.receive.normal, reception);
  await page.locator('[data-capture-mode="table"]').click(); await page.locator(".statistics-table").waitFor();
  const beforeTableKey = await snapshot(); await page.keyboard.press("j"); assert.equal(await snapshot(), beforeTableKey);
  const minus = page.locator('[data-row="2"][data-group="attack"][data-outcome="success"][data-delta="-1"]');
  const beforeMinus = (await read()).attackAttribution.rows[2].success;
  await minus.click(); assert.equal(attack(await read()), initial);
  await page.locator("#undo-statistic").click(); assert.equal(attack(await read()), initial + 1);
  assert.deepEqual((await read()).attackAttribution.rows[2].success, beforeMinus);
  await page.locator('[data-capture-mode="quick"]').click(); await page.locator("[data-capture-group=attack]").click();
  await page.locator('[data-capture-player="2"]').click();
  // Capture both modes from the same data; the live input panels must never print.
  await mkdir("tmp/quick-check", { recursive: true });
  const prefix = offline ? "offline" : "web";
  await page.locator(".quick-recorder").screenshot({ path: `tmp/quick-check/${prefix}-desktop.png`, animations: "disabled" });
  if (pdf) {
    await page.locator("#print-statistics").click();
    await page.pdf({ path: "tmp/quick-check/quick.pdf", format: "A4", landscape: true, preferCSSPageSize: true, printBackground: true });
    await page.locator('[data-capture-mode="table"]').click();
    await page.pdf({ path: "tmp/quick-check/table.pdf", format: "A4", landscape: true, preferCSSPageSize: true, printBackground: true });
    await page.locator('[data-capture-mode="quick"]').click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator(".quick-recorder").screenshot({ path: `tmp/quick-check/${prefix}-mobile.png`, animations: "disabled" });
  // Copying into the console keeps the recording mode and correction history, without touching the guest draft.
  const guest = await snapshot();
  await page.getByText("另存到控制台", { exact: true }).click(); await page.locator("#enter-demo").click();
  await page.getByText("确认另存为独立比赛", { exact: true }).click(); await page.getByText("主队技术统计", { exact: true }).click();
  await page.locator(".quick-recorder").waitFor();
  assert.equal(await snapshot(), guest);
  await page.locator("#undo-statistic").click(); assert.equal(attack(await read()), initial);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("volley-record-statistics-v1")).players[2].counts.attack.success), initial + 1);
  assert.deepEqual(errors, []);
  console.log(`${prefix} quick recording passed: keyboard selection, repeated-key guard, invalid number, input/modal guard, setter counts, persisted history, table corrections, mobile, managed match isolation${pdf ? ", PDF" : ""}.`);
} finally { await browser.close(); }
