import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { launchBrowser } from "./_browser.mjs";
const browser = await launchBrowser();
const offline = process.argv.includes("--offline");
const base = offline ? pathToFileURL(resolve("output/Volley-Record-离线版.html")).href : process.env.CONSOLE_TEST_URL || "http://127.0.0.1:4174";
const url = (route, query = "") => offline ? `${base}?page=${route}${query ? `&${query}` : ""}` : `${base}/${route}/${query ? `?${query}` : ""}`;
const context = await browser.newContext({ acceptDownloads: true });
await context.addInitScript(() => { window.__VOLLEY_TEST__ = true; });
const page = await context.newPage(), errors = [];
page.on("pageerror", e => errors.push(e.message));
const ready = async (text) => { await page.getByText(text, { exact: true }).first().waitFor(); };
const settle = async p => p.evaluate(async () => { await window.__managedRecord?.flush(); });
const modalSubmit = async () => { await page.locator("#console-submit").click(); await page.locator("#console-form").waitFor({ state: "detached" }); };
try {
  await page.goto(url("console")); await ready("进入本机控制台");
  await page.locator("#enter-demo").click(); await ready("本机工作台");
  await page.goto(url("record", "mode=statistics"));
  await page.locator("#load-statistics-demo").click();
  await page.locator(".statistics-table").waitFor();
  const guest = await page.evaluate(() => localStorage.getItem("volley-record-statistics-v1"));
  await page.getByText("另存到控制台", { exact: true }).click(); await ready("确认另存为独立比赛");
  await page.getByText("确认另存为独立比赛", { exact: true }).click(); await ready("主队技术统计");
  let adopted = await page.evaluate(() => new URLSearchParams(location.search).get("id"));
  await page.getByText("主队技术统计", { exact: true }).click(); await page.locator(".statistics-table").waitFor(); await settle(page);
  assert.equal(await page.evaluate(() => localStorage.getItem("volley-record-statistics-v1")), guest);
  await page.getByText("返回比赛详情", { exact: true }).click(); await ready("客队技术统计");
  await page.getByText("客队技术统计", { exact: true }).click(); await page.locator("#statistics-form").waitFor();
  assert.equal(await page.locator('[name="homeTeam"]').isDisabled(), true);
  assert.equal(await page.locator('[name="teamSide"]').inputValue(), "away");
  await page.locator('[name="name-0"]').fill("客队一"); await page.locator('[name="number-0"]').fill("1"); await page.locator('[name="gender-0"]').selectOption("女");
  await page.locator('#statistics-form button[type="submit"]').click(); await page.locator(".statistics-table").waitFor(); await settle(page);
  assert.equal(await page.evaluate(() => window.__managedRecord.record.statistics.home.players[0].counts.attack.success), 14);
  assert.equal(await page.evaluate(() => window.__managedRecord.record.statistics.away.players[0].counts.attack.success), 0);
  const originalId = await page.evaluate(() => window.__managedRecord.record.id);
  await page.locator("#reset-app").click(); await page.locator("#console-form").waitFor();
  assert.equal(originalId, adopted); await page.locator("#console-cancel").click();
  await page.goto(url("console", "view=teams"));
  for (const name of ["测试主队", "测试客队"]) {
    await page.getByText("新建队伍", { exact: true }).click();
    await page.locator('#console-form [name="name"]').fill(name);
    await page.locator('#console-roster-file').setInputFiles({ name: "名单.csv", mimeType: "text/csv", buffer: Buffer.from("号码,姓名,性别,队长\n1,队员一,男,是\n2,队员二,女,\n3,队员三,男,\n4,队员四,女,\n5,队员五,男,\n6,队员六,女,") });
    await page.getByText("将预览名单带入表单", { exact: true }).click(); await modalSubmit();
  }
  await page.goto(url("console", "view=events")); await page.getByText("创建赛事", { exact: true }).click();
  await page.locator('#console-form [name="name"]').fill("验证联赛"); await page.locator('#console-form [name="startDate"]').fill("2026-10-14"); await page.locator('#console-form [name="venue"]').fill("体育馆"); await modalSubmit(); await ready("添加参赛队伍");
  for (const name of ["测试主队", "测试客队"]) {
    await page.getByText("添加参赛队伍", { exact: true }).click(); await page.locator('#console-form [name="team"]').selectOption({ label: name }); await modalSubmit();
  }
  await page.getByText("手动创建比赛", { exact: true }).click();
  await page.locator('#console-form [name="team-0"]').selectOption({ label: "测试主队" }); await page.locator('#console-form [name="team-1"]').selectOption({ label: "测试客队" });
  await page.locator('#console-form [name="scheduledTime"]').fill("19:00"); await page.locator('#console-form [name="city"]').fill("杭州"); await page.locator('#console-form [name="matchFormat"]').selectOption("3"); await modalSubmit(); await ready("填写比分");
  const matchId = await page.evaluate(() => new URLSearchParams(location.search).get("id"));
  await page.getByText("填写比分", { exact: true }).click();
  for (const i of [0, 1]) { await page.locator(`[name="score-${i}-0"]`).fill("25"); await page.locator(`[name="score-${i}-1"]`).fill("20"); await page.locator(`[name="ended-${i}"]`).check(); }
  await modalSubmit(); await page.getByText("确认比赛结束", { exact: true }).click(); await page.locator('[data-act="ok"]').click(); await ready("重新确认比赛结果");
  await page.getByText("主队技术统计", { exact: true }).click(); await page.locator("#statistics-form").waitFor(); await settle(page);
  assert.equal(await page.evaluate(() => window.__managedRecord.statistics.setScores[0][0]), "25");
  // Stale editor and failed storage must not overwrite another page's changes.
  const other = await context.newPage(); await other.goto(url("login")); await other.locator("#enter-demo").click(); await other.goto(url("record", `mode=statistics&match=${matchId}&side=away`)); await other.locator("#statistics-form").waitFor(); await settle(other);
  await page.locator('[name="name-0"]').fill("本页未保存的修改"); await settle(page).catch(() => {});
  assert.match(await page.locator("#save-label").textContent(), /未保存/);
  await other.close();
  page.on("dialog", d => d.accept()); await page.reload(); await page.locator("#statistics-form").waitFor(); await settle(page);
  await page.getByText("返回比赛详情", { exact: true }).click(); await ready("开始计分");
  await page.getByText("开始计分", { exact: true }).click(); await page.locator("#start-setup").waitFor(); await settle(page);
  // Existing engine still operates inside its own match envelope.
  await page.evaluate(() => { const s = window.__volley.getState(); s.meta.courtSwitchPolicy = "standard"; s.firstLineups = [["1", "2", "3", "4", "5", "6"], ["1", "2", "3", "4", "5", "6"]]; window.__volley.startMatch(); window.__volley.awardPoint(0); }); await settle(page);
  assert.equal(await page.evaluate(() => window.__managedRecord.record.meta.courtSwitchPolicy), "standard");
  await page.reload(); await page.locator(".scoreboard").waitFor(); await settle(page);
  assert.equal(await page.evaluate(() => window.__volley.getState().meta.courtSwitchPolicy), "standard", "Managed match keeps selected court policy after reload");
  assert.equal(await page.evaluate(() => window.__managedRecord.record.scoring.match.sets[0].score[0]), 1);
  assert.equal(await page.evaluate(() => localStorage.getItem("volley-record-statistics-v1")), guest);
  await page.getByText("返回比赛详情", { exact: true }).click(); await ready("主队技术统计");
  await page.getByText("主队技术统计", { exact: true }).click(); await page.locator("#statistics-form").waitFor(); await settle(page);
  assert.equal(await page.evaluate(() => window.__managedRecord.statistics.setScores[0][0]), "1");
  assert.equal(await page.evaluate(() => window.__managedRecord.hasOfficialScore()), true);
  await page.goto(url("console", "view=backup")); await ready("导出完整备份");
  const downloadPromise = page.waitForEvent("download"); await page.getByText("导出完整备份", { exact: true }).click(); const download = await downloadPromise;
  const backupPath = await download.path();
  await page.getByText("导入备份 / 单场记录", { exact: true }).click(); await page.locator("#console-import-file").setInputFiles(backupPath); await page.getByText(/确认后全部作为新增数据导入/).waitFor(); await modalSubmit();
  await page.goto(url("console", "view=matches")); await ready("创建比赛"); assert.equal(await page.locator(".console-card").count(), 4);
  await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => {}))));
  await mkdir("tmp/console-check", { recursive: true }); await page.screenshot({ path: `tmp/console-check/${offline ? "offline" : "web"}-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: `tmp/console-check/${offline ? "offline" : "web"}-mobile.png`, fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.getByText("退出控制台", { exact: true }).click(); await ready("进入本机控制台"); await page.goto(url("record", `mode=score&match=${matchId}`)); await ready("进入本机控制台");
  await page.goto(url("record", "mode=statistics")); await page.locator(".statistics-table").waitFor(); assert.equal(await page.evaluate(() => localStorage.getItem("volley-record-statistics-v1")), guest);
  assert.deepEqual(errors, []);
  console.log(`${offline ? "Offline" : "Web"} console flow passed: guard, guest copy, home/away isolation, team imports, events, shared score, conflict, backup roundtrip, mobile, logout.`);
} finally { await browser.close(); }
