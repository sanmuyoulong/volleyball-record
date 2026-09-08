// 混合比赛的性别链路验证：名单性别下拉 → 导入 → 记录页男女显示。
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { launchBrowser } from "./_browser.mjs";

const baseUrl = process.env.VOLLEY_URL || "http://127.0.0.1:4173/record/";
await mkdir(resolve("tmp"), { recursive: true });

const browser = await launchBrowser();

function check(label, condition, detail = "") {
  if (!condition) throw new Error(`${label}${detail ? ` — ${detail}` : ""}`);
  console.log(`PASS ${label}`);
}

try {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on("console", message => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  page.on("pageerror", error => errors.push(`page: ${error.message}`));
  page.on("dialog", dialog => dialog.accept());
  await page.addInitScript(() => localStorage.clear());
  await page.goto(baseUrl, { waitUntil: "networkidle" });

  // 进入赛前填写：规则选择 → 第 1 步比赛信息
  await page.locator("#start-setup").click();
  await page.locator('select[name="gender"]').selectOption("混合");
  await page.locator('input[name="competition"]').fill("混合性别验证赛");
  await page.locator('input[name="date"]').fill("2026-09-08");
  await page.locator('input[name="scheduledTime"]').fill("19:30");
  await page.locator('input[name="venue"]').fill("测试馆");
  await page.locator('[data-action="next"]').click();

  // 第 2 步：混合模式应出现“性别”列
  const headText = await page.locator(".roster-head").first().innerText();
  check("混合模式名单出现性别列", headText.includes("性别"), headText.replace(/\n/g, " / "));
  const selectCount = await page.locator('select[name="player-gender-0-0"]').count();
  check("每行队员都有性别下拉", selectCount === 1);

  // 桌面与手机宽度下，四列都不能撑破名单行
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => document.querySelector(".roster-row.with-gender").scrollWidth - document.querySelector(".roster-row.with-gender").clientWidth);
    check(`${width}px 宽度下性别列未撑破名单行`, overflow <= 1, `溢出 ${overflow}px`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });

  // 下载 CSV 模板，确认带性别列
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator('[data-action="download-roster-template"]').click()
  ]);
  const templatePath = await download.path();
  const { readFile } = await import("node:fs/promises");
  const csv = await readFile(templatePath, "utf8");
  check("模板文件名标注混合", download.suggestedFilename().includes("混合"), download.suggestedFilename());
  check("模板表头含性别列", csv.replace(/^\uFEFF/, "").split("\r\n")[0].includes("性别"), csv.split("\r\n")[0]);

  // 导入名单后截图：混合模式的性别列
  await page.screenshot({ path: resolve("tmp/mixed-gender-setup.png"), fullPage: false });

  // 填示例名单，并把 A 队前 3 人改成女
  await page.locator('[data-action="demo-roster"]').click();
  for (let i = 0; i < 3; i += 1) {
    await page.locator(`select[name="player-gender-0-${i}"]`).selectOption("女");
  }
  await page.locator('[data-action="next"]').click();

  const savedGenders = await page.evaluate(() => JSON.parse(localStorage.getItem("volley-record-state-v1")).teams[0].roster.slice(0, 4).map(p => p.gender));
  check("性别选择已写入存档", savedGenders.join(",") === "女,女,女,男", savedGenders.join(","));

  // 第 3 步裁判组
  await page.locator('input[name="firstReferee"]').fill("周远");
  await page.locator('input[name="secondReferee"]').fill("林蔚");
  await page.locator('input[name="scorer"]').fill("陈曦");
  await page.locator('[data-action="next"]').click();

  // 第 4 步轮次：示例名单不带首发，这里手工填 I–VI 号位（示例名单里 6、10 / 5、14 是自由人，避开）
  const starters = [["1", "2", "3", "4", "5", "7"], ["1", "2", "3", "4", "6", "7"]];
  for (const team of [0, 1]) {
    for (let position = 0; position < 6; position += 1) {
      await page.locator(`input[name="setup-lineup-${team}-${position}"]`).fill(starters[team][position]);
    }
  }
  await page.locator('[data-action="next"]').click();
  await page.waitForSelector(".scoreboard");

  const chip = await page.locator(".gender-chip").first().innerText();
  check("记分板显示场上男女人数", /场上 男 \d+ · 女 \d+/.test(chip), chip);

  const mix = await page.locator(".gender-mix").first().innerText();
  check("记录表名单区显示男女统计", /男 \d+ · 女 \d+/.test(mix), mix);

  const badgeCounts = await page.evaluate(() => ({
    male: document.querySelectorAll(".sheet-player .g-male").length,
    female: document.querySelectorAll(".sheet-player .g-female").length
  }));
  check("记录表逐人标注男女", badgeCounts.female > 0 && badgeCounts.male > 0, JSON.stringify(badgeCounts));

  const metaText = await page.locator(".paper-meta").innerText();
  check("记录表页眉显示性别", metaText.includes("性别") && metaText.includes("混合"), metaText.replace(/\n/g, " "));

  await page.screenshot({ path: resolve("tmp/mixed-gender-score.png"), fullPage: false });

  // 切回男子比赛（赛前信息弹窗是只读的，这里直接改存档后重载）：性别标记应全部隐藏
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("volley-record-state-v1"));
    saved.meta.gender = "男子";
    localStorage.setItem("volley-record-state-v1", JSON.stringify(saved));
  });
  // 新开一个标签页读取同一份 localStorage（原页面的 initScript 会在每次导航时清空存档，不能重载）
  const malePage = await context.newPage();
  await malePage.goto(baseUrl, { waitUntil: "networkidle" });
  await malePage.waitForSelector(".scoreboard");
  const hiddenBadges = await malePage.evaluate(() => document.querySelectorAll(".sheet-player .g-female, .sheet-player .g-male, .gender-chip, .gender-mix").length);
  check("非混合比赛不显示男女标记", hiddenBadges === 0, `残留 ${hiddenBadges} 个`);
  await malePage.screenshot({ path: resolve("tmp/mixed-gender-male-mode.png"), fullPage: false });

  if (errors.length) throw new Error(`页面报错：${errors.join(" | ")}`);
  console.log("mixed gender flow passed.");
} finally {
  await browser.close();
}
