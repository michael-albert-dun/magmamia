// Exact solver and level analysis -- no DOM. Used by experiments (finding
// interesting levels) and tests; see README.md.
//
// The search is over pushes, not steps. Between pushes the player can walk
// anywhere in the connected region of floor cells they stand in, so a state
// is the board plus which region the player is in (represented by the region's
// lowest cell index). Which states win depends on the objective (see
// OBJECTIVES in engine.js): "reach" (the default) wins when the region contains
// a goal cell; "lava" when no finite lava is left; "all" when every lava cell
// and block is gone. Infinite lava never counts, and can't be cleared.

const solverEngine = typeof module !== "undefined" && module.exports ? require("./engine.js") : { move, DIRECTIONS, isWon };

const SOLVER_DIRS = Object.keys(solverEngine.DIRECTIONS);
const NEAR_OPTIMAL_PUSHES = 2;
const MAX_ENUMERATED_PATHS = 50000;

// Flood-fill the floor cells the player can walk to. Stacks, lava, infinite lava
// and walls all stop the player (walking into a stack is a push, not a walk).
function regionOf(state) {
  const { cols, rows, cells, walls, goals } = state;
  const abyss = state.abyss; // Undefined on states built without infinite lava.
  const seen = new Uint8Array(cells.length);
  const region = [];
  const pending = [state.player];
  seen[state.player] = 1;
  let reachesGoal = false;
  let lowest = state.player;
  while (pending.length > 0) {
    const c = pending.pop();
    region.push(c);
    if (goals[c]) reachesGoal = true;
    if (c < lowest) lowest = c;
    const x = c % cols;
    const y = (c - x) / cols;
    for (const name of SOLVER_DIRS) {
      const { dx, dy } = solverEngine.DIRECTIONS[name];
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      const n = ny * cols + nx;
      if (seen[n] || walls[n] || (abyss && abyss[n]) || cells[n] !== 0) continue;
      seen[n] = 1;
      pending.push(n);
    }
  }
  return { region, reachesGoal, lowest };
}

function stateKey(state) {
  let key = "";
  const wet = state.wet;
  for (let i = 0; i < state.cells.length; i += 1) {
    const value = state.cells[i];
    // A wet stack behaves differently from a dry one of the same height (see
    // "There will be mud" in the README), so its code must land outside every dry
    // or lava code (which only ever run -26..26): shift it clear of that range.
    const soggy = wet && value > 0 && wet[i] ? 64 : 0;
    key += String.fromCharCode(value + 64 + soggy);
  }
  return key + String.fromCharCode(state.player + 64);
}

function blocksIn(state) {
  let total = 0;
  for (let i = 0; i < state.cells.length; i += 1) if (state.cells[i] > 0) total += state.cells[i];
  return total;
}

