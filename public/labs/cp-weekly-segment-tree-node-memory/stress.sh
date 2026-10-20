#!/usr/bin/env bash
# Compare the segment tree against BFS on random small grids; also count how often
# the "band only" shortcut (rows a..c) gives a wrong answer.
set -euo pipefail
cd "$(dirname "$0")"
g++ -O2 -std=c++17 connectivity.cpp -o /tmp/connectivity
cases=${1:-2000}; queries=0; mism=0; bandwrong=0
for ((s = 1; s <= cases; s++)); do
  n=$((2 + s % 9)); w=$((2 + s % 9))
  python3 gen.py "$s" "$n" "$w" 12 2 > /tmp/in.txt
  python3 brute.py < /tmp/in.txt > /tmp/want.txt
  /tmp/connectivity < /tmp/in.txt > /tmp/got.txt
  /tmp/connectivity --band-only < /tmp/in.txt > /tmp/band.txt
  if ! cmp -s /tmp/want.txt /tmp/got.txt; then echo "MISMATCH seed $s"; mism=$((mism + 1)); fi
  queries=$((queries + $(wc -l < /tmp/want.txt)))
  bandwrong=$((bandwrong + $(paste /tmp/want.txt /tmp/band.txt | awk '$1 != $2' | wc -l)))
done
echo "cases: $cases  queries: $queries  segment tree mismatches: $mism  band-only wrong answers: $bandwrong"
