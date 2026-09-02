import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStandings, resultFromMatch } from "../src/tournament-rules.js";

const teams2 = [
  { id: "a", name: "A", group: 0 },
  { id: "b", name: "B", group: 0 }
];

test("积分表：单组按胜场→局胜率→小分胜率排序", () => {
  const matches = [{
    id: "m1", result: { winnerTeamId: "a", homeTeamId: "a", awayTeamId: "b", homeSets: 3, awaySets: 1, homePoints: 80, awayPoints: 60 }
  }];
  const { groups } = computeStandings(matches, teams2, 1);
  const rows = groups[0].rows;
  assert.equal(rows[0].name, "A");
  assert.equal(rows[0].wins, 1);
  assert.equal(rows[1].name, "B");
  assert.equal(rows[1].losses, 1);
});

test("积分表：分组数 > 1 时按 group 分表", () => {
  const teams = [
    { id: "a", name: "A", group: 0 },
    { id: "b", name: "B", group: 0 },
    { id: "c", name: "C", group: 1 },
    { id: "d", name: "D", group: 1 }
  ];
  const matches = [
    { id: "m1", result: { winnerTeamId: "a", homeTeamId: "a", awayTeamId: "b", homeSets: 3, awaySets: 0, homePoints: 75, awayPoints: 50 } },
    { id: "m2", result: { winnerTeamId: "c", homeTeamId: "c", awayTeamId: "d", homeSets: 3, awaySets: 1, homePoints: 80, awayPoints: 60 } }
  ];
  const { groups } = computeStandings(matches, teams, 2);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].rows[0].name, "A");
  assert.equal(groups[1].rows[0].name, "C");
});

test("resultFromMatch：从真实比赛状态（score:[a,b] + winner）推导胜方与局数", () => {
  const matchState = {
    teams: [{ id: "a", name: "A" }, { id: "b", name: "B" }],
    match: { sets: [
      { score: [25, 20], ended: true, winner: 0 },
      { score: [25, 18], ended: true, winner: 0 },
      { score: [23, 25], ended: true, winner: 1 }
    ] }
  };
  const r = resultFromMatch(matchState);
  assert.equal(r.winnerTeamId, "a");
  assert.equal(r.homeSets, 2);
  assert.equal(r.awaySets, 1);
  assert.equal(r.homePoints, 73);
  assert.equal(r.awayPoints, 63);
});