// Explore every state reachable by pushing, breadth first. Returns:
//   solvable        whether a goal can be reached at all
//   pushes          fewest pushes to reach a goal
//   optimalCount    how many distinct push sequences achieve that (walking
//                   between pushes doesn't make sequences distinct)
//   optimalEndStates / nearEndStates / winningStates   how many different
//                   winning positions the optimal solutions can end in, how many
//                   are reachable within NEAR_OPTIMAL_PUSHES extra pushes, and
//                   how many exist in all. 1 means the finished position is
//                   forced: only the route to it is left to work out. The
//                   all-positions count is inflated by spare blocks, which can
//                   sit almost anywhere; the near-optimal count is much less so.
//   slack           most blocks that can be left over in any winning state; 0
//                   means every solution uses up every block ("tight")
//   states          how many states were explored
//   truncated       true if maxStates was hit, so the numbers are unreliable
//   deadFraction    share of explored states from which no win is reachable
//                   (only with full exploration)
//   firstPushes / livePushes   pushes available at the start, and how many of
//                   those still leave the level solvable (full exploration)
//   path            one optimal solution as [{ from, dir }]: push in direction
//                   dir while standing on cell `from`
// options.full (default true) explores everything; false stops as soon as the
// first winning depth is finished, which is enough for pushes/solvable.
// options.objective is "reach" (default), "lava" or "all".
// options.detail (with full exploration) adds, at some cost:
//   essentialSolutions   how many optimal solutions differ by more than the order
//                   of their pushes: each push is described by the stack's cell,
//                   direction and height, so reordering independent pushes gives
//                   the same set. Counted over at most MAX_ENUMERATED_PATHS
//                   optimal sequences; essentialCapped says if it stopped early
//                   (the count is then a lower bound).
//   criticalStates   positions on an optimal path with at least three legal
//                   pushes of which exactly one keeps the level solvable: the
//                   places where the puzzle "becomes tight".
//   maxDeadAlternatives   the most fatal pushes at any such position.
function analyse(start, options = {}) {
  const maxStates = options.maxStates ?? 100000;
  const full = options.full !== false;
  const objective = options.objective ?? "reach";
  const nodes = [];
  const index = new Map();

  function addNode(state, parent, via, depth, ways) {
    const { region, reachesGoal, lowest } = regionOf(state);
    const canonical = lowest === state.player ? state : { ...state, player: lowest };
    const key = stateKey(canonical);
    const known = index.get(key);
    if (known !== undefined) {
      const node = nodes[known];
      if (node.depth === depth) node.ways += ways;
      return known;
    }
    index.set(key, nodes.length);
    const won = objective === "reach" ? reachesGoal : solverEngine.isWon(canonical, objective);
    nodes.push({ state: canonical, region, won, depth, ways, parent, via, children: [], edges: [], blocks: blocksIn(canonical) });
    return nodes.length - 1;
  }

  addNode(start, -1, null, 0, 1);
  let winDepth = nodes[0].won ? 0 : Infinity;
  let truncated = false;
  for (let head = 0; head < nodes.length; head += 1) {
    const node = nodes[head];
    if (node.won) continue;
    if (!full && node.depth >= winDepth) break;
    for (const c of node.region) {
      const x = c % node.state.cols;
      const y = (c - x) / node.state.cols;
      for (const name of SOLVER_DIRS) {
        const { dx, dy } = solverEngine.DIRECTIONS[name];
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= node.state.cols || ny < 0 || ny >= node.state.rows) continue;
        if (node.state.cells[ny * node.state.cols + nx] <= 0) continue;
        const outcome = solverEngine.move({ ...node.state, player: c }, name);
        if (outcome.result !== "pushed") continue;
        if (nodes.length >= maxStates) {
          truncated = true;
          break;
        }
        const child = addNode(outcome.state, head, { from: c, dir: name }, node.depth + 1, node.ways);
        node.children.push(child);
        node.edges.push({ child, cell: ny * node.state.cols + nx, dir: name, height: node.state.cells[ny * node.state.cols + nx] });
        if (nodes[child].won && nodes[child].depth < winDepth) winDepth = nodes[child].depth;
      }
      if (truncated) break;
    }
    if (truncated) break;
  }

  const result = { solvable: winDepth !== Infinity, pushes: winDepth, optimalCount: 0, slack: 0, states: nodes.length, truncated, path: [] };
  if (!result.solvable) return result;

  let best = -1;
  result.optimalEndStates = 0;
  result.nearEndStates = 0;
  result.winningStates = 0;
  for (let i = 0; i < nodes.length; i += 1) {
    if (!nodes[i].won) continue;
    result.winningStates += 1;
    if (nodes[i].depth <= winDepth + NEAR_OPTIMAL_PUSHES) result.nearEndStates += 1;
    if (nodes[i].depth === winDepth) {
      result.optimalCount += nodes[i].ways;
      result.optimalEndStates += 1;
      if (best < 0) best = i;
    }
    if (nodes[i].blocks > result.slack) result.slack = nodes[i].blocks;
  }
  for (let i = best; nodes[i].parent >= 0; i = nodes[i].parent) result.path.push(nodes[i].via);
  result.path.reverse();

  if (full && !truncated) {
    // Live states are those from which some win is reachable: search backwards.
    const parentsOf = nodes.map(() => []);
    nodes.forEach((node, i) => node.children.forEach((child) => parentsOf[child].push(i)));
    const live = new Uint8Array(nodes.length);
    const pending = [];
    nodes.forEach((node, i) => {
      if (node.won) {
        live[i] = 1;
        pending.push(i);
      }
    });
    while (pending.length > 0) {
      const i = pending.pop();
      for (const p of parentsOf[i]) {
        if (!live[p]) {
          live[p] = 1;
          pending.push(p);
        }
      }
    }
    result.deadFraction = 1 - live.reduce((a, b) => a + b, 0) / nodes.length;
    result.firstPushes = nodes[0].children.length;
    result.livePushes = nodes[0].children.filter((child) => live[child]).length;

    if (options.detail) {
      // Nodes on some optimal path: those with an optimal-length route to a win.
      // The node list is in breadth-first order, so going backwards handles
      // deeper nodes first.
      const good = new Uint8Array(nodes.length);
      for (let i = nodes.length - 1; i >= 0; i -= 1) {
        const node = nodes[i];
        if (node.won) {
          if (node.depth === winDepth) good[i] = 1;
          continue;
        }
        for (const edge of node.edges) {
          if (nodes[edge.child].depth === node.depth + 1 && good[edge.child]) {
            good[i] = 1;
            break;
          }
        }
      }
      result.criticalStates = 0;
      result.maxDeadAlternatives = 0;
      nodes.forEach((node, i) => {
        if (!good[i] || node.won) return;
        const liveEdges = node.edges.filter((edge) => live[edge.child]).length;
        if (node.edges.length >= 3 && liveEdges === 1) result.criticalStates += 1;
        if (liveEdges >= 1) result.maxDeadAlternatives = Math.max(result.maxDeadAlternatives, node.edges.length - liveEdges);
      });

      // Optimal solutions as sets of pushes, so reordering doesn't count.
      const distinct = new Set();
      const described = [];
      let enumerated = 0;
      const visit = (i) => {
        if (enumerated >= MAX_ENUMERATED_PATHS) return;
        const node = nodes[i];
        if (node.won) {
          enumerated += 1;
          distinct.add([...described].sort().join("|"));
          return;
        }
        for (const edge of node.edges) {
          if (nodes[edge.child].depth !== node.depth + 1 || !good[edge.child]) continue;
          described.push(`${edge.cell},${edge.dir},${edge.height}`);
          visit(edge.child);
          described.pop();
        }
      };
      visit(0);
      result.essentialSolutions = distinct.size;
      result.essentialCapped = enumerated >= MAX_ENUMERATED_PATHS;
    }
  }
  return result;
}

