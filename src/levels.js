// Hand-made levels for the test bench. Each is checked by tests/levels.test.js
// to be solvable under its own objective. Level text format: see README.md.
const PRESET_LEVELS = [
  {
    name: "Crossing the moat",
    objective: "reach",
    text: [
      "########",
      "#@Caaa.*#",
      "########"
    ].join("\n")
  },
  {
    name: "Caterpillar",
    objective: "reach",
    text: [
      "#########",
      "#@.B.aa.*#",
      "#########"
    ].join("\n")
  },
  {
    name: "Covered goal",
    objective: "reach",
    text: [
      "#######",
      "#@..B*.#",
      "#######"
    ].join("\n")
  },
  {
    name: "Yard",
    objective: "reach",
    text: [
      "#########",
      "#@..#...#",
      "#.C.a.D.#",
      "#...#a..#",
      "#....a..*#",
      "#########"
    ].join("\n")
  },
  {
    name: "Clear the lava",
    objective: "lava",
    text: [
      "######",
      "#@.Ba#",
      "#..Aa#",
      "######"
    ].join("\n")
  },
  {
    name: "README worked example (sandbox)",
    objective: "lava",
    text: ["~~~~~~~~", "~@Eba.#~", "~~~~~~~~"].join("\n")
  }
];

// The levels in the player-facing game. All are "reach the goal" levels, each
// checked by tests/levels.test.js. The first three are short hand-made intros; the
// rest were found by experiments/find-levels.js (seed and measurements noted).
const CURATED_LEVELS = [
  { text: PRESET_LEVELS[0].text },
  {
    // An L-shaped corridor with the box stuck in the corner. In Sokoban that
    // would be a dead end; here the corner is next to infinite lava, so the box
    // can be pushed into it and lost (the intro to losing blocks).
    text: [
      "~~~~~~",
      "~@..A~",
      "~###.~",
      "~###.~",
      "~###.*~",
      "~~~~~~"
    ].join("\n")
  },
  { text: PRESET_LEVELS[1].text },
  {
    // seed 4: 12 pushes, 2 optimal solutions, slack 1.
    text: [
      "~~~~~~~~",
      "~..d.*a.~",
      "~.C.a#.~",
      "~..abA@~",
      "~.#..Ca~",
      "~#.....~",
      "~......~",
      "~~~~~~~~"
    ].join("\n")
  },
  {
    // seed 6: 11 pushes, 2 optimal solutions, slack 1; 90% of positions are dead ends.
    // (The search's version had a depth-2 lava cell in the bottom-left corner;
    // it changed nothing about the puzzle, so it is floor here.)
    text: [
      "~~~~~~~~",
      "~......~",
      "~...#.c*~",
      "~..@D..~",
      "~...#..~",
      "~..#..A~",
      "~.#....~",
      "~~~~~~~~"
    ].join("\n")
  },
  {
    // seed 14: 9 pushes, 2 optimal solutions, slack 1; 38% of positions are dead ends.
    text: [
      "~~~~~~~~",
      "~a.*...c~",
      "~.b.#d.~",
      "~.aa...~",
      "~.a....~",
      "~.B....~",
      "~@.b.a.~",
      "~~~~~~~~"
    ].join("\n")
  },
  {
    // seed 17: 10 pushes, 1 optimal solution, slack 0; 69% of positions are dead ends.
    text: [
      "~~~~~~~~",
      "~......~",
      "~....c.~",
      "~...A.b~",
      "~..b.aD~",
      "~..b...~",
      "~@a*..a.~",
      "~~~~~~~~"
    ].join("\n")
  },
  {
    // seed 11: 12 pushes, 1 optimal solution, slack 0; 74% of positions are dead ends.
    text: [
      "~~~~~~~~",
      "~....a.*~",
      "~..a.@b~",
      "~...b..~",
      "~......~",
      "~...Bb.~",
      "~..Cb..~",
      "~~~~~~~~"
    ].join("\n")
  }
];

if (typeof module !== "undefined" && module.exports) {
  module.exports = { PRESET_LEVELS, CURATED_LEVELS };
}
