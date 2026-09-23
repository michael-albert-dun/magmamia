// A standalone experiment: build "Seize the Crown" levels by growing an abstract
// digraph of connected regions, rather than reverse-simulating pushes (see
// src/generator.js's buildByReversal) or rejection-sampling a goal placement
// (buildByReversalWithPotion). Michael's idea, from a session discussing
// docs/puzzle-generation-research.md's "Principles we might be missing" #1:
//
//   - Start from a board with dense, varying-depth lava and no stacks or player.
//     With no stacks, the floor naturally splits into several disconnected
//     "islands" (connected components of floor-only cells).
//   - Find every "bridge": a floor cell S, adjacent to a straight run of h
//     consecutive depth-1 lava cells, that ends at floor in a *different*
//     island. Placing a height-h stack at S and pushing it (from behind) fills
//     that run completely, joining the two islands -- but only from S's side:
//     nothing yet lets you push the other way, so this is a directed edge, not
//     an undirected one.
//   - Repeat, each time only accepting a bridge between islands that aren't
//     already connected (a union-find over the original islands, kept
//     separately from the directed edge list: union-find decides whether a
//     candidate bridge would be redundant, the edge list is what "interesting
//     path" search runs over afterwards). Never accepting a redundant bridge
//     means the digraph is always a tree (never has a cycle) -- so there is at
//     most one simple path between any two islands, and it can't be shortcut
//     by some other edge added later. Relied on below, but still checked
//     against the real solver rather than just trusted (this session has hit
//     more than one nice-sounding argument that turned out to have a gap).
//   - Pick the (start, goal) pair with the longest forward-only directed path
//     in the tree (Taylor & Parberry's farthest-node idea, applied to this
//     digraph instead of a flood fill), then prune away everything not
//     reachable from the chosen start -- back to plain lava, not floor -- so
//     the level doesn't end up with a large untouched floor area (see the
//     comment above POTION_LEVELS in src/levels.js for that story).
//
// Known gap, flagged before building this (Michael's own words): this method
// can't produce puzzles that make essential use of "hop" (a stack that only
// shallows lava, carrying a spillover block to the far side) or any other
// reconfiguration of existing resources -- every bridge here is a single,
// one-shot, fully-filling push. It's a different, narrower family of levels
// than buildByReversal produces, not a replacement for it.
//
// No potion support yet: this is the plain "Seize the Crown" case first. A
// potion crossing would slot in as a different *kind* of edge (bridges exactly
// one lava cell, any depth, rather than a straight run of depth-1 cells) with a
// global budget of one per level rather than being freely reusable like a
// stack -- flagged as a next step, not built here.
//
//   node experiments/bridge-candidates.js --seed 1 --attempts 200 --top 8
//
// Options: --seed (1), --attempts (200), --top (8), --size (8), --lava-chance
// (0.55, chance an interior cell starts as lava rather than floor), --max-depth
// (3, the deepest a non-bridge lava cell can start at -- a bridge's own line is
// always exactly depth 1 per cell, see above), --interior-walls (2, a handful
// of permanent, never-bridgeable barriers, same idea as the other generators),
// --min-edges (2, reject boards whose best path uses fewer pushes than this).
const { DIRECTIONS, formatLevel, hasClosedBorder, move } = require("../src/engine.js");
const { analyse, regionOf } = require("../src/solver.js");

const DIRECTION_NAMES = Object.keys(DIRECTIONS);

const args = parseArgs(process.argv.slice(2));
const SEED = Number(args.seed ?? 1);
const ATTEMPTS = Number(args.attempts ?? 200);
const TOP = Number(args.top ?? 8);

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

