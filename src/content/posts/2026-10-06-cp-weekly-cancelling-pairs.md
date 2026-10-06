---
title: 'CP Weekly: The Art of Cancelling Pairs'
description: 'Sign-reversing involutions from Euler and Franklin to inclusion-exclusion and LGV, then this week''s AtCoder parity problem solved in O(N) by cancellation.'
hook:
  stat: '12 → 3, not 6'
  caption: 'sequences → ones with odd inversions. Half is the wrong guess; most of them cancel.'
date: '2026-10-06'
topic: algorithms
series: cp-weekly
tags: [cp-weekly, combinatorics, involutions, partitions, inversions, game-theory]
problems:
  - { platform: AtCoder, id: 'ARC231 E', title: Odd Inversion, url: 'https://atcoder.jp/contests/arc231/tasks/arc231_e' }
  - { platform: AtCoder, id: 'ARC231 D', title: Choose Your Role, url: 'https://atcoder.jp/contests/arc231/tasks/arc231_d' }
---

**Welcome to CP Weekly.** Each issue takes one idea from mathematics, follows it from where it was born to where it turned up in that week's contests, and ends with a way of thinking you can carry to the next problem. No problem lists: one idea, explored properly.

This first issue is about **cancellation**. Expand (1 − q)(1 − q²)(1 − q³)(1 − q⁴)… and almost every term destroys another one. What survives is 1 − q − q² + q⁵ + q⁷ − q¹² − q¹⁵ + …, only the pentagonal numbers. Euler noticed this around 1740 and needed about ten years to prove it. More than a century later, in 1881, Fabian Franklin explained it with a picture: pair the terms up so each pair cancels, then look at who has no partner.

That picture, called a **sign-reversing involution**, is one of the most reusable ideas in combinatorics. It also cracked a problem from AtCoder Regular Contest 231 this week. We'll build it up from the smallest example, watch it prove Euler's identity, see it hiding inside inclusion-exclusion and determinants, and only then turn to the contest.

**Prerequisites:** inversions of a sequence, and the idea of a bijection. Everything else is built here.

## Half of all permutations are odd, and the proof is one swap

Start with something you probably believe without proof: among the n! orderings of 1…n, exactly half have an odd number of inversions. Why?

Take any permutation and swap its first two entries. Only that one pair changes order, so the inversion count moves by exactly 1 and the parity flips. Swap again and you're back where you started. So the swap pairs every permutation with a partner of opposite parity:

```fig title="Figure 1: Swapping the first two entries pairs all 6 permutations of 3 into even/odd couples, so exactly 3 are odd"
row
a1: allow "(1,2,3)\n0 inv"
a2: deny "(2,1,3)\n1 inv"
b1: deny "(1,3,2)\n1 inv"
b2: allow "(3,1,2)\n2 inv"
c1: allow "(2,3,1)\n2 inv"
c2: deny "(3,2,1)\n3 inv"
a1 <-> a2 "swap"
b1 <-> b2 "swap"
c1 <-> c2 "swap"
```

Here's the general shape of that argument. Give every object a sign (+1 for even, −1 for odd) and look for a map φ that:

1. **undoes itself:** φ(φ(x)) = x, so it splits objects into pairs (an *involution*);
2. **flips the sign** of every object it moves.

Then every pair contributes +1 − 1 = 0, and **the signed total equals the signed total of the fixed points**, the objects φ leaves alone. For permutations there are no fixed points, so even − odd = 0, and half are odd.

> **Insight:** To count a difference (even minus odd, positive minus negative), don't count either side. Find a reversible move that flips the sign; everything it moves vanishes, and you only have to understand what it can't move.

## Euler's product: everything cancels except the pentagons

Back to the opening. Expanding ∏(1 − q<sup>k</sup>) means choosing a set of distinct parts, so the coefficient of q<sup>n</sup> is a signed count of **partitions of n into distinct parts**: +1 for an even number of parts, −1 for odd. Run it:

```zsh
$ python3 cancellation.py --euler 26
1 - q^1 - q^2 + q^5 + q^7 - q^12 - q^15 + q^22 + q^26
nonzero exponents: [1, 2, 5, 7, 12, 15, 22, 26]
pentagonal numbers k(3k-1)/2: [1, 2, 5, 7, 12, 15, 22, 26]
```

