// Pure rules for the lava-and-blocks puzzle -- no DOM. Shared by the browser
// game (src/play.js), the test bench (src/bench.js) and by tests/experiments run
// directly in Node, so all of them always agree on what the rules are. See README.md for the design.
//
// A state is { rows, cols, cells, walls, abyss, goals, wet, player }:
//   cells   signed height per cell: > 0 is a stack, < 0 is lava (depth is the
//           absolute value), 0 is floor. Walls and abyss cells hold 0 here too.
//   walls   0/1 per cell. Static, shared between states.
//   abyss   0/1 per cell: infinitely deep lava. Static, shared between states.
//           Stepping on it is fatal and a block landing on it is lost, and
//           nothing ever changes it. A closed board has only walls and abyss
//           cells around its edge; anything beyond the grid is treated as
//           abyss too, so levels without such a border still work.
//   goals   0/1 per cell. Static, shared between states. A goal is a marker
//           on the cell, not a cell state, so it is untouched by anything that
//           happens to the cell's contents.
//   wet     0/1 per cell, meaningful only where cells[i] > 0: whether that
//           stack is waterlogged ("There will be mud"; see README). A stack is
//           all wet or all dry, never mixed, so this is one bit per cell, not
//           per block.
//   player  cell index (row * cols + col).
// States are never mutated: move() returns a new one, which makes undo trivial.

const DIRECTIONS = {
  up: { dx: 0, dy: -1, label: "up" },
  down: { dx: 0, dy: 1, label: "down" },
  left: { dx: -1, dy: 0, label: "left" },
  right: { dx: 1, dy: 0, label: "right" }
};

const MAX_LEVEL_HEIGHT = 26; // Lava depth: the text format has one letter (a-z) per depth.
// A stack's letter also has to say whether it's wet, so dry (A-J) and wet (K-T) share
// the alphabet instead of each getting the full A-Z; this is the cap on height either way.
const MAX_STACK_HEIGHT = 10;

// The kinds of objective a level can have (see README, "Objective").
const OBJECTIVES = {
  reach: "Seize the crown (reach the goal)",
  lava: "Clear the lava",
  all: "Clear the dancefloor (all lava and blocks)"
};

// Level text: one line per row, one character per cell (`~` is infinite lava),
// with a `*` after a cell's character marking a goal on it. See README, "Level
// format".
function parseLevel(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  if (lines.length === 0) throw new Error("The level is empty.");

  const rows = lines.length;
  let cols = null;
  const cells = [];
  const walls = [];
  const abyss = [];
  const goals = [];
  const wet = [];
  let player = -1;

  lines.forEach((line, y) => {
    let x = 0;
    for (let i = 0; i < line.length; i += 1, x += 1) {
      const ch = line[i];
      const goal = line[i + 1] === "*";
      if (goal) i += 1;
      const where = `row ${y + 1}, cell ${x + 1}`;
      let value = 0;
      let wall = 0;
      let deep = 0;
      let soggy = 0;
      if (ch === ".") {
        value = 0;
      } else if (ch === "#") {
        wall = 1;
        if (goal) throw new Error(`A wall can't be a goal (${where}).`);
      } else if (ch === "~") {
        deep = 1;
        if (goal) throw new Error(`Infinite lava can't be a goal (${where}).`);
      } else if (ch === "@") {
        if (player >= 0) throw new Error(`More than one player (${where}).`);
        player = cells.length;
      } else if (ch >= "a" && ch <= "z") {
        value = -(ch.charCodeAt(0) - 96);
      } else if (ch >= "A" && ch <= "J") {
        value = ch.charCodeAt(0) - 64; // A-J: dry stacks, height 1-10.
      } else if (ch >= "K" && ch <= "T") {
        value = ch.charCodeAt(0) - 74; // K-T: waterlogged stacks, height 1-10.
        soggy = 1;
      } else {
        throw new Error(`Unexpected "${ch}" (${where}).`);
      }
      cells.push(value);
      walls.push(wall);
      abyss.push(deep);
      goals.push(goal ? 1 : 0);
      wet.push(soggy);
    }
    if (cols === null) cols = x;
    else if (x !== cols) throw new Error(`Row ${y + 1} has ${x} cells but row 1 has ${cols}.`);
  });

  if (player < 0) throw new Error("The level has no player (@).");
  return {
    rows,
    cols,
    cells: Int16Array.from(cells),
    walls: Uint8Array.from(walls),
    abyss: Uint8Array.from(abyss),
    goals: Uint8Array.from(goals),
    wet: Uint8Array.from(wet),
    player
  };
}

