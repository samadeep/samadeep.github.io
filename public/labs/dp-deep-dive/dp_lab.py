"""Two classic DPs, checked against brute force (standard library only).

  python dp_lab.py                 knapsack: the backwards loop vs the one-character "bug" (forwards)
  python dp_lab.py --swaps         minimum swaps to make two sequences increasing, step by step
  python dp_lab.py --stress        both DPs against brute force on random inputs
"""
import argparse, itertools, random

p = argparse.ArgumentParser()
p.add_argument("--knapsack", action="store_true", help="the default demo")
p.add_argument("--swaps", action="store_true")
p.add_argument("--stress", action="store_true")
a = p.parse_args()

def knapsack(weights, values, W, forwards=False):
    dp = [0] * (W + 1)                       # dp[w] = best value with capacity w
    for wt, val in zip(weights, values):
        rng = range(wt, W + 1) if forwards else range(W, wt - 1, -1)
        for w in rng:
            dp[w] = max(dp[w], dp[w - wt] + val)
    return dp[W]

def knapsack_brute(weights, values, W):
    best = 0
    for pick in itertools.product([0, 1], repeat=len(weights)):
        if sum(p * w for p, w in zip(pick, weights)) <= W:
            best = max(best, sum(p * v for p, v in zip(pick, values)))
    return best

def min_swap(A, B, trace=False):
    swap, keep = 1, 0                        # best so far if position i is swapped / kept
    if trace: print(f"  i=0  A,B=({A[0]},{B[0]})  keep={keep} swap={swap}")
    for i in range(1, len(A)):
        INF = float("inf"); s, k = INF, INF
        if A[i-1] < A[i] and B[i-1] < B[i]:  # same choice as before still works
            s, k = swap + 1, keep
        if A[i-1] < B[i] and B[i-1] < A[i]:  # the opposite choice works too
            s, k = min(s, keep + 1), min(k, swap)
        swap, keep = s, k
        if trace: print(f"  i={i}  A,B=({A[i]},{B[i]})  keep={keep} swap={swap}")
    return min(swap, keep)

def min_swap_brute(A, B):
    best = None
    for pick in itertools.product([0, 1], repeat=len(A)):
        x = [b if p else a_ for a_, b, p in zip(A, B, pick)]
        y = [a_ if p else b for a_, b, p in zip(A, B, pick)]
        if all(x[i] < x[i+1] for i in range(len(x)-1)) and all(y[i] < y[i+1] for i in range(len(y)-1)):
            best = sum(pick) if best is None else min(best, sum(pick))
    return best

if a.stress:
    rng = random.Random(7); ks = sw = 0
    for _ in range(2000):
        n = rng.randint(1, 8); W = rng.randint(0, 30)
        wt = [rng.randint(1, 12) for _ in range(n)]; val = [rng.randint(1, 50) for _ in range(n)]
        assert knapsack(wt, val, W) == knapsack_brute(wt, val, W); ks += 1
    while sw < 2000:
        n = rng.randint(1, 8); A = [rng.randint(0, 12) for _ in range(n)]; B = [rng.randint(0, 12) for _ in range(n)]
        want = min_swap_brute(A, B)
        if want is None: continue            # the problem promises an answer exists
        assert min_swap(A, B) == want; sw += 1
    print(f"knapsack: {ks} random cases match brute force")
    print(f"min swaps: {sw} random solvable cases match brute force")
elif a.swaps:
    A, B = [1, 3, 5, 4], [1, 2, 3, 7]
    print(f"A = {A}\nB = {B}")
    ans = min_swap(A, B, trace=True)
    print(f"minimum swaps: {ans}   (brute force over all 2^{len(A)} choices: {min_swap_brute(A, B)})")
else:
    weights, values, W = [10, 20, 30], [60, 100, 120], 50
    print(f"items (weight, value): {list(zip(weights, values))}, capacity {W}")
    print(f"backwards loop:  {knapsack(weights, values, W)}")
    print(f"forwards loop:   {knapsack(weights, values, W, forwards=True)}   <- five copies of the 10 kg item")
    print(f"brute force:     {knapsack_brute(weights, values, W)}")