Franklin's 1881 note in the *Comptes Rendus* gave the involution. Draw a partition as rows of dots (a Ferrers diagram), largest part on top. Look at two things: the **bottom row** (the smallest part, length m) and the **staircase**, the run of rows at the top that each drop by exactly one dot (length s, read along the right edge):

- If m ≤ s, slide the bottom row up onto the staircase, one dot per row.
- If m > s, slide the staircase down to become a new bottom row.

Either way the number of parts changes by one, so the sign flips, and doing it twice gets you back.

```fig title="Figure 2: Franklin's move pairs (6, 2) with (5, 2, 1) by sliding the 1-dot staircase down; (4, 3) has no partner because its staircase reaches the bottom row"
row
p1: allow "(6, 2)  +1" body "●●●●●●\n●●\nm = 2, s = 1"
p2: deny "(5, 2, 1)  −1" body "●●●●●\n●●\n●"
f1: main "(4, 3)  fixed" body "●●●●\n●●●\nm = 3, s = 2"
p1 <-> p2 "Franklin"
```

The move only fails when the staircase runs all the way down and overlaps the bottom row, with m = s or m = s + 1. Those shapes are exactly the pentagonal ones, with k(3k ± 1)/2 dots, which is why only the pentagonal exponents survive. The script checks every partition up to n = 40:

```zsh
$ python3 cancellation.py --franklin 8
  (8,) -1  <->  (7, 1) +1
  (6, 2) +1  <->  (5, 2, 1) -1
  (5, 3) +1  <->  (4, 3, 1) -1
n = 8: signed count = 0
franklin: an involution flipping parity for every n <= 40; fixed points only at pentagonal n
```

This isn't just beautiful, it's an algorithm. Since the product of (1 − q<sup>k</sup>) times the partition generating function is 1, the identity gives p(n) = p(n−1) + p(n−2) − p(n−5) − p(n−7) + p(n−12) + …, only about 2√n terms per value. That makes the number of partitions of every n up to N an **O(N√N)** computation instead of the O(N²) knapsack:

```zsh
$ python3 cancellation.py --partitions
p(n) for n <= 1000: Euler's recurrence matches the DP everywhere; p(100) = 190569292
```

> **Insight:** An identity full of cancellation is a free speed-up. When the signed version of a count collapses to a few terms, the unsigned count often satisfies a short recurrence through it.

## Inclusion-exclusion is the same trick in disguise

Every competitive programmer uses inclusion-exclusion. Here's why it works. Its heart is one fact: for a non-empty set T, the subsets of T with even size and with odd size are equally many,

Σ<sub>S ⊆ T</sub> (−1)<sup>|S|</sup> = 0 when T ≠ ∅.

The proof is an involution: **toggle the smallest element of T**. It changes |S| by one, and toggling again restores S.

```fig title="Figure 3: Toggling element 1 pairs the 8 subsets of {1, 2, 3} into 4 pairs of opposite sign; only the empty T has a fixed point"
row
a: allow "{ }"
b: deny "{1}"
c: deny "{2}"
d: allow "{1,2}"
row
e: deny "{3}"
f: allow "{1,3}"
g: allow "{2,3}"
h: deny "{1,2,3}"
a <-> b
c <-> d
e <-> f
g <-> h
```

So when you write "count the objects avoiding every bad property" as Σ (−1)<sup>|S|</sup> · (objects with at least the properties in S), each object with a non-empty set T of bad properties is counted Σ<sub>S⊆T</sub> (−1)<sup>|S|</sup> = 0 times, and the good objects (T = ∅) once. Inclusion-exclusion is a sign-reversing involution, applied one object at a time.

> **Insight:** Alternating sums like Σ(−1)<sup>k</sup> are rarely random. Behind almost every one there is a pairing; finding it tells you what the sum really counts.

## At research level: determinants and crossing paths

The same move runs through modern combinatorics. Two well-known results:

- **The Lindström-Gessel-Viennot lemma** (Lindström 1973, Gessel and Viennot 1985). A determinant of path counts equals the number of families of **non-crossing** paths. The proof expands the determinant into a signed sum over all path families, then swaps the tails of two paths at their first meeting point. That swap flips the sign of the permutation, so every crossing family cancels with another.

