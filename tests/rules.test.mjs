import test from "node:test";
import assert from "node:assert/strict";
import {
  isSetComplete,
  isMatchComplete,
  rotateServiceIndex,
  setTarget,
  validateLineup
} from "../rules.js";

test("前四局 25 分且领先 2 分才结束", () => {
  assert.equal(isSetComplete(25, 23, 1), true);
  assert.equal(isSetComplete(25, 24, 1), false);
  assert.equal(isSetComplete(27, 25, 4), true);
});

test("第五局 15 分且领先 2 分才结束", () => {
  assert.equal(setTarget(5), 15);
  assert.equal(isSetComplete(15, 13, 5), true);
  assert.equal(isSetComplete(15, 14, 5), false);
  assert.equal(isSetComplete(18, 16, 5), true);
});

test("三局两胜的第三局使用 15 分决胜局规则", () => {
  assert.equal(setTarget(3, 3), 15);
  assert.equal(isSetComplete(15, 13, 3, 3), true);
  assert.equal(isSetComplete(15, 14, 3, 3), false);
  assert.equal(setTarget(2, 3), 25);
});

test("三局胜利结束比赛", () => {
  assert.equal(isMatchComplete([3, 1]), true);
  assert.equal(isMatchComplete([2, 2]), false);
});

test("三局两胜在一方赢得两局时结束", () => {
  assert.equal(isMatchComplete([2, 0], 2), true);
  assert.equal(isMatchComplete([1, 1], 2), false);
});

test("发球位置按六轮循环", () => {
  assert.equal(rotateServiceIndex(0), 1);
  assert.equal(rotateServiceIndex(5), 0);
});

test("轮次表校验名单、完整性和重复号码", () => {
  const roster = ["1", "2", "3", "4", "5", "6", "7"];
  assert.equal(validateLineup(["1", "2", "3", "4", "5", "6"], roster).ok, true);
  assert.equal(validateLineup(["1", "2", "3", "4", "5", "5"], roster).ok, false);
  assert.equal(validateLineup(["1", "2", "3", "4", "5", "9"], roster).ok, false);
});
