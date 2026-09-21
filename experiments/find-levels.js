// Search for interesting "reach the goal" levels: random starts, then hill
// climbing on a score built from solver measurements (see README, "Levels").
//
//   node experiments/find-levels.js --seed 1 --restarts 40 --steps 400 --top 12
//
// The board is an (N+2) by (N+2) grid: an N by N interior surrounded by a border
// ring whose cells are each infinite lava (~) or wall (#), so nothing depends on
// what lies beyond the grid.
//
// Options: --size N (interior is N by N, default 6), --min-pushes, --max-slack,
// --max-solutions (filters for what gets reported), --json FILE (write the
// reported levels there as well).
const fs = require("fs");
const { formatLevel } = require("../src/engine.js");
const { analyse, solutionEvents } = require("../src/solver.js");

const args = parseArgs(process.argv.slice(2));
const SIZE = Number(args.size ?? 6);
const GRID = SIZE + 2; // Interior plus the border ring.
const RING_WALL_CHANCE = 0.12;
const SEED = Number(args.seed ?? 1);
const RESTARTS = Number(args.restarts ?? 40);
const STEPS = Number(args.steps ?? 400);
const TOP = Number(args.top ?? 12);
const MIN_PUSHES = Number(args["min-pushes"] ?? 6);
const MAX_SLACK = Number(args["max-slack"] ?? 2);
const MAX_SOLUTIONS = Number(args["max-solutions"] ?? 3);
const MAX_STATES = 20000;
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
  const goal = order[Math.floor(rng() * order.length)];
  goals[goal] = 1;
  const free = order.filter((i) => i !== goal);
  for (let k = randInt(0, 3); k > 0 && free.length > 0; k -= 1) walls[free.pop()] = 1;
  const usable = order.filter((i) => !walls[i]); // May include the goal cell for lava/stacks.
  for (let k = randInt(3, 8); k > 0 && usable.length > 0; k -= 1) {
    cells[usable.splice(Math.floor(rng() * usable.length), 1)[0]] = -pick([1, 1, 1, 2, 2, 3]);
  }
  for (let k = randInt(2, 4); k > 0 && usable.length > 0; k -= 1) {
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
  if (next.walls[goal] || goal === next.player) return null;
  if (next.walls[next.player] || next.cells[next.player] !== 0) return null;
  return next;
}

// Is the level still no worse without this piece? If so the piece is decoration.
// Pieces are stacks, lava, walls, and the walls (only) on the border: taking a
// border wall away leaves infinite lava there.
function decorativePieces(level, base) {
  let count = 0;
  for (let i = 0; i < level.cells.length; i += 1) {
    if (i === level.player) continue;
    const isStack = level.cells[i] > 0;
    const isLava = level.cells[i] < 0;
    const isWall = level.walls[i] === 1;
    if (!isStack && !isLava && !isWall) continue;
    const without = cloneLevel(level);
    without.cells[i] = 0;
    without.walls[i] = 0;
    if (isRing(i)) without.abyss[i] = 1;
    const result = analyse(without, { full: false, maxStates: MAX_STATES_PIECE });
    if (result.truncated || !result.solvable) continue;
    if (isStack ? result.pushes <= base.pushes : result.pushes === base.pushes) count += 1;
  }
  return count;
}

function evaluate(level) {
  // Cheap first pass: is it solvable, and in how many pushes?
  const quick = analyse(level, { full: false, maxStates: MAX_STATES });
  if (quick.truncated || !quick.solvable || quick.pushes === 0) return null;
  // Below this, the score only rewards more pushes; it's always beaten by any
  // fully analysed level, which is what pulls the search towards longer solutions.
  if (quick.pushes < FULL_ANALYSIS_FROM) return { score: quick.pushes - 100, passes: false };
  const r = analyse(level, { maxStates: MAX_STATES });
  if (r.truncated) return null;
  const events = solutionEvents(level, r.path);
  const tempting = r.firstPushes - r.livePushes;
  let decorative = 0;
  // The piece-by-piece check is the expensive part; only worth it for levels
  // that are otherwise in the running.
  if (r.slack <= MAX_SLACK + 1) decorative = decorativePieces(level, r);
  const score =
    3 * Math.min(r.pushes, 14) -
    2 * Math.log2(r.optimalCount) -
    2 * r.slack -
    6 * decorative +
    // Steer towards the reporting filters rather than only rewarding them.
    -12 * Math.max(0, r.slack - MAX_SLACK) -
    5 * Math.max(0, r.optimalCount - MAX_SOLUTIONS) -
    4 * Math.max(0, MIN_PUSHES - r.pushes) +
    5 * events.size +
    2 * Math.min(tempting, 3) +
    6 * Math.min(r.deadFraction, 0.5);
  const passes = r.pushes >= MIN_PUSHES && r.slack <= MAX_SLACK && decorative === 0 && r.optimalCount <= MAX_SOLUTIONS && events.size >= 1;
  return { score, passes, pushes: r.pushes, solutions: r.optimalCount, slack: r.slack, decorative, events: [...events].sort(), tempting, dead: r.deadFraction, states: r.states };
}

const found = new Map(); // level text -> { level, result }
let evaluations = 0;
const started = Date.now();

for (let restart = 0; restart < RESTARTS; restart += 1) {
  let current = null;
  let currentResult = null;
  for (let tries = 0; tries < 3000 && !currentResult; tries += 1) {
    const candidate = randomLevel();
    const result = evaluate(candidate);
    evaluations += 1;
    if (result) {
      current = candidate;
      currentResult = result;
    }
  }
  if (!currentResult) continue;
  let best = currentResult;
  for (let step = 0; step < STEPS; step += 1) {
    const candidate = mutate(current);
    if (!candidate) continue;
    const result = evaluate(candidate);
    evaluations += 1;
    if (!result || result.score < currentResult.score) continue;
    current = candidate;
    currentResult = result;
    best = result;
    if (result.passes) found.set(formatLevel(candidate), { level: candidate, result });
  }
  if (args.verbose) console.log(`restart ${restart}: best score ${best.score.toFixed(1)} pushes ${best.pushes} solutions ${best.solutions} slack ${best.slack} decorative ${best.decorative} events [${best.events}] tempting ${best.tempting}`);
}

const ranked = [...found.entries()].sort((a, b) => b[1].result.score - a[1].result.score).slice(0, TOP);
console.log(`seed ${SEED}: ${evaluations} evaluations in ${((Date.now() - started) / 1000).toFixed(1)}s, ${found.size} levels pass the filters\n`);
for (const [text, { result }] of ranked) {
  console.log(`score ${result.score.toFixed(1)}  pushes ${result.pushes}  solutions ${result.solutions}  slack ${result.slack}  tempting ${result.tempting}  dead ${(result.dead * 100).toFixed(0)}%  events ${result.events.join(",")}  states ${result.states}`);
  console.log(text + "\n");
}
if (args.json) fs.writeFileSync(args.json, JSON.stringify(ranked.map(([text, { result }]) => ({ text, ...result })), null, 2));
