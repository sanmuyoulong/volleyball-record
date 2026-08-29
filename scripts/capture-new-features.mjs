import { mkdir } from "node:fs/promises";
import { launchBrowser } from "./_browser.mjs";

await mkdir("tmp", { recursive: true });
const browser = await launchBrowser();

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.clear());
  await page.goto("http://127.0.0.1:4173/record/", { waitUntil: "networkidle" });
  await page.locator("#start-setup").click();
  await page.locator('[name="competition"]').fill("城市排球邀请赛");
  await page.locator('[name="scheduledTime"]').fill("19:30");
  await page.locator('[name="venue"]').fill("滨江综合体育馆");
  await page.locator('[data-action="next"]').click();
  await page.locator('[data-action="import-roster"][data-team="0"]').click();
  const csv = "\uFEFF队伍名称,主教练,队长号码,号码,队员姓名,自由人\r\n" + Array.from({ length: 10 }, (_, index) => `海风俱乐部,秦牧,8,${index + 1},队员${index + 1},${[5, 9].includes(index) ? "是" : ""}`).join("\r\n");
  await page.locator("#roster-file").setInputFiles({ name: "海风俱乐部.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.screenshot({ path: "tmp/roster-import-preview.png", fullPage: true });

  await page.locator("#cancel-roster-import").click();
  await page.locator('[data-action="demo-roster"]').click();
  await page.locator("#reset-app").evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("volley-record-state-v1"));
    saved.screen = "score";
    saved.match = {
      startedAt: "19:30", endedAt: "", maxSets: 5, setsToWin: 3, setsWon: [3, 0], sanctions: [], improperRequests: [0, 0], delayWarnings: [false, false], liberoControl: [{ unavailable: [], redesignations: [] }, { unavailable: [], redesignations: [] }], auditLog: [], undoStack: [], currentSetIndex: 0, endingPending: true, endConfirmation: null, ended: false,
      sets: [{ number: 3, startTime: "20:35", endTime: "20:58", score: [25, 18], lineups: saved.firstLineups, onCourt: saved.firstLineups, firstServer: 0, servingTeam: 0, rotationIndex: [0, 0], serviceRounds: Array.from({ length: 2 }, () => Array.from({ length: 6 }, () => [])), timeouts: [[], []], substitutions: [[], []], liberoReplacements: [[], []], liberoState: [{ active: null, lastReplacementRally: -1 }, { active: null, lastReplacementRally: -1 }], sanctions: [], subCount: [0, 0], subPairs: [{}, {}], rallies: [{ winner: 0, source: "rally", teamPoint: 25 }], events: [], courtChanged: false, ended: true, winner: 0 }]
    };
    localStorage.setItem("volley-record-state-v1", JSON.stringify(saved));
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.locator('[data-score-action="confirm-end"]').click();
  await page.screenshot({ path: "tmp/match-end-confirmation.png", fullPage: true });
  console.log("Captured roster import and match-end confirmation screenshots.");
  await context.close();
} finally {
  await browser.close();
}
