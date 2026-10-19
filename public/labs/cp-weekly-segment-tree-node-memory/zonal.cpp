// ABC480 G (Zonal Score Minimization): split A into pieces of length >= 2, minimise
// the sum of (max - min). dp[i] = min over j <= i-2 of dp[j] + max(A[j+1..i]) - min(A[j+1..i]).
// Monotonic stacks turn every change of max/min over the split points j into one range add
// on a lazy segment tree that holds dp[j] + max - min; dp[i] is a range minimum.
// Run: ./zonal < input  |  ./zonal --stress  |  ./zonal --bench
#include <bits/stdc++.h>
using namespace std;
typedef long long ll;
const ll INF = LLONG_MAX / 4;

struct Lazy {  // range add, range min
    int n; vector<ll> mn, lz;
    Lazy(int n_) : n(1) { while (n < n_) n <<= 1; mn.assign(2 * n, INF); lz.assign(2 * n, 0); }
    void add(int l, int r, ll v, int k, int a, int b) {
        if (r <= a || b <= l) return;
        if (l <= a && b <= r) { mn[k] += v; lz[k] += v; return; }
        int m = (a + b) / 2;
        add(l, r, v, 2 * k, a, m); add(l, r, v, 2 * k + 1, m, b);
        mn[k] = min(mn[2 * k], mn[2 * k + 1]) + lz[k];
    }
    void add(int l, int r, ll v) { if (l < r) add(l, r, v, 1, 0, n); }
    void setv(int i, ll v) {  // point assign (only on a fresh slot)
        ll acc = 0; vector<int> path; int k = 1, a = 0, b = n;
        while (b - a > 1) { path.push_back(k); acc += lz[k]; int m = (a + b) / 2; if (i < m) { k = 2 * k; b = m; } else { k = 2 * k + 1; a = m; } }
        mn[k] = v - acc;
        for (int j = path.size() - 1; j >= 0; j--) { int p = path[j]; mn[p] = min(mn[2 * p], mn[2 * p + 1]) + lz[p]; }
    }
    ll query(int l, int r, int k, int a, int b) {
        if (r <= a || b <= l) return INF;
        if (l <= a && b <= r) return mn[k];
        int m = (a + b) / 2;
        return min(query(l, r, 2 * k, a, m), query(l, r, 2 * k + 1, m, b)) + lz[k];
    }
    ll query(int l, int r) { return l < r ? query(l, r, 1, 0, n) : INF; }
};

ll fast(const vector<ll>& A) {  // A is 1-indexed, A[0] unused
    int N = A.size() - 1;
    Lazy t(N + 1);
    vector<ll> dp(N + 1, INF); dp[0] = 0;
    // stack entries: (value, leftmost j of the block). Block covers j in [left, next block's left).
    vector<pair<ll, int>> mx, mnst;
    for (int i = 1; i <= N; i++) {
        // slot j = i-1 starts as dp[i-1] (+ A_i - A_i = 0 for the one-element range)
        t.setv(i - 1, dp[i - 1] >= INF ? INF / 2 : dp[i - 1]);
        int left = i - 1;
        while (!mx.empty() && mx.back().first <= A[i]) {
            int l = mx.back().second, r = left;  // block [l, r)
            t.add(l, r, A[i] - mx.back().first); left = l; mx.pop_back();
        }
        mx.push_back({A[i], left});
        left = i - 1;
        while (!mnst.empty() && mnst.back().first >= A[i]) {
            int l = mnst.back().second, r = left;
            t.add(l, r, mnst.back().first - A[i]); left = l; mnst.pop_back();
        }
        mnst.push_back({A[i], left});
        if (i >= 2) dp[i] = t.query(0, i - 1);  // j in [0, i-2]
    }
    return dp[N];
}

ll brute(const vector<ll>& A) {
    int N = A.size() - 1; vector<ll> dp(N + 1, INF); dp[0] = 0;
    for (int i = 2; i <= N; i++) {
        ll hi = A[i], lo = A[i];
        for (int j = i - 1; j >= 1; j--) {  // piece A[j..i], length i-j+1 >= 2
            hi = max(hi, A[j]); lo = min(lo, A[j]);
            if (dp[j - 1] < INF) dp[i] = min(dp[i], dp[j - 1] + hi - lo);
        }
    }
    return dp[N];
}

int main(int argc, char** argv) {
    string mode = argc > 1 ? argv[1] : "";
    if (mode == "--stress") {
        mt19937_64 rng(1); int bad = 0, cases = 20000;
        for (int c = 0; c < cases; c++) {
            int n = 2 + rng() % 12; vector<ll> A(n + 1);
            for (int i = 1; i <= n; i++) A[i] = 1 + rng() % (c % 2 ? 10 : 1000000000);
            if (fast(A) != brute(A)) bad++;
        }
        printf("random cases: %d  mismatches vs O(N^2) DP: %d\n", cases, bad);
    } else if (mode == "--bench") {
        mt19937_64 rng(2); int n = 200000; vector<ll> A(n + 1);
        for (int i = 1; i <= n; i++) A[i] = 1 + rng() % 1000000000;
        auto t0 = chrono::steady_clock::now(); ll f = fast(A);
        auto t1 = chrono::steady_clock::now(); ll b = brute(A);
        auto t2 = chrono::steady_clock::now();
        printf("N = %d: stacks + lazy segtree %.3f s, O(N^2) DP %.1f s, same answer: %s\n", n,
               chrono::duration<double>(t1 - t0).count(), chrono::duration<double>(t2 - t1).count(), f == b ? "yes" : "no");
    } else {
        int n; cin >> n; vector<ll> A(n + 1); for (int i = 1; i <= n; i++) cin >> A[i];
        cout << fast(A) << "\n";
    }
}
