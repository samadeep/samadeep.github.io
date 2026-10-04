#!/usr/bin/env python3
"""Where should a chat request land? A small simulator of a GPU fleet with per-GPU KV caches.

Model (deliberately simple, every number is a flag):
  * G GPU replicas. Each runs prefills one at a time (FIFO). Prefill cost = uncached prompt tokens / PREFILL_TPS.
  * Each GPU has a KV cache of CACHE_TOKENS, evicted LRU. Cached units: an app's system prompt, and a
    conversation's history up to its last finished turn (stored on the GPU that served that turn).
  * Workload: users chat with one of APPS apps (Zipf popularity). Prompt = system prompt + history + new message.
    After each answer the user thinks for an exponential time, then sends the next turn.
TTFT here = queue wait + prefill. Decode is not modelled (see the post's limits section).
"""
import argparse, heapq, random, statistics, zlib
from collections import OrderedDict

p = argparse.ArgumentParser()
p.add_argument('--gpus', type=int, default=8)
p.add_argument('--users', type=int, default=1500)
p.add_argument('--apps', type=int, default=20)
p.add_argument('--sys-tokens', type=int, default=3000)
p.add_argument('--turn-tokens', type=int, default=700, help='user message + answer added to history per turn')
p.add_argument('--turns', type=int, default=8)
p.add_argument('--think', type=float, default=60.0, help='mean seconds between turns')
p.add_argument('--prefill-tps', type=float, default=20000, help='prefill tokens/s per GPU')
p.add_argument('--cache-tokens', type=int, default=1_500_000, help='KV cache capacity per GPU, in tokens')
p.add_argument('--zipf', type=float, default=1.2)
p.add_argument('--seed', type=int, default=7)
a = p.parse_args()


def h(s):  # stable across runs, unlike Python's salted hash()
    return zlib.crc32(s.encode())


class GPU:
    def __init__(self):
        self.cache = OrderedDict()   # key -> tokens
        self.used = 0
        self.free_at = 0.0           # when the prefill queue drains
        self.busy = 0.0

    def has(self, key):
        if key in self.cache:
            self.cache.move_to_end(key); return True
        return False

    def put(self, key, tokens):
        if key in self.cache:
            self.used -= self.cache.pop(key)
        self.cache[key] = tokens; self.used += tokens
        while self.used > a.cache_tokens:
            _, t = self.cache.popitem(last=False); self.used -= t

    def cached(self, app, conv, turn):
        """Tokens of this prompt already in this GPU's KV cache (longest matching prefix)."""
        hist = ('h', conv, turn - 1)
        if turn > 0 and hist in self.cache:      # history includes the system prompt
            return a.sys_tokens + turn * a.turn_tokens
        return a.sys_tokens if ('s', app) in self.cache else 0


def run(policy):
    rnd = random.Random(a.seed)
    gpus = [GPU() for _ in range(a.gpus)]
    weights = [1 / (k + 1) ** a.zipf for k in range(a.apps)]
    events = []
    for u in range(a.users):
        heapq.heappush(events, (rnd.uniform(0, a.think * 2), u, 0, rnd.choices(range(a.apps), weights)[0]))
    rr = 0
    ttft, hit, total, served = [], 0, 0, 0
    while events:
        now, conv, turn, app = heapq.heappop(events)
        prompt = a.sys_tokens + turn * a.turn_tokens + 100
        if policy == 'round-robin':
            g = rr % a.gpus; rr += 1
        elif policy == 'least-loaded':
            g = min(range(a.gpus), key=lambda i: gpus[i].free_at)
        elif policy == 'hash(first 1k tokens)':          # same first tokens -> same GPU (the system prompt)
            g = h(f'app{app}') % a.gpus
        elif policy == 'hash(conversation)':
            g = h(f'conv{conv}') % a.gpus
        else:  # cache-and-load cost: uncached prefill work + queued work, both in seconds
            g = min(range(a.gpus), key=lambda i: (prompt - gpus[i].cached(app, conv, turn)) / a.prefill_tps
                    + max(0.0, gpus[i].free_at - now))
        G = gpus[g]
        c = G.cached(app, conv, turn)
        G.has(('s', app)); G.has(('h', conv, turn - 1))      # touch for LRU
        work = (prompt - c) / a.prefill_tps
        start = max(now, G.free_at)
        G.free_at = start + work; G.busy += work
        ttft.append(G.free_at - now)
        hit += c; total += prompt; served += 1
        G.put(('s', app), a.sys_tokens)
        old = G.cache.pop(('h', conv, turn - 1), None)       # the new history entry supersedes the old one
        if old: G.used -= old
        G.put(('h', conv, turn), prompt + a.turn_tokens - 100)
        if turn + 1 < a.turns:
            heapq.heappush(events, (G.free_at + 5 + rnd.expovariate(1 / a.think), conv, turn + 1, app))
    span = max(g.free_at for g in gpus)
    q = statistics.quantiles(ttft, n=100)
    util = [g.busy / span for g in gpus]
    return dict(policy=policy, requests=served, hit=hit / total, p50=q[49], p99=q[98], hottest=max(util), coldest=min(util))


print(f"{a.gpus} GPUs, {a.users} chats x {a.turns} turns, {a.apps} apps (Zipf {a.zipf}), "
      f"{a.cache_tokens:,} cached tokens/GPU, prefill {a.prefill_tps:,.0f} tok/s/GPU\n")
print(f"{'policy':24} {'KV hit':>7} {'TTFT p50':>9} {'TTFT p99':>9} {'busiest GPU':>12} {'idlest GPU':>11}")
for pol in ['round-robin', 'least-loaded', 'hash(first 1k tokens)', 'hash(conversation)', 'cache + load cost']:
    r = run(pol)
    print(f"{r['policy']:24} {r['hit']:>6.0%} {r['p50']*1000:>7.0f}ms {r['p99']*1000:>7.0f}ms {r['hottest']:>11.0%} {r['coldest']:>10.0%}")
