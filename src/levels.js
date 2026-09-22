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
  { optimum: 1, text: PRESET_LEVELS[0].text },
  {
    // An L-shaped corridor with the box stuck in the corner. In Sokoban that
    // would be a dead end; here the corner is next to infinite lava, so the box
    // can be pushed into it and lost (the intro to losing blocks).
    optimum: 1,
    text: [
      "~~~~~~",
      "~@..A~",
      "~###.~",
      "~###.~",
      "~###.*~",
      "~~~~~~"
    ].join("\n")
  },
  { optimum: 3, text: PRESET_LEVELS[1].text },
  {
    // seed 4: 12 pushes, 2 optimal solutions, slack 1.
    optimum: 12,
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
    optimum: 11,
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
    optimum: 9,
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
    optimum: 10,
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
    optimum: 12,
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
    optimum: 7,
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
    optimum: 8,
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
    optimum: 10,
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
    optimum: 11,
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
    optimum: 9,
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
    optimum: 13,
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
    optimum: 10,
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
    optimum: 10,
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
    optimum: 12,
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
    optimum: 15,
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
    optimum: 17,
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
  },
  {
    // seed 401 (group 1 search 2026-09-21): 11 pushes, 1 optimal solution, 34% of positions are dead ends; contains a hop.
    optimum: 11,
    text: [
      "~~~~~~~~",
      "~..bA..~",
      "~dEa*..b~",
      "~b...#.~",
      "~..ba..~",
      "~@..C..~",
      "~.a....~",
      "~~~~~~~~"
    ].join("\n")
  },
  {
    // seed 402 (group 1 search 2026-09-21): 9 pushes, 1 optimal solution, 54% of positions are dead ends.
    optimum: 9,
    text: [
      "~~~~~~~~",
      "~...a.a~",
      "~..a.bA~",
      "~...c.a~",
      "~..D.B.~",
      "~.....a~",
      "~@a..aa*~",
      "~~~~~~~~"
    ].join("\n")
  },
  {
    // seed 411 (group 1 search 2026-09-21): 11 pushes, 1 optimal solution, 55% of positions are dead ends; contains a hop.
    optimum: 11,
    text: [
      "~~~~~~~~",
      "~#.....~",
      "~.#.b..~",
      "~.aDCc.~",
      "~...A.#~",
      "~......~",
      "~..@.ca*~",
      "~~~~~~~~"
    ].join("\n")
  },
  {
    // seed 402 (group 1 search 2026-09-21): 17 pushes, 2 optimal solutions, 74% of positions are dead ends; contains a shuffle.
    optimum: 17,
    text: [
      "~~~~~~~~",
      "~.*c....~",
      "~ab.@..~",
      "~a..b..~",
      "~...c..~",
      "~....Ba~",
      "~.C.a..~",
      "~~~~~~~~"
    ].join("\n")
  },
  {
    // seed 402 (group 1 search 2026-09-21): 10 pushes, 2 optimal solutions, 80% of positions are dead ends; contains a hop.
    optimum: 10,
    text: [
      "~~~~~~~~",
      "~a...a*.~",
      "~.bb@..~",
      "~..aBac~",
      "~.C....~",
      "~#Aa...~",
      "~....#.~",
      "~~~~~~~~"
    ].join("\n")
  }
];

// "Clear the dancefloor" candidates for Michael to try and judge; his reasons for why
// one works or doesn't become the filters for the next round. Round 1 was built by
// plain reverse construction and is at index.html?set=dancefloor1. What he found:
// most were too loose, with many spare blocks (the tight, lava-heavy ones were the
// interesting ones), some stacks were obvious chores, and few needed any manoeuvring.
const DANCEFLOOR_ROUND_1 = [
  {
    // Round 1, #1: as generated, then the 5-block pile in the corner was removed (Michael:
    // "a fine introduction with the 5 block pile omitted"). 4 pushes, 3 stacks.
    objective: "all",
    optimum: 4,
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
    optimum: 5,
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
    optimum: 6,
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
    optimum: 5,
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
    optimum: 6,
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
    optimum: 5,
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
    optimum: 6,
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
    optimum: 6,
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
    optimum: 6,
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
    optimum: 6,
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
    optimum: 6,
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
    optimum: 6,
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
  },
  {
    // Hand-built from Michael's idea: the 3 pushed straight down overfills the walled-in
    // lower lava cell, and a block stranded there can never be cleared. Hand-built: overfill pocket.
    objective: "all",
    optimum: 8,
    text: [
      "########",
      "#...@..#",
      "~...C..#",
      "#...a..#",
      "#..#a#.#",
      "########"
    ].join("\n")
  }
];

