import test from "node:test";
import assert from "node:assert/strict";
import { isSetComplete, setTarget, rotateServiceIndex, validateLineup } from "../src/rules.js";
import { initialState, normalizeState, applyCompetitionProfile } from "../src/state.js";
import { normalizeRosterRows } from "../src/roster-import.js";
import { newMatch, scoreData, validateFinal } from "../src/console-domain.js";

test("气排球 21/21/15 分、两分差且不封顶，六人制基线保留", () => {
  assert.deepEqual([1, 2, 3].map(n => setTarget(n, 3, "air")), [21, 21, 15]);
  for (const [a, b, n, complete] of [[21, 19, 1, true], [21, 20, 1, false], [22, 20, 2, true], [15, 14, 3, false], [30, 28, 3, true], [60, 58, 1, true]]) {
    assert.equal(isSetComplete(a, b, n, 3, "air"), complete);
  }
  assert.equal(isSetComplete(21, 19, 1, 3), false);
  assert.equal(setTarget(3, 5), 25);
  assert.equal(rotateServiceIndex(4, 5), 0);
  assert.equal(rotateServiceIndex(4), 5);
  const lineup = ["1", "2", "3", "4", "5"];
  assert.equal(validateLineup(lineup, lineup, 5).ok, true);
  assert.equal(validateLineup(lineup, lineup).ok, false);
  assert.equal(validateLineup(["1", "2", "3", "4", "4"], lineup, 5).ok, false);
});

test("气排球名单导入接受五人，拒绝超员和自由人", () => {
  const rows = [["号码", "姓名", "自由人"], ...Array.from({ length: 5 }, (_, i) => [String(i + 1), `队员${i + 1}`, ""])];
  const options = { minimumPlayers: 5, maximumPlayers: 10, maximumLiberos: 0 };
  assert.equal(normalizeRosterRows(rows, options).players.length, 5);
  assert.throws(() => normalizeRosterRows(rows), /少于 6/);
  rows[1][2] = "是";
  assert.throws(() => normalizeRosterRows(rows, options), /不设自由人/);
  rows[1][2] = "";
  assert.throws(() => normalizeRosterRows([...rows, ...Array.from({ length: 6 }, (_, i) => [String(i + 6), `替补${i}`, ""])], options), /10/);
});

test("切换规则保留填写的超额名单供用户精简，恢复 JSON 保留气排球模式", () => {
  const s = initialState();
  s.teams[0].roster[13] = { number: "14", name: "已有队员", libero: true };
  applyCompetitionProfile(s, "air2026");
  assert.equal(s.selectedRule, "air");
  assert.equal(s.meta.matchFormat, "3");
  assert.equal(s.firstLineups[0].length, 5);
  assert.equal(s.teams[0].roster[13].name, "已有队员");
  assert.equal(s.teams[0].roster[13].libero, false);
  assert.equal(s.teams[1].roster.length, 10);
  const restored = normalizeState(JSON.parse(JSON.stringify(s)));
  assert.equal(restored.selectedRule, "air");
  assert.equal(restored.competitionProfile, "air2026");
  applyCompetitionProfile(restored, "official");
  assert.equal(restored.selectedRule, "modern");
  assert.equal(restored.firstLineups[0].length, 6);
  assert.equal(restored.teams[1].roster.length, 14);
  assert.equal(normalizeState({ ...s, selectedRule: "legacy-unknown" }).selectedRule, "modern");
});

test("控制台恢复气排球规则，手动比分按 21 分审核", () => {
  const m = newMatch({ competition: "气排球赛", matchFormat: "3" }, ["A", "B"].map(name => ({ id: name, name, roster: [] })));
  applyCompetitionProfile(m.scoring, "air2026");
  // Shared metadata from an older envelope must not turn air volleyball into five sets.
  m.meta.matchFormat = "5";
  assert.equal(scoreData(m).meta.matchFormat, "3");
  m.meta.matchFormat = "3";
  m.manualResult = { setScores: [["21", "19"], ["20", "22"], ["16", "14"], ["", ""], ["", ""]], completedSets: [true, true, true, false, false], winner: "home" };
  assert.equal(validateFinal(m).winner, "home");
  m.manualResult.setScores[0] = ["21", "20"];
  assert.throws(() => validateFinal(m), /不符合比赛规则/);
});
