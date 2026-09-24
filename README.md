# Magma Mia!

A box-pushing puzzle on a grid. Blocks are stacked, not slid: pushing a stack
topples it, and the fallen blocks are used to bridge lava. (While it was being
designed it was called "The floor is lava".)

This is an early design sketch. Anything marked *(open)* is undecided.

## The board

Play is on a rectangular grid. Each cell is in exactly one of these states:

- **Floor**: can be walked on.
- **Lava**: has a depth (1 or more). Walking onto lava is fatal.
- **Infinite lava**: lava of infinite depth. Walking onto it is fatal, and a block
  landing on it is lost, so it can never be filled.
- **Stack**: a pile of blocks with a height (1 or more), standing on floor.
- **Wall**: immovable and impassable.

**The border.** Every cell around the edge of the board must be infinite lava or
wall, in any mix. So there is nothing beyond the grid to think about: a board is
just a grid with that constraint on its edge cells. (The engine still treats
anything past the edge as infinite lava, so a level without a closed border works,
but all the game's levels have one.)

A **goal** is not a cell state but a marker that any cell can carry: floor, lava
or a stack. It stays put when the cell's contents change. If the cell is lava,
the lava has to be filled before the goal can be reached. If it is covered by a
stack, the stack has to be pushed off. When a stack toppling from that cell
removes it, the goal is left on the floor beneath, as if the crown dropped
straight down.

## Movement

The player moves one cell at a time, orthogonally (no diagonals). The player
cannot move onto a wall. Moving into a stack is a push (below); a stack is never
walked on.

By default, walking onto lava or infinite lava is fatal and the level restarts. A
setting allows a gentler mode in which that move is simply refused instead.

## Pushing

Moving into a stack pushes it, and the stack topples away from the player.

- A stack of height *h* lays its blocks one per cell along the next *h* cells in
  the push direction.
- A block landing on **floor** adds 1 to that cell's height (a new stack of 1).
- A block landing on another **stack** adds 1 to its height. The stack does not
  topple in turn.
- A block landing on **lava** makes it 1 shallower and is used up. Lava at depth
  0 has become floor, not a stack.
- A block landing on **infinite lava** is lost and the cell stays as it was. So a
  stack next to infinite lava can be pushed into it, destroying its blocks, unlike
  a stack against a wall, which can't be pushed at all.
- Blocks that would land on a **wall**, or beyond one, all pile up on the last
  cell before it. *(open)* If that cell is lava, the piled blocks fill it first
  and only then build a stack (the engine simply adds 1 per block to the cell's
  signed height). This case wasn't in the worked example, so it's my reading.
- A block landing on a cell with an uncollected **potion** destroys it, whatever
  else the landing does to that cell (fills lava, starts a stack, adds to one).
  Potions are fragile: buried is gone, not just covered.
- The player then steps into the cell the stack was in, which is now floor.
- A stack directly next to a wall cannot be pushed into it. This is a no-op.

### Worked example

In this notation `x` is the player, positive numbers are stack heights, zero is
floor, negative numbers are lava depths and `W` is a wall.

```text
x  5 -2 -1  0  W
```

Pushing right lays the five blocks along the next cells: one shallows the depth-2
lava, one fills the depth-1 lava (making it floor), one starts a stack on the
floor, and the last two would reach the wall, so they pile onto that same stack.

```text
0  x -1  0  3  W
```

## Graphics

- **Floor**: a very pale blue-grey.
- **Goal**: a crown icon drawn on top of whatever is in the cell (floor, lava or
  a stack). A goal cell's floor is a different colour (currently teal, well away
  from the beige of the stacks), chosen so it stays clearly visible around a stack
  that covers it.
- **Lava**: red, with its depth as a small number in the middle.
- **Stack**: a beige, sandy square (a marbled or sandstone texture may come
  later), slightly smaller than the cell so a border of floor shows around it,
  with its height as a small number in the middle. Beige rather than green so
  that lava and stacks differ in lightness and stay distinguishable for
  colour-blind players.
- Numbers are always positive; the colour says whether a cell is lava or a stack.
- **Infinite lava (the abyss)**: a dark, space-like square with a black-hole
  core and a few short white arms curving out of it, not a shade of ordinary
  lava -- see "Waterlogged blocks" below for why it reads as its own, absolute
  hazard rather than a variant of lava. On a closed board it forms the border,
  alongside any border walls.