function formatLevel(state) {
  const lines = [];
  for (let y = 0; y < state.rows; y += 1) {
    let line = "";
    for (let x = 0; x < state.cols; x += 1) {
      const i = y * state.cols + x;
      const value = state.cells[i];
      if (value < 0 && -value > MAX_LEVEL_HEIGHT) {
        throw new RangeError(`Cell ${i} has lava depth ${-value}, more than the ${MAX_LEVEL_HEIGHT} the text format can hold.`);
      }
      if (value > MAX_STACK_HEIGHT) {
        throw new RangeError(`Cell ${i} has height ${value}, more than the ${MAX_STACK_HEIGHT} a stack's letter can hold (A-J dry, K-T waterlogged).`);
      }
      if (state.walls[i]) line += "#";
      else if (isAbyss(state, i)) line += "~";
      else if (i === state.player) line += "@";
      else if (value > 0) line += String.fromCharCode((state.wet && state.wet[i] ? 74 : 64) + value);
      else if (value < 0) line += String.fromCharCode(96 - value);
      else line += ".";
      if (state.goals[i]) line += "*";
    }
    lines.push(line);
  }
  return lines.join("\n");
}

function inBounds(state, x, y) {
  return x >= 0 && x < state.cols && y >= 0 && y < state.rows;
}

function isAbyss(state, index) {
  return state.abyss !== undefined && state.abyss[index] === 1;
}

// A closed board has a wall or infinite lava in every cell around its edge, so
// nothing ever depends on what lies beyond the grid.
function hasClosedBorder(state) {
  for (let y = 0; y < state.rows; y += 1) {
    for (let x = 0; x < state.cols; x += 1) {
      if (x !== 0 && y !== 0 && x !== state.cols - 1 && y !== state.rows - 1) continue;
      const i = y * state.cols + x;
      if (!state.walls[i] && !isAbyss(state, i)) return false;
    }
  }
  return true;
}

// Try to move the player one cell. Returns { result, state, ... } where result is:
//   "moved"   the player stepped onto floor.
//   "pushed"  the player pushed a stack (also carries `height` and `drops`).
//   "refused" nothing happened and no move was spent; `reason` says why.
//   "died"    the player stepped into lava, infinite lava or off the board
//             (which is infinite lava too). `state` is the state before the
//             fatal step; the caller decides what a death means. `reason` is
//             "lava", "abyss" (an infinite lava cell) or "edge" (off the grid).
// options.lavaFatal (default true) chooses between the last two for lava: when
// false, stepping into lava is refused instead of fatal.
function move(state, directionName, options = {}) {
  const lavaFatal = options.lavaFatal !== false;
  const { dx, dy } = DIRECTIONS[directionName];
  const x = state.player % state.cols;
  const y = Math.floor(state.player / state.cols);
  const nx = x + dx;
  const ny = y + dy;

  const intoLava = (reason) => (lavaFatal ? { result: "died", reason, state } : { result: "refused", reason, state });

  if (!inBounds(state, nx, ny)) return intoLava("edge");
  const target = ny * state.cols + nx;
  if (state.walls[target]) return { result: "refused", reason: "wall", state };
  if (isAbyss(state, target)) return intoLava("abyss");
  const value = state.cells[target];
  if (value < 0) return intoLava("lava");
  if (value === 0) return { result: "moved", state: { ...state, player: target } };
  return pushStack(state, target, nx, ny, dx, dy);
}

