# Random tests for AAL Contest 001 R. Usage: python3 gen.py SEED N W Q DIGITS
import random, sys
seed, n, w, q, k = map(int, sys.argv[1:6])
rng = random.Random(seed)
row = lambda: "".join(str(rng.randrange(k)) for _ in range(w))
g = [row() for _ in range(n)]
lines = [f"{n} {w} {q}", *g]
for _ in range(q):
    if rng.random() < 0.3:
        i = rng.randrange(n); g[i] = row(); lines.append(f"1 {i+1} {g[i]}")
    else:
        while True:
            a, c = rng.randrange(n), rng.randrange(n); b, d = rng.randrange(w), rng.randrange(w)
            if (a, b) != (c, d) and g[a][b] == g[c][d]: break
        lines.append(f"2 {a+1} {b+1} {c+1} {d+1}")
print("\n".join(lines))
