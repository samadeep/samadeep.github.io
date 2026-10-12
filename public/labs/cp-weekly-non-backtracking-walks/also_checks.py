"""Checks for the two 'also this week' rules quoted in the post.

1. ARC232 C: with exactly s global +1 steps, a value a can become b using 0, 1 or 2
   negations (or never). Brute force over interleavings vs the editorial's rule.
2. ABC479 G (vertical moves only): min over x of sum |A_i x - B_i| sits at a weighted
   median of the slopes B_i/A_i with weights A_i.
"""
from fractions import Fraction
from itertools import product

def brute_cost(a, b, s):
    best = None
    for k in range(3):                       # k negations placed among s additions
        for places in product(range(s + 1), repeat=k):
            if list(places) != sorted(places): continue
            v, p = a, 0
            for step in range(s + 1):
                while p < k and places[p] == step: v = -v; p += 1
                if step < s: v += 1
            if v == b: best = k if best is None else min(best, k)
        if best is not None: return best
    return None

def rule_cost(a, b, s):
    if (a + s - b) % 2 or abs(abs(a) - abs(b)) > s: return None
    if b - a == s: return 0
    if abs(b + a) <= s: return 1
    return 2

bad = 0; seen = {0: 0, 1: 0, 2: 0, None: 0}
for a in range(-6, 7):
    for b in range(-6, 7):
        for s in range(0, 11):
            c = brute_cost(a, b, s); seen[c] += 1
            bad += c != rule_cost(a, b, s)
print(f"ARC232 C cost rule: {sum(seen.values())} (a, b, s) triples, {bad} mismatches;",
      f"cost 0: {seen[0]}, 1: {seen[1]}, 2: {seen[2]}, impossible: {seen[None]}")
print("example a=-3, b=4:", {s: rule_cost(-3, 4, s) for s in range(0, 9)})

pts = [(1, 3), (2, 2), (1, 0), (3, 7), (2, 9)]
cost = lambda x: sum(abs(a * x - b) for a, b in pts)
slopes = sorted((Fraction(b, a), a) for a, b in pts)
tot, run = sum(a for _, a in slopes), 0
for r, a in slopes:
    run += a
    if 2 * run >= tot: med = r; break
grid = min((cost(Fraction(k, 100)), Fraction(k, 100)) for k in range(0, 1001))
print("ABC479 G points:", pts)
print("slopes with weights:", [(str(r), a) for r, a in slopes])
print(f"weighted median slope {med}, cost {cost(med)}; best on a 0.01 grid: cost {grid[0]} at x={grid[1]}")
