---
title: 'Redis Runs on One Thread, So It Guesses Everywhere'
description: 'Redis internals, measured on Redis 8.10: the single-threaded event loop, listpack and embstr encodings, approximate LRU and LFU eviction, and active expiry.'
hook:
  stat: '20,000 → 746'
  caption: 'expired keys hidden among 200,000 live ones, and how many Redis freed in the next 30 seconds'
date: '2026-10-11'
topic: systems
series: redis-inside-out
tags: [redis, caching, eviction, data-structures, memory]
vm:
  setup: "redis-server --daemonize yes --save '' --appendonly no --loglevel warning >/dev/null 2>&1; clear"
---

<aside class="tldr">

**TL;DR** Redis runs every command on one thread, so it can never afford to look at everything. It evicts the "least recently used" key by checking five at random. It deletes expired keys by checking twenty and hoping. It counts your hits in something closer to logarithms. Mostly the guesses are great. This post finds where they aren't, on a real server, and it turns out one of them can leave 19,000 dead keys sitting in your memory.

</aside>

Load a million keys into Redis and run one command:

```text
another client's PING, 1M keys loaded: median 0.38 ms, worst 2.57 ms (idle)
KEYS user:42* matched 11,111 keys in 194 ms; worst PING meanwhile 189 ms
SCAN 0 MATCH user:42* COUNT 1000: 1,000 calls, 11,111 keys, 722 ms total, each call short
```

One `KEYS` call, and every other client waited **189 ms** for a `PING` that normally takes 0.38. `SCAN` did the same work in a thousand small bites, so it took longer overall but blocked nobody for long. The Redis docs ask you to use `KEYS` with "extreme care" in production for exactly this reason[^keys].

That's the deal Redis makes. One thread runs every command, start to finish, so nothing may take long. And Redis holds itself to the same rule. Wherever it would need a full pass over your data (to find the least recently used key, to find expired keys, to grow a hash table), it doesn't do one. It samples, or it does a little at a time.

This post measures those shortcuts on Redis **8.10.2**, built from source, with every claim checked against the C code. Start with the one you can watch. Each square below is a key in a full cache, oldest on the left. Write some new keys and see which old ones Redis picks to evict:

<div data-lab="evict"></div>

## One thread, and everyone waits in line

```fig title="One thread runs every command to completion; slow work is pushed to side threads or done in slices" alt="One panel. Top row: three clients, client A sending GET k, client B sending KEYS star, client C sending PING. All three arrows lead to one wide box, sockets ready via epoll. That leads to the main box, one thread runs each command to the end. A dashed arrow labelled UNLINK, lazy free leads from it to a bottom row of three boxes: I/O threads that read and write sockets, background threads that free memory and fsync, and serverCron ten times a second for expiry and rehashing."
panel inside one Redis server
row
c1: peer "client A\nGET k"
c2: peer "client B\nKEYS *"
c3: peer "client C\nPING"
row
q: shared "sockets ready (epoll)" span 3
row
m: main "one thread runs each command to the end" span 3
row
w1: worker "I/O threads\nread, write sockets"
w2: worker "background threads\nfree memory, fsync"
w3: worker "serverCron, 10x a second\nexpiry, rehashing"
c1 -> q
c2 -> q
c3 -> q
q -> m
m -> w2 "UNLINK, lazy free" dashed
```

Redis can use I/O threads, but only to read and write sockets; its own config file still describes it as "mostly single threaded"[^conf]. Commands themselves never run in parallel. That's why a single `GET` is so fast (no locks anywhere) and why one slow command is everyone's problem.

