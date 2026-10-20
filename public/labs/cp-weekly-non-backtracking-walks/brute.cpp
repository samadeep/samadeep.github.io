// Brute force: BFS over all 2^N face-up/face-down states, trying every legal operation.
#include <bits/stdc++.h>
using namespace std;
int main() {
    int T; if (scanf("%d", &T) != 1) return 0;
    while (T--) {
        int n; if (scanf("%d", &n) != 1) return 0;
        vector<int> A(n), B(n);
        for (int i = 0; i < n; i++) if (scanf("%d %d", &A[i], &B[i]) != 2) return 0;
        vector<int> d(1 << n, -1); d[0] = 0; queue<int> q; q.push(0);
        int goal = 3;  // cards 1 and 2 face down
        while (!q.empty()) {
            int m = q.front(); q.pop();
            for (int x = 0; x < n; x++) for (int y = x + 1; y < n; y++) {
                int vx = (m >> x & 1) ? B[x] : A[x], vy = (m >> y & 1) ? B[y] : A[y];
                if (vx != vy) continue;
                int t = m ^ (1 << x) ^ (1 << y);
                if (d[t] < 0) { d[t] = d[m] + 1; q.push(t); }
            }
        }
        printf("%d\n", d[goal]);
    }
}
