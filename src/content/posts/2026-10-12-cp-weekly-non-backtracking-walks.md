---
title: 'CP Weekly: Flip Puzzles Are Non-Backtracking Walks'
description: 'ARC232 B Two Flips as a shortest non-backtracking walk, BFS over directed edges in O(N). Also: a 3SUM refutation, a bounded shift search, weighted medians.'
hook:
  stat: '2 → -1'
  caption: 'Plain BFS finds two flips. The truth is impossible, because a card cannot flip with itself.'
date: '2026-10-12'
topic: algorithms
series: cp-weekly
tags: [cp-weekly, graphs, bfs, non-backtracking-walks, 3sum, weighted-median]
problems:
  - { platform: AtCoder, id: 'ARC232 B', title: Two Flips, url: 'https://atcoder.jp/contests/arc232/tasks/arc232_b' }
  - { platform: AtCoder, id: 'ARC232 C', title: All Add or Single Negate, url: 'https://atcoder.jp/contests/arc232/tasks/arc232_c' }
  - { platform: AtCoder, id: 'ABC479 G', title: Tuning, url: 'https://atcoder.jp/contests/abc479/tasks/abc479_g' }
---

<aside class="tldr">

**TL;DR** A puzzle about flipping cards turns out to be a puzzle about walking through a graph of numbers, with exactly one rule: never step back along the edge you just used. Ignore the rule and BFS answers "2" on a case whose real answer is "impossible". Respect it carelessly and BFS goes quadratic. The fix is to scan each vertex twice. Not once, not N times. Twice.

</aside>

Four cards lie face up on a table. Each has a number on the front and a different one on the back:

| card | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| front | 1 | 2 | 1 | 2 |
| back | 4 | 5 | 3 | 3 |

One move: pick two cards currently showing the **same** number and flip both. Goal: cards 1 and 2 face down, every other card face up. What is the fewest number of moves?

Try it before reading on. You will probably start simulating: flip 1 and 3 (both show 1), now card 3 shows 3, then... and the state space is 2<sup>N</sup> with N up to 250,000. That is AtCoder Regular Contest 232, problem B[^arc232b], from Saturday. The intended solution never simulates anything.

**Welcome to CP Weekly.** Each issue takes one idea from the week in competitive programming, builds it from the smallest example, traces where it comes from, and ends with code tested against brute force. Then a few shorter ideas that also showed up this week.

<details>
<summary>Before you start</summary>

You need BFS on a graph (cp-algorithms has a clear page[^bfs]) and the idea of modelling a puzzle as a graph. Notation used below:

| symbol | meaning |
|---|---|
| A<sub>i</sub>, B<sub>i</sub> | front and back of card i |
| value graph | one vertex per number, one edge per card joining A<sub>i</sub> and B<sub>i</sub> |
| arc | an edge with a direction: "card i walked from B<sub>i</sub> to A<sub>i</sub>" |
| non-backtracking | a walk that never uses the same edge twice in a row |

</details>

## Stop tracking states, start tracking a chain

Follow card 1. It must be flipped an odd number of times, and its first flip needs a partner showing 1, say card 3. Now card 3 is face down, which it must not stay. So card 3 needs another flip, with a partner showing card 3's back, 3. That is card 4. Now card 4 is down and needs fixing with a partner showing 2... card 2, which *wants* to end face down. The chain closes.

