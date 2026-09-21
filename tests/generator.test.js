const test = require("node:test");
const assert = require("node:assert/strict");
const { move, isWon, hasClosedBorder } = require("../src/engine.js");
const { analyse, regionOf } = require("../src/solver.js");
const { buildByReversal } = require("../src/generator.js");

function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Play the recorded forward pushes through the real engine.
function replay(built) {
  let state = built.level;
  let lost = 0;
  for (const { from, dir } of built.sequence) {
    const outcome = move({ ...state, player: from }, dir);
    assert.equal(outcome.result, "pushed", "every recorded push must be a real push");
    lost += outcome.drops.filter((d) => d < 0 || state.abyss[d]).length;
    state = outcome.state;
  }
  return { state, lost };
}

for (const objective of ["reach", "lava", "all"]) {
  test(`reverse-built levels are solved by their own sequence (objective: ${objective})`, () => {
    const rng = mulberry32({ reach: 11, lava: 22, all: 33 }[objective]);
    let built = 0;
    let disposals = 0;
    for (let attempt = 0; attempt < 400 && built < 150; attempt += 1) {
      const result = buildByReversal(rng, { objective });
      if (!result) continue;
      built += 1;
      assert.equal(hasClosedBorder(result.level), true);
      const { state, lost } = replay(result);
      const won = objective === "reach" ? regionOf(state).reachesGoal : isWon(state, objective);
      assert.equal(won, true, "the recorded sequence must win");
      if (lost > 0) disposals += 1;
      // The solver can only do as well or better than the sequence it was built with.
      const solved = analyse(result.level, { objective, maxStates: 30000 });
      if (!solved.truncated) {
        assert.equal(solved.solvable, true);
        assert.ok(solved.pushes <= result.sequence.length, `${solved.pushes} > ${result.sequence.length}`);
      }
    }
    assert.ok(built >= 100, `only built ${built} levels`);
    // Surplus blocks that have to be thrown away should show up regularly.
    assert.ok(disposals > 5, `only ${disposals} levels involved throwing blocks away`);
  });
}

test("reverse-built levels have interior lava and stacks, and a mix of border walls and infinite lava", () => {
  const rng = mulberry32(5);
  let withLava = 0;
  let withStacks = 0;
  let borderWalls = 0;
  let built = 0;
  for (let attempt = 0; attempt < 200 && built < 100; attempt += 1) {
    const result = buildByReversal(rng, { objective: "all", ringWallChance: 0.3 });
    if (!result) continue;
    built += 1;
    const { level } = result;
    if (level.cells.some((v) => v < 0)) withLava += 1;
    if (level.cells.some((v) => v > 0)) withStacks += 1;
    if (level.walls.some((w, i) => w && (i % level.cols === 0 || i % level.cols === level.cols - 1 || i < level.cols || i >= level.cells.length - level.cols))) borderWalls += 1;
  }
  assert.ok(withLava > 80 && withStacks > 80, `lava ${withLava}, stacks ${withStacks}`);
  assert.ok(borderWalls > 50, `only ${borderWalls} levels had a border wall`);
});

test("with no disposal steps, blocks and lava depth balance exactly (surplus 0)", () => {
  const rng = mulberry32(8);
  let built = 0;
  for (let attempt = 0; attempt < 300 && built < 80; attempt += 1) {
    const result = buildByReversal(rng, { objective: "all", disposalChance: 0 });
    if (!result) continue;
    built += 1;
    let blocks = 0;
    let lava = 0;
    for (const v of result.level.cells) { if (v > 0) blocks += v; else lava -= v; }
    assert.equal(blocks - lava, 0, "surplus must be 0 when nothing is thrown away");
    const { state } = replay(result);
    assert.equal(isWon(state, "all"), true);
  }
  assert.ok(built >= 60);
});

test("transport steps carry blocks without leaving lava, and the sequence still wins", () => {
  const rng = mulberry32(9);
  let built = 0;
  let withTransport = 0;
  for (let attempt = 0; attempt < 300 && built < 80; attempt += 1) {
    const result = buildByReversal(rng, { objective: "all", transportChance: 0.7, minPushes: 6, maxPushes: 9 });
    if (!result) continue;
    built += 1;
    if (result.stepKinds.includes("transport")) withTransport += 1;
    assert.equal(isWon(replay(result).state, "all"), true);
  }
  assert.ok(withTransport > 40, `only ${withTransport} levels used a transport step`);
});
