import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { deflateRawSync } from "node:zlib";
import { launchBrowser } from "./_browser.mjs";

const u16 = value => [value & 255, (value >>> 8) & 255];
const u32 = value => [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255];
function zip(entries) {
  const locals = [], directories = [];
  let offset = 0;
  for (const [path, text] of entries) {
    const name = Buffer.from(path), content = Buffer.from(text), compressed = deflateRawSync(content);
    const local = Buffer.from([...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(8), ...u16(0), ...u16(0), ...u32(0), ...u32(compressed.length), ...u32(content.length), ...u16(name.length), ...u16(0), ...name, ...compressed]);
    directories.push(Buffer.from([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(8), ...u16(0), ...u16(0), ...u32(0), ...u32(compressed.length), ...u32(content.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name]));
    locals.push(local);
    offset += local.length;
  }
  const directory = Buffer.concat(directories);
  return Buffer.concat([...locals, directory, Buffer.from([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length), ...u32(directory.length), ...u32(offset), ...u16(0)])]);
}
function rosterXlsx() {
  const rows = [["队伍名称", "号码", "队员姓名", "性别"], ["海风队", "9", "李四", "F"], ["海风队", "7", "张三", "男"], ["海风队", "2", "王五", "male"]];
  const strings = [...new Set(rows.flat())];
  const sheet = `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((row, i) => `<row r="${i + 1}">${row.map((value, column) => `<c r="${String.fromCharCode(65 + column)}${i + 1}" t="s"><v>${strings.indexOf(value)}</v></c>`).join("")}</row>`).join("")}</sheetData></worksheet>`;
  return zip([
    ["xl/workbook.xml", '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="名单" sheetId="2" r:id="rId2"/><sheet name="其他" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ["xl/_rels/workbook.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Target="worksheets/sheet2.xml"/><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'],
    ["xl/sharedStrings.xml", `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${strings.map(value => `<si><t>${value}</t></si>`).join("")}</sst>`],
    ["xl/worksheets/sheet2.xml", sheet],
    ["xl/worksheets/sheet1.xml", '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>']
  ]);
}

