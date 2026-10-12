// Times solve() on one input file, fast scan vs naive scan.
#define NO_MAIN
#include "two_flips.cpp"
int main(int argc, char** argv) {
    int T; if (scanf("%d", &T) != 1) return 1;
    vector<int> ns; vector<vector<int>> As, Bs;
    while (T--) { int n; if (scanf("%d", &n) != 1) return 1; vector<int> A(n), B(n);
        for (int i = 0; i < n; i++) if (scanf("%d %d", &A[i], &B[i]) != 2) return 1;
        ns.push_back(n); As.push_back(A); Bs.push_back(B); }
    for (bool naive : {false, true}) { if (naive && argc > 1 && string(argv[1]) == "--fast-only") continue;
        auto t0 = chrono::steady_clock::now(); long long last = 0;
        for (size_t k = 0; k < ns.size(); k++) last = solve(ns[k], As[k], Bs[k], naive);
        double ms = chrono::duration<double, milli>(chrono::steady_clock::now() - t0).count();
        printf("%-6s scan: answer %lld, %.1f ms\n", naive ? "naive" : "fast", last, ms);
    }
}
