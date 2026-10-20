"""AAL Contest 001 M (NAND): fold B = nand(B, A_i) over a range, with point updates.

Each A_i acts on the running value as a function g(x) = nand(x, A_i). Store a function
on one bit as the pair (g(0), g(1)); store 30 of them at once as two 30-bit masks.
Composition is associative, so the pairs live in a segment tree.

  python3 nand.py --samples      the three samples from the statement
  python3 nand.py --stress 2000  random arrays vs the direct fold
"""
import random
import sys

FULL = (1 << 30) - 1
ID = (0, FULL)  # identity: g(0)=0, g(1)=1 on every bit


def fn(a):
    # nand(0, a) = 1 on every bit; nand(1, a) = not a
    return (FULL, FULL ^ a)


def then(f, g):
    """Apply f first, then g. Bit by bit: (g o f)(x) = g(f(x))."""
    f0, f1 = f
    g0, g1 = g
    h0 = (g0 & ~f0 | g1 & f0) & FULL
    h1 = (g0 & ~f1 | g1 & f1) & FULL
    return (h0, h1)


def apply(f, x):
    return (f[0] & ~x | f[1] & x) & FULL


class Seg:
    def __init__(self, a):
        self.n = 1
        while self.n < len(a):
            self.n *= 2
        self.t = [ID] * (2 * self.n)
        for i, v in enumerate(a):
            self.t[self.n + i] = fn(v)
        for i in range(self.n - 1, 0, -1):
            self.t[i] = then(self.t[2 * i], self.t[2 * i + 1])

    def set(self, i, v):
        i += self.n
        self.t[i] = fn(v)
        i //= 2
        while i:
            self.t[i] = then(self.t[2 * i], self.t[2 * i + 1])
            i //= 2

    def prod(self, l, r):
        L, R = ID, ID
        l += self.n
        r += self.n
        while l < r:
            if l & 1:
                L = then(L, self.t[l]); l += 1
            if r & 1:
                r -= 1; R = then(self.t[r], R)
            l //= 2; r //= 2
        return then(L, R)


def solve(a, queries):
    st, a, out = Seg(a), list(a), []
    for q in queries:
        if q[0] == 1:
            st.set(q[1] - 1, q[2]); a[q[1] - 1] = q[2]
        else:
            l, r = q[1] - 1, q[2] - 1
            out.append(apply(st.prod(l + 1, r + 1), a[l]))
    return out


def direct(a, queries):
    a, out = list(a), []
    for q in queries:
        if q[0] == 1:
            a[q[1] - 1] = q[2]
        else:
            b = a[q[1] - 1]
            for i in range(q[1], q[2]):
                b = FULL ^ (b & a[i])
            out.append(b)
    return out


SAMPLES = [
    ([5, 3, 12, 10], [(2, 1, 4), (2, 2, 3), (2, 3, 3)], [1073741821, 1073741823, 12]),
    ([7, 10, 12, 3, 5], [(2, 2, 4), (1, 3, 6), (2, 1, 5), (2, 3, 3), (1, 1, 1073741823), (2, 1, 2)],
     [1073741820, 1073741819, 6, 1073741813]),
    ([1073741823, 0, 536870912], [(2, 1, 2), (2, 1, 3), (1, 2, 1073741823), (2, 1, 3), (2, 2, 2)],
     [1073741823, 536870911, 1073741823, 1073741823]),
]

if __name__ == "__main__":
    arg = sys.argv[1:] or ["--samples"]
    if arg[0] == "--samples":
        for k, (a, q, want) in enumerate(SAMPLES, 1):
            got = solve(a, q)
            print(f"sample {k}: {got}  {'ok' if got == want else 'WRONG, want ' + str(want)}")
    else:
        rng, bad = random.Random(5), 0
        cases = int(arg[1]) if len(arg) > 1 else 2000
        for _ in range(cases):
            n = rng.randint(1, 12)
            a = [rng.randrange(1 << 30) for _ in range(n)]
            qs = []
            for _ in range(10):
                if rng.random() < 0.3:
                    qs.append((1, rng.randint(1, n), rng.randrange(1 << 30)))
                else:
                    l = rng.randint(1, n); qs.append((2, l, rng.randint(l, n)))
            bad += solve(a, qs) != direct(a, qs)
        print(f"random cases: {cases}  mismatches vs direct fold: {bad}")
