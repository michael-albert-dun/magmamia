// Search for interesting levels ("reach the goal" by default, or "clear all the
// lava"): random starts, then hill climbing on a score built from solver
// measurements (see README, "Levels").
//
//   node experiments/find-levels.js --seed 1 --restarts 40 --steps 400 --top 12
//
// The board is an (N+2) by (N+2) grid: an N by N interior surrounded by a border
// ring whose cells are each infinite lava (~) or wall (#), so nothing depends on
// what lies beyond the grid.
//
// Options: --size N (interior is N by N, default 6), --objective reach|lava|all
// (default reach; the other two have no goal cell: "lava" is won when no finite
// lava is left, "all" when no lava and no blocks are left, which makes the
// border matter, since the only way to get rid of a block is to push it into
// infinite lava), --min-pushes, --max-slack, --max-solutions (filters for what gets
// reported), --slack off (ignore slack completely: no filter and no score term;
// spare blocks are only a problem when they multiply equivalent solutions, which
// --max-solutions already limits), --min-end-positions N (require at least N
// different winning positions within two pushes of the fewest, so the finished
// board isn't forced), --max-decoration N (interior pieces whose removal changes
// nothing are allowed as red herrings, up to this many; default 0), --generator random|reverse (how starting levels are made:
// "reverse" runs the game backwards from a cleared board, so every start is
// solvable and has lava and blocks in balance, see src/generator.js; use
// --reverse-min N and --reverse-max N to set how many reverse pushes it applies,
// default 5 to 10), --solutions essential (count solutions that differ by more
// than the order of independent pushes, instead of raw sequences: independent
// clean-up pushes otherwise multiply the count without adding any puzzle),
// --min-critical N (require at least N positions on an optimal path with three or
// more legal pushes of which only one keeps the level solvable: the places where
// the puzzle becomes tight, wherever they are), --require-event NAME (only report levels whose solution
// contains that event: cover, pile, stack, edge or hop), --max-states N (state cap per analysis, default 20000;
// lower is faster and keeps the levels small), --max-dead X
// (require at most this share of reachable positions to be dead ends, and steer
// away from more than X - 0.1), --json FILE (write the
// reported levels there as well; it is rewritten after every restart, so an
// interrupted run keeps what it found), --max-minutes N (stop starting new work
// after N minutes). Each restart contributes only its best passing level, since
// a climb that has found a good level tends to drift sideways through many
// near-copies of it.
const fs = require("fs");
const { formatLevel } = require("../src/engine.js");
const { analyse, solutionEvents } = require("../src/solver.js");
const { buildByReversal } = require("../src/generator.js");

const args = parseArgs(process.argv.slice(2));
const SIZE = Number(args.size ?? 6);
const GRID = SIZE + 2; // Interior plus the border ring.
const SEED = Number(args.seed ?? 1);
const RESTARTS = Number(args.restarts ?? 40);
const STEPS = Number(args.steps ?? 400);
const TOP = Number(args.top ?? 12);
const MAX_MINUTES = Number(args["max-minutes"] ?? Infinity);
const MIN_PUSHES = Number(args["min-pushes"] ?? 6);
const OBJECTIVE = args.objective ?? "reach";
const MAX_DECORATION = Number(args["max-decoration"] ?? 0); // Inert pieces allowed as red herrings.
// When blocks have to be disposed of, border walls decide where that is possible,
// so start with more of them.
const RING_WALL_CHANCE = OBJECTIVE === "all" ? 0.25 : 0.12;
const IGNORE_SLACK = args.slack === "off";
const MAX_SLACK = IGNORE_SLACK ? Infinity : Number(args["max-slack"] ?? 2);
const MIN_END_POSITIONS = Number(args["min-end-positions"] ?? 1);
const REQUIRE_EVENT = args["require-event"] ?? null;
const GENERATOR = args.generator ?? "random";
const ESSENTIAL = args.solutions === "essential";
const MIN_CRITICAL = Number(args["min-critical"] ?? 0);
const USE_DETAIL = ESSENTIAL || MIN_CRITICAL > 0;
const MAX_DEAD = Number(args["max-dead"] ?? 1);
const MAX_SOLUTIONS = Number(args["max-solutions"] ?? 3);
const MAX_STATES = Number(args["max-states"] ?? 20000);
// The piece-removal check must be allowed at least as many states as the level
// itself has: if it runs out of room it can't tell that an inert piece changed
// nothing, and would wrongly count it as mattering.
const MAX_STATES_PIECE = MAX_STATES;
// Levels with fewer pushes than this get only a cheap score, no full analysis.
const FULL_ANALYSIS_FROM = 4;
const MAX_LAVA_DEPTH = 4;
const MAX_STACK_HEIGHT = 5;

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
const randInt = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1)); // inclusive
const pick = (list) => list[Math.floor(rng() * list.length)];

