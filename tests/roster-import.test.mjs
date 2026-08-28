import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRosterRows, parseDelimitedText } from "../roster-import.js";

test("CSV 解析支持 BOM、引号和字段内逗号", () => {
  const rows = parseDelimitedText('\uFEFF号码,姓名,自由人\r\n1,"张,三",\r\n14,李四,是');
  assert.deepEqual(rows, [["号码", "姓名", "自由人"], ["1", "张,三", ""], ["14", "李四", "是"]]);
});

test("名单归一化识别球队信息、队长和自由人", () => {
  const rows = parseDelimitedText("队伍名称,主教练,号码,队员姓名,自由人,队长\n海风队,秦教练,1,甲,,是\n海风队,秦教练,2,乙,,\n海风队,秦教练,3,丙,,\n海风队,秦教练,4,丁,,\n海风队,秦教练,5,戊,,\n海风队,秦教练,6,己,是,");
  const result = normalizeRosterRows(rows);
  assert.equal(result.teamName, "海风队");
  assert.equal(result.coach, "秦教练");
  assert.equal(result.captain, "1");
  assert.equal(result.players.length, 6);
  assert.equal(result.players.at(-1).libero, true);
});

test("名单归一化拒绝重复号码和超过两名自由人", () => {
  const duplicate = parseDelimitedText("号码,姓名\n1,甲\n1,乙\n2,丙\n3,丁\n4,戊\n5,己");
  assert.throws(() => normalizeRosterRows(duplicate), /重复号码/);
  const liberos = parseDelimitedText("号码,姓名,自由人\n1,甲,是\n2,乙,是\n3,丙,是\n4,丁,\n5,戊,\n6,己,");
  assert.throws(() => normalizeRosterRows(liberos), /自由人不能超过 2 名/);
});
