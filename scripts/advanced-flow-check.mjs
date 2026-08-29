import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { launchBrowser } from "./_browser.mjs";

const baseUrl = process.env.VOLLEY_URL || "http://127.0.0.1:4173/";
const exportPath = resolve("tmp/advanced-flow-export.json");
await mkdir(resolve("tmp"), { recursive: true });

const browser = await launchBrowser();

try {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on("console", message => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  page.on("pageerror", error => errors.push(`page: ${error.message}`));
  page.on("dialog", dialog => dialog.accept());
  await page.addInitScript(() => localStorage.clear());
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator("#load-demo").click();

  await page.locator('[data-score-action="libero"][data-team="0"]').click();
  await page.locator("#libero-regular").selectOption("5");
  await page.locator("#libero-in").selectOption("6");
  await page.locator("#confirm-libero").click();
  let activeLibero = await page.evaluate(() => JSON.parse(localStorage.getItem("volley-record-state-v1")).match.sets[0].liberoState[0].active?.libero);
  if (activeLibero !== "6") throw new Error(`Libero entry failed: ${activeLibero}`);

  await page.locator('[data-score-action="libero"][data-team="0"]').click();
  if (!await page.locator("#confirm-libero").isDisabled()) throw new Error("Libero replacement was not blocked before a completed rally");
  await page.locator("#close-modal").click();
  await page.locator('[data-score-action="plus"][data-team="1"]').click();
  await page.locator('[data-score-action="libero"][data-team="0"]').click();
  await page.locator("#confirm-libero").click();
  const liberoRecords = await page.evaluate(() => JSON.parse(localStorage.getItem("volley-record-state-v1")).match.sets[0].liberoReplacements[0].length);
  if (liberoRecords !== 2) throw new Error(`Expected 2 Libero records, got ${liberoRecords}`);

  await page.locator('[data-score-action="libero"][data-team="0"]').click();
  await page.locator("#open-libero-redesignation").click();
  await page.locator("#unavailable-libero").selectOption("6");
  await page.locator("#libero-unavailable-reason").fill("受伤");
  await page.locator("#confirm-redesignation").click();
  await page.locator('[data-score-action="libero"][data-team="0"]').click();
  await page.locator("#open-libero-redesignation").click();
  await page.locator("#unavailable-libero").selectOption("10");
  await page.locator("#redesignated-libero").selectOption("1");
  await page.locator("#libero-unavailable-reason").fill("患病");
  await page.locator("#confirm-redesignation").click();
  const redesignation = await page.evaluate(() => JSON.parse(localStorage.getItem("volley-record-state-v1")).match.liberoControl[0]);
  if (redesignation.unavailable.join(":") !== "6:10" || redesignation.redesignations.at(-1)?.number !== "1") throw new Error("Libero re-designation state mismatch");

  for (let index = 0; index < 2; index += 1) {
    await page.locator('[data-score-action="sanction"]').click();
    await page.locator("#sanction-team").selectOption("1");
    await page.locator("#sanction-kind").selectOption("delay");
    await page.locator("#sanction-target").fill("主教练");
    await page.locator("#sanction-note").fill(index === 0 ? "首次延误" : "再次延误");
    await page.locator("#confirm-sanction").click();
  }
  let scores = await page.locator(".big-score").allTextContents();
  if (scores.join(":") !== "9:7") throw new Error(`Delay penalty score mismatch: ${scores.join(":")}`);

  await page.locator('[data-score-action="audit"]').click();
  await page.locator("#correction-reason").fill("测试撤销重复延误判罚");
  await page.locator("#reverse-action").click();
  scores = await page.locator(".big-score").allTextContents();
  if (scores.join(":") !== "8:7") throw new Error(`Audit rollback score mismatch: ${scores.join(":")}`);
  const auditState = await page.evaluate(() => JSON.parse(localStorage.getItem("volley-record-state-v1")).match);
  if (auditState.sanctions.length !== 1 || !auditState.auditLog.some(entry => entry.type === "correction")) throw new Error("Audit correction did not preserve the expected log and sanction state");

  await page.locator("#data-manager").click();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#export-json").click();
  const download = await downloadPromise;
  await download.saveAs(exportPath);
  await page.locator("#close-modal").click();
  await page.locator('[data-score-action="plus"][data-team="0"]').click();
  await page.locator("#data-manager").click();
  await page.locator("#import-json-file").setInputFiles(exportPath);
  await page.locator(".scoreboard").waitFor();
  scores = await page.locator(".big-score").allTextContents();
  if (scores.join(":") !== "8:7") throw new Error(`JSON restore score mismatch: ${scores.join(":")}`);
  const exported = JSON.parse(await readFile(exportPath, "utf8"));
  if (exported.schemaVersion !== 2 || !exported.state.match.auditLog.length) throw new Error("Exported JSON is missing schema or audit data");
  const snapshotCount = await page.evaluate(() => JSON.parse(localStorage.getItem("volley-record-recovery-v1") || "[]").length);
  if (!snapshotCount) throw new Error("Recovery snapshots were not created");
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("Advanced flow passed: Libero, sanctions, audit rollback, JSON export/import, recovery snapshots.");
  await context.close();
} finally {
  await browser.close();
}
