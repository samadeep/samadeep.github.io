"""CP Weekly #1: every other problem from ARC231 and ABC478, each with a fast solution
checked against brute force on random small inputs.

  python more_this_week.py            run every check
  python more_this_week.py arc231a    run one (arc231a arc231b arc231c arc231f abc478c abc478d abc478e abc478g)
"""
import itertools, random, sys
from fractions import Fraction
from math import gcd

rng = random.Random(478231)

# ---------------------------------------------------------------- ARC231 A
# Monsters arrive in order at (X, Y). Sword: walk there, pay squared distance. Magic: pay Z, stay.
def arc231a_fast(ev):
    """Pay every Z up front; a sword strike then costs dist^2 - Z. Split each squared move into an
    x-move and a y-move done at different times: after striking at (X, Y), pay the y-move to every
    future y at once (stay at column X); before striking at (X', Y'), pay the x-move."""
    W = max([x for x, _, _ in ev] + [y for _, y, _ in ev]) + 1
    INF = float("inf")
    dp = [[INF] * W for _ in range(W)]   # dp[x][y]: last strike in column x, y-move to y already paid
    for y in range(W):
        dp[0][y] = y * y                 # start at (0, 0)
    best = 0                             # all magic
    for X, Y, Z in ev:
        v = min(dp[x][Y] + (x - X) ** 2 for x in range(W)) - Z
        best = min(best, v)
        for y in range(W):
            dp[X][y] = min(dp[X][y], v + (y - Y) ** 2)
    return sum(z for _, _, z in ev) + best

def arc231a_brute(ev):
    n = len(ev); INF = float("inf")
    f = [INF] * n                        # f[i]: min cost of events 0..i with a strike at i
    for i, (X, Y, Z) in enumerate(ev):
        f[i] = X * X + Y * Y + sum(z for _, _, z in ev[:i])
        for j in range(i):
            xj, yj, _ = ev[j]
            f[i] = min(f[i], f[j] + sum(z for _, _, z in ev[j + 1:i]) + (X - xj) ** 2 + (Y - yj) ** 2)
    tail = [sum(z for _, _, z in ev[i + 1:]) for i in range(n)]
    return min([sum(z for _, _, z in ev)] + [f[i] + tail[i] for i in range(n)])

def check_arc231a():
    assert arc231a_fast([(0, 4, 28), (2, 9, 11), (4, 5, 26)]) == 44
    assert arc231a_fast([(6, 0, 96), (0, 2, 54), (9, 0, 36), (0, 7, 81), (6, 5, 91), (2, 8, 71), (7, 6, 40)]) == 231
    for _ in range(1500):
        ev = [(rng.randrange(6), rng.randrange(6), rng.randint(1, 60)) for _ in range(rng.randint(1, 7))]
        assert arc231a_fast(ev) == arc231a_brute(ev), ev
    print("ARC231 A: samples (44, 231) + 1500 random cases match the O(N^2) DP")

# ---------------------------------------------------------------- ARC231 B
def mex(s):
    m = 0
    while m in s:
        m += 1
    return m

def arc231b(A, B, C):
    """X must contain 0..A-1 and Y 0..B-1, so if two of those XOR to C there is no answer.
    Otherwise park everything else above bit 10: 1024 in X and 1024..1024+C-1 in Y produce
    exactly 0..C-1 below 1024 and only values >= 1024 elsewhere."""
    if any((x ^ C) < B for x in range(A)):
        return None
    return set(range(A)) | {1024}, set(range(B)) | set(range(1024, 1024 + C))

def check_arc231b():
    for A, B, C in itertools.product(list(range(0, 1001, 97)) + [1, 999, 1000], repeat=3):
        r = arc231b(A, B, C)
        if r is None:
            assert any((x ^ C) < B for x in range(A))
            continue
        X, Y = r
        assert max(X | Y | {0}) <= 2026
        assert mex(X) == A and mex(Y) == B and mex({x ^ y for x in X for y in Y}) == C
    assert arc231b(1, 1, 0) is None
    print(f"ARC231 B: {14 ** 3} (A, B, C) triples: every 'Yes' verified by computing all XORs, every 'No' has a forced collision")

