// Generate "Clear the dancefloor" candidates for Michael to play and judge: levels
// built by running the game backwards (src/generator.js) and passed through only
// the cheap filters we already trust (solvable, long enough, inert pieces pruned
// away). Each round's feedback becomes a new filter.
//
//   node experiments/dancefloor-candidates.js --seed 1 --max-minutes 8 --json out.json
//
// Options: --seed, --max-minutes (stop after this long), --min-pushes (default 5),
// --max-pushes (default 12), --reverse-min / --reverse-max (reverse pushes applied,
// default 4 to 7), --ring-wall-chance (default 0.25, so border walls are common),
// --keep-decoration N (inert pieces left in as red herrings, default 1),
// --transport-chance P (chance a reverse step carries blocks without leaving lava
// behind, default 0.4), --disposal-chance P (chance a step may throw blocks into
// infinite lava, default 0.12), --min-surplus / --max-surplus (how many blocks beyond
// the lava depth must be thrown away: default 1 to 2, from playtesting, where the
// tight levels were the interesting ones), --min-lava-depth (default 8: lots of
// lava), --min-coupling (default 0, off), --obstruct N (after building, try to add up
// to N walls across the intended route, keeping each that leaves the level solvable
// and lengthens the shortest solution; default 2),
// --max-forced-clear N / --max-forced N (stacks with only one possible push
// direction: those whose pushing cell is already walkable from the start, default 0,
// and all of them, default 2; from round 2 playtesting, where a stack with a single
// available push, especially one in the clear, was a problem),
// --json FILE (rewritten as candidates are found), --objective all|lava (default all).
const fs = require("fs");
const { formatLevel, move } = require("../src/engine.js");
const { analyse, solutionEvents, solutionCoupling, trivialDisposalStacks, forcedPushStacks } = require("../src/solver.js");
const { buildByReversal } = require("../src/generator.js");

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
const SEED = Number(args.seed ?? 1);
const MAX_MINUTES = Number(args["max-minutes"] ?? 8);
const MIN_PUSHES = Number(args["min-pushes"] ?? 5);
const MAX_PUSHES = Number(args["max-pushes"] ?? 12);
const OBJECTIVE = args.objective ?? "all";
const MIN_SURPLUS = Number(args["min-surplus"] ?? 1);
const MAX_SURPLUS = Number(args["max-surplus"] ?? 2);
const MIN_LAVA_DEPTH = Number(args["min-lava-depth"] ?? 8);
const MIN_COUPLING = Number(args["min-coupling"] ?? 0);
const OBSTRUCT = Number(args.obstruct ?? 2);
const MAX_FORCED_CLEAR = Number(args["max-forced-clear"] ?? 0);
const MAX_FORCED = Number(args["max-forced"] ?? 2);
const KEEP_DECORATION = Number(args["keep-decoration"] ?? 1); // Inert pieces left in as red herrings.
const CAP = 150000;
const CAP_PIECE = 60000;

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

function isRing(level, i) {
  const x = i % level.cols;
  const y = Math.floor(i / level.cols);
  return x === 0 || y === 0 || x === level.cols - 1 || y === level.rows - 1;
}

// An interior piece (stack, lava or interior wall) whose removal leaves the fewest
// pushes exactly unchanged is decoration. A little of it is welcome as a red
// herring, so pieces are only removed until at most `keep` inert ones are left; the
// level is then the same puzzle with less clutter. After each removal the scan
// starts again, since removing one piece can make another inert. Returns the pruned
// level, how many were removed and how many inert pieces remain.
// Border cells are never decoration: the border is required, and whether a border
// cell is a wall or infinite lava doesn't matter when it doesn't change the puzzle.
function pruneDecoration(level, pushes, keep) {
  let current = level;
  let removed = 0;
  for (;;) {
    const inert = [];
    for (let i = 0; i < current.cells.length; i += 1) {
      if (i === current.player || isRing(current, i)) continue;
      if (current.cells[i] === 0 && !current.walls[i]) continue;
      const without = { ...current, cells: current.cells.slice(), walls: current.walls.slice(), abyss: current.abyss.slice() };
      without.cells[i] = 0;
      without.walls[i] = 0;
      const r = analyse(without, { full: false, maxStates: CAP_PIECE, objective: OBJECTIVE });
      if (r.truncated || !r.solvable || r.pushes !== pushes) continue;
      inert.push(without);
    }
    if (inert.length <= keep) return { level: current, removed, remaining: inert.length };
    current = inert[Math.floor(rng() * inert.length)];
    removed += 1;
  }
}

