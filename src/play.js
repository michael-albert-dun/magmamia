// The player-facing game: a level picker, the board, undo and restart. The
// rules (move, previewPushes, isWon, ...) are in engine.js, the levels
// (CURATED_LEVELS, or one of the dancefloor sets) in levels.js and the board drawing
// (drawBoard, CELL) in render.js, all loaded before this file. bench.html is the
// developer's test bench, this is the game.
const KEY_DIRECTIONS = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  w: "up", s: "down", a: "left", d: "right",
  W: "up", S: "down", A: "left", D: "right"
};

const DEATH_TEXT = {
  lava: "You stepped into the lava. The level has restarted.",
  edge: "You stepped off the edge into the lava. The level has restarted.",
  abyss: "You stepped into the infinite lava. The level has restarted."
};
const REFUSAL_TEXT = {
  wall: "There's a wall there.",
  "stack-blocked": "That stack is against a wall and won't move.",
  lava: "That's lava, so the move was refused.",
  edge: "That's the edge of the board (lava), so the move was refused.",
  abyss: "That's infinite lava, so the move was refused."
};

// What the how-to-play says first, by objective. A level's objective is
// `objective` in its CURATED_LEVELS entry ("reach" if it has none).
const OBJECTIVE_HELP = {
  reach: "Seize the crown! Reach it to win the level.",
  lava: "Fill in all the lava. Blocks left over don't matter.",
  all: "Clear the dancefloor! Get rid of every bit of lava and every block. A block can only be removed by pushing it into infinite lava."
};

// Which list of levels to play: the game's own, or one of the "Clear the dancefloor"
// candidate sets being tried out (?set=dancefloor for the latest round, ?set=dancefloor1
// for round 1). Each set keeps its own saved progress.
const LEVEL_SETS = {
  dancefloor: { levels: DANCEFLOOR_CANDIDATES, key: "magmamia.solved.dancefloor2.v1", title: "dancefloor candidates" },
  dancefloor1: { levels: DANCEFLOOR_ROUND_1, key: "magmamia.solved.dancefloor.v1", title: "dancefloor candidates, round 1" }
};

function requestedSet() {
  try {
    return LEVEL_SETS[new URLSearchParams(window.location.search).get("set")] || null;
  } catch {
    return null;
  }
}
const CANDIDATE_SET = requestedSet();
const LEVELS = CANDIDATE_SET ? CANDIDATE_SET.levels : CURATED_LEVELS;

const SOLVED_KEY = CANDIDATE_SET ? CANDIDATE_SET.key : "magmamia.solved.v1";
const GENTLE_KEY = "magmamia.gentle.v1";
const PREVIEW_KEY = "magmamia.preview.v1";

const state = {
  levelIndex: 0,
  initial: null,
  current: null,
  history: [], // Every earlier state, oldest first; its length is the move count.
  message: "",
  messageKind: "",
  solved: new Set(), // Indexes of levels solved so far, remembered between visits.
  gentle: false, // Refuse lava moves instead of dying.
  preview: false // Tag the cells a push would drop blocks on. Opt-in, off by default.
};

const elements = {
  infoButton: document.querySelector("#info-button"),
  infoPanel: document.querySelector("#info-panel"),
  gentle: document.querySelector("#gentle-lava"),
  preview: document.querySelector("#show-preview"),
  levelNav: document.querySelector("#level-nav"),
  board: document.querySelector("#board"),
  status: document.querySelector("#status"),
  undo: document.querySelector("#undo-button"),
  restart: document.querySelector("#restart-button"),
  next: document.querySelector("#next-button"),
  dpadButtons: [...document.querySelectorAll(".dpad button")],
  objectiveHelp: document.querySelector("#objective-help"),
  title: document.querySelector("#game-title")
};

if (CANDIDATE_SET) elements.title.textContent = `Magma Mia! \u2014 ${CANDIDATE_SET.title}`;
loadPreferences();
elements.gentle.checked = state.gentle;
elements.preview.checked = state.preview;
elements.infoButton.addEventListener("click", toggleInfo);
elements.gentle.addEventListener("change", () => {
  state.gentle = elements.gentle.checked;
  savePreference(GENTLE_KEY, state.gentle ? "1" : "0");
});
elements.preview.addEventListener("change", () => {
  state.preview = elements.preview.checked;
  savePreference(PREVIEW_KEY, state.preview ? "1" : "0");
  render();
});
elements.undo.addEventListener("click", undo);
elements.restart.addEventListener("click", restart);
elements.next.addEventListener("click", () => startLevel(state.levelIndex + 1));
for (const button of elements.dpadButtons) {
  button.addEventListener("click", () => attemptMove(button.dataset.dir));
}
elements.board.addEventListener("click", handleBoardClick);
document.addEventListener("keydown", handleKeyDown);

startLevel(firstUnsolvedLevel());

