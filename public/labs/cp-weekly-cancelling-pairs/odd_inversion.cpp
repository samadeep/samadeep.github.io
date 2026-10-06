// AtCoder ARC231 E "Odd Inversion": count B with 1 <= B_i <= A_i (A non-decreasing)
// whose inversion count is odd, mod 998244353.
//
// Idea: X = (#even) - (#odd) is easy, because swapping two adjacent distinct values
// flips parity and cancels them in pairs. Then odd = (total - X) / 2.
//   X_0 = 1, X_1 = A_1, X_i = (A_i - A_{i-1}) X_{i-1} + A_{i-1} X_{i-2}
//
//   ./odd_inversion < input.txt      solve (AtCoder input format)
//   ./odd_inversion stress [trials]  compare with brute force on small random inputs
//   ./odd_inversion bench            time T=2 cases with N=200000 (sum N = 400000)
#include <bits/stdc++.h>
using namespace std;
using ll = long long;
const ll MOD = 998244353;

ll power(ll b, ll e) { ll r = 1; b %= MOD; for (; e; e >>= 1, b = b * b % MOD) if (e & 1) r = r * b % MOD; return r; }

ll solve(const vector<ll>& A) {
  ll total = 1;
  for (ll a : A) total = total * (a % MOD) % MOD;
  ll x2 = 1, x1 = A[0] % MOD;  // X_{i-2}, X_{i-1}
  for (size_t i = 1; i < A.size(); i++) {
    ll x = ((A[i] - A[i - 1]) % MOD * x1 + A[i - 1] % MOD * x2) % MOD;
    x2 = x1; x1 = x;
  }
  return (total - x1 + MOD) % MOD * power(2, MOD - 2) % MOD;
}

// enumerate every B, count inversions directly
ll brute(const vector<ll>& A) {
  int n = A.size(); vector<ll> B(n, 1); ll odd = 0;
  while (true) {
    int inv = 0;
    for (int i = 0; i < n; i++) for (int j = i + 1; j < n; j++) inv += B[i] > B[j];
    odd += inv & 1;
    int k = n - 1;
    while (k >= 0 && B[k] == A[k]) B[k--] = 1;
    if (k < 0) break;
    B[k]++;
  }
  return odd % MOD;
}

int main(int argc, char** argv) {
  string mode = argc > 1 ? argv[1] : "";
  if (mode == "stress") {
    int trials = argc > 2 ? atoi(argv[2]) : 2000;
    mt19937_64 rng(231);
    for (int t = 1; t <= trials; t++) {
      int n = rng() % 7 + 1; vector<ll> A(n);
      for (auto& a : A) a = rng() % 5 + 1;
      sort(A.begin(), A.end());
      ll want = brute(A), got = solve(A);
      if (want != got) {
        printf("MISMATCH on trial %d: A =", t);
        for (ll a : A) printf(" %lld", a);
        printf("  brute=%lld fast=%lld\n", want, got);
        return 1;
      }
    }
    printf("stress: %d random cases (N <= 7, A_i <= 5), all match brute force\n", trials);
    return 0;
  }
  if (mode == "bench") {
    mt19937_64 rng(478); vector<vector<ll>> cases(2, vector<ll>(200000));
    for (auto& A : cases) { for (auto& a : A) a = rng() % 1000000000 + 1; sort(A.begin(), A.end()); }
    auto t0 = chrono::steady_clock::now(); ll sink = 0;
    for (auto& A : cases) sink ^= solve(A);
    double ms = chrono::duration<double, milli>(chrono::steady_clock::now() - t0).count();
    printf("bench: T=2, N=200000 each, A_i up to 1e9: %.2f ms (checksum %lld)\n", ms, sink);
    return 0;
  }
  int T; if (scanf("%d", &T) != 1) return 0;
  while (T--) {
    int n; if (scanf("%d", &n) != 1) return 1; vector<ll> A(n);
    for (auto& a : A) if (scanf("%lld", &a) != 1) return 1;
    printf("%lld\n", solve(A));
  }
}
