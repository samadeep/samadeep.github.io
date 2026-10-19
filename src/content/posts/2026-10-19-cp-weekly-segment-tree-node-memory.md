---
title: 'CP Weekly: What Should a Segment Tree Node Remember?'
description: 'Segment tree node design as a monoid: keep only what a block shows its neighbours. Grid connectivity with row updates, NAND folds and a max-min DP, tested.'
hook:
  stat: '497 wrong'
  caption: 'answers out of 16,779 when you check only the rows between the two cells. The path went around.'
date: '2026-10-19'
topic: algorithms
series: cp-weekly
tags: [cp-weekly, segment-tree, monoid, connectivity, dsu, function-composition]
problems:
  - { platform: AtCoder, id: 'AALC001 R', title: Connectivity, url: 'https://atcoder.jp/contests/aalc001/tasks/aalc001_r' }
  - { platform: AtCoder, id: 'AALC001 M', title: NAND, url: 'https://atcoder.jp/contests/aalc001/tasks/aalc001_m' }
  - { platform: AtCoder, id: 'ABC480 G', title: Zonal Score Minimization, url: 'https://atcoder.jp/contests/abc480/tasks/abc480_g' }
  - { platform: Codeforces, id: '811E', title: Vladik and Entertaining Flags, url: 'https://codeforces.com/problemset/problem/811/E' }
---

<aside class="tldr">

**TL;DR** A segment tree will happily store anything, as long as two neighbouring blocks can be glued into one. This week that "anything" was a function, a stack of running maxima, and a whole grid's worth of connectivity squeezed into two rows. The trick is always the same: forget the middle. Yes, all of it.

</aside>

Here's a grid of digits. Are the two 1s in row 2 connected, moving only through 1s?

```
row 1:  1 1 1
row 2:  1 0 1
row 3:  0 0 1
```

Obviously yes: up, across row 1, and down. Now make the grid 100,000 rows tall, let rows change between questions, and ask 50,000 questions. The natural plan is a segment tree over rows: to compare a cell in row *a* with a cell in row *c*, ask the tree about rows *a* through *c*. That plan answers "no" here, because the path leaves rows 2..2 and comes back.

On random small grids, that shortcut was wrong 497 times out of 16,779 queries. The fix isn't a smarter query. It's a better answer to the question in the title.

**Welcome to CP Weekly.** Each issue takes one idea from the week in competitive programming, builds it from the smallest example, and ends with the contest problem it cracks. This week AtCoder ran an unrated, 24-problem contest about nothing but segment trees[^aalc], and its announcement put the whole theme in one phrase: the information a tree can maintain depends on "the monoid" you choose[^cfblog]. So, what should a node remember?

<details>
<summary>Before you start</summary>