- **Push preview** (an option, off by default): with it on, standing next to a
  stack shows a small `+n` tag in the corner of each cell its blocks would land
  on (a wall pile is summed into one tag). Blocks that would be lost into infinite lava
  get a dashed tag on that cell. It shows one push ahead only, not a plan,
  and is switched on in the game's info panel. It exists because it's easy to
  assume a stack of 2 next to depth-2 lava fills it, when the second block
  actually lands on the next cell. It's off by default because working out where
  the blocks go is part of the puzzle.

## Objective

Levels can have different kinds of goal, chosen per level (`objective` in the
level list, "reach" if not given). The game's how-to-play text follows the level's
objective.

- **Seize the crown**: reach a particular cell. All the game's levels so far.
- **Clear the lava**: no finite lava left; blocks left over don't matter.
- **Clear the dancefloor**: no lava and no blocks left. A block can only be removed
  by pushing it into infinite lava, so the border matters: a border wall takes away
  a place to dispose of blocks, and a walled-in corner can strand a block that can
  never be cleared.

Blocks can land on the goal cell. The player then has to push them off again
before they can win by standing there. This is deliberate: a covered goal is an
easy thing to overlook, and the goal's floor colour stays visible around the
stack.

**What playtesting has found about Clear the dancefloor levels** (Michael's verdicts
on two rounds of candidates; the tight, lava-heavy ones were the interesting ones):

- **Few spare blocks.** The number of blocks that must be thrown away is fixed by the
  board: all the blocks minus all the finite lava depth. One or two spare is good;
  four or more makes a level loose and easy to muddle through. (In round 1 the
  favourite had a surplus of 1 and 18 points of lava depth; the ones called too slack
  or too easy had 4 to 5.)
- **Lots of lava.**
- **Mostly wall around the edge**, with only a few infinite lava cells as outlets.
  Part of the difficulty is then tidying up any extra blocks.
- **Necessary moves that don't clear lava.** Building a level by only "uncovering"
  lava gives stacks that are simply shoved at their own strip. Reverse steps that
  carry blocks without leaving lava behind, and walls added across the intended
  route, make blocks have to be manoeuvred round obstacles first.
- **No obvious chores**, such as a stack whose only possible push throws it into
  infinite lava.
