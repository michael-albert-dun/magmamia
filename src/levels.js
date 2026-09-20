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
    text: "@Eba.#"
  }
];

if (typeof module !== "undefined" && module.exports) {
  module.exports = { PRESET_LEVELS };
}
