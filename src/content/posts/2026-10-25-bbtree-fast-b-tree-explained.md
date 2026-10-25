---
title: 'How Did a 50-Year-Old B-Tree Get 3× Faster?'
description: 'How bbtree, a new Rust B-tree, beats std BTreeMap: inline keys, prefix skipping, SIMD counting, batched lookups and version locks, measured and explained.'
hook:
  stat: '1,003 → 315 ns'
  caption: 'one u64 lookup in 10M entries, std BTreeMap against bbtree, same machine'
date: '2026-10-25'
topic: low-latency
series: under-the-hood
tags: [b-tree, rust, cpu-caches, simd, databases]
---

<aside class="tldr">

**TL;DR** A Rust crate a week old calls itself "by far the fastest B-tree". On our machine it found a key 3.2× faster than std's `BTreeMap`, and 5× faster in batches. Not one of its tricks is new: they come from database papers between 1977 and 2018. The new part is that they finally ship in a crate you can `cargo add`. Oh, and it can also double your memory. Not the tree's fault. The allocator's.

</aside>

On 18 October 2026, a crate called [bbtree](https://github.com/XiangpengHao/bbtree)[^repo] showed up on crates.io with a bold README: 5× faster than std's `BTreeMap` on one thread, 12× faster than a concurrent skiplist at 96 threads, and a drop-in replacement for both `BTreeMap` and `BTreeSet`.

That should sound odd. B-trees were published in 1972[^bayer]. Most databases, many filesystems and the Rust standard library already run on one. What is left to speed up in a 50-year-old data structure?

So we ran it. Ten million random `u64` keys, one thread, a 2-vCPU cloud Xeon:

```text
u64 keys, 10000000 entries, 4000000 random lookups that hit
  get    round 0: std 1002.9 ns   bbtree  314.5 ns   bbtree get_many(16)  202.5 ns   (3.19x, 4.95x)
  get    round 1: std 1054.4 ns   bbtree  303.5 ns   bbtree get_many(16)  191.9 ns   (3.47x, 5.49x)
```

Same keys, same machine, about a microsecond against a third of one. Let's take it apart, one layer at a time.

<details>
<summary>Before you start: three words this post leans on</summary>

| Word | What it means here |
|---|---|
| **B-tree** | A sorted map stored as a short, wide tree. Each node holds many keys; you search a node, then step down to one child. Wikipedia's [B-tree](https://en.wikipedia.org/wiki/B-tree) page is a fine primer. |
| **Cache line** | The 64 bytes the CPU fetches from memory in one go. Ask for one byte, get its whole line. |
| **Cache miss** | When that line isn't in any cache yet: roughly 100 ns of waiting, about 200 instructions' worth of time. Ulrich Drepper's [What Every Programmer Should Know About Memory](https://people.freebsd.org/~lstewart/articles/cpumemory.pdf) is the classic on why. |

</details>

## Where does a lookup's microsecond go?

bbtree's design starts from a cost model with three prices[^post]. Here they are, from most to least expensive:

```fig title="A lookup pays for trips to memory first, and for instructions a distant second" alt="One row of three boxes ordered from most to least expensive. A coherence miss, when another core wrote the line: a bit more than 100 ns. A cache miss: about 100 ns, and std's BTreeMap takes 10.1 of them per u64 lookup at 10M entries. An instruction: about 0.5 ns, and std takes 409 of them per lookup."
panel costs more  →  costs less
row
coh: deny "coherence miss\n> 100 ns\nanother core wrote it"
miss: ask "cache miss\n~100 ns\nstd: 10.1 per lookup"
ins: allow "instruction\n~0.5 ns\nstd: 409 per lookup"
coh -> miss
miss -> ins
```

The std numbers in [Fig. 1](#fig-1) are bbtree's own hardware counters for 10M `u64` keys[^decisions]. Do the arithmetic: 10 misses × 100 ns is about 1 µs, and 409 instructions × 0.5 ns is about 0.2 µs, much of which hides under the waits. Our stopwatch said 1.0 µs.

So a B-tree lookup is a chain of cache misses with a little arithmetic in between. You can't skip the chain: you don't know which child to visit until you've searched the node you're in. Every idea in bbtree does one of three things: **fewer lines per lookup, fewer instructions per line, or something useful to do while waiting.**

## Why std's node can't do better

std's `BTreeMap` uses small nodes: at most 11 keys, and it walks them in order, comparing one at a time[^stdsrc]. For `u64` keys that's fine: 11 keys are 88 bytes, two lines.

For `String` keys, it falls apart. A `String` in the node is 24 bytes of pointer, length and capacity. The characters live somewhere else on the heap. So every comparison follows a pointer, and every pointer is its own cache miss.

```fig title="Same 11 URL keys: std follows a pointer per compare, inline keys touch the heap only on a tie" alt="Two panels side by side. Left, std with String keys: the node holds 11 times pointer, length and capacity, 264 bytes over 5 cache lines, and finding Hastings compares Actium, then Agincourt, through Hastings, 8 heap reads in a row. Right, bbtree with inline keys: the node holds 8 bytes of every key, 88 bytes over 2 lines, one count finds the slot, and the heap is read once, only to confirm the tie with Hastings."
layout stack
panel std: String keys
row
n: main "node: 11 × (ptr, len, cap), 264 bytes, 5 lines" span 3
row
h1: deny "heap: Actium\ncompare 1"
h2: deny "heap: Agincourt\ncompare 2"
h3: deny "… heap: Hastings\ncompare 8"
n -> h1
n -> h2
n -> h3
panel bbtree: inline keys
row
m: main "node: 11 × 8-byte windows, 88 bytes, 2 lines" span 3
row
_
h4: allow "heap: Hastings\nonly on a tie"
_
m -> h4
```

bbtree's answer is **inline keys**: keep a few bytes of every key right in the node, packed tight, so one cache line holds 8 of them. Compare those first, and read a full key from the heap only when its inline bytes tie with yours. Databases have done this for decades[^graefe-larson]; Umbra's "German strings"[^umbra] and Arrow's `StringView`[^stringview] are the same idea for columns (bbtree's author co-wrote the StringView post).

There's a catch, and it's a big one for real keys. Take Wikipedia URLs. The first 8 bytes of every one of them are `https://`. Every inline key ties, and you're back to reading the heap.

Try it below. Pick a layout, pick a key, and watch what each search reads.

<div data-lab="bbnode"></div>

With **inline keys** alone, `https://` ties all 11 keys, so the node falls back to a binary search over full keys: 3 heap reads. Switch to **prefix + inline** and the tie disappears.

## The prefix nobody stores

Every key in a B-tree node sits between two separators in its parent: one on its left, one on its right. If those two separators share their first 40 bytes, then **every key in the node shares them too**. It has no choice: it sorts between them.

```fig title="The child never stores its prefix: the two separators above it already prove it" alt="A parent with two separators, .../Battle_of_Abu_Klea on the left and .../Battle_of_Yorktown on the right. They share their first 40 bytes, https://en.wikipedia.org/wiki/Battle_of_. Every key of the child sorts between them, so every key starts with those 40 bytes too. The child's inline keys therefore start at byte 40: Actium, Agincour, Hastings, Waterloo."
panel parent
row
lo: worker "separator\n…/Battle_of_Abu_Klea"
hi: worker "separator\n…/Battle_of_Yorktown"
row
c: main "child: every key starts with\nhttps://en.wikipedia.org/wiki/Battle_of_\n(40 bytes)" span 2
row
w: allow "inline keys start at byte 40\nActium·· Agincour Hastings Waterloo" span 2
lo -> c "keys ≥ this"
hi -> c "keys < this"
c -> w
```

This is **prefix truncation**, from Bayer and Unterauer's *Prefix B-Trees* in 1977[^prefix]. The lovely detail in bbtree is that the node doesn't store the prefix at all, only its length, because the parent's separators already prove it[^fence]. The inline keys then start right after it, where keys actually differ.

It works for integers too. Store a `u64` big-endian and its bytes sort exactly like the number, so a leaf of 10M random `u64`s can skip the high bytes its neighbours share and keep just 2 bytes per key[^post]. Your own key types join in by implementing one trait, `InlineKey`, which hands out 8 bytes of an order-preserving encoding.

How much does it buy? bbtree's counters, std against bbtree, cache lines from memory per lookup at 10M entries: **10.1 against 4.0** for `u64`, **45.1 against 13.8** for Wikipedia titles[^decisions]. Our stopwatch on 2M URL keys:

```text
URL keys (e.g. https://en.wikipedia.org/wiki/Mount_of_ae0bf34d), 2000000 entries, 2000000 random lookups that hit
  get    round 0: std 1847.1 ns   bbtree  684.3 ns   (2.70x)
  get    round 1: std 1837.4 ns   bbtree  671.9 ns   (2.73x)
```

## Count, don't search

Once the inline keys sit in one or two cache lines, the search inside the node is no longer about memory. It's about instructions, and mostly about **branches**: a wrong guess at an `if` costs about 20 cycles.

Binary search over 32 keys is 5 compares, each a branch the CPU guesses wrong about half the time, and each waiting on the one before. bbtree does something that looks dumber: it compares the target against **every** key and counts how many are smaller. That count *is* the child to follow.

```fig title="One compare against every key, one popcount: nothing to mispredict" alt="Eight inline keys, 7 12 23 31 40 52 66 71, looking for 45. One SIMD instruction compares all eight with 45 at once and gives the mask 1 1 1 1 1 0 0 0. Counting the ones, popcount, gives 5, so the search goes to child 5."
panel searching for 45
row
k: shared "inline keys: 7 12 23 31 40 52 66 71" span 3
row
cmp: worker "compare all 8\nwith 45 at once"
mask: worker "mask\n1 1 1 1 1 0 0 0"
cnt: allow "popcount = 5\ngo to child 5"
k -> cmp
cmp -> mask
mask -> cnt
```

In scalar Rust, the idea fits in a line:

```rust
// child to follow = how many inline keys are smaller than the target
fn child_index(keys: &[u16], target: u16) -> usize {
    keys.iter().filter(|&&k| k < target).count()
}
```

With AVX-512 that becomes three instructions for 32 two-byte keys: one load, one compare that yields a 32-bit mask, one `popcnt`[^post]. This is k-ary search from 2009[^kary], and there are no branches left to mispredict.

The catch: you only get AVX-512 if you ask for it. The same benchmark, built once with `-C target-cpu=native` and once without:

```text
native   get: std  794.4 ns   bbtree  237.0 ns   (3.35x)
portable get: std  767.3 ns   bbtree  373.0 ns   (2.06x)
```

Without the flag, bbtree's lookup is 57% slower, and its lead over std shrinks from 3.4× to 2.1×. The author found the same on Apple silicon: the compiler's own version of the count took 1,678 instructions per lookup, and a hand-written NEON one took 407[^post].

## Hide the misses you can't avoid

After all that, a lookup still waits on about 4 cache misses in a row, because each node tells you where the next one is. You can't prefetch a line before you know its address.

But you can work on something else while you wait. If you have 16 keys to look up, start all 16. Each search steps down one level, asks for its next line, and steps aside. By the time the core comes back to it, the line has arrived.

```fig title="Two lookups on one core: each one's wait is covered by the other's work" alt="A sequence over time with lane A, lane B and memory. Lane A prefetches its next node and yields. Lane B prefetches its next node and yields. A's line arrives, A searches it, prefetches the next and yields. B's line arrives and B does the same. The core is never idle while a line is on its way."
seq
a: peer "lane A"
b: peer "lane B"
mem: shared "memory"
a -> mem "prefetch A's next node, yield"
b -> mem "prefetch B's next node, yield"
mem -> a "A's line arrives"
a -> mem "search it, prefetch, yield"
mem -> b "B's line arrives"
b -> mem "search it, prefetch, yield"
```

Database researchers have interleaved lookups like this for a decade: AMAC by hand in 2015, then with coroutines in 2017 and 2018[^interleave]. bbtree writes each search as a Rust `async fn` and treats a cache miss as the thing to `await`. It can't use tokio for this: a runtime's overhead costs more than the 100 ns it's trying to hide. So it polls its lanes with a tiny executor of its own, no allocation, single thread[^batch]. You get it as `get_many`. It took another third off our lookups:

```text
  get    round 1: std 1054.4 ns   bbtree  303.5 ns   bbtree get_many(16)  191.9 ns   (3.47x, 5.49x)
```

## Many threads, and readers never write

The third price in [Fig. 1](#fig-1) is the scary one. Put a `RwLock` around a map and every *read* still writes: it bumps the reader count, and that write steals the line from every other core. The author puts the ceiling for one contended line at about 10M operations a second[^post].

bbtree's concurrent map uses a **version lock** instead[^olfit][^olc]. Readers don't take anything. They read a node's version, read the node, and check the version again.

```fig title="Readers never write: a changed version just means read it again" alt="A sequence with reader 1, a writer, reader 2 and a node at version 7. Reader 1 reads version 7, reads the keys, re-reads version 7 and keeps its answer. Reader 2 reads version 7. The writer locks the node, changes its keys and bumps it to version 8. Reader 2 re-reads the version, sees 8, and starts over."
seq
r1: peer "reader 1"
w: main "writer"
r2: peer "reader 2"
n: shared "node, version 7"
r1 -> n "read version 7, read keys"
r2 -> n "read version 7"
r1 -> n "re-read: 7, answer stands" good
w -> n "change keys, version 8"
r2 -> n "re-read: 8, start over" lost
```

Two problems follow, and how bbtree handles them is the most interesting part of the design[^conc]:

- **It can't hand you a `&V`.** The value could change under you. So only inner nodes are read optimistically. Leaves, where values live, are latched shared, and you see the value inside a closure, `map.read(&key, |_, v| …)`. For `Copy` values, `get_copied` copies the value out and checks the version afterwards, like a seqlock.
- **A node could be freed mid-read.** Most lock-free maps pay for epochs on every access to prevent that. bbtree never returns a freed node to the allocator while the map lives: it keeps it on a free list and reuses it, with its version still counting up. A late reader always lands on a real node, sees a bigger version, and retries. The old name for this is type-stable memory[^tsm].

The claim is 180M lookups a second at 96 threads, 83 to 90× one thread's rate[^post]. Our machine has 2 vCPUs, so that one stays theirs.

## The surprise: same tree, twice the memory

The README also promises 30% less memory. Ours said the opposite:

```text
memory std    u64 10000000 entries:   279.1 MiB resident,  29.3 B/entry
memory bbtree u64 10000000 entries:   512.1 MiB resident,  53.7 B/entry
```

1.8× std, not 0.7×. Same keys, same build. What changed is the allocator. Rebuilt with mimalloc as the global allocator:

```text
memory std    u64 10000000 entries:   300.0 MiB resident,  31.5 B/entry
memory bbtree u64 10000000 entries:   256.0 MiB resident,  26.8 B/entry
```

Now bbtree is 15% under std. Here's what happened:

```fig title="The allocator decides whether bbtree saves memory or doubles it" alt="Two panels. Under glibc malloc, each 1 KiB node must start on a 1 KiB boundary, glibc puts a header in front of each block, so the next node can't sit right after it and every other 1 KiB slot goes to waste: 10M u64 entries take 512 MiB, 1.8 times std's 279 MiB. Under mimalloc, 1 KiB blocks sit back to back on 1 KiB boundaries: the same tree takes 256 MiB, 15 percent under std's 300 MiB."
panel glibc malloc
row
g1: shared "1 KiB node"
gap: deny "-X- 1 KiB skipped"
g2: shared "1 KiB node"
row
gr: deny "10M u64: 512 MiB\n1.8× std" span 3
panel mimalloc
row
m1: shared "1 KiB node"
m2: shared "1 KiB node"
m3: shared "1 KiB node"
row
mr: allow "10M u64: 256 MiB\n0.85× std" span 3
```

bbtree's nodes are 1 KiB and aligned to 1 KiB, so a node never straddles a 4 KiB page[^decisions]. glibc's `malloc` can't pack blocks like that: in the author's own test, 100,000 such blocks spanned 204.8 MB at 1 KiB alignment and 108.8 MB at 64-byte alignment[^cost]. mimalloc packs them back to back, and the project's own measurements run on mimalloc. Guards that could have caught it, and didn't:

- **The README** states the memory win with no allocator next to it.
- **The design docs** know: decision D15 and the cost model both record glibc's gap. They just aren't where a user looks.
- **Rust's default**: a program that doesn't pick an allocator gets the system one, glibc's on most Linux machines. That's what our first run used, and what most adopters will too.

If you adopt bbtree, put `#[global_allocator] static A: mimalloc::MiMalloc = mimalloc::MiMalloc;` next to it. String keys moved less: 274 MiB against std's 253 under glibc, 266 against 254 under mimalloc. The key bytes on the heap dominate there, and both maps pay for them.

## Who checks code that LLMs wrote?

The project is open about how it was built: LLMs from several providers wrote and cross-checked the code, and Xiangpeng Hao, who built Microsoft's Bf-Tree during his PhD[^bftree], steers every design decision[^post]. So the interesting question isn't "is it fast", it's "how do you trust it". The answer is a stack of guards that most hand-written data structures never get:

- **Differential fuzzing** against std's `BTreeMap`: 8 targets, every answer compared, the tree's invariants checked after every operation[^fuzz].
- **Formal proofs** in Verus[^verus] that the inline keys sort exactly like the keys they come from. If that one property broke, the count from [Fig. 4](#fig-4) would send you to the wrong child, silently.
- **Deterministic simulation** with AWS's Shuttle[^shuttle], thousands of thread schedules per test on every pull request. A second tool, ffs, still found a race Shuttle missed[^issue9], now fixed and tested.

## Was any of it new?

Go back to that README. A 50-year-old structure, 3× faster, and not one new idea in it: prefix truncation is from 1977, cache-conscious nodes from 2000[^rao], optimistic version locks from 2001, SIMD k-ary search from 2009, interleaved lookups from 2015. The newness is in the packaging: all of it behind std's API, proven where it matters, in a crate a week old.

It's already landing: the project reports 1.4 to 6.8× speedups as the memtable of fjall, SlateDB, Tonbo and Lance, and up to 2.2× in Turso's in-memory MVCC store[^post]. Those are their benchmarks, not ours.

The best way in is the author's [explorer](https://bbtree.xiangpeng.systems/explorer/)[^vis]: type a URL and watch a real bbtree look it up, node by node, cache line by cache line. The prefix it skips is greyed out. You'll recognise it now.

## Try it

```zsh
cargo add bbtree      # bbtree::unsync::BBTreeMap is the drop-in for std's BTreeMap
cargo add mimalloc    # and use it as the global allocator, see above
```

Build with `RUSTFLAGS="-C target-cpu=native"` to get the SIMD search. Our benchmark is in [`/labs/bbtree/`](/labs/bbtree/README.md): `Cargo.toml`, `src/main.rs`, and the exact output quoted here in `results.txt`.

### Everything, linked

| Where | What you'll find |
|---|---|
| [Repository](https://github.com/XiangpengHao/bbtree), [crates.io](https://crates.io/crates/bbtree), [docs.rs](https://docs.rs/bbtree) | The code, releases and API docs |
| [The author's post](https://bbtree.xiangpeng.systems/post/) and [explorer](https://bbtree.xiangpeng.systems/explorer/) | Animated figures and a live tree to search |
| [Visualizer source](https://github.com/XiangpengHao/bbtree/tree/main/bbtree/vis) | How the explorer reads the tree's own views |
| [Design docs](https://github.com/XiangpengHao/bbtree/tree/main/design) | [Starting brief](https://github.com/XiangpengHao/bbtree/blob/main/design/00-init.md), [lessons from Bf-Tree](https://github.com/XiangpengHao/bbtree/blob/main/design/01-bftree.md), [decision log](https://github.com/XiangpengHao/bbtree/blob/main/design/03-decisions.md), [inline keys](https://github.com/XiangpengHao/bbtree/blob/main/design/04-inline-key.md), [prefix from fences](https://github.com/XiangpengHao/bbtree/blob/main/design/05-fence-key.md), [cost model](https://github.com/XiangpengHao/bbtree/blob/main/design/06-cost-model.md), [concurrency](https://github.com/XiangpengHao/bbtree/blob/main/design/09-concurrency.md), [batch API](https://github.com/XiangpengHao/bbtree/blob/main/design/12-batch-api.md), [fuzzing and proofs](https://github.com/XiangpengHao/bbtree/blob/main/design/08-fuzzing-verification.md) |
| [bbtree-eval](https://github.com/XiangpengHao/bbtree-eval) | The harness behind the README's charts |
| [Bf-Tree](https://github.com/microsoft/bf-tree) | The author's earlier tree, running in production at Microsoft |
| [bbtree-mmap](https://crates.io/crates/bbtree-mmap) | Write a tree to disk once, `mmap` it, query it with no rebuild |

<details>
<summary>Limits of this post</summary>

- Our numbers come from one 2-vCPU cloud VM (Intel Xeon at 2.10 GHz, 260 MiB L3, AVX-512), two rounds each. Absolute times are slow for this class of CPU, likely from virtualization; read the ratios, not the nanoseconds.
- The benchmark indexes into a key list to pick each lookup, which adds the same cache miss to both maps. It narrows bbtree's lead a little rather than widening it.
- The URL keys are synthetic (a 30-byte prefix, a word, an 8-digit hex id), not real titles.
- We didn't measure concurrency (2 vCPUs), the LSM-tree and Turso integrations, or cache lines with hardware counters. Those figures are the project's own, cited as such.
- The node simulator counts exactly what its 11 keys would read, but treats every key on the heap as one line and leaves out the value, which is one more line in every layout.

</details>

[^repo]: Xiangpeng Hao, [bbtree](https://github.com/XiangpengHao/bbtree), GitHub, 2026; first published to [crates.io](https://crates.io/crates/bbtree) on 18 Oct 2026.
[^bayer]: Rudolf Bayer and Edward McCreight, [Organization and Maintenance of Large Ordered Indices](https://doi.org/10.1007/BF00288683), Acta Informatica, 1972.
[^post]: Xiangpeng Hao, [bbtree: fastest ordered map](https://bbtree.xiangpeng.systems/post/), 2026; its text is also in the repo as [design/14-blogpost.md](https://github.com/XiangpengHao/bbtree/blob/main/design/14-blogpost.md).
[^decisions]: bbtree, [design/03-decisions.md](https://github.com/XiangpengHao/bbtree/blob/main/design/03-decisions.md) (D15, node size) and the run notes in [design/14-blogpost.md](https://github.com/XiangpengHao/bbtree/blob/main/design/14-blogpost.md), Ryzen 9 9900X, 2026.
[^stdsrc]: Rust standard library, [btree/node.rs](https://github.com/rust-lang/rust/blob/1.97.0/library/alloc/src/collections/btree/node.rs) (`B = 6`, so 11 keys a node) and [btree/search.rs](https://github.com/rust-lang/rust/blob/1.97.0/library/alloc/src/collections/btree/search.rs) (`find_key_index` walks keys in order), Rust 1.97.
[^rao]: Jun Rao and Kenneth A. Ross, [Making B+-Trees Cache Conscious in Main Memory](https://doi.org/10.1145/342009.335449), SIGMOD, 2000.
[^graefe-larson]: Goetz Graefe and Per-Åke Larson, [B-Tree Indexes and CPU Caches](https://doi.org/10.1109/ICDE.2001.914847), ICDE, 2001.
[^umbra]: Thomas Neumann and Michael Freitag, [Umbra: A Disk-Based System with In-Memory Performance](https://db.in.tum.de/~freitag/papers/p29-neumann-cidr20.pdf), CIDR, 2020.
[^stringview]: Xiangpeng Hao and Andrew Lamb, [Using StringView / German Style Strings to Make Queries Faster](https://datafusion.apache.org/blog/2024/09/13/string-view-german-style-strings-part-1/), Apache DataFusion blog, 2024.
[^prefix]: Rudolf Bayer and Karl Unterauer, [Prefix B-Trees](https://doi.org/10.1145/320521.320530), ACM TODS, 1977.
[^fence]: bbtree, [design/05-fence-key.md](https://github.com/XiangpengHao/bbtree/blob/main/design/05-fence-key.md), 2026.
[^kary]: Benjamin Schlegel, Rainer Gemulla and Wolfgang Lehner, [k-ary Search on Modern Processors](https://doi.org/10.1145/1565694.1565705), DaMoN, 2009.
[^interleave]: Onur Kocberber, Babak Falsafi and Boris Grot, [Asynchronous Memory Access Chaining](https://www.vldb.org/pvldb/vol9/p252-kocberber.pdf), VLDB, 2015; Georgios Psaropoulos et al., [Interleaving with Coroutines](https://www.vldb.org/pvldb/vol11/p230-psaropoulos.pdf), VLDB, 2017; Christopher Jonathan et al., [Exploiting Coroutines to Attack the "Killer Nanoseconds"](https://www.vldb.org/pvldb/vol11/p1702-jonathan.pdf), VLDB, 2018.
[^batch]: bbtree, [design/12-batch-api.md](https://github.com/XiangpengHao/bbtree/blob/main/design/12-batch-api.md), 2026.
[^olfit]: Sang K. Cha et al., [Cache-Conscious Concurrency Control of Main-Memory Indexes on Shared-Memory Multiprocessor Systems](https://www.vldb.org/conf/2001/P181.pdf), VLDB, 2001.
[^olc]: Viktor Leis et al., [The ART of Practical Synchronization](https://db.in.tum.de/~leis/papers/artsync.pdf), DaMoN, 2016.
[^conc]: bbtree, [design/09-concurrency.md](https://github.com/XiangpengHao/bbtree/blob/main/design/09-concurrency.md), 2026.
[^tsm]: Michael Greenwald and David Cheriton, [The Synergy Between Non-Blocking Synchronization and Operating System Structure](https://www.usenix.org/legacy/publications/library/proceedings/osdi96/full_papers/greenwald/index.html), OSDI, 1996.
[^cost]: bbtree, [design/06-cost-model.md](https://github.com/XiangpengHao/bbtree/blob/main/design/06-cost-model.md) ("64-byte node alignment"), 2026.
[^bftree]: Xiangpeng Hao and Badrish Chandramouli, [Bf-Tree: A Modern Read-Write-Optimized Concurrent Larger-Than-Memory Range Index](https://www.vldb.org/pvldb/vol17/p3442-hao.pdf), VLDB, 2024.
[^fuzz]: bbtree, [fuzz targets](https://github.com/XiangpengHao/bbtree/tree/main/bbtree/fuzz/fuzz_targets) and [design/08-fuzzing-verification.md](https://github.com/XiangpengHao/bbtree/blob/main/design/08-fuzzing-verification.md), 2026.
[^verus]: Andrea Lattuada et al., [Verus: Verifying Rust Programs using Linear Ghost Types](https://doi.org/10.1145/3586037), OOPSLA, 2023; bbtree's [proofs](https://github.com/XiangpengHao/bbtree/tree/main/bbtree/src/proof).
[^shuttle]: AWS Labs, [Shuttle](https://github.com/awslabs/shuttle), a library for testing concurrent Rust code.
[^issue9]: bbtree, [issue #9](https://github.com/XiangpengHao/bbtree/issues/9), found with [ffs](https://github.com/aoli-al/ffs), 2026.
[^vis]: bbtree, [the explorer](https://bbtree.xiangpeng.systems/explorer/) and its [source](https://github.com/XiangpengHao/bbtree/tree/main/bbtree/vis), 2026.
