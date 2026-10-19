# Brute force for AAL Contest 001 R: BFS over the whole grid for every query.
import sys
from collections import deque
def main():
    data = sys.stdin.read().split(); it = iter(data)
    n, w, q = int(next(it)), int(next(it)), int(next(it))
    g = [list(next(it)) for _ in range(n)]
    out = []
    for _ in range(q):
        t = int(next(it))
        if t == 1:
            i = int(next(it)); g[i - 1] = list(next(it))
        else:
            a, b, c, d = (int(next(it)) - 1 for _ in range(4))
            ch = g[a][b]; seen = {(a, b)}; dq = deque([(a, b)])
            while dq:
                x, y = dq.popleft()
                for nx, ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
                    if 0 <= nx < n and 0 <= ny < w and (nx, ny) not in seen and g[nx][ny] == ch:
                        seen.add((nx, ny)); dq.append((nx, ny))
            out.append("Yes" if (c, d) in seen else "No")
    print("\n".join(out))
main()
