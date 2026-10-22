import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { launchBrowser } from "./_browser.mjs";

const offline = process.argv.includes("--offline");
const origin = process.env.VOLLEY_ORIGIN || "http://127.0.0.1:4174";
const file = pathToFileURL(resolve("output/Volley-Record-离线版.html"));
const route = (page, query = "") => offline
  ? `${file}?page=${page}${query ? `&${query}` : ""}`
  : `${origin}/${page === "home" ? "" : `${page}/`}${query ? `?${query}` : ""}`;
await mkdir("tmp/legal-check", { recursive: true });
const browser = await launchBrowser();
try {
  const context = await browser.newContext({ offline, viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => {
    window.__VOLLEY_PDF_TEST__ = true;
    window.print = () => {};
  });
  const page = await context.newPage(), errors = [], requests = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("request", r => { if (offline && /^https?:/.test(r.url())) requests.push(r.url()); });
  for (const [name, query] of [["home", ""], ["record", ""], ["record", "mode=score"], ["record", "mode=statistics"], ["login", ""], ["console", ""], ["help", ""], ...offline ? [] : [["help/tutorial", ""]]]) {
    await page.goto(route(name, query));
    await page.locator("#legal-notice").waitFor({ state: "attached" });
    assert.equal(await page.locator("#legal-notice").count(), 1);
    assert.equal(await page.locator("#legal-notice").evaluate(el => getComputedStyle(el).position), "static", "Screen notice stays in page flow");
    await page.locator("#legal-notice summary").click();
    const text = await page.locator("#legal-notice").innerText();
    for (const phrase of ["包括具有商业性质的赛事", "书面授权", "比赛数据与报告", "不自动上传", "未来收费与版本", "不属于 OSI"]) assert(text.includes(phrase), `${name}: ${phrase}`);
    assert(!text.includes("已开源"));
  }
  await page.goto(`${route("help")}#usage-copyright`);
  await page.waitForFunction(() => document.querySelector("#usage-copyright")?.open);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#legal-notice").scrollIntoViewIfNeeded();
  const box = await page.locator("#legal-notice").boundingBox();
  assert(box && box.x >= 0 && box.x + box.width <= 391);
  await page.screenshot({ path: `tmp/legal-check/${offline ? "offline" : "web"}-mobile.png`, fullPage: false });
  await page.setViewportSize({ width: 1440, height: 1000 });

  // PDF fixtures verify both printing paths; detailed terms must not fill report pages.
  for (const mode of ["score", "statistics"]) {
    await page.goto(route("record", `mode=${mode}`));
    await page.locator("#legal-notice").waitFor({ state: "attached" });
    await page.locator(mode === "score" ? "#load-demo" : "#load-statistics-demo").click();
    await page.locator("#legal-notice summary").click();
    await page.locator(mode === "score" ? '[data-score-action="print"]' : "#print-statistics").click();
    await page.emulateMedia({ media: "print" });
    assert.equal(await page.locator("#legal-notice").evaluate(el => getComputedStyle(el).display), "block");
    assert.equal(await page.locator("#legal-notice details").evaluate(el => getComputedStyle(el).display), "none");
    assert.equal(await page.locator(".legal-print-note").evaluate(el => getComputedStyle(el).display), "block");
    await page.pdf({ path: `tmp/legal-check/${offline ? "offline" : "web"}-${mode}.pdf`, format: "A4", landscape: true, printBackground: true, preferCSSPageSize: true });
    await page.emulateMedia({ media: "screen" });
    assert.equal(await page.locator("#legal-notice").count(), 1);
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, [], "Offline notice must not load remote assets");
  console.log(`${offline ? "Offline" : "Web"}: notices across routes, expandable terms, mobile, deep link, and scoring/statistics PDF fixtures passed.`);
} finally { await browser.close(); }
