// Run with: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseLevel, formatLevel, move, isWon } = require("../src/engine.js");

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
