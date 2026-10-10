"""Redis's shortcuts, rebuilt small enough to read (standard library only).

  python redis_lab.py --evict 5      sampled LRU with Redis's 16-slot eviction pool; try 1, 5, 10, 64
  python redis_lab.py --lfu          the LFU counter: how hits turn into a number from 0 to 255
  python redis_lab.py --expire       when does the active expiry cycle keep going, and when does it stop?

Each part copies the rule from Redis's source (evict.c, expire.c); constants are Redis's defaults.
"""
import argparse, random
from math import comb

p = argparse.ArgumentParser()
p.add_argument("--evict", type=int, metavar="SAMPLES")
p.add_argument("--lfu", action="store_true")
p.add_argument("--expire", action="store_true")
p.add_argument("--seed", type=int, default=7)
a = p.parse_args()
random.seed(a.seed)

if a.evict:
    # 10 batches of 1,000 keys written one second apart (Redis's LRU clock ticks once a second),
    # so batch 0 has been idle 10 s and batch 9 for 1 s. Then 5,000 new keys arrive and the
    # cache must stay at 10,000 keys. Perfect LRU would evict batches 0 to 4 and nothing else.
    POOL, SAMPLES = 16, a.evict
    idle = {f"b{b}:{i}": 10 - b for b in range(10) for i in range(1000)}
    keys = list(idle)                                  # for random sampling; swap-remove keeps it O(1)
    pos = {k: i for i, k in enumerate(keys)}
    pool = []                                          # [(idle, key)], ascending, at most 16: evict.c's EvictionPoolLRU

    def remove(k):
        i = pos.pop(k); last = keys.pop()
        if i < len(keys): keys[i] = last; pos[last] = i
        del idle[k]

    def evict_one():
        while True:
            for k in random.sample(keys, min(SAMPLES, len(keys))):   # evictionPoolPopulate
                if any(k == pk for _, pk in pool): continue
                if len(pool) < POOL or idle[k] > pool[0][0]:
                    pool.append((idle[k], k)); pool.sort(key=lambda e: e[0])
                    if len(pool) > POOL: pool.pop(0)
            while pool:                                # best candidate first; skip "ghosts" already gone
                _, k = pool.pop()
                if k in idle: remove(k); return k

    for n in range(5000):
        k = f"new:{n}"; idle[k] = 0; pos[k] = len(keys); keys.append(k)
        evict_one()
    alive = [sum(f"b{b}:{i}" in idle for i in range(1000)) / 10 for b in range(10)]
    new_evicted = 5000 - sum(k.startswith("new:") for k in idle)
    print(f"maxmemory-samples {SAMPLES}, eviction pool of {POOL}: 5,000 evictions to make room")
    print("survivors % by batch, oldest first: " + " ".join(f"{x:3.0f}" for x in alive))
    print(f"perfect LRU:                        " + " ".join(f"{x:3.0f}" for x in [0] * 5 + [100] * 5))
    wrong = sum(max(0, (100 if b >= 5 else 0) - alive[b]) for b in range(10)) * 10
    print(f"keys evicted that perfect LRU would have kept: {wrong:,.0f} old ones, plus {new_evicted:,} brand-new ones")

elif a.lfu:
    # evict.c LFULogIncr: the counter goes up with probability 1 / ((counter - 5) * lfu-log-factor + 1).
    LFU_INIT_VAL = 5
    def incr(c, factor):
        if c == 255: return 255
        base = max(0, c - LFU_INIT_VAL)
        return c + (random.random() < 1.0 / (base * factor + 1))
    checkpoints = [10, 100, 1_000, 10_000, 100_000, 1_000_000]
    print("hits needed to reach a counter (starts at 5, a new key's value):")
    for factor in (1, 10, 100):
        c, done, row = LFU_INIT_VAL, 0, []
        for t in checkpoints:
            for _ in range(t - done): c = incr(c, factor)
            done = t; row.append(f"{t:>9,}:{c:>4}")
        print(f"  lfu-log-factor {factor:3}  " + " ".join(row))
    # expected hits to climb from 5 to c is the sum of 1/p over the steps
    for factor in (10,):
        need = lambda c: sum(k * factor + 1 for k in range(0, c - LFU_INIT_VAL))
        print(f"  expected hits at factor 10: counter 50 -> {need(50):,}, 100 -> {need(100):,}, 255 -> {need(255):,}")

elif a.expire:
    # expire.c: each pass samples 20 keys that have a TTL and deletes the expired ones.
    # It runs another pass only if more than 10% of the sample was expired, i.e. 3 or more of 20.
    N, STALE = 20, 10
    need = next(k for k in range(N + 1) if k * 100 / N > STALE)
    print(f"a pass samples {N} keys with a TTL; it repeats only if at least {need} of them were already expired\n")
    print("share of TTL keys already expired   chance one pass repeats   expired keys found per pass")
    for frac in (0.05, 0.09, 0.12, 0.25, 0.5, 1.0):
        p_rep = sum(comb(N, k) * frac**k * (1 - frac)**(N - k) for k in range(need, N + 1))
        print(f"{frac:>24.0%}            {p_rep:>14.0%}            {N * frac:>14.1f}")
    print("\nbelow the line, Redis mostly stops after one pass per tick (10 ticks a second by default),")
    print("so dead keys among many live ones are reclaimed at about 20 keys x 10 ticks x share expired per second")

else:
    p.print_help()
