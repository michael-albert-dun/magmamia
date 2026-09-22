// Search for "There will be mud" candidates the same way experiments/find-levels.js
// found the curated "Seize the crown" levels: random restarts, then hill climbing on a
// score built from solver measurements (see README, "Finding levels"). The mutate/
// evaluate/score/restart machinery below is that script's, extended to be mud-aware
// end to end rather than checked once at the end:
//
//   - A starting level comes from one of two constructions, chosen per restart, each
//     making mud essential from the moment the board exists, not fitted onto a puzzle
//     that was optimised with no idea mud was coming:
//       "soak"    src/generator.js's reverse step: forward, a wet block clears its
//                 lava outright however deep; reversed, that lava's depth could have
//                 been anything, and the stack put back to make it is wet. Used
//                 sparingly (a low soakChance), so it's the minority of steps -- most
//                 of a level should be ordinary dry construction (Michael: keep the
//                 muddy piles few, mostly dry).
//       "convert" build an ordinary dry level, pick one of its own stacks to make wet,
//                 deepen a lava cell past what a dry block could clear, and remove one
//                 *other* stack the build already relied on there -- so the puzzle the
//                 reversal produced still has to be solved, just with that one stack
//                 now doing it wet instead of the one that's gone.
//   - mutate() gains one more move: toggle a stack's wetness. The lava-depth cap is
//     raised well past the dry one, so a genuinely wet-only depth survives mutation
//     instead of drifting back into dry-clearable range.
//   - evaluate() hard-requires the level stay essential (turning every wet stack back
//     to dry, at its current lava depths, must make it unsolvable) on every candidate,
//     not as a final filter on whatever the dry score found -- so climbing can't drift
//     away from the thing that makes it mud in the first place. It also scores for the
//     "soak" event (a merge that waterlogs a dry stack) and, mildly, for staying
//     dry-heavy. The "does it matter which one you use the mud on" tension isn't
//     detected specially: --min-critical (find-levels.js's own "the puzzle becomes
//     tight somewhere" measure) already asks for exactly that.
//
//   node experiments/mud-candidates.js --seed 1 --restarts 40 --steps 400 --top 12
//
// Options: as find-levels.js's (--size, --min-pushes, --max-slack, --max-solutions,
// --max-decoration, --min-critical, --max-states, --max-minutes, --json, --verbose),
// plus --soak-chance (default 0.15), --min-soak-depth/--max-soak-depth (default 3/9,
// passed to buildByReversal), --convert-chance (chance a restart's seed is the
// "convert" construction instead of "soak"; default 0.5).
const fs = require("fs");
const { formatLevel } = require("../src/engine.js");
const { analyse, solutionEvents } = require("../src/solver.js");
const { buildByReversal } = require("../src/generator.js");

const args = parseArgs(process.argv.slice(2));
const SIZE = Number(args.size ?? 6);
const GRID = SIZE + 2;
const SEED = Number(args.seed ?? 1);
const RESTARTS = Number(args.restarts ?? 40);
const STEPS = Number(args.steps ?? 400);
const TOP = Number(args.top ?? 12);
const MAX_MINUTES = Number(args["max-minutes"] ?? Infinity);
const MIN_PUSHES = Number(args["min-pushes"] ?? 6);
const OBJECTIVE = "reach"; // Mud only makes sense for "Seize the crown" levels.
const MAX_DECORATION = Number(args["max-decoration"] ?? 0);
const RING_WALL_CHANCE = 0.12;
const MAX_SLACK = Number(args["max-slack"] ?? 2);
const MAX_SOLUTIONS = Number(args["max-solutions"] ?? 3);
const MAX_STATES = Number(args["max-states"] ?? 20000);
const MAX_STATES_PIECE = MAX_STATES;
const FULL_ANALYSIS_FROM = 4;
const MAX_LAVA_DEPTH = 4; // The dry cap: mutate() may push a soaked cell deeper than this.
const MAX_SOAKED_LAVA_DEPTH = 12; // How deep a wet-dependent cell may drift under mutation.
const MAX_STACK_HEIGHT = 5;
const MIN_CRITICAL = Number(args["min-critical"] ?? 0);
const SOAK_CHANCE = Number(args["soak-chance"] ?? 0.15);
const MIN_SOAK_DEPTH = Number(args["min-soak-depth"] ?? 3);
const MAX_SOAK_DEPTH = Number(args["max-soak-depth"] ?? 9);
const CONVERT_CHANCE = Number(args["convert-chance"] ?? 0.5);

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
const randInt = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = (list) => list[Math.floor(rng() * list.length)];

