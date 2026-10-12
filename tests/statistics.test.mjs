import test from "node:test";
import assert from "node:assert/strict";
import { initialStatistics, sampleStatistics, hasStatisticsContent, normalizeStatistics, adjustStatistic, groupTotal, teamTotals, validateStatistics, validateStatisticsScores, selectedTeam, statisticsPlayerGender, matchResult, GROUPS, prepareStatisticsRosterImport } from "../src/statistics-state.js";

function match() {
  const data = initialStatistics();
  Object.assign(data.meta, { competition: "校园联赛", matchNo: "6", homeTeam: "海风队", awayTeam: "山城队", city: "上海", venue: "体育馆" });
  Object.assign(data.players[0], { name: "张三", number: "7" });
  Object.assign(data.players[1], { name: "李四", number: "9" });
  return data;
}

test("技术统计样例可直接记录和分析，混合名单完整，每次载入独立生成数据", () => {
  const data = sampleStatistics();
  assert.equal(data.screen, "table");
  assert.equal(validateStatistics(data), "");
  assert.equal(data.players.length, 14);
  assert.match(data.meta.competition, /样例/);
  assert.equal(data.meta.gender, "混合");
  assert.equal(data.players.every(p => p.name && p.number && ["男", "女"].includes(p.gender)), true);
  assert.equal(matchResult(data.setScores, data.completedSets), "3 : 1");
  assert.equal(GROUPS.every(g => groupTotal(teamTotals(data.players), g.key) > 0), true);
  assert.equal(data.players.some(p => GROUPS.every(g => groupTotal(p.counts, g.key) === 0)), true);
  const another = sampleStatistics();
  adjustStatistic(data, 0, "serve", "success", 1);
  data.players[0].name = "已修改";
  data.setScores[0][0] = "99";
  assert.equal(another.players[0].counts.serve.success, 2);
  assert.notEqual(another.players[0].name, data.players[0].name);
  assert.equal(another.setScores[0][0], "25");
  assert.equal(normalizeStatistics(another).screen, "table");
});

test("载入样例前识别已有比赛信息、名单、比分或统计，空表可直接体验", () => {
  assert.equal(hasStatisticsContent(initialStatistics()), false);
  for (const edit of [d => d.meta.competition = "草稿", d => d.players[0].name = "队员", d => d.setScores[0][0] = "8", d => d.players[0].counts.defend.normal = 1]) {
    const data = initialStatistics();
    edit(data);
    assert.equal(hasStatisticsContent(data), true);
  }
});

test("B6 保留 14 行，逐项加减联动队员总数和全队合计，最低为零", () => {
  const data = match();
  assert.equal(data.players.length, 14);
  for (const { key } of GROUPS) {
    assert.equal(adjustStatistic(data, 0, key, "success", -1), false);
    assert.equal(adjustStatistic(data, 0, key, "success", 1), true);
    adjustStatistic(data, 0, key, "normal", 1);
    adjustStatistic(data, 0, key, "error", 1);
    adjustStatistic(data, 1, key, "success", 1);
    assert.equal(groupTotal(data.players[0].counts, key), 3);
    assert.equal(groupTotal(teamTotals(data.players), key), 4);
    adjustStatistic(data, 0, key, "error", -1);
    assert.equal(groupTotal(data.players[0].counts, key), 2);
    assert.equal(groupTotal(teamTotals(data.players), key), 3);
  }
  assert.equal(adjustStatistic(data, 2, "serve", "success", 1), false);
  assert.equal(adjustStatistic(data, 0, "invented", "success", 1), false);
  assert.equal(adjustStatistic(data, 0, "serve", "total", 1), false);
  assert.equal(adjustStatistic(data, 0, "serve", "success", 2), false);
});

test("恢复表格保留计数，缺失及非法计数安全归一化", () => {
  const data = match();
  data.screen = "table";
  adjustStatistic(data, 1, "defend", "normal", 1);
  const restored = normalizeStatistics(JSON.parse(JSON.stringify(data)));
  assert.equal(restored.screen, "table");
  assert.equal(restored.players[1].counts.defend.normal, 1);
  delete data.players[0].counts.attack;
  data.players[0].counts.serve.success = -5;
  data.players[0].counts.receive.success = "3";
  const legacy = normalizeStatistics(data);
  assert.equal(groupTotal(legacy.players[0].counts, "attack"), 0);
  assert.equal(legacy.players[0].counts.serve.success, 0);
  assert.equal(legacy.players[0].counts.receive.success, 0);
});

test("赛前校验识别缺失信息、等价重复号码及不能清空的已统计队员", () => {
  const data = match();
  assert.equal(validateStatistics(data), "");
  data.players[1].number = "007";
  assert.match(validateStatistics(data), /重复/);
  data.players[1].number = "9";
  adjustStatistic(data, 0, "serve", "success", 1);
  data.players[0].name = "";
  data.players[0].number = "";
  assert.match(validateStatistics(data), /已记录数据/);
  data.meta.homeTeam = data.meta.awayTeam;
  assert.match(validateStatistics(data), /不能相同/);
  assert.equal(normalizeStatistics({ ...initialStatistics(), screen: "table" }).screen, "setup");
});

