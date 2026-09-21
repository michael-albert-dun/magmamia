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
// --json FILE (rewritten as candidates are found), --objective all|lava (default all).
const fs = require("fs");
const { formatLevel } = require("../src/engine.js");
const { analyse, solutionEvents } = require("../src/solver.js");
const { buildByReversal } = require("../src/generator.js");

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
const SEED = Number(args.seed ?? 1);
const MAX_MINUTES = Number(args["max-minutes"] ?? 8);
const MIN_PUSHES = Number(args["min-pushes"] ?? 5);
const MAX_PUSHES = Number(args["max-pushes"] ?? 12);
const OBJECTIVE = args.objective ?? "all";
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

const started = Date.now();
const found = [];
let tried = 0;
while ((Date.now() - started) / 60000 < MAX_MINUTES) {
  const built = buildByReversal(rng, {
    objective: OBJECTIVE,
    minPushes: Number(args["reverse-min"] ?? 4),
    maxPushes: Number(args["reverse-max"] ?? 7),
    ringWallChance: Number(args["ring-wall-chance"] ?? 0.25)
  });
  if (!built) continue;
  tried += 1;
  const first = analyse(built.level, { full: false, maxStates: CAP, objective: OBJECTIVE });
  if (first.truncated || !first.solvable || first.pushes < MIN_PUSHES || first.pushes > MAX_PUSHES) continue;
  const { level, removed, remaining } = pruneDecoration(built.level, first.pushes, KEEP_DECORATION);
  const r = analyse(level, { full: false, maxStates: CAP, objective: OBJECTIVE });
  const events = [...solutionEvents(level, r.path)].sort();
  const walls = level.walls.reduce((n, w, i) => n + (w && isRing(level, i) ? 1 : 0), 0);
  const stacks = [...level.cells].filter((v) => v > 0).length;
  const lava = [...level.cells].filter((v) => v < 0).length;
  const text = formatLevel(level);
  if (found.some((f) => f.text === text)) continue;
  found.push({ text, pushes: r.pushes, events, states: r.states, borderWalls: walls, stacks, lava, prunedPieces: removed, redHerrings: remaining, seed: SEED });
  if (args.json) fs.writeFileSync(args.json, JSON.stringify(found, null, 2));
}
console.log(`seed ${SEED}: tried ${tried} reverse-built levels in ${((Date.now() - started) / 60000).toFixed(1)} min, ${found.length} passed`);