function cloneLevel(level) {
  return { ...level, cells: level.cells.slice(), walls: level.walls.slice(), abyss: level.abyss.slice(), goals: level.goals.slice(), wet: level.wet.slice() };
}

function isRing(index) {
  const x = index % GRID;
  const y = Math.floor(index / GRID);
  return x === 0 || y === 0 || x === GRID - 1 || y === GRID - 1;
}

// One random local change. Returns null if the result would be invalid.
function mutate(level) {
  const next = cloneLevel(level);
  const n = next.cells.length;
  const i = Math.floor(rng() * n);
  if (isRing(i)) {
    if (rng() < 0.5) return null;
    next.walls[i] = 1 - next.walls[i];
    next.abyss[i] = 1 - next.walls[i];
    return next;
  }
  const roll = rng();
  if (roll < 0.3) {
    if (i === next.player) return null;
    const kind = pick(["floor", "floor", "lava", "lava", "stack", "stack", "wall"]);
    next.walls[i] = kind === "wall" ? 1 : 0;
    next.cells[i] = kind === "lava" ? -pick([1, 1, 2, 2, 3]) : kind === "stack" ? pick([1, 1, 2, 2, 3, 4]) : 0;
    next.wet[i] = 0;
  } else if (roll < 0.55) {
    if (i === next.player || next.walls[i]) return null;
    const cap = next.cells[i] < -MAX_LAVA_DEPTH ? MAX_SOAKED_LAVA_DEPTH : MAX_LAVA_DEPTH; // Already-soaked cells may drift deeper.
    next.cells[i] += rng() < 0.5 ? 1 : -1;
    if (next.cells[i] > MAX_STACK_HEIGHT || next.cells[i] < -cap) return null;
    if (next.cells[i] <= 0) next.wet[i] = 0;
  } else if (roll < 0.65) {
    // Toggle a stack's wetness -- the one move that's specific to this search.
    if (next.cells[i] <= 0) return null;
    next.wet[i] = 1 - next.wet[i];
  } else if (roll < 0.75) {
    next.goals.fill(0);
    next.goals[i] = 1;
  } else if (roll < 0.82) {
    next.player = i;
  } else {
    const j = Math.floor(rng() * n);
    if (isRing(j) || i === j || i === next.player || j === next.player) return null;
    [next.cells[i], next.cells[j]] = [next.cells[j], next.cells[i]];
    [next.walls[i], next.walls[j]] = [next.walls[j], next.walls[i]];
    [next.wet[i], next.wet[j]] = [next.wet[j], next.wet[i]];
  }
  const goal = next.goals.indexOf(1);
  if (goal >= 0 && (next.walls[goal] || goal === next.player)) return null;
  if (next.walls[next.player] || next.cells[next.player] !== 0) return null;
  return next;
}

function decorativePieces(level, base) {
  let count = 0;
  for (let i = 0; i < level.cells.length; i += 1) {
    if (i === level.player || isRing(i)) continue;
    const isStack = level.cells[i] > 0;
    const isLava = level.cells[i] < 0;
    const isWall = level.walls[i] === 1;
    if (!isStack && !isLava && !isWall) continue;
    const without = cloneLevel(level);
    without.cells[i] = 0;
    without.walls[i] = 0;
    without.wet[i] = 0;
    const result = analyse(without, { full: false, maxStates: MAX_STATES_PIECE, objective: OBJECTIVE });
    if (result.truncated || !result.solvable) continue;
    if (isStack ? result.pushes <= base.pushes : result.pushes === base.pushes) count += 1;
  }
  return count;
}

