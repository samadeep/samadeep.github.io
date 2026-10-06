---
title: 'CP Weekly: Count Odd Inversions by Cancelling Pairs'
description: 'ARC231 E: count odd-inversion sequences in O(N) by letting swaps cancel. Plus ABC478 F (previous-greater product) and ARC231 D (mirror strategy).'
hook:
  stat: '12 → 3, not 6'
  caption: 'sequences for A = (2, 2, 3) → ones with odd inversions. Half is wrong; pairs cancel.'
date: '2026-10-06'
topic: algorithms
series: cp-weekly
tags: [cp-weekly, combinatorics, involution, inversions, atcoder, monotonic-stack, game-theory]
problems:
  - platform: AtCoder
    id: 'ARC231 E'
    title: Odd Inversion
    url: https://atcoder.jp/contests/arc231/tasks/arc231_e
  - platform: AtCoder
    id: 'ABC478 F'
    title: Min-First Search
    url: https://atcoder.jp/contests/abc478/tasks/abc478_f
  - platform: AtCoder
    id: 'ARC231 D'
    title: Choose Your Role
    url: https://atcoder.jp/contests/arc231/tasks/arc231_d
---

Take A = (2, 2, 3) and every sequence B with 1 ≤ B<sub>i</sub> ≤ A<sub>i</sub>. There are 12 of them, and **only 3 have an odd number of inversions**, not the 6 a coin-flip guess gives. AtCoder Regular Contest 231 (October 4) asked for that count with N up to 200,000 and A<sub>i</sub> up to 10<sup>9</sup>, and the clean way in never counts odd sequences at all.

**Short answer:** count **even minus odd** instead. Swapping two adjacent, different values changes the inversion count by exactly one, so those sequences cancel in pairs. Only two kinds survive at the last position, which gives X<sub>i</sub> = (A<sub>i</sub> − A<sub>i−1</sub>)·X<sub>i−1</sub> + A<sub>i−1</sub>·X<sub>i−2</sub>, and the answer is (total − X<sub>N</sub>) / 2. That's O(N).

This issue covers that trick (called a *sign-reversing involution*) with a full worked example, tested code and timings, then two shorter ideas from the same week: ABC478 F, where a previous-greater pointer counts trees, and ARC231 D, where the second player wins by mirroring a colouring you invent.

**Prerequisites:** inversions, and division by 2 modulo a prime (multiply by 499122177 for 998244353).

## The obvious guess, "half are odd", is wrong

Each swap of two neighbours flips parity, so it's tempting to assume parity is a fair coin and answer total / 2. For A = (2, 2, 3) that gives 6. The real count is 3: equal values and the bounds A<sub>i</sub> break the symmetry. Some sequences have no partner to flip with, and those decide the answer.

Here are all 12, grouped by what happens at the last two positions:

