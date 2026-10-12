import test from "node:test";
import assert from "node:assert/strict";
import { initialStatistics } from "../src/statistics-state.js";
import { buildStatisticsAnalysis, formatPercentage } from "../src/statistics-analysis.js";

function fixture() {
  const data = initialStatistics();
  Object.assign(data.players[0], { name: "张三", number: "7" });
  Object.assign(data.players[1], { name: "李四", number: "9" });
  Object.assign(data.players[2], { name: "王五", number: "2" });
  return data;
}

test("个人得分仅含发球、扣球、拦网成功项，一传与防守好球不算得分", () => {
  const data = fixture();
  Object.assign(data.players[0].counts.serve, { success: 2, normal: 3, error: 1 });
  Object.assign(data.players[0].counts.attack, { success: 8, normal: 4, error: 2 });
  data.players[0].counts.block.success = 3;
  data.players[0].counts.receive.success = 20;
  data.players[0].counts.defend.success = 15;
  const before = structuredClone(data);
  const report = buildStatisticsAnalysis(data);
  assert.equal(report.points, 13);
  assert.equal(report.errors, 3);
  assert.equal(report.actions, 58);
  assert.equal(report.recordedPlayers, 1);
  assert.equal(report.players.length, 3);
  assert.equal(report.groups.find(g => g.key === "attack").successRate, 8 / 14);
  assert.equal(report.groups.find(g => g.key === "attack").errorRate, 2 / 14);
  assert.equal(formatPercentage(8 / 14), "57.1%");
  assert.deepEqual(data, before);
});

test("全队比例按次数加权，区分没有记录与真实零成功率", () => {
  const data = fixture();
  Object.assign(data.players[0].counts.receive, { success: 1, normal: 0, error: 0 });
  Object.assign(data.players[1].counts.receive, { success: 1, normal: 8, error: 1 });
  data.players[0].counts.serve.normal = 3;
  const report = buildStatisticsAnalysis(data);
  assert.equal(report.groups.find(g => g.key === "receive").successRate, 2 / 11);
  assert.equal(formatPercentage(report.groups.find(g => g.key === "receive").successRate), "18.2%");
  assert.equal(report.groups.find(g => g.key === "serve").successRate, 0);
  assert.equal(formatPercentage(report.groups.find(g => g.key === "serve").successRate), "0.0%");
  assert.equal(report.groups.find(g => g.key === "attack").successRate, null);
  assert.equal(formatPercentage(null), "—");
  assert.equal(report.players[2].groups[0].errorRate, null);
});

test("同分队员并列排名，零得分队员不参与榜单，纠正后重新计算", () => {
  const data = fixture();
  data.players[0].counts.attack.success = 5;
  data.players[1].counts.serve.success = 5;
  data.players[2].counts.block.success = 2;
  let report = buildStatisticsAnalysis(data);
  assert.deepEqual(report.ranking.map(p => p.rank), [1, 1, 3]);
  assert.deepEqual(report.leaders.map(p => p.name), ["张三", "李四"]);
  data.players[1].counts.serve.success = 0;
  report = buildStatisticsAnalysis(data);
  assert.equal(report.points, 7);
  assert.deepEqual(report.ranking.map(p => p.rank), [1, 2]);
  assert.equal(report.ranking.some(p => p.name === "李四"), false);
});

test("空白记录不产生虚假最佳队员、失误项目或无效百分比", () => {
  const report = buildStatisticsAnalysis(fixture());
  assert.equal(report.points, 0);
  assert.equal(report.errors, 0);
  assert.equal(report.recordedPlayers, 0);
  assert.deepEqual(report.ranking, []);
  assert.deepEqual(report.leaders, []);
  assert.deepEqual(report.errorGroups, []);
  assert.equal(report.groups.every(g => g.successRate === null && g.errorRate === null), true);
});
