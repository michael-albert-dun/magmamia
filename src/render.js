// Board drawing shared by the player-facing game (play.js) and the test bench
// (bench.js). Needs no state of its own: give it an SVG element and a state.
const SVG_NS = "http://www.w3.org/2000/svg";
const CELL = 48;
const RIM = 24; // Width of the infinite-lava rim drawn around the board.
const MIN_CELL_PX = 28; // Below this the board scrolls instead of shrinking.
const CROWN_POINTS = "-12,8 -12,-6 -6,0 0,-9 6,0 12,-6 12,8";

function svgElement(name, attributes, parent) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  parent.append(element);
  return element;
}

// Draw the whole board as SVG into `svg`, replacing whatever was there.
function drawBoard(svg, s) {
  const width = s.cols * CELL + 2 * RIM;
  const height = s.rows * CELL + 2 * RIM;
  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("aria-label", `Game board, ${s.rows} rows by ${s.cols} columns`);
  svg.style.maxWidth = `${width}px`;
  svg.style.minWidth = `${Math.min(width, s.cols * MIN_CELL_PX + 2 * RIM)}px`;

  svgElement("rect", { class: "rim", x: 0, y: 0, width, height }, svg);
  for (let y = 0; y < s.rows; y += 1) {
    for (let x = 0; x < s.cols; x += 1) {
      renderCell(svg, s, y * s.cols + x, RIM + x * CELL, RIM + y * CELL);
    }
  }
}

function renderCell(svg, s, index, left, top) {
  const centerX = left + CELL / 2;
  const centerY = top + CELL / 2;
  const value = s.cells[index];
  const isGoal = s.goals[index] === 1;
  const box = { x: left, y: top, width: CELL, height: CELL };

  if (s.walls[index]) {
    svgElement("rect", { class: "cell-wall", ...box }, svg);
    return;
  }
  if (value < 0) {
    svgElement("rect", { class: "cell-lava", ...box }, svg);
    svgElement("text", { class: "cell-number on-lava", x: centerX, y: centerY }, svg).textContent = String(-value);
  } else {
    svgElement("rect", { class: isGoal ? "cell-floor is-goal" : "cell-floor", ...box }, svg);
    if (value > 0) {
      const inset = 7;
      svgElement("rect", { class: "stack", x: left + inset, y: top + inset, width: CELL - 2 * inset, height: CELL - 2 * inset, rx: 5 }, svg);
      svgElement("text", { class: "cell-number on-stack", x: centerX, y: centerY }, svg).textContent = String(value);
    }
  }
  if (index === s.player) {
    svgElement("circle", { class: "player", cx: centerX, cy: centerY, r: 15 }, svg);
  }
  // The crown goes last so it shows on top of lava, stacks and the player. With
  // a number in the middle it shrinks and moves up to sit above it.
  if (isGoal) {
    const hasNumber = value !== 0;
    const transform = hasNumber
      ? `translate(${centerX} ${centerY - 14}) scale(0.55)`
      : `translate(${centerX} ${centerY}) scale(1)`;
    svgElement("polygon", { class: "crown", points: CROWN_POINTS, transform }, svg);
  }
}
