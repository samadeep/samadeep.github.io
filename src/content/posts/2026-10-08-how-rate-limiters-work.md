---
title: 'How Rate Limiters Work: Fixed Windows, Buckets and GCRA'
description: 'Fixed window, sliding log, token bucket, leaky bucket and GCRA on the same traffic: why "100 a minute" can mean 200, plus a limiter you can play with.'
hook:
  stat: '100/min → 200 in 2 s'
  caption: 'what a fixed-window limiter lets through, for a client that times the boundary'
date: '2026-10-08'
topic: systems
series: system-design
tags: [rate-limiting, token-bucket, gcra, api-design, redis]
---

<aside class="tldr">

**TL;DR** "100 a minute" is a promise about *every* 60 seconds, but the easy limiter only checks the 60 seconds that start on the minute. A client with a watch gets 200. The fix fits in one number per client. Yes, one.

</aside>

Your API promises **100 requests a minute** per client. You count requests per minute, block anything past 100, and ship it.

Then a client sends 100 requests at **0:59**. All allowed: this minute's count was zero. The clock ticks over, the counter resets, and they send 100 more at **1:00**. All allowed again.

**200 requests in two seconds**, from a limiter that says 100 a minute. Nothing is broken. That's exactly what the code does.

So what should a rate limiter count? Before reading on, play with one. Pick a limiter, press **Time the window boundary**, and watch the "most admitted in any 5 s" counter.

<div data-lab="ratelimit"></div>

## Why the obvious limiter lets 200 through

A **fixed window** counts requests per calendar window, 0:00 to 0:59, then 1:00 to 1:59, and resets the count at every boundary. It's cheap: one counter per client. But the promise you meant was "no more than 100 in *any* 60 seconds", and the fixed window only checks 60-second chunks that start on the minute. A burst that straddles the boundary lands in two chunks, and each chunk sees only half of it.

Here are six limiters facing that exact client, with exact arithmetic:

<div data-lab="py" data-src="/labs/rate-limiting/ratelimit_lab.py" data-presets="--boundary|--skew|--same|--memory 10000000"></div>

```text
limit: 100 requests a minute. A client sends 100 at 0:59 and 100 more at 1:00 (200 in 2 seconds)

  fixed window     admitted 200 of 200   busiest 60 s: 200
  sliding log      admitted 100 of 200   busiest 60 s: 100
  sliding counter  admitted 102 of 200   busiest 60 s: 102
  token bucket     admitted 103 of 200   busiest 60 s: 103
  leaky bucket     admitted 103 of 200   busiest 60 s: 103
  GCRA             admitted 103 of 200   busiest 60 s: 103
```

Everything except the fixed window holds the line. (The buckets admit 103 rather than 100 because they refill continuously: in the two seconds of the attack, a little over 3 more requests' worth of allowance trickled back in. That's by design, not a leak.)

So which one should you use? Each answer to "what do I count?" has a cost.

## Remember everything? The sliding log

The honest way to enforce "100 in any 60 seconds" is to keep a timestamp for every admitted request and count how many are newer than a minute ago. That's the **sliding log**, and it's exact: 100 of 200, no matter how the client aims.

The bill comes in memory. Each client needs up to 100 timestamps:

```text
state for 10,000,000 keys (8-byte fields, before any per-key overhead):
  fixed window     window id + count          16 B/key        153 MiB
  sliding log      up to 100 timestamps      816 B/key      7,782 MiB
  sliding counter  window id + 2 counts       24 B/key        229 MiB
  token bucket     tokens + last refill       16 B/key        153 MiB
  GCRA             one timestamp               8 B/key         76 MiB
```

Nearly 8 GiB for ten million API keys, and it grows with the limit: a "10,000 an hour" rule needs 10,000 timestamps per key.

## Cloudflare's shortcut: the sliding counter

Cloudflare needed something nearly as accurate at a fraction of the memory. In 2017 they described the trick they use[^cf]: keep only two counts per client, this window's and the last one's, and *estimate* the rolling count by assuming last window's requests were spread evenly:

```text
rate = previous_count × (window − elapsed) / window + current_count
```

Their example: 42 requests last minute, 18 so far this minute, 15 seconds in. The estimate is 42 × 45/60 + 18 = **49.5**, just under a limit of 50. Across 400 million requests from 270,000 sources, they found only **0.003%** were wrongly allowed or blocked.

That's real traffic. But "spread evenly" is an assumption, and a client can break it. Send 100 requests at 0:59, then a steady stream through the next minute (run `--skew`):

