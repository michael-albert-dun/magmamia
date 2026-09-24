// A "round" of level generation and testing, kept together in one directory:
//
//   experiments/rounds/<name>/
//     raw/seedN.json, raw/seedN.log   find-levels.js output, one pair per seed
//     D.json      the dry puzzles: every seed's levels merged, ranked by score
//     R.json      the robe retrofits, same index as D (null where D[i] has none)
//     round.json  how the round was made (seeds, flags, filters, counts)
//     verdicts.json   (optional) exported from harness.html: keep/maybe/reject
//
// Generate a round (runs the seeds in parallel, then merges):
//
//   node experiments/round.js 2026-09-25-name --seeds 431-436 [--jobs 6] -- \
//     --restarts 1000 --steps 500 --top 40 --max-minutes 120 --slack off ...
//
// Everything after `--` goes to find-levels.js unchanged (with --seed and --json
// added per seed). Rebuild D, R and round.json from whatever is in raw/ (also
// how an existing round is migrated, and how retrofit filter changes are
// re-applied without regenerating):
//
//   node experiments/round.js 2026-09-25-name --merge
//
// Ids: puzzle i (1-based, in D's order) is "d<i>", and its retrofit is "r<i>".
// Re-merging after adding seeds re-ranks D and so renumbers the ids, which is why
// every entry also has a `key` (a hash of the level text, "r"-prefixed for the
// robe version): harness verdicts are matched on that, not on the id.
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { formatLevel } = require("../src/engine.js");
const { analyseCandidate } = require("./robe-retrofit.js");

const ROUNDS_DIR = path.join(__dirname, "rounds");

// What robe-retrofit.js's analyseCandidate applies, recorded in round.json so a
// round says which rules produced its R. Keep in step with that file.
const RETROFIT_FILTERS = [
  "essential cell visited once by the dry solution, turned to lava",
  "no cheese: crown's neighbour not reachable without spending the robe",
  "not walk-only: the robe alone doesn't win",
  "robe spent after at least one push and before the last"
];

function parseSeeds(spec) {
  const seeds = [];
  for (const part of spec.split(",")) {
    const range = /^(\d+)-(\d+)$/.exec(part);
    if (range) for (let s = Number(range[1]); s <= Number(range[2]); s += 1) seeds.push(s);
    else if (/^\d+$/.test(part)) seeds.push(Number(part));
    else throw new Error(`Bad --seeds entry "${part}" (use e.g. 431-436 or 431,440).`);
  }
  return seeds;
}

function keyOf(text) {
  return crypto.createHash("sha1").update(text).digest("hex").slice(0, 8);
}

function runSeed(dir, seed, findArgs) {
  const rel = path.relative(process.cwd(), path.join(dir, "raw"));
  const args = ["experiments/find-levels.js", "--seed", String(seed), ...findArgs, "--json", `${rel}/seed${seed}.json`];
  const log = fs.openSync(path.join(dir, "raw", `seed${seed}.log`), "w");
  fs.writeSync(log, `# command: node ${args.join(" ")}\n`);
  return new Promise((resolve) => {
    const child = spawn("node", args, { stdio: ["ignore", log, log] });
    child.on("exit", (code) => { fs.closeSync(log); resolve({ seed, code }); });
  });
}

async function generate(dir, seeds, findArgs, jobs) {
  fs.mkdirSync(path.join(dir, "raw"), { recursive: true });
  const pending = seeds.slice();
  const failed = [];
  const worker = async () => {
    while (pending.length) {
      const seed = pending.shift();
      console.log(`seed ${seed}: started`);
      const { code } = await runSeed(dir, seed, findArgs);
      console.log(`seed ${seed}: finished (exit ${code})`);
      if (code !== 0) failed.push(seed);
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, seeds.length) }, worker));
  if (failed.length) console.log(`WARNING: seeds that exited non-zero: ${failed.join(", ")}`);
}