// Every wet stack turned back to dry, at whatever lava depths the level currently has.
// If the level is still solvable like that, the mud isn't doing anything essential.
function driedVersion(level) {
  return { ...level, wet: new Uint8Array(level.cells.length) };
}

// Michael's suggestion: once a level has its mud, check whether the *other* (dry)
// piles are bigger than the puzzle actually needs -- oversized stacks are exactly
// what inflates slack, since their spare blocks can sit almost anywhere in a winning
// position without changing whether it wins. Shrinks each dry stack one block at a
// time, keeping the reduction only while the level is still solvable in the same
// number of pushes and mud is still essential to it, and stops each stack the moment
// a further cut would lose either. Wet stacks are left alone: their height is often
// exactly what a merge needs. Returns the shrunk level and the solver result for it.
function shrinkDryStacks(level, basePushes) {
  let current = level;
  for (let i = 0; i < current.cells.length; i += 1) {
    if (current.cells[i] <= 0 || current.wet[i]) continue;
    for (;;) {
      const shrunk = cloneLevel(current);
      shrunk.cells[i] -= 1;
      if (shrunk.cells[i] < 0) break;
      const result = analyse(shrunk, { full: false, maxStates: MAX_STATES, objective: OBJECTIVE });
      if (result.truncated || !result.solvable || result.pushes !== basePushes) break;
      const dried = analyse(driedVersion(shrunk), { full: false, maxStates: MAX_STATES, objective: OBJECTIVE });
      if (!dried.truncated && dried.solvable) break; // Would stop being essential.
      current = shrunk;
    }
  }
  return { level: current, result: analyse(current, { maxStates: MAX_STATES, objective: OBJECTIVE }) };
}

function evaluate(level, floor = -Infinity) {
  const hasWet = level.wet.some((w) => w);
  const quick = analyse(level, { full: false, maxStates: MAX_STATES, objective: OBJECTIVE });
  if (quick.truncated || !quick.solvable || quick.pushes === 0) return null;
  if (quick.pushes < FULL_ANALYSIS_FROM) return { score: quick.pushes - 100, passes: false };
  const r = analyse(level, { maxStates: MAX_STATES, objective: OBJECTIVE, detail: MIN_CRITICAL > 0 });
  if (r.truncated) return null;
  const events = solutionEvents(level, r.path);
  const tempting = r.firstPushes - r.livePushes;

  // Essential: could this exact board be solved with no mud at all? Checked on every
  // candidate the climb considers, not just the one it eventually settles on.
  let essential = false;
  if (hasWet) {
    const dried = analyse(driedVersion(level), { full: false, maxStates: MAX_STATES, objective: OBJECTIVE });
    essential = !dried.truncated && !dried.solvable;
  }

  let dryStacks = 0;
  let wetStacks = 0;
  for (let i = 0; i < level.cells.length; i += 1) {
    if (level.cells[i] <= 0) continue;
    if (level.wet[i]) wetStacks += 1;
    else dryStacks += 1;
  }

  let score =
    3 * Math.min(r.pushes, 14) -
    2 * Math.log2(r.optimalCount) -
    6 * Math.log2(Math.max(1, r.optimalCount / MAX_SOLUTIONS)) -
    4 * Math.max(0, MIN_PUSHES - r.pushes) +
    5 * events.size +
    2 * Math.min(tempting, 3) +
    6 * Math.min(r.deadFraction, 0.5) +
    -2 * r.slack - 12 * Math.max(0, r.slack - MAX_SLACK) +
    (essential ? 50 : -50) + // The one hard-required property, weighted to steer the climb, not just gate it.
    (events.has("soak") ? 8 : 0) + // The "merge to grow the mud" bonus mechanic.
    -3 * Math.max(0, wetStacks - 1) - Math.max(0, wetStacks - dryStacks) * 4; // Mostly dry, Michael's mild preference.
  if (MIN_CRITICAL > 0) score += 4 * Math.min(r.criticalStates ?? 0, 3) - 8 * Math.max(0, MIN_CRITICAL - (r.criticalStates ?? 0));
  if (score < floor) return { score: -Infinity, passes: false };
  let decorative = 0;
  if (r.slack <= MAX_SLACK + 1) decorative = decorativePieces(level, r);
  score -= 15 * Math.max(0, decorative - MAX_DECORATION);
  // Slack is scored (above) but not gated here: it runs far higher on mud levels than
  // find-levels.js's dry tuning assumes, largely from oversized dry piles elsewhere in
  // the build. shrinkDryStacks (applied once a candidate otherwise passes) targets
  // that directly; gating on it here would just reject before ever getting the chance.
  const passes =
    essential && r.pushes >= MIN_PUSHES && decorative <= MAX_DECORATION && r.optimalCount <= MAX_SOLUTIONS &&
    events.size >= 1 && (!MIN_CRITICAL || (r.criticalStates ?? 0) >= MIN_CRITICAL);
  return {
    score, passes, essential, pushes: r.pushes, solutions: r.optimalCount, slack: r.slack, decorative, dryStacks, wetStacks,
    events: [...events].sort(), tempting, dead: r.deadFraction, states: r.states, critical: r.criticalStates ?? 0
  };
}