function firstUnsolvedLevel() {
  const index = LEVELS.findIndex((_, i) => !state.solved.has(i));
  return index >= 0 ? index : 0;
}

// Browser storage may be missing or blocked, so every use is wrapped: the game
// works the same without it, it just forgets progress.
function loadPreferences() {
  try {
    const solved = JSON.parse(window.localStorage.getItem(SOLVED_KEY) || "[]");
    if (Array.isArray(solved)) solved.forEach((i) => Number.isInteger(i) && state.solved.add(i));
    state.gentle = window.localStorage.getItem(GENTLE_KEY) === "1";
    state.preview = window.localStorage.getItem(PREVIEW_KEY) === "1"; // Off unless turned on.
  } catch {
    /* No saved progress. */
  }
}

function savePreference(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* Progress just isn't remembered. */
  }
}

function toggleInfo() {
  const open = elements.infoPanel.hidden;
  elements.infoPanel.hidden = !open;
  elements.infoButton.setAttribute("aria-expanded", String(open));
}

function startLevel(index) {
  if (index < 0 || index >= LEVELS.length) return;
  state.levelIndex = index;
  state.initial = parseLevel(LEVELS[index].text);
  state.current = state.initial;
  state.history = [];
  setMessage("", "");
  render();
}

function setMessage(text, kind) {
  state.message = text;
  state.messageKind = kind;
}

function objectiveOf(levelIndex) {
  return LEVELS[levelIndex].objective || "reach";
}

function isSolved() {
  return isWon(state.current, objectiveOf(state.levelIndex));
}

function attemptMove(directionName) {
  if (isSolved()) return;
  const outcome = move(state.current, directionName, { lavaFatal: !state.gentle });
  if (outcome.result === "moved" || outcome.result === "pushed") {
    state.history.push(state.current);
    state.current = outcome.state;
    setMessage("", "");
    if (isSolved()) {
      state.solved.add(state.levelIndex);
      savePreference(SOLVED_KEY, JSON.stringify([...state.solved]));
    }
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
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
  const directionName = KEY_DIRECTIONS[event.key];
  if (directionName) {
    event.preventDefault();
    attemptMove(directionName);
  } else if (event.key === "z" || event.key === "Z") {
    undo();
  } else if (event.key === "r" || event.key === "R") {
    restart();
  } else if (event.key === "Enter" && isSolved() && !elements.next.hidden) {
    startLevel(state.levelIndex + 1);
  }
}

// A click on a square next to the player moves that way; anything else is ignored.
function handleBoardClick(event) {
  const s = state.current;
  const rect = elements.board.getBoundingClientRect();
  const scale = (s.cols * CELL) / rect.width;
  const x = Math.floor(((event.clientX - rect.left) * scale) / CELL);
  const y = Math.floor(((event.clientY - rect.top) * scale) / CELL);
  const dx = x - (s.player % s.cols);
  const dy = y - Math.floor(s.player / s.cols);
  if (Math.abs(dx) + Math.abs(dy) !== 1) return;
  const directionName = Object.keys(DIRECTIONS).find((name) => DIRECTIONS[name].dx === dx && DIRECTIONS[name].dy === dy);
  attemptMove(directionName);
}

function render() {
  elements.objectiveHelp.textContent = OBJECTIVE_HELP[objectiveOf(state.levelIndex)];
  // Tags for where a push from here would drop blocks (see previewPushes).
  const chips = state.preview && !isSolved() ? previewPushes(state.current).flatMap((push) => push.landings) : [];
  drawBoard(elements.board, state.current, { chips });
  renderLevelNav();
  renderStatus();
  elements.undo.disabled = state.history.length === 0;
  elements.next.hidden = !(isSolved() && state.levelIndex + 1 < LEVELS.length);
}

function renderLevelNav() {
  elements.levelNav.replaceChildren();
  LEVELS.forEach((_, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = String(index + 1);
    button.className = "level-button";
    if (index === state.levelIndex) button.classList.add("is-current");
    if (state.solved.has(index)) button.classList.add("is-solved");
    button.setAttribute("aria-label", `Level ${index + 1}${state.solved.has(index) ? ", solved" : ""}`);
    if (index === state.levelIndex) button.setAttribute("aria-current", "true");
    button.addEventListener("click", () => startLevel(index));
    elements.levelNav.append(button);
  });
}

function renderStatus() {
  const moves = state.history.length;
  elements.status.className = "status";
  if (isSolved()) {
    const last = state.levelIndex + 1 >= LEVELS.length;
    elements.status.textContent = `Solved in ${moves} ${moves === 1 ? "move" : "moves"}.${last ? " That's the last level for now." : ""}`;
    elements.status.classList.add("is-won");
  } else {
    const prefix = `Level ${state.levelIndex + 1} · Moves: ${moves}`;
    elements.status.textContent = state.message ? `${prefix} · ${state.message}` : prefix;
    if (state.messageKind === "died") elements.status.classList.add("is-died");
  }
}
