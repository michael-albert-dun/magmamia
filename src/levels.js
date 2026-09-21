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
// rest were found by experiments/find-levels.js (seed and measurements noted;
// the full results are in experiments/results/). An entry may set `objective`
// ("reach" by default, or "lava" or "all"); crown levels need a goal cell.
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
  },
  {
    // seed 103 (ring search 2026-09-21, rank #11): 7 pushes, 1 optimal solution, slack 0; 65% of positions are dead ends.
    text: [
      "~~~~~~~~",
      "~a.a...~",
      "~BAaa*..~",
      "~.aE.@.~",
      "~a.....~",
      "~......~",
      "~......~",
      "~~~~~~~~"
    ].join("\n")
  },
  {
    // seed 105 (ring search 2026-09-21, rank #9): 8 pushes, 1 optimal solution, slack 0; 84% of positions are dead ends.
    text: [
      "~~~~~~~~",
      "~a*ca...~",
      "~..cB..~",
      "~A.....~",
      "~b.....~",
      "~......~",
      "~@.....~",
      "~~~~~~~~"
    ].join("\n")
  },
  {
    // seed 103 (ring search 2026-09-21, rank #6): 10 pushes, 1 optimal solution, slack 0; 73% of positions are dead ends.
    text: [
      "~~~~~~~~",
      "~..#...~",
      "~.#a*...~",
      "~......~",
      "~bC....~",
      "~......~",
      "#.Aa..@~",
      "~~~~~~~~"
    ].join("\n")
  },
  {
    // seed 103 (ring search 2026-09-21, rank #10): 11 pushes, 3 optimal solutions, slack 0; 74% of positions are dead ends.
    text: [
      "~~~~~~~~",
      "~...#..~",
      "~b.@C..~",
      "~..a...~",
      "~a*a....~",
      "~......~",
      "~......~",
      "~~~~~~~~"
    ].join("\n")
  },
  {
    // seed 101 (ring search 2026-09-21, rank #8): 9 pushes, 1 optimal solution, slack 1; 85% of positions are dead ends.
    text: [
      "~~~~~~~~",
      "~...a..~",
      "~......~",
      "~..@...~",
      "~.Dd.c#~",
      "~...c.*.~",
      "~b...a.~",
      "~~~~~~~~"
    ].join("\n")
  },
  {
    // seed 101 (ring search 2026-09-21, rank #4): 13 pushes, 1 optimal solution, slack 1; 91% of positions are dead ends.
    text: [
      "~~~~~~~~",
      "~..cd..~",
      "~...A..~",
      "~ab*....~",
      "~.a.#.a~",
      "~..#.C@~",
      "~......~",
      "~~~~~~~~"
    ].join("\n")
  },
  {
    // seed 106 (ring search 2026-09-21, rank #7): 10 pushes, 1 optimal solution, slack 0; 93% of positions are dead ends.
    text: [
      "~~~~~~~~",
      "~.....a~",
      "~a...B.~",
      "~A#b...#",
      "~..#.a.~",
      "~..a..b*~",
      "~@.a...~",
      "~~~~~~~~"
    ].join("\n")
  },
  {
    // seed 106 (ring search 2026-09-21, rank #5): 10 pushes, 1 optimal solution, slack 0; 97% of positions are dead ends.
    text: [
      "~~~~~~~~",
      "~...c.a*~",
      "~......~",
      "~...aCc#",
      "~....AB~",
      "~..#.b.~",
      "~...c.@~",
      "~~~~~~~~"
    ].join("\n")
  },
  {
    // seed 101 (ring search 2026-09-21, rank #2): 12 pushes, 1 optimal solution, slack 0; 98% of positions are dead ends.
    text: [
      "~~~~~~~~",
      "~b*#....~",
      "~b...A.~",
      "~.B.#A.~",
      "~..b...~",
      "~.b....~",
      "~.@....~",
      "~~~~~~~~"
    ].join("\n")
  },
  {
    // seed 106 (ring search 2026-09-21, rank #1): 15 pushes, 2 optimal solutions, slack 0; 98% of positions are dead ends.
    text: [
      "~~~~~~~~",
      "~a.a.b.~",
      "~.C....~",
      "~.Aa.ac*~",
      "~B...a.~",
      "~@#a...~",
      "~a.....~",
      "~~~~~~~~"
    ].join("\n")
  },
  {
    // seed 101 (ring search 2026-09-21, rank #3): 17 pushes, 1 optimal solution, slack 1; 99% of positions are dead ends.
    text: [
      "~~~~~~~~",
      "~@.....~",
      "~#....b~",
      "~.Bcac.~",
      "~....Da~",
      "~..b...~",
      "~..b..a*~",
      "~~~~~~~~"
    ].join("\n")
  }
];