function cloneLevel(level) {
  return { ...level, cells: level.cells.slice(), walls: level.walls.slice(), abyss: level.abyss.slice(), goals: level.goals.slice() };
}

function isRing(index) {
  const x = index % GRID;
  const y = Math.floor(index / GRID);
  return x === 0 || y === 0 || x === GRID - 1 || y === GRID - 1;
}

function randomLevel() {
  const n = GRID * GRID;
  const cells = new Int16Array(n);
  const walls = new Uint8Array(n);
  const abyss = new Uint8Array(n);
  const goals = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    if (!isRing(i)) continue;
    if (rng() < RING_WALL_CHANCE) walls[i] = 1;
    else abyss[i] = 1;
  }
  // Everything else lives in the interior.
  const order = [...Array(n).keys()].filter((i) => !isRing(i));
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const player = order.pop();
  // Lava levels have no goal cell.
  const goal = OBJECTIVE === "reach" ? order[Math.floor(rng() * order.length)] : -1;
  if (goal >= 0) goals[goal] = 1;
  const free = order.filter((i) => i !== goal);
  for (let k = randInt(0, 3); k > 0 && free.length > 0; k -= 1) walls[free.pop()] = 1;
  const usable = order.filter((i) => !walls[i]); // May include the goal cell for lava/stacks.
  // Clearing lava takes blocks, so these levels start with fewer lava cells and
  // more stacks, or nearly every random level would be unsolvable.
  const lavaCells = OBJECTIVE !== "reach" ? randInt(2, 5) : randInt(3, 8);
  const stacks = OBJECTIVE !== "reach" ? randInt(3, 6) : randInt(2, 4);
  for (let k = lavaCells; k > 0 && usable.length > 0; k -= 1) {
    cells[usable.splice(Math.floor(rng() * usable.length), 1)[0]] = -pick([1, 1, 1, 2, 2, 3]);
  }
  for (let k = stacks; k > 0 && usable.length > 0; k -= 1) {
    cells[usable.splice(Math.floor(rng() * usable.length), 1)[0]] = pick([1, 1, 2, 2, 3, 4]);
  }
  return { rows: GRID, cols: GRID, cells, walls, abyss, goals, player };
}

// One random local change. Returns null if the result would be invalid. Border
// cells only ever switch between wall and infinite lava; everything else changes
// only inside the interior.
function mutate(level) {
  const next = cloneLevel(level);
  const n = next.cells.length;
  const i = Math.floor(rng() * n);
  if (isRing(i)) {
    if (rng() < 0.5) return null; // Border changes are rarer than interior ones.
    next.walls[i] = 1 - next.walls[i];
    next.abyss[i] = 1 - next.walls[i];
    return next;
  }
  const roll = rng();
  if (roll < 0.35) {
    // Replace a cell's contents outright.
    if (i === next.player) return null;
    const kind = pick(["floor", "floor", "lava", "lava", "stack", "stack", "wall"]);
    next.walls[i] = kind === "wall" ? 1 : 0;
    next.cells[i] = kind === "lava" ? -pick([1, 1, 2, 2, 3]) : kind === "stack" ? pick([1, 1, 2, 2, 3, 4]) : 0;
  } else if (roll < 0.6) {
    // Nudge a height or depth by one.
    if (i === next.player || next.walls[i]) return null;
    next.cells[i] += rng() < 0.5 ? 1 : -1;
    if (next.cells[i] > MAX_STACK_HEIGHT || next.cells[i] < -MAX_LAVA_DEPTH) return null;
  } else if (roll < 0.72) {
    if (OBJECTIVE !== "reach") return null; // No goal to move.
    next.goals.fill(0);
    next.goals[i] = 1;
  } else if (roll < 0.8) {
    next.player = i;
  } else {
    // Swap the contents of two interior cells.
    const j = Math.floor(rng() * n);
    if (isRing(j) || i === j || i === next.player || j === next.player) return null;
    [next.cells[i], next.cells[j]] = [next.cells[j], next.cells[i]];
    [next.walls[i], next.walls[j]] = [next.walls[j], next.walls[i]];
  }
  const goal = next.goals.indexOf(1);
  if (goal >= 0 && (next.walls[goal] || goal === next.player)) return null;
  if (next.walls[next.player] || next.cells[next.player] !== 0) return null;
  return next;
}

