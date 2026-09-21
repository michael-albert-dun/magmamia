const test = require("node:test");
const assert = require("node:assert/strict");
const { parseLevel, move, isWon } = require("../src/engine.js");
const { analyse, solutionEvents, solutionCoupling, trivialDisposalStacks, regionOf } = require("../src/solver.js");
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

test("end positions: forced when there is one way to finish, several when there are more", () => {
  const forced = analyse(parseLevel("@Aa*"));
  assert.equal(forced.optimalEndStates, 1);
  assert.equal(forced.winningStates, 1);
  // Either stack can fill the lava next to it and reach the goal beside it: two
  // different finished positions.
  const open = analyse(parseLevel("a*A@Aa*"));
  assert.equal(open.pushes, 1);
  assert.equal(open.optimalEndStates, 2);
  assert.equal(open.nearEndStates, 2);
  assert.equal(open.winningStates, 2);
  assert.equal(forced.nearEndStates, 1);
});

test("the lava objective: win when no finite lava is left", () => {
  // One block, one lava cell: a single push clears it, wherever the player ends up.
  const one = analyse(parseLevel("@Aa"), { objective: "lava" });
  assert.equal(one.pushes, 1);
  assert.equal(one.optimalCount, 1);
  // Infinite lava never needs clearing, and can't be.
  assert.equal(analyse(parseLevel("@A~"), { objective: "lava" }).pushes, 0);
  // Not enough blocks for the lava: unsolvable.
  assert.equal(analyse(parseLevel("@Ab"), { objective: "lava" }).solvable, false);
  // A goal marker means nothing to this objective.
  assert.equal(analyse(parseLevel("@A.*a"), { objective: "lava" }).pushes, 2);
});

test("the all objective: lava and blocks both gone", () => {
  // The block fills the lava and is used up in doing so.
  assert.equal(analyse(parseLevel("@Aa"), { objective: "all" }).pushes, 1);
  // A spare block has to be got rid of as well: here it is pushed off the board.
  assert.equal(analyse(parseLevel("@AaB"), { objective: "all" }).pushes, 2);
  // A spare block the player can't reach can never be removed.
  assert.equal(analyse(parseLevel("@Aa#B"), { objective: "all" }).solvable, false);
  assert.equal(analyse(parseLevel("@Aa#B"), { objective: "lava" }).pushes, 1);
});

test("essential solutions ignore the order of independent pushes", () => {
  // Fill the lava on each side: two orders, but the same two pushes.
  const independent = analyse(parseLevel("aA@Aa"), { objective: "lava", detail: true });
  assert.equal(independent.pushes, 2);
  assert.equal(independent.optimalCount, 2);
  assert.equal(independent.essentialSolutions, 1);
  // Two genuinely different ways to reach a goal are two essential solutions.
  const alternatives = analyse(parseLevel("a*A@Aa*"), { detail: true });
  assert.equal(alternatives.optimalCount, 2);
  assert.equal(alternatives.essentialSolutions, 2);
  assert.equal(alternatives.essentialCapped, false);
});

