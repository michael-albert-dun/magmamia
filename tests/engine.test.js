// Run with: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseLevel, formatLevel, hasClosedBorder, move, previewPushes, isWon } = require("../src/engine.js");
const { regionOf } = require("../src/solver.js");

// Apply each direction in turn (ignoring refusals and deaths) and return the
// resulting level text.
function play(text, dirs, options) {
  let state = parseLevel(text);
  for (const dir of dirs) state = move(state, dir, options).state;
  return formatLevel(state);
}

test("parse and format round-trip, including goals", () => {
  const text = ["#####", "#@a*.#", "#C*.z#", "#.*..#", "#####"].join("\n");
  assert.equal(formatLevel(parseLevel(text)), text);
  assert.equal(formatLevel(parseLevel("@*.")), "@*.");
});

test("parse tolerates indentation and surrounding blank lines", () => {
  assert.equal(formatLevel(parseLevel("\n  @.  \n  .a\n\n")), "@.\n.a");
});

test("parse rejects malformed levels", () => {
  assert.throws(() => parseLevel(""), /empty/);
  assert.throws(() => parseLevel("..."), /no player/);
  assert.throws(() => parseLevel("@@"), /More than one player/);
  assert.throws(() => parseLevel("@.\n."), /Row 2 has 1 cells but row 1 has 2/);
  assert.throws(() => parseLevel("@?"), /Unexpected "\?"/);
  assert.throws(() => parseLevel("@#*"), /wall can't be a goal/);
  assert.throws(() => parseLevel("*@"), /Unexpected "\*"/);
  assert.throws(() => parseLevel("@**"), /Unexpected "\*"/);
});

test("the worked example from the README", () => {
  const before = parseLevel("@Eba.#");
  const outcome = move(before, "right");
  assert.equal(outcome.result, "pushed");
  assert.equal(formatLevel(outcome.state), ".@a.C#");
  assert.deepEqual(outcome.drops, [2, 3, 4, 4, 4]);
  assert.equal(outcome.height, 5);
  assert.equal(formatLevel(before), "@Eba.#", "the input state is not mutated");
});

test("walking on floor", () => {
  assert.equal(play("@..", ["right", "right"]), "..@");
  assert.equal(move(parseLevel("@."), "right").result, "moved");
});

test("walls block movement without spending a move", () => {
  const outcome = move(parseLevel("@#"), "right");
  assert.equal(outcome.result, "refused");
  assert.equal(outcome.reason, "wall");
});

test("lava is fatal by default and refused when lavaFatal is off", () => {
  const fatal = move(parseLevel("@a"), "right");
  assert.equal(fatal.result, "died");
  assert.equal(fatal.reason, "lava");
  const gentle = move(parseLevel("@a"), "right", { lavaFatal: false });
  assert.equal(gentle.result, "refused");
  assert.equal(gentle.reason, "lava");
});

test("the board edge is infinitely deep lava", () => {
  const fatal = move(parseLevel("@."), "left");
  assert.equal(fatal.result, "died");
  assert.equal(fatal.reason, "edge");
  assert.equal(move(parseLevel("@."), "up", { lavaFatal: false }).result, "refused");
});

test("a stack against a wall cannot be pushed into it", () => {
  const outcome = move(parseLevel("@C#"), "right");
  assert.equal(outcome.result, "refused");
  assert.equal(outcome.reason, "stack-blocked");
});

test("blocks landing on floor start stacks, and on a stack add one without toppling it", () => {
  assert.equal(play("@B..", ["right"]), ".@AA");
  // The second block lands on the height-3 stack, making 4; that stack stays put.
  assert.equal(play("@B.C.", ["right"]), ".@AD.");
});

test("blocks landing on lava make it shallower; depth 0 is floor, not a stack", () => {
  assert.equal(play("@Bcc.", ["right"]), ".@bb.");
  assert.equal(play("@Baa.", ["right"]), ".@...");
});

test("blocks pushed off the edge are lost", () => {
  const outcome = move(parseLevel("@C."), "right");
  assert.equal(outcome.result, "pushed");
  assert.equal(formatLevel(outcome.state), ".@A");
  assert.deepEqual(outcome.drops, [2, -1, -1]);
  // A stack directly against the edge can still be pushed; its blocks vanish.
  assert.equal(play("@B", ["right"]), ".@");
});

test("blocks reaching a wall pile on the last cell before it", () => {
  assert.equal(play("@Ee.#", ["right"]), ".@dD#");
  // The pile lands on lava, so it fills it first and then builds a stack:
  // depth 3 -> 2 (first block), then -> 1, 0, and finally a stack of 1.
  assert.equal(play("@Dc#", ["right"]), ".@A#");
});

test("goals stay put under stacks, on lava, and after a stack leaves", () => {
  // The stack covers the goal; pushing it off leaves the player standing on it.
  const covered = parseLevel("@.B*.#");
  const approached = move(covered, "right").state;
  assert.equal(isWon(approached, "reach"), false);
  const pushed = move(approached, "right");
  assert.equal(pushed.result, "pushed");
  assert.equal(isWon(pushed.state, "reach"), true);
  // A block landing on a goal cell covers it; the goal marker remains.
  assert.equal(play("@A.*", ["right"]), ".@A*");
  // Lava on a goal has to be filled before the goal is reachable.
  assert.equal(play("@Aa*", ["right"]), ".@.*");
});

test("pushes work in every direction", () => {
  assert.equal(play(["...", ".@.", ".B.", "..."].join("\n"), ["down"]), ["...", "...", ".@.", ".A."].join("\n"));
  assert.equal(play(["...", ".B.", ".@.", "..."].join("\n"), ["up"]), [".A.", ".@.", "...", "..."].join("\n"));
  assert.equal(play(".B@", ["left"]), "A@.");
});

test("objectives", () => {
  const level = parseLevel("@a.C*");
  assert.equal(isWon(level, "lava"), false);
  assert.equal(isWon(level, "all"), false);
  assert.equal(isWon(parseLevel("@.C"), "lava"), true);
  assert.equal(isWon(parseLevel("@.C"), "all"), false);
  assert.equal(isWon(parseLevel("@#."), "all"), true);
  assert.equal(isWon(parseLevel("@*"), "reach"), true);
  assert.equal(isWon(parseLevel("@."), "reach"), false, "no goal, never won");
  assert.throws(() => isWon(level, "nope"), /Unknown objective/);
});

test("push previews show where each block would land", () => {
  // The README's worked example: one block on each of two lava cells, and the
  // last three piled on the cell before the wall.
  const previews = previewPushes(parseLevel("@Eba.#"));
  assert.equal(previews.length, 1);
  assert.equal(previews[0].direction, "right");
  assert.deepEqual(previews[0].landings, [
    { x: 2, y: 0, count: 1, lost: false },
    { x: 3, y: 0, count: 1, lost: false },
    { x: 4, y: 0, count: 3, lost: false }
  ]);
});

test("push previews put lost blocks on the border tile past the edge", () => {
  const previews = previewPushes(parseLevel("@C."));
  assert.deepEqual(previews[0].landings, [
    { x: 2, y: 0, count: 1, lost: false },
    { x: 3, y: 0, count: 2, lost: true }
  ]);
  // A stack right at the edge loses everything onto the tile just outside it.
  assert.deepEqual(previewPushes(parseLevel("@B"))[0].landings, [{ x: 2, y: 0, count: 2, lost: true }]);
});

test("push previews skip stacks that can't be pushed and cover every adjacent stack", () => {
  assert.deepEqual(previewPushes(parseLevel("@C#")), []);
  assert.deepEqual(previewPushes(parseLevel("@..")), []);
  const both = previewPushes(parseLevel("...\nA@A\n..."));
  assert.deepEqual(both.map((p) => p.direction).sort(), ["left", "right"]);
});

test("push previews agree with what a push actually does", () => {
  const state = parseLevel("..a..\n.@C.b\n.....");
  const [preview] = previewPushes(state);
  const outcome = move(state, preview.direction);
  const landedCells = new Set(preview.landings.filter((l) => !l.lost).map((l) => l.y * state.cols + l.x));
  assert.deepEqual([...landedCells].sort(), [...new Set(outcome.drops.filter((d) => d >= 0))].sort());
});

test("infinite lava cells parse, print and can't be goals", () => {
  const text = "~~~~\n~@a~\n~.C~\n~~~~";
  assert.equal(formatLevel(parseLevel(text)), text);
  assert.throws(() => parseLevel("@~*"), /Infinite lava can't be a goal/);
});

test("stepping onto infinite lava is fatal, or refused when lavaFatal is off", () => {
  const fatal = move(parseLevel("@~"), "right");
  assert.equal(fatal.result, "died");
  assert.equal(fatal.reason, "abyss");
  const gentle = move(parseLevel("@~"), "right", { lavaFatal: false });
  assert.equal(gentle.result, "refused");
  assert.equal(gentle.reason, "abyss");
});

test("blocks landing on infinite lava are lost and it never changes", () => {
  const outcome = move(parseLevel("@C.~"), "right");
  assert.equal(outcome.result, "pushed");
  // Blocks land on the floor, on the infinite lava (lost), and then off the grid.
  assert.equal(formatLevel(outcome.state), ".@A~");
  assert.deepEqual(outcome.drops, [2, 3, -1]);
  assert.equal(outcome.state.cells[3], 0, "the abyss cell still holds nothing");
});

test("a stack next to infinite lava can be pushed into it, unlike a wall", () => {
  const result = move(parseLevel("@B~"), "right");
  assert.equal(result.result, "pushed");
  assert.equal(formatLevel(result.state), ".@~");
  assert.equal(move(parseLevel("@B#"), "right").result, "refused");
});

test("blocks piling against a wall after infinite lava are lost with it", () => {
  // Second block would pile on the cell before the wall, which is the abyss.
  assert.equal(play("@B~#", ["right"]), ".@~#");
});

test("closed borders", () => {
  assert.equal(hasClosedBorder(parseLevel("~~~\n~@~\n~~~")), true);
  assert.equal(hasClosedBorder(parseLevel("###\n#@~\n###")), true, "a mix of walls and infinite lava");
  assert.equal(hasClosedBorder(parseLevel("~~~\n~@.\n~~~")), false, "a floor cell on the edge");
  assert.equal(hasClosedBorder(parseLevel("@Eba.#")), false);
});

// "There will be mud": waterlogged blocks, K-T (height 1-10), alongside dry A-J.
test("waterlogged stacks parse, print and stay under the dry ones' letters", () => {
  const text = ["######", "#@Kk.#", "#T.J.#", "######"].join("\n");
  assert.equal(formatLevel(parseLevel(text)), text);
  assert.throws(() => parseLevel("@U"), /Unexpected "U"/);
});

test("a waterlogged block fills lava outright, however deep, using up just the one block", () => {
  // Dry: a height-1 block only shallows depth-5 lava by one.
  assert.equal(play("@Ae.", ["right"]), ".@d.");
  // Wet: the same height-1 block fills it completely in one go.
  assert.equal(play("@Ke.", ["right"]), ".@..");
});

test("a waterlogged block waterlogs a dry stack it lands on, and the reverse keeps it wet", () => {
  // The README's own example: a toppled wet stack adds one block to a dry stack.
  assert.equal(play("@KB.", ["right"]), ".@M.");
  // A dry block landing on an already-wet stack doesn't wash it clean again.
  assert.equal(play("@AK.", ["right"]), ".@L.");
});

test("only the block that actually touches a wet stack is waterlogged, not the rest of its push", () => {
  // A dry height-3 stack spreads one block per cell: only the first lands on the
  // existing wet single, so only that landing grows and stays wet (L); the other two
  // land on bare floor and are ordinary dry singles, not waterlogged by association.
  assert.equal(play("@CK..", ["right"]), ".@LAA");
  // Unless a wall piles every one of those blocks onto that same wet cell instead:
  // then all three do touch it, and it grows wet the whole way (N).
  assert.equal(play("@CK#", ["right"]), ".@N#");
});

test("a stack's blocks are all wet or all dry, so a toppled wet stack lands wet blocks on everything", () => {
  // Height-4 wet stack (N) toppling over depth-2 lava, floor, a dry stack (C) and floor:
  // the lava is fully solidified and every block it lands on comes down wet.
  assert.equal(play("@Nb.C.", ["right"]), ".@.KNK");
});

test("infinite lava swallows a waterlogged block just like a dry one", () => {
  assert.equal(play("@K~", ["right"]), ".@~");
});

test("formatLevel rejects a stack taller than a letter can hold", () => {
  const tall = parseLevel("@J.");
  tall.cells[2] = 11;
  assert.throws(() => formatLevel(tall), /more than the 10 a stack's letter can hold/);
});

// Potions: an item on the floor (`!`), picked up by walking onto it, that buys
// exactly one otherwise-fatal step onto lava before it's used up.
test("potions parse, print, and are picked up by walking onto them", () => {
  assert.equal(formatLevel(parseLevel("@.!.")), "@.!.");
  const picked = play("@.!.", ["right", "right"]);
  assert.equal(picked, "..@.", "the potion is gone from the board once collected");
});

test("potions are fragile: a block landing on an uncollected one destroys it", () => {
  const smashed = move(parseLevel("@A!"), "right").state; // Push A right, landing on the potion cell.
  assert.equal(smashed.cells[2], 1, "the block still lands and forms a stack");
  assert.equal(smashed.potions[2], 0, "the potion under it is gone, not just covered");
  // A block landing anywhere else leaves an untouched potion alone.
  const untouched = move(parseLevel("@A.!"), "right").state;
  assert.equal(untouched.potions[3], 1);
});

test("a carried potion survives exactly one step onto lava, then it's spent", () => {
  const carrying = move(parseLevel("@!aa"), "right").state; // Walk onto the potion.
  assert.equal(carrying.carried, 1);
  const crossed = move(carrying, "right");
  assert.equal(crossed.result, "moved");
  assert.equal(crossed.usedPotion, true);
  assert.equal(crossed.state.carried, 0);
  assert.equal(formatLevel(crossed.state), "..@a"); // Player now stands on the first lava cell.
  // No potion left: the very next lava cell is fatal, exactly as normal.
  const fatal = move(crossed.state, "right");
  assert.equal(fatal.result, "died");
  assert.equal(fatal.reason, "lava");
});

test("a potion does not buy a step onto the abyss (infinite lava), or off an unclosed board's edge", () => {
  const carrying = move(parseLevel("@!~"), "right").state;
  assert.equal(carrying.carried, 1);
  const intoAbyss = move(carrying, "right");
  assert.equal(intoAbyss.result, "died");
  assert.equal(intoAbyss.reason, "abyss");
  // The state a death reports is the one before the fatal step, so the potion is
  // still shown as held -- the abyss refuses it outright, rather than spending it.
  assert.equal(intoAbyss.state.carried, 1);
  // Stepping off an unclosed board's edge has no cell to survive on either, potion
  // or not -- "beyond the grid" isn't a real cell to stand on.
  const atTheEdge = move(parseLevel("@!"), "right").state; // Same idea, no border past the potion.
  const fellOff = move(atTheEdge, "right");
  assert.equal(fellOff.result, "died");
  assert.equal(fellOff.reason, "edge");
});

test("gentle lava doesn't change how a potion works: it still succeeds and is spent", () => {
  const carrying = move(parseLevel("@!a."), "right").state;
  const crossed = move(carrying, "right", { lavaFatal: false });
  assert.equal(crossed.result, "moved");
  assert.equal(crossed.usedPotion, true);
});

test("the potion tutorial level plays through as intended", () => {
  const { POTION_LEVELS } = require("../src/levels.js");
  let state = parseLevel(POTION_LEVELS[0].text);
  for (const dir of ["right", "right", "right", "right", "right"]) state = move(state, dir).state;
  assert.equal(isWon(state, "reach"), true);
});

test("the potion+pushing tutorial level (potions and a hop-and-return push) plays through as intended", () => {
  const { POTION_LEVELS } = require("../src/levels.js");
  let state = parseLevel(POTION_LEVELS[1].text);
  const moves = [
    "right", "right", // walk to the potion, pick it up
    "down", // step onto the lava band, potion-protected
    "down", // push B down: hops the goal cell (shallows it, doesn't fill it), leaves a block one row further on
    "left", "left", "down", "down", "down", "right", "right", // the U-turn to approach from below
    "up", // push the landed block back up, filling the goal cell
    "up" // walk onto the now-floor goal cell
  ];
  for (const dir of moves) {
    const outcome = move(state, dir);
    assert.notEqual(outcome.result, "died", `died on move "${dir}": ${outcome.reason}`);
    state = outcome.state;
  }
  assert.equal(isWon(state, "reach"), true);
});

test("the third potion level (a second tutorial) plays through as intended", () => {
  const { POTION_LEVELS } = require("../src/levels.js");
  let state = parseLevel(POTION_LEVELS[2].text);
  const moves = [
    "right", "right", "right", // walk to the potion, pick it up
    "down", // step onto the lava band, potion-protected
    "down", // walk down to the box
    "left" // push the box off the goal
  ];
  for (const dir of moves) {
    const outcome = move(state, dir);
    assert.notEqual(outcome.result, "died", `died on move "${dir}": ${outcome.reason}`);
    state = outcome.state;
  }
  assert.equal(isWon(state, "reach"), true);
});

// Levels 4 on are generated (see the comment above POTION_LEVELS), so unlike the
// hand-built ones above there's no walked-through solution to narrate in
// direction names -- this replays the exact sequence experiments/potion-candidates.js
// captured at generation time, teleporting to each push's cell the same way
// generator.test.js's own replay() does (the player can walk anywhere in their
// region between pushes, so where they came from doesn't matter to move()).
function playGeneratedPotionLevel(text, potionApproachDir, crossing, sequenceBefore, sequenceAfter) {
  let state = parseLevel(text);
  // potionApproachDir is relative to the level's own starting cell, so the
  // pickup has to happen first, before any teleport-to-a-push-cell moves the
  // player away from it.
  const pickup = move(state, potionApproachDir);
  assert.equal(pickup.pickedUpPotion, true);
  state = pickup.state;
  for (const { from, dir } of sequenceBefore) {
    const outcome = move({ ...state, player: from }, dir);
    assert.equal(outcome.result, "pushed");
    state = outcome.state;
  }
  const crossed = move({ ...state, player: crossing.from }, crossing.dir);
  assert.equal(crossed.usedPotion, true);
  state = crossed.state;
  for (const { from, dir } of sequenceAfter) {
    const outcome = move({ ...state, player: from }, dir);
    assert.equal(outcome.result, "pushed");
    state = outcome.state;
  }
  return state;
}

test("the fourth potion level (generated) plays through as intended", () => {
  const { POTION_LEVELS } = require("../src/levels.js");
  const state = playGeneratedPotionLevel(
    POTION_LEVELS[3].text, "down", { from: 9, dir: "right" },
    [{ from: 25, dir: "up" }],
    [{ from: 27, dir: "down" }, { from: 50, dir: "up" }]
  );
  assert.equal(regionOf(state).reachesGoal, true);
});

test("the fifth potion level (generated) plays through as intended", () => {
  const { POTION_LEVELS } = require("../src/levels.js");
  const state = playGeneratedPotionLevel(
    POTION_LEVELS[4].text, "down", { from: 33, dir: "down" },
    [{ from: 12, dir: "left" }, { from: 10, dir: "down" }, { from: 30, dir: "left" }],
    [{ from: 46, dir: "left" }]
  );
  assert.equal(regionOf(state).reachesGoal, true);
});

test("the sixth potion level (generated) plays through as intended", () => {
  const { POTION_LEVELS } = require("../src/levels.js");
  const state = playGeneratedPotionLevel(
    POTION_LEVELS[5].text, "right", { from: 50, dir: "up" },
    [{ from: 51, dir: "left" }],
    [{ from: 13, dir: "down" }, { from: 45, dir: "left" }]
  );
  assert.equal(regionOf(state).reachesGoal, true);
});

test("the seventh potion level (generated) plays through as intended", () => {
  const { POTION_LEVELS } = require("../src/levels.js");
  const state = playGeneratedPotionLevel(
    POTION_LEVELS[6].text, "right", { from: 51, dir: "right" },
    [{ from: 26, dir: "down" }],
    [{ from: 54, dir: "up" }, { from: 30, dir: "left" }, { from: 28, dir: "down" }]
  );
  assert.equal(regionOf(state).reachesGoal, true);
});

test("push previews put lost blocks on the infinite lava cell that swallows them", () => {
  const previews = previewPushes(parseLevel("~~~~~\n~@B.~\n~~~~~"));
  assert.deepEqual(previews[0].landings, [
    { x: 3, y: 1, count: 1, lost: false },
    { x: 4, y: 1, count: 1, lost: true }
  ]);
});
