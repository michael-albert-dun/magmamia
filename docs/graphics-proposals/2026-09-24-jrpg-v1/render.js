// PROPOSAL (2026-09-24): pushing the board's own tiles towards the same
// early-JRPG, blocky-pixel look the player sprite already has -- crisp rect
// edges, a limited flat palette, and a simple 3-tone "raised block" bevel
// (base fill, a highlight strip top/left, a shadow strip bottom/right) as
// one shared visual language across floor, walls and stacks. Lava and the
// abyss use the opposite treatment, a "recessed" frame, since they're holes
// rather than blocks. Not wired into the live game -- see this folder's
// index.html for a static sample board, and docs/graphics-archive/2026-09-24/
// for the look this replaces.
//
// Structurally a copy of src/render.js (same function names/shapes, so it's
// a drop-in candidate later): the diffs are all inside renderCell and the
// small drawing helpers above it.
const SVG_NS = "http://www.w3.org/2000/svg";
const CELL = 48;
const MIN_CELL_PX = 28; // Below this the board scrolls instead of shrinking.

// Two pixel grid sizes: TILE_PX for whole-cell textures (floor/wall/lava/
// abyss -- a 6x6 subgrid per 48px cell, roughly NES-tile-coarse), BEVEL for
// the highlight/shadow border thickness on a "raised" block (floor/wall/
// stack). PLAYER_PX is finer (an 8x11 grid), since the player sprite needs
// more shape resolution than a flat tile does -- unchanged from the live
// player art.
const TILE_PX = 8;
const BEVEL = 6;
const PLAYER_PX = 4;

