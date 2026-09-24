// Level harness: play the puzzles from a generation round and mark which ones
// to keep. A round (experiments/rounds/<name>/, made by experiments/round.js)
// has dry puzzles d1, d2, ... and, for those that could be robe-retrofitted,
// robe versions r1, r2, ... numbered to match. Play any of them in classic mode
// or with the robe (one free step onto magma, `carried: 1`, as in POTION_LEVELS).
// The rules are in engine.js and the drawing in render.js, loaded before this.
//
// Verdicts (keep / maybe / reject, plus a note) are remembered in this browser
// as you go, matched on each level's `key` (a hash of its text) so they survive
// a re-merge that renumbers the ids, and exported as verdicts.json to be saved in
// the round's directory, where it's loaded back in (the file is the baseline,
// this browser's own marks win over it).
//
// Rounds are found through the static server's directory listing, so this only
// works from a local server, not file://.
//
// URL: ?round=<name>&id=<d7|r7>&view=both|d|r&mode=classic|robe. Older mode:
// ?src=<file-name substring> plays the loose find-levels files in
// experiments/results/ instead, ids <seed>.<rank>, with no verdicts.

const KEY_DIRECTIONS = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  w: "up", s: "down", a: "left", d: "right",
  W: "up", S: "down", A: "left", D: "right"
};

const ROUNDS_DIR = "experiments/rounds/";
const RESULTS_DIR = "experiments/results/";
const VERDICT_MARKS = { keep: "✓", maybe: "?", reject: "✗" };

const DEATH_TEXT = {
  lava: "You stepped into the lava. The level has restarted.",
  edge: "You stepped off the edge into the lava. The level has restarted.",
  abyss: "You stepped into the abyss. The level has restarted."
};
const REFUSAL_TEXT = {
  wall: "There's a wall there.",
  "stack-blocked": "That stack is against a wall and won't move.",
  lava: "That's lava, so the move was refused.",
  edge: "That's the edge of the board (lava), so the move was refused.",
  abyss: "That's the abyss, so the move was refused."
};

const state = {
  round: null, // Round name, or null in the loose-files mode.
  all: [], // { id, key, text, info } for every level of the round, d1, r1, d2, ...
  levels: [], // The ones the current view shows.
  view: "both",
  index: 0,
  mode: "classic", // The mode chosen in the dropdown; a robe version overrides it (see modeOf).
  initial: null,
  current: null,
  history: [],
  pushCounts: [],
  pushes: 0,
  message: "",
  messageKind: "",
  verdicts: {} // key -> { id, verdict, note }
};

const elements = {
  roundSelect: document.querySelector("#round-select"),
  viewSelect: document.querySelector("#view-select"),
  levelSelect: document.querySelector("#level-select"),
  modeSelect: document.querySelector("#mode-select"),
  levelId: document.querySelector("#level-id"),
  levelStats: document.querySelector("#level-stats"),
  board: document.querySelector("#board"),
  status: document.querySelector("#status"),
  prev: document.querySelector("#prev-button"),
  undo: document.querySelector("#undo-button"),
  restart: document.querySelector("#restart-button"),
  next: document.querySelector("#next-button"),
  keep: document.querySelector("#keep-button"),
  maybe: document.querySelector("#maybe-button"),
  reject: document.querySelector("#reject-button"),
  note: document.querySelector("#note-input"),
  exportButton: document.querySelector("#export-button"),
  verdictSummary: document.querySelector("#verdict-summary"),
  sourceNote: document.querySelector("#source-note"),
  loadError: document.querySelector("#load-error")
};

const params = new URLSearchParams(window.location.search);
state.mode = params.get("mode") === "robe" ? "robe" : "classic";
state.view = ["d", "r"].includes(params.get("view")) ? params.get("view") : "both";
elements.modeSelect.value = state.mode;
elements.viewSelect.value = state.view;

