// Exact solver and level analysis for the "reach a goal" objective -- no DOM.
// Used by experiments (finding interesting levels) and tests; see README.md.
//
// The search is over pushes, not steps. Between pushes the player can walk
// anywhere in the connected region of floor cells they stand in, so a state
// is the board plus which region the player is in (represented by the region's
// lowest cell index). A win is a region that contains a goal cell.

const solverEngine = typeof module !== "undefined" && module.exports ? require("./engine.js") : { move, DIRECTIONS };

const SOLVER_DIRS = Object.keys(solverEngine.DIRECTIONS);

// Flood-fill the floor cells the player can walk to. Stacks, lava and walls
// all stop the player (walking into a stack is a push, not a walk).
function regionOf(state) {
  const { cols, rows, cells, walls, goals } = state;
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
      if (seen[n] || walls[n] || cells[n] !== 0) continue;
      seen[n] = 1;
      pending.push(n);
    }
  }
  return { region, reachesGoal, lowest };
}

function stateKey(state) {
  let key = "";
  for (let i = 0; i < state.cells.length; i += 1) key += String.fromCharCode(state.cells[i] + 64);
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
function analyse(start, options = {}) {
  const maxStates = options.maxStates ?? 100000;
  const full = options.full !== false;
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
    nodes.push({ state: canonical, region, won: reachesGoal, depth, ways, parent, via, children: [], blocks: blocksIn(canonical) });
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
        if (nodes[child].won && nodes[child].depth < winDepth) winDepth = nodes[child].depth;
      }
      if (truncated) break;
    }
    if (truncated) break;
  }

  const result = { solvable: winDepth !== Infinity, pushes: winDepth, optimalCount: 0, slack: 0, states: nodes.length, truncated, path: [] };
  if (!result.solvable) return result;

  let best = -1;
  for (let i = 0; i < nodes.length; i += 1) {
    if (!nodes[i].won) continue;
    if (nodes[i].depth === winDepth) {
      result.optimalCount += nodes[i].ways;
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
  }
  return result;
}

// Replay a solution path (from analyse) and report which unusual things happen
// in it: "cover" (a block lands on the goal, covering it), "pile" (blocks pile
// up against a wall), "stack" (a block lands on an existing stack) and "edge"
// (blocks are lost off the board). Filling lava is the ordinary case and isn't
// listed.
function solutionEvents(start, path) {
  const events = new Set();
  let state = start;
  for (const { from, dir } of path) {
    const outcome = solverEngine.move({ ...state, player: from }, dir);
    const landed = new Set();
    for (const landing of outcome.drops) {
      if (landing < 0) {
        events.add("edge");
        continue;
      }
      if (landed.has(landing)) events.add("pile");
      landed.add(landing);
      if (state.cells[landing] > 0) events.add("stack");
      if (state.goals[landing] && outcome.state.cells[landing] > 0) events.add("cover");
    }
    state = outcome.state;
  }
  return events;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { analyse, solutionEvents, regionOf };
}