// The player has moved into the stack at `target` (column nx, row ny), pushing
// in direction (dx, dy). A stack of height h lays one block on each of the next
// h cells in that direction. Landing a dry block is just adding 1 to the cell's
// signed height, which covers every case at once: lava gets 1 shallower (and at
// depth 0 is floor, the block used up), floor becomes a stack of 1, and a stack
// gets 1 taller without toppling itself. A waterlogged block instead solidifies
// lava outright, however deep (see README, "There will be mud"), and makes
// whatever it lands on waterlogged in turn.
function pushStack(state, target, nx, ny, dx, dy) {
  const height = state.cells[target];
  const sourceWet = Boolean(state.wet && state.wet[target]);
  const beyondX = nx + dx;
  const beyondY = ny + dy;
  if (inBounds(state, beyondX, beyondY) && state.walls[beyondY * state.cols + beyondX]) {
    return { result: "refused", reason: "stack-blocked", state };
  }

  const cells = state.cells.slice();
  const wet = state.wet ? state.wet.slice() : new Uint8Array(cells.length);
  cells[target] = 0;
  wet[target] = 0;
  // Per block: the cell index it landed on, or -1 if it fell off the grid. A
  // block landing on an abyss cell is lost too, but its index is still reported.
  const drops = [];
  let wallPile = -1; // Once a wall is met, every remaining block piles on the cell before it.
  let offBoard = false;
  let cx = nx;
  let cy = ny;
  for (let k = 0; k < height; k += 1) {
    let landing;
    if (wallPile >= 0) {
      landing = wallPile;
    } else if (offBoard) {
      landing = -1;
    } else {
      cx += dx;
      cy += dy;
      if (!inBounds(state, cx, cy)) {
        offBoard = true;
        landing = -1;
      } else if (state.walls[cy * state.cols + cx]) {
        wallPile = (cy - dy) * state.cols + (cx - dx);
        landing = wallPile;
      } else {
        landing = cy * state.cols + cx;
      }
    }
    drops.push(landing);
    if (landing >= 0 && !isAbyss(state, landing)) {
      const wasStack = cells[landing] > 0;
      const existingWet = wasStack && wet[landing] === 1;
      if (sourceWet && cells[landing] < 0) cells[landing] = 0; // mud fills lava outright, any depth, one block used up.
      else cells[landing] += 1;
      // Touching a waterlogged block waterlogs the rest of the stack (README); once
      // wet, a stack stays wet however much dry material later lands on it too.
      if (cells[landing] > 0) wet[landing] = existingWet || sourceWet ? 1 : 0;
    }
  }
  return { result: "pushed", state: { ...state, cells, wet, player: target }, height, drops };
}

// For each stack the player could push right now, where its blocks would land,
// for drawing a preview. Returns [{ direction, landings }] where each landing is
// { x, y, count, lost }: `count` blocks land on that cell (a wall pile counts
// several on one cell). Blocks that fall into an infinite lava cell are reported
// as lost on that cell. Blocks that fall off the grid entirely (only possible on
// a board without a closed border) are reported as one lost landing on the first
// tile outside the grid along the push line, so x or y may be -1 or the board
// size. Stacks that can't be pushed (against a wall) are left out.
function previewPushes(state) {
  const px = state.player % state.cols;
  const py = Math.floor(state.player / state.cols);
  const previews = [];
  for (const name of Object.keys(DIRECTIONS)) {
    const { dx, dy } = DIRECTIONS[name];
    const nx = px + dx;
    const ny = py + dy;
    if (!inBounds(state, nx, ny) || state.cells[ny * state.cols + nx] <= 0) continue;
    const outcome = move(state, name);
    if (outcome.result !== "pushed") continue;
    const counts = new Map();
    let offGrid = 0;
    for (const landing of outcome.drops) {
      if (landing < 0) offGrid += 1;
      else counts.set(landing, (counts.get(landing) || 0) + 1);
    }
    const landings = [...counts].map(([index, count]) => ({ x: index % state.cols, y: Math.floor(index / state.cols), count, lost: isAbyss(state, index) }));
    if (offGrid > 0) {
      let x = nx;
      let y = ny;
      while (inBounds(state, x, y)) {
        x += dx;
        y += dy;
      }
      landings.push({ x, y, count: offGrid, lost: true });
    }
    previews.push({ direction: name, landings });
  }
  return previews;
}

function isWon(state, objective) {
  if (objective === "reach") return state.goals[state.player] === 1;
  if (objective === "lava") return state.cells.every((value) => value >= 0);
  if (objective === "all") return state.cells.every((value) => value === 0);
  throw new Error(`Unknown objective "${objective}".`);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { DIRECTIONS, OBJECTIVES, MAX_LEVEL_HEIGHT, MAX_STACK_HEIGHT, parseLevel, formatLevel, hasClosedBorder, move, previewPushes, isWon };
}
