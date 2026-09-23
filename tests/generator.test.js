const test = require("node:test");
const assert = require("node:assert/strict");
const { move, isWon, hasClosedBorder } = require("../src/engine.js");
const { analyse, regionOf } = require("../src/solver.js");
const { buildByReversal, buildByReversalWithPotion } = require("../src/generator.js");

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

test("soak steps mark the stack put back wet, and the sequence (played through the real engine, wet mechanic and all) still wins", () => {
  const rng = mulberry32(3);
  let built = 0;
  let withSoak = 0;
  for (let attempt = 0; attempt < 400 && built < 100; attempt += 1) {
    const result = buildByReversal(rng, { objective: "reach", soakChance: 0.4, minSoakDepth: 3, maxSoakDepth: 9 });
    if (!result) continue;
    built += 1;
    if (result.stepKinds.includes("soak")) {
      withSoak += 1;
      assert.ok(result.level.wet.some((w) => w), "a soak step must leave some stack wet");
    }
    assert.equal(regionOf(replay(result).state).reachesGoal, true);
  }
  assert.ok(built >= 60, `only built ${built} levels`);
  assert.ok(withSoak > 20, `only ${withSoak} levels used a soak step`);
});

// A single soak step only guarantees *that step* needs a wet block: the depth it
// gives its lava cell is picked once, directly (not accumulated the way "uncover"
// depths are), so it is never reduced by the level's other steps. But whether the
// finished level as a whole still needs it -- whether some other, unrelated stack
// or route the rest of the build happened to leave lying around can reach the goal
// without ever touching that cell -- isn't something a single reverse step can
// promise; only checking the actual solver's dried-back result can (which is what
// experiments/mud-candidates.js's evaluate() does before accepting a candidate).

// Play a potion level's reconstructed sequence: the pickup and the crossing are
// each a single directional move (not a push), so they're replayed the same way
// generator.test.js's plain replay() replays pushes -- teleport to the cell
// the move is made from, then let the real engine do the rest.
function replayWithPotion(built) {
  let state = built.level;
  const pickup = move(state, built.potionApproachDir);
  assert.equal(pickup.result, "moved");
  assert.equal(pickup.pickedUpPotion, true);
  state = pickup.state;

  for (const { from, dir } of built.sequenceBefore) {
    const outcome = move({ ...state, player: from }, dir);
    assert.equal(outcome.result, "pushed", "every recorded 'before' push must be a real push");
    state = outcome.state;
  }

  const crossed = move({ ...state, player: built.crossing.from }, built.crossing.dir);
  assert.equal(crossed.result, "moved");
  assert.equal(crossed.usedPotion, true);
  state = crossed.state;

  for (const { from, dir } of built.sequenceAfter) {
    const outcome = move({ ...state, player: from }, dir);
    assert.equal(outcome.result, "pushed", "every recorded 'after' push must be a real push");
    state = outcome.state;
  }
  return state;
}

test("potion levels: reverse-built levels are always solved by their own reconstructed sequence", () => {
  const rng = mulberry32(42);
  let built = 0;
  let withBeforePushes = 0;
  let withAfterPushes = 0;
  for (let attempt = 0; attempt < 1500 && built < 100; attempt += 1) {
    const result = buildByReversalWithPotion(rng);
    if (!result) continue;
    built += 1;
    assert.equal(hasClosedBorder(result.level), true);
    assert.equal(result.level.potions[result.potionCell], 1);
    assert.equal(result.stepKinds.includes("cross"), true);
    if (result.sequenceBefore.length > 0) withBeforePushes += 1;
    if (result.sequenceAfter.length > 0) withAfterPushes += 1;

    const finalState = replayWithPotion(result);
    assert.equal(regionOf(finalState).reachesGoal, true, "the reconstructed sequence must win");
  }
  assert.ok(built >= 60, `only built ${built} levels`);
  assert.ok(withBeforePushes > 10, `only ${withBeforePushes} levels had pushes before the crossing`);
  assert.ok(withAfterPushes > 10, `only ${withAfterPushes} levels had pushes after the crossing`);
});

// Construction alone doesn't guarantee the potion is necessary, and even once it
// is, the *recorded* pushes before/after the crossing might not be -- the same
// lesson mud-candidates.js already learned (see generator.js's "soak" comment):
// the rest of the build can supply an unrelated route the construction never
// anticipated. buildByReversalWithPotion now checks both per phase and retries
// on the spot rather than trusting construction (see its own comment), which
// raised both rates a lot -- was ~5-10% necessary and ~0% also tight, now
// comfortably higher. Still a rejection-sampling rate, not a guarantee, so this
// checks a floor, not "all of them".
test("potion levels: are necessary (the real solver can't win without the potion) and tight (the recorded pushes on both sides of the crossing are the true minimum)", () => {
  const rng = mulberry32(42);
  let built = 0;
  let necessary = 0;
  let tight = 0;
  for (let attempt = 0; attempt < 1500 && built < 100; attempt += 1) {
    const result = buildByReversalWithPotion(rng);
    if (!result) continue;
    built += 1;
    if (analyse(result.level, { objective: "reach", full: false }).solvable) continue;
    necessary += 1;

    const beforeGoals = new Uint8Array(result.level.cells.length);
    beforeGoals[result.crossing.from] = 1;
    const beforeTrue = analyse({ ...result.level, goals: beforeGoals }, { objective: "reach", full: false });
    const afterTrue = analyse({ ...result.level, player: result.crossing.cell, carried: 0 }, { objective: "reach", full: false });
    if (beforeTrue.solvable && beforeTrue.pushes === result.sequenceBefore.length &&
        afterTrue.solvable && afterTrue.pushes === result.sequenceAfter.length) tight += 1;
  }
  assert.ok(built >= 60, `only built ${built} levels`);
  assert.ok(necessary >= 25, `only ${necessary}/${built} candidates had a necessary potion`);
  assert.ok(tight >= 20, `only ${tight}/${built} candidates were also tight`);
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
