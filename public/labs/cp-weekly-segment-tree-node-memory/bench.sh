#!/usr/bin/env bash
# Time the segment tree at the problem's limits (N = 100000, W = 10, Q = 50000),
# and the per-query BFS baseline on a short run, on a one-digit grid (BFS's worst case).
set -euo pipefail
cd "$(dirname "$0")"
g++ -O2 -std=c++17 connectivity.cpp -o /tmp/connectivity
TIMEFORMAT='%R s'
for k in 2 1; do
  python3 gen.py 7 100000 10 50000 $k > /tmp/max.txt
  echo "digits=$k  N=100000 W=10 Q=50000 ($(grep -c '^2 ' /tmp/max.txt) connectivity queries)"
  echo -n "  segment tree: "; { time /tmp/connectivity < /tmp/max.txt > /tmp/seg.txt; } 2>&1
  echo "  answers: $(grep -c Yes /tmp/seg.txt) Yes, $(grep -c No /tmp/seg.txt) No"
done
python3 gen.py 9 100000 10 300 1 > /tmp/bfs.txt
echo "digits=1  N=100000 W=10 Q=300 ($(grep -c '^2 ' /tmp/bfs.txt) connectivity queries)"
echo -n "  BFS per query: "; { time /tmp/connectivity --bfs < /tmp/bfs.txt > /tmp/b1.txt; } 2>&1
echo -n "  segment tree:  "; { time /tmp/connectivity < /tmp/bfs.txt > /tmp/b2.txt; } 2>&1
cmp -s /tmp/b1.txt /tmp/b2.txt && echo "  same answers"
