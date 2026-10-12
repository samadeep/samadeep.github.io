# Random small cases: few distinct values so cards collide often.
import random, sys
seed, T = int(sys.argv[1]), int(sys.argv[2])
rng = random.Random(seed)
print(T)
for _ in range(T):
    n = rng.randint(2, 9); k = rng.randint(2, min(2 * n, 6))
    print(n)
    for _ in range(n):
        a = rng.randint(1, k); b = rng.randint(1, k)
        while b == a: b = rng.randint(1, k)
        print(a, b)