// One attempt: build a board and its digraph. Returns null if it couldn't
// produce anything usable (too few islands, or the best path is too short).
// options: size (8), lavaChance (0.55, chance an interior cell starts as lava
// rather than floor), maxDepth (3, the deepest a non-bridge lava cell can start
// at -- a bridge's own line is always exactly depth 1 per cell, see the comment
// at the top of this file), interiorWalls (2, a handful of permanent,
// never-bridgeable barriers, same idea as the other generators),
// ringWallChance (0.12), minEdges (2, reject boards whose best path uses fewer
// pushes than this).
function buildOne(rng, options = {}) {
  const size = options.size ?? 8;
  const lavaChance = options.lavaChance ?? 0.55;
  const maxDepth = options.maxDepth ?? 3;
  const interiorWalls = options.interiorWalls ?? 2;
  const ringWallChance = options.ringWallChance ?? 0.12;
  const minEdges = options.minEdges ?? 2;
  const grid = size + 2;
  const n = grid * grid;
  const randInt = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const isRing = (i) => {
    const x = i % grid;
    const y = Math.floor(i / grid);
    return x === 0 || y === 0 || x === grid - 1 || y === grid - 1;
  };

  const cells = new Int16Array(n);
  const walls = new Uint8Array(n);
  const abyss = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    if (!isRing(i)) continue;
    if (rng() < ringWallChance) walls[i] = 1;
    else abyss[i] = 1;
  }
  const interior = [];
  for (let i = 0; i < n; i += 1) if (!isRing(i)) interior.push(i);
  for (let k = 0; k < interiorWalls; k += 1) walls[interior[Math.floor(rng() * interior.length)]] = 1;
  for (const i of interior) {
    if (walls[i]) continue;
    if (rng() < lavaChance) cells[i] = -randInt(1, maxDepth);
  }

  const walkable = (i) => !walls[i] && !abyss[i] && cells[i] === 0;
  const regionFrom = (seed) => {
    const seen = new Set([seed]);
    const pending = [seed];
    while (pending.length > 0) {
      const c = pending.pop();
      const x = c % grid;
      const y = (c - x) / grid;
      for (const name of DIRECTION_NAMES) {
        const { dx, dy } = DIRECTIONS[name];
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= grid || ny >= grid) continue;
        const nb = ny * grid + nx;
        if (seen.has(nb) || !walkable(nb)) continue;
        seen.add(nb);
        pending.push(nb);
      }
    }
    return [...seen];
  };

  // Original islands: connected components of floor-only cells, before any
  // bridge is built. componentOf is fixed from here on -- bridges never change
  // which original island a cell belongs to, only whether it's reachable.
  const componentOf = new Int32Array(n).fill(-1);
  const islands = [];
  for (const i of interior) {
    if (!walkable(i) || componentOf[i] >= 0) continue;
    const region = regionFrom(i);
    const id = islands.length;
    for (const c of region) componentOf[c] = id;
    islands.push({ id, cells: region });
  }
  if (islands.length < 2) return null;

  const parent = islands.map((_, i) => i);
  const find = (a) => {
    while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; }
    return a;
  };
  const union = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent[ra] = rb; };

  const claimed = new Uint8Array(n); // Cells committed to some bridge: its stack (S) or its lava line.
  const edges = []; // { from, to, s, dir, height, line, target, behind }

  const findBridges = () => {
    const candidates = [];
    for (const i of interior) {
      if (claimed[i] || !walkable(i)) continue;
      const x = i % grid;
      const y = (i - x) / grid;
      for (const name of DIRECTION_NAMES) {
        const { dx, dy } = DIRECTIONS[name];
        const bx = x - dx;
        const by = y - dy;
        if (bx < 0 || by < 0 || bx >= grid || by >= grid) continue;
        const behind = by * grid + bx;
        if (claimed[behind] || !walkable(behind)) continue;

        const line = [];
        let cx = x;
        let cy = y;
        let target = -1;
        for (;;) {
          cx += dx;
          cy += dy;
          if (cx < 0 || cy < 0 || cx >= grid || cy >= grid) break;
          const ci = cy * grid + cx;
          if (claimed[ci] || walls[ci] || abyss[ci]) break;
          if (cells[ci] === -1) { line.push(ci); continue; }
          if (cells[ci] === 0) target = ci;
          break;
        }
        if (target < 0 || line.length === 0) continue;
        const fromIsland = componentOf[i];
        const toIsland = componentOf[target];
        if (toIsland < 0 || find(fromIsland) === find(toIsland)) continue;
        candidates.push({ s: i, behind, dir: name, height: line.length, line, target, fromIsland, toIsland });
      }
    }
    return candidates;
  };

  for (;;) {
    const candidates = findBridges();
    if (candidates.length === 0) break;
    const pick = candidates[Math.floor(rng() * candidates.length)];
    cells[pick.s] = pick.height;
    claimed[pick.s] = 1;
    for (const c of pick.line) claimed[c] = 1;
    union(pick.fromIsland, pick.toIsland);
    edges.push(pick);
  }
  if (edges.length === 0) return null;

  // Farthest-pair search over the digraph (Taylor & Parberry's idea, applied
  // to islands instead of cells): for every island, BFS forward-only edges,
  // and keep the (start, goal) pair with the longest path.
  const forward = islands.map(() => []);
  for (const e of edges) forward[e.fromIsland].push(e);
  let best = null;
  for (const root of islands) {
    const dist = new Int32Array(islands.length).fill(-1);
    const via = new Array(islands.length).fill(null);
    dist[root.id] = 0;
    const queue = [root.id];
    for (let qi = 0; qi < queue.length; qi += 1) {
      const u = queue[qi];
      for (const e of forward[u]) {
        if (dist[e.toIsland] >= 0) continue;
        dist[e.toIsland] = dist[u] + 1;
        via[e.toIsland] = e;
        queue.push(e.toIsland);
      }
    }
    for (let g = 0; g < islands.length; g += 1) {
      if (dist[g] <= 0) continue;
      if (!best || dist[g] > best.dist) best = { start: root.id, goal: g, dist: dist[g], via };
    }
  }
  if (!best || best.dist < minEdges) return null;

  // Reconstruct the path and the set of islands reachable from the chosen
  // start (not just the ones on the path -- other branches off it are also
  // genuinely reachable, not shortcuts, since the digraph is a tree).
  const path = [];
  for (let g = best.goal; g !== best.start; ) {
    const e = best.via[g];
    path.unshift(e);
    g = e.fromIsland;
  }
  const reachable = new Set([best.start]);
  const stack = [best.start];
  while (stack.length > 0) {
    const u = stack.pop();
    for (const e of forward[u]) {
      if (reachable.has(e.toIsland)) continue;
      reachable.add(e.toIsland);
      stack.push(e.toIsland);
    }
  }

  // Prune: anything not reachable from the chosen start reverts to plain lava
  // (not floor), including bridges whose source island never got reached.
  for (const island of islands) {
    if (reachable.has(island.id)) continue;
    for (const c of island.cells) cells[c] = -randInt(1, maxDepth);
  }
  for (const e of edges) {
    if (reachable.has(e.fromIsland)) continue;
    cells[e.s] = -randInt(1, maxDepth);
    for (const c of e.line) cells[c] = -randInt(1, maxDepth);
  }

  const startCell = islands[best.start].cells.filter((c) => cells[c] === 0);
  const goalCell = islands[best.goal].cells.filter((c) => cells[c] === 0);
  if (startCell.length === 0 || goalCell.length === 0) return null;
  const player = startCell[Math.floor(rng() * startCell.length)];
  const goal = goalCell[Math.floor(rng() * goalCell.length)];
  const goals = new Uint8Array(n);
  goals[goal] = 1;

  const level = { rows: grid, cols: grid, cells, walls, abyss, goals, wet: new Uint8Array(n), potions: new Uint8Array(n), carried: 0, player };
  return { level, path, pathLength: path.length, islandCount: islands.length, edgeCount: edges.length };
}

