const test = require("node:test");
const assert = require("node:assert/strict");
const { parseLevel } = require("../src/engine.js");
const { PRESET_LEVELS, CURATED_LEVELS } = require("../src/levels.js");
const { analyse } = require("../src/solver.js");
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

// The player-facing levels must all be genuine "reach the goal" puzzles:
// solvable, and needing at least one push (not a stroll to the crown).
CURATED_LEVELS.forEach((level, index) => {
  test(`curated level ${index + 1} is solvable and needs pushing`, () => {
    const result = analyse(parseLevel(level.text), { maxStates: 200000 });
    assert.equal(result.truncated, false);
    assert.equal(result.solvable, true);
    assert.ok(result.pushes >= 1);
  });
});
