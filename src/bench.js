// Browser test bench for the lava-and-blocks rules: type in any level, change
// the objective, try things out. The rules themselves (parseLevel, formatLevel,
// move, isWon, DIRECTIONS, OBJECTIVES) live in engine.js, the preset levels
// (PRESET_LEVELS) in levels.js, and the board drawing (drawBoard, CELL, RIM) in
// render.js, all loaded before this file. The player-facing game is play.js.

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
  drawBoard(elements.board, state.current);
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
