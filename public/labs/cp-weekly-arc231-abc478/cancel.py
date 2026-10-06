"""ARC231 E (Odd Inversion), small enough to watch.

  python cancel.py --show 2 2 3   list every B, and show which ones cancel in pairs
  python cancel.py --stress       recurrence vs brute force on random small inputs
"""
import itertools, random, sys

def inversions(b):
    return sum(b[i] > b[j] for i in range(len(b)) for j in range(i + 1, len(b)))

def brute_odd(a):
    return sum(inversions(b) & 1 for b in itertools.product(*[range(1, x + 1) for x in a]))

def fast_odd(a):
    total = 1
    for x in a:
        total *= x
    x2, x1 = 1, a[0]                      # X_{i-2}, X_{i-1}; X = #even - #odd
    for i in range(1, len(a)):
        x2, x1 = x1, (a[i] - a[i - 1]) * x1 + a[i - 1] * x2
    return (total - x1) // 2

def show(a):
    # the pairing used by the proof, applied at the last position i = n
    n = len(a)
    seqs = list(itertools.product(*[range(1, x + 1) for x in a]))
    print(f"A = {a}: {len(seqs)} sequences B")
    seen = set()
    for b in seqs:
        if b in seen:
            continue
        p = "odd " if inversions(b) & 1 else "even"
        if n >= 2 and b[-2] != b[-1] and max(b[-2], b[-1]) <= a[-2]:
            c = b[:-2] + (b[-1], b[-2])
            seen |= {b, c}
            q = "odd " if inversions(c) & 1 else "even"
            print(f"  {b} {p}  <->  {c} {q}   cancel")
        else:
            seen.add(b)
            why = "B[n-1] = B[n]" if n >= 2 and b[-2] == b[-1] else f"B[n] = {b[-1]} > A[n-1]"
            print(f"  {b} {p}   survives ({why})")
    odd = brute_odd(a)
    print(f"odd = {odd}, even = {len(seqs) - odd}, even - odd = {len(seqs) - 2 * odd}")
    print(f"recurrence gives odd = {fast_odd(list(a))}")

if __name__ == "__main__":
    args = sys.argv[1:]
    if args and args[0] == "--stress":
        rng = random.Random(231)
        for t in range(1500):
            a = sorted(rng.randint(1, 5) for _ in range(rng.randint(1, 6)))
            assert brute_odd(a) == fast_odd(a), a
        print("stress: 1500 random cases (N <= 6, A_i <= 5), all match brute force")
    else:
        nums = [int(x) for x in args if x.lstrip("-").isdigit()] or [2, 2, 3]
        show(tuple(sorted(nums)))
