# The floor is lava (working title)

A box-pushing puzzle on a grid. Blocks are stacked, not slid: pushing a stack
topples it, and the fallen blocks are used to bridge lava.

This is an early design sketch. Anything marked *(open)* is undecided.

## The board

Play is on a rectangular grid. Each cell is in exactly one of these states:

- **Floor**: can be walked on.
- **Lava**: has a depth (1 or more). Walking onto lava is fatal.
- **Stack**: a pile of blocks with a height (1 or more), standing on floor.
- **Wall**: immovable and impassable.

The edge of the board is a rim of lava of infinite depth. It is not a wall.

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

By default, walking onto lava is fatal and the level restarts. A setting will
allow a gentler mode in which that move is simply refused instead.

## Pushing

Moving into a stack pushes it, and the stack topples away from the player.

- A stack of height *h* lays its blocks one per cell along the next *h* cells in
  the push direction.
- A block landing on **floor** adds 1 to that cell's height (a new stack of 1).
- A block landing on another **stack** adds 1 to its height. The stack does not
  topple in turn.
- A block landing on **lava** makes it 1 shallower and is used up. Lava at depth
  0 has become floor, not a stack.
- A block landing on the board's edge (the infinite lava) is lost. So a stack can
  be pushed off the edge, destroying its blocks.
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

- **Floor**: greyish.
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
- Walls and the player are minimal placeholders for now; their look is a later
  decision.

## Objective

Levels can have different kinds of goal, chosen per level:

- Reach a particular cell (probably the first kind to build).
- Clear all the lava.
- Clear all the lava and all the blocks.

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
belongs to the character before it.

## Levels

Levels will be generated with a solver, and probably also handmade, so there'll
be a mix. Whether to score a level against a par or against what the player has
achieved is *(open)*.

The board is bigger than in the other games, since interesting levels need room.
Either it scrolls on a phone, or the game is desktop-only. A default around 8
wide by 12 tall is the starting guess; the size should be a parameter rather than
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

The page is a rules test bench, not the real game yet. It has preset levels, a
box to type in your own level text, an objective picker, a setting for whether
lava is fatal, unlimited undo, and restart. Controls are the arrow keys or WASD
(Z to undo, R to restart), the on-screen arrows, or clicking a cell next to the
player.

## Files

- `src/engine.js`: the rules, with no DOM: level parsing and printing, `move`,
  and objective checks. Also loadable from Node with `require`.
- `src/levels.js`: the preset levels.
- `src/game.js`, `index.html`, `styles.css`: the test bench UI.
- `tests/`: run with `node --test tests/`. `tests/solve.js` is a breadth-first
  solver used to check that every preset level is solvable.

## Ideas not yet decided

- Undo and restart: unlimited undo is the working default, but this is *(open)*.
- A new name. (The repository directory is still `soakaway`.) Naming is deferred.
