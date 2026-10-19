"""Boundary connectivity as a segment tree monoid (AAL Contest 001 R, "Connectivity").

A block of rows is summarised by its top row, its bottom row and which of those
boundary cells are connected inside the block. Two summaries glue into one.

  python3 boundary.py --node 101/111            what one block stores
  python3 boundary.py --glue 111/101 001/111     glue an upper block onto a lower one
  python3 boundary.py --trap                     why rows a..c alone give the wrong answer
  python3 boundary.py --stress 300               random grids vs BFS
"""
import random
import sys
from collections import deque

NAMES = "ABCDEFGHIJKLMNOPQRST"


class DSU:
    def __init__(self, n):
        self.p = list(range(n))

    def find(self, x):
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a, b):
        self.p[self.find(a)] = self.find(b)


def canon(dsu, idx):
    seen, out = {}, []
    for i in idx:
        out.append(seen.setdefault(dsu.find(i), len(seen)))
    return out


def leaf(row):
    """One row: its own top and bottom. Neighbours with the same digit are joined."""
    w = len(row)
    d = DSU(w)
    for j in range(w - 1):
        if row[j] == row[j + 1]:
            d.union(j, j + 1)
    return (row, row, canon(d, list(range(w)) * 2))


def glue(A, B):
    """A sits directly above B. Union inside A, inside B, and down the seam."""
    if A is None:
        return B
    if B is None:
        return A
    (atop, abot, alab), (btop, bbot, blab) = A, B
    w = len(atop)
    d = DSU(4 * w)
    for base, lab in ((0, alab), (2 * w, blab)):
        first = {}
        for i, x in enumerate(lab):
            d.union(base + i, base + first.setdefault(x, i))
    for j in range(w):
        if abot[j] == btop[j]:
            d.union(w + j, 2 * w + j)
    idx = list(range(w)) + list(range(3 * w, 4 * w))
    return (atop, bbot, canon(d, idx))


def block(rows):
    node = None
    for r in rows:
        node = glue(node, leaf(r))
    return node


def show(node, title):
    top, bot, lab = node
    w = len(top)
    print(title)
    print("  top row    " + " ".join(top) + "   labels " + " ".join(NAMES[x] for x in lab[:w]))
    print("  bottom row " + " ".join(bot) + "   labels " + " ".join(NAMES[x] for x in lab[w:]))


def connected(rows, a, b, c, d):
    """0-indexed cells, a <= c. Glue rows above, the band a..c, rows below."""
    w = len(rows[0])
    U, M, D = block(rows[:a]), block(rows[a:c + 1]), block(rows[c + 1:])
    s = DSU(6 * w)
    for k, part in enumerate((U, M, D)):
        if part is None:
            continue
        first = {}
        for i, x in enumerate(part[2]):
            s.union(2 * w * k + i, 2 * w * k + first.setdefault(x, i))
    for j in range(w):
        if U and U[1][j] == M[0][j]:
            s.union(w + j, 2 * w + j)
        if D and M[1][j] == D[0][j]:
            s.union(3 * w + j, 4 * w + j)
    return s.find(2 * w + b) == s.find(3 * w + d)


def band_only(rows, a, b, c, d):
    w = len(rows[0])
    lab = block(rows[a:c + 1])[2]
    return lab[b] == lab[w + d]


def bfs(rows, a, b, c, d):
    n, w, ch = len(rows), len(rows[0]), rows[a][b]
    seen, q = {(a, b)}, deque([(a, b)])
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < n and 0 <= ny < w and (nx, ny) not in seen and rows[nx][ny] == ch:
                seen.add((nx, ny))
                q.append((nx, ny))
    return (c, d) in seen


def main(argv):
    if not argv or argv[0] == "--trap":
        rows = ["111", "101", "001"]
        print("grid (rows 1..3):")
        for i, r in enumerate(rows, 1):
            print(f"  {i}: " + " ".join(r))
        print("query: is (2,1) connected to (2,3)?  both are 1")
        print("  rows 2..2 only        :", "Yes" if band_only(rows, 1, 0, 1, 2) else "No")
        print("  above + band + below  :", "Yes" if connected(rows, 1, 0, 1, 2) else "No")
        print("  BFS on the whole grid :", "Yes" if bfs(rows, 1, 0, 1, 2) else "No")
    elif argv[0] == "--node":
        show(block(argv[1].split("/")), "block " + argv[1])
    elif argv[0] == "--glue":
        A, B = block(argv[1].split("/")), block(argv[2].split("/"))
        show(A, "upper " + argv[1])
        show(B, "lower " + argv[2])
        show(glue(A, B), "glued " + argv[1] + "/" + argv[2])
    elif argv[0] == "--stress":
        cases = int(argv[1]) if len(argv) > 1 else 300
        rng = random.Random(1)
        queries = wrong = band_wrong = 0
        for _ in range(cases):
            n, w = rng.randint(2, 8), rng.randint(2, 6)
            rows = ["".join(rng.choice("01") for _ in range(w)) for _ in range(n)]
            for _ in range(10):
                a, c = sorted((rng.randrange(n), rng.randrange(n)))
                b, d = rng.randrange(w), rng.randrange(w)
                if (a, b) == (c, d) or rows[a][b] != rows[c][d]:
                    continue
                truth = bfs(rows, a, b, c, d)
                queries += 1
                wrong += connected(rows, a, b, c, d) != truth
                band_wrong += band_only(rows, a, b, c, d) != truth
        print(f"grids: {cases}  queries: {queries}")
        print(f"glued summaries vs BFS: {wrong} wrong")
        print(f"rows a..c only vs BFS:  {band_wrong} wrong")
    else:
        print(__doc__)


main(sys.argv[1:])