// Add walls across the intended route, keeping each that leaves the level solvable
// and makes the shortest solution longer: the blocks then have to be carried round
// the wall instead of shoved straight at their lava. Only interior floor cells the
// solution touches are candidates, and the wall that lengthens it most is kept.
function obstruct(level, first, tries) {
  let current = level;
  let base = first;
  let added = 0;
  for (let t = 0; t < tries; t += 1) {
    const touched = new Set();
    let state = current;
    for (const { from, dir } of base.path) {
      const outcome = move({ ...state, player: from }, dir);
      touched.add(from);
      touched.add(outcome.state.player);
      for (const landing of outcome.drops) if (landing >= 0) touched.add(landing);
      state = outcome.state;
    }
    const candidates = [...touched].filter((i) => !isRing(current, i) && current.cells[i] === 0 && !current.walls[i] && !current.abyss[i] && i !== current.player);
    for (let k = candidates.length - 1; k > 0; k -= 1) {
      const j = Math.floor(rng() * (k + 1));
      [candidates[k], candidates[j]] = [candidates[j], candidates[k]];
    }
    let best = null;
    for (const i of candidates.slice(0, 10)) {
      const walled = { ...current, walls: current.walls.slice() };
      walled.walls[i] = 1;
      const r = analyse(walled, { full: false, maxStates: CAP, objective: OBJECTIVE });
      if (r.truncated || !r.solvable || r.pushes <= base.pushes) continue;
      if (!best || r.pushes > best.r.pushes) best = { level: walled, r };
    }
    if (!best) break;
    current = best.level;
    base = best.r;
    added += 1;
  }
  return { level: current, first: base, added };
}

const started = Date.now();
const found = [];
let tried = 0;
while ((Date.now() - started) / 60000 < MAX_MINUTES) {
  const built = buildByReversal(rng, {
    objective: OBJECTIVE,
    minPushes: Number(args["reverse-min"] ?? 4),
    maxPushes: Number(args["reverse-max"] ?? 7),
    ringWallChance: Number(args["ring-wall-chance"] ?? 0.85),
    transportChance: Number(args["transport-chance"] ?? 0.4),
    disposalChance: Number(args["disposal-chance"] ?? 0.12)
  });
  if (!built) continue;
  tried += 1;
  // The surplus is fixed by the board: blocks beyond the lava depth must be thrown away.
  let blocks = 0;
  let lavaDepth = 0;
  for (const v of built.level.cells) { if (v > 0) blocks += v; else lavaDepth -= v; }
  const surplus = blocks - lavaDepth;
  if (surplus < MIN_SURPLUS || surplus > MAX_SURPLUS || lavaDepth < MIN_LAVA_DEPTH) continue;
  const built1 = analyse(built.level, { full: false, maxStates: CAP, objective: OBJECTIVE });
  if (built1.truncated || !built1.solvable) continue;
  const obstructed = OBSTRUCT > 0 ? obstruct(built.level, built1, OBSTRUCT) : { level: built.level, first: built1, added: 0 };
  const first = obstructed.first;
  if (first.pushes < MIN_PUSHES || first.pushes > MAX_PUSHES) continue;
  const { level, removed, remaining } = pruneDecoration(obstructed.level, first.pushes, KEEP_DECORATION);
  if (trivialDisposalStacks(level).length > 0) continue;
  const forced = forcedPushStacks(level);
  if (forced.length > MAX_FORCED || forced.filter((f) => f.clear).length > MAX_FORCED_CLEAR) continue;
  const r = analyse(level, { full: false, maxStates: CAP, objective: OBJECTIVE });
  const coupling = solutionCoupling(level, r.path);
  if (coupling.coupling < MIN_COUPLING) continue;
  const events = [...solutionEvents(level, r.path)].sort();
  const walls = level.walls.reduce((n, w, i) => n + (w && isRing(level, i) ? 1 : 0), 0);
  const stacks = [...level.cells].filter((v) => v > 0).length;
  const lava = [...level.cells].filter((v) => v < 0).length;
  const text = formatLevel(level);
  if (found.some((f) => f.text === text)) continue;
  found.push({ text, pushes: r.pushes, events, states: r.states, borderWalls: walls, stacks, lava, prunedPieces: removed, redHerrings: remaining, surplus, lavaDepth, coupling: coupling.coupling, addedWalls: obstructed.added, forcedStacks: forced.length, seed: SEED });
  if (args.json) fs.writeFileSync(args.json, JSON.stringify(found, null, 2));
}
console.log(`seed ${SEED}: tried ${tried} reverse-built levels in ${((Date.now() - started) / 60000).toFixed(1)} min, ${found.length} passed`);