elements.roundSelect.addEventListener("change", () => {
  const next = new URLSearchParams();
  next.set("round", elements.roundSelect.value);
  window.location.search = `?${next}`;
});
elements.viewSelect.addEventListener("change", () => {
  state.view = elements.viewSelect.value;
  const current = state.levels[state.index];
  applyView(current ? current.id : null);
});
elements.levelSelect.addEventListener("change", () => startLevel(Number(elements.levelSelect.value)));
elements.modeSelect.addEventListener("change", () => {
  state.mode = elements.modeSelect.value;
  startLevel(state.index);
});
elements.prev.addEventListener("click", () => startLevel(state.index - 1));
elements.next.addEventListener("click", () => startLevel(state.index + 1));
elements.undo.addEventListener("click", undo);
elements.restart.addEventListener("click", restart);
elements.keep.addEventListener("click", () => setVerdict("keep"));
elements.maybe.addEventListener("click", () => setVerdict("maybe"));
elements.reject.addEventListener("click", () => setVerdict("reject"));
elements.note.addEventListener("input", () => setNote(elements.note.value));
elements.exportButton.addEventListener("click", exportVerdicts);
elements.board.addEventListener("click", handleBoardClick);
document.addEventListener("keydown", handleKeyDown);

start();

async function start() {
  if (params.get("src") !== null) await loadLooseFiles(params.get("src"));
  else await loadRound();
  applyView(params.get("id"));
}

// --- Finding the levels --------------------------------------------------------

// The names of the entries in a directory listing that link to something ending
// in `suffix` ("/" for subdirectories), from the static server's index page.
async function listDirectory(dir, suffix) {
  const listing = await (await fetch(dir)).text();
  const doc = new DOMParser().parseFromString(listing, "text/html");
  return [...doc.querySelectorAll(`a[href$='${suffix}']`)]
    .map((link) => decodeURIComponent(link.getAttribute("href")).split("/").filter(Boolean).pop())
    .sort();
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}

async function loadRound() {
  let rounds;
  try {
    rounds = await listDirectory(ROUNDS_DIR, "/");
  } catch (error) {
    showLoadError(`Couldn't read ${ROUNDS_DIR}: ${error.message}. Is this being served (not file://)?`);
    return;
  }
  if (rounds.length === 0) {
    showLoadError(`No rounds in ${ROUNDS_DIR}. Make one with experiments/round.js.`);
    return;
  }
  elements.roundSelect.replaceChildren(...rounds.map((name) => new Option(name, name)));
  const wanted = params.get("round");
  state.round = rounds.includes(wanted) ? wanted : rounds[rounds.length - 1]; // Names start with the date: latest last.
  elements.roundSelect.value = state.round;

  const base = `${ROUNDS_DIR}${encodeURIComponent(state.round)}/`;
  let dry;
  let robe;
  try {
    [dry, robe] = await Promise.all([fetchJson(`${base}D.json`), fetchJson(`${base}R.json`)]);
  } catch (error) {
    showLoadError(`Couldn't read the round: ${error.message}. Has it been merged (node experiments/round.js ${state.round} --merge)?`);
    return;
  }
  // d1, r1, d2, ...: a puzzle and its robe version side by side.
  dry.forEach((level, i) => {
    state.all.push({ id: level.id, key: level.key, text: level.text, info: level });
    const robeLevel = robe[i];
    if (robeLevel) state.all.push({ id: robeLevel.id, key: robeLevel.key, text: robeLevel.text, info: robeLevel });
  });
  elements.sourceNote.textContent = `Round ${state.round}: ${dry.length} dry puzzles, ${robe.filter(Boolean).length} robe versions.`;
  await loadVerdicts(base);
}

