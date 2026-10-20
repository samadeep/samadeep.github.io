// AAL Contest 001 R "Connectivity": same-digit connectivity in an N x W grid with row updates.
// Segment tree over rows. A node for rows [L, R] stores its top row, its bottom row and
// which of those 2W boundary cells are connected using only rows L..R.
// Build: g++ -O2 -std=c++17 connectivity.cpp -o connectivity
// Run:   ./connectivity [--band-only | --bfs] < input.txt
#include <bits/stdc++.h>
using namespace std;

static int W;

struct Node {
    bool empty = true;   // identity element of the monoid
    string top, bot;     // digits of the first and last row
    array<int8_t, 20> lab{};  // lab[0..W-1] top cells, lab[W..2W-1] bottom cells; equal = connected
};

struct DSU {
    int p[60];  // up to 6W cells (three blocks glued in a query), W <= 10
    void init(int n) { for (int i = 0; i < n; i++) p[i] = i; }
    int f(int x) { while (p[x] != x) x = p[x] = p[p[x]]; return x; }
    void u(int a, int b) { p[f(a)] = f(b); }
};

// relabel so labels are 0,1,2,... in order of first appearance (keeps nodes canonical)
static void canon(Node& n, DSU& d, const int* idx) {
    int seen[40]; memset(seen, -1, sizeof seen); int k = 0;
    for (int i = 0; i < 2 * W; i++) {
        int r = d.f(idx[i]);
        if (seen[r] < 0) seen[r] = k++;
        n.lab[i] = (int8_t)seen[r];
    }
}

Node leaf(const string& s) {
    Node n; n.empty = false; n.top = n.bot = s;
    DSU d; d.init(W);
    for (int j = 0; j + 1 < W; j++) if (s[j] == s[j + 1]) d.u(j, j + 1);
    int idx[20]; for (int j = 0; j < W; j++) idx[j] = idx[W + j] = j;  // top cell j == bottom cell j
    canon(n, d, idx);
    return n;
}

// glue A (upper) onto B (lower): union inside A, inside B, and down the seam
Node op(const Node& A, const Node& B) {
    if (A.empty) return B;
    if (B.empty) return A;
    DSU d; d.init(4 * W);
    // A's boundary cells are 0..2W-1, B's are 2W..4W-1. Same label = same component.
    int firstA[20], firstB[20]; memset(firstA, -1, sizeof firstA); memset(firstB, -1, sizeof firstB);
    for (int i = 0; i < 2 * W; i++) {
        int a = A.lab[i]; if (firstA[a] < 0) firstA[a] = i; else d.u(i, firstA[a]);
        int b = B.lab[i]; if (firstB[b] < 0) firstB[b] = i; else d.u(2 * W + i, 2 * W + firstB[b]);
    }
    for (int j = 0; j < W; j++)  // seam: A's bottom row sits on top of B's top row
        if (A.bot[j] == B.top[j]) d.u(W + j, 2 * W + j);
    Node n; n.empty = false; n.top = A.top; n.bot = B.bot;
    int idx[20]; for (int j = 0; j < W; j++) { idx[j] = j; idx[W + j] = 3 * W + j; }
    canon(n, d, idx);
    return n;
}

struct Seg {
    int n; vector<Node> t;
    Seg(const vector<string>& rows) : n(1) {
        while (n < (int)rows.size()) n <<= 1;
        t.assign(2 * n, Node());
        for (size_t i = 0; i < rows.size(); i++) t[n + i] = leaf(rows[i]);
        for (int i = n - 1; i >= 1; i--) t[i] = op(t[2 * i], t[2 * i + 1]);
    }
    void set(int i, const string& s) { i += n; t[i] = leaf(s); for (i >>= 1; i; i >>= 1) t[i] = op(t[2 * i], t[2 * i + 1]); }
    Node prod(int l, int r) {  // rows [l, r), order matters: the monoid is not commutative
        Node L, R;
        for (l += n, r += n; l < r; l >>= 1, r >>= 1) {
            if (l & 1) L = op(L, t[l++]);
            if (r & 1) R = op(t[--r], R);
        }
        return op(L, R);
    }
};

// Are (a,b) and (c,d) connected? 0-indexed, a <= c. Glue rows above, the band, rows below.
bool connected(Seg& st, int N, int a, int b, int c, int d) {
    Node U = st.prod(0, a), M = st.prod(a, c + 1), D = st.prod(c + 1, N);
    DSU s; s.init(6 * W);  // U: 0..2W-1, M: 2W..4W-1, D: 4W..6W-1
    const Node* part[3] = {&U, &M, &D};
    for (int k = 0; k < 3; k++) {
        if (part[k]->empty) continue;
        int first[20]; memset(first, -1, sizeof first);
        for (int i = 0; i < 2 * W; i++) {
            int x = part[k]->lab[i];
            if (first[x] < 0) first[x] = i; else s.u(2 * W * k + i, 2 * W * k + first[x]);
        }
    }
    for (int j = 0; j < W; j++) {
        if (!U.empty && U.bot[j] == M.top[j]) s.u(W + j, 2 * W + j);
        if (!D.empty && M.bot[j] == D.top[j]) s.u(3 * W + j, 4 * W + j);
    }
    return s.f(2 * W + b) == s.f(3 * W + d);
}

// The tempting wrong answer: only look at rows a..c.
bool connected_band_only(Seg& st, int a, int b, int c, int d) {
    Node M = st.prod(a, c + 1);
    return M.lab[b] == M.lab[W + d];
}

// Baseline: BFS over the whole grid per query, O(N W) each.
bool connected_bfs(const vector<string>& g, int a, int b, int c, int d) {
    int N = g.size(); vector<char> seen((size_t)N * W, 0); vector<int> q; q.reserve(64);
    char ch = g[a][b]; q.push_back(a * W + b); seen[a * W + b] = 1;
    for (size_t h = 0; h < q.size(); h++) {
        int x = q[h] / W, y = q[h] % W;
        if (x == c && y == d) return true;
        const int dx[4] = {1, -1, 0, 0}, dy[4] = {0, 0, 1, -1};
        for (int k = 0; k < 4; k++) {
            int nx = x + dx[k], ny = y + dy[k];
            if (nx < 0 || nx >= N || ny < 0 || ny >= W || seen[nx * W + ny] || g[nx][ny] != ch) continue;
            seen[nx * W + ny] = 1; q.push_back(nx * W + ny);
        }
    }
    return false;
}

int main(int argc, char** argv) {
    string mode = argc > 1 ? argv[1] : "";
    bool band = mode == "--band-only", bfs = mode == "--bfs";
    ios::sync_with_stdio(false); cin.tie(nullptr);
    int N, Q; cin >> N >> W >> Q;
    vector<string> rows(N); for (auto& r : rows) cin >> r;
    Seg st(rows);
    string out;
    while (Q--) {
        int t; cin >> t;
        if (t == 1) { int i; string s; cin >> i >> s; if (bfs) rows[i - 1] = s; else st.set(i - 1, s); }
        else {
            int a, b, c, d; cin >> a >> b >> c >> d; a--; b--; c--; d--;
            if (a > c) { swap(a, c); swap(b, d); }
            bool ok = bfs ? connected_bfs(rows, a, b, c, d)
                    : band ? connected_band_only(st, a, b, c, d) : connected(st, N, a, b, c, d);
            out += ok ? "Yes\n" : "No\n";
        }
    }
    cout << out;
}
