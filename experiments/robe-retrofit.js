// Turns dry "Seize the Crown" levels into robe levels, and checks robe levels
// for cheese.
//
//   node experiments/robe-retrofit.js results.json [more.json ...]
//       Retrofit: for each level in a find-levels.js --json file, find an
//       essential, once-visited floor cell on the dry solution's path (the one
//       farthest from the start first), turn it to lava, and give the player the
//       robe (`carried: 1`). Prints each verified level as text.
//   ... --json-dir <dir>
//       Also write each input's verified levels to <dir>/<input name>-robe.json,
//       in the input's own order (null where a level had no candidate, so a
//       level keeps its rank), for harness.html to play. Each entry has
//       `robe: true`, since the text alone doesn't carry the robe.
//   node experiments/robe-retrofit.js --check
//       Cheese-check (and walk-only-check) every level in POTION_LEVELS (also run by
//       tests/robe-levels.test.js).
//
// The cheese test (canCheeseGoal): without ever spending the robe, can the
// player push their way to a cell next to a goal that is still on lava? If so
// they just step on and grab the crown, skipping the intended solve. "Goal
// already on lava" is neither necessary nor sufficient for that -- a different
// choice of retrofit cell can block the route even when the goal stays on lava
// -- so it's tested per candidate cell, and a rejected cell just means "try the
// next essential cell for this level", not "discard the level".
//
// The timing test (robeTiming): in the intended solution the robe must be spent
// after at least one push and before the last one. Spent before any push, the
// retrofitted lava is just a toll gate between the start and the real puzzle
// (the rest is the dry level unchanged); spent after the last push, the robe is
// only a hop over the crown's moat. Either way the robe never interacts with the
// pushing. Judged on the one intended solution, not on every solution.
//
// Not covered: other ways the robe could shortcut the intended solution.
"use strict";

const fs = require("fs");
const engine = require("../src/engine.js");
const solver = require("../src/solver.js");

const { parseLevel, formatLevel, move, isWon, DIRECTIONS } = engine;
const { analyse, regionOf } = solver;

function cloneState(state) {
  return { ...state, cells: state.cells.slice(), wet: state.wet ? state.wet.slice() : state.wet, potions: state.potions ? state.potions.slice() : state.potions };
}

function bfsPath(state, from, to) {
  if (from === to) return [];
  const { cols, rows, cells, walls } = state;
  const abyss = state.abyss;
  const prev = new Map([[from, null]]);
  const pending = [from];
  let head = 0;
  while (head < pending.length) {
    const c = pending[head]; head += 1;
    if (c === to) break;
    const x = c % cols, y = (c - x) / cols;
    for (const name of Object.keys(DIRECTIONS)) {
      const { dx, dy } = DIRECTIONS[name];
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      const n = ny * cols + nx;
      if (prev.has(n) || walls[n] || (abyss && abyss[n]) || cells[n] !== 0) continue;
      prev.set(n, { from: c, dir: name });
      pending.push(n);
    }
  }
  if (!prev.has(to)) return null;
  const dirs = [];
  let cur = to;
  while (cur !== from) { const step = prev.get(cur); dirs.push(step.dir); cur = step.from; }
  dirs.reverse();
  return dirs;
}

function expandPushPath(state, pushPath) {
  const dirs = [];
  const visits = new Map();
  const tally = (c) => visits.set(c, (visits.get(c) || 0) + 1);
  let cur = state;
  tally(cur.player);
  for (const { from, dir } of pushPath) {
    const walk = bfsPath(cur, cur.player, from);
    if (walk === null) throw new Error(`No walking route from ${cur.player} to ${from}.`);
    for (const d of walk) {
      const outcome = move(cur, d);
      if (outcome.result !== "moved") throw new Error(`Unexpected walk outcome ${outcome.result}.`);
      cur = outcome.state; tally(cur.player); dirs.push(d);
    }
    const outcome = move(cur, dir);
    if (outcome.result !== "pushed") throw new Error(`Expected a push, got ${outcome.result}.`);
    cur = outcome.state; tally(cur.player); dirs.push(dir);
  }
  const goalCell = cur.goals.findIndex((v, i) => v === 1 && bfsPath(cur, cur.player, i) !== null);
  if (goalCell >= 0) {
    const finish = bfsPath(cur, cur.player, goalCell);
    for (const d of finish) {
      const outcome = move(cur, d);
      if (outcome.result !== "moved") throw new Error(`Unexpected walk outcome ${outcome.result} finishing at the goal.`);
      cur = outcome.state; tally(cur.player); dirs.push(d);
    }
  }
  return { dirs, visits, final: cur };
}