// Levels straight from the find-levels JSON files in experiments/results/, for
// results that aren't in a round. "…-seed434.json" -> "434.<rank>"; a file
// without a seed in its name uses the name minus a leading date and extension.
async function loadLooseFiles(filter) {
  elements.roundSelect.disabled = true;
  elements.viewSelect.disabled = true;
  let names;
  try {
    names = (await listDirectory(RESULTS_DIR, ".json")).filter((name) => name.includes(filter));
  } catch (error) {
    showLoadError(`Couldn't read ${RESULTS_DIR}: ${error.message}. Is this being served (not file://)?`);
    return;
  }
  const skipped = [];
  for (const name of names) {
    const seed = /seed(\d+)/.exec(name);
    const label = seed ? seed[1] : name.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.json$/, "");
    try {
      const entries = await fetchJson(RESULTS_DIR + encodeURIComponent(name));
      if (!Array.isArray(entries) || !entries.some((entry) => entry && typeof entry.text === "string")) throw new Error("no levels");
      // Ranks count every entry, so an id stays put next to an unusable one.
      entries.forEach((entry, rank) => {
        if (entry && typeof entry.text === "string") state.all.push({ id: `${label}.${rank + 1}`, key: null, text: entry.text, info: entry });
      });
    } catch {
      skipped.push(name);
    }
  }
  elements.sourceNote.textContent = `${state.all.length} levels from ${names.length - skipped.length} loose files.` + (skipped.length ? ` Skipped (no levels in them): ${skipped.join(", ")}.` : "");
  if (state.all.length === 0) showLoadError(`No levels found${filter ? ` matching "${filter}"` : ""}.`);
}

function showLoadError(text) {
  elements.loadError.textContent = text;
  elements.loadError.hidden = false;
  elements.loadError.closest("details").open = true;
}

// Which of the round's levels the view shows, in order, rebuilt into the level
// dropdown. Keeps `keepId` on screen if the new view still has it.
function applyView(keepId) {
  state.levels = state.all.filter((level) => state.view === "both" || level.id.startsWith(state.view));
  refreshLevelSelect();
  const found = state.levels.findIndex((level) => level.id === keepId);
  startLevel(found >= 0 ? found : 0);
}

function refreshLevelSelect() {
  elements.levelSelect.replaceChildren(...state.levels.map((level, i) => new Option(levelLabel(level), String(i))));
  elements.levelSelect.value = String(state.index);
}

function levelLabel(level) {
  const { score, pushes } = level.info;
  const mark = verdictOf(level).verdict ? `${VERDICT_MARKS[verdictOf(level).verdict]} ` : "";
  const bits = [`${mark}${level.id}`];
  if (typeof score === "number") bits.push(`score ${Math.round(score)}`);
  if (typeof pushes === "number") bits.push(`${pushes} pushes`);
  return bits.join(" · ");
}

// --- Verdicts ------------------------------------------------------------------

function storageKey() {
  return `magmamia.harness.verdicts.${state.round}`;
}

// The round's verdicts.json (if it has one) as the baseline, this browser's own
// marks on top. Either may be missing or unreadable.
async function loadVerdicts(base) {
  try {
    const file = await fetchJson(`${base}verdicts.json`);
    for (const entry of file.verdicts || []) state.verdicts[entry.key] = { id: entry.id, verdict: entry.verdict, note: entry.note || "" };
  } catch {
    /* No verdicts.json yet. */
  }
  try {
    Object.assign(state.verdicts, JSON.parse(window.localStorage.getItem(storageKey()) || "{}"));
  } catch {
    /* Nothing remembered in this browser. */
  }
}

function saveVerdicts() {
  try {
    window.localStorage.setItem(storageKey(), JSON.stringify(state.verdicts));
  } catch {
    /* The marks last until the page is closed; export them before then. */
  }
}

function verdictOf(level) {
  return (level.key && state.verdicts[level.key]) || { verdict: "", note: "" };
}

function updateVerdict(change) {
  const level = state.levels[state.index];
  if (!level || !level.key) return; // Loose files have no stable key to match on.
  const now = { id: level.id, ...verdictOf(level), ...change };
  if (!now.verdict && !now.note) delete state.verdicts[level.key];
  else state.verdicts[level.key] = now;
  saveVerdicts();
  const option = elements.levelSelect.options[state.index];
  if (option) option.textContent = levelLabel(level);
  renderVerdict();
}