- **Casual, not hard.** Round 2 was "much nicer, still not hard", and Michael now thinks
  of this mode as casual/easy: you can strive for the optimum number of pushes, but the
  real experience is the tidying up. Most levels should be easy; a few harder ones are
  welcome (round 2's 11 and 12 were the ones that felt genuinely harder).
- **No stack with a unique available push**, particularly one in the clear (its pushing
  cell walkable from the start, so nothing has to be done first). It is a chore, not a
  choice. `forcedPushStacks` in `src/solver.js` finds them (`trivialDisposalStacks` is
  the special case that throws into infinite lava), and the candidate generator rejects
  them (`--max-forced-clear`, default 0; `--max-forced`, default 2). Round 2's level 11,
  the hardest, had none.
- **A nice trick makes a level.** Round 2's level 8 ends with moving the 1 round the
  block.
- **An idea to build:** an "overfill pocket". Two depth-1 lava cells in a column with
  the lower one walled in on the other three sides, and a 3-stack above: pushing the
  3 straight down overfills the pocket and strands a block there for good, so the
  stack has to be split and only two of its blocks brought back. A hand-built version
  is the last puzzle of round 1.

The game does not detect dead ends. A level can become unsolvable without
warning, and the player has to notice and undo or restart.

## Level format

Levels are plain text, one character per cell and one line per row, in the style
of Sokoban level files. The same text can serve as the URL encoding and as solver
input.

| Character | Cell |
| --- | --- |
| `.` | floor |
| `#` | wall |
| `~` | infinite lava |
| `a` to `z` | lava of depth 1 to 26 |
| `A` to `J` | dry stack, height 1 to 10 |
| `K` to `T` | waterlogged stack, height 1 to 10 (see "Waterlogged blocks" below) |
| `@` | the player, standing on floor |

So `a` is depth-1 lava and `C` is a dry stack of height 3. Lava depth is capped
at 26; a stack's height (dry or wet) is capped at 10, since dry and wet share
the alphabet instead of each getting the full A-Z. The worked example above is
the row `@Eba.#` before the push and `.@a.C#` after it.

A goal cell is written as its ordinary character followed by `*`. So `.*` is a
bare goal, `a*` is a goal on depth-1 lava, `C*` is a goal under a stack of height
3, and `@*` is the player starting on the goal. Rows are therefore not a fixed
number of characters wide, so a row has to be read cell by cell: a `*` always
belongs to the character before it. (`#*` and `~*` are errors: a wall or infinite
lava can't be a goal.)

A closed board has `~` or `#` in every cell around its edge. For example, the
game's L-shaped corner puzzle is:

```text
~~~~~~
~@..A~
~###.~
~###.~
~###.*~
~~~~~~
```

The box `A` is stuck in the corner, but pushing it right sends it into the
infinite lava, which clears the way to the goal.

## Waterlogged blocks ("There will be mud")

A refinement of a potion idea (see "To think about" below): a waterlogged (wet, or
"muddy") block behaves like an ordinary one except:

- Landing on lava, it solidifies the lava outright, however deep, using up just the
  one block. (Infinite lava still can't be cleared; a wet block lands there is lost
  the same as a dry one.)
- Touching another block waterlogs it too. Touch means "lands on top of": a toppled
  wet stack that adds one block to a dry stack makes the whole thing wet -- and the
  reverse also holds, a dry block landing on an already-wet stack doesn't wash it
  clean. But touch is judged per landing cell, not per push: when a stack spreads
  across several cells, only the ones that actually land on a wet stack are
  affected. A dry stack pushed across an existing wet single and two bare cells
  waterlogs only the one it lands on; the other two are ordinary dry singles, not
  waterlogged by association with the rest of their own push. A wall pile is the
  exception that proves the rule: if every one of those blocks piles onto that same
  wet cell instead (because a wall stops the line short), they all do touch it, and
  it stays wet.
- A stack is all wet or all dry, never mixed, so this is one bit per stack (per
  cell, really, since a stack lives at one cell at a time), not per block.

In the level text (see "Level format" above) `K` to `T` are wet stacks, height 1 to
10, alongside `A` to `J` for dry ones. `src/solver.js`'s exact search treats a wet
stack as a different state from a dry one of the same height, since it behaves
differently under a later push.

Levels are all "Seize the crown". Each is essential: with every `K`-`T` in its text
turned back into the matching dry letter (same height, no wetness), the level becomes
unsolvable, which `tests/levels.test.js` checks directly rather than trusting it by
eye. Round 1 (`?set=mud1`) is four hand-built levels demonstrating the mechanic
plainly, including the "touch" rule: a wet block one or two short of a multi-cell
trench has to merge with a dry stack first to reach the height that bridges it in one
push. Round 2 (`?set=mud`, the latest) was found rather than hand-built (see "Finding
levels" below) and leans harder on that: several of them need the wet stack to grow
before it's used, not just deployed on the nearest lava. Kept mostly dry either way,
in line with the other games' habit of one new mechanic at a time: a level's mud is
one or two small stacks, not a pile of them.

**Making mud essential by construction, not by patching a finished puzzle.** The
first attempt at a generator built an ordinary dry level, then deepened a lava cell
afterwards and hoped the result needed mud; it usually didn't, since the rest of a
rich level typically has its own way to the goal that the deepened cell was never on.
The working version instead makes mud part of the same construction and search that
made the curated levels (see "Finding levels"): `src/generator.js`'s `buildByReversal`
gained a third reverse-step kind, "soak" (alongside "uncover" and "transport"): where
forward play has a wet block solidify a lava cell of any depth in one go, reversed
that depth could have been anything, so a soak step hands its lava cell an arbitrary,
dry-unmanageable depth and marks the stack put back there wet. `experiments/
mud-candidates.js` seeds its search two ways -- with a soak step already in the
reversal, or by taking a plain dry build, converting one of its stacks to wet, deepening
a lava cell, and removing another stack it would otherwise still need -- then hill
climbs exactly as `find-levels.js` does, except mutation can also toggle a stack's
wetness, and every candidate the climb considers (not just the one it settles on) is
checked essential on the spot. Even so, a soak-built level isn't essential merely by
containing one: the rest of the build can still supply an unrelated dry route to the
goal, so the check has to run on the whole finished level, which is what makes the
continuous, not-just-at-the-end, checking matter. One more finding from that search:
mud levels ran with far more slack (spare, unused blocks) than the curated levels'
tuning assumes, apparently because the ordinary dry stacks a build leaves lying around
often go unused once the wet trick solves things efficiently; shrinking each dry stack
down to the smallest height that keeps the level solvable and essential (done once a
candidate otherwise passes) brought it back down without giving up on the level.

Visually a wet stack is the same sandy material, darkened like wet sand
(`--stack-wet` in `styles.css`), rather than a different colour; the brown/red
colourblind question is deferred until the mechanic itself settles. Infinite
lava now draws as a swirly vortex rather than plain red (see "Graphics" above),
since "abyss" (the engine's own name for it, `state.abyss`) is closer to how it
reads than "infinite lava" -- and, with potions in the game, it needs to read as
a different, absolute kind of hazard: a potion buys a step onto ordinary lava
but never onto the abyss.

## Levels

Levels will be generated with a solver, and probably also handmade, so there'll
be a mix. Each playable level carries an `optimum`: the fewest pushes that solve it, from the exact
solver, and `tests/levels.test.js` checks it against the solver. The game always
counts pushes as well as moves (walking is free, so steps say nothing about
tidiness), but only "Clear the dancefloor" (objective `all`) shows the solved
message comparing them with the optimum -- that push-optimisation framing is the
point of tidying up efficiently there, not of the other objectives, whose solved
message stays plain. This is a par to strive for, not a score to chase;
comparing against what other players achieved is *(open)*.

The board is bigger than in the other games, since interesting levels need room.
Either it scrolls on a phone, or the game is desktop-only. A default around 8
wide by 12 tall (counting the border) is the starting guess; the size should be a parameter rather than
a constant. Original Sokoban (32 by 20) is treated as the upper bound.

## To think about

**Multiple goals.** The `*` notation already allows more than one goal cell.
Possible rules for winning:

- Reach any one of them.
- Reach all of them, in any order.
- Reach all of them in a specified order. This would need a way to show and
  encode the order, which the plain `*` marker doesn't do.
- Potentially also variant goals, e.g., potions that allow you to stand on 
  a piece of lava (either just once, or converting it to floor)

How "reached" interacts with goals that get covered by blocks or that are on lava
would also need deciding: for the "all of them" rules, does a goal have to be
occupied at the same time as the others, or is visiting each one enough?

## Run Locally

From this directory:

```sh
python3 -m http.server 4176 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:4176/
```

The app is plain HTML, CSS, and JavaScript. There is no build step, and it fetches
no data files, so opening `index.html` directly also works.

`index.html` opens on a home screen listing every set of levels (the curated game,
each round of "Clear the dancefloor", "There will be mud"); picking one opens a
level-select grid for it, and picking a level opens the board. `?set=dancefloor`,
`?set=dancefloor2`, `?set=dancefloor1` and `?set=mud1` link straight to a
non-default set's level-select grid (`?set=dancefloor` and `?set=mud` are each
round's latest, and also what the bare set names mean); each set remembers its own
solved levels. Undo, restart and a collapsed how-to-play are on the board itself.
`bench.html` is the separate rules test bench: type in any level, pick the
objective, and try things out. Controls are the arrow keys or WASD (Z to undo, R to
restart), the on-screen arrows, or clicking a cell next to the player.
`harness.html` is the level harness for looking at generated candidates: it plays the
puzzles of a round (see "Rounds" under "Finding levels"), dry or robe, and records
keep/maybe/reject verdicts. It needs the local server, which is how it finds the
rounds. Keys: `[` and `]` for the previous and next level, `K`, `M`, `X` for keep,
maybe, reject. `?round=<name>&id=d7&view=both|d|r` links to a level; the address bar
always shows the current one. *Export verdicts* downloads a `verdicts.json` to save
into the round's directory (matched on the level's content, so it survives a
re-merge). `?src=<substring>` still plays loose find-levels files from
`experiments/results/`.

## Files

- `src/engine.js`: the rules, with no DOM: level parsing and printing, `move`,
  and objective checks. Also loadable from Node with `require`.
- `src/solver.js`: exact push-level solver and level analysis (see "Finding
  levels"). Also loadable from Node.
- `src/levels.js`: the test bench presets and the curated levels for the game.
- `src/render.js`: board drawing shared by both pages.
- `src/generator.js`: builds a level by running the game backwards (see "Finding
  levels"). Also loadable from Node.
- `src/play.js`, `index.html`: the game. `src/bench.js`, `bench.html`: the bench.
  `src/harness.js`, `harness.html`: the level harness. `experiments/round.js`:
  runs and merges a round of generation (see "Rounds").
- `styles.css`: styles for both pages.
- `experiments/find-levels.js`: the curated-level search. `experiments/
  dancefloor-candidates.js`, `experiments/mud-candidates.js`: the "Clear the
  dancefloor" and "There will be mud" candidate searches. `experiments/results/`:
  what runs of these have found.
- `tests/`: run with `node --test tests/`. `tests/solve.js` is a separate
  step-by-step breadth-first solver, used as an independent check on the
  push-level solver.

## Finding levels

`src/solver.js` searches over pushes rather than steps: between pushes the player
can walk anywhere in their connected patch of floor, so a state is the board plus
which patch the player is in. For a level it reports whether the goal can be
reached, the fewest pushes, how many distinct optimal push sequences there are,
the *slack* (the most blocks that can be left over in any winning position, where
0 means every solution uses every block), how many first pushes leave the level
solvable, and what share of reachable positions are dead ends. It also lists any
unusual events in a solution: covering the goal, piling against a wall, landing
on an existing stack, or losing blocks off the edge.

`experiments/find-levels.js` starts from a random 6 by 6 interior inside a border
ring (8 by 8 in all) whose cells are each infinite lava or wall, and hill-climbs
on a score built from those measurements, keeping levels that meet the filters: at
least 6 pushes, slack of at most 2 ("tightish"), at most 3 optimal solutions,
no decorative pieces beyond an allowance (`--max-decoration`, default none; a
few are welcome as red herrings) (a stack, lava cell or wall whose removal doesn't change the
fewest pushes; the border never counts, since it is required and wall versus
infinite lava doesn't matter where it changes nothing), and at least one unusual event. Run it with, for example:

```sh
node experiments/find-levels.js --seed 1 --restarts 10 --steps 400 --top 10 --verbose 1
```

The filters and score weights are guesses to be tuned by playing the results.
The first long run (six seeds, 110 minutes each, about 870,000 levels) is written
up in `experiments/results/2026-09-21-ring-search.md`, with the data alongside. Its
main finding: the tightness filter (slack of at most 2) is the bottleneck, so only
11 levels passed, and many of those were very punishing (six had 90% or more of
their positions already lost). Four of them are levels 9 to 12 of the game.
Large state spaces are the main cost: stack-heavy boards can exceed the search's
state cap, and those levels are discarded.

### Rounds

A round is one generation pass plus its robe retrofits, kept in one directory,
`experiments/rounds/<date>-<name>/`:

- `D.json`: the **dry** puzzles, every seed's levels merged (duplicates collapsed)
  and ranked by score, as `d1`, `d2`, ...
- `R.json`: the **robe** versions, same index as D (`null` where a puzzle has none),
  so `r7` is the retrofit of `d7`.
- `raw/`: each seed's find-levels output and log. `round.json`: seeds, flags, the
  retrofit filters and counts. `verdicts.json`: exported from the harness, if any.

```sh
node experiments/round.js 2026-09-25-name --seeds 431-436 --jobs 6 -- \
  --restarts 1000 --steps 500 --top 40 --max-minutes 120 --slack off \
  --min-end-positions 2 --max-dead 0.9
node experiments/round.js 2026-09-25-name --merge   # rebuild D, R from raw/
```

Everything after `--` goes to `find-levels.js`. `--merge` also re-applies the retrofit
filters without regenerating; it re-ranks D, so ids can renumber (each entry has a
content `key`, which is what verdicts match on). The robe retrofit
(`experiments/robe-retrofit.js`) takes an essential floor cell that the dry
solution steps on once, turns it to lava and hands over the robe, then rejects the
result if it is **cheesable** (the crown's neighbour is reachable without spending
the robe), **walk-only** (the robe alone wins), or badly **timed** (the robe must be
spent after at least one push and before the last: earlier it is only a toll gate
in front of the dry puzzle, later only a hop over the crown's moat). The first
round is `2026-09-24-group4`: 27 dry puzzles, 4 robe versions.

## Ideas not yet decided

- Undo and restart: unlimited undo is the working default, but this is *(open)*.