function manhattan(cols, a, b) {
  const ax = a % cols, ay = (a - ax) / cols, bx = b % cols, by = (b - bx) / cols;
  return Math.abs(ax - bx) + Math.abs(ay - by);
}
function cellName(cols, c) { const x = c % cols, y = (c - x) / cols; return `(${x},${y})`; }

function verifyRobeRetrofit(state, candidateCell, dirs) {
  const modified = cloneState(state);
  modified.cells[candidateCell] = -1;
  modified.carried = 1;
  let cur = modified;
  for (const d of dirs) {
    const outcome = move(cur, d);
    if (outcome.result === "died" || outcome.result === "refused") return null;
    cur = outcome.state;
  }
  if (!isWon(cur, "reach")) return null;
  return { modified, cur };
}

// Can the player, WITHOUT ever spending the robe (so: ordinary dry push/walk
// rules, exactly like analyse()'s own model, where the candidate cell is
// already lava and thus impassable), reach a state from which the goal --
// still on lava -- is one step away? That's the "walk up and grab the crown
// with the charge, cheesing past the intended puzzle" shortcut. BFS over the
// push-reachable state graph, same expansion analyse() uses internally.
function canCheeseGoal(state, maxStates = 20000) {
  const goalCell = state.goals.findIndex((v) => v === 1);
  const goalIsLava = state.cells[goalCell] < 0;
  const key = (s) => s.cells.join(",") + "|" + s.player;
  const seen = new Set([key(state)]);
  const queue = [state];
  let head = 0;
  const gx = goalCell % state.cols, gy = (goalCell - gx) / state.cols;
  const neighbors = [];
  for (const name of Object.keys(DIRECTIONS)) {
    const { dx, dy } = DIRECTIONS[name];
    const nx = gx + dx, ny = gy + dy;
    if (nx < 0 || nx >= state.cols || ny < 0 || ny >= state.rows) continue;
    neighbors.push(ny * state.cols + nx);
  }
  while (head < queue.length) {
    const s = queue[head]; head += 1;
    const { region } = regionOf(s);
    const regionSet = new Set(region);
    if (goalIsLava) {
      if (neighbors.some((n) => regionSet.has(n))) return true;
    } else if (regionSet.has(goalCell)) {
      return true;
    }
    for (const c of region) {
      const x = c % s.cols, y = (c - x) / s.cols;
      for (const name of Object.keys(DIRECTIONS)) {
        const { dx, dy } = DIRECTIONS[name];
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= s.cols || ny < 0 || ny >= s.rows) continue;
        const target = ny * s.cols + nx;
        if (s.cells[target] <= 0) continue;
        const outcome = move({ ...s, player: c }, name);
        if (outcome.result !== "pushed") continue;
        const k = key(outcome.state);
        if (seen.has(k)) continue;
        seen.add(k);
        queue.push(outcome.state);
        if (queue.length >= maxStates) return "truncated";
      }
    }
  }
  return false;
}

// Pushes made before and after the step that spends the robe, replaying `dirs`
// on the robe level. `before` is null if the robe is never spent.
function robeTiming(modified, dirs) {
  let cur = modified;
  let pushes = 0;
  let before = null;
  for (const d of dirs) {
    const outcome = move(cur, d);
    if (outcome.result === "pushed") pushes += 1;
    if (outcome.usedPotion && before === null) before = pushes;
    cur = outcome.state;
  }
  return { before, after: before === null ? null : pushes - before };
}

