---
title: 'Dynamic Programming: Knapsack and Minimum Swaps, Explained'
description: 'The 0/1 knapsack and LeetCode 801 Minimum Swaps, explained through one question: what does a DP need to remember? With a lab checked against brute force.'
hook:
  stat: '220 → 300'
  caption: 'knapsack answer when one loop runs forwards instead of backwards'
date: '2025-07-06'
updated: '2026-10-08'
topic: algorithms
series: algorithm-deep-dives
tags: [dynamic-programming, knapsack, competitive-programming, leetcode]
problems:
  - platform: LeetCode
    id: '801'
    title: Minimum Swaps To Make Sequences Increasing
    url: https://leetcode.com/problems/minimum-swaps-to-make-sequences-increasing/
    difficulty: Hard
---

Here's a knapsack solution with a bug in it. Can you spot it?

```cpp
for (int i = 0; i < n; i++)
    for (int w = weights[i]; w <= W; w++)
        dp[w] = max(dp[w], dp[w - weights[i]] + values[i]);
```

It compiles. It runs. On the classic example (items of 10, 20 and 30 kg worth 60, 100 and 120, in a 50 kg bag) it confidently answers **300**. The right answer is **220**.

The whole bug is the direction of one loop. And understanding *why* the direction matters is the best way into dynamic programming, because it comes down to the one question every DP has to answer: **what do I need to remember?** Let's take two classic problems through it. The lab below runs both, checked against brute force.

<div data-lab="py" data-src="/labs/dp-deep-dive/dp_lab.py" data-presets="--knapsack|--swaps|--stress"></div>

## The knapsack: take it or leave it

You have **N items**, each with a weight and a value, and a bag that holds **W**. Pick items to maximise the value without going over. Each item can be taken **at most once**: that's the "0/1".

Look at one item at a time and there are only two choices. **Leave it**, and the best you can do is whatever the other items manage. **Take it**, and you get its value plus the best the other items can do in the capacity that's left. That gives the recurrence:

```text
dp[i][w] = max( dp[i-1][w],                          leave item i
                dp[i-1][w - weight[i]] + value[i] )  take item i
```

`dp[i][w]` is the best value using the first `i` items with capacity `w`. What does it need to remember about the past? Only **how much capacity is left**. Not which items you took, not in what order. That's why a whole exponential search collapses into a table of size N × W.

```fig title="Each cell only looks one row up: leave the item (straight up) or take it (up and left)"
row
up: box "dp[i-1][w - wt]\nrow above, less capacity"
_
above: box "dp[i-1][w]\nrow above, same capacity"
row
_
cell: main "dp[i][w]" span 2
up -> cell "take: + value"
above -> cell "leave"
```

## The one-character bug

You don't need the whole table. Each row only reads the row above it, so one array is enough, *if* you're careful:

```cpp
int knapsack(vector<int>& weights, vector<int>& values, int W) {
    vector<int> dp(W + 1, 0);
    for (int i = 0; i < weights.size(); i++)
        for (int w = W; w >= weights[i]; w--)      // backwards!
            dp[w] = max(dp[w], dp[w - weights[i]] + values[i]);
    return dp[W];
}
```

Now the bug makes sense. When you update `dp[w]`, you need `dp[w - weight]` from the *previous* row: the world before this item existed. Go **backwards**, and `dp[w - weight]` hasn't been touched yet in this pass, so it's still the old value. Go **forwards**, and you've *already* updated it to include this item, so you take the item again. And again.

```text
items (weight, value): [(10, 60), (20, 100), (30, 120)], capacity 50
backwards loop:  220
forwards loop:   300   <- five copies of the 10 kg item
brute force:     220
```

Five copies of the 10 kg item: 5 × 60 = 300. The forwards loop isn't wrong so much as answering a different question. It's the **unbounded** knapsack, where you can take each item as often as you like. One character of loop direction picks which problem you're solving.

> **Insight:** When you squash a DP table into one array, the loop direction decides whether you read the old row or the new one. Backwards reads the past (each item once); forwards reads the present (items reused).

## Minimum swaps: remember one bit

