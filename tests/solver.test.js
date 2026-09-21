const test = require("node:test");
const assert = require("node:assert/strict");
const { parseLevel, move, isWon } = require("../src/engine.js");
const { analyse, solutionEvents, regionOf } = require("../src/solver.js");
const { PRESET_LEVELS } = require("../src/levels.js");
const { solve } = require("./solve.js");

function preset(name) {
  return parseLevel(PRESET_LEVELS.find((level) => level.name === name).text);
}

test("known push counts for the preset levels", () => {
  assert.equal(analyse(preset("Crossing the moat")).pushes, 1);
  assert.equal(analyse(preset("Caterpillar")).pushes, 3);
  assert.equal(analyse(preset("Covered goal")).pushes, 1);
  const moat = analyse(preset("Crossing the moat"));
  assert.equal(moat.optimalCount, 1);
  assert.equal(moat.slack, 0, "the three blocks are all used");
});

test("a level with no way to the goal is unsolvable", () => {
  const result = analyse(parseLevel("@aa.*"));
  assert.equal(result.solvable, false);
});

test("slack counts blocks that can be left over", () => {
  // The single block exactly fills the lava: nothing to spare.
  assert.equal(analyse(parseLevel("@Aa*")).slack, 0);
  // Add an unused stack of 3 elsewhere and those blocks are all spare.
  assert.equal(analyse(parseLevel("@Aa*\n.C.")).slack, 3);
});

test("first pushes and live pushes", () => {
  // Pushing the stack up from below throws it off the board, so only one of
  // the two possible first pushes leaves the level solvable.
  const result = analyse(parseLevel("@Aa*\n..."));
  assert.equal(result.pushes, 1);
  assert.equal(result.firstPushes, 2);
  assert.equal(result.livePushes, 1);
  assert.ok(result.deadFraction > 0 && result.deadFraction < 1);
});

test("a level already won needs no pushes", () => {
  assert.equal(analyse(parseLevel("@.*")).pushes, 0);
});

test("solution events", () => {
  const piled = parseLevel("@..B*.#");
  assert.deepEqual([...solutionEvents(piled, analyse(piled).path)], ["pile"]);
  // The block covers the goal, and is then pushed off the edge to uncover it.
  const covered = parseLevel("@A.*");
  assert.deepEqual([...solutionEvents(covered, analyse(covered).path)].sort(), ["cover", "edge"]);
});

// A small seeded generator for random levels, to cross-check the push-level
// solver against the independent step-by-step search in tests/solve.js.
function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomLevelText(rng, rows, cols) {
  const grid = [];
  for (let y = 0; y < rows; y += 1) {
    const row = [];
    for (let x = 0; x < cols; x += 1) {
      const r = rng();
      if (r < 0.5) row.push(".");
      else if (r < 0.62) row.push("#");
      else if (r < 0.8) row.push(String.fromCharCode(97 + Math.floor(rng() * 3)));
      else row.push(String.fromCharCode(65 + Math.floor(rng() * 4)));
    }
    grid.push(row);
  }
  const free = [];
  grid.forEach((row, y) => row.forEach((ch, x) => ch === "." && free.push([x, y])));
  if (free.length < 2) return null;
  const [px, py] = free.splice(Math.floor(rng() * free.length), 1)[0];
  grid[py][px] = "@";
  const [gx, gy] = [Math.floor(rng() * cols), Math.floor(rng() * rows)];
  if (grid[gy][gx] === "#" || grid[gy][gx] === "@") return null;
  grid[gy][gx] += "*";
  return grid.map((row) => row.join("")).join("\n");
}

test("agrees with the step-by-step search on random levels, and its paths replay", () => {
  const rng = mulberry32(12345);
  let compared = 0;
  let solvable = 0;
  let truncated = 0;
  while (compared < 300) {
    const text = randomLevelText(rng, 4, 5);
    if (!text) continue;
    const start = parseLevel(text);
    const fast = analyse(start);
    if (fast.truncated) {
      // Stack-heavy levels can exceed the state cap; those can't be compared.
      truncated += 1;
      continue;
    }
    const oracle = solve(text, "reach");
    assert.equal(fast.solvable, oracle.length !== null, `disagreement on:\n${text}`);
    if (fast.solvable) {
      solvable += 1;
      // Replaying the reported pushes must reach the goal in exactly `pushes` pushes.
      let state = start;
      for (const { from, dir } of fast.path) {
        const outcome = move({ ...state, player: from }, dir);
        assert.equal(outcome.result, "pushed");
        state = outcome.state;
      }
      assert.equal(fast.path.length, fast.pushes);
      assert.equal(regionOf(state).reachesGoal || isWon(state, "reach"), true, `path doesn't win:\n${text}`);
    }
    compared += 1;
  }
  assert.ok(solvable > 30, `too few solvable samples (${solvable}) for the comparison to mean much`);
  assert.ok(truncated < 30, `too many truncated samples (${truncated})`);
});