```fig title="Figure 1: For A = (2, 2, 3), 4 sequences cancel in pairs; the 8 left over give even − odd = 6"
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

The cancelled pairs add +1 and −1 and vanish from even − odd. The survivors contribute 7 − 1 = 6, so even − odd = 6, and with 12 in total, odd = (12 − 6) / 2 = **3**.

> **Insight:** When a question asks for a parity count, compute the signed sum (even minus odd). Any move that flips the sign and can be undone deletes its pairs from the sum, and what's left is often small and structured.

## Count even minus odd: let swaps cancel

The general tool is a **sign-reversing involution**: a map φ that pairs objects up (φ(φ(b)) = b) and gives each pair opposite signs. Every pair sums to zero, so the signed total equals the signed total of the *fixed points*, the objects φ leaves alone.

For this problem, look only at the last two positions. If B<sub>n−1</sub> ≠ B<sub>n</sub> and both are at most A<sub>n−1</sub>, swap them:

- **The swap changes the inversion count by exactly 1.** Only the pair (n−1, n) changes order; every other element still sees both values, just in the other order.
- **The result is still valid** because A is non-decreasing: both values are ≤ A<sub>n−1</sub> ≤ A<sub>n</sub>.
- **Swapping twice gives back the original**, so the sequences split cleanly into pairs.

So every sequence of that shape cancels. Two shapes are left.

```fig title="Figure 2: Only two cases at the last position survive the cancellation, and each one shrinks the problem"
row
q: main "Last two values\nB[n-1], B[n]" span 3
row
s1: allow "B[n] > A[n-1]" body "bigger than every earlier value,\nso it adds 0 inversions\n(A[n] - A[n-1]) · X[n-1]"
s2: allow "B[n-1] = B[n] ≤ A[n-1]" body "any element sees both copies,\nso it adds an even number\nA[n-1] · X[n-2]"
s3: deny "different, both ≤ A[n-1]" body "swap them: parity flips,\npairs cancel\ncontributes 0"
q -> s1
q -> s2
q -> s3
```

- **B<sub>n</sub> > A<sub>n−1</sub>:** every earlier B<sub>j</sub> ≤ A<sub>j</sub> ≤ A<sub>n−1</sub> < B<sub>n</sub>, so the last element adds no inversions. Drop it: A<sub>n</sub> − A<sub>n−1</sub> choices for it, times X<sub>n−1</sub>.
- **B<sub>n−1</sub> = B<sub>n</sub>:** another element is either bigger than both copies, smaller than both, or equal, so it adds 0 or 2 inversions. Removing the pair keeps parity: A<sub>n−1</sub> shared values, times X<sub>n−2</sub>.

That is the recurrence, with X<sub>0</sub> = 1 (empty sequence, even) and X<sub>1</sub> = A<sub>1</sub> (one element, no inversions).

> **Insight:** Pick the involution that touches as little as possible (here, the last two cells). Its fixed points then fall into cases that look like the same problem one or two sizes smaller, which is a recurrence.

## Run the recurrence on (2, 2, 3)

```fig title="Figure 3: X for A = (2, 2, 3) is 1, 2, 2, 6, so odd = (12 − 6) / 2 = 3"
row
x0: box "X0 = 1" body "empty"
x1: box "X1 = 2" body "A1"
x2: box "X2 = 2" body "(2-2)·2 + 2·1"
x3: main "X3 = 6" body "(3-2)·2 + 2·2"
x0 -> x1
x1 -> x2
x2 -> x3
```

X<sub>2</sub> = 2 says that of the 4 sequences for A = (2, 2), three are even and one ((2, 1)) is odd. In X<sub>3</sub>, the term 1 · X<sub>2</sub> = 2 matches the bottom row of Figure 1 (three even, one odd), and 2 · X<sub>1</sub> = 4 matches its middle row (four even).

The core is a few lines of C++. Reduce A<sub>i</sub> modulo the prime before multiplying, because A<sub>i</sub> − A<sub>i−1</sub> can be close to 10<sup>9</sup>:

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

This is the full [`odd_inversion.cpp`](/labs/cp-weekly-odd-inversion/odd_inversion.cpp) run on the three official samples, then 5,000 random small cases checked against brute force, then the largest allowed input (sum of N = 400,000). Real output:

```zsh
$ g++ -O2 -std=c++17 -o odd_inversion odd_inversion.cpp
$ ./odd_inversion < sample.txt
1
3
610589585
$ ./odd_inversion stress 5000
stress: 5000 random cases (N <= 7, A_i <= 5), all match brute force
$ ./odd_inversion bench
bench: T=2, N=200000 each, A_i up to 1e9: 4.13 ms (checksum 468184698)
```

**O(N) time and O(1) extra memory per test.** All three samples match the expected output (1, 3, 610589585).

Common mistakes:

- **The cancellation needs A to be non-decreasing.** Without it, a swap can push a value above its bound, and B<sub>n</sub> > A<sub>n−1</sub> no longer means it's bigger than everything before it. The problem guarantees A is sorted, and the proof uses that twice.
- **X can be negative.** In modular code that's just a residue, so subtract with `+ MOD` before halving.
- **An involution has to pick the same spot for both partners.** Here the spot is always the last two cells, so that holds. A rule like "swap the first descent" fails: after the swap that spot is no longer a descent, so the partner picks a different spot and the pairing breaks.

> **Insight:** Before writing a DP over inversion counts, ask whether only the parity is needed. If so, the inversion structure usually collapses to a two-term recurrence.

## Watch the pairs cancel in your browser

The Python version prints every sequence, the partner it cancels with, or the reason it survives. Then it stress-tests the recurrence against brute force. Try your own A, for example `--show 1 3 3 4`:

<div data-lab="py" data-src="/labs/cp-weekly-odd-inversion/cancel.py" data-args="--show 2 2 3" data-presets="--show 2 2 3|--show 2 3|--show 1 3 3 4|--stress"></div>

## Also this week: ABC478 F counts trees with a previous-greater pointer

**Problem:** run a "min-first search" from vertex 1 (always expand the smallest discovered vertex, using a min-heap). Given the visit order Q, count the trees that produce it.

**Example:** Q = (1, 3, 4, 2, 5) has 8 trees. For each vertex, its parent must lie between the **previous greater element** in Q and the position just before it:

```fig title="Figure 4: Each vertex's parent lies in a window that starts at its previous greater element, so the count is 1 · 2 · 1 · 4 = 8"
row
v3: box "3" body "prev greater: none\nparent in {1}\n× 1"
v4: box "4" body "prev greater: none\nparent in {1, 3}\n× 2"
v2: box "2" body "prev greater: 4\nparent in {4}\n× 1"
v5: box "5" body "prev greater: none\nparent in {1,3,4,2}\n× 4"
row
r: main "1 · 2 · 1 · 4 = 8 trees" span 4
v3 -> r
v4 -> r
v2 -> r
v5 -> r
```

Why the window: say g is the last value before Q<sub>i</sub> that is bigger than it. If Q<sub>i</sub>'s parent were popped before g, then Q<sub>i</sub> would already be in the heap when g was popped. Q<sub>i</sub> < g, so Q<sub>i</sub> would have been popped first, a contradiction. Any parent from g onwards works, and the choices are independent, so the answer is the product of the window sizes. The editorial's jump-pointer loop (`p = prev_greater[p]`) finds all windows in amortized O(N), like a monotonic stack.

```zsh
$ python also_this_week.py --minfirst
N=1:      1 trees,    1 orders, formula matches all
N=2:      1 trees,    1 orders, formula matches all
N=3:      3 trees,    2 orders, formula matches all
N=4:     16 trees,    6 orders, formula matches all
N=5:    125 trees,   24 orders, formula matches all
N=6:   1296 trees,  120 orders, formula matches all
N=7:  16807 trees,  720 orders, formula matches all
sample 1, Q = (1,3,4,2,5): 8
```

Every labelled tree up to N = 7 was enumerated (via Prüfer sequences), and the formula matched the count for every possible order. The same formula reproduces samples 2 and 3 (868586527 and 910753763).

> **Insight:** In anything driven by a priority queue, the previous greater element marks the latest moment a smaller item could have entered the queue without being popped too early.

## Also this week: ARC231 D, the second player wins by mirroring

**Problem:** N piles of N − 1 stones. On each turn, First removes 1 to K stones from one pile, and Second removes one stone each from 1 to K different piles. Whoever can't move loses. Choose a side and win (it's interactive).

The trick is to **colour the stones**: pile i holds one stone of every colour except i. Then "pile i has colour c" exactly when "pile c has colour i", which is a symmetric matrix. When First takes colours c<sub>1</sub>…c<sub>j</sub> from pile i (j ≤ K), Second removes colour i from piles c<sub>1</sub>…c<sub>j</sub> (also j ≤ K piles). Those stones must exist by symmetry, and the matrix becomes symmetric again.

```fig title="Figure 5: With N = 3, every move by First has a mirror move by Second that restores the symmetry"
layout stack
panel "Start: symmetric"
row
p1: box "pile 1" body "{2, 3}"
p2: box "pile 2" body "{1, 3}"
p3: box "pile 3" body "{1, 2}"
panel "First: colours 2, 3 from pile 1"
row
f1: deny "pile 1" body "{ }"
f2: box "pile 2" body "{1, 3}"
f3: box "pile 3" body "{1, 2}"
panel "Second: colour 1 from piles 2, 3"
row
g1: box "pile 1" body "{ }"
g2: allow "pile 2" body "{3}"
g3: allow "pile 3" body "{2}"
```

The game is finite and Second always has a reply, so First runs out of moves first. Exhaustive search agrees for every small case:

```zsh
$ python also_this_week.py --game
N=2 K=1: Second wins
N=2 K=2: Second wins
N=3 K=1: Second wins
N=3 K=2: Second wins
N=3 K=3: Second wins
N=4 K=1: Second wins
N=4 K=2: Second wins
N=4 K=3: Second wins
N=4 K=4: Second wins
N=5 K=1: Second wins
N=5 K=2: Second wins
N=5 K=3: Second wins
N=5 K=4: Second wins
N=5 K=5: Second wins
```

All 14 pairs with 2 ≤ N ≤ 5 and 1 ≤ K ≤ N say Second.

> **Insight:** If a game starts and ends in a symmetric position, look for a labelling that turns each opponent move into a move you can copy. The labels live only in your strategy, not in the problem.

## Try it

The opening's 12 sequences came down to 3 without counting a single odd one: 4 cancelled in pairs, and the other 8 shrank into the same problem one or two sizes smaller. The same reflex (sign the objects, pair them off, count what's left) is worth trying on the next parity question you meet.

Everything above runs from [`/labs/cp-weekly-odd-inversion/`](/labs/cp-weekly-odd-inversion/odd_inversion.cpp) on your own machine:

```zsh
g++ -O2 -std=c++17 -o odd_inversion odd_inversion.cpp
./odd_inversion < sample.txt && ./odd_inversion stress 5000 && ./odd_inversion bench
python3 cancel.py --show 1 3 3 4
python3 also_this_week.py --minfirst && python3 also_this_week.py --game
```

Practice, from closest to furthest:

- [ARC231 E, Odd Inversion](https://atcoder.jp/contests/arc231/tasks/arc231_e): submit the recurrence.
- Exercise: use the same swap to show that for n ≥ 2, exactly half of the n! permutations have an odd number of inversions. Which fixed points disappear when all values are distinct?
- [CSES 2229, Permutation Inversions](https://cses.fi/problemset/task/2229) and [LeetCode 629, K Inverse Pairs Array](https://leetcode.com/problems/k-inverse-pairs-array/): the full distribution of inversion counts, where parity is not enough and a prefix-sum DP is needed.
- [ABC478 F](https://atcoder.jp/contests/abc478/tasks/abc478_f) and [ARC231 D](https://atcoder.jp/contests/arc231/tasks/arc231_d) from this week.

<details>
<summary>Sources, method and limits</summary>

- **Sources:** ARC231 [E editorial](https://atcoder.jp/contests/arc231/editorial/26557) and [D editorial](https://atcoder.jp/contests/arc231/editorial/26555) by evima; ABC478 [F editorial](https://atcoder.jp/contests/abc478/editorial/26546) (English translation of MMNMM's). The recurrence and the window rule come from those editorials. The proofs here are written out from them.
- **What was run:** the C++ solution on the official samples, a stress test against brute force (5,000 cases, N ≤ 7, A<sub>i</sub> ≤ 5), and a timing at the maximum constraints on one machine (4.13 ms; your numbers will differ). ABC478 F was checked against every labelled tree up to N = 7, and ARC231 D by exhaustive game search up to N = 5. None of these solutions has been submitted to the AtCoder judge.
- **The week was thin.** No rated Codeforces round ran between September 29 and October 6 (Round 1124 was September 26; Round 1125 is October 7). The Codeforces blog, and the cp-algorithms and USACO Guide change logs, couldn't be reached from the research environment, so they aren't covered.

</details>
