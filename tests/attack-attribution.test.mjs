import test from "node:test";
import assert from "node:assert/strict";
import { initialStatistics, sampleStatistics, adjustStatistic, normalizeStatistics, prepareStatisticsRosterImport } from "../src/statistics-state.js";
import { setActiveSetter, buildAttackComparison, normalizeAttackAttribution, validateAttackAttribution, hasAttributedAttacks } from "../src/attack-attribution.js";

function fixture() {
  const data = initialStatistics();
  data.setterStatistics.enabled = true;
  Object.assign(data.setterStatistics.players[0], { name: "二传甲", number: "1" });
  Object.assign(data.setterStatistics.players[1], { name: "二传乙", number: "2" });
  ["二传甲", "主攻甲", "主攻乙"].forEach((name, i) => Object.assign(data.players[i], { name, number: ["01", "3", "4"][i] }));
  return data;
}
const attack = (d, row, result, delta = 1) => assert.equal(adjustStatistic(d, row, "attack", result, delta), true);

function reconcile(data) {
  const ledger = normalizeAttackAttribution(data);
  data.players.forEach((p, i) => ["success", "normal", "error"].forEach(o => assert.equal(ledger.rows[i][o].reduce((n, r) => n + r.count, 0), p.counts.attack[o])));
}

test("换二传只归属新记录，原表总数累计；减一撤回最近同类而非当前二传", () => {
  const d = fixture();
  assert.equal(setActiveSetter(d, "0"), true);
  attack(d, 1, "success"); attack(d, 1, "normal");
  setActiveSetter(d, "1"); attack(d, 1, "success");
  setActiveSetter(d, "0"); attack(d, 1, "success", -1);
  let report = buildAttackComparison(d);
  assert.equal(report.groups[0].success, 1);
  assert.equal(report.groups[1].success, 0);
  assert.equal(d.players[1].counts.attack.success, 1);
  attack(d, 1, "success", -1);
  assert.equal(adjustStatistic(d, 1, "attack", "success", -1), false);
  assert.equal(setActiveSetter(d, "3"), false);
  assert.equal(setActiveSetter(d, "-1"), false);
  assert.equal(setActiveSetter(d, ""), true);
  attack(d, 1, "error");
  report = buildAttackComparison(d);
  assert.equal(report.unassigned.error, 1);
  reconcile(d);
});

test("队友效率排除二传本人，分母为零不伪造零率，负效率保留", () => {
  const d = fixture(); setActiveSetter(d, 0);
  attack(d, 0, "success"); attack(d, 1, "error"); attack(d, 1, "error"); attack(d, 1, "success");
  const report = buildAttackComparison(d);
  assert.equal(report.groups[0].excluded, 1);
  assert.equal(report.groups[0].total, 3);
  assert.equal(report.groups[0].efficiency, -1 / 3);
  assert.equal(report.groups[0].killRate, 1 / 3);
  assert.equal(report.groups[0].players[0].own, true);
  assert.equal(report.groups[1].efficiency, null);
  assert.equal(d.players[0].counts.attack.success, 1);
  reconcile(d);
});

test("未归属旧记录不追溯分配，关闭二传后新记录未归属，恢复后历史仍在", () => {
  let d = fixture(); d.players[1].counts.attack.success = 5;
  delete d.attackAttribution;
  d = normalizeStatistics(d);
  setActiveSetter(d, 0); attack(d, 1, "success");
  d.setterStatistics.enabled = false; attack(d, 1, "success");
  d = normalizeStatistics(JSON.parse(JSON.stringify(d)));
  d.setterStatistics.enabled = true;
  const report = buildAttackComparison(d);
  assert.equal(report.groups[0].success, 1);
  assert.equal(report.unassigned.success, 6);
  assert.equal(d.attackAttribution.activeSetter, 0);
  reconcile(d);
});

test("JSON恢复归属顺序，名单按等价号码重排后攻手归属不串行", () => {
  let d = fixture(); setActiveSetter(d, 0); attack(d, 1, "success");
  setActiveSetter(d, 1); attack(d, 2, "error");
  d = normalizeStatistics(JSON.parse(JSON.stringify(d)));
  const imported = prepareStatisticsRosterImport(d, { players: [{ name: "主攻乙", number: "004" }, { name: "主攻甲", number: "3" }, { name: "二传甲", number: "1" }] });
  d.players = imported.players; d.attackAttribution = imported.attackAttribution; d.setStatistics = imported.setStatistics;
  const report = buildAttackComparison(d);
  assert.equal(report.groups[0].players[1].success, 1);
  assert.equal(report.groups[1].players[0].error, 1);
  attack(d, 0, "error", -1);
  assert.equal(buildAttackComparison(d).groups[1].total, 0);
  reconcile(d);
});

test("归属独立于专项传球计数保护二传身份，损坏备份保全原表并标未归属", () => {
  const d = fixture(); setActiveSetter(d, 1); attack(d, 1, "normal");
  assert.equal(hasAttributedAttacks(d, 1), true);
  d.setterStatistics.players[1].name = "";
  assert.match(validateAttackAttribution(d), /不能清空/);
  const partial = normalizeStatistics(d);
  assert.equal(hasAttributedAttacks(partial, 1), true);
  d.setterStatistics.players[1].name = "二传乙";
  d.setterStatistics.players[1].number = "22";
  assert.match(validateAttackAttribution(d), /不能更换号码/);
  let restored = normalizeStatistics(d);
  assert.equal(buildAttackComparison(restored).unassigned.normal, 1);
  assert.equal(restored.players[1].counts.attack.normal, 1);
  restored.attackAttribution.rows[1].normal = [{ setter: 0, count: 100 }, { setter: 9, count: -1 }];
  restored = normalizeStatistics(restored);
  assert.equal(buildAttackComparison(restored).unassigned.normal, 1);
  reconcile(restored);
});

test("样例分组可核对原表，连续记录压缩，刷新不改变计数或归属", () => {
  const d = sampleStatistics(); reconcile(d);
  assert.deepEqual(normalizeStatistics(d).attackAttribution, d.attackAttribution);
  setActiveSetter(d, 0);
  for (let i = 0; i < 100; i++) attack(d, 12, "success");
  assert.equal(d.attackAttribution.rows[12].success.length, 1);
  assert.equal(d.attackAttribution.rows[12].success[0].count, 100);
  const before = structuredClone(d);
  buildAttackComparison(d);
  assert.deepEqual(d, before);
  reconcile(d);
});
