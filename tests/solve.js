// Test-only helper: breadth-first search for the fewest moves that satisfy an
// objective. Deaths and refused moves are never part of a solution. Returns
// { length, path } or { length: null } if nothing is found within `cap` states.
const { parseLevel, move, isWon, DIRECTIONS } = require("../src/engine.js");

function solve(text, objective, cap = 500000) {
  const start = parseLevel(text);
  const key = (s) => `${s.cells.join(",")}|${s.player}`;
  if (isWon(start, objective)) return { length: 0, path: [] };
  const seen = new Map([[key(start), null]]);
  let frontier = [start];
  let depth = 0;
  while (frontier.length > 0 && seen.size < cap) {
    depth += 1;
    const next = [];
    for (const state of frontier) {
      for (const dir of Object.keys(DIRECTIONS)) {
        const outcome = move(state, dir);
        if (outcome.result === "died" || outcome.result === "refused") continue;
        const k = key(outcome.state);
        if (seen.has(k)) continue;
        seen.set(k, { prev: key(state), dir });
        if (isWon(outcome.state, objective)) {
          const path = [];
          for (let cur = k; seen.get(cur); cur = seen.get(cur).prev) path.push(seen.get(cur).dir);
          return { length: depth, path: path.reverse() };
        }
        next.push(outcome.state);
      }
    }
    frontier = next;
  }
  return { length: null };
}

module.exports = { solve };
