import test from "node:test";
import assert from "node:assert/strict";
import { cleanCode, cleanName, pointsForRank } from "../src/game-logic.js";

test("scoring follows the requested ranking ladder", () => {
  assert.deepEqual(Array.from({ length: 12 }, (_, index) => pointsForRank(index + 1)), [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 1, 1]);
});

test("names and room codes are safe and compact", () => {
  assert.equal(cleanCode(" ab-cd!23 "), "ABCD23");
  assert.equal(cleanName("  Alex <3  "), "Alex 3");
});
