import { resolve } from "node:path";
import { launchBrowser } from "./_browser.mjs";

const browser = await launchBrowser();

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4173/record/", { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await page.screenshot({ path: resolve(process.argv[2] || "assets/rules-selection.png"), fullPage: true });
  await context.close();
} finally {
  await browser.close();
}