// Is the level still no worse without this piece? If so the piece is decoration.
// Pieces are interior stacks, lava and walls. Border cells are never decoration:
// the border is required, and whether a border cell is a wall or infinite lava
// doesn't matter when it doesn't change the puzzle.
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
    const result = analyse(without, { full: false, maxStates: MAX_STATES_PIECE, objective: OBJECTIVE });
    if (result.truncated || !result.solvable) continue;
    if (isStack ? result.pushes <= base.pushes : result.pushes === base.pushes) count += 1;
  }
  return count;
}

// `floor` is the score a candidate has to reach to be accepted (the current
// level's score). The piece-by-piece decoration check is by far the most
// expensive part and can only lower a score, so it is skipped for candidates
// already below the floor, which is most of them.
function evaluate(level, floor = -Infinity) {
  // Cheap first pass: is it solvable, and in how many pushes?
  const quick = analyse(level, { full: false, maxStates: MAX_STATES, objective: OBJECTIVE });
  if (quick.truncated || !quick.solvable || quick.pushes === 0) return null;
  // Below this, the score only rewards more pushes; it's always beaten by any
  // fully analysed level, which is what pulls the search towards longer solutions.
  if (quick.pushes < FULL_ANALYSIS_FROM) return { score: quick.pushes - 100, passes: false };
  const r = analyse(level, { maxStates: MAX_STATES, objective: OBJECTIVE, detail: USE_DETAIL });
  if (r.truncated) return null;
  // Solutions that differ only in the order of independent pushes can be counted as one.
  const solutions = ESSENTIAL ? r.essentialSolutions : r.optimalCount;
  const events = solutionEvents(level, r.path);
  const tempting = r.firstPushes - r.livePushes;
  let score =
    3 * Math.min(r.pushes, 14) -
    2 * Math.log2(solutions) +
    // Steer towards the reporting filters rather than only rewarding them. The
    // solution-count penalty is logarithmic: independent pushes can be done in
    // any order, which multiplies the count without making a level worse.
    -6 * Math.log2(Math.max(1, solutions / MAX_SOLUTIONS)) -
    4 * Math.max(0, MIN_PUSHES - r.pushes) +
    5 * events.size +
    2 * Math.min(tempting, 3) +
    6 * Math.min(r.deadFraction, 0.5);
  if (!IGNORE_SLACK) score += -2 * r.slack - 12 * Math.max(0, r.slack - MAX_SLACK);
  // Reward levels that can finish in several different positions (counting only
  // near-optimal ones: spare blocks can sit almost anywhere, which would
  // otherwise let junk pieces inflate the count), so the end isn't forced and
  // part of the puzzle is working out what to aim for.
  if (MIN_END_POSITIONS > 1) score += 5 * Math.min(r.nearEndStates - 1, 3) - 6 * Math.max(0, MIN_END_POSITIONS - r.nearEndStates);
  if (REQUIRE_EVENT && !events.has(REQUIRE_EVENT)) score -= 15;
  // Becoming tight somewhere: a position where only one of several pushes works.
  if (MIN_CRITICAL > 0) score += 4 * Math.min(r.criticalStates, 3) - 8 * Math.max(0, MIN_CRITICAL - r.criticalStates);
  // Very punishing levels, where nearly every wrong push is already fatal.
  if (MAX_DEAD < 1) score -= 40 * Math.max(0, r.deadFraction - (MAX_DEAD - 0.1));
  // Decoration can only lower the score, so a candidate already below the floor
  // is rejected without the expensive check.
  if (score < floor) return { score: -Infinity, passes: false };
  let decorative = 0;
  if (r.slack <= MAX_SLACK + 1) decorative = decorativePieces(level, r);
  score -= 15 * Math.max(0, decorative - MAX_DECORATION);
  const passes =
    r.pushes >= MIN_PUSHES && r.slack <= MAX_SLACK && decorative <= MAX_DECORATION && solutions <= MAX_SOLUTIONS && events.size >= 1 && (!REQUIRE_EVENT || events.has(REQUIRE_EVENT)) &&
    r.nearEndStates >= MIN_END_POSITIONS && r.deadFraction <= MAX_DEAD && (!MIN_CRITICAL || r.criticalStates >= MIN_CRITICAL);
  return {
    score, passes, pushes: r.pushes, solutions, sequences: r.optimalCount, critical: r.criticalStates, slack: r.slack, decorative, events: [...events].sort(), tempting,
    dead: r.deadFraction, states: r.states, endPositions: r.nearEndStates, optimalEndPositions: r.optimalEndStates
  };
}

