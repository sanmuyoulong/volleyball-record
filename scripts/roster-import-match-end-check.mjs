import { deflateRawSync } from "node:zlib";
import { launchBrowser } from "./_browser.mjs";

const baseUrl = process.env.VOLLEY_URL || "http://127.0.0.1:4173/";

const u16 = value => [value & 255, (value >>> 8) & 255];
const u32 = value => [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255];

function storedZip(name, content) {
  const encoder = new TextEncoder();
  const fileName = encoder.encode(name);
  const data = encoder.encode(content);
  const compressed = deflateRawSync(data);
  const local = Uint8Array.from([
    ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(8), ...u16(0), ...u16(0), ...u32(0),
    ...u32(compressed.length), ...u32(data.length), ...u16(fileName.length), ...u16(0), ...fileName, ...compressed
  ]);
  const central = Uint8Array.from([
    ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(8), ...u16(0), ...u16(0), ...u32(0),
    ...u32(compressed.length), ...u32(data.length), ...u16(fileName.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(0), ...fileName
  ]);
  const eocd = Uint8Array.from([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(1), ...u16(1), ...u32(central.length), ...u32(local.length), ...u16(0)
  ]);
  return Buffer.concat([Buffer.from(local), Buffer.from(central), Buffer.from(eocd)]);
}

function inlineCell(reference, value) {
  const escaped = String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return `<c r="${reference}" t="inlineStr"><is><t>${escaped}</t></is></c>`;
}

function rosterXlsx() {
  const rows = [
    ["队伍名称", "主教练", "队长号码", "号码", "队员姓名", "自由人"],
    ...Array.from({ length: 7 }, (_, index) => ["北辰队", "陆教练", "11", String(index + 11), `北辰${index + 1}`, index === 6 ? "是" : ""])
  ];
  const xmlRows = rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => inlineCell(`${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}`, value)).join("")}</row>`).join("");
  return storedZip("xl/worksheets/sheet1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${xmlRows}</sheetData></worksheet>`);
}

const csv = "\uFEFF队伍名称,主教练,队长号码,号码,队员姓名,自由人\r\n" + Array.from({ length: 7 }, (_, index) => `海风队,秦教练,1,${index + 1},海风${index + 1},${index === 6 ? "是" : ""}`).join("\r\n");
const browser = await launchBrowser();

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on("console", message => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  page.on("pageerror", error => errors.push(`page: ${error.message}`));
  await page.addInitScript(() => localStorage.clear());
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator("#start-setup").click();
  await page.locator('[name="competition"]').fill("导入与结束确认测试赛");
  await page.locator('[name="scheduledTime"]').fill("18:30");
  await page.locator('[name="venue"]').fill("测试体育馆");
  await page.locator('[name="matchFormat"]').selectOption("5");
  await page.locator('[data-action="next"]').click();

  await page.locator('[data-action="import-roster"][data-team="0"]').click();
  await page.locator("#roster-file").setInputFiles({ name: "team-a.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.locator("#confirm-roster-import").click();
  if (await page.locator('[name="team-name-0"]').inputValue() !== "海风队") throw new Error("CSV team name was not imported");
  if (!await page.locator('[name="player-libero-0-6"]').isChecked()) throw new Error("CSV Libero marker was not imported");

  await page.locator('[data-action="import-roster"][data-team="1"]').click();
  await page.locator("#roster-file").setInputFiles({ name: "team-b.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: rosterXlsx() });
  await page.locator("#confirm-roster-import").click();
  if (await page.locator('[name="team-name-1"]').inputValue() !== "北辰队") throw new Error("XLSX team name was not imported");
  if (await page.locator('[name="captain-1"]').inputValue() !== "11") throw new Error("XLSX captain was not imported");

  await page.locator('[data-action="next"]').click();
  await page.locator('[name="firstReferee"]').fill("第一裁判");
  await page.locator('[name="secondReferee"]').fill("第二裁判");
  await page.locator('[name="scorer"]').fill("记录员");
  await page.locator('[data-action="next"]').click();
  const lineups = [["1", "2", "3", "4", "5", "6"], ["11", "12", "13", "14", "15", "16"]];
  for (let team = 0; team < 2; team += 1) {
    for (let position = 0; position < 6; position += 1) await page.locator(`[name="setup-lineup-${team}-${position}"]`).fill(lineups[team][position]);
  }
  await page.locator('[data-action="next"]').click();

  for (let setNumber = 1; setNumber <= 3; setNumber += 1) {
    for (let point = 0; point < 25; point += 1) await page.locator('[data-score-action="plus"][data-team="0"]').click();
    if (setNumber < 3) {
      await page.locator("#next-lineup").click();
      await page.locator("#start-next-set").click();
    }
  }
  await page.locator("#confirm-match-end").waitFor();
  const pending = await page.evaluate(() => JSON.parse(localStorage.getItem("volley-record-state-v1")).match);
  if (!pending.endingPending || pending.ended) throw new Error("Match was finalized before confirmation");
  if (!await page.locator("#confirm-match-end").isDisabled()) throw new Error("Match confirmation should require all checks");
  await page.locator("#review-result").click();
  if (!await page.locator('[data-score-action="confirm-end"]').isVisible()) throw new Error("Pending confirmation could not be reopened");
  if (await page.locator('[data-score-action="minus"][data-team="0"]').isDisabled()) throw new Error("Last point cannot be corrected while confirmation is pending");
  await page.locator('[data-score-action="confirm-end"]').click();
  for (const checkbox of await page.locator("[data-end-check]").all()) await checkbox.check();
  await page.locator("#end-confirmation-note").fill("自动化流程确认");
  await page.locator("#confirm-match-end").click();
  const finalized = await page.evaluate(() => JSON.parse(localStorage.getItem("volley-record-state-v1")).match);
  if (!finalized.ended || finalized.endingPending || finalized.endConfirmation?.note !== "自动化流程确认") throw new Error("Match confirmation was not persisted");
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("Roster CSV/XLSX import and match-end confirmation flow passed.");
  await context.close();
} finally {
  await browser.close();
}
