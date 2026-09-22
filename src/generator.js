// Building levels by running the game backwards -- no DOM, Node only. Used by
// experiments/find-levels.js; see README.md ("Finding levels").
//
// A forward push adds one block to each cell it lands on, so the reverse of a
// push takes one block away from each of those cells (a floor cell becomes lava
// of depth 1, a stack gets shorter, lava gets deeper) and puts the stack back.
// Starting from a cleared board and applying a few reverse pushes therefore
// makes a level that is solvable by construction, with lava and blocks in
// balance. The result isn't necessarily *optimally* solved by the sequence it
// was built with: the solver still finds the true fewest pushes.
//
// Three kinds of reverse step, and the mix matters for how a level plays. An
// "uncover" step lands its blocks on cells that are floor or lava, so the reverse
// leaves lava behind (the forward push filled it): each such stack ends up next to
// its own strip of lava and is simply shoved at it, with no manoeuvring. A
// "transport" step lands its blocks only on existing stacks, so it leaves no lava:
// forwards, it carries blocks from one place to another, and something has to be
// done with them afterwards. Levels with transport steps need blocks carried round
// walls and set up before they can fill anything. A "soak" step is the waterlogged
// counterpart of "uncover": forwards, a wet block fills its lava outright however
// deep (see README, "Waterlogged blocks"), so reversed, the line cells it lands on
// can be given an arbitrary depth (not just 1) and the stack put back is marked wet.
// This is what makes mud essential to the finished level by construction, rather
// than a depth bolted on afterwards to a puzzle that was never designed around it:
// a dry block landing there would only shallow it by one, so the level's own
// solving sequence already depends on that one stack being wet.
//
// Blocks lost into infinite lava are the one place blocks are created from
// nothing: a reverse push may have blocks fly into an infinite lava cell, which
// means the finished level has surplus blocks that have to be thrown away. A
// wall the stack topples towards is the other special case: the reverse of
// blocks piling on the cell before it.

const { DIRECTIONS } = require("./engine.js");

const DIRECTION_NAMES = Object.keys(DIRECTIONS);

