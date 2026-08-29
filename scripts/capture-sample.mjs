import { resolve } from "node:path";
import { launchBrowser } from "./_browser.mjs";

const browser = await launchBrowser();

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4173/record/", { waitUntil: "networkidle" });
  await page.locator("#load-demo").click();
  await page.locator(".scoreboard").waitFor();
  await page.waitForTimeout(900);
  await page.screenshot({ path: resolve(process.argv[2] || "assets/sample-page.png"), fullPage: true });
  await context.close();
} finally {
  await browser.close();
}