// Pressing the mark a level already has clears it.
function setVerdict(verdict) {
  const level = state.levels[state.index];
  if (level) updateVerdict({ verdict: verdictOf(level).verdict === verdict ? "" : verdict });
}

function setNote(note) {
  updateVerdict({ note });
}

function renderVerdict() {
  const level = state.levels[state.index];
  const usable = Boolean(level && level.key);
  const current = usable ? verdictOf(level) : { verdict: "", note: "" };
  for (const [verdict, button] of [["keep", elements.keep], ["maybe", elements.maybe], ["reject", elements.reject]]) {
    button.setAttribute("aria-pressed", String(current.verdict === verdict));
    button.disabled = !usable;
  }
  elements.note.disabled = !usable;
  if (document.activeElement !== elements.note) elements.note.value = current.note;
  const counts = { keep: 0, maybe: 0, reject: 0 };
  for (const entry of Object.values(state.verdicts)) if (entry.verdict) counts[entry.verdict] += 1;
  elements.verdictSummary.textContent = usable ? `${counts.keep} keep · ${counts.maybe} maybe · ${counts.reject} reject` : "";
  elements.exportButton.disabled = !state.round;
}

// A verdicts.json to save into the round's directory. Levels are listed by id
// (d1 first, then r1, ...) for reading; `key` is what matches them on load.
function exportVerdicts() {
  const order = new Map(state.all.map((level, i) => [level.key, i]));
  const entries = Object.entries(state.verdicts)
    .map(([key, entry]) => ({ id: entry.id, key, verdict: entry.verdict, note: entry.note }))
    .sort((a, b) => (order.get(a.key) ?? Infinity) - (order.get(b.key) ?? Infinity));
  const file = { round: state.round, exported: new Date().toISOString(), verdicts: entries };
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2) + "\n"], { type: "application/json" }));
  link.download = "verdicts.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

// --- Playing a level -----------------------------------------------------------

function startLevel(index) {
  if (index < 0 || index >= state.levels.length) return;
  state.index = index;
  const level = state.levels[index];
  elements.modeSelect.value = modeOf(level);
  elements.modeSelect.disabled = Boolean(level.info.robe);
  state.initial = parseLevel(level.text);
  if (modeOf(level) === "robe") state.initial = { ...state.initial, carried: 1 };
  resetHistory();
  setMessage("", "");
  elements.levelSelect.value = String(index);
  updateUrl(level.id);
  render();
}

// So the address bar always names what's on screen: copy it to share a level,
// or read the id off it to tell Claude which one you mean.
function updateUrl(id) {
  const next = new URLSearchParams(window.location.search);
  if (state.round) {
    next.set("round", state.round);
    next.set("view", state.view);
  }
  next.set("id", id);
  next.set("mode", state.mode);
  try {
    window.history.replaceState(null, "", `?${next}`);
  } catch {
    /* The URL just doesn't follow along. */
  }
}

// A robe version only makes sense with the robe, so it always plays that way
// (and the dropdown is locked); anything else plays in the dropdown's mode, which
// a robe version doesn't disturb.
function modeOf(level) {
  return level.info.robe ? "robe" : state.mode;
}

function setMessage(text, kind) {
  state.message = text;
  state.messageKind = kind;
}

function isSolved() {
  return isWon(state.current, "reach");
}

function resetHistory() {
  state.current = state.initial;
  state.history = [];
  state.pushCounts = [];
  state.pushes = 0;
}

function attemptMove(directionName) {
  if (isSolved()) return;
  const outcome = move(state.current, directionName, { lavaFatal: true });
  if (outcome.result === "moved" || outcome.result === "pushed") {
    state.history.push(state.current);
    state.pushCounts.push(state.pushes);
    if (outcome.result === "pushed") state.pushes += 1;
    state.current = outcome.state;
    setMessage(outcome.usedPotion ? "The robe saved you -- but it's used up now." : "", "");
  } else if (outcome.result === "refused") {
    setMessage(REFUSAL_TEXT[outcome.reason], "");
  } else {
    // Died: the level restarts, and with it the move count and undo history.
    resetHistory();
    setMessage(DEATH_TEXT[outcome.reason], "died");
  }
  render();
}

