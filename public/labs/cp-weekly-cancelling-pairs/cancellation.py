"""CP Weekly #1: watch things cancel.

  python cancellation.py --perms 3        pair permutations by swapping the first two entries
  python cancellation.py --euler 26       expand (1-q)(1-q^2)(1-q^3)... and see what survives
  python cancellation.py --franklin 8     Franklin's 1881 pairing of partitions into distinct parts
  python cancellation.py --partitions     p(n) from Euler's identity vs a plain DP
  python cancellation.py --show 2 2 3     the contest problem: which sequences cancel, which survive
  python cancellation.py --stress         the contest recurrence vs brute force
"""
import itertools, random, sys

def inversions(b):
    return sum(b[i] > b[j] for i in range(len(b)) for j in range(i + 1, len(b)))

# ---------- 1. permutations: swap the first two entries ----------
def perms(n):
    seen = set()
    for p in itertools.permutations(range(1, n + 1)):
        if p in seen:
            continue
        q = (p[1], p[0]) + p[2:]
        seen |= {p, q}
        print(f"  {p} {inversions(p)} inv  <->  {q} {inversions(q)} inv")
    odd = sum(inversions(p) & 1 for p in itertools.permutations(range(1, n + 1)))
    print(f"n = {n}: every permutation has a partner of opposite parity, so odd = {odd} of {len(seen)}")

# ---------- 2. Euler's product ----------
def euler(N):
    c = [1] + [0] * N                      # coefficients of prod_{k>=1} (1 - q^k), truncated at q^N
    for k in range(1, N + 1):
        for i in range(N, k - 1, -1):
            c[i] -= c[i - k]
    terms = [f"{'+' if v > 0 else '-'} q^{i}" for i, v in enumerate(c) if v and i]
    print("1 " + " ".join(terms))
    pent = sorted({k * (3 * k - 1) // 2 for k in range(-10, 11)} - {0})
    print("nonzero exponents:", [i for i, v in enumerate(c) if v and i])
    print("pentagonal numbers k(3k-1)/2:", [p for p in pent if p <= N])

# ---------- 3. Franklin's involution ----------
def distinct_partitions(n, maxpart=None):
    if maxpart is None:
        maxpart = n
    if n == 0:
        yield ()
        return
    for first in range(min(n, maxpart), 0, -1):
        for rest in distinct_partitions(n - first, first - 1):
            yield (first,) + rest

def franklin(p):
    """p is strictly decreasing. m = smallest part, s = length of the top staircase
    (first parts that each drop by exactly 1). Returns the partner, or None for a fixed point."""
    k = len(p)
    if k == 0:
        return None
    m, s = p[-1], 1
    while s < k and p[s] == p[s - 1] - 1:
        s += 1
    touch = s == k                         # staircase reaches the bottom row
    if m <= s:                             # move the bottom row onto the staircase
        if touch and m == s:
            return None
        q = list(p[:-1])
        for i in range(m):
            q[i] += 1
        return tuple(q)
    if touch and m == s + 1:               # m > s: move the staircase down as a new bottom row
        return None
    return tuple(x - 1 if i < s else x for i, x in enumerate(p)) + (s,)

def dots(p):
    return " / ".join("●" * x for x in p)

def show_franklin(n):
    seen = set()
    total = 0
    for p in distinct_partitions(n):
        sign = -1 if len(p) % 2 else 1
        total += sign
        if p in seen:
            continue
        q = franklin(p)
        if q is None:
            seen.add(p)
            print(f"  {p} sign {sign:+d}   fixed point: {dots(p)}")
        else:
            assert franklin(q) == p and len(q) % 2 != len(p) % 2
            seen |= {p, q}
            print(f"  {p} {sign:+d}  <->  {q} {-sign:+d}")
    print(f"n = {n}: signed count = {total}")

def check_franklin(N=40):
    pent = {k * (3 * k - 1) // 2: (-1) ** k for k in range(-12, 13)}
    for n in range(N + 1):
        fixed = []
        for p in distinct_partitions(n):
            q = franklin(p)
            if q is None:
                fixed.append(p)
            else:
                assert franklin(q) == p and sum(q) == n and len(q) % 2 != len(p) % 2
        signed = sum((-1) ** len(p) for p in fixed)
        assert signed == pent.get(n, 0), n
    print(f"franklin: an involution flipping parity for every n <= {N}; fixed points only at pentagonal n")

# ---------- 4. partition numbers from the identity ----------
def partitions_euler(N):
    p = [1] + [0] * N
    for n in range(1, N + 1):
        k, acc = 1, 0
        while True:
            g1, g2 = k * (3 * k - 1) // 2, k * (3 * k + 1) // 2
            if g1 > n:
                break
            sgn = 1 if k % 2 else -1
            acc += sgn * p[n - g1]
            if g2 <= n:
                acc += sgn * p[n - g2]
            k += 1
        p[n] = acc
    return p

def partitions_dp(N):
    p = [1] + [0] * N
    for part in range(1, N + 1):
        for n in range(part, N + 1):
            p[n] += p[n - part]
    return p

# ---------- 5. the contest problem ----------
def fast_odd(a):
    total = 1
    for x in a:
        total *= x
    x2, x1 = 1, a[0]
    for i in range(1, len(a)):
        x2, x1 = x1, (a[i] - a[i - 1]) * x1 + a[i - 1] * x2
    return (total - x1) // 2

def brute_odd(a):
    return sum(inversions(b) & 1 for b in itertools.product(*[range(1, x + 1) for x in a]))

def show(a):
    n = len(a)
    seqs = list(itertools.product(*[range(1, x + 1) for x in a]))
    print(f"A = {a}: {len(seqs)} sequences")
    seen = set()
    for b in seqs:
        if b in seen:
            continue
        p = "odd " if inversions(b) & 1 else "even"
        if n >= 2 and b[-2] != b[-1] and max(b[-2], b[-1]) <= a[-2]:
            c = b[:-2] + (b[-1], b[-2])
            seen |= {b, c}
            print(f"  {b} {p}  <->  {c} {'odd ' if inversions(c) & 1 else 'even'}   cancel")
        else:
            seen.add(b)
            why = "last two equal" if n >= 2 and b[-2] == b[-1] else f"last = {b[-1]} > A[n-1]"
            print(f"  {b} {p}   survives ({why})")
    odd = brute_odd(a)
    print(f"odd = {odd}, even - odd = {len(seqs) - 2 * odd}, recurrence says odd = {fast_odd(list(a))}")

if __name__ == "__main__":
    args = sys.argv[1:] or ["--show", "2", "2", "3"]
    mode, nums = args[0], [int(x) for x in args[1:]]
    if mode == "--perms":
        perms(nums[0] if nums else 3)
    elif mode == "--euler":
        euler(nums[0] if nums else 26)
    elif mode == "--franklin":
        show_franklin(nums[0] if nums else 8)
        check_franklin()
    elif mode == "--partitions":
        N = nums[0] if nums else 1000
        a, b = partitions_euler(N), partitions_dp(N)
        assert a == b
        print(f"p(n) for n <= {N}: Euler's recurrence matches the DP everywhere; p(100) = {a[100]}")
    elif mode == "--stress":
        rng = random.Random(231)
        for _ in range(1500):
            a = sorted(rng.randint(1, 5) for _ in range(rng.randint(1, 6)))
            assert brute_odd(a) == fast_odd(a), a
        print("stress: 1500 random cases (N <= 6, A_i <= 5), all match brute force")
    else:
        show(tuple(sorted(nums or [2, 2, 3])))
