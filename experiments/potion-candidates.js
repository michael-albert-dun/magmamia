// The cheap first pass at generating potion levels: plain rejection sampling, no
// hill-climbing. src/generator.js's buildByReversalWithPotion() is mechanically
// sound (every candidate replays correctly through the real engine -- see
// tests/generator.test.js) but doesn't guarantee the potion is *necessary*: the
// rest of the build can supply an unrelated route, the same lesson mud-candidates.js
// already learned. This script builds, checks that via analyse() (which can never
// use the potion -- see potionRegions/analyse's "pushed"-only filter in solver.js),
// and keeps the ones that pass, deduplicated by level text. No scoring, no mutation:
// the point is to see what raw candidates look like before deciding whether that's
// worth building further (see the design discussion in the session this came from).
//
// A second, separate gap turned out to matter just as much: the potion being
// necessary doesn't mean the *recorded* pushes before/after the crossing are.
// buildByReversalWithPotion places the goal by checking reachability on a fully
// *cleared* board (same trick buildByReversal always used), which is far more
// permissive than "reachable using only what's true without ever doing those
// pushes" -- with as few as 0-4 pushes of insulation by default, real candidates
// were routinely solvable in 0-1 pushes after crossing (sometimes before it too)
// despite recording 3-4. So every candidate is also checked against the true
// minimum: analyse() on a clone goaled at `crossing.from` (ignoring the potion
// entirely, since analyse() can't use it anyway) gives the true minimum before
// the crossing, and analyse() starting from `crossing.cell` gives the true
// minimum after it; both must exactly match what was recorded, or the candidate
// is rejected as having slack. This is a much stricter bar than the necessity
// check alone -- see the yield the two print separately.
//
//   node experiments/potion-candidates.js --seed 1 --attempts 3000 --top 12
//
// Options: --seed (1), --attempts (3000), --top (12), --size (6),
// --min-pushes-before/--max-pushes-before (0/4, the movement between picking the
// potion up and reaching the crossing), --min-pushes-after/--max-pushes-after
// (0/4, the finish once across), --min-total-pushes (0, reject candidates with
// fewer pushes than this across both phases combined).
const { formatLevel, move } = require("../src/engine.js");
const { analyse, regionOf } = require("../src/solver.js");
const { buildByReversalWithPotion } = require("../src/generator.js");

const args = parseArgs(process.argv.slice(2));
const SEED = Number(args.seed ?? 1);
const ATTEMPTS = Number(args.attempts ?? 3000);
const TOP = Number(args.top ?? 12);
const SIZE = Number(args.size ?? 6);
const MIN_PUSHES_BEFORE = Number(args["min-pushes-before"] ?? 0);
const MAX_PUSHES_BEFORE = Number(args["max-pushes-before"] ?? 4);
const MIN_PUSHES_AFTER = Number(args["min-pushes-after"] ?? 0);
const MAX_PUSHES_AFTER = Number(args["max-pushes-after"] ?? 4);
const MIN_TOTAL_PUSHES = Number(args["min-total-pushes"] ?? 0);

function parseArgs(list) {
  const out = {};
  for (let i = 0; i < list.length; i += 2) out[list[i].replace(/^--/, "")] = list[i + 1];
  return out;
}

function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(SEED);

// Belt and suspenders: tests/generator.test.js already found this replays
// correctly 100% of the time at the default options, but these are handed
// straight to Michael to play, so check again rather than assume it still holds
// at whatever options this run used.
function replayWithPotion(result) {
  let state = result.level;
  const pickup = move(state, result.potionApproachDir);
  if (pickup.result !== "moved" || !pickup.pickedUpPotion) return false;
  state = pickup.state;
  for (const { from, dir } of result.sequenceBefore) {
    const outcome = move({ ...state, player: from }, dir);
    if (outcome.result !== "pushed") return false;
    state = outcome.state;
  }
  const crossed = move({ ...state, player: result.crossing.from }, result.crossing.dir);
  if (crossed.result !== "moved" || !crossed.usedPotion) return false;
  state = crossed.state;
  for (const { from, dir } of result.sequenceAfter) {
    const outcome = move({ ...state, player: from }, dir);
    if (outcome.result !== "pushed") return false;
    state = outcome.state;
  }
  return regionOf(state).reachesGoal;
}

// The true minimum pushes to reach `crossing.from` from the level's actual
// start, ignoring the potion/crossing entirely (analyse() always does, since it
// only ever follows "pushed" transitions) by goaling a clone there instead of at
// the real goal.
function trueBeforePushes(result) {
  const goals = new Uint8Array(result.level.cells.length);
  goals[result.crossing.from] = 1;
  return analyse({ ...result.level, goals }, { objective: "reach", full: false });
}

// The true minimum pushes to reach the real goal starting from right after the
// crossing (player already on the lava cell, potion already spent).
function trueAfterPushes(result) {
  return analyse({ ...result.level, player: result.crossing.cell, carried: 0 }, { objective: "reach", full: false });
}

const found = new Map(); // text -> { level, before, after, total }
let built = 0;
let necessary = 0;
let tight = 0;
let replayFailed = 0;
const started = Date.now();

for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
  const result = buildByReversalWithPotion(rng, {
    size: SIZE,
    minPushesBefore: MIN_PUSHES_BEFORE,
    maxPushesBefore: MAX_PUSHES_BEFORE,
    minPushesAfter: MIN_PUSHES_AFTER,
    maxPushesAfter: MAX_PUSHES_AFTER
  });
  if (!result) continue;
  built += 1;
  const before = result.sequenceBefore.length;
  const after = result.sequenceAfter.length;
  if (before + after < MIN_TOTAL_PUSHES) continue;
  const withoutPotion = analyse(result.level, { objective: "reach", full: false });
  if (withoutPotion.solvable) continue; // The potion wasn't necessary: reject.
  necessary += 1;

  const beforeTrue = trueBeforePushes(result);
  const afterTrue = trueAfterPushes(result);
  if (!beforeTrue.solvable || !afterTrue.solvable) continue; // Shouldn't happen; skip if it does.
  if (beforeTrue.pushes !== before || afterTrue.pushes !== after) continue; // Slack: some recorded push wasn't needed.
  tight += 1;

  if (!replayWithPotion(result)) {
    replayFailed += 1;
    continue;
  }
  const text = formatLevel(result.level);
  if (!found.has(text)) found.set(text, { before, after, total: before + after });
}

const ranked = [...found.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, TOP);
console.log(`seed ${SEED}: ${built} built, ${necessary} necessary (${((necessary / Math.max(built, 1)) * 100).toFixed(1)}%), ${tight} also tight (${((tight / Math.max(built, 1)) * 100).toFixed(1)}%), ${found.size} distinct, ${replayFailed} failed replay, in ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
for (const [text, stats] of ranked) {
  console.log(`pushes before ${stats.before}, after ${stats.after} (total ${stats.total})`);
  console.log(text + "\n");
}