test("critical states: several legal pushes, only one of which keeps the level solvable", () => {
  const level = parseLevel(".#..\na.A.\n.*#@.");
  const result = analyse(level, { detail: true });
  assert.equal(result.pushes, 2);
  assert.equal(result.firstPushes, 3);
  assert.equal(result.livePushes, 1);
  assert.equal(result.criticalStates, 1);
  assert.equal(result.maxDeadAlternatives, 2);
  // A level with no real choice has none.
  assert.equal(analyse(parseLevel("@Aa*"), { detail: true }).criticalStates, 0);
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

test("shuffle: merge two singles into a 2, then push it to lay two singles again", () => {
  // Two adjacent singles; push the left one onto the right (making a 2), then push
  // that 2 on from the left so it lays two singles further along.
  const start = parseLevel("@..AA....");
  const merge = { from: 2, dir: "right" }; // The player stands on cell 2 and pushes the single at 3 right.
  const shuffled = solutionEvents(start, [merge, { from: 3, dir: "right" }]);
  assert.ok(shuffled.has("shuffle"));
  // Just merging isn't a shuffle; neither is pushing an ordinary 2-stack.
  assert.ok(!solutionEvents(start, [merge]).has("shuffle"));
  assert.ok(!solutionEvents(parseLevel("@.B......"), [{ from: 1, dir: "right" }]).has("shuffle"));
});

test("coupling: independent shoves are loose, a chain of pushes is tight", () => {
  // Fill the lava on each side: two pushes that touch nothing in common.
  const independent = parseLevel("aA@Aa");
  const loose = solutionCoupling(independent, analyse(independent, { objective: "lava" }).path);
  assert.equal(loose.pushes, 2);
  assert.equal(loose.criticalPath, 1);
  assert.equal(loose.coupling, 0.5);
  // The caterpillar: each push sets up the next.
  const chain = parseLevel("#########\n#@.B.aa.*#\n#########");
  const tight = solutionCoupling(chain, analyse(chain).path);
  assert.equal(tight.pushes, 3);
  assert.equal(tight.criticalPath, 3);
  assert.equal(tight.coupling, 1);
});

test("trivial disposals: a stack whose only push throws it into infinite lava", () => {
  // Walls above and below, infinite lava to the right, the player on the left.
  assert.deepEqual(trivialDisposalStacks(parseLevel("#####\n#@A~#\n#####")), [7]);
  // The same stack with room to move sideways has more than one way to go.
  assert.deepEqual(trivialDisposalStacks(parseLevel(".....\n.@A~.\n.....")), []);
  // One possible direction, but it doesn't end in infinite lava: not a chore.
  assert.deepEqual(trivialDisposalStacks(parseLevel("#####\n#@A.#\n#####")), []);
});

test("hop: a stack topples over lava it only shallows", () => {
  // The first block shallows the depth-2 lava; the second lands beyond it.
  const hop = parseLevel("@Bb.*");
  assert.ok(solutionEvents(hop, [{ from: 0, dir: "right" }]).has("hop"));
  // Here the first block fills the lava completely, so nothing was crossed.
  const fill = parseLevel("@Ba.*");
  assert.ok(!solutionEvents(fill, [{ from: 0, dir: "right" }]).has("hop"));
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
      else if (r < 0.6) row.push("#");
      else if (r < 0.66) row.push("~");
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
  if (grid[gy][gx] === "#" || grid[gy][gx] === "~" || grid[gy][gx] === "@") return null;
  grid[gy][gx] += "*";
  return grid.map((row) => row.join("")).join("\n");
}

for (const objective of ["reach", "lava", "all"]) {
  test(`agrees with the step-by-step search on random levels (objective: ${objective}), and its paths replay`, () => {
    const rng = mulberry32({ reach: 12345, lava: 777, all: 4242 }[objective]);
    let compared = 0;
    let solvable = 0;
    let truncated = 0;
    while (compared < 300) {
      const text = randomLevelText(rng, 4, 5);
      if (!text) continue;
      const start = parseLevel(text);
      const fast = analyse(start, { objective });
      if (fast.truncated) {
        // Stack-heavy levels can exceed the state cap; those can't be compared.
        truncated += 1;
        continue;
      }
      const oracle = solve(text, objective);
      assert.equal(fast.solvable, oracle.length !== null, `disagreement on:\n${text}`);
      if (fast.solvable) {
        solvable += 1;
        // Replaying the reported pushes must win in exactly `pushes` pushes.
        let state = start;
        for (const { from, dir } of fast.path) {
          const outcome = move({ ...state, player: from }, dir);
          assert.equal(outcome.result, "pushed");
          state = outcome.state;
        }
        assert.equal(fast.path.length, fast.pushes);
        const won = objective === "reach" ? regionOf(state).reachesGoal || isWon(state, "reach") : isWon(state, objective);
        assert.equal(won, true, `path doesn't win:\n${text}`);
      }
      compared += 1;
    }
    // Clearing every lava cell and block is much rarer in random levels.
    const enough = objective === "all" ? 5 : 30;
    assert.ok(solvable > enough, `too few solvable samples (${solvable}) for the comparison to mean much`);
    assert.ok(truncated < 30, `too many truncated samples (${truncated})`);
  });
}
