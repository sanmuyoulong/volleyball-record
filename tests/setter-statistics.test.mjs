import test from "node:test";
import assert from "node:assert/strict";
import { initialStatistics, sampleStatistics, normalizeStatistics, validateStatistics, prepareStatisticsRosterImport } from "../src/statistics-state.js";
import { buildStatisticsAnalysis } from "../src/statistics-analysis.js";
import { SETTER_GROUPS, initialSetterStatistics, normalizeSetterStatistics, setterGroupTotal, setterTotals, adjustSetterStatistic, validateSetterStatistics, buildSetterAnalysis } from "../src/setter-statistics.js";

function dataWithSetters() {
  const data = sampleStatistics();
  data.setterStatistics = initialSetterStatistics();
  data.setterStatistics.enabled = true;
  Object.assign(data.setterStatistics.players[0], { name: "程野", number: "1", gender: "男" });
  Object.assign(data.setterStatistics.players[1], { name: "独立二传", number: "99", gender: "女" });
  return data;
}

test("旧存档默认不启用二传，二传独立填名且最多四人", () => {
  const data = dataWithSetters();
  assert.equal(validateStatistics(data), "");
  assert.equal(data.setterStatistics.players.length, 4);
  delete data.setterStatistics;
  assert.equal(normalizeStatistics(data).setterStatistics.enabled, false);
  assert.equal(normalizeStatistics(data).setterStatistics.players.length, 4);
  const setters = initialSetterStatistics();
  setters.enabled = true;
  assert.match(validateSetterStatistics(setters, "男子"), /至少填写/);
  setters.players.push(structuredClone(setters.players[0]));
  assert.match(validateSetterStatistics(setters, "男子"), /最多.*4/);
});

test("三类二传计数顺序、加减、总数与零值保护正确，二次得分不修改原表", () => {
  const data = dataWithSetters();
  assert.deepEqual(SETTER_GROUPS.map(g => g.order), [["error", "normal", "success"], ["error", "normal", "success"], ["success", "normal", "error"]]);
  const primary = structuredClone(data.players);
  const primaryPoints = buildStatisticsAnalysis(data).points;
  for (const g of SETTER_GROUPS) {
    assert.equal(adjustSetterStatistic(data, 0, g.key, "error", -1), false);
    for (const o of g.order) assert.equal(adjustSetterStatistic(data, 0, g.key, o, 1), true);
    assert.equal(setterGroupTotal(data.setterStatistics.players[0].counts, g.key), 3);
    assert.equal(setterGroupTotal(setterTotals(data.setterStatistics.players), g.key), 3);
  }
  assert.equal(adjustSetterStatistic(data, 2, "inSystem", "success", 1), false);
  assert.equal(adjustSetterStatistic(data, 0, "invalid", "success", 1), false);
  assert.equal(adjustSetterStatistic(data, 0, "inSystem", "total", 1), false);
  assert.deepEqual(data.players, primary);
  assert.equal(buildStatisticsAnalysis(data).points, primaryPoints);
  data.setterStatistics.enabled = false;
  assert.equal(adjustSetterStatistic(data, 0, "inSystem", "success", 1), false);
  assert.equal(buildSetterAnalysis(data), null);
});

test("混合二传名单需性别、号码不重复，已有计数不能清空", () => {
  const data = dataWithSetters();
  data.setterStatistics.players[1].number = "001";
  assert.match(validateSetterStatistics(data.setterStatistics, "混合"), /重复/);
  data.setterStatistics.players[1].number = "99";
  data.setterStatistics.players[1].gender = "";
  assert.match(validateSetterStatistics(data.setterStatistics, "混合"), /性别/);
  assert.equal(validateSetterStatistics(data.setterStatistics, "男子"), "");
  data.setterStatistics.players[1].gender = "女";
  adjustSetterStatistic(data, 0, "inSystem", "success", 1);
  data.setterStatistics.players[0].name = "";
  data.setterStatistics.players[0].number = "";
  assert.match(validateSetterStatistics(data.setterStatistics, "混合"), /不能清空/);
});

test("二传分析分别计算两类传球到位率与二次得分率，整体按次数加权", () => {
  const data = dataWithSetters();
  data.setterStatistics.players[0].counts.inSystem = { success: 1, normal: 0, error: 0 };
  data.setterStatistics.players[1].counts.inSystem = { success: 1, normal: 8, error: 1 };
  data.setterStatistics.players[1].counts.outOfSystem = { success: 2, normal: 1, error: 1 };
  data.setterStatistics.players[0].counts.secondAttack = { success: 2, normal: 1, error: 1 };
  const before = structuredClone(data);
  const report = buildSetterAnalysis(data);
  assert.equal(report.groups[0].successRate, 2 / 11);
  assert.equal(report.groups[1].successRate, 1 / 2);
  assert.equal(report.groups[2].successRate, 1 / 2);
  assert.equal(report.secondPoints, 2);
  assert.equal(report.passingTotal, 15);
  assert.equal(report.passingAccurate, 4);
  assert.equal(report.players[1].groups[2].successRate, null);
  assert.deepEqual(data, before);
});

test("二传计数备份恢复，关闭再开启不丢数据，导入名单不能转移已有二传记录到其他队伍", () => {
  const data = dataWithSetters();
  data.players.forEach(p => Object.values(p.counts).forEach(g => Object.keys(g).forEach(o => g[o] = 0)));
  adjustSetterStatistic(data, 0, "outOfSystem", "normal", 1);
  const restored = normalizeStatistics(JSON.parse(JSON.stringify(data)));
  assert.equal(restored.setterStatistics.players[0].counts.outOfSystem.normal, 1);
  restored.setterStatistics.enabled = false;
  const disabled = normalizeStatistics(restored);
  assert.equal(disabled.setterStatistics.enabled, false);
  assert.equal(disabled.setterStatistics.players[0].counts.outOfSystem.normal, 1);
  assert.throws(() => prepareStatisticsRosterImport(data, { teamName: "其他球队", players: [{ name: "程野", number: "1" }] }), /队伍不同/);
  const corrupt = normalizeSetterStatistics({ enabled: true, players: [{ name: "甲", number: "1", counts: { inSystem: { success: -2, normal: "3", error: 1 } } }] });
  assert.deepEqual(corrupt.players[0].counts.inSystem, { success: 0, normal: 0, error: 1 });
});