```fig title="Figure 4: Swapping tails at the first meeting point turns A1→B1, A2→B2 into A1→B2, A2→B1, flipping the determinant sign"
panel "Crossing family (sign +)"
row
a1: peer "A1"
a2: peer "A2"
row
v: shared "v: first meeting" span 2
row
b1: box "B1"
b2: box "B2"
a1 -> v
a2 -> v
v -> b1 "tail 1"
v -> b2 "tail 2"
panel "Tails swapped at v (sign −)"
row
c1: peer "A1"
c2: peer "A2"
row
w: shared "v: first meeting" span 2
row
d1: box "B1"
d2: box "B2"
c1 -> w
c2 -> w
w -> d1 "tail 2"
w -> d2 "tail 1"
```

  In contests this appears as "count pairs of paths that never touch". The classic example is Codeforces 348D *Turtles*, where a 2×2 determinant replaces a search over path pairs.
- **The Garsia-Milne involution principle** (1981). It combines two involutions with a bijection to manufacture a bijection between sets of the same size. It produced the first bijective proof of the Rogers-Ramanujan identities. Doron Zeilberger and his computer co-author Shalosh B. Ekhad revisited it in 2025, and they note its limit: the bijection it builds is correct but explains little about why the two sets match.

> **Insight:** The research-level versions keep the same three steps: sign the objects, find a sign-flipping move that undoes itself, and identify the fixed points. Only the objects get fancier (paths, tableaux, partitions).

## This week: when the coin flip lies

Now the contest. ARC231 (October 4) asked for this:

> A is non-decreasing. Count sequences B with 1 ≤ B<sub>i</sub> ≤ A<sub>i</sub> that have an **odd** number of inversions, modulo 998244353, with N up to 200,000 and A<sub>i</sub> up to 10<sup>9</sup>.

The first section says "half". Try A = (2, 2, 3): there are 12 sequences, and only **3** are odd. The swap that worked for permutations breaks here in two ways. Two equal values don't change the inversion count when swapped, and a swap can push a value above its bound A<sub>i</sub>. So the question becomes: **which reversible, sign-flipping move survives these constraints, and what can't it touch?**

Choose the move that disturbs as little as possible: look only at the **last two positions**. If B<sub>n−1</sub> ≠ B<sub>n</sub> and both are at most A<sub>n−1</sub>, swap them. The inversion count changes by exactly one. The result stays valid because A is non-decreasing (both values ≤ A<sub>n−1</sub> ≤ A<sub>n</sub>), and swapping twice undoes it.

```fig title="Figure 5: For A = (2, 2, 3), 4 sequences cancel in pairs; the 8 left over give even − odd = 6, so odd = (12 − 6) / 2 = 3"
layout stack
panel "Cancel: last two differ and both ≤ A[2], so swap them"
row
a1: allow "(1,1,2)\neven"
a2: deny "(1,2,1)\nodd"
b1: deny "(2,1,2)\nodd"
b2: allow "(2,2,1)\neven"
a1 <-> a2 "swap"
b1 <-> b2 "swap"
panel "Survive: last two equal (removing them keeps parity)"
row
c1: allow "(1,1,1)\neven"
c2: allow "(1,2,2)\neven"
c3: allow "(2,1,1)\neven"
c4: allow "(2,2,2)\neven"
panel "Survive: B[3] = 3 > A[2], bigger than everything before it"
row
d1: allow "(1,1,3)\neven"
d2: allow "(1,2,3)\neven"
d3: deny "(2,1,3)\nodd"
d4: allow "(2,2,3)\neven"
```

Now the step that turns a picture into an algorithm: **the fixed points look like the same problem, only smaller.** There are only two kinds:

```fig title="Figure 6: Both kinds of survivor shrink to a smaller instance, which gives a two-term recurrence for X = even − odd"
row
q: main "Survivors at the last two positions" span 2
row
s1: allow "B[n] > A[n-1]" body "bigger than every earlier value:\nadds 0 inversions, drop it\n(A[n] - A[n-1]) · X[n-1]"
s2: allow "B[n-1] = B[n] ≤ A[n-1]" body "any other element sees both copies:\nadds 0 or 2, drop the pair\nA[n-1] · X[n-2]"
q -> s1
q -> s2
```

