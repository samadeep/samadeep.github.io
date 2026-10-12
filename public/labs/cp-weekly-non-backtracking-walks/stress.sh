#!/bin/sh
# Compare the walk BFS (fast and naive scan) with the 2^N brute force on 10,000 random cases.
set -e
tmp=$(mktemp -d); total=0; neg=0
for seed in $(seq 1 200); do
  python3 gen.py "$seed" 50 > "$tmp/in"
  ./brute < "$tmp/in" > "$tmp/b"
  ./two_flips < "$tmp/in" > "$tmp/f"
  ./two_flips --naive < "$tmp/in" > "$tmp/n"
  cmp -s "$tmp/b" "$tmp/f" || { echo "MISMATCH seed=$seed"; exit 1; }
  cmp -s "$tmp/b" "$tmp/n" || { echo "MISMATCH (naive) seed=$seed"; exit 1; }
  cat "$tmp/b" >> "$tmp/all"
  total=$((total + 50))
done
echo "$total random cases, all match the brute force"
echo "answers:"; sort -n "$tmp/all" | uniq -c | awk '{printf "%s:%s ", $2, $1} END {print ""}'
rm -rf "$tmp"