// D: every level from raw/seed*.json, duplicates (same text from different
// seeds) collapsed to the best-scoring copy, ranked by score, then seed, then
// the level's rank within its own file, so the order is reproducible.
function mergeDry(dir) {
  const byText = new Map();
  for (const name of fs.readdirSync(path.join(dir, "raw")).filter((n) => /^seed\d+\.json$/.test(n))) {
    const seed = Number(/\d+/.exec(name)[0]);
    JSON.parse(fs.readFileSync(path.join(dir, "raw", name))).forEach((entry, rank) => {
      if (!entry || typeof entry.text !== "string") return;
      const candidate = { ...entry, seed, seedRank: rank + 1 };
      const seen = byText.get(entry.text);
      if (!seen || candidate.score > seen.score) byText.set(entry.text, candidate);
    });
  }
  const levels = [...byText.values()].sort((a, b) => b.score - a.score || a.seed - b.seed || a.seedRank - b.seedRank);
  return levels.map((level, i) => ({ id: `d${i + 1}`, key: keyOf(level.text), ...level }));
}

function retrofitAll(dry) {
  return dry.map((level, i) => {
    const result = analyseCandidate(level.text);
    if (result.rejected || !result.candidate) {
      console.log(`d${i + 1}: no robe version${result.rejected ? ` (${result.rejected})` : ""}`);
      return null;
    }
    const cols = level.text.split("\n")[0].length;
    const c = result.candidate.cell;
    console.log(`d${i + 1}: r${i + 1} at (${c % cols},${Math.floor(c / cols)}), robe after ${result.timing.before} of ${result.pushes} pushes`);
    return {
      id: `r${i + 1}`,
      key: `r${level.key}`,
      of: level.id,
      robe: true,
      text: formatLevel(result.verified),
      cell: `(${c % cols},${Math.floor(c / cols)})`,
      pushes: result.pushes,
      robeAfterPushes: result.timing.before,
      solutions: level.solutions,
      score: level.score
    };
  });
}

function merge(dir, extra) {
  const dry = mergeDry(dir);
  const robe = retrofitAll(dry);
  fs.writeFileSync(path.join(dir, "D.json"), JSON.stringify(dry, null, 2) + "\n");
  fs.writeFileSync(path.join(dir, "R.json"), JSON.stringify(robe, null, 2) + "\n");
  const previous = fs.existsSync(path.join(dir, "round.json")) ? JSON.parse(fs.readFileSync(path.join(dir, "round.json"))) : {};
  const seeds = fs.readdirSync(path.join(dir, "raw")).map((n) => /^seed(\d+)\.json$/.exec(n)).filter(Boolean).map((m) => Number(m[1])).sort((a, b) => a - b);
  const info = { ...previous, ...extra, seeds, retrofitFilters: RETROFIT_FILTERS, merged: new Date().toISOString(), counts: { D: dry.length, R: robe.filter(Boolean).length } };
  fs.writeFileSync(path.join(dir, "round.json"), JSON.stringify(info, null, 2) + "\n");
  console.log(`\n${dry.length} dry puzzles in D, ${info.counts.R} robe retrofits in R -> ${path.relative(process.cwd(), dir)}/`);
}

async function main() {
  const argv = process.argv.slice(2);
  const split = argv.indexOf("--");
  const own = split >= 0 ? argv.slice(0, split) : argv;
  const findArgs = split >= 0 ? argv.slice(split + 1) : [];
  const name = own[0] && !own[0].startsWith("--") ? own[0] : null;
  if (!name) {
    console.log("Usage: see the header comment.");
    return;
  }
  const dir = path.join(ROUNDS_DIR, name);
  const option = (flag) => (own.includes(flag) ? own[own.indexOf(flag) + 1] : undefined);
  if (option("--seeds")) {
    if (fs.existsSync(path.join(dir, "raw"))) throw new Error(`${dir}/raw already exists; pick a new round name (or --merge to rebuild it).`);
    const seeds = parseSeeds(option("--seeds"));
    const generatedFrom = { generated: new Date().toISOString(), findLevelsArgs: findArgs };
    await generate(dir, seeds, findArgs, Number(option("--jobs") ?? seeds.length));
    merge(dir, generatedFrom);
  } else if (own.includes("--merge")) {
    if (!fs.existsSync(path.join(dir, "raw"))) throw new Error(`No ${dir}/raw to merge.`);
    merge(dir, {});
  } else {
    console.log("Usage: see the header comment.");
  }
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exit(1); });
