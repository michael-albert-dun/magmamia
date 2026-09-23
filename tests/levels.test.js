const test = require("node:test");
const assert = require("node:assert/strict");
const { parseLevel, hasClosedBorder } = require("../src/engine.js");
const { PRESET_LEVELS, CURATED_LEVELS, DANCEFLOOR_ROUND_1, DANCEFLOOR_ROUND_2, DANCEFLOOR_CANDIDATES, MUD_ROUND_1, MUD_ROUND_2, POTION_LEVELS, BRIDGE_DENSE, BRIDGE_OPEN } = require("../src/levels.js");
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
const DANCEFLOOR_SETS = { "round 1": DANCEFLOOR_ROUND_1, "round 2": DANCEFLOOR_ROUND_2, "latest round": DANCEFLOOR_CANDIDATES };
for (const [name, levels] of Object.entries(DANCEFLOOR_SETS)) {
  levels.forEach((level, index) => {
    test(`dancefloor candidate ${index + 1} (${name}) is closed, marked "all", and solvable`, () => {
      const start = parseLevel(level.text);
      assert.equal(level.objective, "all");
      assert.equal(hasClosedBorder(start), true);
      const result = analyse(start, { objective: "all", maxStates: 400000, full: false });
      assert.equal(result.truncated, false);
      assert.equal(result.solvable, true);
      assert.ok(result.pushes >= 1);
    });
  });
}

// "There will be mud": each level must be solvable, and essentially wet -- replacing
// every waterlogged stack (K-T) with the matching dry letter (A-J, same height) must
// make it unsolvable, or the mud isn't doing any real work.
function dried(text) {
  return text.replace(/[K-T]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 10));
}
const MUD_SETS = { "mud round 1": MUD_ROUND_1, "mud round 2": MUD_ROUND_2 };
for (const [name, levels] of Object.entries(MUD_SETS)) {
  levels.forEach((level, index) => {
    test(`${name} level ${index + 1} is closed and solvable`, () => {
      const start = parseLevel(level.text);
      assert.equal(hasClosedBorder(start), true);
      const result = analyse(start, { objective: "reach", maxStates: 400000, full: false });
      assert.equal(result.truncated, false);
      assert.equal(result.solvable, true);
    });

    test(`${name} level ${index + 1} is unsolvable with every waterlogged stack made dry`, () => {
      const result = analyse(parseLevel(dried(level.text)), { objective: "reach", maxStates: 400000, full: false });
      assert.equal(result.truncated, false);
      assert.equal(result.solvable, false);
    });
  });
}

// Bridge candidates (experiments/bridge-candidates.js): closed border, on top
// of the `optimum` check already covered by PLAYABLE_SETS below.
const BRIDGE_SETS = { "bridge dense": BRIDGE_DENSE, "bridge open": BRIDGE_OPEN };
for (const [name, levels] of Object.entries(BRIDGE_SETS)) {
  levels.forEach((level, index) => {
    test(`${name} level ${index + 1} has a closed border`, () => {
      assert.equal(hasClosedBorder(parseLevel(level.text)), true);
    });
  });
}

// Potions: closed border only. The exact solver's analyse()/regionOf() don't
// understand them yet (regionOf treats lava as always impassable, potion or no
// potion), so it would wrongly call a potion level unsolvable; solvability is
// instead checked directly against the real engine in tests/engine.test.js. No
// `optimum` either, since the solver can't rate these levels.
POTION_LEVELS.forEach((level, index) => {
  test(`potion level ${index + 1} has a closed border`, () => {
    assert.equal(hasClosedBorder(parseLevel(level.text)), true);
  });
});

// Each playable level's `optimum` (the par shown when it is solved) must be the
// solver's fewest pushes, so a level edit that changes the puzzle can't leave a stale one.
const PLAYABLE_SETS = { curated: CURATED_LEVELS, "dancefloor round 1": DANCEFLOOR_ROUND_1, "dancefloor round 2": DANCEFLOOR_ROUND_2, "dancefloor latest": DANCEFLOOR_CANDIDATES, "mud round 1": MUD_ROUND_1, "mud round 2": MUD_ROUND_2, "bridge dense": BRIDGE_DENSE, "bridge open": BRIDGE_OPEN };
for (const [name, levels] of Object.entries(PLAYABLE_SETS)) {
  levels.forEach((level, index) => {
    test(`${name} level ${index + 1} has the right optimum`, () => {
      const result = analyse(parseLevel(level.text), { objective: level.objective || "reach", maxStates: 2000000, full: false });
      assert.equal(result.truncated, false);
      assert.equal(level.optimum, result.pushes);
    });
  });
}