So what does Redis do when *its own* housekeeping would take long? Three things, all in [Fig. 1](#fig-1): free big values on a background thread (`UNLINK` instead of `DEL`), spread hash-table growth across many operations, and sample instead of scan. The rest of this post is that third trick.

<details>
<summary>Growing a hash table without stopping</summary>

When the main key table fills up, Redis allocates one twice the size and then moves buckets across gradually: a step on every operation that touches the table, plus 1 ms every 100 ms of CPU time when `activerehashing` is on, which is the default[^conf]. For a while both tables exist, lookups check both, and memory briefly holds two tables. The config file's own warning: an idle server may never finish rehashing, and active rehashing can add about 2 ms to a reply now and then.

</details>

## Small things are packed, then they explode

Before eviction, look at what a key costs. Redis stores small collections as one flat block of bytes, a **listpack** (or an **intset** for a set of integers), and switches to a real hash table only past a threshold. Readers in the browser VM get Redis 7.2, so you can see the switch yourself:

```bash
for n in 512 513; do
  redis-cli DEL h >/dev/null
  seq $n | awk '{print "HSET h f"$1" v"$1}' | redis-cli >/dev/null
  echo "$n fields: $(redis-cli OBJECT ENCODING h), $(redis-cli MEMORY USAGE h) bytes"
done
```

```text
512 fields: listpack, 5966 bytes
513 fields: hashtable, 18108 bytes
```

One more field, **3x** the memory, and that's on the VM's 32-bit build, where pointers are half the size. On Redis 8.10.2 (64-bit), measured with `MEMORY USAGE`:

| what you store | packed | one step past the limit | jump |
|---|---|---|---|
| hash, 512 → 513 short fields | 5,951 B (listpack) | 23,438 B (hashtable) | 3.9x |
| set, 512 → 513 integers | 1,052 B (intset) | 18,931 B (hashtable) | 18x |
| set, 128 → 129 strings | 685 B (listpack) | 4,852 B (hashtable) | 7.1x |
| sorted set, 128 → 129 members | 941 B (listpack) | 10,836 B (skiplist) | 11.5x |
| hash, 10 fields + one 65-byte value | 97 B (listpack) | 544 B (hashtable) | 5.6x |

Two details matter more than they look. Hashes switch at **512** entries (`hash-max-listpack-entries`), but sets and sorted sets switch at **128**. And a single value longer than 64 bytes converts the *whole* hash. The conversion is one-way, too:

```bash
redis-cli SADD ids 1 2 3 >/dev/null; echo "ints only:     $(redis-cli OBJECT ENCODING ids)"
redis-cli SADD ids abc >/dev/null;   echo "add a string:  $(redis-cli OBJECT ENCODING ids)"
redis-cli SREM ids abc >/dev/null;   echo "remove it:     $(redis-cli OBJECT ENCODING ids)"
```

```text
ints only:     intset
add a string:  listpack
remove it:     listpack
```

```fig title="Packed encodings are tiny until one write pushes them over a limit, and they never come back" alt="A row of three encodings from packed to pointers. Intset: sorted integers in one block. An arrow labelled add a string leads to listpack: entries back to back in one block. An arrow labelled too many or too long leads to hashtable or skiplist: one allocation per entry. Below, a full-width box: crossing 512 hash fields, 128 set or sorted-set members, or one 65-byte value costs 4x to 18x the memory, and the encoding never converts back."
panel packed  →  pointers
row
ip: allow "intset\nsorted ints, one block"
lp: allow "listpack\nentries back to back"
ht: deny "hashtable or skiplist\none allocation per entry"
row
cl: box "cross 512 hash fields, 128 members, or one 65-byte value: 4x to 18x the memory, one-way" span 3
ip -> lp "add a string"
lp -> ht "too many or too long"
```

### Redis 8 quietly changed the 44-byte rule

Every Redis memory guide repeats it: strings up to 44 bytes are stored as **embstr**, one allocation holding the object and the string together. On 7.2 that's still true. On 8.10.2, a 44-byte value comes back as `raw`. Here's the longest value that stays embedded, by key length:

| key length | 7.2.11 | 8.10.2 |
|---|---|---|
| 1 byte | 44 | 40 |
| 8 bytes | 44 | 33 |
| 16 bytes | 44 | 25 |
| 32 bytes | 44 | 9 |

Redis 8 stores the key inside the same object as the value (a `kvobj`), and embeds the string only if key, value and headers together fit one 64-byte cache line[^object]. Measured, that's **key + value ≤ 41 bytes**. Long key names now cost you the embedding, not just their own bytes.

## Who gets evicted? Five random keys decide

When `maxmemory` is reached under an LRU policy, Redis doesn't keep a list ordered by last use; that would cost memory on every key. Each key holds a 24-bit clock that ticks once a second. To evict, Redis samples `maxmemory-samples` keys (default **5**), merges them into a pool of the **16** idlest candidates seen so far, and evicts the idlest one in the pool[^evict][^antirez].

How close is that to real LRU? I wrote 10 batches of 10,000 keys, one second apart, then forced about 43,500 evictions. Perfect LRU would wipe out the oldest batches first and leave the newest intact:

```text
samples  5: evicted 43,493 old keys; survivors % by batch, oldest first:  30  30  29  31  38  52  67  89 100 100   newer keys evicted instead of older ones: 11,998
samples 10: evicted 43,758 old keys; survivors % by batch, oldest first:   9   9  14  23  38  69  99 100 100 100   newer keys evicted instead of older ones: 5,574
samples 64: evicted 43,495 old keys; survivors % by batch, oldest first:   0   0   0   3  62 100 100 100 100 100   newer keys evicted instead of older ones: 283
```

At the default, **30% of the oldest keys survived** while about 12,000 younger keys went in their place. At 64 samples it's nearly perfect. That's the trade: more samples, more CPU per eviction, a better guess. For most caches the default is fine, because hot keys get touched again and cold ones are a fairly random mix anyway. But if you rely on "the oldest data goes first", it doesn't, quite. Raise the samples in the simulator and watch the left columns empty.

The lab rebuilds the pool from `evict.c` so you can play with it:

<div data-lab="py" data-src="/labs/redis-inside/redis_lab.py" data-args="--evict 5" data-presets="--evict 1|--evict 5|--evict 64|--lfu|--expire"></div>

### -X- One sample on Redis 8 can fail writes

Push the knob the other way and Redis 8 breaks in a way 7.2 doesn't:

```text
maxmemory-samples 1, cache full, writing new keys (allkeys-lru):
  Redis 7.2.11  evicts, close to random                      2 of 2 runs fine
  Redis 8.10.2  OOM command not allowed when used memory > 'maxmemory'   2 of 2 runs

  sample 1 key -> look at most 10 hash buckets -> all empty -X- no candidate found
  8.x guard: "no keys sampled" -> give up, eviction fails -> the write is refused
```

Guards that should have caught it: 7.2's loop simply sampled again, and there's no such retry in 8.x; `maxmemory-samples` still accepts 1; and nothing in the error says "try more samples". The source shows 8.x added the give-up check[^evict], and with one sample Redis walks at most 10 buckets, which can all be empty right after the table doubles. That last step is a reading of the code, not a traced execution. The fix for you is simple: leave samples at 5 or more.

8.6 also added **LRM** policies (`allkeys-lrm`, `volatile-lrm`): evict the least recently *modified* key, so heavy reads don't keep stale data alive[^docs].

## LFU: counting hits in logarithms

LFU policies need a hit count, and Redis gives each key just 8 bits for it. So the counter can't count; it estimates. A new key starts at 5, and each hit bumps it with probability

$$
p = \frac{1}{(c - 5)\, f + 1}
$$

where $c$ is the current counter and $f$ is `lfu-log-factor` (default 10)[^evict]. Climbing from 5 to $c$ takes, on average, $\sum_{k=0}^{c-6}(k f + 1)$ hits: about 9,945 to reach 50, and about 311,500 to hit the cap of 255. Measured on 8.10.2:

```text
lfu-log-factor  10  hits:counter        10:   7       100:   9     1,000:  18    10,000:  50   100,000: 150 1,000,000: 255
lfu-log-factor   1  hits:counter        10:  10       100:  13     1,000:  49    10,000: 148   100,000: 255 1,000,000: 255
lfu-log-factor 100  hits:counter        10:   6       100:   6     1,000:   9    10,000:  20   100,000:  46 1,000,000: 143
```

The formula says 50 at about 10,000 hits; Redis says 50. The counter also decays by one each minute a key goes unread (`lfu-decay-time 1`), so yesterday's hot key cools off. And because of the log scale, two keys with 100,000 and 300,000 hits look almost the same. LFU tells hot from cold; it can't rank the hottest. You can watch it climb in the VM:

```bash
redis-cli CONFIG SET maxmemory-policy allkeys-lfu >/dev/null
redis-cli SET hot v >/dev/null
for n in 10 100 1000; do
  seq $n | awk '{print "GET hot"}' | redis-cli >/dev/null
  echo "after $n more GETs: counter $(redis-cli OBJECT FREQ hot)"
done
redis-cli CONFIG SET maxmemory-policy noeviction >/dev/null
```

```text
after 10 more GETs: counter 7
after 100 more GETs: counter 11
after 1000 more GETs: counter 20
```

## Expired doesn't mean gone

A key with a TTL is deleted in one of two ways: when someone reads it after it expired (lazy), or when the **active expiry cycle** finds it. That cycle runs on every tick (10 a second by default), samples **20** keys that have a TTL, deletes the expired ones, and goes again only if more than 10% of the sample was expired, so 3 or more of 20[^expire].

```fig title="The expiry cycle only keeps going while the sample is full of dead keys" alt="One panel, one row of four boxes: sample 20 keys that have a TTL, then delete the expired ones, then a question: were 3 or more expired? An arrow labelled no leads to the last box, stop until the next tick. A loop-back arrow below the row, labelled yes, sample again, returns to the first box."
panel one tick of the expiry cycle (10 a second)
row
s: worker "sample 20 keys\nthat have a TTL"
d: allow "delete the\nexpired ones"
qq: ask "3 or more\nexpired?"
stop: deny "stop until\nthe next tick"
s -> d
d -> qq
qq -> stop "no"
qq -> s "yes, sample again" muted via below
```

That rule is cheap and fair when most TTL keys are dead. Now hide them. I wrote 20,000 keys with a 1-second TTL alongside a varying number of keys with a 1-hour TTL, never read any of them, and counted how many Redis freed:

```text
20,000 expired among 0 live (100% stale)   reclaimed by t after TTL   1s:20,000   5s:20,000  30s:20,000
20,000 expired among 20,000 live (50% stale) reclaimed by t after TTL   1s:20,000   5s:20,000  30s:20,000
20,000 expired among 60,000 live (25% stale) reclaimed by t after TTL   1s:   439   5s: 4,886  30s:20,000
20,000 expired among 200,000 live (9% stale) reclaimed by t after TTL   1s:    46   5s:   138  30s:   746
```

At 9% stale, Redis freed **746 of 20,000** dead keys in 30 seconds. Below 10%, a sample of 20 usually holds fewer than 3 dead keys, so each tick does one pass and stops: the rule predicts about 20 samples x 10 ticks x 9% ≈ 18 keys a second, and Redis managed about 25. The binomial math is in `--expire`: at 9% stale, one pass repeats only 27% of the time.

Those dead keys still use memory and still count in `DBSIZE` (219,714 instead of 200,000 in a rerun). Nobody can read them, but your memory graph includes them. And if they push you into `maxmemory`, Redis starts evicting live keys to make room. Here's what cleared the same backlog on 8.10.2:

```text
default (hz 10, effort 1):               262 of 20,000 freed in 10 s; dbsize 219,714
active-expire-effort 10:              19,972 of 20,000 freed in 10 s
hz 100:                                2,446 of 20,000 freed in 10 s
one full SCAN pass (0.3 s):           19,978 of 20,000 freed; dbsize 200,000
```

`active-expire-effort` lowers that 10% threshold (to 1% at 10) and lets each cycle work longer[^expire]. A `SCAN` touches every key, and touching a dead key deletes it. Raising `hz` alone barely helps, because each tick still stops after one pass.

> **Insight:** Redis's sampled housekeeping is calibrated for the common case. When the thing it's looking for is rare (a dead key among live ones, a cold key among warm ones) the sample rarely finds it, and the work quietly stops.

The VM version is smaller (2,000 dead among 20,000, 9% stale again) but tells the same story: 262 freed in 10 seconds, the rest still counted.

```bash
redis-cli FLUSHALL >/dev/null
redis-cli EVAL "for i=1,20000 do redis.call('SET','live:'..i,'v','EX',3600) end for i=1,2000 do redis.call('SET','dead:'..i,'v','PX',500) end return 'ok'" 0
sleep 10
echo "10 s later: $(redis-cli INFO stats | grep -o 'expired_keys:[0-9]*'), dbsize $(redis-cli DBSIZE)"
```

```text
"ok"
10 s later: expired_keys:262, dbsize 21738
```

## Back to the 189 ms

The `KEYS` call that froze everyone did the one thing Redis never lets itself do: a full pass on the main thread. Everything else in this post is Redis avoiding that pass. It guesses which key is coldest, guesses which keys are dead, estimates how hot a key is, and grows its tables a slice at a time. The guesses are good enough that most people never see them. Now you know where they show: the oldest keys that survive eviction, the 44-byte rule that became 41 bytes for key and value together, and dead keys that stay put when they're rare.

Next in this series, the same single thread goes to disk: what `fork` costs when Redis snapshots, and how much you lose on a crash with each persistence setting.

## Try it

The simulator, the Python lab and the `redis-cli` commands all run above, in your browser. On your own machine:

```zsh
curl -O https://samadeep.github.io/labs/redis-inside/redis_lab.py
python3 redis_lab.py --evict 5      # the eviction pool
python3 redis_lab.py --expire       # when the expiry cycle stops
bash <(curl -s https://samadeep.github.io/labs/redis-inside/vm_check.sh)   # every redis-cli step, needs redis-server
```

<details>
<summary>Limits of this post</summary>

- Measurements are from Redis 8.10.2 and 7.2.11 built from source, 64-bit, on one Linux machine, defaults unless noted. The browser VM runs Alpine's Redis 7.2 on 32-bit x86, so its byte counts are smaller than the tables, but the encodings and thresholds match.
- The LRU table is one run per setting, with 10 batches written 1.1 s apart; repeat runs on both versions landed within a few points. The lab's model is cleaner than real Redis: at 5 samples it keeps 7% of the oldest batch where Redis kept 30%. Redis samples neighbouring hash buckets rather than uniformly, and the table was rehashing during the run; which of those explains the gap isn't settled here.
- The `maxmemory-samples 1` failure reproduced in 2 of 2 runs on 8.10.2 and 0 of 2 on 7.2.11. The mechanism is my reading of `evict.c`, not a traced execution.
- LFU numbers are random by design (the counter is probabilistic), so your run will differ a little.

</details>

[^keys]: [KEYS](https://redis.io/docs/latest/commands/keys/), Redis documentation.
[^conf]: [redis.conf](https://github.com/redis/redis/blob/8.10.2/redis.conf), Redis 8.10.2 (THREADED I/O and `activerehashing` sections).
[^object]: [object.c](https://github.com/redis/redis/blob/8.10.2/src/object.c), Redis 8.10.2 (`kvobjSet` and `OBJ_ENCODING_EMBSTR_SIZE_LIMIT`).
[^evict]: [evict.c](https://github.com/redis/redis/blob/8.10.2/src/evict.c), Redis 8.10.2 (`EVPOOL_SIZE`, `performEvictions`, `LFULogIncr`).
[^antirez]: Salvatore Sanfilippo, [Random notes on improving the Redis LRU algorithm](http://antirez.com/news/109), antirez.com, 2016.
[^docs]: [Key eviction](https://redis.io/docs/latest/develop/reference/eviction/), Redis documentation.
[^expire]: [expire.c](https://github.com/redis/redis/blob/8.10.2/src/expire.c), Redis 8.10.2 (`activeExpireCycle`).