// Replay a solution path (from analyse) and report which unusual things happen
// in it: "cover" (a block lands on the goal, covering it), "pile" (blocks pile
// up against a wall), "stack" (a block lands on an existing stack), "edge"
// (blocks are lost into infinite lava), "hop" (a stack topples over a lava cell
// it only shallows, carrying a block across to the far side, where it can be
// pushed on from a new direction), "shuffle" (two adjacent singles are merged
// into a 2-stack, which is then pushed so it lays two singles again: repeating
// that moves a pair of blocks along, one position at a time) and "soak" (a
// waterlogged block lands on a dry stack, making the whole thing wet -- see
// "There will be mud" in the README). Filling lava is the ordinary case and
// isn't listed.
function solutionEvents(start, path) {
  const events = new Set();
  const pairs = new Set(); // Cells holding a 2-stack made by merging two singles.
  let state = start;
  for (const { from, dir } of path) {
    const outcome = solverEngine.move({ ...state, player: from }, dir);
    const landed = new Set();
    let crossedUnfilled = false; // A landing so far was on lava that stays lava.
    for (const landing of outcome.drops) {
      if (landing < 0 || (state.abyss && state.abyss[landing])) {
        events.add("edge");
        crossedUnfilled = true;
        continue;
      }
      if (landed.has(landing)) events.add("pile");
      landed.add(landing);
      if (state.cells[landing] > 0) {
        events.add("stack");
        const wasWet = Boolean(state.wet && state.wet[landing]);
        const isWet = Boolean(outcome.state.wet && outcome.state.wet[landing]);
        if (!wasWet && isWet) events.add("soak");
      }
      if (state.goals[landing] && outcome.state.cells[landing] > 0) events.add("cover");
      if (state.cells[landing] < 0 && outcome.state.cells[landing] < 0) crossedUnfilled = true;
      else if (crossedUnfilled && state.cells[landing] >= 0) events.add("hop");
    }
    // A merged pair pushed on so that both its blocks land on empty floor.
    const pushedCell = outcome.state.player;
    if (outcome.height === 2 && pairs.has(pushedCell) && outcome.drops.length === 2 &&
        outcome.drops.every((landing) => landing >= 0 && !(state.abyss && state.abyss[landing]) && state.cells[landing] === 0)) {
      events.add("shuffle");
    }
    for (const landing of outcome.drops) {
      if (landing >= 0 && state.cells[landing] === 1 && outcome.state.cells[landing] === 2) pairs.add(landing);
    }
    for (const cell of [...pairs]) if (outcome.state.cells[cell] !== 2) pairs.delete(cell);
    state = outcome.state;
  }
  return events;
}

