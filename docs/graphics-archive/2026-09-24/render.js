// Board drawing shared by the player-facing game (play.js) and the test bench
// (bench.js). Needs no state of its own: give it an SVG element and a state.
const SVG_NS = "http://www.w3.org/2000/svg";
const CELL = 48;
const MIN_CELL_PX = 28; // Below this the board scrolls instead of shrinking.
const CROWN_POINTS = "-12,8 -12,-6 -6,0 0,-9 6,0 12,-6 12,8";

// The player: a small blocky, early-RPG-inspired sprite -- a traveller rather
// than a particular person, so there's no hairstyle to read as one gender or
// another, just a plain cap over a bare face (see the --player-* tokens in
// styles.css for the colours). Built from a coarse 8-column, 11-row pixel
// grid at PLAYER_PX per pixel; each entry below is one contiguous run,
// [class, row, startColumn, columnSpan], rather than one rect per pixel,
// since most rows are a single solid or near-solid band.
const PLAYER_PX = 4;
const PLAYER_SPRITE = [
  ["player-cap", 0, 3, 2],   // Cap peak.
  ["player-cap", 1, 1, 6],   // Cap brim.
  ["player-skin", 2, 1, 6],  // Forehead.
  ["player-skin", 3, 1, 1], ["player-eye", 3, 2, 1], ["player-skin", 3, 3, 2], ["player-eye", 3, 5, 1], ["player-skin", 3, 6, 1],
  ["player-skin", 4, 2, 4],  // Chin, tapering the face inward.
  ["player-trim", 5, 2, 4],  // Collar.
  ["player-robe", 6, 1, 6],  // Shoulders, widened either side of the body by the arms.
  ["player-skin", 7, 1, 1], ["player-robe", 7, 2, 4], ["player-skin", 7, 6, 1], // Hands, at the sleeves' ends.
  ["player-robe", 8, 2, 4],
  ["player-robe", 9, 2, 4],
  ["player-trim", 10, 2, 1], ["player-trim", 10, 5, 1] // Feet, apart, peeking out from the hem.
];

function drawPlayerSprite(group, centerX, centerY) {
  const ox = centerX - 4 * PLAYER_PX;
  const oy = centerY - 5.5 * PLAYER_PX;
  for (const [cls, row, col, span] of PLAYER_SPRITE) {
    svgElement("rect", { class: cls, x: ox + col * PLAYER_PX, y: oy + row * PLAYER_PX, width: span * PLAYER_PX, height: PLAYER_PX }, group);
  }
}

function svgElement(name, attributes, parent) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  parent.append(element);
  return element;
}

// One curved arm of the abyss's swirl (see renderCell): starts at radius `minR`
// from the centre and spirals out to `maxR`, sweeping through `sweepTurns` of a
// full rotation as it goes (1/3 makes a short, comma-shaped arm rather than a
// full spiral coil).
function abyssArmPoints(cx, cy, startAngle, minR, maxR, sweepTurns, steps = 12) {
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const angle = startAngle + t * sweepTurns * Math.PI * 2;
    const r = minR + t * (maxR - minR);
    points.push(`${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`);
  }
  return points.join(" ");
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
    // A floor rect sits underneath, hidden until "solved" fades the wall out
    // (see .board.is-solved in styles.css) -- otherwise fading it would just
    // reveal the page behind the board instead of melting into floor.
    svgElement("rect", { class: "cell-floor", ...box }, svg);
    svgElement("rect", { class: "cell-wall", ...box }, svg);
    return;
  }
  if (s.abyss && s.abyss[index]) {
    // The abyss: infinitely deep lava. Drawn as a dark, void-like square with a
    // black-hole core and a few short white arms radiating out of it, not a shade
    // of ordinary lava -- a potion won't save a step into it, so it needs to read
    // as a different, absolute kind of hazard.
    svgElement("rect", { class: "cell-floor", ...box }, svg); // Same reason as the wall above.
    const group = svgElement("g", {}, svg);
    svgElement("rect", { class: "cell-abyss", ...box }, group);
    const arms = 5;
    for (let a = 0; a < arms; a += 1) {
      const startAngle = (a / arms) * Math.PI * 2;
      svgElement("polyline", { class: "abyss-arm", points: abyssArmPoints(centerX, centerY, startAngle, 7, 17, 1 / 3) }, group);
    }
    // Drawn on top of the arms' inner ends, so a bigger core hides their point of
    // convergence -- a small core left them meeting in a visible star shape.
    svgElement("circle", { class: "abyss-core", cx: centerX, cy: centerY, r: 7 }, group);
    svgElement("title", {}, group).textContent = "The abyss: infinite lava. Always fatal to step on, even with a potion.";
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
    } else if (s.potions && s.potions[index]) {
      // A small flask: a narrow neck over a rounded body, distinct in shape (not
      // just colour) from the stacks and lava it sits alongside.
      const group = svgElement("g", { class: "potion" }, svg);
      svgElement("rect", { x: centerX - 3, y: centerY - 15, width: 6, height: 8, rx: 1.5 }, group);
      svgElement("rect", { x: centerX - 9, y: centerY - 8, width: 18, height: 17, rx: 6 }, group);
      svgElement("title", {}, group).textContent = "A potion: one safe step onto lava, then it's used up (doesn't work on the abyss)";
    }
  }
  if (index === s.player) {
    const group = svgElement("g", { class: "player" }, svg);
    drawPlayerSprite(group, centerX, centerY);
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
