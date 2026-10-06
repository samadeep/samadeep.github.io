"""Brute-force checks for the two shorter ideas in CP Weekly #1.

  python also_this_week.py --minfirst   ABC478 F: product formula vs every labelled tree (N <= 7)
  python also_this_week.py --game       ARC231 D: who wins, solved exhaustively for small N, K
"""
import heapq, itertools, random, sys
from functools import lru_cache

# ---------- ABC478 F: Min-First Search ----------
def trees(n):
    """every labelled tree on 1..n, from Pruefer sequences"""
    if n == 1:
        yield []
        return
    for seq in itertools.product(range(1, n + 1), repeat=n - 2):
        deg = [1] * (n + 1)
        for x in seq:
            deg[x] += 1
        edges = []
        for x in seq:
            leaf = min(v for v in range(1, n + 1) if deg[v] == 1)
            edges.append((leaf, x)); deg[leaf] -= 1; deg[x] -= 1
        u, v = [w for w in range(1, n + 1) if deg[w] == 1]
        edges.append((u, v))
        yield edges

def f(n, edges):
    adj = {v: [] for v in range(1, n + 1)}
    for u, v in edges:
        adj[u].append(v); adj[v].append(u)
    order, heap, seen = [], [1], {1}
    while heap:
        x = heapq.heappop(heap); order.append(x)
        for y in adj[x]:
            if y not in seen:
                seen.add(y); heapq.heappush(heap, y)
    return tuple(order)

def formula(q):
    """prod over i of (i - p_i), p_i = index of the previous greater element (0 if none)"""
    prev, ans = [0] * len(q), 1
    for i in range(1, len(q)):
        p = i - 1
        while p and q[p] < q[i]:
            p = prev[p]
        prev[i] = p
        ans *= i - p
    return ans

def check_minfirst():
    for n in range(1, 8):
        count = {}
        for t in trees(n):
            k = f(n, t); count[k] = count.get(k, 0) + 1
        perms = [(1,) + p for p in itertools.permutations(range(2, n + 1))]
        assert all(count.get(q, 0) == formula(q) for q in perms)
        print(f"N={n}: {n ** (n - 2) if n > 1 else 1:>6} trees, {len(perms):>4} orders, formula matches all")
    print("sample 1, Q = (1,3,4,2,5):", formula((1, 3, 4, 2, 5)))

# ---------- ARC231 D: Choose Your Role ----------
def check_game():
    for n in range(2, 6):
        for k in range(1, n + 1):
            @lru_cache(None)
            def wins(piles, first_to_move):
                """True if the player to move wins; piles is a sorted tuple"""
                moves = []
                if first_to_move:      # one pile, remove 1..k stones
                    for i, c in enumerate(piles):
                        for j in range(1, min(k, c) + 1):
                            moves.append(piles[:i] + (c - j,) + piles[i + 1:])
                else:                  # 1..k distinct non-empty piles, one stone each
                    idx = [i for i, c in enumerate(piles) if c]
                    for r in range(1, min(k, len(idx)) + 1):
                        for pick in itertools.combinations(idx, r):
                            moves.append(tuple(c - (i in pick) for i, c in enumerate(piles)))
                return any(not wins(tuple(sorted(m)), not first_to_move) for m in moves)
            first = wins(tuple([n - 1] * n), True)
            print(f"N={n} K={k}: {'First' if first else 'Second'} wins")

if __name__ == "__main__":
    arg = sys.argv[1] if len(sys.argv) > 1 else "--minfirst"
    check_game() if arg == "--game" else check_minfirst()