test("按主客队汇总已结束局的比赛结果，局比分校验不接受缺失一方或平局", () => {
  const data = match();
  assert.equal(matchResult(data.setScores), "— : —");
  data.setScores = [["25", "20"], ["21", "25"], ["25", "19"], ["25", "22"], ["", ""]];
  data.completedSets = [true, true, true, true, false];
  assert.equal(matchResult(data.setScores), "3 : 1");
  assert.equal(validateStatistics(data), "");
  data.meta.teamSide = "away";
  assert.equal(selectedTeam(data), "山城队");
  data.setScores[4] = ["15", ""];
  assert.match(validateStatistics(data), /补全第 5 局/);
  data.setScores[4] = ["15", "15"];
  data.completedSets[4] = true;
  assert.match(validateStatistics(data), /比分相同/);
});

test("赛中比分可以持平，只将已结束局计入局分，旧存档迁移保留赛果", () => {
  const data = match();
  data.screen = "table";
  data.setScores[0] = ["8", "8"];
  assert.equal(validateStatistics(data), "");
  assert.equal(matchResult(data.setScores, data.completedSets), "— : —");
  data.completedSets[0] = true;
  assert.match(validateStatisticsScores(data.setScores, data.completedSets), /不能标记为已结束/);
  data.setScores[0] = ["25", "20"];
  data.setScores[1] = ["9", "8"];
  assert.equal(matchResult(data.setScores, data.completedSets), "1 : 0");
  assert.equal(normalizeStatistics(data).screen, "table");
  delete data.completedSets;
  const migrated = normalizeStatistics(data);
  assert.deepEqual(migrated.completedSets, [true, true, false, false, false]);
  assert.equal(matchResult(migrated.setScores, migrated.completedSets), "2 : 0");
});

test("名单重排按等价号码保留统计，新队员从零开始，导入预览不修改原数据", () => {
  const data = match();
  adjustStatistic(data, 0, "serve", "success", 1);
  adjustStatistic(data, 1, "defend", "normal", 1);
  const before = structuredClone(data);
  const imported = prepareStatisticsRosterImport(data, { players: [{ number: "9", name: "李四" }, { number: "007", name: "张三" }, { number: "2", name: "王五" }] });
  assert.equal(imported.players.length, 14);
  assert.equal(imported.retainedCount, 2);
  assert.equal(imported.teamName, "海风队");
  assert.equal(imported.players[0].counts.defend.normal, 1);
  assert.equal(imported.players[1].counts.serve.success, 1);
  assert.equal(groupTotal(imported.players[2].counts, "serve"), 0);
  assert.deepEqual(data, before);
  imported.players[1].counts.serve.success++;
  assert.deepEqual(data, before);
});

test("导入名单拒绝丢弃统计、转移给不同姓名或队伍、重复和无效号码", () => {
  const data = match();
  adjustStatistic(data, 0, "attack", "success", 1);
  const before = structuredClone(data);
  assert.throws(() => prepareStatisticsRosterImport(data, { players: [{ number: "9", name: "李四" }] }), /不能.*移除/);
  assert.throws(() => prepareStatisticsRosterImport(data, { players: [{ number: "7", name: "王五" }] }), /姓名.*不一致/);
  assert.throws(() => prepareStatisticsRosterImport(data, { teamName: "另一队", players: [{ number: "7", name: "张三" }] }), /队伍不同/);
  assert.throws(() => prepareStatisticsRosterImport(data, { players: [{ number: "7", name: "张三" }, { number: "007", name: "李四" }] }), /重复/);
  assert.throws(() => prepareStatisticsRosterImport(data, { players: [{ number: "-1", name: "张三" }] }), /整数号码/);
  assert.deepEqual(data, before);
});

test("男女混合需补全参赛队员性别，恢复旧表时保留计数并返回名单补填", () => {
  const data = match();
  data.meta.gender = "混合";
  data.screen = "table";
  adjustStatistic(data, 0, "serve", "success", 1);
  assert.match(validateStatistics(data), /第 1 行.*性别/);
  const legacy = normalizeStatistics(data);
  assert.equal(legacy.screen, "setup");
  assert.equal(legacy.players[0].counts.serve.success, 1);
  data.players[0].gender = "男";
  data.players[1].gender = "女";
  assert.equal(validateStatistics(data), "");
  const restored = normalizeStatistics(JSON.parse(JSON.stringify(data)));
  assert.equal(restored.screen, "table");
  assert.equal(statisticsPlayerGender(restored, restored.players[1]), "女");
  restored.meta.gender = "男子";
  assert.equal(statisticsPlayerGender(restored, restored.players[1]), "男");
  assert.equal(restored.players[1].gender, "女");
  restored.meta.gender = "男女混合";
  assert.equal(normalizeStatistics(restored).meta.gender, "混合");
  data.players[1].gender = "未知";
  assert.equal(normalizeStatistics(data).players[1].gender, "");
});

test("混合名单导入性别，缺少性别时按号码和姓名保留，新增队员留待补充", () => {
  const data = match();
  data.meta.gender = "混合";
  data.players[0].gender = "男";
  data.players[1].gender = "女";
  adjustStatistic(data, 0, "serve", "success", 1);
  const before = structuredClone(data);
  const imported = prepareStatisticsRosterImport(data, { players: [{ number: "9", name: "李四" }, { number: "007", name: "张三", gender: "女" }, { number: "2", name: "王五", gender: "男" }, { number: "3", name: "赵六" }] });
  assert.deepEqual(imported.players.slice(0, 4).map(p => p.gender), ["女", "女", "男", ""]);
  assert.equal(imported.players[1].counts.serve.success, 1);
  assert.deepEqual(data, before);
  const replaced = prepareStatisticsRosterImport(data, { players: [{ number: "9", name: "新队员" }, { number: "7", name: "张三" }] });
  assert.equal(replaced.players[0].gender, "");
  assert.equal(replaced.players[1].gender, "男");
});