// Round 2, at index.html?set=dancefloor2: built with those findings applied (a spare
// block or two at most, lots of lava, steps that carry blocks without clearing lava,
// walls across the intended route, mostly wall around the edge).
const DANCEFLOOR_ROUND_2 = [
  {
    // Round 2, #1: 6 pushes, surplus 2 blocks, lava depth 11, 6 stacks, one red herring.
    objective: "all",
    optimum: 6,
    text: [
      "###~####",
      "~..Daaa~",
      "~..A#A.#",
      "#daE.a.#",
      "#....@.#",
      "#....A.#",
      "#..aaA.#",
      "####~###"
    ].join("\n")
  },
  {
    // Round 2, #2: 6 pushes, surplus 2 blocks, lava depth 14, 5 stacks, one red herring.
    objective: "all",
    optimum: 6,
    text: [
      "########",
      "#...Cba~",
      "#..A@a.~",
      "~...Ea.#",
      "#...aC.#",
      "##..a..#",
      "#..Ddab#",
      "######~#"
    ].join("\n")
  },
  {
    // Round 2, #3: 6 pushes, surplus 1 block, lava depth 9, 5 stacks.
    objective: "all",
    optimum: 6,
    text: [
      "########",
      "~aB....~",
      "#......#",
      "#caC...#",
      "#dC.A..~",
      "#.A....~",
      "#.@....#",
      "###~####"
    ].join("\n")
  },
  {
    // Round 2, #4: 7 pushes, surplus 1 block, lava depth 17, 7 stacks, one red herring.
    objective: "all",
    optimum: 7,
    text: [
      "######~#",
      "~.....a#",
      "#..@Cac#",
      "~.EAC.a#",
      "#bbAa.D#",
      "##aAa..#",
      "~.c.a..#",
      "########"
    ].join("\n")
  },
  {
    // Round 2, #5: 8 pushes, surplus 1 block, lava depth 16, 7 stacks, one red herring.
    objective: "all",
    optimum: 8,
    text: [
      "~#######",
      "#@B.Aaa~",
      "#ACDaab#",
      "~Ba....#",
      "#dbD...#",
      "#aa....~",
      "#a.....#",
      "########"
    ].join("\n")
  },
  {
    // Round 2, #6: 8 pushes, surplus 2 blocks, lava depth 16, 5 stacks, 1 wall added across the route.
    objective: "all",
    optimum: 8,
    text: [
      "~##~~###",
      "~@.....~",
      "#E#A.D.#",
      "#aDaabb#",
      "#a...a.#",
      "~b.D.a.~",
      "#b...a.~",
      "########"
    ].join("\n")
  },
  {
    // Round 2, #7: 9 pushes, surplus 1 block, lava depth 13, 5 stacks, 1 wall added across the route.
    objective: "all",
    optimum: 9,
    text: [
      "##~#####",
      "#.Aa...#",
      "#......#",
      "#A....##",
      "#.#D...#",
      "#a.@Caa~",
      "#d.Eaac#",
      "########"
    ].join("\n")
  },
  {
    // Round 2, #8: 10 pushes, surplus 2 blocks, lava depth 10, 5 stacks, 2 walls added across the route.
    objective: "all",
    optimum: 10,
    text: [
      "####~#~#",
      "#c.....#",
      "#a.A.Bc#",
      "~D.@...#",
      "#..D#..#",
      "#..aaA##",
      "#..a...~",
      "###~#~#~"
    ].join("\n")
  },
  {
    // Round 2, #9: 10 pushes, surplus 2 blocks, lava depth 11, 4 stacks, 1 wall added across the route, one red herring.
    objective: "all",
    optimum: 10,
    text: [
      "#~#~####",
      "~..a.#b#",
      "#....Da#",
      "#daD.AC#",
      "#...#.@#",
      "#.....##",
      "#......#",
      "########"
    ].join("\n")
  },
  {
    // Round 2, #10: 11 pushes, surplus 1 block, lava depth 13, 5 stacks, 2 walls added across the route.
    objective: "all",
    optimum: 11,
    text: [
      "~~##~~~#",
      "#.....a#",
      "##AC.#a#",
      "#.Ab..a#",
      "#..#..a#",
      "#..a.DE~",
      "#..b.d@#",
      "####~#~#"
    ].join("\n")
  },
  {
    // Round 2, #11: 12 pushes, surplus 1 block, lava depth 8, 5 stacks, 1 wall added across the route, one red herring.
    objective: "all",
    optimum: 12,
    text: [
      "~##~####",
      "##.....#",
      "#caaB.a#",
      "#a.#@A.#",
      "#a..#..#",
      "#.DA#A.#",
      "#......~",
      "~~~##~##"
    ].join("\n")
  },
  {
    // Round 2, #12: 12 pushes, surplus 1 block, lava depth 9, 5 stacks, 2 walls added across the route, one red herring.
    objective: "all",
    optimum: 12,
    text: [
      "##~#~~~#",
      "#..#.a.~",
      "#..B..#~",
      "#..a#A.#",
      "#..a.A.#",
      "#..aDB.#",
      "#..ad@.#",
      "#####~~#"
    ].join("\n")
  },
  {
    // Round 2, #13: 13 pushes, surplus 1 block, lava depth 8, 4 stacks, 2 walls added across the route, one red herring.
    objective: "all",
    optimum: 13,
    text: [
      "~~####~#",
      "#...aa##",
      "##AAa..#",
      "~a.B@.##",
      "#......#",
      "#...#..#",
      "~aaaaE.#",
      "######~#"
    ].join("\n")
  },
  {
    // Round 2, #14: 14 pushes, surplus 2 blocks, lava depth 9, 7 stacks, 2 walls added across the route.
    objective: "all",
    optimum: 14,
    text: [
      "########",
      "#...BBb~",
      "#@.AA..~",
      "#Ba.Aab#",
      "#aa.#..#",
      "#aB....#",
      "#.##...#",
      "##~#####"
    ].join("\n")
  }
];

