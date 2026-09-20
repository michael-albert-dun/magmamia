// Browser test bench for the lava-and-blocks rules. The rules themselves
// (parseLevel, formatLevel, move, isWon, DIRECTIONS, OBJECTIVES) live in
// engine.js, and the preset levels (PRESET_LEVELS) in levels.js, both loaded
// before this file. This file is just the UI built on top of them.
const SVG_NS = "http://www.w3.org/2000/svg";
const CELL = 48;
const RIM = 24; // Width of the infinite-lava rim drawn around the board.
const MIN_CELL_PX = 28; // Below this the board scrolls instead of shrinking.
const CROWN_POINTS = "-12,8 -12,-6 -6,0 0,-9 6,0 12,-6 12,8";

const KEY_DIRECTIONS = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  w: "up", s: "down", a: "left", d: "right",
  W: "up", S: "down", A: "left", D: "right"
};

const REFUSAL_TEXT = {
  wall: "There's a wall there.",
  "stack-blocked": "That stack is against a wall and won't move.",
  lava: "That's lava, so the move was refused.",
  edge: "That's the edge of the board (lava), so the move was refused."
};
const DEATH_TEXT = {
  lava: "You stepped into the lava. The level has restarted.",
  edge: "You stepped off the edge into the lava. The level has restarted."
};

const state = {
  initial: null,
  current: null,
  history: [], // Every earlier state, oldest first; its length is the move count.
  objective: "reach",
  lavaFatal: true,
  message: "",
  messageKind: ""
};

const elements = {
  objective: document.querySelector("#objective"),
  board: document.querySelector("#board"),
  status: document.querySelector("#status"),
  undo: document.querySelector("#undo-button"),
  restart: document.querySelector("#restart-button"),
  dpadButtons: [...document.querySelectorAll(".dpad button")],
  objectiveSelect: document.querySelector("#objective-select"),
  lavaFatal: document.querySelector("#lava-fatal"),
  presetSelect: document.querySelector("#preset-select"),
  levelText: document.querySelector("#level-text"),
  loadButton: document.querySelector("#load-button"),
  levelError: document.querySelector("#level-error"),
  currentText: document.querySelector("#current-text")
};

for (const [key, label] of Object.entries(OBJECTIVES)) {
  elements.objectiveSelect.append(new Option(label, key));
}
PRESET_LEVELS.forEach((preset, index) => {
  elements.presetSelect.append(new Option(preset.name, String(index)));
});

elements.undo.addEventListener("click", undo);
elements.restart.addEventListener("click", restart);
for (const button of elements.dpadButtons) {
  button.addEventListener("click", () => attemptMove(button.dataset.dir));
}
elements.board.addEventListener("click", handleBoardClick);
document.addEventListener("keydown", handleKeyDown);
elements.objectiveSelect.addEventListener("change", () => {
  state.objective = elements.objectiveSelect.value;
  state.message = "";
  render();
});
elements.lavaFatal.addEventListener("change", () => {
  state.lavaFatal = elements.lavaFatal.checked;
});
elements.presetSelect.addEventListener("change", () => choosePreset(Number(elements.presetSelect.value)));
elements.loadButton.addEventListener("click", () => loadLevel(elements.levelText.value));

choosePreset(0);

function choosePreset(index) {
  const preset = PRESET_LEVELS[index];
  elements.levelText.value = preset.text;
  elements.objectiveSelect.value = preset.objective;
  state.objective = preset.objective;
  loadLevel(preset.text);
}

function loadLevel(text) {
  let parsed;
  try {
    parsed = parseLevel(text);
  } catch (error) {
    elements.levelError.textContent = error.message;
    elements.levelError.hidden = false;
    return;
  }
  elements.levelError.hidden = true;
  state.initial = parsed;
  state.current = parsed;
  state.history = [];
  setMessage("", "");
  render();
}

function setMessage(text, kind) {
  state.message = text;
  state.messageKind = kind;
}

function isSolved() {
  return isWon(state.current, state.objective);
}

function attemptMove(directionName) {
  if (isSolved()) return;
  const outcome = move(state.current, directionName, { lavaFatal: state.lavaFatal });
  if (outcome.result === "moved") {
    state.history.push(state.current);
    state.current = outcome.state;
    setMessage("", "");
  } else if (outcome.result === "pushed") {
    state.history.push(state.current);
    state.current = outcome.state;
    const lost = outcome.drops.filter((landing) => landing < 0).length;
    let text = `Pushed a stack of ${outcome.height}.`;
    if (lost > 0) text += ` ${lost} ${lost === 1 ? "block was" : "blocks were"} lost off the edge.`;
    setMessage(text, "");
  } else if (outcome.result === "refused") {
    setMessage(REFUSAL_TEXT[outcome.reason], "");
  } else {
    // Died: the level restarts, and with it the move count and undo history.
    state.current = state.initial;
    state.history = [];
    setMessage(DEATH_TEXT[outcome.reason], "died");
  }
  render();
}

function undo() {
  if (state.history.length === 0) return;
  state.current = state.history.pop();
  setMessage("", "");
  render();
}

function restart() {
  state.current = state.initial;
  state.history = [];
  setMessage("", "");
  render();
}

function handleKeyDown(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const tag = event.target.tagName;
  if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT") return;
  const directionName = KEY_DIRECTIONS[event.key];
  if (directionName) {
    event.preventDefault();
    attemptMove(directionName);
  } else if (event.key === "z" || event.key === "Z") {
    undo();
  } else if (event.key === "r" || event.key === "R") {
    restart();
  }
}

// A click on a cell next to the player moves that way; anything else is ignored.
function handleBoardClick(event) {
  const s = state.current;
  const rect = elements.board.getBoundingClientRect();
  const scale = (s.cols * CELL + 2 * RIM) / rect.width;
  const x = Math.floor(((event.clientX - rect.left) * scale - RIM) / CELL);
  const y = Math.floor(((event.clientY - rect.top) * scale - RIM) / CELL);
  const dx = x - (s.player % s.cols);
  const dy = y - Math.floor(s.player / s.cols);
  if (Math.abs(dx) + Math.abs(dy) !== 1) return;
  const directionName = Object.keys(DIRECTIONS).find((name) => DIRECTIONS[name].dx === dx && DIRECTIONS[name].dy === dy);
  attemptMove(directionName);
}

function render() {
  renderBoard();
  renderStatus();
  elements.undo.disabled = state.history.length === 0;
  try {
    elements.currentText.textContent = formatLevel(state.current);
  } catch (error) {
    elements.currentText.textContent = `(can't be written as text: ${error.message})`;
  }
}

function renderStatus() {
  const s = state.current;
  let objective = OBJECTIVES[state.objective];
  if (state.objective === "reach" && !s.goals.includes(1)) objective += " (this level has no goal cell)";
  elements.objective.textContent = objective;

  const moves = state.history.length;
  elements.status.className = "status";
  if (isSolved()) {
    elements.status.textContent = `Solved in ${moves} ${moves === 1 ? "move" : "moves"}.`;
    elements.status.classList.add("is-won");
  } else {
    const prefix = `Moves: ${moves}.`;
    elements.status.textContent = state.message ? `${prefix} ${state.message}` : prefix;
    if (state.messageKind === "died") elements.status.classList.add("is-died");
  }
}

function svgElement(name, attributes, parent) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  parent.append(element);
  return element;
}

function renderBoard() {
  const s = state.current;
  const width = s.cols * CELL + 2 * RIM;
  const height = s.rows * CELL + 2 * RIM;
  const svg = elements.board;
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
