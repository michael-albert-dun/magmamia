# Ring-model level search, 2026-09-21

Six seeds (101 to 106) of `experiments/find-levels.js` ran for 110 minutes each on the
border-ring board: a 6 by 6 interior inside a ring whose cells are each infinite
lava (`~`) or wall (`#`), 8 by 8 in all. About 870,000 levels were evaluated and
**11** passed the filters (at least 6 pushes, slack of at most 2, at most 3 optimal
solutions, no decorative pieces, at least one unusual event). Every one was
re-verified at a 400,000-state cap, has a closed border, and has no inert piece.

Data: [2026-09-21-ring-search.json](2026-09-21-ring-search.json).

## Why so few passed

Tightness was the bottleneck. Of the 1,943 restarts whose best level got as far
as full analysis, about 1,900 failed on slack above 2, and slack was the *only*
failing filter for 1,584 of them. The median best slack was 4. The other filters
together rejected far fewer. So the "tightish" requirement, not the search
length, limits the yield; allowing slack up to 3 would probably help a lot.

## Most are very punishing

Six of the 11 have 90% or more of their reachable positions already lost, up to
99%. The score only gave a small capped bonus for dead ends, so the search drifted
into them. A penalty above about 85% is the obvious next change.

## The levels, gentlest first

Dead-end share is the fraction of reachable positions from which the goal can no
longer be reached. Slack is the most blocks that can be left over in any winning
position. "Sol" is the number of distinct optimal push sequences.

| Level | Seed | Pushes | Sol | Slack | Dead ends | Search size | Events |
| --- | --- | --- | --- | --- | --- | --- | --- |
| #11 | 103 | 7 | 1 | 0 | 65% | 55 | edge |
| #6 | 103 | 10 | 1 | 0 | 73% | 70 | edge |
| #10 | 103 | 11 | 3 | 0 | 74% | 54 | edge |
| #9 | 105 | 8 | 1 | 0 | 84% | 1788 | stack |
| #8 | 101 | 9 | 1 | 1 | 85% | 2093 | edge, stack |
| #4 | 101 | 13 | 1 | 1 | 91% | 2202 | stack |
| #7 | 106 | 10 | 1 | 0 | 93% | 479 | stack, pile |
| #5 | 106 | 10 | 1 | 0 | 97% | 752 | pile, stack, edge |
| #2 | 101 | 12 | 1 | 0 | 98% | 5426 | stack, pile |
| #1 | 106 | 15 | 2 | 0 | 98% | 12859 | stack, edge, pile |
| #3 | 101 | 17 | 1 | 1 | 99% | 3333 | stack, edge |

Level numbers are the rank by search score. Boards, gentlest first:

### #11 (seed 103, 7 pushes, 65% dead ends)

```text
~~~~~~~~
~a.a...~
~BAaa*..~
~.aE.@.~
~a.....~
~......~
~......~
~~~~~~~~
```

### #6 (seed 103, 10 pushes, 73% dead ends)

```text
~~~~~~~~
~..#...~
~.#a*...~
~......~
~bC....~
~......~
#.Aa..@~
~~~~~~~~
```

### #10 (seed 103, 11 pushes, 74% dead ends)

```text
~~~~~~~~
~...#..~
~b.@C..~
~..a...~
~a*a....~
~......~
~......~
~~~~~~~~
```

### #9 (seed 105, 8 pushes, 84% dead ends)

```text
~~~~~~~~
~a*ca...~
~..cB..~
~A.....~
~b.....~
~......~
~@.....~
~~~~~~~~
```

### #8 (seed 101, 9 pushes, 85% dead ends)

```text
~~~~~~~~
~...a..~
~......~
~..@...~
~.Dd.c#~
~...c.*.~
~b...a.~
~~~~~~~~
```

### #4 (seed 101, 13 pushes, 91% dead ends)

```text
~~~~~~~~
~..cd..~
~...A..~
~ab*....~
~.a.#.a~
~..#.C@~
~......~
~~~~~~~~
```

### #7 (seed 106, 10 pushes, 93% dead ends)

```text
~~~~~~~~
~.....a~
~a...B.~
~A#b...#
~..#.a.~
~..a..b*~
~@.a...~
~~~~~~~~
```

### #5 (seed 106, 10 pushes, 97% dead ends)

```text
~~~~~~~~
~...c.a*~
~......~
~...aCc#
~....AB~
~..#.b.~
~...c.@~
~~~~~~~~
```

### #2 (seed 101, 12 pushes, 98% dead ends)

```text
~~~~~~~~
~b*#....~
~b...A.~
~.B.#A.~
~..b...~
~.b....~
~.@....~
~~~~~~~~
```

### #1 (seed 106, 15 pushes, 98% dead ends)

```text
~~~~~~~~
~a.a.b.~
~.C....~
~.Aa.ac*~
~B...a.~
~@#a...~
~a.....~
~~~~~~~~
```

### #3 (seed 101, 17 pushes, 99% dead ends)

```text
~~~~~~~~
~@.....~
~#....b~
~.Bcac.~
~....Da~
~..b...~
~..b..a*~
~~~~~~~~
```
