// ARC232 B "Two Flips": shortest non-backtracking walk on the value graph.
// Vertices are values, card i is an edge A_i - B_i. A plan of operations is a walk that
// starts on card 1 (B1 -> A1), ends on card 2 (A2 -> B2) and never uses the same card twice
// in a row. Answer = (cards on the walk) - 1, or -1 if no such walk exists.
#include <bits/stdc++.h>
using namespace std;

// state s = 2*i + d: we just walked card i and stand at its end d (0 = at A_i, 1 = at B_i)
long long solve(int n, const vector<int>& A, const vector<int>& B, bool naive = false) {
    int V = 2 * n + 1;
    vector<vector<int>> adj(V);                       // value -> cards touching it
    for (int i = 0; i < n; i++) { adj[A[i]].push_back(i); adj[B[i]].push_back(i); }
    vector<int> dist(2 * n, -1);
    vector<int> expanded(V, 0), firstFrom(V, -1);     // how often each value was scanned
    deque<int> q;
    dist[2 * 0 + 0] = 1; q.push_back(0);              // walked card 1 from B1 to A1
    while (!q.empty()) {
        int s = q.front(); q.pop_front();
        int i = s / 2, at = (s % 2 == 0) ? A[i] : B[i];
        if (i == 1 && s % 2 == 1) return dist[s] - 1; // walked card 2 from A2 to B2
        auto relax = [&](int j) {
            if (j == i) return;                       // the one forbidden move: same card again
            int t = 2 * j + (A[j] == at ? 1 : 0);     // walk card j away from `at`
            if (dist[t] < 0) { dist[t] = dist[s] + 1; q.push_back(t); }
        };
        if (naive) { for (int j : adj[at]) relax(j); continue; }
        // A value only needs two full scans: the first entry excludes one card,
        // a second entry (by another card) can add only that excluded card.
        if (expanded[at] == 0) { expanded[at] = 1; firstFrom[at] = i; for (int j : adj[at]) relax(j); }
        else if (expanded[at] == 1 && i != firstFrom[at]) { expanded[at] = 2; relax(firstFrom[at]); }
    }
    return -1;
}

#ifndef NO_MAIN
int main(int argc, char** argv) {
    bool naive = argc > 1 && string(argv[1]) == "--naive";
    int T; if (scanf("%d", &T) != 1) return 0;
    while (T--) {
        int n; if (scanf("%d", &n) != 1) return 0;
        vector<int> A(n), B(n);
        for (int i = 0; i < n; i++) if (scanf("%d %d", &A[i], &B[i]) != 2) return 0;
        printf("%lld\n", solve(n, A, B, naive));
    }
}
#endif
