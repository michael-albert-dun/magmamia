# Procedural puzzle-level generation: methods, principles, and the "is this actually necessary?" problem

Research notes for Magma Mia!, September 2026. Written against the existing generator
(`src/generator.js` — `buildByReversal`, `buildByReversalWithPotion`), the exact solver
(`src/solver.js` — `analyse`), and the search harnesses (`experiments/find-levels.js`,
`experiments/mud-candidates.js`, `experiments/potion-candidates.js`).

The short version: reverse construction is a well-established technique and the bug we just
hit is a *known, named* limitation of it, not a quirk of our board. Rejection sampling
against a solver is the common answer, but it is the weakest of five known answers, and at
least two of the others are cheap enough to be worth adopting in a no-build-step JS hobby
project. The literature also has a direct warning about the potion specifically: "does the
solution use the potion" is a binary property, and binary properties are exactly the kind
of thing hill-climbing fitness functions cannot steer on.

---

## 1. The families of approaches

De Kegel & Haahr's [*Procedural Puzzle Generation: A Survey*](https://www.scss.tcd.ie/mads.haahr/papers/de-kegel-2020-transactions.pdf)
(IEEE ToG 12(1), 2020) is the best single map of the field, and its framing is worth
borrowing because it cuts the space along an axis that matters to us: **constructive vs.
generate-and-test**, and within generate-and-test, **direct vs. simulation-based
evaluation**.

> "Constructive algorithms generate the content once and are done, usually performing
> validity checks at different stages of construction... Generate-and-test techniques
> construct and test in a loop until a satisfactory candidate is found; here, evaluation
> occurs each time a complete candidate has been constructed."

And the important observation about the middle ground:

> "Some search-based algorithms, including answer set programming solvers... fall somewhere
> between constructive and generate-and-test algorithms. A search often creates, tests, and
> rejects partial or potential candidates *before they are fully generated*."

That last sentence is the one to underline. Our pipeline is constructive (reverse walk) with
whole-candidate generate-and-test bolted on top. Most of the good ideas below are about
moving the testing *inside* the construction.

### 1a. Reverse / backward construction