// Round 3, at index.html?set=dancefloor: made with the mode thought of as casual, so
// mostly short levels (5 to 12 pushes) where tidying up is the experience and the
// optimum is a par to strive for. No stack with a single available push that can be
// pushed from the start (forcedPushStacks), and at most two with one at all.
const DANCEFLOOR_CANDIDATES = [
  {
    // Round 3, #1: 5 pushes, surplus 1 block, lava depth 12, 4 stacks, one red herring, events: edge pile stack.
    objective: "all",
    optimum: 5,
    text: [
      "##~#~###",
      "#......#",
      "#..Daac#",
      "#.A....#",
      "~.....@#",
      "#.....C~",
      "~aaaaEc#",
      "########"
    ].join("\n")
  },
  {
    // Round 3, #2: 5 pushes, surplus 1 block, lava depth 12, 4 stacks, one red herring, events: edge pile stack.
    objective: "all",
    optimum: 5,
    text: [
      "#####~##",
      "#..A.bc#",
      "~...Ca.#",
      "#...@a.#",
      "#...ED.~",
      "#...a..#",
      "#...d.##",
      "########"
    ].join("\n")
  },
  {
    // Round 3, #3: 6 pushes, surplus 1 block, lava depth 9, 4 stacks, events: pile.
    objective: "all",
    optimum: 6,
    text: [
      "####~#~#",
      "#......#",
      "#......#",
      "#daE...#",
      "#...a..#",
      "#.A.@B.#",
      "#...Ac.#",
      "##~#~#~#"
    ].join("\n")
  },
  {
    // Round 3, #4: 6 pushes, surplus 2 blocks, lava depth 16, 6 stacks, events: edge pile stack.
    objective: "all",
    optimum: 6,
    text: [
      "~#######",
      "#..b#.##",
      "~..ab.c~",
      "#.ECa.a#",
      "~.a.a.C#",
      "~.a.D.A~",
      "#.cB@..#",
      "###~####"
    ].join("\n")
  },
  {
    // Round 3, #5: 7 pushes, surplus 1 block, lava depth 10, 5 stacks, events: edge pile stack.
    objective: "all",
    optimum: 7,
    text: [
      "########",
      "#......#",
      "#.@AA#.#",
      "#.Da...#",
      "#.aa...#",
      "#cbaDA.#",
      "~.a....#",
      "##~#####"
    ].join("\n")
  },
  {
    // Round 3, #6: 7 pushes, surplus 2 blocks, lava depth 14, 5 stacks, one red herring, events: pile.
    objective: "all",
    optimum: 7,
    text: [
      "########",
      "#.da...#",
      "#.Da..D#",
      "~.@a..a#",
      "#..aA.b~",
      "#..DA.a~",
      "#....aa~",
      "#~#~####"
    ].join("\n")
  },
  {
    // Round 3, #7: 8 pushes, surplus 1 block, lava depth 10, 5 stacks, one red herring, events: edge hop pile stack.
    objective: "all",
    optimum: 8,
    text: [
      "~####~##",
      "#......#",
      "#babaE.#",
      "#@AA...#",
      "##.A...#",
      "~....#.#",
      "#...Caa~",
      "########"
    ].join("\n")
  },
  {
    // Round 3, #8: 8 pushes, surplus 1 block, lava depth 12, 4 stacks, events: edge pile stack.
    objective: "all",
    optimum: 8,
    text: [
      "######~#",
      "#....ab#",
      "#a.#C..#",
      "#a..@..~",
      "#.BC...~",
      "##.a...#",
      "#cabE..#",
      "##~~~###"
    ].join("\n")
  },
  {
    // Round 3, #9: 9 pushes, surplus 1 block, lava depth 10, 4 stacks, events: edge pile shuffle stack.
    objective: "all",
    optimum: 9,
    text: [
      "~##~#~##",
      "#....a.#",
      "##@Eabc#",
      "~.A..a.#",
      "#bA#.D.#",
      "#......#",
      "#......#",
      "##~~####"
    ].join("\n")
  },
  {
    // Round 3, #10: 10 pushes, surplus 1 block, lava depth 8, 5 stacks, events: edge pile stack.
    objective: "all",
    optimum: 10,
    text: [
      "~#######",
      "#..#...#",
      "##.A...#",
      "#.aA...~",
      "#.#.D..~",
      "~...a.A#",
      "#.Bad.@#",
      "##~#####"
    ].join("\n")
  },
  {
    // Round 3, #11: 10 pushes, surplus 1 block, lava depth 9, 5 stacks, events: edge pile stack.
    objective: "all",
    optimum: 10,
    text: [
      "########",
      "#...@#.#",
      "#...AA.#",
      "#....Cd#",
      "~A#.D..~",
      "#...a..#",
      "#...d..#",
      "~~######"
    ].join("\n")
  },
  {
    // Round 3, #12: 11 pushes, surplus 1 block, lava depth 8, 4 stacks, events: edge pile shuffle stack.
    objective: "all",
    optimum: 11,
    text: [
      "#~######",
      "#..Daab#",
      "~aB@a..#",
      "#..A.#.~",
      "#......~",
      "#...#Bb#",
      "#......#",
      "#~###~##"
    ].join("\n")
  },
  {
    // Round 3, #13: 12 pushes, surplus 1 block, lava depth 13, 6 stacks, one red herring, events: edge pile shuffle stack.
    objective: "all",
    optimum: 12,
    text: [
      "~###~###",
      "~..Aaa.#",
      "~aaAC@##",
      "~#.#.A.#",
      "~aaaC.##",
      "#......#",
      "#caaE..#",
      "#~###~~#"
    ].join("\n")
  },
  {
    // Round 3, #14: 12 pushes, surplus 1 block, lava depth 14, 5 stacks, events: edge pile shuffle stack.
    objective: "all",
    optimum: 12,
    text: [
      "##~###~~",
      "#.Eaaaa~",
      "#bB@a..#",
      "#...A..#",
      "~.E.##.~",
      "#.a.B..#",
      "#.d..aa#",
      "#~######"
    ].join("\n")
  }
];