// A fresh starting level: random, or built backwards from a cleared board.
function startingLevel() {
  if (GENERATOR !== "reverse") return randomLevel();
  for (let tries = 0; tries < 100; tries += 1) {
    const built = buildByReversal(rng, {
      size: SIZE,
      ringWallChance: RING_WALL_CHANCE,
      objective: OBJECTIVE,
      minPushes: Number(args["reverse-min"] ?? 5),
      maxPushes: Number(args["reverse-max"] ?? 10)
    });
    if (built) return built.level;
  }
  return randomLevel();
}

const found = new Map(); // level text -> { level, result }; at most one per restart
let evaluations = 0;
const started = Date.now();
const outOfTime = () => (Date.now() - started) / 60000 >= MAX_MINUTES;

function report(final) {
  const ranked = [...found.entries()].sort((a, b) => b[1].result.score - a[1].result.score).slice(0, TOP);
  if (args.json) fs.writeFileSync(args.json, JSON.stringify(ranked.map(([text, { result }]) => ({ text, ...result })), null, 2));
  if (!final) return;
  console.log(`seed ${SEED}: ${evaluations} evaluations in ${((Date.now() - started) / 1000).toFixed(1)}s, ${found.size} levels pass the filters\n`);
  for (const [text, { result }] of ranked) {
    console.log(`score ${result.score.toFixed(1)}  pushes ${result.pushes}  solutions ${result.solutions}  slack ${result.slack}  tempting ${result.tempting}  dead ${(result.dead * 100).toFixed(0)}%  end positions ${result.endPositions}  events ${result.events.join(",")}  states ${result.states}`);
    console.log(text + "\n");
  }
}

for (let restart = 0; restart < RESTARTS && !outOfTime(); restart += 1) {
  let current = null;
  let currentResult = null;
  for (let tries = 0; tries < 3000 && !currentResult && !outOfTime(); tries += 1) {
    const candidate = startingLevel();
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
  if (bestPassing) found.set(formatLevel(bestPassing.level), bestPassing);
  if (args.verbose) console.log(`restart ${restart}: best score ${best.score.toFixed(1)} pushes ${best.pushes} solutions ${best.solutions} slack ${best.slack} decorative ${best.decorative} critical ${best.critical} ends ${best.endPositions} dead ${best.dead === undefined ? "-" : (best.dead * 100).toFixed(0) + "%"} events [${best.events}] tempting ${best.tempting}${bestPassing ? "  PASSES" : ""}  (${((Date.now() - started) / 60000).toFixed(1)} min, ${found.size} kept)`);
  report(false);
}
report(true);