Very common, and the standard answer for push-puzzle solvability. In Sokoban it is the
"pull instead of push" trick: from a solved state, apply legal reverse moves; any state
reachable backwards is solvable forwards. Taylor & Parberry's
[*Procedural Generation of Sokoban Levels*](https://ianparberry.com/techreports/LARC-2011-01.pdf)
(LARC-2011-01 / CGAMES 2011) is the canonical citation, and they are explicit that the idea
predates them:

> "All of this is done in reverse compared to how Sokoban is played. The reason for this is
> to prevent the generator from having to consider invalid moves. Any state reachable when
> moving in reverse will be solvable when played normally."

abagames' [*Automatic Level Generation for Puzzle Games*](https://abagames.github.io/joys-of-small-game-development-en/procedural/puzzle_level.html)
treats reverse simulation as the default hobbyist recipe and notes it is "applicable in many
scenarios", with the caveat that you need an evaluator on top to "filter out clearly
unenjoyable levels".

**The documented pitfalls of reverse construction, in order of how much they bite us:**

1. **A random reverse walk gives an upper bound on solution length, not the true minimum.**
   The survey says it flatly, in the sliding-puzzle section:
   > "the number of moves used to play backward to a start layout could be greater than the
   > shortest path, so it is not necessarily a good metric for difficulty."

   This is exactly our bug, stated in the literature six years ago. Our recorded push count
   is a *witness*, not an optimum.

2. **Backward-legal does not imply forward-playable in games with extra state.** A
   [dev.to post-mortem of a one-day Sokoban generator](https://dev.to/yurukusa/i-built-a-procedural-sokoban-generator-in-one-day-heres-why-it-kept-making-unsolvable-levels-5191)
   puts it well: *"The algorithm guarantees the generated path is solvable. But it doesn't
   check whether the resulting grid allows the player to actually execute that path."* Their
   fix was a two-layer defence — in-generation deadlock rejection plus a push-reachability
   BFS — plus raising retries from 5 to 15. (Our engine's toppling/lava rules mean we are
   more exposed to this class than plain Sokoban, though `analyse()` catches it.)

3. **Reverse walks tend to over-open the board.** See §5.

### 1b. Generate-and-test with a solver (rejection sampling)

The oldest approach and still the most common. Murase et al. (1996) generated Sokoban levels
from templates plus random item placement, then ran BFS for solvability, then a second
evaluator that "checks solution length, number of direction changes, and number of detours"
to throw out "trivial, and uninteresting, albeit legal, levels" (per the survey's summary).
The documented weakness is that the solver's cost caps the achievable complexity: BFS "will
only manage to solve puzzles with short solution sequences, so those with long sequences were
incorrectly discarded."

Sudoku generation is the cleanest, most widely-copied instance of the pattern, and it is
worth studying because it solves *our* problem in a domain where it is tractable: start from
a filled grid, remove a clue, re-run a **counting** solver, and restore the clue if the
solution is no longer unique. Repeat until nothing can be removed — the result is a
*minimal* (or *irreducible*) puzzle: one where **every remaining clue is provably load-bearing**
([Glossary of Sudoku](https://en.wikipedia.org/wiki/Glossary_of_Sudoku),
[w3tutorials walkthrough](https://www.w3tutorials.net/blog/how-to-generate-sudoku-boards-with-unique-solutions/)).
That "remove it and see if anything changes" test is the general shape of a necessity proof,
and we already have one instance of it (`decorativePieces`).

### 1c. Search-based: GA / simulated annealing / hill-climbing on a fitness function

The survey's verdict: *"Search-based strategies are the most popular techniques, including
evolutionary search and hill-climbing."* Ashlock's evolutionary chess/chromatic maze
generators are the standard academic example, with exact minimum solution length computed by
dynamic programming as the fitness signal.

Two practitioner data points that are more useful than the papers:

- Juho Snellman's [*Writing a procedural puzzle generator*](https://www.snellman.net/blog/archive/2019-05-14-procedural-puzzle-generator/)
  (for his logic game *Linjat*) is the closest thing to a direct analogue of
  `find-levels.js`, and he tried the fancier options: *"None of these performed as well as
  the naive pool of hill-climbers"* compared against simulated annealing and genetic
  algorithms. He runs a pool of ~10 variants for 10k–50k iterations. So our
  random-restart + hill-climb choice is defensible on empirical grounds, not just
  simplicity.

- Sturtevant & Ota's [*Exhaustive and Semi-Exhaustive Procedural Content Generation*](https://www.cs.du.edu/~sturtevant/papers/sturtevant18epcg.pdf)
  (AIIDE 2018) is the counter-argument, and it is a serious one. For *Fling!*: of 35.6
  billion 10-piece boards, only 15 million (0.04%) have a unique solution. Their conclusion:
  > "the fitness landscape will likely be too sparse for evolutionary operations like
  > crossover to produce valid boards."

  If the levels we actually want are a ~0.04%-style needle, stochastic search may be
  systematically failing to find the best ones rather than merely being slow.

### 1d. Constraint-based / SAT / ASP (declarative)

The heavyweight option: describe the design space in logic and let a solver produce members
of it. Adam Smith's *Answer Set Programming for Procedural Content Generation* line of work
is the origin; Smith, Andersen, Mateas & Popović applied it to *Refraction* (FDG 2012), and
the decisive paper for our purposes is below in §2. The relevant property, per the survey, is
that constraint-based generators usually need no separate evaluation function "because those
formulate the suitability of puzzles as a property of the allowed solutions" — the quality
criterion is *inside* the search rather than a filter after it.

Realistically this is out of scope for a no-dependency browser project (it means clingo or a
SAT solver). But the *architecture* it implies is portable, and that's §2's punchline.

### 1e. Grammar / template-based

Two distinct uses:

- **Local texture.** Taylor & Parberry build empty rooms from 3×3 wall/floor templates with
  overlapping borders, "randomly rotated or flipped", specifically so that bad local
  configurations cannot arise: *"This overlap helps to create interesting levels by
  preventing some bad configurations from being generated."*
- **Global structure with ordering guarantees.** Joris Dormans' mission-then-space graph
  grammars, as shipped in *Unexplored* ([Gamasutra/GameDeveloper writeup](https://www.gamedeveloper.com/design/unexplored-s-secret-cyclic-dungeon-generation-),
  [BorisTheBrave's technical breakdown](https://www.boristhebrave.com/2021/04/10/dungeon-generation-in-unexplored/)).
  Relevant to §4.

### 1f. Exhaustive enumeration and retrograde analysis

Underrated and *directly applicable to us*, because our boards are small. Rather than sample
and test, enumerate the space (or the interesting slice of it) with a ranking/unranking
function, or do a full backward BFS over the reachable set so that **true distances are known
by construction**. Sturtevant & Ota found all uniquely-solvable 11-piece *Fling!* boards
(148.9 billion) in 4h13m with a domain-specific retrograde pass, and note:
> "generic solvers will not be able to match the efficiency of retrograde analysis."

Kartal, Sohre & Guy's [*Data-Driven Sokoban Puzzle Generation with Monte Carlo Tree Search*](https://motion.cs.umn.edu/pub/SokobanMCTS/DataDrivenSokobanMCTS.pdf)
(AIIDE 2016) sits between this and §1c: MCTS over *level-construction* actions, with an
"Evaluate level" terminal action, which means partial candidates are scored and abandoned
mid-construction. Same instinct as branch-and-bound.

---

## 2. The necessity problem: "did I accidentally make this skippable?"

This is a named, formalised problem, and the paper to read is
**Smith, Butler & Popović, [*Quantifying over Play: Constraining Undesirable Solutions in Puzzle Design*](https://adamsmith.as/papers/fdg2013_shortcuts.pdf) (FDG 2013)**.
It is short, practical for an academic paper, and its framing alone is worth the read.

Their vocabulary: a **shortcut solution** is "any gameplay a designer would find undesirable,
even when... what makes the shortcut undesirable is not a property literally relating to its
length." Their motivating anecdote is uncomfortably close to home — a Refraction level was
built to force practising `1/12 + 1/12`, with two distractor `1/6` sources added to trap a
misconception, and *"a player could use just one of the distracting 1/6 sources... to solve
the puzzle without practising addition at all."* Distractors handed the player a cheaper
route. Our randomly-placed walls and open floor do the same thing.

Their **taxonomy of how projects handle this** is the best available survey of our exact
question:

**(a) Soften the game so it doesn't matter.** Spelunky gives the player bombs and ropes, so
any level is passable regardless of what the generator did. Explicitly not available to us:
"the designer may not want to allow the player to alter the level through destructive
actions."

**(b) Reference agents.** Generate with a solver in the loop that produces *a* solution and
assume its properties characterise the level (Cloudberry Kingdom, Shaker et al.'s Mario).
The documented failure: *"Sometimes, a level will also admit alternate solutions that might
be nearly as likely to occur in human play as the reference solutions. When these realistic
alternative solutions differ dramatically, they undermine the use of the reference agent as
an informative model for a player."* **This is precisely the naive `buildByReversal`
failure.** The recorded reverse walk is a reference solution being treated as if it
characterised the level.

**(c) Minimal solutions.** Generate with a *known-minimum* solution length, which enforces
one genuine property over all solutions: they are all at least that long.
> "This is commonly done by employing a reference agent that produces guaranteed-optimal
> solutions... The Sokoban level generator by Taylor and Parberry applies this strategy in
> reverse, searching from a solved game state to find a guaranteed-distant game state and
> then naming that as the initial state."

Note what Taylor & Parberry actually do, because it is *not* a random reverse walk. Their
algorithm is three steps: build an empty room; place goals; **"Find the state farthest from
the goal state"** — i.e. "the state with the longest shortest path from itself back to the
goal", found by an exhaustive (iterative-deepening, twice) reverse search. Goal placement is
brute-forced over *every* combination of goal positions, and the best (farthest-farthest)
state over all goal placements is returned. The minimality is **constructive**: they never
have to reject a level for having a shortcut, because they computed the true distance in the
first place.

Two implementation details of theirs worth stealing:
- **Abstract the player position away.** "Any metric except for the move count allows us to
  abstract out the avatar position. Instead of keeping up with which square the avatar is in,
  we keep up with which group of contiguous floor squares it could reach. This abstraction
  provides a significant decrease in the time it takes to generate the set of further
  states." (Our `analyse()` is a BFS over pushes, so we likely already do this.)
- **Timeout with best-so-far**, and check candidate goal positions in shuffled order so an
  early stop still yields something reasonable.

**(d) Declarative design-space models with quantification over play.** The paper's own
contribution. The logical progression is worth writing out because it clarifies what each
of our loops is actually proving:

| Statement | Job | Complexity |
|---|---|---|
| `∃p. Form(p)` | make a well-formed level | NP |
| `∃s,p. Form(p) ∧ Solves(s,p)` | make a *solvable* level (level+solution pair) | NP |
| `given p, ∃t. Solves(t,p) ∧ ¬Concept(t,p)` | find a shortcut in a given level | NP |
| `given p, ∀t. Solves(t,p) ⟹ Concept(t,p)` | verify no shortcut exists | coNP |
| `∃s,p ∀t. Solves(s,p) ∧ (Solves(t,p) ⟹ Concept(t,p))` | **generate shortcut-free levels** | NP^NP-complete (2QBF) |

The practical consequence: shortcut-free generation is *genuinely harder* than generation or
verification alone, so the fact that this feels awkward to code is not our failure of
imagination. And critically, they argue **the naive pipeline is the wrong architecture**:

> "Simply combining them in a pipeline (where one proposes a stream of solvable puzzles and
> the other filters them by the presence of shortcut solutions) would be unsatisfactory.
> First, there would be enormous inefficiencies when the synthesis tool continually proposes
> variations on a common idea that the analysis tool could determine to always fail for the
> same reason — **the pipeline system would not learn from its mistakes.** Secondly, when the
> concept we wanted to require in all solutions was not actually enforceable... this lack of
> feedback would force the synthesis tool to completely enumerate the space of puzzles before
> reporting that our request was unsatisfiable."

That is a description of our bounded-retry loops. What their disjunctive ASP solver does
instead:

> "two CDNL-based solvers, called the 'generator' and the 'tester', collaborate...
> **Counterexamples found by the tester become nogoods for the generator**, allowing the
> generator to internally reject future candidates that would fail for the same reasons. As a
> result, a vast number of calls to the tester are eliminated compared to a pipelined
> architecture."

**So: rejection sampling against a solver is the standard answer, and it is also the answer
the state of the art explicitly identifies as the inefficient one.** The smarter options,
ranked by how cheap they'd be for us:

1. **Constructive minimality** (Taylor & Parberry): compute the true distance during
   generation instead of asserting it afterwards. Turns rejection into *selection*.
2. **Counterexample-guided repair** (Smith et al.): when the tester finds a cheaper route,
   use *that route* to constrain the next attempt, rather than restarting blind.
3. **Incremental / monotone construction** (Snellman, below): verify after every step, and
   design the step set so later steps cannot invalidate earlier guarantees.
4. **Structural gating** (Dormans, §4): make the bypass physically impossible rather than
   checking for it.
5. **Exhaustive enumeration** (Sturtevant & Ota): for small boards, just enumerate the
   sub-space that matters.

On (3), Snellman's Linjat generator interleaves solver and generator — run the solver until
it is stuck, add the minimum information needed to let it proceed, repeat — and states the
governing invariant:

> "This method works only if the new information that's being added can't invalidate any of
> the previously made deductions."

We have already discovered a *local* version of that invariant: the `proposeSoakStep`
comment notes that only virgin floor is used "so an arbitrary depth here can never clobber
another step's bookkeeping". The shortcut bug is the same invariant violated at the *global*
level — later construction (walls, remaining open floor, goal placement) invalidates earlier
steps' necessity.

---

## 3. How difficulty and quality actually get measured

**Metric choice matters more than metric tuning.** Taylor & Parberry's discussion is the
single most useful half-page in the Sokoban literature. They consider four distance metrics
and reject three:

- *Move count*: "does not work very well. Just making a large labyrinth with only one obvious
  solution will still give a high distance, but will be fairly trivial in the end."
- *Box pushes*: "A level that required the player to push boxes down long hallways would give
  a high score, but again would not be difficult, just tedious."
- *Box lines* (consecutive pushes of the same box in the same direction count once): "the
  number of box lines corresponds fairly well with the difficulty of the resulting level" —
  this is what they use.
- *Box changes* (how many times the player switches which box they are pushing): "may be an
  even better measure of difficulty."

We currently optimise push count, which is their *second* metric — the one they explicitly
call tedious rather than hard. A "stack changes" term (how many times the player stops
pushing one stack and starts another) is cheap to extract from `analyse()`'s path and is the
metric two independent sources rate highest.

**Depth vs. width.** Snellman's framing is the most actionable: prefer solutions that are
> "deep and narrow: there's a long dependency chain of moves from start to finish, and at any
> one time there are only a few ways of moving forward."

He scores solution-tree depth (number of deduction layers) against maximum width (moves
available at any layer). Taylor & Parberry's board-shape filters are a crude version of the
same idea, arrived at empirically: they discard any room containing a 4×3 or larger open
floor region because such levels "tend to make levels with very bushy, but not very deep
state spaces. This makes it very hard to generate the level, but not much harder to solve
it."

**Dependency as the source of uniqueness.** Sturtevant & Ota give the cleanest statement of
why a tight solution is tight:
> "If there is a unique solution to a particular puzzle, each action will depend on the
> previous action in some way. If an action does not depend on the previous action, then that
> action could have been performed prior to the previous action, and there would be more than
> one unique solution to the board."

Their evaluation function is the *ratio* between the brute-force search tree size and the
size of the tree an expert (who knows about this reorderability) would search — i.e. reward
levels where domain knowledge helps a lot.

**Other metrics in use:**
- *Congestion* (Kartal et al.): a weighted sum over boxes/goals/obstacles in the bounding
  region, tuned against user-study data. They deliberately excluded features "based on an
  optimal solution, as finding an optimal solution is a PSPACE-complete problem" — they
  needed a fast proxy for MCTS rollouts. We don't need the proxy; we can afford the real
  solver at our board size, which is an advantage worth keeping.
- *Pattern-database hardness + novelty* (Bento, Pereira & Lelis,
  [*Procedural Generation of Initial States of Sokoban*](https://www.ijcai.org/proceedings/2019/0646.pdf),
  IJCAI 2019). Their headline finding on search: *"novelty is essential for generating a
  diverse pool of solvable instances from which hard ones can be selected."* They beat human
  expert designers on instance hardness.
- *Entropy / solution information* (Shen & Sturtevant,
  [*Generalized Entropy and Solution Information for Measuring Puzzle Difficulty*](https://webdocs.cs.ualberta.ca/~nathanst/papers/shen24information.pdf),
  AIIDE 2024 best paper): models solving as communication — difficulty is the number of bits
  an oracle must give a player of a given skill to get them to the goal. Positively
  correlated with user ratings. This is the principled version of "branching factor".
- *Number of reachable states* correlates strongly with difficulty in Fling! (per the
  survey) — our `states` figure is already a proxy for this.

**Mapping onto `find-levels.js`.** Our fitness function is already doing most of what the
literature recommends, under different names:

| Our term | Literature analogue |
|---|---|
| `pushes` | solution length — but the *weakest* of the four Sokoban metrics |
| `optimalCount` / `essentialSolutions` (log penalty) | solution uniqueness; `essentialSolutions` (differing by more than push *order*) is exactly Sturtevant & Ota's reorderability insight |
| `slack` (blocks left over in any winning state) | red-herring / unused-content detection |
| `decorativePieces` (remove a piece, does anything change?) | Sudoku minimality / irreducibility testing |
| `criticalStates` (≥3 legal moves, 1 live edge) | forced-move chokepoints; "deep and narrow" |
| `deadFraction` | state-space shape; the "bushy but shallow" guard |
| `nearEndStates` | near-optimal alternate endings — robustness of uniqueness |

The two genuine gaps are (i) no dependency/direction-change metric (box lines / box changes /
stack changes), and (ii) no diversity or novelty pressure in the search — the `found` map
keeps the highest-scoring candidates, which is what Bento et al. found insufficient.

**One warning that generalises beyond logic puzzles**, from Snellman: uniqueness itself can
*trivialise* a puzzle, because a player who knows the solution is unique can deduce moves
from uniqueness alone rather than from the mechanics. He handles it by heavily penalising
moves that depend on uniqueness, and by adding disambiguating information. Our analogue: if
there is exactly one stack that *could* be relevant, the player solves by elimination rather
than by understanding toppling.

---

## 4. Combining mechanics, and forcing a one-shot resource

This is where the literature has the most specific thing to say about the potion, and it is
a warning rather than a recipe.

**The warning.** Smith et al., in the middle of praising the minimal-solution strategy:

> "Attempting to apply this technique to a **binary property** (e.g. the player takes a
> critical action or they do not) yields a **degenerate metric that lacks the informative
> gradients** on which many optimization algorithms rely when searching large design spaces."

"Does the solution use the potion" is exactly that binary property. Adding a
`score -= 15 if !usesPotion` term to a hill-climber gives it a cliff, not a slope: it cannot
tell a candidate that is one wall away from forcing the potion from one that is hopeless. The
fix is to find a *graded* surrogate. The obvious one: **solve the level twice, with and
without the potion available**, and score on the *difference*. `Δ = pushes_without − pushes_with`,
with `∞` (unsolvable without) as the maximum. That gives a real gradient ("the potion saves
you 1 push" → "3 pushes" → "the level is impossible without it"), it is a direct necessity
proof rather than an inference from a recorded construction, and it costs one extra
`analyse()` call.

This is also the general pattern for multi-mechanic generators, and it is the Sudoku
minimality test applied to a *mechanic* rather than a clue: **ablate the mechanic and re-solve**.
If the level is no worse without it, the mechanic is decoration. It extends to mud/waterlogged
blocks, dancefloor cells, and any future mechanic, uniformly, and it is stronger than our
`events`-based `REQUIRE_EVENT` check (which asks whether the intended solution *uses* a
mechanic, not whether *every* solution must).

**The declarative framing.** In Refraction terms, the potion is a `Concept` predicate and
what we want is `∀t. Solves(t,p) ⟹ UsesPotion(t)`. Our `analyse()` already enumerates
optimal solutions, so we can evaluate this directly over the optimal set — with the caveat
that "every *optimal* solution uses the potion" is weaker than "every solution uses it". A
player who doesn't mind taking extra pushes can still skip it. Whether that matters is a
design call: for a level where the potion is the *point*, the ablation test ("unsolvable
without") is the property to require, not "all optimal solutions use it".

**Structural gating: make the bypass impossible rather than checking for it.** This is where
the lock-and-key dungeon literature applies. Dormans' cyclic generation (shipped in
*Unexplored*) separates the **mission graph** from the **space**, and maintains the ordering
relation as an explicit edge in the graph while the layout is shuffled around it:

> "Keys have a special edge pointing to their corresponding Lock, so even as the two nodes
> are shuffled and moved around the graph, they can always be kept consistent."

> "Most of the cycles involve placing keys, doors and one way 'valves' to force player
> progress to follow a known plot."

The transferable principle: **generate the dependency structure first and embed the geometry
so it preserves that structure** — rather than generating geometry and then hoping the
dependency survived. One-way valves are the blunt instrument: a construct the player can
traverse in only one direction cannot be part of a bypass. Magma Mia! has a natural one —
lava the player has crossed on a bridge they then can't re-make, or a stack pushed into a
position that can't be undone.

The geometric version of the same check is a **graph cut**: if the goal side of the board is
reachable from the start side in the dry-floor reachability graph *without* the intended lava
crossing, then the potion (or the crossing, or both) is optional by construction. Two flood
fills tell us that, and they are orders of magnitude cheaper than `analyse()` — a fast
*necessary condition* to run as a pre-filter before paying for the exact solver. Cheap
filter, expensive verify, in that order, is the general performance pattern here (Taylor &
Parberry do the same thing with their empty-room post-processing checks, discarding rooms
before ever entering the expensive search).

---

## 5. Known failure modes and lessons learned

**"The board is too open / too permissive."** Our exact bug, and it has a literature.
Taylor & Parberry's rule — discard any room with a 4×3 or larger contiguous open floor region
because it yields "very bushy, but not very deep state spaces" — is the same diagnosis from
the other direction: open space supplies unintended routes. They also discard floor tiles
surrounded on three sides by walls, since such tiles are "either obviously dead space... or
an easy place to get boxes out of the way."

Our `buildByReversal` starts from a fully-open `size × size` interior (default 6×6 = 36 open
cells) plus `interiorWalls` defaulting to **3**. That is a very open board by Taylor &
Parberry's standard — it contains many 4×3 open regions — and "goal placed anywhere in the
reachable region of a cleared board" on such a board is close to a worst case for
unintended-route supply. The structural fix used by every template-based generator is to
**invert the polarity**: start solid and carve, rather than start open and sprinkle walls.
Under a carve-only discipline, a route that the construction did not create does not exist,
which converts the necessity property from something to be tested into something closer to
an invariant.

**The pipeline doesn't learn.** Smith et al., quoted in §2. Our bounded retries restart with
fresh randomness and discard everything learned from the failure.

**Bounded retries silently bias the output distribution.** Not in the literature as such, but
implied by it: if hard-to-make-necessary configurations are dropped after N attempts, the
shipped level set is biased towards whatever is *easy* to make necessary. Taylor & Parberry
handle the analogous problem by using a timer and returning the best result so far, with
candidate goal positions *checked in shuffled order* specifically so that an early stop still
yields something representative rather than something biased by iteration order. Worth
logging our per-segment rejection rate as a generator health metric — Michael Cook's
Danesh-style argument that generators need instrumentation applies.

**Sparse design spaces defeat stochastic search.** Sturtevant & Ota's 0.04% figure. If the
levels we want are that rare, random restart + hill climbing may be missing them rather than
merely finding them slowly. Their remedy is exhaustive or **semi-exhaustive** generation:
enumerate with ranking/unranking, and use branch-and-bound so that a partial candidate
already scoring below the best-so-far is abandoned mid-construction.

**Solver cost caps achievable complexity, in a way that is easy to miss.** Murase et al.'s
generator silently discarded the *good* levels: "BFS will only manage to solve puzzles with
short solution sequences, so those with long sequences were incorrectly discarded." Any
truncation in `analyse()` (we have a `truncated` flag) is a potential instance of this — it
throws out the deep levels preferentially.

**Uniqueness can backfire** (Snellman, §3).

**Feedback is about progression, not individual levels.** Snellman: *"Common negative feedback
focused on difficulty progression rather than individual puzzle quality."* A generator that
produces individually-excellent levels with no ordering still feels bad. Relevant to the
level-select / casual-easy-mode work.

**And the one lesson he'd act on first:** *"One thing I'd definitely do differently the next
time around is to do adversarial playtesting from the start."* I.e. hunt for the cheat
*while* building the mechanic, not after — which is, verbatim, the session we just had.

---

## 6. Principles we might be missing

Concrete, in rough order of value-per-hour.

**1. Let `analyse()` place the goal, instead of verifying the goal after the fact.**
This is the big one, and it is Taylor & Parberry's whole algorithm. Right now
`buildByReversalWithPotion` picks a goal from a reachable region and then rejection-samples
until the recorded push count happens to be the true minimum. Invert it: run one BFS from the
constructed start state and read off the true optimal push count *to every reachable player
position at once*, then pick the goal cell that maximises it (or that hits a target band).
`analyse()` is already a BFS over pushes, so a single pass with distance labelling gives the
answer for every candidate goal simultaneously — **one solver call replaces the entire retry
loop**, the recorded distance is minimal by construction, and we get a *better* level (the
farthest goal) rather than merely an acceptable one. This also eliminates the
snapshot/rollback machinery for the goal-placement phase.

**2. Replace restart-from-scratch with counterexample-guided repair.**
When `analyse()` reports a cheaper route than the recorded one, we currently throw the segment
away. Instead, extract the cheaper solution's path (we already have `result.path`), diff it
against the intended push sequence, and mutate *on the bypass*: place a wall or lava on a cell
the bypass uses and the intended route does not, or move the goal off the bypass's side. This
is the hobbyist version of "counterexamples become nogoods", it preserves the work already
done, and it converges in a handful of targeted edits where blind restart needs many.
Bounded retries then become a fallback rather than the primary mechanism.

**3. Verify incrementally, not per-segment.**
Per-segment verification still discovers at step 12 something that was already broken at step
3. Checking necessity every *k* reverse steps (or after every step, if `analyse()` is fast
enough at these sizes — worth benchmarking with `bench.js`) costs more solver calls but each
failure is cheap to recover from, and it converts an O(segment) rollback into an O(1) one.
This is also EPCG's branch-and-bound idea: abandon a partial candidate the moment its partial
evaluation is already worse than what we have.

**4. Flip the board polarity: carve floor out of solid, don't sprinkle walls into open floor.**
A 6×6 fully-open interior with 3 walls is a route-rich board by any published standard, and
it is the root cause of "goal placed on a fully-cleared board is too permissive". A
`buildByReversal` variant that starts every interior cell as wall and marks only the cells
the reverse walk actually touches as floor (plus a controlled budget of extra openings for
breathing room and manoeuvring space) makes unintended routes structurally rare rather than
something to test for. Compare Taylor & Parberry's templates plus their 4×3-open-region
rejection. This is the highest-leverage change to the *generator* as opposed to the
verification around it.

**5. Prove the potion is necessary by ablation, and score the ablation gap, not a flag.**
Add to the evaluator: solve the candidate with the potion available and again with it
unavailable. Require unsolvable-without (strict gating) or score on
`Δpushes = pushes_without − pushes_with` (graded gating). This:
- is a *proof* of necessity over all solutions, not an inference from the construction, so it
  makes the whole reverse-construction necessity question moot for the potion specifically;
- gives the hill-climber a gradient, avoiding the degenerate-binary-metric trap Smith et al.
  warn about, which is likely why `REQUIRE_EVENT`-style terms are hard to steer on;
- generalises immediately to mud/waterlogged blocks and dancefloor cells — one ablation
  harness for every mechanic, replacing per-mechanic `events` bookkeeping;
- costs exactly one extra `analyse()` call.

**6. Add a cheap graph-cut pre-filter before the expensive solver call.**
Before calling `analyse()` on a potion candidate, flood-fill the dry-walkable region from the
start. If the goal is already reachable without crossing lava, reject immediately — no solver
needed. More generally, articulation-point analysis on the dry-floor graph tells us whether
the intended crossing is a genuine bottleneck. Cheap necessary conditions first, exact solver
second, is the standard structure and would cut the cost of the retry loops we keep.

**7. Change the primary fitness metric from pushes to something dependency-flavoured.**
Push count is the metric Taylor & Parberry explicitly call "tedious rather than difficult".
Add a **stack-changes** term (how many times the optimal solution switches which stack it is
pushing) and/or a **push-lines** term (consecutive pushes of the same stack in the same
direction count once) extracted from `result.path`. Both are a few lines, and both are rated
above raw push count by every source that compared them. Keep `pushes` as a floor
constraint, not the headline reward.

**8. Add diversity pressure to the search, not just score pressure.**
`find-levels.js` keeps top-scoring candidates; Bento et al. found novelty "essential" and
Sturtevant & Ota found that high-quality regions can be too sparse for score-only stochastic
search to reach. Cheap version: key the `found` archive by a behaviour descriptor — e.g.
`(pushes bucket, essentialSolutions, events set, criticalStates bucket)` — and keep the best
candidate *per cell* rather than the global top-N. That is MAP-Elites in about fifteen lines
and it directly attacks "hill climbing keeps rediscovering the same idea".

**9. Consider semi-exhaustive enumeration for the small sizes.**
For 5×5 or 6×6 with a fixed wall layout, the space of goal and potion placements is tiny.
Enumerating it exhaustively and taking the best is strictly better than sampling it, and it
also tells us the *true* rate of good levels — which is the number that would settle whether
hill-climbing is missing gems or there simply aren't any.

**10. Instrument the rejection loops, and turn the cheats into tests.**
Log per-segment rejection rates and reasons; a rejection rate that drifts is the earliest
signal that a new mechanic has opened a new class of bypass. And per Snellman's one regret:
every shortcut we find by hand should become a case in `tests/` — an assertion that a
specific known-bypassable board *is* reported as bypassable — so the next mechanic's
interaction with it gets caught by `node --test` rather than by a play session.

---

## Sources

- De Kegel & Haahr, [*Procedural Puzzle Generation: A Survey*](https://www.scss.tcd.ie/mads.haahr/papers/de-kegel-2020-transactions.pdf), IEEE Transactions on Games 12(1), 2020 — the field map; the "backward play length ≥ shortest path" warning.
- Smith, Butler & Popović, [*Quantifying over Play: Constraining Undesirable Solutions in Puzzle Design*](https://adamsmith.as/papers/fdg2013_shortcuts.pdf), FDG 2013 — **read this one**. Shortcut taxonomy, the NP^NP formulation, why pipelines don't learn, counterexamples-as-nogoods, the binary-property gradient warning. (Mirror: [grail.cs.washington.edu](https://grail.cs.washington.edu/wp-content/uploads/2015/08/smith2013qop.pdf))
- Taylor & Parberry, [*Procedural Generation of Sokoban Levels*](https://ianparberry.com/techreports/LARC-2011-01.pdf), LARC-2011-01 / CGAMES 2011 — constructive minimality via farthest-state search; the four distance metrics; board-shape rejection rules. Project page: [ianparberry.com/research/sokoban](https://ianparberry.com/research/sokoban/). A reimplementation: [github.com/campbelljc/sokoban](https://github.com/campbelljc/sokoban).
- Sturtevant & Ota, [*Exhaustive and Semi-Exhaustive Procedural Content Generation*](https://www.cs.du.edu/~sturtevant/papers/sturtevant18epcg.pdf), AIIDE 2018 — sparse-space argument, retrograde analysis for unique solutions, action-dependency as the source of uniqueness, branch-and-bound over partial content.
- Snellman, [*Writing a procedural puzzle generator*](https://www.snellman.net/blog/archive/2019-05-14-procedural-puzzle-generator/), 2019 — the best practitioner write-up: interleaved generator/solver, the non-invalidation invariant, deep-and-narrow scoring, pool-of-hill-climbers beating SA and GA, uniqueness backfiring, adversarial playtesting as the top lesson.
- Kartal, Sohre & Guy, [*Data-Driven Sokoban Puzzle Generation with Monte Carlo Tree Search*](https://motion.cs.umn.edu/pub/SokobanMCTS/DataDrivenSokobanMCTS.pdf), AIIDE 2016 — MCTS over construction actions; user-study-derived difficulty features (congestion).
- Bento, Pereira & Lelis, [*Procedural Generation of Initial States of Sokoban*](https://www.ijcai.org/proceedings/2019/0646.pdf), IJCAI 2019 — PDB hardness metrics; novelty as essential for diverse pools; beats human expert designers.
- Shen & Sturtevant, [*Generalized Entropy and Solution Information for Measuring Puzzle Difficulty*](https://webdocs.cs.ualberta.ca/~nathanst/papers/shen24information.pdf), AIIDE 2024 (best paper) — difficulty as bits an oracle must communicate.
- abagames, [*Automatic Level Generation for Puzzle Games*](https://abagames.github.io/joys-of-small-game-development-en/procedural/puzzle_level.html) — hobbyist-scale reverse simulation plus evaluator, with concrete tweaks to avoid over-walling.
- [*I Built a Procedural Sokoban Generator in One Day. Here's Why It Kept Making Unsolvable Levels*](https://dev.to/yurukusa/i-built-a-procedural-sokoban-generator-in-one-day-heres-why-it-kept-making-unsolvable-levels-5191), dev.to — backward-legal ≠ forward-playable; two-layer defence; retry counts.
- [*Unexplored's Secret: Cyclic Dungeon Generation*](https://www.gamedeveloper.com/design/unexplored-s-secret-cyclic-dungeon-generation-) (Joris Dormans, Game Developer) and BorisTheBrave's [*Dungeon Generation in Unexplored*](https://www.boristhebrave.com/2021/04/10/dungeon-generation-in-unexplored/) — mission-graph-before-space, key→lock edges preserved through layout, one-way valves as bypass prevention.
- [Glossary of Sudoku](https://en.wikipedia.org/wiki/Glossary_of_Sudoku) (minimal/irreducible puzzles) and [How to Generate Sudoku Boards with Unique Solutions](https://www.w3tutorials.net/blog/how-to-generate-sudoku-boards-with-unique-solutions/) — the canonical remove-and-recheck minimality loop.
- Collette, Raskin & Servais on hard Rush Hour configurations, and Servais' *Finding hard initial configurations of Rush Hour with binary decision diagrams* — symbolic/BDD computation of reachable configuration sets; the observation that a long solution is still easy if few moves are available at each step. (Cited via De Kegel & Haahr; see also [Procedural Generation of Rush Hour Levels](https://www.lamsade.dauphine.fr/~cazenave/papers/RushHour.pdf).)
</content>
</invoke>