// "There will be mud", at index.html?set=mud: "Seize the crown" levels built around
// waterlogged blocks (K-T; see README). Each is essential: replacing every K-T with
// the matching dry A-J letter (same height, no wetness) makes it unsolvable, checked
// by tests/levels.test.js. Kept mostly dry: a level's mud is one small stack, put to
// work by merging it with one or two ordinary dry ones (README's own worked case that
// touching waterlogs a dry stack, and its reverse: order doesn't matter, only contact
// does), the same way the curated levels lean on more than one or two stacks rather
// than a single trick repeated.
//
// Round 1, hand-built to demonstrate the mechanic plainly, at index.html?set=mud1.
const MUD_ROUND_1 = [
  {
    // #1: a shallow dip a dry block clears in the ordinary way, then a lone depth-4
    // cell with nothing left to throw at it -- dry would only shallow it by one; wet
    // fills it outright, the smallest possible demonstration of why that matters.
    optimum: 2,
    text: [
      "#########",
      "#@Aa.Kd.*#",
      "#########"
    ].join("\n")
  },
  {
    // #2: past a dry-cleared dip, the wet block (height 1) is one short of the
    // width-2 trench ahead. Pushed into the dry stack next to it, the merge makes a
    // wet height-2 stack that solidifies both trench cells (each depth 3) in the one
    // push that crosses it.
    optimum: 3,
    text: [
      "###########",
      "#@Aa.KAcc.*#",
      "###########"
    ].join("\n")
  },
  {
    // #3: the same idea with a taller donor (height 2), merging to a wet height-3
    // stack that bridges a width-3 trench (each cell depth 4).
    optimum: 3,
    text: [
      "############",
      "#@Aa.KBddd.*#",
      "############"
    ].join("\n")
  },
  {
    // #4: a corridor with a turn, so it isn't just "push right" repeated -- a dry
    // block clears a shallow dip on the way to the corner, then round it, mud merges
    // with a dry height-2 stack to bridge a 3-deep vertical trench.
    optimum: 3,
    text: [
      "#######",
      "#@Aa..#",
      "####.##",
      "####.##",
      "####K##",
      "####B##",
      "####d##",
      "####d##",
      "####d##",
      "####.*##",
      "#######"
    ].join("\n")
  }
];