// How tightly an optimal solution's pushes depend on each other. Two pushes are
// dependent if they touch a common cell (the stack pushed, or a cell a block lands
// on); the critical path is the longest chain of dependent pushes in order. A
// solution of independent shoves, each stack pushed straight at its own lava, has a
// critical path of 1 however many pushes it takes: the loose, "slack" kind of level.
// A chain, where each push sets up the next, has a critical path equal to its
// length. Returns { pushes, criticalPath, coupling } with coupling = criticalPath /
// pushes, between 1/pushes and 1. Walking between pushes is ignored.
function solutionCoupling(start, path) {
  let state = start;
  const touched = [];
  for (const { from, dir } of path) {
    const outcome = solverEngine.move({ ...state, player: from }, dir);
    const cells = new Set([outcome.state.player]);
    for (const landing of outcome.drops) if (landing >= 0) cells.add(landing);
    touched.push(cells);
    state = outcome.state;
  }
  const chain = touched.map(() => 1);
  let criticalPath = 0;
  for (let j = 0; j < touched.length; j += 1) {
    for (let i = 0; i < j; i += 1) {
      if ([...touched[i]].some((cell) => touched[j].has(cell))) chain[j] = Math.max(chain[j], chain[i] + 1);
    }
    criticalPath = Math.max(criticalPath, chain[j]);
  }
  return { pushes: path.length, criticalPath, coupling: path.length === 0 ? 1 : criticalPath / path.length };
}

// Stacks with exactly one push available on the board as it stands: the cell ahead
// isn't a wall, and the cell behind is bare floor (not a wall, lava, infinite lava or
// another stack) so the player could stand there. Such a stack is a chore rather than
// a choice. Each result is { cell, name, ahead, clear }, where `clear` says the
// pushing cell is one the player can already walk to: nothing has to be done first,
// which Michael found the worst kind. Unlike trivialDisposalStacks this looks at the
// position, not just the geometry, so a neighbour that gets moved can free a stack
// for more pushes later; it is meant for judging a starting position.
function forcedPushStacks(state) {
  const { cols, rows, cells, walls } = state;
  const abyss = state.abyss;
  const reachable = new Set(regionOf(state).region);
  const forced = [];
  for (let q = 0; q < cells.length; q += 1) {
    if (cells[q] <= 0) continue;
    const x = q % cols;
    const y = (q - x) / cols;
    const possible = [];
    for (const name of SOLVER_DIRS) {
      const { dx, dy } = solverEngine.DIRECTIONS[name];
      const ax = x + dx;
      const ay = y + dy;
      const bx = x - dx;
      const by = y - dy;
      if (ax < 0 || ay < 0 || ax >= cols || ay >= rows || bx < 0 || by < 0 || bx >= cols || by >= rows) continue;
      const ahead = ay * cols + ax;
      const behind = by * cols + bx;
      if (walls[ahead] || walls[behind] || (abyss && abyss[behind]) || cells[behind] !== 0) continue;
      possible.push({ name, ahead, behind });
    }
    if (possible.length === 1) {
      const { name, ahead, behind } = possible[0];
      forced.push({ cell: q, name, ahead, clear: reachable.has(behind) });
    }
  }
  return forced;
}

// Stacks that can only ever be pushed one way, and that way sends every block
// straight into infinite lava: chores rather than choices, obvious at a glance.
// Judged on the initial geometry alone: a direction is possible if the cell ahead
// isn't a wall and the cell behind isn't a wall or infinite lava (lava behind might
// be filled later, so it still counts). Returns the cells of such stacks.
function trivialDisposalStacks(state) {
  const { cols, rows, cells, walls } = state;
  const abyss = state.abyss;
  const isAbyss = (i) => Boolean(abyss && abyss[i]);
  const trivial = [];
  for (let q = 0; q < cells.length; q += 1) {
    if (cells[q] <= 0) continue;
    const x = q % cols;
    const y = (q - x) / cols;
    const possible = [];
    for (const name of SOLVER_DIRS) {
      const { dx, dy } = solverEngine.DIRECTIONS[name];
      const ax = x + dx;
      const ay = y + dy;
      const bx = x - dx;
      const by = y - dy;
      if (ax < 0 || ay < 0 || ax >= cols || ay >= rows || bx < 0 || by < 0 || bx >= cols || by >= rows) continue;
      const ahead = ay * cols + ax;
      const behind = by * cols + bx;
      if (walls[ahead] || walls[behind] || isAbyss(behind)) continue;
      possible.push({ name, ahead });
    }
    if (possible.length === 1 && isAbyss(possible[0].ahead)) trivial.push(q);
  }
  return trivial;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { analyse, solutionEvents, solutionCoupling, trivialDisposalStacks, forcedPushStacks, regionOf };
}
