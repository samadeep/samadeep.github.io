//! std's BTreeMap against bbtree 0.1.5 on one thread.
//!
//!   bbtree-vs-std lookups u64 10000000
//!   bbtree-vs-std lookups url 2000000
//!   bbtree-vs-std memory  std|bbtree u64|url <n>
//!
//! Keys come from a fixed xorshift seed, so every run builds the same maps.

use std::collections::BTreeMap;
use std::hint::black_box;
use std::time::Instant;

#[cfg(feature = "mimalloc")]
#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

struct XorShift(u64);

impl XorShift {
    fn next(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }
}

const WORDS: [&str; 16] = [
    "History", "List", "Battle", "University", "Church", "River", "Album", "Station",
    "Election", "Football", "Album", "County", "School", "Mount", "Island", "Bridge",
];

/// Wikipedia-like URLs: a long shared prefix, a common word, then a short id.
fn url(rng: &mut XorShift) -> String {
    let r = rng.next();
    let word = WORDS[(r % 16) as usize];
    format!("https://en.wikipedia.org/wiki/{word}_of_{:08x}", (r >> 8) as u32)
}

fn keys_u64(n: usize) -> Vec<u64> {
    let mut rng = XorShift(0x9E37_79B9_7F4A_7C15);
    (0..n).map(|_| rng.next()).collect()
}

fn keys_url(n: usize) -> Vec<String> {
    let mut rng = XorShift(0x9E37_79B9_7F4A_7C15);
    (0..n).map(|_| url(&mut rng)).collect()
}

/// Indexes of keys to look up: present keys in a random order.
fn probes(n: usize, count: usize) -> Vec<usize> {
    let mut rng = XorShift(0xD1B5_4A32_D192_ED03);
    (0..count).map(|_| (rng.next() % n as u64) as usize).collect()
}

fn ns_per(start: Instant, ops: usize) -> f64 {
    start.elapsed().as_nanos() as f64 / ops as f64
}

fn rss_kib() -> u64 {
    let statm = std::fs::read_to_string("/proc/self/statm").unwrap();
    let pages: u64 = statm.split_whitespace().nth(1).unwrap().parse().unwrap();
    pages * 4
}

fn lookups_u64(n: usize) {
    let keys = keys_u64(n);
    let probe = probes(n, 4_000_000);
    println!("u64 keys, {n} entries, {} random lookups that hit", probe.len());

    let t = Instant::now();
    let mut std_map = BTreeMap::new();
    for &k in &keys {
        std_map.insert(k, k);
    }
    println!("  build  std BTreeMap         {:7.1} ns/insert", ns_per(t, n));

    let t = Instant::now();
    let mut bb = bbtree::unsync::BBTreeMap::new();
    for &k in &keys {
        bb.insert(k, k);
    }
    println!("  build  bbtree               {:7.1} ns/insert", ns_per(t, n));

    for round in 0..2 {
        let t = Instant::now();
        let mut sum = 0u64;
        for &i in &probe {
            sum = sum.wrapping_add(*std_map.get(black_box(&keys[i])).unwrap());
        }
        black_box(sum);
        let std_ns = ns_per(t, probe.len());

        let t = Instant::now();
        let mut sum = 0u64;
        for &i in &probe {
            sum = sum.wrapping_add(*bb.get(black_box(&keys[i])).unwrap());
        }
        black_box(sum);
        let bb_ns = ns_per(t, probe.len());

        let t = Instant::now();
        let mut sum = 0u64;
        for chunk in probe.chunks_exact(16) {
            let batch: [&u64; 16] = std::array::from_fn(|j| &keys[chunk[j]]);
            for v in bb.get_many(black_box(batch)) {
                sum = sum.wrapping_add(*v.unwrap());
            }
        }
        black_box(sum);
        let batch_ns = ns_per(t, probe.len());

        println!(
            "  get    round {round}: std {std_ns:6.1} ns   bbtree {bb_ns:6.1} ns   bbtree get_many(16) {batch_ns:6.1} ns   ({:.2}x, {:.2}x)",
            std_ns / bb_ns,
            std_ns / batch_ns
        );
    }
}

fn lookups_url(n: usize) {
    let keys = keys_url(n);
    let probe = probes(n, 2_000_000);
    println!("URL keys (e.g. {}), {n} entries, {} random lookups that hit", keys[0], probe.len());

    let t = Instant::now();
    let mut std_map = BTreeMap::new();
    for (i, k) in keys.iter().enumerate() {
        std_map.insert(k.clone(), i as u64);
    }
    println!("  build  std BTreeMap         {:7.1} ns/insert", ns_per(t, n));

    let t = Instant::now();
    let mut bb = bbtree::unsync::BBTreeMap::new();
    for (i, k) in keys.iter().enumerate() {
        bb.insert(k.clone(), i as u64);
    }
    println!("  build  bbtree               {:7.1} ns/insert", ns_per(t, n));

    for round in 0..2 {
        let t = Instant::now();
        let mut sum = 0u64;
        for &i in &probe {
            sum = sum.wrapping_add(*std_map.get(black_box(keys[i].as_str())).unwrap());
        }
        black_box(sum);
        let std_ns = ns_per(t, probe.len());

        let t = Instant::now();
        let mut sum = 0u64;
        for &i in &probe {
            sum = sum.wrapping_add(*bb.get(black_box(keys[i].as_str())).unwrap());
        }
        black_box(sum);
        let bb_ns = ns_per(t, probe.len());

        println!(
            "  get    round {round}: std {std_ns:6.1} ns   bbtree {bb_ns:6.1} ns   ({:.2}x)",
            std_ns / bb_ns
        );
    }
}

fn memory(map: &str, key: &str, n: usize) {
    // Keys are made one at a time as the map is built, so no key list shares the
    // resident set; only the map (and its keys' heap bytes) grows it.
    let mut rng = XorShift(0x9E37_79B9_7F4A_7C15);
    let before = rss_kib();
    let after = match (map, key) {
        ("std", "u64") => {
            let mut m = BTreeMap::new();
            for _ in 0..n { let k = rng.next(); m.insert(k, k); }
            let r = rss_kib(); black_box(&m); r
        }
        ("bbtree", "u64") => {
            let mut m = bbtree::unsync::BBTreeMap::new();
            for _ in 0..n { let k = rng.next(); m.insert(k, k); }
            let r = rss_kib(); black_box(&m); r
        }
        ("std", "url") => {
            let mut m = BTreeMap::new();
            for i in 0..n { m.insert(url(&mut rng), i as u64); }
            let r = rss_kib(); black_box(&m); r
        }
        ("bbtree", "url") => {
            let mut m = bbtree::unsync::BBTreeMap::new();
            for i in 0..n { m.insert(url(&mut rng), i as u64); }
            let r = rss_kib(); black_box(&m); r
        }
        _ => panic!("map is std|bbtree, key is u64|url"),
    };
    let bytes = (after - before) as f64 * 1024.0;
    println!("memory {map:6} {key:3} {n} entries: {:7.1} MiB resident, {:5.1} B/entry", bytes / 1048576.0, bytes / n as f64);
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let n = |i: usize| args[i].parse::<usize>().unwrap();
    match args.get(1).map(String::as_str) {
        Some("lookups") if args[2] == "u64" => lookups_u64(n(3)),
        Some("lookups") if args[2] == "url" => lookups_url(n(3)),
        Some("memory") => memory(&args[2], &args[3], n(4)),
        _ => eprintln!("usage: lookups u64|url <n> | memory std|bbtree u64|url <n>"),
    }
}