// Round 2, found with a mud-aware version of the same hill-climbing search that found the
// curated levels (experiments/mud-candidates.js): mutation can toggle a stack wet, and every
// candidate is checked essential (with every K-T turned back to A-J, it must be unsolvable)
// on the spot, not just filtered at the end. At index.html?set=mud.
const MUD_ROUND_2 = [
  {
    // Round 2, #1: 5 pushes, 3 dry stacks, 1 wet, slack 0, events: soak stack.
    optimum: 5,
    text: [
      "#~##~~~#",
      "~aa*..b#~",
      "#.bAcda~",
      "~.aA.Ab#",
      "~.#a#K.~",
      "#c..#.@~",
      "#b#ac..~",
      "~######~"
    ].join("\n")
  },
  {
    // Round 2, #2: 5 pushes, 2 dry stacks, 1 wet, slack 0, events: soak stack.
    optimum: 5,
    text: [
      "##~~##~~",
      "##bb*a#a#",
      "#...b.#~",
      "#@a..#.~",
      "~A.aa.##",
      "~aKA.bb#",
      "##..#..~",
      "~~#~~~~~"
    ].join("\n")
  },
  {
    // Round 2, #3: 5 pushes, 2 dry stacks, 2 wet, slack 0, events: cover edge stack.
    optimum: 5,
    text: [
      "~####~#~",
      "#b..aa.#",
      "~c.a...#",
      "#bAbaL.~",
      "#aAbda.#",
      "~bLb##@#",
      "#..*aa#b~",
      "##~~~###"
    ].join("\n")
  },
  {
    // Round 2, #4: 6 pushes, 2 dry stacks, 1 wet, slack 0, events: edge stack.
    optimum: 6,
    text: [
      "#~#~#~##",
      "#c.b.b.#",
      "#A*###.b#",
      "~.c.Na#~",
      "~#a..A.~",
      "#.ab...~",
      "~i#b#@#~",
      "###~~##~"
    ].join("\n")
  },
  {
    // Round 2, #5: 8 pushes, 3 dry stacks, 2 wet, slack 2, events: edge pile stack.
    optimum: 8,
    text: [
      "#~##~#~#",
      "#aA.a#.#",
      "#.NA@aa~",
      "#..aaaa#",
      "#.ccAN.~",
      "#a..bb.*#",
      "#.a##.b#",
      "~~##~##~"
    ].join("\n")
  },
  {
    // Round 2, #6: 8 pushes, 3 dry stacks, 3 wet, slack 4, events: edge pile stack.
    optimum: 8,
    text: [
      "~##~~#~#",
      "#.bNca##",
      "#aAc.aa~",
      "#AB#Ma##",
      "~.K.@b##",
      "#b#.baa#",
      "~..aa.*.#",
      "#~~~~~~~"
    ].join("\n")
  },
  {
    // Round 2, #7: 10 pushes, 4 dry stacks, 2 wet, slack 0, events: edge stack.
    optimum: 10,
    text: [
      "~~#~~#~#",
      "#..BAaa~",
      "#cbbb*L.#",
      "#O.bbba#",
      "~Ac....~",
      "~.A.@.i#",
      "#baaaca#",
      "~~~#~##~"
    ].join("\n")
  },
  {
    // Round 2, #8: 11 pushes, 5 dry stacks, 2 wet, slack 0, events: edge soak stack.
    optimum: 11,
    text: [
      "~~~#~~~~",
      "#cb.a.b~",
      "#dLbAaa~",
      "#L.a.B.~",
      "~Aa*da..~",
      "#.a@aa#~",
      "~.AA#..#",
      "~~~~~##~"
    ].join("\n")
  },
  {
    // Round 2, #9: 11 pushes, 4 dry stacks, 1 wet, slack 1, events: shuffle soak stack.
    optimum: 11,
    text: [
      "##~#~~##",
      "#..c.b#~",
      "~a.aA.b#",
      "##.Ka.A#",
      "~..BbA@~",
      "~b.b.#.~",
      "~#bbb*ab~",
      "~~###~~~"
    ].join("\n")
  },
  {
    // Round 2, #10: 11 pushes, 2 dry stacks, 2 wet, slack 0, events: cover edge pile soak stack.
    optimum: 11,
    text: [
      "~~#~####",
      "~a..a.N~",
      "~..N.aA#",
      "#.ac.#c#",
      "#.b#.bb~",
      "~Acg#..~",
      "~@.b..c*#",
      "#~##~#~#"
    ].join("\n")
  },
  {
    // Round 2, #11: 11 pushes, 3 dry stacks, 2 wet, slack 3, events: cover edge pile.
    optimum: 11,
    text: [
      "##~~~~#~",
      "~b.ac.a~",
      "#a.#bab#",
      "~.c.b.a~",
      "~#ba.C.#",
      "~.N@##A~",
      "#.g*AK..~",
      "~~#~#~#~"
    ].join("\n")
  },
  {
    // Round 2, #12: 12 pushes, 5 dry stacks, 2 wet, slack 0, events: edge soak stack.
    optimum: 12,
    text: [
      "~~###~#~",
      "~cAac..#",
      "#MKA#.a~",
      "#A.cAcd~",
      "~.aB@c##",
      "~ac...b*~",
      "#cb#a..#",
      "#~~~###~"
    ].join("\n")
  },
  {
    // Round 2, #13: 12 pushes, 5 dry stacks, 2 wet, slack 1, events: edge hop stack.
    optimum: 12,
    text: [
      "##~##~~~",
      "~#@##b.#",
      "~AAa.ca#",
      "#Ab..bb~",
      "~N##cda~",
      "~.MfBac*#",
      "~.B.b.b#",
      "~~##~#~~"
    ].join("\n")
  },
  {
    // Round 2, #14: 14 pushes, 5 dry stacks, 1 wet, slack 1, events: pile stack.
    optimum: 14,
    text: [
      "###~~###",
      "#.#..bc~",
      "~.#.Mba~",
      "#ab*#.a##",
      "~adAAD##",
      "#b@Baa.~",
      "#iaA.a.#",
      "#~~#~###"
    ].join("\n")
  }
];

if (typeof module !== "undefined" && module.exports) {
  module.exports = { PRESET_LEVELS, CURATED_LEVELS, DANCEFLOOR_ROUND_1, DANCEFLOOR_ROUND_2, DANCEFLOOR_CANDIDATES, MUD_ROUND_1, MUD_ROUND_2 };
}