// Belt and suspenders on top of analyse(): actually play the intended path
// (each edge's push, teleporting to `behind` the way generator.test.js's own
// replay() does) through the real engine and confirm it wins. analyse() proves
// the push *count* is minimal; this proves the specific intended sequence is
// mechanically real (no wall-pile, merge, or other interaction none of the
// bridge-search accounted for).
function replay(result) {
  let state = result.level;
  for (const e of result.path) {
    const outcome = move({ ...state, player: e.behind }, e.dir);
    if (outcome.result !== "pushed") return { ok: false, reason: outcome.result };
    state = outcome.state;
  }
  return { ok: regionOf(state).reachesGoal, reason: "goal" };
}

// The CLI itself only runs when this file is executed directly, so
// build-and-verify (buildOne/replay, both reusable) can also be required from
// a script that wants the same construction+verification without the printing
// -- see src/levels.js's comment above BRIDGE_DENSE/BRIDGE_OPEN for where that
// happens.
if (require.main === module) {
  const cliOptions = {
    size: args.size !== undefined ? Number(args.size) : undefined,
    lavaChance: args["lava-chance"] !== undefined ? Number(args["lava-chance"]) : undefined,
    maxDepth: args["max-depth"] !== undefined ? Number(args["max-depth"]) : undefined,
    interiorWalls: args["interior-walls"] !== undefined ? Number(args["interior-walls"]) : undefined,
    ringWallChance: args["ring-wall-chance"] !== undefined ? Number(args["ring-wall-chance"]) : undefined,
    minEdges: args["min-edges"] !== undefined ? Number(args["min-edges"]) : undefined
  };

  const rng = mulberry32(SEED);
  const found = new Map(); // text -> { pathLength, islandCount, edgeCount }
  let built = 0;
  let tight = 0;
  let replayFailed = 0;
  const started = Date.now();

  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const result = buildOne(rng, cliOptions);
    if (!result) continue;
    built += 1;
    if (!hasClosedBorder(result.level)) continue; // Shouldn't happen; guard anyway.

    // The real check: does the solver agree the true minimum is exactly the
    // path length this construction intended? (See the tree argument above --
    // expected to hold essentially always, checked rather than assumed.)
    const check = analyse(result.level, { objective: "reach", full: false });
    if (!check.solvable || check.pushes !== result.pathLength) continue;
    tight += 1;

    const replayed = replay(result);
    if (!replayed.ok) {
      replayFailed += 1;
      continue;
    }

    const text = formatLevel(result.level);
    if (!found.has(text)) found.set(text, { pathLength: result.pathLength, islandCount: result.islandCount, edgeCount: result.edgeCount });
  }

  const ranked = [...found.entries()].sort((a, b) => b[1].pathLength - a[1].pathLength).slice(0, TOP);
  console.log(`seed ${SEED}: ${built} built, ${tight} tight (${((tight / Math.max(built, 1)) * 100).toFixed(1)}%), ${replayFailed} failed replay, ${found.size} distinct, in ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
  for (const [text, stats] of ranked) {
    console.log(`path ${stats.pathLength} pushes, ${stats.islandCount} islands (${stats.edgeCount} bridges kept)`);
    console.log(text + "\n");
  }
}

module.exports = { buildOne, mulberry32, replay };