So X<sub>i</sub> = (A<sub>i</sub> − A<sub>i−1</sub>)·X<sub>i−1</sub> + A<sub>i−1</sub>·X<sub>i−2</sub>, with X<sub>0</sub> = 1 and X<sub>1</sub> = A<sub>1</sub>, and the answer is (A<sub>1</sub>A<sub>2</sub>…A<sub>N</sub> − X<sub>N</sub>) / 2. For (2, 2, 3) the sequence X is 1, 2, 2, 6, so the answer is (12 − 6) / 2 = 3. One warning: a tempting move like "swap the first descent" is *not* an involution, because after the swap that spot is no longer a descent, and the partner picks a different spot. Pick a position that doesn't depend on the values you change.

The whole solution is a few lines of C++ (reduce A<sub>i</sub> modulo the prime first, since differences can be close to 10<sup>9</sup>):

```cpp
ll solve(const vector<ll>& A) {
  ll total = 1;
  for (ll a : A) total = total * (a % MOD) % MOD;
  ll x2 = 1, x1 = A[0] % MOD;  // X_{i-2}, X_{i-1}
  for (size_t i = 1; i < A.size(); i++) {
    ll x = ((A[i] - A[i - 1]) % MOD * x1 + A[i - 1] % MOD * x2) % MOD;
    x2 = x1; x1 = x;
  }
  return (total - x1 + MOD) % MOD * power(2, MOD - 2) % MOD;
}
```

The full [`odd_inversion.cpp`](/labs/cp-weekly-cancelling-pairs/odd_inversion.cpp) on the official samples, 5,000 random cases against brute force, and the largest input:

```zsh
$ ./odd_inversion < sample.txt
1
3
610589585
$ ./odd_inversion stress 5000
stress: 5000 random cases (N <= 7, A_i <= 5), all match brute force
$ ./odd_inversion bench
bench: T=2, N=200000 each, A_i up to 1e9: 3.46 ms (checksum 468184698)
```

Every example in this issue runs in your browser. Try the permutation pairing, Euler's product, Franklin's pairs, or your own A:

<div data-lab="py" data-src="/labs/cp-weekly-cancelling-pairs/cancellation.py" data-args="--show 2 2 3" data-presets="--show 2 2 3|--show 1 3 3 4|--perms 4|--euler 40|--franklin 12|--stress"></div>

> **Insight:** The hard part of an involution proof is not the cancellation, it's choosing a move whose fixed points you can still describe. The best move touches the fewest positions, so its leftovers look like a smaller copy of the problem.

## The same instinct, played as a game

The other ARC231 problem worth your time looks nothing like counting. There are N piles of N − 1 stones. On each turn, First removes 1 to K stones from one pile, and Second removes one stone each from 1 to K different piles. Whoever can't move loses. Which side do you pick?

Second wins, by pairing again, this time pairing *moves*. Colour the stones so pile i holds one stone of every colour except i. Then "pile i has colour c" exactly when "pile c has colour i": the position is a symmetric matrix. When First takes colours c<sub>1</sub>…c<sub>j</sub> from pile i, Second takes colour i from piles c<sub>1</sub>…c<sub>j</sub>, the mirror image. Symmetry guarantees those stones exist, and the position is symmetric again.

```fig title="Figure 7: With N = 3, each move by First has a mirror move by Second that restores the symmetry, so First runs out of moves first"
layout stack
panel "Start: pile i has every colour except i (symmetric)"
row
p1: box "pile 1" body "{2, 3}"
p2: box "pile 2" body "{1, 3}"
p3: box "pile 3" body "{1, 2}"
panel "First takes colours 2, 3 from pile 1"
row
f1: deny "pile 1" body "{ }"
f2: box "pile 2" body "{1, 3}"
f3: box "pile 3" body "{1, 2}"
panel "Second mirrors: colour 1 from piles 2 and 3"
row
g1: box "pile 1" body "{ }"
g2: allow "pile 2" body "{3}"
g3: allow "pile 3" body "{2}"
```

Exhaustive search over every small game agrees: `also_this_week.py --game` reports "Second wins" for all 14 pairs with 2 ≤ N ≤ 5 and 1 ≤ K ≤ N. The mirror strategy is the game version of an involution: every move has a partner, and the side that always has a partner can't run out first. The colours aren't in the problem. You invent them so the pairing becomes visible.

> **Insight:** Pairing works on moves as well as objects. If the start and the end are symmetric, look for labels that turn each opponent move into one you can copy.

## How to recognise a cancellation problem

Both problems were solved the same way, and so were Euler's identity and inclusion-exclusion. The method, as a loop you can run on a new problem:

```fig title="Figure 8: The cancellation method: list a tiny case, sign it, find a move that flips the sign and undoes itself, then study what the move can't touch"
row
s1: box "1. Tiny case" body "list everything:\nA = (2, 2, 3) → 12"
s2: box "2. Sign it" body "count even − odd,\nnot odd"
s3: main "3. Find the move" body "flips the sign,\nundoes itself"
s4: box "4. Fixed points" body "what the move\ncan't touch"
s5: allow "5. Smaller copy" body "recurrence,\nformula or strategy"
s1 -> s2
s2 -> s3
s3 -> s4
s4 -> s5
```

And the signals in a statement that suggest it:

| When the problem says… | Try… |
|---|---|
| "odd", "even", "parity", "modulo 2" | Count even − odd, then halve the difference from the total |
| an alternating sum, (−1)<sup>k</sup>, a determinant | Find the pairing that explains the signs |
| "avoiding all of these properties" | Inclusion-exclusion, i.e. toggling the smallest bad property |
| "paths that never touch" | LGV: a determinant of single-path counts |
| a game whose start and end positions are symmetric | A mirror strategy; invent labels that make the symmetry visible |
| "half" feels right but samples disagree | Something breaks the pairing; the answer lives in the fixed points |

> **Insight:** When a count is hard but a *difference* of two counts might be easy, compute the difference first. Cancellation reduces the problem to whatever the pairing cannot reach.

## Try it

Everything above is in [`/labs/cp-weekly-cancelling-pairs/`](/labs/cp-weekly-cancelling-pairs/cancellation.py):

```zsh
python3 cancellation.py --perms 4 && python3 cancellation.py --euler 40
python3 cancellation.py --franklin 12 && python3 cancellation.py --partitions
g++ -O2 -std=c++17 -o odd_inversion odd_inversion.cpp
./odd_inversion < sample.txt && ./odd_inversion stress 5000 && ./odd_inversion bench
python3 also_this_week.py --game
```

To practise the idea, from closest to furthest:

- [ARC231 E, Odd Inversion](https://atcoder.jp/contests/arc231/tasks/arc231_e) and [ARC231 D, Choose Your Role](https://atcoder.jp/contests/arc231/tasks/arc231_d): this week's two problems.
- **Exercise:** derangements satisfy D<sub>n</sub> = n·D<sub>n−1</sub> + (−1)<sup>n</sup>. Find the involution that explains the lone ±1.
- [Codeforces 348D, Turtles](https://codeforces.com/problemset/problem/348/D): two non-touching paths, solved by a 2×2 LGV determinant.
- **Exercise:** in Franklin's move, check by hand that (5, 4, 3) and (6, 5, 4) are fixed points, with 12 and 15 dots, both pentagonal. Then see why (5, 4) is not.

<details>
<summary>Sources, method and limits</summary>

- **History:** Jordan Bell, [*Euler and the pentagonal number theorem*](https://arxiv.org/abs/math/0510054) (2006): Euler found the identity around 1740 and sent a proof to Goldbach in 1750. F. Franklin, "Sur le développement du produit infini (1 − x)(1 − x²)(1 − x³)…", *Comptes Rendus* 92 (1881), 448 to 450; Igor Pak, [*The nature of partition bijections I: involutions*](https://www.math.ucla.edu/~pak/papers/ilbuono5.pdf). Garsia-Milne: Ekhad and Zeilberger, [*Experimenting with the Garsia-Milne involution principle*](https://arxiv.org/abs/2501.18061) (2025). LGV: Gessel and Viennot, [*Binomial determinants, paths, and hook length formulae*](https://sites.math.washington.edu/~billey/classes/561.fall.2019/past.articles/Gessel.Viennot.1985.pdf) (1985).
- **The contest:** the recurrence and the mirror strategy come from the official ARC231 editorials (English by evima); the proofs and figures here are written out from them.
- **What was run:** every block of output above is real. `cancellation.py` checks Franklin's move is a parity-flipping involution with fixed points only at pentagonal n for all n ≤ 40, and Euler's recurrence against a DP for p(n), n ≤ 1000. The C++ solution was checked on the samples and 5,000 random cases, and timed once at maximum size (3.46 ms on one machine). The game was solved exhaustively for N ≤ 5. Nothing was submitted to the AtCoder judge.
- **Not covered:** this week's other ABC478 and ARC231 problems; this issue follows one idea rather than the whole contest.

</details>