const browser = await launchBrowser();
const origin = process.env.VOLLEY_ORIGIN || "http://127.0.0.1:4173";
await mkdir("tmp/statistics-import-check", { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${origin}/record/?mode=statistics`);
  for (const [key, value] of Object.entries({ competition: "名单导入测试赛", matchNo: "8", homeTeam: "原主队", awayTeam: "山城队", city: "上海", venue: "大学体育馆" })) await page.locator(`[name="${key}"]`).fill(value);
  await page.locator("#stats-gender").selectOption({ label: "男女混合" });
  assert.equal(await page.locator('.statistics-roster-row select').count(), 14);
  const pendingDownload = page.waitForEvent("download");
  await page.locator("#download-statistics-roster-template").click();
  const download = await pendingDownload;
  await download.saveAs("tmp/statistics-import-check/template.csv");
  assert.match(await readFile("tmp/statistics-import-check/template.csv", "utf8"), /号码.*队员姓名/);
  assert.match(await readFile("tmp/statistics-import-check/template.csv", "utf8"), /性别/);
  assert.match(await readFile("tmp/statistics-import-check/template.csv", "utf8"), /队员二","女/);

  const open = () => page.locator("#import-statistics-roster").click();
  const upload = (text, name = "roster.csv") => page.locator("#roster-file").setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(text) });
  await open();
  await upload("姓名\n张三");
  await page.locator("#roster-import-result .validation-banner").waitFor();
  assert.equal(await page.locator("#confirm-roster-import").isDisabled(), true);
  await upload("号码,姓名\n7,张三\n007,李四");
  await page.locator("#roster-import-result .validation-banner").waitFor();
  assert.match(await page.locator("#roster-import-result").innerText(), /重复/);
  await upload("队伍名称,号码,队员姓名\n海风队,7,张三\n海风队,9,李四");
  await page.locator("#confirm-roster-import:enabled").waitFor();
  assert.match(await page.locator("#roster-import-result").innerText(), /2 名队员缺少性别/);
  assert.equal(await page.locator('[name="homeTeam"]').inputValue(), "原主队");
  await page.locator("#cancel-roster-import").click();
  assert.equal(await page.locator('[name="name-0"]').inputValue(), "");

  await open();
  await upload("队伍名称,号码,队员姓名\n海风队,7,张三\n海风队,9,李四");
  await page.locator("#confirm-roster-import").click();
  assert.equal(await page.locator('[name="homeTeam"]').inputValue(), "海风队");
  assert.equal(await page.locator('[name="awayTeam"]').inputValue(), "山城队");
  assert.equal(await page.locator('[name="name-0"]').inputValue(), "张三");
  assert.equal(await page.locator('[name="competition"]').inputValue(), "名单导入测试赛");
  await page.reload();
  assert.equal(await page.locator('[name="number-1"]').inputValue(), "9");
  await page.getByRole("button", { name: "开始技术统计" }).click();
  assert.match(await page.locator("#validation-slot").innerText(), /第 1 行.*性别/);
  await page.locator('[name="gender-0"]').selectOption("男");
  await page.locator('[name="gender-1"]').selectOption("女");
  await page.locator("#stats-gender").selectOption("女子");
  assert.equal(await page.locator('.statistics-roster-row select').count(), 0);
  await page.locator("#stats-gender").selectOption("混合");
  assert.equal(await page.locator('[name="gender-1"]').inputValue(), "女");
  assert.equal(await page.locator('[name="name-0"]').inputValue(), "张三");
  await page.getByRole("button", { name: "开始技术统计" }).click();
  assert.equal(await page.locator('[data-player-row="1"] .statistics-player-gender').innerText(), "女");
  await page.locator('[data-row="0"][data-group="serve"][data-outcome="success"][data-delta="1"]').click();
  await page.locator("#edit-statistics").click();
  const before = await page.evaluate(() => localStorage.getItem("volley-record-statistics-v1"));
  await open();
  await upload("号码,姓名\n9,李四");
  await page.locator("#roster-import-result .validation-banner").waitFor();
  assert.match(await page.locator("#roster-import-result").innerText(), /不能.*移除/);
  assert.equal(await page.evaluate(() => localStorage.getItem("volley-record-statistics-v1")), before);
  await page.locator("#roster-file").setInputFiles({ name: "roster.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: rosterXlsx() });
  await page.locator("#confirm-roster-import:enabled").waitFor();
  assert.match(await page.locator("#roster-import-result").innerText(), /保留 1 名/);
  await page.screenshot({ path: "tmp/statistics-import-check/preview.png", fullPage: true, animations: "disabled" });
  await page.locator("#confirm-roster-import").click();
  assert.equal(await page.locator('[name="name-0"]').inputValue(), "李四");
  assert.equal(await page.locator('[name="name-1"]').inputValue(), "张三");
  assert.equal(await page.locator('[name="name-2"]').inputValue(), "王五");
  assert.equal(await page.locator('[name="gender-0"]').inputValue(), "女");
  assert.equal(await page.locator('[name="gender-1"]').inputValue(), "男");
  assert.equal(await page.locator('[name="gender-2"]').inputValue(), "男");
  await page.getByRole("button", { name: "保存并返回统计表" }).click();
  assert.equal(await page.locator('[data-row-total="1-serve"]').innerText(), "1");
  assert.equal(await page.locator('[data-row-total="0-serve"]').innerText(), "0");
  assert.equal(await page.locator('[data-team-total="serve-total"]').innerText(), "1");
  await page.reload();
  assert.equal(await page.locator('[data-row-total="1-serve"]').innerText(), "1");
  assert.equal(await page.locator('[data-player-row="0"] .statistics-player-gender').innerText(), "女");
  assert.equal(await page.locator('[data-player-row="0"] > th, [data-player-row="0"] > td').count(), 22);
  await page.pdf({ path: "tmp/statistics-import-check/mixed.pdf", format: "A4", landscape: true });
  await page.locator("#edit-statistics").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#import-statistics-roster").scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await open();
  await upload("号码,姓名\n7,张三\n9,李四\n2,王五");
  await page.locator("#confirm-roster-import:enabled").waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: "tmp/statistics-import-check/mobile.png", fullPage: true, animations: "disabled" });
  await page.locator("#confirm-roster-import").click();
  assert.equal(await page.locator('[name="gender-0"]').inputValue(), "男");
  assert.equal(await page.locator('[name="gender-1"]').inputValue(), "女");
  assert.equal(await page.locator('[name="gender-2"]').inputValue(), "男");
  await page.screenshot({ path: "tmp/statistics-import-check/mobile-roster.png", fullPage: true, animations: "disabled" });
  assert.deepEqual(errors, []);
  console.log("Statistics roster import passed: CSV/XLSX workbook order and shared strings, mixed genders/template/validation/mode switches, preview/cancel, team names, retained counts and genders after reorder, reload, 22-column print and mobile.");
} finally {
  await browser.close();
}