function undo() {
  if (state.history.length === 0) return;
  state.current = state.history.pop();
  state.pushes = state.pushCounts.pop();
  setMessage("", "");
  render();
}

function restart() {
  resetHistory();
  setMessage("", "");
  render();
}

function handleKeyDown(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const tag = event.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  const directionName = KEY_DIRECTIONS[event.key];
  if (directionName) {
    // Not while a dropdown has focus: it would change its selection as well.
    if (tag === "SELECT") event.target.blur();
    event.preventDefault();
    attemptMove(directionName);
  } else if (tag === "SELECT") {
    return;
  } else if (event.key === "z" || event.key === "Z") {
    undo();
  } else if (event.key === "r" || event.key === "R") {
    restart();
  } else if (event.key === "[") {
    startLevel(state.index - 1);
  } else if (event.key === "]") {
    startLevel(state.index + 1);
  } else if (event.key === "k" || event.key === "K") {
    setVerdict("keep");
  } else if (event.key === "m" || event.key === "M") {
    setVerdict("maybe");
  } else if (event.key === "x" || event.key === "X") {
    setVerdict("reject");
  }
}

// A click on a cell next to the player moves that way; anything else is ignored.
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

// --- Rendering -----------------------------------------------------------------

function render() {
  drawBoard(elements.board, state.current);
  const level = state.levels[state.index];
  elements.levelId.textContent = `${level.id} · ${modeOf(level)}`;
  elements.levelStats.textContent = statsLine(level.info);
  elements.prev.disabled = state.index === 0;
  elements.next.disabled = state.index + 1 >= state.levels.length;
  elements.undo.disabled = state.history.length === 0;
  renderStatus();
  renderVerdict();
}

// What the round recorded about the level (find-levels.js's own measurements
// for a dry puzzle, the retrofit's for a robe one), for whichever fields it has.
function statsLine(info) {
  const bits = [];
  if (info.of) bits.push(`robe version of ${info.of}`);
  if (typeof info.score === "number") bits.push(`score ${info.score.toFixed(1)}`);
  if (typeof info.pushes === "number") bits.push(`${info.pushes} pushes`);
  if (typeof info.robeAfterPushes === "number") bits.push(`robe spent after push ${info.robeAfterPushes}`);
  if (typeof info.solutions === "number") bits.push(`${info.solutions} ${info.solutions === 1 ? "solution" : "solutions"}`);
  if (typeof info.slack === "number") bits.push(`slack ${info.slack}`);
  if (typeof info.tempting === "number") bits.push(`${info.tempting} tempting`);
  if (typeof info.dead === "number") bits.push(`${Math.round(info.dead * 100)}% dead`);
  if (typeof info.seed === "number") bits.push(`seed ${info.seed}`);
  if (Array.isArray(info.events) && info.events.length) bits.push(info.events.join("/"));
  return bits.join(" · ");
}

function renderStatus() {
  const moves = state.history.length;
  elements.status.className = "status";
  if (isSolved()) {
    elements.status.textContent = `Solved in ${moves} ${moves === 1 ? "move" : "moves"}, ${state.pushes} ${state.pushes === 1 ? "push" : "pushes"}.`;
    elements.status.classList.add("is-won");
    return;
  }
  const robe = modeOf(state.levels[state.index]) === "robe" ? ` · Robe: ${state.current.carried > 0 ? "protected" : "used up"}` : "";
  const prefix = `Moves: ${moves} · Pushes: ${state.pushes}${robe}`;
  elements.status.textContent = state.message ? `${prefix} · ${state.message}` : prefix;
  if (state.messageKind === "died") elements.status.classList.add("is-died");
}
