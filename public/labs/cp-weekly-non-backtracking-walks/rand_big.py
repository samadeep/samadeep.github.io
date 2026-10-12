# One random test at the limit: N = 250000, values in 1..hi.
import random, sys
n = int(sys.argv[1]); hi = int(sys.argv[2]); rng = random.Random(7)
print(1); print(n)
for _ in range(n):
    a = rng.randint(1, hi); b = rng.randint(1, hi)
    while b == a: b = rng.randint(1, hi)
    print(a, b)