Now a problem that looks completely different. [LeetCode 801](https://leetcode.com/problems/minimum-swaps-to-make-sequences-increasing/): two arrays of equal length. At any position you may swap `A[i]` with `B[i]`. What's the fewest swaps to make **both** strictly increasing? (The problem promises it's always possible.)

```text
A = [1, 3, 5, 4]
B = [1, 2, 3, 7]
```

Brute force tries all 2ⁿ swap patterns. But ask the DP question: to decide position `i`, what do you need to remember about everything before it? Only **one bit**: whether position `i-1` was swapped. Nothing earlier matters, because "strictly increasing" only ever compares neighbours.

So keep two numbers as you walk left to right: `keep`, the fewest swaps so far if position `i` stays as it is, and `swap`, the fewest if it's swapped. At each step, check which pairings of neighbours are increasing:

- **Same order works** (`A[i-1] < A[i]` and `B[i-1] < B[i]`): copy the previous choice. Kept stays kept; swapped stays swapped (one more swap).
- **Crossed order works** (`A[i-1] < B[i]` and `B[i-1] < A[i]`): flip the previous choice. If the last one was kept, swap this one; if it was swapped, keep this one.

Often both are true, and you take the better of the two. Here's the whole thing:

```cpp
int minSwap(vector<int>& A, vector<int>& B) {
    int swap = 1, keep = 0;
    for (int i = 1; i < A.size(); i++) {
        int s = INT_MAX, k = INT_MAX;
        if (A[i-1] < A[i] && B[i-1] < B[i]) { s = swap + 1; k = keep; }                    // same choice
        if (A[i-1] < B[i] && B[i-1] < A[i]) { s = min(s, keep + 1); k = min(k, swap); }   // flipped choice
        swap = s; keep = k;
    }
    return min(swap, keep);
}
```

Watch it walk the example (run the `--swaps` preset):

```text
  i=0  A,B=(1,1)  keep=0 swap=1
  i=1  A,B=(3,2)  keep=0 swap=1
  i=2  A,B=(5,3)  keep=0 swap=2
  i=3  A,B=(4,7)  keep=2 swap=1
minimum swaps: 1   (brute force over all 2^4 choices: 1)
```

At the last position, swapping 4 and 7 gives `A = [1, 3, 5, 7]` and `B = [1, 2, 3, 4]`. One swap. O(n) time, two integers of memory.

## The same question, twice

Two problems that look nothing alike, solved the same way. For the knapsack, the past boils down to *how much room is left*. For the swaps, it boils down to *one bit*. Get that right and the rest is bookkeeping. Get it wrong (remember too little, or read the wrong row) and you get a confident 300 when the answer is 220.

Next time you're stuck on a DP, don't start with the recurrence. Start by asking what you'd need to remember to make the next decision, and nothing more.

## Try it

The lab above runs in your browser. On your own machine (standard library only):

```zsh
curl -O https://samadeep.github.io/labs/dp-deep-dive/dp_lab.py
python3 dp_lab.py --stress     # both DPs vs brute force, 2,000 random cases each
```

To practise: change the knapsack to the unbounded version on purpose (it's one loop direction), then try [0/1 knapsack on AtCoder DP Contest D](https://atcoder.jp/contests/dp/tasks/dp_d) and [LeetCode 801](https://leetcode.com/problems/minimum-swaps-to-make-sequences-increasing/) itself.

<details>
<summary>Complexity and what was checked</summary>

| Problem | Time | Space (table) | Space (squashed) |
|---|---|---|---|
| 0/1 knapsack | O(n × W) | O(n × W) | O(W) |
| Minimum swaps | O(n) | O(n) | O(1) |

- `dp_lab.py --stress` checks the backwards knapsack against brute force on 2,000 random cases (up to 8 items, capacity up to 30) and the minimum-swaps DP on 2,000 random solvable cases (length up to 8). All match.
- If you need *which* items the knapsack took, keep the full N × W table and walk back from `dp[n][W]`: wherever `dp[i][w] != dp[i-1][w]`, item `i` was taken.
- This post was rewritten in October 2026 from a July 2025 write-up, with the runnable lab added.

</details>