function analyseCandidate(text) {
  const state = parseLevel(text);
  const original = analyse(state, { full: true });
  if (!original.solvable) return { rejected: "unsolvable?!" };
  const expanded = expandPushPath(state, original.path);
  if (!isWon(expanded.final, "reach")) return { rejected: "optimal replay didn't win" };

  const candidates = [];
  for (let c = 0; c < state.cells.length; c += 1) {
    if (state.walls[c] || state.abyss[c] || state.cells[c] !== 0 || state.goals[c] || c === state.player) continue;
    candidates.push(c);
  }
  candidates.sort((a, b) => manhattan(state.cols, state.player, b) - manhattan(state.cols, state.player, a));

  const essentialSingleVisit = [];
  for (const c of candidates) {
    if ((expanded.visits.get(c) || 0) !== 1) continue;
    const modified = cloneState(state);
    modified.cells[c] = -1;
    const check = analyse(modified, { full: false });
    if (check.solvable) continue;
    essentialSingleVisit.push({ cell: c, dist: manhattan(state.cols, state.player, c) });
  }

  const rejectedForCheese = [];
  let rejectedForTiming = 0;
  for (const candidate of essentialSingleVisit) {
    const result = verifyRobeRetrofit(state, candidate.cell, expanded.dirs);
    if (!result) continue;
    const cheese = canCheeseGoal(result.modified);
    if (cheese === true || canWalkToGoal(result.modified)) { rejectedForCheese.push(candidate); continue; }
    const timing = robeTiming(result.modified, expanded.dirs);
    if (!(timing.before >= 1 && timing.after >= 1)) { rejectedForTiming += 1; continue; }
    return { pushes: original.pushes, candidate, timing, verified: result.modified, essentialSingleVisitCount: essentialSingleVisit.length, rejectedForCheese: rejectedForCheese.length, rejectedForTiming, cheeseTruncated: cheese === "truncated" };
  }
  return { pushes: original.pushes, candidate: null, essentialSingleVisitCount: essentialSingleVisit.length, rejectedForCheese: rejectedForCheese.length, rejectedForTiming };
}

// The other failure mode: the robe alone solves it. Can the player win with the
// robe by walking only, never pushing anything? Then the level is "walk through
// one bit of magma", not a puzzle, however sound the push solution is.
function canWalkToGoal(state) {
  const key = (s) => `${s.player}|${s.carried}`;
  const seen = new Set([key(state)]);
  const queue = [state];
  for (let head = 0; head < queue.length; head += 1) {
    const s = queue[head];
    if (isWon(s, "reach")) return true;
    for (const name of Object.keys(DIRECTIONS)) {
      const outcome = move(s, name);
      if (outcome.result !== "moved") continue;
      const k = key(outcome.state);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push(outcome.state);
    }
  }
  return false;
}

module.exports = { canCheeseGoal, canWalkToGoal, analyseCandidate, expandPushPath };

function retrofit(paths, jsonDir) {
  const hits = [];
  for (const path of paths) {
    const levels = JSON.parse(fs.readFileSync(path));
    const written = levels.map(() => null);
    levels.forEach((level, idx) => {
      const r = analyseCandidate(level.text);
      const label = `${path} #${idx + 1}`;
      if (r.rejected) { console.log(`${label}: REJECTED (${r.rejected})`); return; }
      if (!r.candidate) {
        console.log(`${label}: no candidate (${r.essentialSingleVisitCount} essential+single-visit cells, ${r.rejectedForCheese} rejected as cheesable, ${r.rejectedForTiming} for robe timing)`);
        return;
      }
      const cols = parseLevel(level.text).cols;
      console.log(`${label}: candidate ${cellName(cols, r.candidate.cell)} dist=${r.candidate.dist} (of ${r.essentialSingleVisitCount}, ${r.rejectedForCheese} cheesable and ${r.rejectedForTiming} badly timed skipped first) -- robe spent after ${r.timing.before} of ${r.pushes} pushes, solutions ${level.solutions}`);
      hits.push({ label, verified: r.verified });
      written[idx] = { text: formatLevel(r.verified), robe: true, source: label, cell: cellName(cols, r.candidate.cell), pushes: r.pushes, robeAfterPushes: r.timing.before, solutions: level.solutions, score: level.score };
    });
    if (jsonDir) fs.writeFileSync(`${jsonDir}/${require("path").basename(path, ".json")}-robe.json`, JSON.stringify(written, null, 2) + "\n");
  }
  console.log(`\n${hits.length} verified, non-cheesable candidates.\n`);
  for (const h of hits) {
    console.log(`--- ${h.label} ---`);
    console.log(formatLevel(h.verified));
    console.log();
  }
}

function checkPotionLevels() {
  const { POTION_LEVELS } = require("../src/levels.js");
  POTION_LEVELS.forEach((level, i) => {
    const state = { ...parseLevel(level.text), carried: level.carried };
    console.log(`#${i + 1} cheesable without the robe: ${canCheeseGoal(state, 200000)}; walk-only win with the robe: ${canWalkToGoal(state)}`);
  });
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes("--check")) checkPotionLevels();
  else if (args.length) {
    const flag = args.indexOf("--json-dir");
    const jsonDir = flag >= 0 ? args.splice(flag, 2)[1] : null;
    retrofit(args, jsonDir);
  }
  else console.log("Usage: see the header comment.");
}
