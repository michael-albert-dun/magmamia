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
- **Infinite lava**: the ordinary lava colour, marked with ∞ where real lava shows
  its depth. On a closed board it forms the border, alongside any border walls.
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
| `A` to `Z` | stack of height 1 to 26 |
| `@` | the player, standing on floor |

So `a` is depth-1 lava and `C` is a stack of height 3. Depths and heights are
capped at 26. The worked example above is the row `@Eba.#` before the push and
`.@a.C#` after it.

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

## Levels

Levels will be generated with a solver, and probably also handmade, so there'll
be a mix. Whether to score a level against a par or against what the player has
achieved is *(open)*.

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

`index.html` is the game: a short set of curated "reach the crown" levels, a level
picker (solved levels are remembered in the browser), undo, restart, and a
collapsed how-to-play. `bench.html` is the rules test bench: type in any level,
pick the objective, and try things out. Controls are the arrow keys or WASD (Z to
undo, R to restart), the on-screen arrows, or clicking a cell next to the player.

## Files

- `src/engine.js`: the rules, with no DOM: level parsing and printing, `move`,
  and objective checks. Also loadable from Node with `require`.
- `src/solver.js`: exact push-level solver and level analysis (see "Finding
  levels"). Also loadable from Node.
- `src/levels.js`: the test bench presets and the curated levels for the game.
- `src/render.js`: board drawing shared by both pages.
- `src/play.js`, `index.html`: the game. `src/bench.js`, `bench.html`: the bench.
- `styles.css`: styles for both pages.
- `experiments/find-levels.js`: the level search. `experiments/results/`: what its
  runs have found.
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
no decorative pieces (a stack, lava cell or wall whose removal doesn't change the
fewest pushes; a border wall counts too, replaced by infinite lava), and at least one unusual event. Run it with, for example:

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

## Ideas not yet decided

- Undo and restart: unlimited undo is the working default, but this is *(open)*.