// Seed A: src/generator.js's own "soak" reverse step, used sparingly -- most of the
// level is ordinary dry construction, with one (occasionally two) stacks and their
// lava made wet-dependent as a native part of the same reversal that built everything
// else, not a value patched in afterwards.
function soakSeed() {
  for (let tries = 0; tries < 100; tries += 1) {
    const built = buildByReversal(rng, {
      size: SIZE,
      ringWallChance: RING_WALL_CHANCE,
      objective: OBJECTIVE,
      minPushes: Number(args["reverse-min"] ?? 5),
      maxPushes: Number(args["reverse-max"] ?? 10),
      soakChance: SOAK_CHANCE,
      minSoakDepth: MIN_SOAK_DEPTH,
      maxSoakDepth: MAX_SOAK_DEPTH
    });
    if (built && built.stepKinds.includes("soak")) return built.level;
  }
  return null;
}

// Seed B: build a plain dry level, then pick one of its own stacks to make wet,
// deepen a lava cell past what a dry block could manage, and remove one *other* stack
// (the one that made reaching that lava a real dry solution) so the level still needs
// solving, just with the remaining stack now doing it wet instead. Unlike a soak seed,
// nothing new is placed: mud replaces something that was already there.
function convertSeed() {
  for (let tries = 0; tries < 100; tries += 1) {
    const built = buildByReversal(rng, {
      size: SIZE,
      ringWallChance: RING_WALL_CHANCE,
      objective: OBJECTIVE,
      minPushes: Number(args["reverse-min"] ?? 5),
      maxPushes: Number(args["reverse-max"] ?? 10)
    });
    if (!built) continue;
    const level = built.level;
    const stacks = [];
    const lavas = [];
    for (let i = 0; i < level.cells.length; i += 1) {
      if (level.cells[i] > 0) stacks.push(i);
      else if (level.cells[i] < 0) lavas.push(i);
    }
    if (stacks.length < 2 || lavas.length === 0) continue; // Need a stack to spare.
    const wetCell = pick(stacks);
    const removeCell = pick(stacks.filter((i) => i !== wetCell));
    const lavaCell = pick(lavas);
    const cells = level.cells.slice();
    const wet = level.wet.slice();
    cells[lavaCell] = -randInt(MIN_SOAK_DEPTH, MAX_SOAK_DEPTH);
    cells[removeCell] = 0;
    wet[wetCell] = 1;
    const candidate = { ...level, cells, wet };
    const check = analyse(candidate, { full: false, maxStates: MAX_STATES, objective: OBJECTIVE });
    if (check.truncated || !check.solvable) continue; // Removing that stack broke it outright: try another combination.
    return candidate;
  }
  return null;
}

