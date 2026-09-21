const test = require("node:test");
const assert = require("node:assert/strict");
const { parseLevel, hasClosedBorder } = require("../src/engine.js");
const { PRESET_LEVELS, CURATED_LEVELS, DANCEFLOOR_CANDIDATES } = require("../src/levels.js");
const { analyse } = require("../src/solver.js");
const { solve } = require("./solve.js");

// The README's worked example is a sandbox for watching one push, not a puzzle.
const SANDBOX = /sandbox/;

for (const level of PRESET_LEVELS) {
  test(`preset "${level.name}" parses and has a closed border`, () => {
    assert.equal(hasClosedBorder(parseLevel(level.text)), true);
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
  test(`curated level ${index + 1} has a closed border`, () => {
    assert.equal(hasClosedBorder(parseLevel(level.text)), true);
  });

  test(`curated level ${index + 1} is solvable and needs pushing`, () => {
    const result = analyse(parseLevel(level.text), { maxStates: 200000 });
    assert.equal(result.truncated, false);
    assert.equal(result.solvable, true);
    assert.ok(result.pushes >= 1);
  });
});

// The dancefloor candidates being tried out: each must be a real "Clear the
// dancefloor" level (closed border, solvable) so a bad one never wastes a playtest.
DANCEFLOOR_CANDIDATES.forEach((level, index) => {
  test(`dancefloor candidate ${index + 1} is closed, marked "all", and solvable`, () => {
    const start = parseLevel(level.text);
    assert.equal(level.objective, "all");
    assert.equal(hasClosedBorder(start), true);
    const result = analyse(start, { objective: "all", maxStates: 400000, full: false });
    assert.equal(result.truncated, false);
    assert.equal(result.solvable, true);
    assert.ok(result.pushes >= 1);
  });
});
