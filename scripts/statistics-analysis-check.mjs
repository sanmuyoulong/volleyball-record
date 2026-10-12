import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { launchBrowser } from "./_browser.mjs";
import { initialStatistics, GROUPS } from "../src/statistics-state.js";
import { buildStatisticsAnalysis, formatPercentage } from "../src/statistics-analysis.js";

const origin = process.env.VOLLEY_ORIGIN || "http://127.0.0.1:4173";
const data = initialStatistics();
data.screen = "table";
Object.assign(data.meta, { competition: "校园排球联赛·技术统计与赛后分析测试", matchNo: "第 6 场", homeTeam: "海风队", awayTeam: "山城队", gender: "混合", city: "上海", venue: "大学体育馆", statistician: "王明", representative: "陈华", winner: "home" });
data.setScores = [["25", "20"], ["21", "25"], ["25", "19"], ["25", "22"], ["", ""]];
data.completedSets = [true, true, true, true, false];
data.players.forEach((p, index) => {
  Object.assign(p, { name: index === 0 ? "张三" : index === 1 ? "李四" : `队员${index + 1}`, number: String(index + 1), gender: index % 2 ? "女" : "男" });
  if (index === 13) return;
  GROUPS.forEach(g => Object.assign(p.counts[g.key], { success: index % 4 + 1, normal: 5 - index % 4, error: index % 3 }));
});
await mkdir("tmp/statistics-analysis-check", { recursive: true });
const browser = await launchBrowser();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(saved => {
    localStorage.setItem("volley-record-statistics-v1", JSON.stringify(saved));
    window.__PRINT_COUNT__ = 0;
    window.print = () => window.__PRINT_COUNT__++;
  }, data);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${origin}/record/?mode=statistics`);
  const initialStorage = await page.evaluate(() => localStorage.getItem("volley-record-statistics-v1"));
  await page.locator("#view-statistics-analysis").click();
  assert.equal(await page.locator(".statistics-analysis-modal .analysis-print-page").count(), 2);
  assert.equal(await page.locator(".statistics-analysis-modal .analysis-player-table tbody tr").count(), 14);
  assert.match(await page.locator(".statistics-analysis-modal .analysis-heading").first().innerText(), /海风队/);
  assert.equal(await page.evaluate(() => localStorage.getItem("volley-record-statistics-v1")), initialStorage);
  const model = buildStatisticsAnalysis(data);
  for (let index = 0; index < GROUPS.length; index++) {
    const text = await page.locator(".statistics-analysis-modal .analysis-team-table tbody tr").nth(index).innerText();
    assert.match(text, new RegExp(formatPercentage(model.groups[index].successRate).replace(".", "\\.")));
  }
  assert.match(await page.locator(".statistics-analysis-modal .analysis-player-table tbody tr").last().innerText(), /—/);
  await page.screenshot({ path: "tmp/statistics-analysis-check/preview.png", fullPage: true, animations: "disabled" });
  await page.locator("#print-statistics-analysis").click();
  assert.equal(await page.locator(".statistics-analysis-modal").count(), 0);
  assert.equal(await page.evaluate(() => window.__PRINT_COUNT__), 1);
  const minus = page.locator('[data-row="0"][data-group="attack"][data-outcome="success"][data-delta="-1"]');
  await minus.click();
  data.players[0].counts.attack.success--;
  await page.locator("#print-statistics").click();
  assert.equal(await page.evaluate(() => window.__PRINT_COUNT__), 2);
  const points = buildStatisticsAnalysis(data).points;
  assert.equal(await page.locator("#statistics-analysis-print .analysis-summary strong").first().innerText(), String(points));
  await page.pdf({ path: "tmp/statistics-analysis-check/statistics-and-analysis.pdf", preferCSSPageSize: true, printBackground: true });
  await page.emulateMedia({ media: "print" });
  assert.equal(await page.locator("#statistics-analysis-print").isVisible(), true);
  assert.equal(await page.locator(".statistics-toolbar").isVisible(), false);
  const sizes = await page.locator("#statistics-analysis-print .analysis-print-page").evaluateAll(pages => pages.map(p => ({ width: p.scrollWidth, height: p.scrollHeight })));
  assert.ok(sizes.every(p => p.height < 755), "Each analysis page must fit an A4 landscape page");
  console.log("Report page dimensions: " + JSON.stringify(sizes));
  await page.emulateMedia({ media: "screen" });
  assert.equal(await page.locator("#statistics-analysis-print").isVisible(), false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#view-statistics-analysis").click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const modalWidth = await page.locator(".statistics-analysis-modal").evaluate(p => p.clientWidth);
  assert.ok(modalWidth <= 390);
  await page.screenshot({ path: "tmp/statistics-analysis-check/mobile.png", fullPage: true, animations: "disabled" });
  await page.locator("#close-statistics-analysis").click();
  await page.emulateMedia({ media: "print" });
  await page.pdf({ path: "tmp/statistics-analysis-check/statistics-and-analysis.pdf", preferCSSPageSize: true, printBackground: true });
  assert.deepEqual(errors, []);
  await context.close();

  const empty = initialStatistics();
  Object.assign(empty.meta, data.meta);
  Object.assign(empty.players[0], { name: "空记录队员", number: "7", gender: "女" });
  empty.screen = "table";
  const emptyContext = await browser.newContext();
  await emptyContext.addInitScript(saved => localStorage.setItem("volley-record-statistics-v1", JSON.stringify(saved)), empty);
  const emptyPage = await emptyContext.newPage();
  await emptyPage.goto(`${origin}/record/?mode=statistics`);
  await emptyPage.locator("#view-statistics-analysis").click();
  const emptyText = await emptyPage.locator(".statistics-analysis-modal").innerText();
  assert.match(emptyText, /暂无得分记录/);
  assert.doesNotMatch(emptyText, /NaN|Infinity|得分领先/);
  await emptyPage.pdf({ path: "tmp/statistics-analysis-check/empty-analysis.pdf", preferCSSPageSize: true, printBackground: true });
  console.log("Statistics analysis passed: weighted rates, roster/ties/zero data, live corrections, original sheet plus report print, modal preview, unchanged saved data and mobile.");
} finally { await browser.close(); }
