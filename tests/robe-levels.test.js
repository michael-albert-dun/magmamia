"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseLevel } = require("../src/engine.js");
const { canCheeseGoal, canWalkToGoal } = require("../experiments/robe-retrofit.js");
const { POTION_LEVELS } = require("../src/levels.js");

// The robe should be part of the puzzle, not a way around it: see the header of
// experiments/robe-retrofit.js. Only a `false` counts as clean -- "truncated"
// means the search gave up, which proves nothing.
function start(level) {
  return { ...parseLevel(level.text), carried: level.carried };
}

// #1 is the tutorial, where walking through the magma is the whole point.

POTION_LEVELS.forEach((level, i) => {
  const n = i + 1;
  test(`robe level ${n} can't be cheesed by walking up to the crown unprotected`, () => {
    assert.equal(canCheeseGoal(parseLevel(level.text), 200000), false);
  });
  if (n === 1) return;
  test(`robe level ${n} isn't solved by just walking through one bit of magma`, () => {
    assert.equal(canWalkToGoal(start(level)), false);
  });
});
