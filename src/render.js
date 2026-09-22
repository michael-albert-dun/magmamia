// Board drawing shared by the player-facing game (play.js) and the test bench
// (bench.js). Needs no state of its own: give it an SVG element and a state.
const SVG_NS = "http://www.w3.org/2000/svg";
const CELL = 48;
const MIN_CELL_PX = 28; // Below this the board scrolls instead of shrinking.
const CROWN_POINTS = "-12,8 -12,-6 -6,0 0,-9 6,0 12,-6 12,8";

function svgElement(name, attributes, parent) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  parent.append(element);
  return element;
}

// Draw the whole board as SVG into `svg`, replacing whatever was there. The
// board is exactly the grid: its border cells are ordinary walls and infinite
// lava, drawn like any other cell.
// options.chips is an optional list of { x, y, count, lost } push-preview tags
// (from previewPushes in engine.js) drawn over the board. A tag for a tile
// outside the grid (only possible on a board without a closed border) falls
// outside the drawing and isn't visible.
function drawBoard(svg, s, options = {}) {
  const width = s.cols * CELL;
  const height = s.rows * CELL;
  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("aria-label", `Game board, ${s.rows} rows by ${s.cols} columns`);
  svg.style.maxWidth = `${width}px`;
  svg.style.minWidth = `${Math.min(width, s.cols * MIN_CELL_PX)}px`;

  for (let y = 0; y < s.rows; y += 1) {
    for (let x = 0; x < s.cols; x += 1) {
      renderCell(svg, s, y * s.cols + x, x * CELL, y * CELL);
    }
  }
  drawChips(svg, options.chips || []);
}

// Small "+n" tags in a cell's bottom-right corner, so they leave the cell's own
// number, the crown and the player visible. Two tags on one cell sit side by side.
function drawChips(svg, chips) {
  const perCell = new Map();
  for (const chip of chips) {
    const key = `${chip.x},${chip.y}`;
    const slot = perCell.get(key) || 0;
    perCell.set(key, slot + 1);
    const left = chip.x * CELL + CELL - 32 - slot * 30;
    const top = chip.y * CELL + CELL - 21;
    const group = svgElement("g", { class: chip.lost ? "preview-chip is-lost" : "preview-chip" }, svg);
    svgElement("rect", { x: left, y: top, width: 28, height: 17, rx: 8.5 }, group);
    svgElement("text", { x: left + 14, y: top + 8.5 }, group).textContent = `+${chip.count}`;
    const title = chip.lost
      ? `${chip.count} ${chip.count === 1 ? "block" : "blocks"} would fall into the infinite lava and be lost`
      : `${chip.count} ${chip.count === 1 ? "block" : "blocks"} would land here`;
    svgElement("title", {}, group).textContent = title;
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
  if (s.abyss && s.abyss[index]) {
    // Infinitely deep lava: like lava, marked with ∞ where real lava shows its depth.
    svgElement("rect", { class: "cell-lava", ...box }, svg);
    svgElement("text", { class: "cell-number on-abyss", x: centerX, y: centerY }, svg).textContent = "∞";
    return;
  }
  if (value < 0) {
    svgElement("rect", { class: "cell-lava", ...box }, svg);
    svgElement("text", { class: "cell-number on-lava", x: centerX, y: centerY }, svg).textContent = String(-value);
  } else {
    svgElement("rect", { class: isGoal ? "cell-floor is-goal" : "cell-floor", ...box }, svg);
    if (value > 0) {
      const wet = Boolean(s.wet && s.wet[index]);
      const inset = 7;
      svgElement("rect", { class: wet ? "stack is-wet" : "stack", x: left + inset, y: top + inset, width: CELL - 2 * inset, height: CELL - 2 * inset, rx: 5 }, svg);
      svgElement("text", { class: wet ? "cell-number on-stack on-wet" : "cell-number on-stack", x: centerX, y: centerY }, svg).textContent = String(value);
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