const PLAYER_SPRITE = [
  ["player-cap", 0, 3, 2],
  ["player-cap", 1, 1, 6],
  ["player-skin", 2, 1, 6],
  ["player-skin", 3, 1, 1], ["player-eye", 3, 2, 1], ["player-skin", 3, 3, 2], ["player-eye", 3, 5, 1], ["player-skin", 3, 6, 1],
  ["player-skin", 4, 2, 4],
  ["player-trim", 5, 2, 4],
  ["player-robe", 6, 1, 6],
  ["player-skin", 7, 1, 1], ["player-robe", 7, 2, 4], ["player-skin", 7, 6, 1],
  ["player-robe", 8, 2, 4],
  ["player-robe", 9, 2, 4],
  ["player-trim", 10, 2, 1], ["player-trim", 10, 5, 1]
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

// A "raised block" bevel: a highlight strip along the top and left edges, a
// shadow strip along the bottom and right, both `BEVEL` px thick, on top of
// whatever base fill the caller already drew. Reused for floor, walls and
// stacks so they read as one consistent material logic (lit from the
// top-left) rather than each having its own ad hoc shading.
function pixelBevel(svg, box, highlightClass, shadowClass) {
  svgElement("rect", { class: highlightClass, x: box.x, y: box.y, width: box.width, height: BEVEL }, svg);
  svgElement("rect", { class: highlightClass, x: box.x, y: box.y, width: BEVEL, height: box.height }, svg);
  svgElement("rect", { class: shadowClass, x: box.x, y: box.y + box.height - BEVEL, width: box.width, height: BEVEL }, svg);
  svgElement("rect", { class: shadowClass, x: box.x + box.width - BEVEL, y: box.y, width: BEVEL, height: box.height }, svg);
}

// The opposite treatment for a "hole" (lava, the abyss): a single-tone frame
// set into the tile, rather than a lit/shadowed block.
function pixelFrame(svg, box, cls) {
  svgElement("rect", { class: cls, x: box.x, y: box.y, width: box.width, height: BEVEL }, svg);
  svgElement("rect", { class: cls, x: box.x, y: box.y + box.height - BEVEL, width: box.width, height: BEVEL }, svg);
  svgElement("rect", { class: cls, x: box.x, y: box.y, width: BEVEL, height: box.height }, svg);
  svgElement("rect", { class: cls, x: box.x + box.width - BEVEL, y: box.y, width: BEVEL, height: box.height }, svg);
}

// Two "hot spot" specks per lava tile, deterministic from the cell's own
// index (not random) so they don't flicker or shift between renders, but
// still vary tile to tile for an organic, bubbling look rather than a
// uniform flat red. Kept off the tile's very edge (units 1-4 of the 6-wide
// subgrid) so they don't collide with the frame.
function lavaSpecks(svg, box, index) {
  const positions = [
    [1 + ((index * 3) % 4), 1 + ((index * 5) % 4)],
    [1 + ((index * 7 + 2) % 4), 1 + ((index * 11 + 1) % 4)]
  ];
  for (const [col, row] of positions) {
    svgElement("rect", { class: "cell-lava-hot", x: box.x + col * TILE_PX, y: box.y + row * TILE_PX, width: TILE_PX, height: TILE_PX }, svg);
  }
}

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

// A pixel-block crown: a darker band (the rim) under three lighter blocks
// (the points, the centre one taller), plus a small jewel -- the same shape
// budget as the old smooth polygon, just stepped instead of pointed.
function drawCrown(svg, centerX, centerY, hasNumber) {
  const transform = hasNumber
    ? `translate(${centerX} ${centerY - 14}) scale(0.55)`
    : `translate(${centerX} ${centerY}) scale(1)`;
  const group = svgElement("g", { class: "crown", transform }, svg);
  svgElement("rect", { class: "crown-band", x: -12, y: 2, width: 24, height: 6 }, group);
  svgElement("rect", { class: "crown-point", x: -11, y: -4, width: 7, height: 6 }, group);
  svgElement("rect", { class: "crown-point", x: -4, y: -9, width: 8, height: 11 }, group);
  svgElement("rect", { class: "crown-point", x: 4, y: -4, width: 7, height: 6 }, group);
  svgElement("rect", { class: "crown-jewel", x: -2, y: 3, width: 4, height: 4 }, group);
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
    pixelBevel(svg, box, "cell-wall-highlight", "cell-wall-shadow");
    return;
  }
  if (s.abyss && s.abyss[index]) {
    svgElement("rect", { class: "cell-floor", ...box }, svg); // Same reason as the wall above.
    const group = svgElement("g", {}, svg);
    svgElement("rect", { class: "cell-abyss", ...box }, group);
    pixelFrame(group, box, "cell-abyss-frame");
    // A 2x2 core, and four 1x1 arms in a pinwheel, each deliberately poking
    // one unit past the frame on a different edge -- reads as the spiral
    // bursting past the tile's own rim, not a rendering seam.
    svgElement("rect", { class: "abyss-core", x: box.x + 2 * TILE_PX, y: box.y + 2 * TILE_PX, width: 2 * TILE_PX, height: 2 * TILE_PX }, group);
    const arms = [[3, 0], [5, 3], [2, 5], [0, 2]];
    for (const [col, row] of arms) {
      svgElement("rect", { class: "abyss-arm", x: box.x + col * TILE_PX, y: box.y + row * TILE_PX, width: TILE_PX, height: TILE_PX }, group);
    }
    svgElement("title", {}, group).textContent = "The abyss: infinite lava. Always fatal to step on, even with a potion.";
    return;
  }
  if (value < 0) {
    svgElement("rect", { class: "cell-lava", ...box }, svg);
    pixelFrame(svg, box, "cell-lava-frame");
    lavaSpecks(svg, box, index);
    svgElement("text", { class: "cell-number on-lava", x: centerX, y: centerY }, svg).textContent = String(-value);
  } else {
    const goalClass = isGoal ? " is-goal" : "";
    svgElement("rect", { class: `cell-floor${goalClass}`, ...box }, svg);
    pixelBevel(svg, box, `cell-floor-highlight${goalClass}`, `cell-floor-shadow${goalClass}`);
    if (value > 0) {
      const wet = Boolean(s.wet && s.wet[index]);
      const wetClass = wet ? " is-wet" : "";
      const inset = 7;
      const stackBox = { x: left + inset, y: top + inset, width: CELL - 2 * inset, height: CELL - 2 * inset };
      svgElement("rect", { class: `stack${wetClass}`, ...stackBox }, svg);
      pixelBevel(svg, stackBox, `stack-highlight${wetClass}`, `stack-shadow${wetClass}`);
      svgElement("text", { class: wet ? "cell-number on-stack on-wet" : "cell-number on-stack", x: centerX, y: centerY }, svg).textContent = String(value);
    } else if (s.potions && s.potions[index]) {
      const group = svgElement("g", { class: "potion" }, svg);
      svgElement("rect", { x: centerX - 3, y: centerY - 15, width: 6, height: 8 }, group);
      svgElement("rect", { x: centerX - 9, y: centerY - 8, width: 18, height: 17 }, group);
      svgElement("title", {}, group).textContent = "A potion: one safe step onto lava, then it's used up (doesn't work on the abyss)";
    }
  }
  if (index === s.player) {
    const group = svgElement("g", { class: "player" }, svg);
    drawPlayerSprite(group, centerX, centerY);
  }
  if (isGoal) {
    drawCrown(svg, centerX, centerY, value !== 0);
  }
}