# ---------------------------------------------------------------- ARC231 C
# Person i at x_i says "my nearest star is at distance d_i": a star at x_i - d_i or x_i + d_i,
# and none strictly inside (x_i - d_i, x_i + d_i).
def allowed(c, k, x, d):
    return not (x[k] - d[k] < c < x[k] + d[k])

def arc231c_brute(x, d):
    n = len(x)   # put a star on every candidate nobody forbids; then each person needs one
    return all(any(all(allowed(c, k, x, d) for k in range(n)) for c in (x[i] - d[i], x[i] + d[i])) for i in range(n))

def arc231c_fast_answers(x, d, queries):
    n = len(x)
    def good(i):
        return any(all(allowed(c, k, x, d) for k in (i - 1, i + 1) if 0 <= k < n) for c in (x[i] - d[i], x[i] + d[i]))
    bad = {i for i in range(n) if not good(i)}
    out = []
    for p, s in queries:
        d[p] = s
        for i in (p - 1, p, p + 1):
            if 0 <= i < n:
                (bad.discard if good(i) else bad.add)(i)
        out.append(not bad)
    return out

def check_arc231c():
    assert arc231c_fast_answers([2, 4, 8], [3, 1, 0], [(1, 3), (0, 7)]) == [True, False]
    assert arc231c_fast_answers([0], [0], [(0, 1)]) == [True]
    for _ in range(3000):
        n = rng.randint(1, 6)
        x = sorted(rng.sample(range(0, 14), n)); d = [rng.randint(0, 6) for _ in range(n)]
        qs = [(rng.randrange(n), rng.randint(0, 6)) for _ in range(5)]
        dd = d[:]; want = []
        for p, s in qs:
            dd[p] = s; want.append(arc231c_brute(x, dd))
        assert arc231c_fast_answers(x, d[:], qs) == want, (x, d, qs)
    print("ARC231 C: samples + 3000 random cases (5 updates each): checking only neighbours matches checking everyone")

# ---------------------------------------------------------------- ARC231 F
def arc231f_min_root_brute(N):
    m = 2 ** N - 1; best = None
    for perm in itertools.permutations(range(1, m + 1)):
        v = (0,) + perm; s = [0] * (m + 1); ok = True
        for i in range(m, 0, -1):
            if 2 * i <= m:
                if v[i] != abs(s[2 * i] - s[2 * i + 1]):
                    ok = False; break
                s[i] = v[i] + s[2 * i] + s[2 * i + 1]
            else:
                s[i] = v[i]
        if ok and (best is None or v[1] < best):
            best = v[1]
    return best

def arc231f_find_n4_root4():
    """Look for N = 4 (15 values) with root 4: sums must split 120 - 4 = 116 into 60 + 56."""
    vals = range(1, 16)
    two = {}   # depth-2 subtrees: (used mask) -> sum, for root |a - b|
    for a, b in itertools.permutations(vals, 2):
        r = abs(a - b)
        if r and r not in (a, b):
            two[(1 << r) | (1 << a) | (1 << b)] = (r + a + b, (r, a, b))
    three = {}
    items = list(two.items())
    for (m1, (s1, t1)), (m2, (s2, t2)) in itertools.product(items, repeat=2):
        if m1 & m2:
            continue
        r = abs(s1 - s2)
        if 1 <= r <= 15 and not (m1 | m2) >> r & 1:
            tot = r + s1 + s2
            if tot in (60, 56):
                three.setdefault((m1 | m2 | 1 << r, tot), (r, t1, t2))
    full = sum(1 << v for v in vals)
    for (m1, s1), t1 in three.items():
        if s1 == 60:
            for (m2, s2), t2 in three.items():
                if s2 == 56 and not m1 & m2 and (m1 | m2 | 1 << 4) == full:
                    return 4, t1, t2
    return None

def check_arc231f():
    assert arc231f_min_root_brute(2) == 1 and arc231f_min_root_brute(3) == 2
    found = arc231f_find_n4_root4()
    assert found is not None
    print("ARC231 F: min root is 1 for N=2 and 2 for N=3 (all permutations); N=4 reaches 4 =", found)

# ---------------------------------------------------------------- ABC478 C
def abc478c_fast(a, k):
    n = len(a); last = -1; mx = 0
    for i, v in enumerate(a):            # rightmost element smaller than something before it
        if v < mx:
            last = i
        mx = max(mx, v)
    first = n; mn = float("inf")
    for i in range(n - 1, -1, -1):       # leftmost element larger than something after it
        if a[i] > mn:
            first = i
        mn = min(mn, a[i])
    return last == -1 or last - first + 1 <= k

