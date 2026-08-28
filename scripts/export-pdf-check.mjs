import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/23183/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const baseUrl = process.env.VOLLEY_URL || "http://127.0.0.1:4173/";
const outputPath = resolve(process.argv[2] || "output/pdf/volleyball-match-record-sample.pdf");
await mkdir(dirname(outputPath), { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe"
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("console", message => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  page.on("pageerror", error => errors.push(`page: ${error.message}`));
  await page.addInitScript(() => {
    window.print = () => { window.__VOLLEY_PRINT_CALLED__ = true; };
  });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator("#load-demo").click();
  for (let i = 0; i < 17; i += 1) await page.locator('[data-score-action="plus"][data-team="0"]').click();
  await page.locator("#next-lineup").click();
  await page.locator("#start-next-set").click();
  for (let i = 0; i < 3; i += 1) await page.locator('[data-score-action="plus"][data-team="1"]').click();
  for (let i = 0; i < 2; i += 1) await page.locator('[data-score-action="plus"][data-team="0"]').click();
  await page.locator('[data-score-action="print"]').click();
  await page.locator("#print-document").waitFor({ state: "attached" });
  await page.waitForFunction(() => window.__VOLLEY_PRINT_CALLED__ === true);
  const setPageCount = await page.locator(".print-set-page").count();
  if (setPageCount !== 2) throw new Error(`Expected 2 set pages, got ${setPageCount}`);
  const printText = await page.locator("#print-document").innerText();
  if (!printText.includes("排球比赛完整记录")) throw new Error("PDF overview page missing");
  if (!printText.includes("秦牧")) throw new Error("Coach missing from PDF document");
  if (errors.length) throw new Error(errors.join("\n"));
  await page.pdf({
    path: outputPath,
    format: "A4",
    landscape: true,
    printBackground: true,
    preferCSSPageSize: true
  });
  console.log(`Full-match PDF export passed: ${outputPath}`);
} finally {
  await browser.close();
}
