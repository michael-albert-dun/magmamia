const test = require("node:test");
const assert = require("node:assert/strict");
const { parseLevel } = require("../src/engine.js");
const { PRESET_LEVELS } = require("../src/levels.js");
const { solve } = require("./solve.js");

// The README's worked example is a sandbox for watching one push, not a puzzle.
const SANDBOX = /sandbox/;

for (const level of PRESET_LEVELS) {
  test(`preset "${level.name}" parses`, () => {
    parseLevel(level.text);
  });

  if (SANDBOX.test(level.name)) continue;
  test(`preset "${level.name}" is solvable`, () => {
    const solution = solve(level.text, level.objective);
    assert.notEqual(solution.length, null, "no solution found");
  });
}