def abc478c_brute(a, k):
    return any(a[:i] + sorted(a[i:i + k]) + a[i + k:] == sorted(a) for i in range(len(a) - k + 1))

def check_abc478c():
    assert abc478c_fast([1, 4, 1, 4, 2, 1, 3, 5, 6], 6)
    for _ in range(4000):
        n = rng.randint(2, 8); a = [rng.randint(1, n) for _ in range(n)]; k = rng.randint(1, n - 1)
        assert abc478c_fast(a, k) == abc478c_brute(a, k), (a, k)
    print("ABC478 C: sample + 4000 random cases match trying every window")

# ---------------------------------------------------------------- ABC478 D
def abc478d_fast(n, ops):
    """Sweep positions; per value keep how many active ranges cover it. The answer changes only
    when a counter moves between 0 and 1."""
    add = [[] for _ in range(n + 2)]; rem = [[] for _ in range(n + 2)]
    for l, r, x in ops:
        add[l].append(x); rem[r + 1].append(x)
    cnt = {}; size = 0; out = []
    for i in range(1, n + 1):
        for x in rem[i]:
            cnt[x] -= 1; size -= cnt[x] == 0
        for x in add[i]:
            size += cnt.get(x, 0) == 0; cnt[x] = cnt.get(x, 0) + 1
        out.append(size)
    return out

def abc478d_brute(n, ops):
    sets = [set() for _ in range(n + 1)]
    for l, r, x in ops:
        for i in range(l, r + 1):
            sets[i].add(x)
    return [len(s) for s in sets[1:]]

def check_abc478d():
    ops = [(2, 5, 1), (1, 4, 2), (7, 8, 1), (3, 6, 3), (2, 5, 2)]
    assert abc478d_fast(8, ops) == [1, 2, 3, 3, 3, 1, 1, 1]
    for _ in range(3000):
        n = rng.randint(1, 9)
        ops = []
        for _ in range(rng.randint(1, 8)):
            l = rng.randint(1, n); ops.append((l, rng.randint(l, n), rng.randint(1, 4)))
        assert abc478d_fast(n, ops) == abc478d_brute(n, ops)
    print("ABC478 D: sample + 3000 random cases match building every set")

# ---------------------------------------------------------------- ABC478 E
def scc(n, edges):
    """Tarjan, iterative. Returns comp[v], numbered in reverse topological order."""
    g = [[] for _ in range(n)]
    for u, v in edges:
        g[u].append(v)
    idx = [-1] * n; low = [0] * n; on = [False] * n; st = []; comp = [-1] * n; t = 0; c = 0
    for s in range(n):
        if idx[s] != -1:
            continue
        work = [(s, 0)]
        while work:
            v, i = work.pop()
            if i == 0:
                idx[v] = low[v] = t; t += 1; st.append(v); on[v] = True
            if i < len(g[v]):
                work.append((v, i + 1)); w = g[v][i]
                if idx[w] == -1:
                    work.append((w, 0))
                elif on[w]:
                    low[v] = min(low[v], idx[w])
                continue
            if low[v] == idx[v]:
                while True:
                    w = st.pop(); on[w] = False; comp[w] = c
                    if w == v:
                        break
                c += 1
            if work:
                p = work[-1][0]; low[p] = min(low[p], low[v])
    return comp, c

def abc478e_fast(n, cons):
    """A <= cycle forces equal values, so collapse SCCs. A strict edge inside one SCC is a
    contradiction; otherwise number the SCCs in topological order."""
    comp, c = scc(n, [(u, v) for _, u, v in cons])
    if any(t == 1 and comp[u] == comp[v] for t, u, v in cons):
        return None
    return [c - comp[v] for v in range(n)]   # Tarjan numbers sinks first

def abc478e_valid(a, n, cons):
    return all(1 <= v <= n for v in a) and all(a[u] < a[v] if t else a[u] <= a[v] for t, u, v in cons)

