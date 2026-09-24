# Generation and harness checking

How a batch of candidate levels goes from the generator to a keep/reject decision.
The README has the rules and the search's own options; this is the workflow.

## The idea: a round

A **round** is one generation pass plus its robe conversions, kept together in
`experiments/rounds/<date>-<name>/`:

| File | What it is |
| --- | --- |
| `D.json` | The **dry** puzzles: every seed's levels merged (duplicates collapsed) and ranked by score. Ids `d1`, `d2`, ... |
| `R.json` | The **robe** versions, same index as D (`null` where a puzzle has none). `r7` is the robe version of `d7`. |
| `raw/` | Each seed's `find-levels.js` output (`seedN.json`) and log. |
| `round.json` | How the round was made: seeds, find-levels flags, the retrofit filters, counts. |
| `verdicts.json` | Your keep/maybe/reject marks, exported from the harness (absent until you export). |

Testing means looking at both D and R and deciding which belong in the curated
lists in `src/levels.js`.

## 1. Generate

```sh
node experiments/round.js 2026-09-25-name --seeds 431-436 --jobs 6 -- \
  --restarts 1000 --steps 500 --top 40 --max-minutes 120 --slack off \
  --min-end-positions 2 --max-dead 0.9
```

- Runs `find-levels.js` once per seed, in parallel, writing to `raw/`. Everything
  after `--` is passed to it unchanged (see the header of `find-levels.js` for the
  options). A seed's JSON is rewritten as it goes, so an interrupted run keeps what
  it found.
- Then merges automatically (step 2). It refuses to start if the round's `raw/`
  already exists.
- Long runs: the group4 round used six seeds for 120 minutes each.

## 2. Merge and retrofit

```sh
node experiments/round.js 2026-09-25-name --merge
```

Rebuilds `D.json`, `R.json` and `round.json` from whatever is in `raw/`. Use it
after adding seeds by hand or after changing a retrofit filter; no need to
regenerate. It re-ranks D, so **ids can renumber**. Every entry also has a
content `key` (a hash of the level text, `r`-prefixed for robe versions), and
verdicts are matched on that, so they survive.

### The robe retrofit

`experiments/robe-retrofit.js` tries to turn each dry puzzle into a robe level (the
player starts with one free step onto magma). It looks for a floor cell that the
dry solution steps on **exactly once** and that the level can't be solved without,
turns it to lava, and gives the robe. It goes through such cells farthest from the
start first, and a level gets an R entry only if a cell passes all of these:

1. **Not cheesable.** The crown's neighbour must not be reachable without spending
   the robe, or the player can skip the intended solve and just step on.
2. **Not walk-only.** The robe alone, with no pushes, must not win the level.
3. **Timed well.** In the intended solution the robe is spent after at least one
   push and before the last. Earlier it is a toll gate in front of the unchanged
   dry puzzle; later it is only a hop over the crown's moat.

A cell that fails goes on to the next candidate cell for that level. Most levels
end with no robe version, which is expected: in group4 only 4 of 27 got one.

Not covered: other ways the robe could shortcut the intended solution, and
timing is judged on the one intended solution, not on every solution.
`node experiments/robe-retrofit.js --check` runs the cheese and walk-only tests
over the shipped "With a Little Help" levels.

## 3. Look at them in the harness

```sh
python3 -m http.server 4190 --bind 127.0.0.1   # from the magmamia directory
```

Open <http://127.0.0.1:4190/harness.html>. It needs the server (not `file://`),
because rounds are found through its directory listing.

- **Round / Show / Level / Mode.** *Show* is dry only, robe only, or both (d1, r1,
  d2, ...). A robe version always plays with the robe and locks *Mode*; a dry
  puzzle plays classic unless you switch it to robe to see what the robe would do.
- **The stats line** under the title is what the search recorded: score, pushes,
  solutions, slack, tempting moves, dead-position share, events, seed. For a robe
  version it also says which puzzle it comes from and after which push the robe is
  spent.
- **Controls.** Arrow keys or WASD, or click a cell next to the player. `Z` undo,
  `R` restart, `[` and `]` previous and next level.
- **Verdicts.** `K` keep, `M` maybe, `X` reject (or the buttons), plus a note
  field. Pressing the same mark again clears it. Marked levels show ✓ ? ✗ in the
  level dropdown.
- **The URL** always names what is on screen, so it can be pasted or read out:
  `?round=2026-09-24-group4&id=r7&view=both&mode=robe`.

### Saving verdicts

The harness can't write files. Marks are kept in the browser's local storage as
you work, and **Export verdicts** downloads `verdicts.json`. Save it into the
round's directory; from then on it is loaded as the baseline whenever the round
opens (this browser's own marks are laid on top). Export again to update it.

## 4. Curate

Read `verdicts.json` and copy the keepers' level text into the right list in
`src/levels.js` (a robe keeper needs `carried: 1`, as in `POTION_LEVELS`). Bump
the `?v=` strings in `index.html` for every changed file, as usual. Note that
`tests/robe-levels.test.js` cheese- and walk-checks the shipped robe levels, but
does not yet apply the timing rule.

## Older results

`?src=<file-name substring>` makes the harness read loose find-levels JSON files
from `experiments/results/` instead, with ids `<seed>.<rank>` and no verdicts.
That is how results from before rounds existed can still be played.
