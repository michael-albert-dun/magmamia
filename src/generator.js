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

const { DIRECTIONS, move } = require("./engine.js");
// Only buildByReversalWithPotion uses this (see its retry loops below): unlike
// buildByReversal, one-shot construction here can't reliably guarantee every
// recorded push is necessary (see its own comment), so each phase is verified
// against the real solver and retried on the spot rather than trusting it and
// leaving verification entirely to the caller.
const { analyse } = require("./solver.js");

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
  return { level: { rows: grid, cols: grid, cells, walls, abyss, goals, wet, potions: new Uint8Array(n), carried: 0, player }, sequence, lastStackCell, stepKinds };
}

// Building a potion level by running the game backwards, in three stretches
// (see the design discussion in README.md, "Potions"): ordinary reverse steps
// building the "finish as normal" segment after the crossing (phase "after",
// chronologically last), one new "cross" reverse step undoing "step onto lava
// using the potion", and then more ordinary reverse steps building the "some
// movement, possibly pushes" segment between picking the potion up and reaching
// the crossing (phase "before", chronologically first). Picking the potion up
// itself needs no step of its own -- forwards it's just an ordinary walk onto
// its cell, so once phase "before" ends, the potion is simply placed next to
// wherever the player ended up, and that's the level's start.
//
// The "cross" step never touches the lava cell itself: forwards, the potion
// buys surviving a step onto lava, not filling it, so reversed there's nothing
// to undo about the cell -- only the player's position changes (back off the
// lava cell onto the floor cell they crossed from). The far side has to
// already be part of phase "after"'s walkable region (a neighbour of it), and
// the near side has to be a floor cell that isn't (a neighbour of the lava
// cell, but outside that region) -- otherwise the crossing wouldn't actually
// connect two different areas. The abyss is never a valid crossing cell: a
// potion can't buy that step (see move() in engine.js).
//
// This duplicates buildByReversal's helpers (regionFrom/walkLine/proposeStep/
// proposeSoakStep) rather than sharing them, since the two-phase structure here
// doesn't fit its single loop; worth unifying later if the potion mechanic
// settles down.
//
// Each phase's pushes are only *placeable* by construction, not necessarily
// *necessary*: with as few as 0-4 pushes over a 6x6 interior, most of the board
// stays untouched floor, so a phase's own chain can very often be walked around
// entirely through that untouched floor, making some or all of its pushes
// decorative (confirmed empirically -- see the session this came from). Each
// phase is therefore built, then checked against the real solver (the one
// dependency this file has on solver.js), and rebuilt from scratch up to
// RETRIES_PER_PHASE times if the check fails, rather than trusting construction
// alone the way buildByReversal does. Phase "after"'s check also covers the
// crossing search and goal placement, since where the goal ends up is part of
// what "after" being tight means. This still doesn't check *individual* pushes
// within a phase are each necessary (only that the phase's push count as a
// whole is the true minimum), so a longer chain can still hide some slack in
// the middle; it's a meaningfully better hit rate than no check at all, not a
// full guarantee.
//
// options: as buildByReversal (size, ringWallChance, interiorWalls, maxLavaDepth,
// maxStackHeight, transportChance, disposalChance, soakChance, minSoakDepth,
// maxSoakDepth), applied to both phases, plus minPushesBefore/maxPushesBefore
// (phase "before", default 0 to 4), minPushesAfter/maxPushesAfter (phase
// "after", default 0 to 4), and retriesPerPhase (default 25). Only "reach" is
// supported (a potion buys surviving a step, which only means anything if
// there's somewhere to walk on to).
// Returns { level, sequenceBefore, sequenceAfter, crossing, potionCell,
// potionApproachDir, lastStackCell, stepKinds }. sequenceBefore/sequenceAfter
// are each phase's pushes, kept apart rather than one combined sequence,
// because the pickup and the crossing both belong in between them and neither
// is a push:
//   potionApproachDir  the direction from `level.player` onto `potionCell`,
//                      i.e. the level's very first move (the pickup).
//   crossing           { from, dir, cell }: after sequenceBefore's pushes, the
//                      potion is used moving in direction `dir` from cell
//                      `from` onto the lava cell `cell`; sequenceAfter's
//                      pushes follow.
// Returns null if it couldn't build a level (callers just try again).
function buildByReversalWithPotion(rng, options = {}) {
  const size = options.size ?? 6;
  const grid = size + 2;
  const ringWallChance = options.ringWallChance ?? 0.12;
  const maxWalls = options.interiorWalls ?? 3;
  const maxLava = options.maxLavaDepth ?? 4;
  const maxStack = options.maxStackHeight ?? 5;
  const transportChance = options.transportChance ?? 0;
  const disposalChance = options.disposalChance ?? 1;
  const soakChance = options.soakChance ?? 0;
  const minSoakDepth = options.minSoakDepth ?? 2;
  const maxSoakDepth = options.maxSoakDepth ?? 8;
  const minPushesBefore = options.minPushesBefore ?? 0;
  const maxPushesBefore = options.maxPushesBefore ?? 4;
  const minPushesAfter = options.minPushesAfter ?? 0;
  const maxPushesAfter = options.maxPushesAfter ?? 4;
  const retriesPerPhase = options.retriesPerPhase ?? 25;
  if ((options.objective ?? "reach") !== "reach") throw new Error('buildByReversalWithPotion only supports the "reach" objective.');

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
  const wet = new Uint8Array(n);
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

  const walkLine = (q, name) => {
    const { dx, dy } = DIRECTIONS[name];
    const line = [];
    let x = (q % grid) + dx;
    let y = Math.floor(q / grid) + dy;
    let end = "none";
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

  const proposeStep = (q, name, height) => {
    const { dx, dy } = DIRECTIONS[name];
    const { line, end } = walkLine(q, name);
    if (line.length === 0 && end !== "abyss") return null;
    const m = line.length;
    if (height > m && end === "none") return null;
    const received = line.map(() => 0);
    for (let k = 0; k < Math.min(height, m); k += 1) received[k] += 1;
    if (height > m && end === "wall") received[m - 1] += height - m;
    const throwsAway = end === "abyss" && height > m - 0;
    const behind = q - (dy * grid + dx);
    if (behind < 0 || behind >= n || !walkable(behind)) return null;
    if (line.some((i, k) => received[k] > 0 && cells[i] - received[k] < -maxLava)) return null;
    const createsLava = line.some((i, k) => received[k] > 0 && cells[i] - received[k] < 0);
    return { name, line, received, behind, q, height, throwsAway, createsLava, movesBlocks: received.some((r) => r > 0) };
  };

  const proposeSoakStep = (q, name, height) => {
    const { dx, dy } = DIRECTIONS[name];
    const { line, end } = walkLine(q, name);
    if (line.length === 0) return null;
    const m = line.length;
    if (height > m && end === "none") return null;
    const soaked = line.map(() => 0);
    for (let k = 0; k < Math.min(height, m); k += 1) soaked[k] = randInt(minSoakDepth, maxSoakDepth);
    if (height > m && end === "wall") soaked[m - 1] = randInt(minSoakDepth, maxSoakDepth);
    if (line.some((i, k) => soaked[k] > 0 && cells[i] !== 0)) return null;
    const behind = q - (dy * grid + dx);
    if (behind < 0 || behind >= n || !walkable(behind)) return null;
    return { name, line, soaked, behind, q, height };
  };

  // One stretch of ordinary reverse steps (uncover/transport/soak), starting
  // from `startPlayer`. Returns null if it couldn't reach `target` pushes.
  const runPhase = (startPlayer, target) => {
    let player = startPlayer;
    const sequence = [];
    const stepKinds = [];
    let firstStackCell = -1;
    for (let done = 0, attempts = 0; done < target && attempts < 300; attempts += 1) {
      const region = regionFrom(player);
      let step = null;
      let kind;
      const roll = rng();
      if (roll < transportChance) {
        kind = "transport";
        const stepOptions = [];
        for (const q of region) {
          for (const name of DIRECTION_NAMES) {
            for (let height = 1; height <= maxStack; height += 1) {
              const candidate = proposeStep(q, name, height);
              if (candidate && candidate.movesBlocks && !candidate.createsLava && !candidate.throwsAway) stepOptions.push(candidate);
            }
          }
        }
        if (stepOptions.length > 0) step = stepOptions[Math.floor(rng() * stepOptions.length)];
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
      wet[step.q] = kind === "soak" ? 1 : 0;
      sequence.unshift({ from: step.behind, dir: step.name });
      stepKinds.push(kind);
      if (firstStackCell < 0) firstStackCell = step.q;
      player = step.behind;
      done += 1;
    }
    if (sequence.length < target) return null;
    return { player, sequence, stepKinds, firstStackCell };
  };

  // Phase "after" (the finish, chronologically last, so built first in
  // reverse), the crossing search, and goal placement are bundled into one
  // attempt: where the goal can go depends on both the phase and the crossing,
  // so "after is tight" means all three together are. Retried whole, from
  // scratch (fresh randomness; runPhase's cells/wet writes are rolled back
  // between attempts), whenever the real solver says the recorded after-pushes
  // weren't actually the true minimum -- see this function's own comment above.
  let after = null;
  let crossing = null;
  let lastStackCell = -1;
  for (let tries = 0; tries < retriesPerPhase && !after; tries += 1) {
    const savedCells = cells.slice();
    const savedWet = wet.slice();

    const afterStart = open[Math.floor(rng() * open.length)];
    const candidate = runPhase(afterStart, randInt(minPushesAfter, maxPushesAfter));
    if (!candidate) {
      cells.set(savedCells);
      wet.set(savedWet);
      continue;
    }

    // The crossing: a finite-lava cell next to phase "after"'s region (the far
    // side, already walkable from where phase "after" begins forwards), with a
    // floor neighbour outside that region (the near side, where the player
    // stands to cross). Collect every such (cell, near) pair and pick one.
    const afterRegion = new Set(regionFrom(candidate.player));
    const crossingOptions = [];
    for (const r of afterRegion) {
      const x = r % grid;
      const y = (r - x) / grid;
      for (const name of DIRECTION_NAMES) {
        const { dx, dy } = DIRECTIONS[name];
        const lx = x + dx;
        const ly = y + dy;
        if (lx < 0 || ly < 0 || lx >= grid || ly >= grid) continue;
        const lavaCell = ly * grid + lx;
        if (walls[lavaCell] || abyss[lavaCell] || cells[lavaCell] >= 0) continue; // only finite lava.
        for (const nearName of DIRECTION_NAMES) {
          const { dx: ndx, dy: ndy } = DIRECTIONS[nearName];
          const nx = lx + ndx;
          const ny = ly + ndy;
          if (nx < 0 || ny < 0 || nx >= grid || ny >= grid) continue;
          const near = ny * grid + nx;
          if (afterRegion.has(near) || !walkable(near)) continue;
          // Crossing from `near` onto `lavaCell` in the direction opposite `nearName`.
          const crossDir = DIRECTION_NAMES.find((d) => DIRECTIONS[d].dx === -ndx && DIRECTIONS[d].dy === -ndy);
          crossingOptions.push({ from: near, dir: crossDir, cell: lavaCell });
        }
      }
    }
    if (crossingOptions.length === 0) {
      cells.set(savedCells);
      wet.set(savedWet);
      continue;
    }
    const crossingCandidate = crossingOptions[Math.floor(rng() * crossingOptions.length)];

    // The chronologically-last push is phase "after"'s first (if it has one),
    // else the crossing itself is the last thing that happens before the finish.
    const lastEntry = candidate.sequence.length > 0 ? candidate.sequence[candidate.sequence.length - 1] : null;
    const candidateLastStackCell = candidate.firstStackCell >= 0 ? candidate.firstStackCell : crossingCandidate.cell;

    // Where the goal can go: reachable once that last push (if there is one) has
    // actually happened, but *not* reachable from the crossing without it --
    // otherwise the goal doesn't actually need that push, only happens to be
    // placeable after it too. buildByReversal places its own goal by clearing the
    // *whole* board first, which is a fine approximation there since 5-10 pushes
    // over a 6x6 interior touch most of it -- but each phase here gets as few as
    // 0-4, leaving most of the board untouched floor from the very start, so
    // clearing it (or, tried first, just checking reachability after the push
    // alone) both let the goal land in that untouched floor, bypassing the push
    // entirely. This is the same before/after-minus-carrying shape as
    // potionRegions in solver.js.
    let goalRegion;
    if (lastEntry) {
      const postPhaseCells = cells.slice();
      const reachableWithoutThisPush = new Set(regionFrom(crossingCandidate.cell));
      const outcome = move({ rows: grid, cols: grid, cells, walls, abyss, goals: new Uint8Array(n), wet, potions: new Uint8Array(n), carried: 0, player: lastEntry.from }, lastEntry.dir);
      if (outcome.result !== "pushed") {
        // Bookkeeping guarantees this; guard anyway.
        cells.set(savedCells);
        wet.set(savedWet);
        continue;
      }
      cells.set(outcome.state.cells);
      goalRegion = regionFrom(outcome.state.player).filter((i) => !isRing(i) && !reachableWithoutThisPush.has(i));
      cells.set(postPhaseCells); // Undo just this simulation, keep the phase's own construction.
    } else {
      // No push after crossing: everything reachable from the landing cell is
      // fair game, since none of it is reachable without crossing either (the
      // necessity check above already guarantees that for the level as a whole).
      goalRegion = regionFrom(crossingCandidate.cell).filter((i) => !isRing(i));
    }
    if (goalRegion.length === 0) {
      cells.set(savedCells);
      wet.set(savedWet);
      continue;
    }
    const goalCandidate = goalRegion[Math.floor(rng() * goalRegion.length)];

    // The real check: from right after the crossing, with that one goal cell
    // as the target, does the solver agree the true minimum is exactly what
    // this phase recorded?
    const checkGoals = new Uint8Array(n);
    checkGoals[goalCandidate] = 1;
    const afterCheck = analyse(
      { rows: grid, cols: grid, cells, walls, abyss, goals: checkGoals, wet, potions: new Uint8Array(n), carried: 0, player: crossingCandidate.cell },
      { objective: "reach", full: false }
    );
    if (!afterCheck.solvable || afterCheck.pushes !== candidate.sequence.length) {
      cells.set(savedCells);
      wet.set(savedWet);
      continue;
    }

    after = candidate;
    crossing = crossingCandidate;
    lastStackCell = candidateLastStackCell;
    goals[goalCandidate] = 1;
  }
  if (!after) return null;

  // Phase "before": the movement (possibly pushes) between picking the potion
  // up and reaching the crossing, chronologically first, run last in reverse.
  // Retried the same way as "after" above, checking against a synthetic goal at
  // the crossing's near cell instead of the level's real one.
  let before = null;
  for (let tries = 0; tries < retriesPerPhase && !before; tries += 1) {
    const savedCells = cells.slice();
    const savedWet = wet.slice();
    const candidate = runPhase(crossing.from, randInt(minPushesBefore, maxPushesBefore));
    if (!candidate) {
      cells.set(savedCells);
      wet.set(savedWet);
      continue;
    }
    if (candidate.sequence.length === 0) {
      before = candidate; // Nothing recorded, so nothing to check.
      break;
    }
    const checkGoals = new Uint8Array(n);
    checkGoals[crossing.from] = 1;
    const beforeCheck = analyse(
      { rows: grid, cols: grid, cells, walls, abyss, goals: checkGoals, wet, potions: new Uint8Array(n), carried: 0, player: candidate.player },
      { objective: "reach", full: false }
    );
    if (beforeCheck.solvable && beforeCheck.pushes === candidate.sequence.length) {
      before = candidate;
      break;
    }
    cells.set(savedCells);
    wet.set(savedWet);
  }
  if (!before) return null;

  // Picking the potion up is just an ordinary walk, so it needs no reverse step
  // of its own: place it next to wherever phase "before" ends up.
  const px = before.player % grid;
  const py = (before.player - px) / grid;
  const potionCandidates = regionFrom(before.player).filter((c) => c !== before.player &&
    Math.abs((c % grid) - px) + Math.abs(Math.floor(c / grid) - py) === 1);
  if (potionCandidates.length === 0) return null;
  const potionSpot = potionCandidates[Math.floor(rng() * potionCandidates.length)];
  const potions = new Uint8Array(n);
  potions[potionSpot] = 1;
  const potionDx = (potionSpot % grid) - px;
  const potionDy = Math.floor(potionSpot / grid) - py;
  const potionApproachDir = DIRECTION_NAMES.find((d) => DIRECTIONS[d].dx === potionDx && DIRECTIONS[d].dy === potionDy);
  if (lastStackCell < 0) return null;

  return {
    level: { rows: grid, cols: grid, cells, walls, abyss, goals, wet, potions, carried: 0, player: before.player },
    sequenceBefore: before.sequence,
    sequenceAfter: after.sequence,
    crossing,
    potionCell: potionSpot,
    potionApproachDir,
    lastStackCell,
    stepKinds: [...before.stepKinds, "cross", ...after.stepKinds]
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildByReversal, buildByReversalWithPotion };
}
