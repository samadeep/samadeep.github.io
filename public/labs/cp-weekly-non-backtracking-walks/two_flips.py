"""ARC232 B "Two Flips" as a walk on the value graph.

Values are vertices, card i is an edge A_i - B_i. Find the shortest walk that starts on
card 1 (B1 -> A1), ends on card 2 (A2 -> B2) and never uses the same card twice in a row.
Each meeting point of two consecutive cards is one operation. Then replay those operations
in some legal order on real cards to show the order always works out.
"""
import random, sys
from collections import deque

def shortest_walk(A, B, non_backtracking=True):
    n = len(A)
    adj = {}
    for i in range(n):
        adj.setdefault(A[i], []).append(i); adj.setdefault(B[i], []).append(i)
    end = lambda s: A[s // 2] if s % 2 == 0 else B[s // 2]   # state 2i+d: stand at A_i (d=0) or B_i
    par = {0: None}; q = deque([0])                           # walked card 1 from B1 to A1
    while q:
        s = q.popleft(); i, at = s // 2, end(s)
        if s == 3:                                            # walked card 2 from A2 to B2
            walk = []
            while s is not None: walk.append(s); s = par[s]
            return walk[::-1]
        for j in adj[at]:
            if non_backtracking and j == i: continue
            t = 2 * j + (1 if A[j] == at else 0)
            if t not in par: par[t] = s; q.append(t)
    return None

def replay(A, B, walk):
    """Turn the walk into operations and apply them in any order that is legal right now."""
    ops = [(walk[k] // 2, walk[k + 1] // 2, A[walk[k] // 2] if walk[k] % 2 == 0 else B[walk[k] // 2])
           for k in range(len(walk) - 1)]
    down = [False] * len(A); shown = lambda c: B[c] if down[c] else A[c]; done = []
    while ops:
        k = next((k for k, (x, y, v) in enumerate(ops) if shown(x) == v and shown(y) == v), None)
        if k is None: return done, None
        x, y, v = ops.pop(k); down[x] ^= True; down[y] ^= True
        done.append((x, y, v, "".join("v" if d else "^" for d in down)))
    return done, down


def brute(A, B):
    """BFS over all 2^N face-up/face-down states."""
    n = len(A); dist = {0: 0}; q = deque([0])
    while q:
        m = q.popleft()
        if m == 3: return dist[m]
        for x in range(n):
            for y in range(x + 1, n):
                vx = B[x] if m >> x & 1 else A[x]; vy = B[y] if m >> y & 1 else A[y]
                t = m ^ (1 << x) ^ (1 << y)
                if vx == vy and t not in dist: dist[t] = dist[m] + 1; q.append(t)
    return -1

def simple_path(A, B):
    """A tempting wrong model: a path that never reuses a card (DFS, tiny inputs only)."""
    n = len(A); best = [None]
    def go(i, at, used, length):
        if i == 1 and at == B[1]:
            if best[0] is None or length < best[0]: best[0] = length
            return
        for j in range(n):
            if j in used or at not in (A[j], B[j]): continue
            go(j, B[j] if A[j] == at else A[j], used | {j}, length + 1)
    go(0, A[0], {0}, 1)
    return -1 if best[0] is None else best[0] - 1

def stress(cases, seed=1):
    rng = random.Random(seed); stuck = 0; wrong = {"walk BFS": 0, "plain BFS (reuse allowed)": 0, "simple path": 0}
    for _ in range(cases):
        n = rng.randint(2, 7); vals = range(1, rng.randint(2, 5) + 1)
        A, B = map(list, zip(*[tuple(rng.sample(vals, 2)) for _ in range(n)]))
        truth = brute(A, B)
        ans = lambda w: -1 if w is None else len(w) - 1
        wrong["walk BFS"] += ans(shortest_walk(A, B)) != truth
        wrong["plain BFS (reuse allowed)"] += ans(shortest_walk(A, B, False)) != truth
        wrong["simple path"] += simple_path(A, B) != truth
        w = shortest_walk(A, B)
        if w is not None:
            stuck += replay(A, B, w)[1] != [i < 2 for i in range(n)]
    print(f"{cases} random cases checked against the 2^N brute force")
    for k, v in wrong.items(): print(f"  {k:<27} wrong on {v}")
    print(f"  greedy replay of the walk got stuck on {stuck}")

CASES = {
    "sample":  ([1, 2, 1, 2], [4, 5, 3, 3]),
    "trap":    ([1, 2], [2, 3]),
    "reuse":   ([1, 2, 3, 3], [2, 1, 2, 2]),
}

def show(name, A, B):
    print(f"cards (A,B): {list(zip(A, B))}")
    w = shortest_walk(A, B)
    plain = shortest_walk(A, B, non_backtracking=False)
    if plain: print(f"walk that ignores the rule: {len(plain) - 1} operations (cards {[s // 2 + 1 for s in plain]})")
    if w is None: print("answer: -1 (no non-backtracking walk)"); return
    print(f"walk: cards {[s // 2 + 1 for s in w]}, answer {len(w) - 1}")
    done, down = replay(A, B, w)
    for x, y, v, st in done: print(f"  flip cards {x + 1} and {y + 1} (both show {v})  ->  {st}")
    goal = [i < 2 for i in range(len(A))]
    print("goal reached:", down == goal)

if __name__ == "__main__":
    arg = sys.argv[1] if len(sys.argv) > 1 else "sample"
    if arg == "--stress":
        stress(int(sys.argv[2]) if len(sys.argv) > 2 else 2000)
    elif arg == "random":
        rng = random.Random(int(sys.argv[2]) if len(sys.argv) > 2 else 1)
        while True:
            n = rng.randint(4, 8); vals = range(1, rng.randint(3, 6) + 1)
            A, B = zip(*[tuple(rng.sample(vals, 2)) for _ in range(n)])
            if shortest_walk(list(A), list(B)): break
        show("random", list(A), list(B))
    else:
        show(arg, *CASES[arg])
