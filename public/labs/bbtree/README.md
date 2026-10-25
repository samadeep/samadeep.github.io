# bbtree vs std's BTreeMap, one thread

The benchmark behind "How Did a 50-Year-Old B-Tree Get 3× Faster?" on samadeep.github.io.
`results.txt` is the run quoted in the post (2-vCPU cloud Xeon, 25 Oct 2026, bbtree 0.1.5, Rust 1.97).

```zsh
# glibc's malloc, AVX-512 on if your CPU has it
RUSTFLAGS="-C target-cpu=native" cargo build --release
./target/release/bbtree-vs-std lookups u64 10000000
./target/release/bbtree-vs-std lookups url 2000000
./target/release/bbtree-vs-std memory std u64 10000000
./target/release/bbtree-vs-std memory bbtree u64 10000000

# the same with mimalloc as the global allocator
RUSTFLAGS="-C target-cpu=native" cargo build --release --features mimalloc --target-dir target-mi
./target-mi/release/bbtree-vs-std memory bbtree u64 10000000

# portable build (no target-cpu=native): bbtree falls back from AVX-512
cargo build --release --features mimalloc --target-dir target-portable
./target-portable/release/bbtree-vs-std lookups u64 10000000
```

Each `memory` run is its own process and builds one map, so nothing else shares the resident set.
Lookups index into the key list, which costs both maps the same extra cache miss per lookup.
