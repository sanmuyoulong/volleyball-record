import test from "node:test";
import assert from "node:assert/strict";
import { initialStatistics, sampleStatistics, adjustStatistic, normalizeStatistics, prepareStatisticsRosterImport } from "../src/statistics-state.js";
import { adjustSetterStatistic } from "../src/setter-statistics.js";
import { setActiveSetter, buildAttackComparison } from "../src/attack-attribution.js";
import { undoCounterChange } from "../src/statistics-history.js";
import { statisticsSetView, recordedSetKeys } from "../src/statistics-sets.js";
function fixture() {
  const d = initialStatistics(); d.setterStatistics.enabled = true;
  Object.assign(d.players[0], { name: "攻手", number: "3" });
  Object.assign(d.players[1], { name: "二传甲", number: "1" });
  Object.assign(d.setterStatistics.players[0], { name: "二传甲", number: "1" });
  Object.assign(d.setterStatistics.players[1], { name: "二传乙", number: "2" });
  return d;
}
test("各局五项技术、二传与归属独立，顶层全场总数自动累计", () => {
  const d = fixture(); setActiveSetter(d, "0");
  adjustStatistic(d, 0, "attack", "success", 1); adjustSetterStatistic(d, 0, "inSystem", "success", 1);
  d.setStatistics.selected = "2"; setActiveSetter(d, "1");
  adjustStatistic(d, 0, "attack", "error", 1); adjustSetterStatistic(d, 1, "secondAttack", "success", 1);
  assert.equal(statisticsSetView(d, "1").players[0].counts.attack.success, 1);
  assert.equal(statisticsSetView(d, "2").players[0].counts.attack.success, 0);
  assert.equal(d.players[0].counts.attack.success, 1); assert.equal(d.players[0].counts.attack.error, 1);
  assert.equal(buildAttackComparison(statisticsSetView(d, "1")).groups[0].total, 1);
  assert.equal(buildAttackComparison(statisticsSetView(d, "2")).groups[0].total, 0);
  assert.equal(buildAttackComparison(statisticsSetView(d, "2")).groups[1].error, 1);
  assert.equal(d.setterStatistics.players[1].counts.secondAttack.success, 1);
  assert.deepEqual(recordedSetKeys(d), ["1", "2"]);
  d.setStatistics.selected = "all";
  assert.equal(adjustStatistic(d, 0, "serve", "success", 1), false);
});
test("撤销定位原局，另一局计数和当前二传不变，备份重载保持分局", () => {
  const d = fixture(); setActiveSetter(d, "0"); adjustStatistic(d, 0, "attack", "success", 1);
  d.setStatistics.selected = "2"; setActiveSetter(d, "1"); adjustStatistic(d, 0, "attack", "success", 1);
  const restored = normalizeStatistics(JSON.parse(JSON.stringify(d)));
  assert.ok(undoCounterChange(restored).entry);
  assert.equal(statisticsSetView(restored, "2").players[0].counts.attack.success, 0);
  assert.equal(statisticsSetView(restored, "1").players[0].counts.attack.success, 1);
  assert.equal(restored.players[0].counts.attack.success, 1);
  assert.equal(restored.attackAttribution.activeSetter, 1);
  assert.equal(normalizeStatistics(restored).players[0].counts.attack.success, 1);
});
test("旧统计保留在未分局，继续新局不重复累计或猜测历史局次", () => {
  const old = sampleStatistics(); delete old.setStatistics;
  const restored = normalizeStatistics(old), baseline = old.players[0].counts.attack.success;
  assert.equal(restored.setStatistics.selected, "unassigned");
  assert.equal(statisticsSetView(restored, "1").players[0].counts.attack.success, 0);
  restored.setStatistics.selected = "1"; adjustStatistic(restored, 0, "attack", "success", 1);
  assert.equal(restored.players[0].counts.attack.success, baseline + 1);
  assert.equal(statisticsSetView(restored, "unassigned").players[0].counts.attack.success, baseline);
  const again = normalizeStatistics(restored);
  assert.equal(again.players[0].counts.attack.success, baseline + 1);
});
test("导入名单重排各局计数及归属，不影响预览前原数据", () => {
  const d = fixture(); setActiveSetter(d, "0"); adjustStatistic(d, 0, "attack", "success", 1);
  d.setStatistics.selected = "2"; adjustStatistic(d, 1, "serve", "normal", 1);
  const before = JSON.stringify(d);
  const imported = prepareStatisticsRosterImport(d, { players: [{ name: "二传甲", number: "1" }, { name: "攻手", number: "003" }] });
  assert.equal(JSON.stringify(d), before);
  d.players = imported.players; d.attackAttribution = imported.attackAttribution; d.setStatistics = imported.setStatistics;
  assert.equal(statisticsSetView(d, "1").players[1].counts.attack.success, 1);
  assert.equal(statisticsSetView(d, "2").players[0].counts.serve.normal, 1);
  assert.equal(undoCounterChange(d).row, 0);
});
