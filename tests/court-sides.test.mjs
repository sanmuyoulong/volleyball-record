import test from "node:test";
import assert from "node:assert/strict";
import { courtPolicy, needsDecidingCourtChoice, changesBetweenSets, physicalLeftTeam, scoreTeamOrder, nextSetLeftTeam, shouldChangeAtEight } from "../src/court-sides.js";
import { initialState, normalizeState } from "../src/state.js";

test("VNL court policy is explicit and restricted to trial five-set matches", () => {
  assert.equal(courtPolicy("test2026", 5), "vnl2026");
  assert.equal(courtPolicy("test2026", 5, "standard"), "standard");
  for (const [profile, sets] of [["test2026", 3], ["official", 5], ["official", 3], ["air2026", 3]]) {
    assert.equal(courtPolicy(profile, sets, "vnl2026"), "standard");
  }
});

test("standard intervals exclude deciding-set toss; VNL switches only 2 to 3", () => {
  assert.deepEqual([2, 3, 4, 5].map(n => changesBetweenSets(n, 5, "standard")), [true, true, true, false]);
  assert.deepEqual([2, 3, 4, 5].map(n => changesBetweenSets(n, 5, "vnl2026")), [false, true, false, false]);
  assert.deepEqual([2, 3].map(n => changesBetweenSets(n, 3, "standard")), [true, false]);
  assert.equal(needsDecidingCourtChoice(3, 3, "standard"), true);
  assert.equal(needsDecidingCourtChoice(5, 5, "vnl2026"), false);
  let previous = { initialLeftTeam: 0, courtChanged: false };
  const vnlLeft = [0];
  for (let n = 2; n <= 5; n++) {
    previous = { initialLeftTeam: nextSetLeftTeam(previous, n, 5, "vnl2026"), courtChanged: false };
    vnlLeft.push(physicalLeftTeam(previous));
  }
  assert.deepEqual(vnlLeft, [0, 0, 1, 1, 1]);
});

test("automatic 8-point change is independent of manual offset, reversible and only once", () => {
  for (const maxSets of [3, 5]) for (const left of [0, 1]) for (const manual of [false, true]) {
    const set = { number: maxSets, initialLeftTeam: left, courtChanged: false, score: [7, 6] };
    const before = scoreTeamOrder(set, manual);
    assert.equal(shouldChangeAtEight(set, maxSets), false);
    set.score = [7, 8];
    assert.equal(shouldChangeAtEight(set, maxSets), true);
    set.courtChanged = true;
    assert.deepEqual(scoreTeamOrder(set, manual), before.toReversed());
    assert.equal(shouldChangeAtEight(set, maxSets), false);
    set.courtChanged = false;
    assert.deepEqual(scoreTeamOrder(set, manual), before);
  }
  assert.equal(shouldChangeAtEight({ number: 1, score: [8, 0], courtChanged: false }, 3), false);
});

test("legacy sets retain their display even when the historic 8-point flag is set", () => {
  for (const courtChanged of [true, false]) {
    assert.deepEqual(scoreTeamOrder({ courtChanged }, false), [0, 1]);
    assert.deepEqual(scoreTeamOrder({ courtChanged }, true), [1, 0]);
  }
});

test("normalization preserves old display and migrates undo snapshots for subsequent 8-point scoring", () => {
  const saved = initialState();
  saved.scoreSidesSwapped = true;
  saved.match = { maxSets: 3, sets: [{ number: 3, score: [8, 6], courtChanged: true }], auditLog: [
    { before: { sets: [{ number: 3, score: [7, 6], courtChanged: false }] } }
  ] };
  const restored = normalizeState(saved);
  assert.deepEqual(scoreTeamOrder(restored.match.sets[0], restored.scoreSidesSwapped), [1, 0]);
  const before = restored.match.auditLog[0].before.sets[0];
  assert.equal(before.initialLeftTeam, 0);
  before.score[0]++;
  assert.equal(shouldChangeAtEight(before, 3), true);
  before.courtChanged = true;
  assert.deepEqual(scoreTeamOrder(before, restored.scoreSidesSwapped), [0, 1]);
  assert.equal(normalizeState(restored).match.sets[0].initialLeftTeam, 1, "Migration is idempotent");
});