function startingLevel() {
  return (rng() < CONVERT_CHANCE ? convertSeed() : soakSeed()) ?? soakSeed() ?? convertSeed();
}

const found = new Map();
let evaluations = 0;
const started = Date.now();
const outOfTime = () => (Date.now() - started) / 60000 >= MAX_MINUTES;

function report(final) {
  const ranked = [...found.entries()].sort((a, b) => b[1].result.score - a[1].result.score).slice(0, TOP);
  if (args.json) fs.writeFileSync(args.json, JSON.stringify(ranked.map(([text, { result }]) => ({ text, ...result })), null, 2));
  if (!final) return;
  console.log(`seed ${SEED}: ${evaluations} evaluations in ${((Date.now() - started) / 1000).toFixed(1)}s, ${found.size} levels pass\n`);
  for (const [text, { result }] of ranked) {
    console.log(`score ${result.score.toFixed(1)}  pushes ${result.pushes}  solutions ${result.solutions}  slack ${result.slack}  dry ${result.dryStacks}  wet ${result.wetStacks}  critical ${result.critical}  events ${result.events.join(",")}`);
    console.log(text + "\n");
  }
}

for (let restart = 0; restart < RESTARTS && !outOfTime(); restart += 1) {
  let current = null;
  let currentResult = null;
  for (let tries = 0; tries < 200 && !currentResult && !outOfTime(); tries += 1) {
    const candidate = startingLevel();
    if (!candidate) continue;
    const result = evaluate(candidate);
    evaluations += 1;
    if (result) {
      current = candidate;
      currentResult = result;
    }
  }
  if (!currentResult) continue;
  let best = currentResult;
  let bestPassing = null;
  for (let step = 0; step < STEPS && !outOfTime(); step += 1) {
    const candidate = mutate(current);
    if (!candidate) continue;
    const result = evaluate(candidate, currentResult.score);
    evaluations += 1;
    if (!result || result.score < currentResult.score) continue;
    current = candidate;
    currentResult = result;
    best = result;
    if (result.passes && (!bestPassing || result.score > bestPassing.result.score)) bestPassing = { level: candidate, result };
  }
  if (bestPassing) {
    const { level: shrunk, result: shrunkResult } = shrinkDryStacks(bestPassing.level, bestPassing.result.pushes);
    const events = [...solutionEvents(shrunk, shrunkResult.path)].sort();
    let dryStacks = 0;
    let wetStacks = 0;
    for (let i = 0; i < shrunk.cells.length; i += 1) {
      if (shrunk.cells[i] <= 0) continue;
      if (shrunk.wet[i]) wetStacks += 1;
      else dryStacks += 1;
    }
    const finalResult = { ...bestPassing.result, pushes: shrunkResult.pushes, slack: shrunkResult.slack, dryStacks, wetStacks, events };
    found.set(formatLevel(shrunk), { level: shrunk, result: finalResult });
  }
  if (args.verbose) {
    console.log(`restart ${restart}: best score ${best.score.toFixed(1)} pushes ${best.pushes} solutions ${best.solutions} slack ${best.slack} essential ${best.essential} dry ${best.dryStacks} wet ${best.wetStacks} critical ${best.critical} events [${best.events}]${bestPassing ? "  PASSES" : ""}  (${((Date.now() - started) / 60000).toFixed(1)} min, ${found.size} kept)`);
  }
  report(false);
}
report(true);
