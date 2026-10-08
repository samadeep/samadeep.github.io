"""Five rate limiters, the same traffic, exact arithmetic (standard library only).

  python ratelimit_lab.py                  the boundary burst: 100 a minute, and a client that times it
  python ratelimit_lab.py --skew           where the sliding-window counter guesses wrong
  python ratelimit_lab.py --same           token bucket, leaky bucket and GCRA on random traffic: same answers?
  python ratelimit_lab.py --memory 10000000  state each one keeps, for that many keys
"""
import argparse, random
from fractions import Fraction as F

p = argparse.ArgumentParser()
p.add_argument("--boundary", action="store_true", help="the default demo")
p.add_argument("--skew", action="store_true")
p.add_argument("--same", action="store_true")
p.add_argument("--memory", type=int, metavar="KEYS")
a = p.parse_args()

LIMIT, WINDOW = 100, F(60)              # 100 requests per 60 seconds
RATE = F(LIMIT) / WINDOW                # = 5/3 requests a second

class FixedWindow:                      # count per calendar minute, reset on the boundary
    def __init__(s): s.win, s.n = None, 0
    def allow(s, t):
        w = t // WINDOW
        if w != s.win: s.win, s.n = w, 0
        if s.n < LIMIT: s.n += 1; return True
        return False

class SlidingLog:                       # remember every admitted timestamp from the last 60 s
    def __init__(s): s.log = []
    def allow(s, t):
        s.log = [x for x in s.log if x > t - WINDOW]
        if len(s.log) < LIMIT: s.log.append(t); return True
        return False

class SlidingCounter:                   # Cloudflare's estimate: previous window weighted by overlap
    def __init__(s): s.win, s.cur, s.prev = None, 0, 0
    def allow(s, t):
        w = t // WINDOW
        if s.win is None or w != s.win:
            s.prev = s.cur if s.win is not None and w == s.win + 1 else 0
            s.win, s.cur = w, 0
        elapsed = t - w * WINDOW
        if s.prev * (WINDOW - elapsed) / WINDOW + s.cur < LIMIT: s.cur += 1; return True
        return False

class TokenBucket:                      # tokens drip in at RATE up to B; each request spends one
    def __init__(s, B=LIMIT, rate=RATE): s.B, s.r, s.tok, s.last = B, rate, F(B), None
    def allow(s, t):
        if s.last is not None: s.tok = min(F(s.B), s.tok + (t - s.last) * s.r)
        s.last = t
        if s.tok >= 1: s.tok -= 1; return True
        return False

class LeakyBucket:                      # the mirror image: each request pours one in, it drains at RATE
    def __init__(s, B=LIMIT, rate=RATE): s.B, s.r, s.level, s.last = B, rate, F(0), None
    def allow(s, t):
        if s.last is not None: s.level = max(F(0), s.level - (t - s.last) * s.r)
        s.last = t
        if s.level + 1 <= s.B: s.level += 1; return True
        return False

class GCRA:                             # one number per key: the theoretical arrival time (TAT)
    def __init__(s, B=LIMIT, rate=RATE): s.T, s.tau, s.tat = 1 / F(rate), (B - 1) / F(rate), None
    def allow(s, t):
        tat = t if s.tat is None else max(s.tat, t)
        if t >= tat - s.tau: s.tat = tat + s.T; return True   # ITU-T writes a strict >; >= makes the burst exactly B
        return False

def run(limiter, times):
    return [t for t in times if limiter.allow(t)]

def busiest(admitted, span):            # most admitted requests inside any window of `span` seconds
    best, j = 0, 0
    for i, t in enumerate(admitted):
        while admitted[j] <= t - span: j += 1
        best = max(best, i - j + 1)
    return best

if a.memory:
    k = a.memory
    rows = [("fixed window", "window id + count", 16), ("sliding log", f"up to {LIMIT} timestamps", LIMIT * 8 + 16),
            ("sliding counter", "window id + 2 counts", 24), ("token bucket", "tokens + last refill", 16), ("GCRA", "one timestamp", 8)]
    print(f"state for {k:,} keys (8-byte fields, before any per-key overhead):")
    for name, what, b in rows:
        print(f"  {name:16} {what:24} {b:>4} B/key  {b * k / 2**20:>9,.0f} MiB")
elif a.same:
    rng = random.Random(1); n = 0
    for _ in range(300):
        B, rate = rng.randint(1, 8), F(rng.randint(1, 6), rng.randint(1, 4))
        t, times = F(0), []
        for _ in range(60):
            t += F(rng.choice([0, 0, 1, 1, 2, 5, 10, 30]), 10); times.append(t)
        d = [[lim.allow(x) for x in times] for lim in (TokenBucket(B, rate), LeakyBucket(B, rate), GCRA(B, rate))]
        assert d[0] == d[1] == d[2], (B, rate)
        n += len(times)
    print(f"300 random traffic patterns, {n:,} requests, random bucket sizes and rates:")
    print("token bucket, leaky bucket and GCRA made the same allow/deny call on every single request")
elif a.skew:
    # 100 requests at 59 s (end of minute 0), then a steady stream through minute 1
    times = [F(59) + F(i, 1000) for i in range(100)] + [F(60) + F(i, 10) for i in range(600)]
    exact, approx = run(SlidingLog(), times), run(SlidingCounter(), times)
    print("100 requests at 0:59, then one every 0.1 s through 1:00 to 2:00. Limit: 100 per rolling minute")
    print(f"  sliding log (exact):   busiest 60 s held {busiest(exact, WINDOW)} admitted")
    print(f"  sliding counter:       busiest 60 s held {busiest(approx, WINDOW)} admitted   <- assumed minute 0 was spread evenly")
else:
    # a client that knows your windows: 100 requests in the last second of a minute, 100 in the first of the next
    times = [F(59) + F(i, 100) for i in range(100)] + [F(60) + F(i, 100) for i in range(100)]
    print("limit: 100 requests a minute. A client sends 100 at 0:59 and 100 more at 1:00 (200 in 2 seconds)\n")
    for name, lim in [("fixed window", FixedWindow()), ("sliding log", SlidingLog()), ("sliding counter", SlidingCounter()),
                      ("token bucket", TokenBucket()), ("leaky bucket", LeakyBucket()), ("GCRA", GCRA())]:
        ok = run(lim, times)
        print(f"  {name:16} admitted {len(ok):>3} of 200   busiest 60 s: {busiest(ok, WINDOW):>3}")