// "Clear the dancefloor" candidates for Michael to try at index.html?set=dancefloor
// and judge. Built by running the game backwards (src/generator.js); his reasons
// for why one works or doesn't become the filters for the next round.
const DANCEFLOOR_CANDIDATES = [
  {
    // Round 1, #1: as generated, then the 5-block pile in the corner was removed (Michael:
    // "a fine introduction with the 5 block pile omitted"). 4 pushes, 3 stacks.
    objective: "all",
    text: [
      "~~#~~~~~",
      "~.Da.aa#",
      "~@.....~",
      "#C.....#",
      "#a.....~",
      "~a..#B.~",
      "~a...a.~",
      "~~~~~~##"
    ].join("\n")
  },
  {
    // Round 1, #2: 5 pushes, 5 stacks, 7 lava cells, 6 border walls, one red herring.
    objective: "all",
    text: [
      "~~~~~~#~",
      "#...Dba~",
      "~....aa#",
      "~....Ca#",
      "~A....a#",
      "~.....C#",
      "~...@Ba~",
      "~~~~~~~~"
    ].join("\n")
  },
  {
    // Round 1, #3: 6 pushes, 5 stacks, 4 lava cells, 11 border walls, one red herring.
    objective: "all",
    text: [
      "#~~~~~~#",
      "#.....b#",
      "#......~",
      "~.#.AAC~",
      "#...Ba.~",
      "#...a.@~",
      "~...b.C#",
      "~~#~#~~#"
    ].join("\n")
  },
  {
    // Round 1, #4: 5 pushes, 5 stacks, 7 lava cells, 8 border walls, one red herring.
    objective: "all",
    text: [
      "#~#~##~~",
      "~.aaB@.~",
      "~.A.E..~",
      "~.a.b..~",
      "~...b..#",
      "~...A.D~",
      "#...a.a#",
      "~~~~~#~~"
    ].join("\n")
  },
  {
    // Round 1, #5: 6 pushes, 6 stacks, 16 lava cells, 9 border walls, one red herring.
    objective: "all",
    text: [
      "~~~#~~##",
      "~a...@a~",
      "~a...Ea~",
      "#aaA.aa#",
      "~baB.aC~",
      "#D...a.#",
      "#baaaD.~",
      "~#~~~~~~"
    ].join("\n")
  },
  {
    // Round 1, #6: 5 pushes, 5 stacks, 6 lava cells, 6 border walls, one red herring.
    objective: "all",
    text: [
      "~~~~~~~~",
      "#....#.~",
      "~....Da~",
      "~......~",
      "~B.C.@D~",
      "~a.a...~",
      "#a.caB.~",
      "~#~#~~##"
    ].join("\n")
  },
  {
    // Round 1, #7: 6 pushes, 6 stacks, 9 lava cells, 10 border walls, one red herring.
    objective: "all",
    text: [
      "#~###~#~",
      "~.b..a.#",
      "#.B..Da~",
      "~..Aa.a~",
      "~aaaD.B#",
      "~......#",
      "#...@Aa~",
      "~~~~~~~~"
    ].join("\n")
  },
  {
    // Round 1, #8: 6 pushes, 6 stacks, 10 lava cells, 9 border walls, one red herring.
    objective: "all",
    text: [
      "~~~~~~~~",
      "#@.Caaa#",
      "~B..#..~",
      "#a...Ea~",
      "~aDBaa.#",
      "#Ba....~",
      "~.c....#",
      "~~#~#~#~"
    ].join("\n")
  },
  {
    // Round 1, #9: 6 pushes, 6 stacks, 7 lava cells, 5 border walls, one red herring.
    objective: "all",
    text: [
      "~~~~#~~~",
      "~a.....~",
      "#a.....#",
      "~DaaB..~",
      "~@.E.a.~",
      "~.abBA.#",
      "~..A...~",
      "~~#~~~~~"
    ].join("\n")
  },
  {
    // Round 1, #10: 6 pushes, 5 stacks, 8 lava cells, 8 border walls, one red herring.
    objective: "all",
    text: [
      "#~~~#~#~",
      "~aaaE@.~",
      "~.....A~",
      "#..Ea.a~",
      "~....a.~",
      "#..A..D~",
      "#..a..a#",
      "~~~~#~~~"
    ].join("\n")
  },
  {
    // Round 1, #11: 6 pushes, 5 stacks, 6 lava cells, 7 border walls, one red herring.
    objective: "all",
    text: [
      "~#~~~#~~",
      "#.C.a.C~",
      "#...a..~",
      "~...E.#~",
      "~...@A.~",
      "~.Eaaab#",
      "#......~",
      "~#~~~~~~"
    ].join("\n")
  },
  {
    // Round 1, #12: 6 pushes, 6 stacks, 4 lava cells, 7 border walls, one red herring.
    objective: "all",
    text: [
      "~#~~~#~~",
      "#..D..a~",
      "#.....a~",
      "~.aaB.C~",
      "~CD...@~",
      "~......#",
      "#..B#..#",
      "~~~~~~~~"
    ].join("\n")
  }
];

if (typeof module !== "undefined" && module.exports) {
  module.exports = { PRESET_LEVELS, CURATED_LEVELS, DANCEFLOOR_CANDIDATES };
}
