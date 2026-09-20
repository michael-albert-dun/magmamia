// Pure rules for the lava-and-blocks puzzle -- no DOM. Shared by the browser
// test bench (src/game.js) and by tests/experiments run directly in Node, so
// both always agree on what the rules are. See README.md for the design.
//
// A state is { rows, cols, cells, walls, goals, player }:
//   cells   signed height per cell: > 0 is a stack, < 0 is lava (depth is the
//           absolute value), 0 is floor. Walls hold 0 here too.
//   walls   0/1 per cell. Static, shared between states.
//   goals   0/1 per cell. Static, shared between states. A goal is a marker
//           on the cell, not a cell state, so it is untouched by anything that
//           happens to the cell's contents.
//   player  cell index (row * cols + col).
// States are never mutated: move() returns a new one, which makes undo trivial.

const DIRECTIONS = {
  up: { dx: 0, dy: -1, label: "up" },
  down: { dx: 0, dy: 1, label: "down" },
  left: { dx: -1, dy: 0, label: "left" },
  right: { dx: 1, dy: 0, label: "right" }
};

const MAX_LEVEL_HEIGHT = 26; // The text format has one letter per height/depth.

// The kinds of objective a level can have (see README, "Objective").
const OBJECTIVES = {
  reach: "Reach a goal",
  lava: "Clear all the lava",
  all: "Clear all the lava and blocks"
};

// Level text: one line per row, one character per cell, with a `*` after a
// cell's character marking a goal on it. See README, "Level format".
function parseLevel(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  if (lines.length === 0) throw new Error("The level is empty.");

  const rows = lines.length;
  let cols = null;
  const cells = [];
  const walls = [];
  const goals = [];
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
      if (ch === ".") {
        value = 0;
      } else if (ch === "#") {
        wall = 1;
        if (goal) throw new Error(`A wall can't be a goal (${where}).`);
      } else if (ch === "@") {
        if (player >= 0) throw new Error(`More than one player (${where}).`);
        player = cells.length;
      } else if (ch >= "a" && ch <= "z") {
        value = -(ch.charCodeAt(0) - 96);
      } else if (ch >= "A" && ch <= "Z") {
        value = ch.charCodeAt(0) - 64;
      } else {
        throw new Error(`Unexpected "${ch}" (${where}).`);
      }
      cells.push(value);
      walls.push(wall);
      goals.push(goal ? 1 : 0);
    }
    if (cols === null) cols = x;
    else if (x !== cols) throw new Error(`Row ${y + 1} has ${x} cells but row 1 has ${cols}.`);
  });

  if (player < 0) throw new Error("The level has no player (@).");
  return { rows, cols, cells: Int16Array.from(cells), walls: Uint8Array.from(walls), goals: Uint8Array.from(goals), player };
}

function formatLevel(state) {
  const lines = [];
  for (let y = 0; y < state.rows; y += 1) {
    let line = "";
    for (let x = 0; x < state.cols; x += 1) {
      const i = y * state.cols + x;
      const value = state.cells[i];
      if (Math.abs(value) > MAX_LEVEL_HEIGHT) {
        throw new RangeError(`Cell ${i} has height ${value}, more than the ${MAX_LEVEL_HEIGHT} the text format can hold.`);
      }
      if (state.walls[i]) line += "#";
      else if (i === state.player) line += "@";
      else if (value > 0) line += String.fromCharCode(64 + value);
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

// Try to move the player one cell. Returns { result, state, ... } where result is:
//   "moved"   the player stepped onto floor.
//   "pushed"  the player pushed a stack (also carries `height` and `drops`).
//   "refused" nothing happened and no move was spent; `reason` says why.
//   "died"    the player stepped into lava (or off the board, which is lava
//             too). `state` is the state before the fatal step; the caller
//             decides what a death means.
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
  const value = state.cells[target];
  if (value < 0) return intoLava("lava");
  if (value === 0) return { result: "moved", state: { ...state, player: target } };
  return pushStack(state, target, nx, ny, dx, dy);
}

// The player has moved into the stack at `target` (column nx, row ny), pushing
// in direction (dx, dy). A stack of height h lays one block on each of the next
// h cells in that direction. Landing a block is just adding 1 to the cell's
// signed height, which covers every case at once: lava gets 1 shallower (and at
// depth 0 is floor, the block used up), floor becomes a stack of 1, and a stack
// gets 1 taller without toppling itself.
function pushStack(state, target, nx, ny, dx, dy) {
  const height = state.cells[target];
  const beyondX = nx + dx;
  const beyondY = ny + dy;
  if (inBounds(state, beyondX, beyondY) && state.walls[beyondY * state.cols + beyondX]) {
    return { result: "refused", reason: "stack-blocked", state };
  }

  const cells = state.cells.slice();
  cells[target] = 0;
  const drops = []; // Per block: the cell index it landed on, or -1 if lost off the edge.
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
    if (landing >= 0) cells[landing] += 1;
  }
  return { result: "pushed", state: { ...state, cells, player: target }, height, drops };
}

function isWon(state, objective) {
  if (objective === "reach") return state.goals[state.player] === 1;
  if (objective === "lava") return state.cells.every((value) => value >= 0);
  if (objective === "all") return state.cells.every((value) => value === 0);
  throw new Error(`Unknown objective "${objective}".`);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { DIRECTIONS, OBJECTIVES, MAX_LEVEL_HEIGHT, parseLevel, formatLevel, move, isWon };
}