// Build one level. `rng` is a function returning a number in [0, 1).
// Returns { level, sequence, lastStackCell } where sequence is the forward
// pushes that solve it, as [{ from, dir }] (push in direction `dir` while
// standing on cell `from`), in the order to play them.
//
// options: size (interior is size by size, default 6), ringWallChance (chance a
// border cell is wall rather than infinite lava, default 0.12), interiorWalls
// (max walls inside, default 3), minPushes / maxPushes (how many reverse pushes,
// default 5 to 10), objective ("reach" places a goal where the finished board's
// player region is; "lava" and "all" have none), maxLavaDepth (4), maxStackHeight (5),
// transportChance (chance a step is a transport step when one is possible, default
// 0), disposalChance (chance a step that could throw blocks into infinite lava is
// allowed to, default 1; lower it for levels with less surplus to tidy up), soakChance
// (chance a step is a soak step when one is possible, default 0; see "There will be
// mud" above), minSoakDepth / maxSoakDepth (the arbitrary depth a soak step gives its
// lava, default 2 to 8: more than maxLavaDepth on purpose, so a dry block plainly
// can't manage it in one push).
// Also returns stepKinds, "uncover", "transport" or "soak" for each step in reverse
// order. Returns null if it couldn't build a level (callers just try again).
function buildByReversal(rng, options = {}) {
  const size = options.size ?? 6;
  const grid = size + 2;
  const ringWallChance = options.ringWallChance ?? 0.12;
  const maxWalls = options.interiorWalls ?? 3;
  const minPushes = options.minPushes ?? 5;
  const maxPushes = options.maxPushes ?? 10;
  const objective = options.objective ?? "reach";
  const maxLava = options.maxLavaDepth ?? 4;
  const maxStack = options.maxStackHeight ?? 5;
  const transportChance = options.transportChance ?? 0;
  const disposalChance = options.disposalChance ?? 1;
  const soakChance = options.soakChance ?? 0;
  const minSoakDepth = options.minSoakDepth ?? 2;
  const maxSoakDepth = options.maxSoakDepth ?? 8;

  const randInt = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const n = grid * grid;
  const isRing = (i) => {
    const x = i % grid;
    const y = Math.floor(i / grid);
    return x === 0 || y === 0 || x === grid - 1 || y === grid - 1;
  };

  const cells = new Int16Array(n);
  const walls = new Uint8Array(n);
  const abyss = new Uint8Array(n);
  const goals = new Uint8Array(n);
  const wet = new Uint8Array(n); // Which stack (cells[i] > 0) is waterlogged, from soak steps.
  for (let i = 0; i < n; i += 1) {
    if (!isRing(i)) continue;
    if (rng() < ringWallChance) walls[i] = 1;
    else abyss[i] = 1;
  }
  const interior = [];
  for (let i = 0; i < n; i += 1) if (!isRing(i)) interior.push(i);
  for (let k = randInt(0, maxWalls); k > 0; k -= 1) walls[interior[Math.floor(rng() * interior.length)]] = 1;
  const open = interior.filter((i) => !walls[i]);
  if (open.length < 6) return null;

  let player = open[Math.floor(rng() * open.length)];
  const walkable = (i) => !walls[i] && !abyss[i] && cells[i] === 0;
  const regionFrom = (start) => {
    const seen = new Set([start]);
    const stack = [start];
    while (stack.length > 0) {
      const c = stack.pop();
      for (const name of DIRECTION_NAMES) {
        const { dx, dy } = DIRECTIONS[name];
        const x = (c % grid) + dx;
        const y = Math.floor(c / grid) + dy;
        if (x < 0 || y < 0 || x >= grid || y >= grid) continue;
        const nb = y * grid + x;
        if (seen.has(nb) || !walkable(nb)) continue;
        seen.add(nb);
        stack.push(nb);
      }
    }
    return [...seen];
  };

  // Walk the line of cells a push from q in direction `name` would land blocks on,
  // stopping at a wall, infinite lava, or maxStack cells, whichever comes first.
  // Shared by proposeStep and proposeSoakStep, which differ only in what a landing
  // does to the cell it lands on.
  const walkLine = (q, name) => {
    const { dx, dy } = DIRECTIONS[name];
    const line = [];
    let x = (q % grid) + dx;
    let y = Math.floor(q / grid) + dy;
    let end = "none"; // "wall" or "abyss" once the line stops.
    while (x >= 0 && y >= 0 && x < grid && y < grid) {
      const i = y * grid + x;
      if (walls[i]) { end = "wall"; break; }
      if (abyss[i]) { end = "abyss"; break; }
      line.push(i);
      if (line.length >= maxStack) break;
      x += dx;
      y += dy;
    }
    return { line, end };
  };

  // Work out one reverse step: the stack at q pushed in direction `name` with
  // `height` blocks. Returns null if it isn't allowed, else what it would change.
  const proposeStep = (q, name, height) => {
    const { dx, dy } = DIRECTIONS[name];
    const { line, end } = walkLine(q, name);
    // A stack right against a wall can't be pushed at all.
    if (line.length === 0 && end !== "abyss") return null;
    const m = line.length;
    if (height > m && end === "none") return null; // The line was cut short by the height cap.
    // How many blocks each line cell received going forwards.
    const received = line.map(() => 0);
    for (let k = 0; k < Math.min(height, m); k += 1) received[k] += 1;
    if (height > m && end === "wall") received[m - 1] += height - m; // The pile against the wall.
    // (Blocks past the end of an abyss-ended line are simply lost.)
    const throwsAway = end === "abyss" && height > m - 0;
    const behind = q - (dy * grid + dx);
    if (behind < 0 || behind >= n || !walkable(behind)) return null;
    if (line.some((i, k) => received[k] > 0 && cells[i] - received[k] < -maxLava)) return null;
    const createsLava = line.some((i, k) => received[k] > 0 && cells[i] - received[k] < 0);
    return { name, line, received, behind, q, height, throwsAway, createsLava, movesBlocks: received.some((r) => r > 0) };
  };

  // The waterlogged counterpart of proposeStep. Every line cell a block would land on
  // gets an arbitrary depth (not the usual 1 point) instead, since a single wet block
  // clears any depth in one go -- so reversed, that depth could have been anything.
  // Only virgin floor is used for this (never a cell some earlier-processed, and so
  // chronologically later, step has already touched), so an arbitrary depth here can
  // never clobber another step's bookkeeping. Returns null if it isn't allowed.
  const proposeSoakStep = (q, name, height) => {
    const { dx, dy } = DIRECTIONS[name];
    const { line, end } = walkLine(q, name);
    if (line.length === 0) return null; // Nothing to soak.
    const m = line.length;
    if (height > m && end === "none") return null;
    const soaked = line.map(() => 0);
    for (let k = 0; k < Math.min(height, m); k += 1) soaked[k] = randInt(minSoakDepth, maxSoakDepth);
    if (height > m && end === "wall") soaked[m - 1] = randInt(minSoakDepth, maxSoakDepth); // Still one wet block, however many pile there.
    if (line.some((i, k) => soaked[k] > 0 && cells[i] !== 0)) return null; // Only virgin floor.
    const behind = q - (dy * grid + dx);
    if (behind < 0 || behind >= n || !walkable(behind)) return null;
    return { name, line, soaked, behind, q, height };
  };

  const target = randInt(minPushes, maxPushes);
  const sequence = []; // Built backwards, so pushes are added to the front.
  const stepKinds = [];
  let lastStackCell = -1;
  for (let done = 0, attempts = 0; done < target && attempts < 300; attempts += 1) {
    const region = regionFrom(player);
    let step = null;
    let kind;
    const roll = rng();
    if (roll < transportChance) {
      kind = "transport";
      // Every transport step available from here, then one of them at random.
      const options = [];
      for (const q of region) {
        for (const name of DIRECTION_NAMES) {
          for (let height = 1; height <= maxStack; height += 1) {
            const candidate = proposeStep(q, name, height);
            if (candidate && candidate.movesBlocks && !candidate.createsLava && !candidate.throwsAway) options.push(candidate);
          }
        }
      }
      if (options.length > 0) step = options[Math.floor(rng() * options.length)];
    } else if (roll < transportChance + soakChance) {
      kind = "soak";
      const q = region[Math.floor(rng() * region.length)];
      const name = DIRECTION_NAMES[Math.floor(rng() * DIRECTION_NAMES.length)];
      step = proposeSoakStep(q, name, randInt(1, maxStack));
    }
    if (!step) {
      kind = "uncover";
      const q = region[Math.floor(rng() * region.length)];
      const name = DIRECTION_NAMES[Math.floor(rng() * DIRECTION_NAMES.length)];
      step = proposeStep(q, name, randInt(1, maxStack));
      if (!step) continue;
      if (step.throwsAway && rng() >= disposalChance) continue;
    }

    if (kind === "soak") step.line.forEach((i, k) => { if (step.soaked[k] > 0) cells[i] = -step.soaked[k]; });
    else step.line.forEach((i, k) => { cells[i] -= step.received[k]; });
    cells[step.q] = step.height;
    wet[step.q] = kind === "soak" ? 1 : 0; // Overwritten alongside cells[step.q]: see "soak" above.
    sequence.unshift({ from: step.behind, dir: step.name });
    stepKinds.push(kind);
    if (lastStackCell < 0) lastStackCell = step.q;
    player = step.behind;
    done += 1;
  }
  if (sequence.length < minPushes) return null;

  if (objective === "reach") {
    // The finished board's player region is where the goal has to be for the
    // last push to win. Regions are computed on the fully cleared board.
    const clearedCells = new Int16Array(n);
    const saved = cells.slice();
    cells.set(clearedCells);
    const region = regionFrom(lastStackCell).filter((i) => !isRing(i));
    cells.set(saved);
    if (region.length === 0) return null;
    goals[region[Math.floor(rng() * region.length)]] = 1;
  }
  return { level: { rows: grid, cols: grid, cells, walls, abyss, goals, wet, player }, sequence, lastStackCell, stepKinds };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildByReversal };
}