Draw each number as a vertex and each card as an edge between its two numbers, and that chain becomes a walk ([Fig. 1](#fig-1)):

```fig title="The 3 moves are the 3 meeting points of a 4-card walk from card 1 to card 2" alt="Five value boxes in a row: 4, 1, 3, 2, 5. Arrows: 4 to 1 labelled card 1, 1 to 3 labelled card 3, 3 to 2 labelled card 4, 2 to 5 labelled card 2. Value 4 is the start (card 1's back), value 5 is the end (card 2's back). Each middle value is one move."
row
v4: peer "4\nstart: card 1's back"
v1: worker "1\nmove: cards 1+3"
v3: worker "3\nmove: cards 3+4"
v2: worker "2\nmove: cards 4+2"
v5: allow "5\nend: card 2's back"
v4 -> v1 "card 1"
v1 -> v3 "card 3"
v3 -> v2 "card 4"
v2 -> v5 "card 2"
```

The walk starts by crossing card 1 from its back to its front (B<sub>1</sub> → A<sub>1</sub>) and ends by crossing card 2 from front to back (A<sub>2</sub> → B<sub>2</sub>). Every vertex where two consecutive cards meet is one move: the two cards share that number. A walk with m cards is m − 1 moves. So the answer is the shortest such walk minus one, and BFS finds shortest walks.

The general mechanism: when every operation touches two objects that share a label, make labels the vertices and objects the edges. A sequence of operations that must "hand off" a defect from object to object is a walk, and the cost is its length.

## But the walk's order is not a legal order

Here's the catch that makes this feel like cheating. Replay the walk in its own order: flip 1 and 3 at value 1, fine. Next, cards 3 and 4 at value 3. But card 4 still shows 2. Illegal.

The walk is a *multiset* of moves, not a schedule. The editorial[^ed232b] proves that some order always works: count, for every card, the remaining uses of its visible side (x<sub>i</sub>) and hidden side (y<sub>i</sub>). Away from the goal, at least two cards have x<sub>i</sub> = y<sub>i</sub> + 1, so the x's sum to more than the number of remaining moves W. If no move were legal now, each move would use at most one visible side, and the x's would sum to at most W. Contradiction. So greedy works: always do any move that is legal right now ([Fig. 2](#fig-2)).

```fig title="Replaying the walk in its own order gets stuck at move 2; doing any currently legal move first finishes in the same 3 moves" alt="Two stacked panels. Left panel, walk order: move cards 1+3 at value 1 is legal; move cards 3+4 at value 3 is illegal because card 4 shows 2. Right panel, greedy order: cards 1+3 at 1 gives state down up down up; cards 4+2 at 2 gives down down down down; cards 3+4 at 3 gives down down up up, which is the goal."
panel Walk order
row
w1: allow "1+3 at value 1\nlegal"
row
w2: deny "3+4 at value 3\n-X- card 4 shows 2"
row
w3: box "4+2 at value 2\nnever reached"
w1 -> w2
w2 -> w3 dashed
panel Any legal move first
row
g1: allow "1+3 at value 1\nstate v^v^"
row
g2: allow "4+2 at value 2\nstate vvvv"
row
g3: result "3+4 at value 3\nstate vv^^ goal"
g1 -> g2
g2 -> g3
```

> **Insight:** Relax the order, solve the counting problem, then prove an order exists. Many "minimum operations" problems hide a walk or a flow once you stop asking *when* each operation happens.

## The one rule: never step back along the same card

A move needs two **different** cards. In the walk, that means two consecutive edges are never the same card. Forget this and BFS cheerfully walks card 1 forward and then straight back.

Take two cards, (1, 2) and (2, 3). Card 1 shows 1, card 2 shows 2. No two cards show the same number, so no move exists at all: the answer is −1. But plain BFS on the value graph finds 2 → 1 → 2 → 3, a walk of 3 edges, and reports 2 moves ([Fig. 3](#fig-3)).

```fig title="Plain BFS reuses card 1 at once and reports 2 moves; the non-backtracking walk is stuck at value 1, so the answer is -1" alt="Two panels. Left, plain BFS: value 2 to value 1 by card 1, value 1 back to value 2 by card 1 marked -X- same card twice, value 2 to value 3 by card 2; reports 2 moves. Right, non-backtracking: value 2 to value 1 by card 1, then value 1 has no other card, dead end; answer -1."
panel Plain BFS on values
row
a2: peer "2"
a1: worker "1"
a2b: worker "2"
a3: deny "3\nreports 2 moves"
a2 -> a1 "card 1"
a1 -> a2b "-X- card 1 again" lost
a2b -> a3 "card 2"
panel Non-backtracking
row
b2: peer "2"
b1: worker "1"
bx: result "dead end\nanswer -1"
b2 -> b1 "card 1"
b1 -> bx "no other card" muted
```

The guard that would miss this bug: the four-card example above. Its shortest walk never backtracks, so both versions print 3. The guard that catches it is a brute force. Across 3,000 random small cases checked against BFS over all 2<sup>N</sup> card states:

```zsh
$ python3 two_flips.py --stress 3000
3000 random cases checked against the 2^N brute force
  walk BFS                    wrong on 0
  plain BFS (reuse allowed)   wrong on 946
  simple path                 wrong on 62
  greedy replay of the walk got stuck on 0
```

The third line is the opposite mistake. A walk *may* reuse a card, just not twice in a row. Cards (1, 2), (2, 1), (3, 2), (3, 2) need card 2 twice, once in the middle and once at the end:

```zsh
$ python3 two_flips.py reuse
cards (A,B): [(1, 2), (2, 1), (3, 2), (3, 2)]
walk that ignores the rule: 2 operations (cards [1, 1, 2])
walk: cards [1, 2, 3, 4, 2], answer 4
  flip cards 3 and 4 (both show 3)  ->  ^^vv
  flip cards 2 and 3 (both show 2)  ->  ^v^v
  flip cards 1 and 2 (both show 1)  ->  v^^v
  flip cards 4 and 2 (both show 2)  ->  vv^^
goal reached: True
```

Card 2 is flipped three times, an odd number, so it ends face down. A "simple path" solver says −1 here.

Play with it: each preset runs the walk, the wrong models, and the greedy replay in your browser.

<div data-lab="py" data-src="/labs/cp-weekly-non-backtracking-walks/two_flips.py" data-args="sample" data-presets="sample|trap|reuse|random 3|random 8|--stress 2000"></div>

## Where non-backtracking walks come from

This is an old object. In 1989 Ki-ichiro Hashimoto studied zeta functions of graphs through a matrix indexed by **directed edges**, with a 1 from arc u→v to arc v→w exactly when w ≠ u[^hashimoto]. In 2013 Krzakala, Moore, Mossel and coauthors showed that this same non-backtracking matrix detects communities in sparse networks where ordinary adjacency spectra fail, because backtracking walks pile up around high-degree vertices[^redemption].

The contest version uses the same state: **an arc, not a vertex**. "Card i, standing at its front" and "card i, standing at its back" are 2N states, and BFS runs over them.

## The quadratic trap, and the twice rule

The obvious BFS pops arc (card i, standing at value v) and scans every card touching v except i. If one value sits on many cards, every arrival into it rescans the whole list. Build a hub: value 1 shared by 249,998 cards in twin pairs (1, x), (1, x). Every twin pair walks out and straight back in on the other twin, so the hub is entered about N/2 times.

The fix: the **first** arrival into v (by card i) relaxes every card at v except i. A **second** arrival, by some card j ≠ i, can only add one new arc: card i itself. Any later arrival adds nothing. So each vertex is scanned fully once and touched once more ([Fig. 4](#fig-4)).

```fig title="Each value needs one full scan and one single-card patch; every later arrival is free, so BFS over arcs stays O(N)" alt="A hub value 1 in the middle row. Top row: first arrival via card 3, scans all 249,999 cards at value 1 except card 3. Second arrival via card 4 relaxes only card 3. Third and later arrivals via card 5, 6 and on scan nothing."
row
f1: worker "1st arrival via card 3\nscan all but card 3"
f2: worker "2nd arrival via card 4\nrelax card 3 only"
f3: box "3rd+ arrival\nscan nothing"
row
hub: main "value 1: 249,999 cards" span 3
f1 -> hub
f2 -> hub
f3 -> hub
```

Timed on one 2.1 GHz Xeon core, `bench.cpp` runs the same BFS with both scans:

```zsh
$ python3 worst.py 20000 | ./bench
fast   scan: answer -1, 1.8 ms
naive  scan: answer -1, 952.4 ms
$ python3 worst.py 40000 | ./bench
fast   scan: answer -1, 4.7 ms
naive  scan: answer -1, 3284.3 ms
$ python3 worst.py 80000 | ./bench
fast   scan: answer -1, 10.5 ms
naive  scan: answer -1, 14900.4 ms
$ python3 worst.py 250000 | ./bench --fast-only
fast   scan: answer -1, 24.3 ms
```

Doubling N multiplies the naive time by about 4: quadratic. At the real limit it would take minutes (the full N = 250,000 naive run was not waited for). On a random input at the limit both are fine, which is why the trap survives casual testing:

```zsh
$ python3 rand_big.py 250000 250000 | ./bench
fast   scan: answer 20, 72.6 ms
naive  scan: answer 20, 92.3 ms
```

<details>
<summary>The full solution (C++, O(N))</summary>

```cpp
// state s = 2*i + d: we just walked card i and stand at its end d (0 = at A_i, 1 = at B_i)
long long solve(int n, const vector<int>& A, const vector<int>& B) {
    vector<vector<int>> adj(2 * n + 1);               // value -> cards touching it
    for (int i = 0; i < n; i++) { adj[A[i]].push_back(i); adj[B[i]].push_back(i); }
    vector<int> dist(2 * n, -1), expanded(2 * n + 1, 0), firstFrom(2 * n + 1, -1);
    deque<int> q;
    dist[0] = 1; q.push_back(0);                      // walked card 1 from B1 to A1
    while (!q.empty()) {
        int s = q.front(); q.pop_front();
        int i = s / 2, at = (s % 2 == 0) ? A[i] : B[i];
        if (s == 3) return dist[s] - 1;               // walked card 2 from A2 to B2
        auto relax = [&](int j) {
            if (j == i) return;                       // never the same card twice in a row
            int t = 2 * j + (A[j] == at ? 1 : 0);     // walk card j away from `at`
            if (dist[t] < 0) { dist[t] = dist[s] + 1; q.push_back(t); }
        };
        if (expanded[at] == 0) { expanded[at] = 1; firstFrom[at] = i; for (int j : adj[at]) relax(j); }
        else if (expanded[at] == 1 && i != firstFrom[at]) { expanded[at] = 2; relax(firstFrom[at]); }
    }
    return -1;
}
```

Checked against the 2<sup>N</sup> brute force on 10,000 random cases (N ≤ 9, values from small ranges so cards collide), with both scans, and under AddressSanitizer and UBSan:

```zsh
$ ./stress.sh
10000 random cases, all match the brute force
answers:
-1:2490 1:2996 2:3194 3:898 4:311 5:73 6:29 7:6 8:3
$ ./two_flips < cases.txt
3
-1
4
```

</details>

## Also this week

### 3SUM and APSP: a claimed refutation

On 5 October, Josh Alman and Virginia Vassilevska Williams posted a paper claiming deterministic O(n<sup>1.9992</sup>) 3SUM and O(n<sup>2.9995</sup>) all-pairs shortest paths for polynomially bounded integers[^alman]. Those are the two hypotheses behind a large part of fine-grained complexity, including many "this problem has no truly subquadratic algorithm" conditional lower bounds. The abstract states that Claude, an AI model by Anthropic, discovered the algorithm and verified the main results in Lean 4 with Mathlib. It was also discussed on the Codeforces blog[^cfblog].

```fig title="One new subroutine, sparse entries of a thin integer matrix product, is claimed to push five classic exponents below their textbook bounds" alt="Top: main box, compute only chosen entries of a thin integer matrix product. Arrows down to five boxes: 3SUM n^2 to n^1.9992; APSP and min-plus product n^3 to n^2.9995; min-plus convolution, truly subquadratic; 0/1 knapsack t^2 to t^(2-delta); negative triangle, truly subcubic."
row
core: main "chosen entries of a thin\ninteger matrix product" span 5
row
s1: worker "3SUM\nn^2 → n^1.9992"
s2: worker "APSP, (min,+) product\nn^3 → n^2.9995"
s3: worker "(min,+) convolution\ntruly subquadratic"
s4: worker "0/1 knapsack\nt^2 → t^(2-δ)"
s5: worker "negative triangle\ntruly subcubic"
core -> s1
core -> s2
core -> s3
core -> s4
core -> s5
```

For contest code nothing changes: the exponent gaps are 0.0008 and 0.0005, and the two-pointer O(n<sup>2</sup>) 3SUM is still what you write. What changes is how to read a hardness argument. "This reduces from 3SUM, so expect n<sup>2</sup>" now rests on a hypothesis with a claimed counterexample. The paper is a preprint and has not been peer reviewed.

### Fix the global count, then bound how far to look (ARC232 C)

Two operations: add 1 to every element, or negate one element. Make A equal B as multisets in the fewest moves[^ed232c]. Fix s, the number of global additions. Then each pair (a, b) costs 0, 1 or 2 negations, or is impossible, and the rest is a min-cost perfect matching. The trick is the search range: every pair costs at most 2, so the answer is at most s<sub>min</sub> + 2N and only s in [s<sub>min</sub>, s<sub>min</sub> + 2N] matter. Hungarian on each gives O(N<sup>4</sup>).

```fig title="Turning -3 into 4: odd s are possible (parity), s = 1 already works with one negation, and s = 7 needs none" alt="One row of boxes for s from 0 to 7 with a = -3, b = 4. s=0 impossible, s=1 cost 1, s=2 impossible, s=3 cost 1, s=4 impossible, s=5 cost 1, s=6 impossible, s=7 cost 0."
row
c0: deny "s=0\n-"
c1: ask "s=1\n1 neg"
c2: deny "s=2\n-"
c3: ask "s=3\n1 neg"
c4: deny "s=4\n-"
c5: ask "s=5\n1 neg"
c6: deny "s=6\n-"
c7: allow "s=7\n0 neg"
```

The editorial's cost rule (cost 0 if b − a = s, cost 1 if |a + b| ≤ s, else 2, after parity and the |a| vs |b| gap) was checked against brute force over every interleaving: 1,859 (a, b, s) triples, 0 mismatches. The general rule: when a global parameter interacts with per-item costs that are bounded by c, the optimum lies within c·N of the smallest feasible parameter.

### Minimise Σ|A<sub>i</sub>x − B<sub>i</sub>| with a weighted median (ABC479 G)

Shift each point (A<sub>i</sub>, B<sub>i</sub>) by (c<sub>i</sub>, d<sub>i</sub>) so that all shifted points lie on one line through the origin, minimising Σ(|c<sub>i</sub>| + |d<sub>i</sub>|), with N up to 2×10<sup>5</sup>[^ed479g]. The editorial shows an optimal solution moves every point along one axis only, so try vertical moves, then swap the axes. With vertical moves and slope x, the cost is Σ|A<sub>i</sub>x − B<sub>i</sub>| = Σ|A<sub>i</sub>|·|x − B<sub>i</sub>/A<sub>i</sub>|: convex, piecewise linear, minimised at the **weighted median** of the slopes B<sub>i</sub>/A<sub>i</sub> with weights |A<sub>i</sub>|.

```fig title="Slopes sorted with weights 1, 2, 3, 1, 2: the running weight passes half of 9 at 7/3, so x = 7/3 with cost 10" alt="Five boxes in a row, slope and weight: 0 weight 1 running 1; 1 weight 2 running 3; 7/3 weight 3 running 6, marked as the median since 6 is at least 4.5; 3 weight 1 running 7; 9/2 weight 2 running 9."
row
m1: box "0\nw 1, run 1"
m2: box "1\nw 2, run 3"
m3: allow "7/3\nw 3, run 6 ≥ 4.5"
m4: box "3\nw 1, run 7"
m5: box "9/2\nw 2, run 9"
```

```zsh
$ python3 also_checks.py
ARC232 C cost rule: 1859 (a, b, s) triples, 0 mismatches; cost 0: 88, 1: 562, 2: 140, impossible: 1069
example a=-3, b=4: {0: None, 1: 1, 2: None, 3: 1, 4: None, 5: 1, 6: None, 7: 0, 8: None}
ABC479 G points: [(1, 3), (2, 2), (1, 0), (3, 7), (2, 9)]
slopes with weights: [('0', 1), ('1', 2), ('7/3', 3), ('3', 1), ('9/2', 2)]
weighted median slope 7/3, cost 10; best on a 0.01 grid: cost 1001/100 at x=233/100
```

Pitfall from the editorial: the final answer fits in 64 bits, but intermediate comparisons of the rational slopes can overflow, so its sample uses `__int128`. The general rule: Σ w<sub>i</sub>|x − p<sub>i</sub>| is minimised at a weighted median, so any "scale then absolute value" cost becomes a sort.

## How to recognise a walk next time

Back to the four cards. The puzzle looked like a search over 2<sup>N</sup> states, and it was a BFS over 2N arcs. The signals:

- an operation touches **two objects that share a label** (equal values, a shared endpoint);
- the goal fixes a few objects and leaves the rest unchanged, so "defects" must be **handed off** along a chain;
- the order of operations looks important, but the answer only depends on **how many** of each.

When you see them: labels become vertices, objects become edges, the chain becomes a walk, and "two different objects" becomes non-backtracking. Then check whether walks may repeat objects, and scan each vertex at most twice.

## Try it

Everything above is in [`/labs/cp-weekly-non-backtracking-walks/`](/labs/cp-weekly-non-backtracking-walks/two_flips.py):

```zsh
g++ -O2 -std=c++17 -o two_flips two_flips.cpp && g++ -O2 -std=c++17 -o brute brute.cpp
g++ -O2 -std=c++17 -o bench bench.cpp
./two_flips < cases.txt && ./stress.sh
python3 worst.py 40000 | ./bench
python3 two_flips.py reuse && python3 two_flips.py --stress 3000
python3 also_checks.py
```

Practice, from closest to furthest:

- [ARC232 B, Two Flips](https://atcoder.jp/contests/arc232/tasks/arc232_b): the problem above.
- [ARC232 C, All Add or Single Negate](https://atcoder.jp/contests/arc232/tasks/arc232_c): the bounded shift search.
- [ABC479 G, Tuning](https://atcoder.jp/contests/abc479/tasks/abc479_g): the weighted median.
- **Exercise:** change the goal to "only card 1 face down". Show that the answer is −1 for every input. (Hint: what does one move do to the number of face-down cards?)

<details>
<summary>Sources, method and limits</summary>

- **What was run:** every block of output above is real, from one 2.1 GHz Xeon machine. The C++ solution matched the 2<sup>N</sup> brute force on 10,000 random cases and the hand-checked cases in `cases.txt`, ran clean under AddressSanitizer and UBSan, and was timed at N = 250,000. The naive scan at N = 250,000 was not run to completion; "minutes" is an extrapolation from the 4× per doubling trend. Nothing was submitted to the AtCoder judge.
- **The contest:** the walk model and the proof that a legal order exists come from the official ARC232 B editorial; the twice rule, the figures and the wrong-model comparisons are this post's own. The ARC232 C and ABC479 G summaries follow their editorials.
- **The 3SUM paper:** claims are as stated in the preprint's abstract and body; it is not peer reviewed, and none of it was reproduced here.
- **Sweep gaps:** Codeforces problem pages and editorials for this week's rounds (1125, 1126, 1127) could not be fetched for this issue, so they are not covered.

</details>

[^arc232b]: AtCoder, [ARC232 B: Two Flips](https://atcoder.jp/contests/arc232/tasks/arc232_b), AtCoder Regular Contest 232, 2026.
[^ed232b]: evima, [ARC232 B official editorial](https://atcoder.jp/contests/arc232/editorial/27125), AtCoder, 2026.
[^bfs]: cp-algorithms, [Breadth-first search](https://cp-algorithms.com/graph/breadth-first-search.html), cp-algorithms.com.
[^hashimoto]: Ki-ichiro Hashimoto, [Zeta functions of finite graphs and representations of p-adic groups](https://doi.org/10.2969/aspm/01510211), Advanced Studies in Pure Mathematics 15, 1989.
[^redemption]: Florent Krzakala, Cristopher Moore, Elchanan Mossel, Joe Neeman, Allan Sly, Lenka Zdeborová, Pan Zhang, [Spectral redemption: clustering sparse networks](https://arxiv.org/abs/1306.5550), PNAS, 2013.
[^alman]: Josh Alman and Virginia Vassilevska Williams, [Truly Subquadratic 3SUM and Truly Subcubic APSP via Triangles in Sparse Lopsided Graphs](https://arxiv.org/abs/2610.06783), arXiv, 2026.
[^cfblog]: towersfreak2006, [3-SUM Conjecture and APSP Conjecture FALSE?!](https://codeforces.com/blog/entry/157443), Codeforces, 2026.
[^ed232c]: evima, [ARC232 C official editorial](https://atcoder.jp/contests/arc232/editorial/27126), AtCoder, 2026.
[^ed479g]: physics0523, [ABC479 G official editorial](https://atcoder.jp/contests/abc479/editorial/27132), AtCoder, 2026.