```text
100 requests at 0:59, then one every 0.1 s through 1:00 to 2:00. Limit: 100 per rolling minute
  sliding log (exact):   busiest 60 s held 100 admitted
  sliding counter:       busiest 60 s held 199 admitted   <- assumed minute 0 was spread evenly
```

The counter thinks the 100 requests from 0:59 are fading out smoothly through minute 1, when really they're all still inside the last 60 seconds. On average it's excellent; in the worst case it lets nearly twice the limit through. Whether that matters depends on whether your clients are average.

## Stop counting, start draining: the buckets

Every limiter so far *counts* inside windows. Buckets drop the windows entirely.

A **token bucket** holds up to *B* tokens and refills at a steady rate *r*. Each request spends one token; no token, no entry. A full bucket lets a burst of *B* through at once, and after that you get *r* per second. Stripe uses one for its request limiter[^stripe].

A **leaky bucket** is the mirror image. Each request pours one unit *in*, and the bucket drains at rate *r*; if a request would overflow it, it's refused. NGINX's `limit_req` says so in its docs: "The limitation is done using the 'leaky bucket' method."[^nginx] (For where the name comes from, PlanetScale's history of leaky buckets goes all the way back to Bronze Age water clocks[^ps].)

Look closely and they're the same bucket. The leaky bucket's water level is just *B minus* the token bucket's tokens. One counts what you may still spend; the other counts what you've already spent.

```fig title="Three descriptions of one algorithm: they admit exactly the same requests" alt="Three panels side by side. Token bucket: tokens up to B, refilled at r per second, and a request takes a token. Leaky bucket: a level up to B, draining at r per second, and a request adds water. GCRA: one timestamp, TAT, and a request is allowed if TAT is at most now plus slack, then moves TAT forward by 1/r."
panel Token bucket
row
tb: shared "tokens, up to B"
row
tr: allow "request takes a token"
tb -> tr "refills at r/s"
panel Leaky bucket
row
lb: shared "level, up to B"
row
lr: allow "request adds water"
lb -> lr "drains at r/s"
panel GCRA
row
g: shared "one timestamp: TAT"
row
gr: allow "request moves TAT +1/r"
g -> gr "allowed if TAT ≤ now + slack"
```

Don't take Fig. 1's word for it. The lab runs all three on random traffic, with random bucket sizes and rates:

```text
300 random traffic patterns, 18,000 requests, random bucket sizes and rates:
token bucket, leaky bucket and GCRA made the same allow/deny call on every single request
```

> **Insight:** The token bucket, the leaky bucket and GCRA aren't three algorithms. They're three ways to write down one, and the only real difference is how much state each one stores.

## One number per client: GCRA

That third panel of [Fig. 1](#fig-1) is the cheapest version. The **Generic Cell Rate Algorithm** comes from ATM networks: ITU-T Recommendation I.371 and the ATM Forum's UNI specification define it "in two equivalent ways"[^gcra], as a virtual scheduling algorithm and as a continuous-state leaky bucket.

The scheduling form throws the bucket away. For each client it stores **one timestamp**, the *theoretical arrival time* (TAT): when the next request would be due if the client sent at exactly the allowed rate. A request is allowed if it isn't too far ahead of that schedule, and each allowed request pushes the schedule forward by one interval *T* = 1/*r*:

```python
def allow(now):
    tat = max(state.tat, now)                    # an idle client doesn't bank credit
    if now >= tat - tolerance:                   # tolerance = (B - 1) * T: room for a burst of B
        state.tat = tat + T
        return True
    return False
```

No refill loop, no background drip, nothing to update while a client is idle. It's 8 bytes a key, and an allowed request is one read and one write. That's why redis-cell implements GCRA as a single Redis command, `CL.THROTTLE`[^cell], and Brandur Leach's write-up walks through it step by step[^brandur].

Put all five side by side and they line up on one axis: how much each one remembers.

```fig title="Remember less, pay less: only the fixed window also pays in correctness" alt="Five limiters in a row, ordered by the state they keep per client. Sliding log: up to 100 timestamps, exact. Sliding counter: two counts, close on average but up to about 2x in the worst case. Token bucket: two numbers, exact for its rule. GCRA: one timestamp, exact for the same rule. Below, the fixed window: one counter, but it lets 2x through at every boundary."
panel remembers more  →  remembers less
row
log: allow "sliding log\n100 timestamps\nexact"
ctr: ask "sliding counter\n2 counts\n≤ 2× worst case"
tb: allow "token bucket\n2 numbers\nexact"
g: allow "GCRA\n1 timestamp\nexact"
row
fw: deny "fixed window\n1 counter\n2× at every boundary" span 4
log -> ctr
ctr -> tb
tb -> g
```

## What do you tell the client?

A blocked request deserves a useful answer. HTTP has a status for it: RFC 6585 defines **429 Too Many Requests**[^rfc], which "MAY include a Retry-After header" saying how long to wait. GCRA hands you that number for free: it's `TAT − tolerance − now`.

There's also an IETF draft, RateLimit header fields (version 11, May 2026, not yet an RFC)[^draft], that standardises telling clients their quota *before* they hit it, with fields like `RateLimit: "default";r=50;t=30`.

One trap: NGINX's `limit_req` rejects with **503**, not 429, unless you set `limit_req_status 429;`. To a client, 503 means "the server is broken, retry", which is the opposite of what you want a client that's over its limit to do.

## Where does the count live?

One server can keep counts in memory. A fleet can't: if each of 10 servers allows 100 a minute, a client that's spread across them gets 1,000. So the state moves to a shared store like Redis, and a new problem appears. Two servers read the same token count, both see one token left, and both let a request through.

The fix is to make the check-and-update one atomic step. A fixed window gets that from `INCR`, which counts and returns in one operation. Buckets need a small Lua script, or a module like redis-cell. GCRA is the easiest to make atomic, because there's only one value to compare and move. Brandur's write-up also suggests[^brandur] taking `now` from the store's own clock (Redis `TIME`), so servers with drifting clocks don't disagree about the schedule.

## Back to the 200

The client who sent 200 requests in two seconds didn't find a bug. They found the gap between the rule you meant ("100 in any minute") and the rule you wrote ("100 per calendar minute"). Every limiter here is a different way of closing that gap. The sliding log closes it exactly and pays in memory. The sliding counter closes it on average and pays in worst cases. The buckets close it with no windows at all, and GCRA does that with one number per client. If you're starting fresh, that one number is hard to beat.

## Try it

The simulator and the lab both run above, in your browser. On your own machine (standard library only):

```zsh
curl -O https://samadeep.github.io/labs/rate-limiting/ratelimit_lab.py
python3 ratelimit_lab.py              # the boundary attack, six limiters
python3 ratelimit_lab.py --same       # token bucket = leaky bucket = GCRA, checked
```

<details>
<summary>Limits of this post</summary>

- The lab uses exact fractions, so the equivalence check can't be fooled by floating-point rounding. Its GCRA tests `now >= TAT - tolerance`; the ITU-T text uses a strict `>`, which makes the burst one smaller. With `>=` the burst is exactly *B*, matching the token bucket.
- Memory figures count 8-byte fields only. Real stores add per-key overhead on top, which narrows the ratios but doesn't change their order.
- The simulator uses a 5-second window so you can see it work; the lab uses 100 a minute.


</details>

[^cf]: Julien Desgats, [How we built rate limiting capable of scaling to millions of domains](https://blog.cloudflare.com/counting-things-a-lot-of-different-things/), Cloudflare, 2017.
[^stripe]: Paul Tarjan, [Scaling your API with rate limiters](https://stripe.com/blog/rate-limiters), Stripe, 2017.
[^nginx]: [Module ngx_http_limit_req_module](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html), NGINX documentation.
[^ps]: Simeon Griggs, [What today's software owes to Bronze Age clocks](https://planetscale.com/blog/leaky-buckets-in-software-explained), PlanetScale, 2026.
[^gcra]: [Generic cell rate algorithm](https://en.wikipedia.org/wiki/Generic_cell_rate_algorithm), Wikipedia, citing ITU-T Recommendation I.371 and the ATM Forum UNI specification.
[^cell]: Brandur Leach, [redis-cell](https://github.com/brandur/redis-cell), a Redis module implementing GCRA.
[^brandur]: Brandur Leach, [Rate Limiting, Cells, and GCRA](https://brandur.org/rate-limiting), 2015.
[^rfc]: M. Nottingham, R. Fielding, [RFC 6585 §4: 429 Too Many Requests](https://www.rfc-editor.org/rfc/rfc6585#section-4), IETF, 2012.
[^draft]: [RateLimit header fields for HTTP, draft 11](https://www.ietf.org/archive/id/draft-ietf-httpapi-ratelimit-headers-11.html), IETF HTTPAPI working group, 2026.