def check_abc478e():
    cons = [(0, 1, 4), (0, 2, 6), (0, 3, 2), (1, 3, 5), (0, 4, 1), (0, 4, 3), (1, 5, 7), (0, 6, 7)]
    cons = [(t, u - 1, v - 1) for t, u, v in cons]
    assert abc478e_valid(abc478e_fast(7, cons), 7, cons)
    for _ in range(2000):
        n = rng.randint(1, 4)
        cons = [(rng.randint(0, 1), rng.randrange(n), rng.randrange(n)) for _ in range(rng.randint(1, 6))]
        a = abc478e_fast(n, cons)
        exists = any(abc478e_valid(b, n, cons) for b in itertools.product(range(1, n + 1), repeat=n))
        assert (a is not None) == exists and (a is None or abc478e_valid(a, n, cons)), (n, cons)
    print("ABC478 E: sample + 2000 random cases: Yes/No matches exhaustive search, every output satisfies all constraints")

# ---------------------------------------------------------------- ABC478 G
def cross(o, a, b):
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

def hull(pts):
    pts = sorted(set(pts))
    if len(pts) <= 2:
        return pts
    lo, up = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0:
            lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(up) >= 2 and cross(up[-2], up[-1], p) <= 0:
            up.pop()
        up.append(p)
    return lo[:-1] + up[:-1]

def minkowski(P, Q):
    """Convex polygons in CCW order (any size); merge edges by angle."""
    def start(poly):
        i = min(range(len(poly)), key=lambda k: (poly[k][1], poly[k][0]))
        return poly[i:] + poly[:i]
    P, Q = start(P), start(Q)
    P2, Q2 = P + P[:2], Q + Q[:2]
    i = j = 0; out = []
    while i < len(P) or j < len(Q):
        out.append((P2[i][0] + Q2[j][0], P2[i][1] + Q2[j][1]))
        if i >= len(P):
            j += 1; continue
        if j >= len(Q):
            i += 1; continue
        e1 = (P2[i + 1][0] - P2[i][0], P2[i + 1][1] - P2[i][1])
        e2 = (Q2[j + 1][0] - Q2[j][0], Q2[j + 1][1] - Q2[j][1])
        c = e1[0] * e2[1] - e1[1] * e2[0]
        if c >= 0:
            i += 1
        if c <= 0:
            j += 1
    return hull(out)

def abc478g_fast(pts, p, q):
    """Division points scaled by (p + q): q*P_i + p*P_j for i < j. Divide and conquer: pairs across
    the split form the Minkowski sum q*hull(left) + p*hull(right)."""
    def go(l, r):   # returns (hull of points l..r-1, hull of division points inside)
        if r - l == 1:
            return [pts[l]], []
        m = (l + r) // 2
        hl, dl = go(l, m); hr, dr = go(m, r)
        cross_pairs = minkowski([(q * x, q * y) for x, y in hl], [(p * x, p * y) for x, y in hr])
        return hull(hl + hr), hull(dl + dr + cross_pairs)
    _, h = go(0, len(pts))
    return area_fraction(h, p + q)

def area_fraction(h, s):
    a2 = abs(sum(h[i][0] * h[(i + 1) % len(h)][1] - h[(i + 1) % len(h)][0] * h[i][1] for i in range(len(h)))) if len(h) >= 3 else 0
    f = Fraction(a2, 2 * s * s)
    return f.numerator, f.denominator

def abc478g_brute(pts, p, q):
    qs = [(q * pts[i][0] + p * pts[j][0], q * pts[i][1] + p * pts[j][1]) for i in range(len(pts)) for j in range(i + 1, len(pts))]
    return area_fraction(hull(qs), p + q)

def check_abc478g():
    pts = [(-2, 4), (1, 1), (-3, -2), (4, 0)]
    assert abc478g_fast(pts, 1, 2) == (59, 6) == abc478g_brute(pts, 1, 2)
    for _ in range(1500):
        n = rng.randint(2, 12); p = rng.randint(1, 4); q = rng.randint(p + 1, 6)
        pts = [(rng.randint(-6, 6), rng.randint(-6, 6)) for _ in range(n)]
        assert abc478g_fast(pts, p, q) == abc478g_brute(pts, p, q), (pts, p, q)
    print("ABC478 G: sample (59/6) + 1500 random cases match the hull of all N^2 division points")

CHECKS = {k[6:]: v for k, v in globals().items() if k.startswith("check_")}
if __name__ == "__main__":
    for name in sys.argv[1:] or CHECKS:
        CHECKS[name]()
