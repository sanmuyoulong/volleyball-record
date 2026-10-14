import assert from "node:assert/strict";
import { launchBrowser } from "./_browser.mjs";
const browser = await launchBrowser();
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${process.env.CONSOLE_TEST_URL || "http://127.0.0.1:4174"}/`);
  const outcome = await page.evaluate(async () => {
    const { repository, migrateLegacy, validateBackup } = await import("/src/console-repository.js");
    const { initialState } = await import("/src/state.js");
    const { sampleStatistics } = await import("/src/statistics-state.js");
    const raw = initialState(); raw.matchId = "legacy-match"; raw.tournamentId = "legacy-event";
    raw.teams[0].name = "甲队"; raw.teams[0].id = "a"; raw.teams[1].name = "乙队"; raw.teams[1].id = "b";
    localStorage.setItem("volley-record-state-v1", JSON.stringify(raw));
    localStorage.setItem("volley-record-statistics-v1", JSON.stringify(sampleStatistics()));
    localStorage.setItem("volley-record-tournaments-v1", JSON.stringify([{ id: "legacy-event", name: "旧联赛", teams: raw.teams, groups: 1, matches: [{ id: "legacy-match", teamA: "甲队", teamB: "乙队" }, { id: "missing-match", teamA: "甲队", teamB: "乙队" }] }]));
    const before = JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])));
    await migrateLegacy(); await migrateLegacy();
    let matches = await repository.list("matches");
    const missing = matches.find(m => m.id === "missing-match");
    const legacy = matches.find(m => m.id === "legacy-match");
    const original = await repository.get("meta", "legacy-v1");
    const migratedCorrectly = matches.length === 2 && missing.missing && legacy.scoring.teams[0].name === "甲队" && legacy.statistics.home === null && Object.keys(original.originals).length === 3;
    const localUntouched = before === JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])));
    const first = await repository.put("matches", { ...legacy, meta: { ...legacy.meta, venue: "新馆" } }, legacy.revision);
    let conflict = false; try { await repository.put("matches", { ...legacy, meta: { ...legacy.meta, venue: "旧页修改" } }, legacy.revision); } catch { conflict = true; }
    const noOverwrite = (await repository.get("matches", first.id)).meta.venue === "新馆";
    const backup = await repository.backup(); await repository.restore(backup);
    matches = await repository.list("matches"); const events = await repository.list("events");
    const restoredReferences = matches.length === 4 && events.length === 2 && matches.every(m => events.some(e => e.id === m.tournamentId)) && (await repository.list("meta")).length === 2;
    const invalid = structuredClone(backup); invalid.data.matches[0].tournamentId = "nonexistent";
    let rejected = false; try { await repository.restore(invalid); } catch { rejected = true; }
    const atomicInvalid = rejected && (await repository.list("matches")).length === 4;
    // Force a duplicate primary key mid-transaction after one valid insert.
    const failed = structuredClone(backup); failed.data.events.push({ ...failed.data.events[0] });
    let duplicate = false; try { validateBackup(failed); } catch { duplicate = true; }
    return { migratedCorrectly, localUntouched, conflict, noOverwrite, restoredReferences, atomicInvalid, duplicate };
  });
  Object.entries(outcome).forEach(([key, value]) => assert.equal(value, true, key));
  console.log("Console storage passed: idempotent migration, original backup, missing record, active-slot fallback, revisions, additive import, reference remapping, invalid backup rejection.");
} finally { await browser.close(); }