You need a working segment tree (point update, range query) and a disjoint set union (DSU). Good refreshers: cp-algorithms on [segment trees](https://cp-algorithms.com/data_structures/segment_tree.html) and the [AtCoder Library `segtree` docs](https://atcoder.github.io/ac-library/production/document_en/segtree.html).

| Symbol | Meaning |
|---|---|
| block | a contiguous range of positions (or rows); every tree node owns one |
| summary S(block) | what the node stores about its block |
| op(X, Y) | glue the summary of a block X to the summary of the block right after it |
| e | the summary of an empty block: op(e, X) = op(X, e) = X |
| W | grid width (at most 10 in this week's problem) |

</details>

## One number is not enough

Start with the classic. Each node should help answer "largest sum of a contiguous subarray in [l, r)". The tempting summary is just that number: the best sum inside the block. Try gluing two blocks:

```fig title="Storing only each half's best sum gives 3; the true best, 5, crosses the seam" alt="Two panels. Left panel, best only: block [-1, 3] with best 3 and block [2, -1] with best 2 glue into a box saying max(3, 2) = 3, marked wrong. Right panel, four numbers: block [-1, 3] stores sum 2, prefix 2, suffix 3, best 3; block [2, -1] stores sum 1, prefix 2, suffix 1, best 2; glued best is max(3, 2, suffix 3 + prefix 2) = 5, marked right."
panel "store only best"
row
a: box "[-1, 3]" body "best 3"
b: box "[2, -1]" body "best 2"
row
r: deny "glued: max(3, 2) = 3" span 2
a -> r
b -> r
panel "store sum, prefix, suffix, best"
row
c: box "[-1, 3]" body "sum 2  pre 2\nsuf 3  best 3"
d: box "[2, -1]" body "sum 1  pre 2\nsuf 1  best 2"
row
s: allow "glued best: max(3, 2, 3 + 2) = 5" span 2
c -> s
d -> s
```

The best subarray of [-1, 3, 2, -1] is 3 + 2 = 5, and it lives in neither half. A neighbour can't see a block's best interior answer; it can only extend the block's *edges*. So the block must also remember its best prefix, its best suffix and its total, and those four numbers are enough: every answer of the glued block is inside the left, inside the right, or a left suffix plus a right prefix.

```python
def glue(L, R):
    s1, p1, x1, b1 = L
    s2, p2, x2, b2 = R
    return (s1 + s2, max(p1, s1 + p2), max(x2, x1 + s2), max(b1, b2, x1 + p2))
leaf = lambda v: (v, v, v, v)
print(glue(glue(leaf(-1), leaf(3)), glue(leaf(2), leaf(-1))))   # (sum, prefix, suffix, best)
```

```
(3, 4, 4, 5)
```

That's the whole design rule in miniature. Ask: **when this block sits next to another, what can the neighbour observe?** Store exactly that, plus whatever you need to keep it correct after the next glue. The interior answer is a by-product.

`glue` also needs one property, or the tree's answer depends on how the range got split: (X·Y)·Z must equal X·(Y·Z). Associativity plus an empty-block identity is what makes a summary a **monoid**, and it's the only thing the AtCoder Library's `segtree` asks of you[^acl]. Notice it never asks for commutativity. Left and right matter.

> **Insight:** A segment tree node doesn't store an answer, it stores an interface. Design it by asking what a neighbouring block can see across the seam, and forget everything it can't.

## A grid block can only be seen through two rows

Back to the grid. A tree over rows means a node owns a band of rows L..R. What can a neighbouring band see? Only the band's top row and bottom row: any path that comes in from outside must cross one of them. So a node stores:

1. the digits of its top row and its bottom row, and
2. which of those 2W boundary cells are connected **using only rows L..R**, as a label per cell (same label, same component).

Everything strictly inside the band (100,000 rows of it at the root) is forgotten. Here's one two-row block:

```fig title="A block keeps 2W labels; the two top 1s share label A only because the bottom row joins them" alt="Left panel shows the block's cells. Top row: 1, 0, 1. Bottom row: 1, 1, 1. Vertical links join each top 1 to the 1 below it. Right panel is the stored summary card: top 1 0 1 with labels A B A, bottom 1 1 1 with labels A A A."
panel "rows L..R (the block)"
row
t1: allow "1"
t2: box "0"
t3: allow "1"
row
b1: allow "1"
b2: allow "1"
b3: allow "1"
t1 -> b1 "same digit"
t3 -> b3 "same digit"
b1 -> b2
b2 -> b3
panel "what the node stores"
row
n: main "summary" body "top: 1 0 1 | A B A\nbottom: 1 1 1 | A A A\nmiddle rows: forgotten"
```

```zsh
$ python3 boundary.py --node 101/111
block 101/111
  top row    1 0 1   labels A B A
  bottom row 1 1 1   labels A A A
```

Gluing an upper block onto a lower one is a small DSU over 4W cells: union cells that share a label inside the upper block, the same for the lower block, then walk the seam and union the upper block's bottom cell with the lower block's top cell in every column where the digits match. Read off the labels of the new top (the upper block's top) and the new bottom (the lower block's bottom), renumber them in order of first appearance, done.

```fig title="Two separate pillars of 1s become one component once glued above a block whose bottom row joins them" alt="Upper block 101 over 101 has labels A B C on both rows: two pillars of 1s and a pillar of 0s, all separate. Lower block 101 over 111 has top labels A B A and bottom labels A A A. An arrow labelled seam, columns 1 2 3 match, leads down to a DSU over 12 cells, then to the glued summary: top 1 0 1 labelled A B A, bottom 1 1 1 labelled A A A."
row
u: box "upper block" body "1 0 1 | A B C\n1 0 1 | A B C"
d: box "lower block" body "1 0 1 | A B A\n1 1 1 | A A A"
row
m: main "DSU over 4W = 12 cells" span 2
row
g: allow "glued: top 1 0 1 | A B A, bottom 1 1 1 | A A A" span 2
u -> m "labels + seam"
d -> m "labels"
m -> g "relabel"
```

```zsh
$ python3 boundary.py --glue 101/101 101/111
upper 101/101
  top row    1 0 1   labels A B C
  bottom row 1 0 1   labels A B C
lower 101/111
  top row    1 0 1   labels A B A
  bottom row 1 1 1   labels A A A
glued 101/101/101/111
  top row    1 0 1   labels A B A
  bottom row 1 1 1   labels A A A
```

The renumbering matters more than it looks: it makes equal summaries byte-for-byte equal, and it keeps every label below 2W, so a node is two strings and twenty small integers no matter how tall its band is.

<details>
<summary>Why gluing is associative</summary>

The labels of a block are exactly the connected components of the grid graph restricted to its rows, intersected with its boundary cells. Gluing X then Y, or Y then Z first, both describe the components of the graph on the rows of X, Y and Z together, restricted to the outer boundary: the DSU in each step only merges components that really are joined by a vertical edge across a seam, and every path inside the union of the bands crosses seams through boundary cells that some summary still remembers. Since the result is defined by the union graph and not by the order of gluing, the operation is associative. The identity e is "no rows", which the code represents as an empty flag. The random tests below check this end to end, not just the argument.

</details>

## The wrong query, and the right one

So you have a monoid. The obvious query for cells (a, b) and (c, d), with a ≤ c, multiplies rows a..c and checks whether the top cell b and the bottom cell d share a label. That's the 497-wrong-answers version. The summary of rows a..c only knows paths that stay inside rows a..c, and the opening grid's path goes up through row 1.

The fix is to ask the tree three questions and glue the answers yourself: rows above a, the band a..c, rows below c. That covers the whole grid, so every possible path is accounted for, and the question becomes "do band-top cell b and band-bottom cell d end up in the same set?"

```fig title="Answer a query from three range products, because a path may leave the band above or below" alt="Three stacked boxes: rows 1 to a minus 1 (above), rows a to c (the band, holding both cells), rows c plus 1 to N (below). Arrows between them are labelled seam. A side panel shows the trap grid: rows 2 to 2 only says No, gluing above, band and below says Yes, BFS says Yes."
panel "three products, glued in a 6W DSU"
row
up: box "rows 1..a-1 (above)"
row
band: main "rows a..c (both cells live here)"
row
dn: box "rows c+1..N (below)"
up -> band "seam"
band -> dn "seam"
panel "the opening grid, cells (2,1) and (2,3)"
row
w: deny "rows 2..2 only: No"
row
r: allow "above + band + below: Yes"
row
t: allow "BFS on the whole grid: Yes"
```

```zsh
$ python3 boundary.py --trap
grid (rows 1..3):
  1: 1 1 1
  2: 1 0 1
  3: 0 0 1
query: is (2,1) connected to (2,3)?  both are 1
  rows 2..2 only        : No
  above + band + below  : Yes
  BFS on the whole grid : Yes
```

That's this week's payoff problem, *Connectivity* (problem R of AAL Contest 001): N ≤ 100,000 rows of width W ≤ 10, Q ≤ 50,000 queries that either replace a whole row or ask whether two same-digit cells are connected[^taskR]. The official editorial by maspy uses exactly this summary (top row, bottom row, boundary connectivity) and exactly this three-part query[^edR]. Each glue costs O(W) DSU work, so an update is O(W log N) and a query is three range products plus one 6W DSU, also O(W log N).

## Does it hold up?

The C++ solution passes both samples, then gets compared with a BFS over the whole grid on 2,000 random grids (N from 2 to 10, W from 2 to 10, digits 0 and 1, with row updates mixed in). The same run counts how often the rows-a-to-c shortcut is wrong:

```zsh
$ ./stress.sh 2000
cases: 2000  queries: 16779  segment tree mismatches: 0  band-only wrong answers: 497
```

The first version of this test only used W up to 6, and passed. Widening it to W = 10 for the timing run crashed with `*** stack smashing detected ***`: the query's DSU covers 6W = 60 cells, and its array had been sized for the 4W = 40 of a glue.

-X- **query DSU sized 40, needs 6W = 60**

Guards that missed it: the samples (W = 5 and 7), 2,000 random cases with W ≤ 6, and `-Wall`. The guard that caught it: a run at the real limit, then AddressSanitizer to confirm the fix. Test at the constraint, not just near it.

Timed at the limits on one 2.8 GHz Xeon core, against the per-query BFS on its worst case (a grid of one digit, where BFS visits all 10⁶ cells):

```zsh
$ ./bench.sh
digits=2  N=100000 W=10 Q=50000 (34886 connectivity queries)
  segment tree: 0.949 s
  answers: 2 Yes, 34884 No
digits=1  N=100000 W=10 Q=50000 (34927 connectivity queries)
  segment tree: 0.567 s
  answers: 34927 Yes, 0 No
digits=1  N=100000 W=10 Q=300 (213 connectivity queries)
  BFS per query: 2.902 s
  segment tree:  0.118 s
  same answers
```

About 13.6 ms per BFS query, so 35,000 of them would need roughly 8 minutes (an extrapolation, not a run). The segment tree does the full input in under a second.

Every Python example above runs in your browser:

<div data-lab="py" data-src="/labs/cp-weekly-segment-tree-node-memory/boundary.py" data-args="--trap" data-presets="--trap|--node 101/111|--glue 101/101 101/111|--glue 111/101 001/111|--stress 300"></div>

The same "boundary profile" summary has an older home: Codeforces 811E, *Vladik and Entertaining Flags*, counts components in a range of columns of a grid with at most 10 rows, and its standard solution is a segment tree whose nodes keep the two boundary columns and their connectivity[^cf811e]. Same interface, turned on its side.

## Also this week

### When the block is a function

Problem M of the same contest, *NAND*: keep an array of 30-bit numbers under point updates, and for a query (l, r) start with B = A<sub>l</sub> and fold B ← NAND(B, A<sub>i</sub>) for i = l+1..r[^taskM]. NAND isn't associative, so there's no "sum" to store. What a neighbour sees of a block is how it *transforms* the incoming value, so store that. On one bit, a function {0,1} → {0,1} is just the pair (g(0), g(1)): an A-bit of 1 gives "not x" = (1, 0), an A-bit of 0 gives "always 1" = (1, 1). Composition is associative, so pairs form a monoid, and 30 bits ride along in two 30-bit masks with bitwise ops, which is the editorial's approach[^edM].

```fig title="Bit 1 of sample 1 (A = 5, 3, 12, 10): the range folds into one stored function, (0, 0), which sends the start bit 0 to 0" alt="A row of boxes for bit 1. Start: A1 = 5 has bit 0. Then three function boxes: A2 = 3, bit 1, not x, pair (1,0); A3 = 12, bit 0, always 1, pair (1,1); A4 = 10, bit 1, not x, pair (1,0). Arrows chain them. Below, one box: composed pair (0,0), applied to 0 gives 0, so bit 1 of the answer 1073741821 is 0."
row
s: peer "start: 5" body "bit 1 = 0"
f1: box "A=3" body "bit 1: not x\n(1, 0)"
f2: box "A=12" body "bit 0: always 1\n(1, 1)"
f3: box "A=10" body "bit 1: not x\n(1, 0)"
row
c: allow "composed (0, 0): 0 → 0, so bit 1 of 1073741821 is 0" span 4
s -> f1 "0"
f1 -> f2 "1"
f2 -> f3 "1"
```

```zsh
$ python3 nand.py --samples
sample 1: [1073741821, 1073741823, 12]  ok
sample 2: [1073741820, 1073741819, 6, 1073741813]  ok
sample 3: [1073741823, 536870911, 1073741823, 1073741823]  ok
$ python3 nand.py --stress 2000
random cases: 2000  mismatches vs direct fold: 0
```

Whenever an operation is applied left to right but isn't associative, the element is the wrong thing to store. The *function it applies* almost always is.

### When the summary is a monotonic stack

ABC480 G, *Zonal Score Minimization*: cut an array into pieces of length at least 2 and minimise the sum of (max − min) over pieces[^taskG]. The DP is dp<sub>i</sub> = min over j ≤ i−2 of dp<sub>j</sub> + max(A<sub>j+1..i</sub>) − min(A<sub>j+1..i</sub>), which is O(N²) as written. The editorial keeps a lazy segment tree indexed by the split point j, holding dp<sub>j</sub> + max − min for the current i, and lets two monotonic stacks tell it what changed[^edG]. When A<sub>i</sub> arrives, every stack block it pops is a run of j's whose maximum (or minimum) jumps to A<sub>i</sub> at once, so it becomes one range add:

```fig title="When A4 = 8 arrives in 1 4 2 8 7 9, two stack pops become two range adds over split points j" alt="Top row: the max-stack before i = 4 holds block j = 0..1 with max 4 and block j = 2 with max 2. Arrows labelled +4 and +6 go down to the bottom row: a single block j = 0..3 with max 8. Each popped block is one range add on the lazy segment tree."
row
p: box "j = 0..1: max 4"
q: box "j = 2: max 2"
row
r: allow "j = 0..3: max 8" span 2
p -> r "range add +4"
q -> r "range add +6"
```

Each element is pushed and popped once per stack, so there are O(N) range adds in total and the whole DP is O(N log N):

```zsh
$ ./zonal --stress
random cases: 20000  mismatches vs O(N^2) DP: 0
$ ./zonal --bench
N = 200000: stacks + lazy segtree 0.155 s, O(N^2) DP 44.3 s, same answer: yes
```

Same lesson from the other side: the tree only ever sees "add v on [l, r)" and "min on [l, r)". The stacks are what turn a messy recurrence into that clean interface.

### AtCoder tries rules for AI in heuristic contests

AtCoder ran an unrated *AHC GenAI Rules Trial Contest 2026* (15 to 18 October) to test proposed rules for generative AI in long heuristic contests[^ahc]. Under the trial rules, AI may help implement a solution, but choosing algorithms, neighbourhoods, evaluation functions and parameters must be the participant's own decision; participants must load organiser-supplied instructions into their AI tools (for example through an AGENTS.md or CLAUDE.md file); and AI usage logs are required where prizes or points are at stake. The rules are explicitly not yet adopted for regular AHCs; the trial exists to collect feedback.

### Everything else this week, in one line each

- **ABC480 F**, *Cake Cutting*: one cut changes "the most disjoint groups with sums divisible by T" by at most one, so the answer is M minus that maximum, found by a bitmask DP over subsets[^edF]. Summarised from the editorial, not implemented here.
- **ABC480 E**, *Product-Bounded Arithmetic Sequences*: the first term is at most N<sup>1/3</sup> and the length is O(log N), so enumerate both and binary search the common difference[^edE]. Summarised, not implemented.
- **AAL Contest 001**: the other 22 problems are a graded tour of what a node can hold, from inversion counts to k-th powers; problems R onward are flagged by the setters as needing real insight, not just knowledge[^aalc].

## How to recognise it next time

Every problem above fell to the same loop:

```fig title="Designing a node: picture two neighbouring blocks, list what crosses the seam, store only that, then check associativity on random splits" alt="Five boxes in a row joined by arrows: 1, two blocks side by side; 2, what can the neighbour see across the seam; 3, store that and nothing else; 4, write glue and an empty identity; 5, test glue against brute force on random splits."
row
a: box "1. Two blocks" body "side by side"
b: main "2. What crosses?" body "edges, boundary,\nthe function applied"
c: box "3. Store that" body "forget the middle"
d: box "4. glue + e" body "associative,\nleft ≠ right"
f: allow "5. Brute force" body "random splits"
a -> b
b -> c
c -> d
d -> f
```

| When the statement says… | The node probably stores… |
|---|---|
| "best contiguous …" (sum, run, segment) | the answer plus best prefix, best suffix and a total |
| an operation applied left to right that isn't associative | the function the block applies to its input |
| connectivity in a strip of width ≤ 10 or so | boundary rows (or columns) plus a DSU labelling of them |
| a DP whose cost is max or min over a range | a lazy tree over split points, fed range adds by monotonic stacks |
| the answer for [a, c] depends on cells outside [a, c] | three products (before, range, after), glued yourself |

When you catch yourself storing "the answer" in a node, picture the neighbour and ask what it can see. The opening grid's two 1s were connected the whole time. The band of rows between them just couldn't see the path, because nobody had told it to remember its edges.

## Try it

Everything is in [`/labs/cp-weekly-segment-tree-node-memory/`](/labs/cp-weekly-segment-tree-node-memory/connectivity.cpp):

```zsh
g++ -O2 -std=c++17 -o connectivity connectivity.cpp
./connectivity < sample1.txt && ./connectivity < sample2.txt
./connectivity --band-only < sample1.txt    # the wrong query, for comparison
./stress.sh 2000 && ./bench.sh
python3 nand.py --samples && python3 nand.py --stress 2000
g++ -O2 -std=c++17 -o zonal zonal.cpp && ./zonal --stress && ./zonal --bench
```

Practice, from closest to furthest:

- [AALC001 R, Connectivity](https://atcoder.jp/contests/aalc001/tasks/aalc001_r): this issue's problem. Then [V, Connectivity 2](https://atcoder.jp/contests/aalc001/tasks/aalc001_v).
- [Codeforces 811E, Vladik and Entertaining Flags](https://codeforces.com/problemset/problem/811/E): the same boundary summary, counting components instead of answering yes or no.
- [AALC001 M, NAND](https://atcoder.jp/contests/aalc001/tasks/aalc001_m): store functions.
- [ABC480 G, Zonal Score Minimization](https://atcoder.jp/contests/abc480/tasks/abc480_g): stacks feeding a lazy tree.
- **Exercise:** extend the grid summary to also count the components it has fully enclosed (they never touch the boundary). What extra integer does a node need, and when does a glue increase it?

<details>
<summary>What this does and doesn't show</summary>

- **What was run:** every output block above is pasted from a real run in this session. The C++ grid solution passed both official samples, 2,000 random cases against BFS (0 mismatches), and an AddressSanitizer run on a 2,000 × 10 input. The NAND code passed all three official samples and 2,000 random cases; the ABC480 G code passed both samples and 20,000 random cases against the O(N²) DP.
- **Timings** are from one run each on a 2-core cloud VM (Intel Xeon, 2.8 GHz). The "about 8 minutes" for BFS over the full query set is extrapolated from 213 queries, not measured.
- **Not submitted:** nothing here was submitted to the AtCoder or Codeforces judges.
- **Summaries only:** ABC480 E and F, and the other AALC001 problems, are summarised from their editorials and were not implemented. The Codeforces 811E solution description is the commonly published approach; it was not re-implemented here.
- **Not covered:** this week's Codeforces rounds (Round 1128 / WorldQuant Round 1, Educational Round 195, Round 1127). Their problem and editorial pages could not be fetched from this workspace, so none of their ideas are claimed here.

</details>

[^aalc]: AtCoder, [AAL Contest 001: Let's use segtree!](https://atcoder.jp/contests/aalc001), contest page, 12 October 2026.
[^cfblog]: Nyaan, [AAL Contest 001: Let's use segtree! Announcement](https://codeforces.com/blog/entry/157603), Codeforces blog, October 2026.
[^acl]: AtCoder, [AtCoder Library: Segtree](https://atcoder.github.io/ac-library/production/document_en/segtree.html), documentation.
[^taskR]: AtCoder, [AALC001 R: Connectivity](https://atcoder.jp/contests/aalc001/tasks/aalc001_r), problem statement, 2026.
[^edR]: maspy, [AALC001 R official editorial](https://atcoder.jp/contests/aalc001/editorial/27180), AtCoder, 2026.
[^cf811e]: Codeforces, [811E: Vladik and Entertaining Flags](https://codeforces.com/problemset/problem/811/E), problem statement.
[^taskM]: AtCoder, [AALC001 M: NAND](https://atcoder.jp/contests/aalc001/tasks/aalc001_m), problem statement, 2026.
[^edM]: Nachia, [AALC001 M official editorial](https://atcoder.jp/contests/aalc001/editorial/27171), AtCoder, 2026.
[^taskG]: AtCoder, [ABC480 G: Zonal Score Minimization](https://atcoder.jp/contests/abc480/tasks/abc480_g), problem statement, 17 October 2026.
[^edG]: vwxyz (English translation by en_translator), [ABC480 G editorial](https://atcoder.jp/contests/abc480/editorial/27256), AtCoder, 2026.
[^ahc]: AtCoder, [AHC GenAI Rules Trial Contest 2026](https://atcoder.jp/contests/ahc_genai_test_2026), contest page and rules, October 2026.
[^edF]: kyopro_friends (English translation by en_translator), [ABC480 F editorial](https://atcoder.jp/contests/abc480/editorial/27259), AtCoder, 2026.
[^edE]: kyopro_friends (English translation by en_translator), [ABC480 E editorial](https://atcoder.jp/contests/abc480/editorial/27258), AtCoder, 2026.
