"""Two numerical bugs in softmax / cross-entropy (Barron, Gnanapragasam, Tschannen, arXiv 2610.31642).

  python softmax_lab.py               the [9, -9, -9] example: loss 0.0, gradients that don't sum to 0
  python softmax_lab.py --cliff       where each float format drops e^-m, measured vs (p+1) ln 2
  python softmax_lab.py --train       a tiny fp32 classifier under Adam: standard vs fixed cross-entropy
  python softmax_lab.py --distill     student == teacher, the gradient should be exactly 0

Pure numpy. bf16 is emulated by rounding float32 to 8 significant bits (round to nearest even).
"""
import sys
import numpy as np

def bf16(x):
    """Round float32 values to bfloat16 precision (keep the top 16 bits, nearest even)."""
    a = np.asarray(x, np.float32).copy()
    b = a.view(np.uint32)
    b += np.uint32(0x7FFF) + ((b >> np.uint32(16)) & np.uint32(1))
    b &= np.uint32(0xFFFF0000)
    return a

DTYPES = {"bf16": (np.float32, bf16, 7), "fp32": (np.float32, lambda x: np.asarray(x, np.float32), 23),
          "fp64": (np.float64, lambda x: np.asarray(x, np.float64), 52)}

def standard(z, t, r=lambda x: x):
    """What frameworks do: shift by the max, exponentiate, normalise, g = q - onehot."""
    zt = r(z - z.max(-1, keepdims=True))
    e = r(np.exp(zt))
    s = r(e.sum(-1, keepdims=True))          # 1 + e^-m, formed by adding to 1.0
    q = r(e / s)
    loss = -r(zt - r(np.log(s)))[np.arange(len(t)), t]
    g = q.copy(); g[np.arange(len(t)), t] = r(g[np.arange(len(t)), t] - 1)
    return loss, g

def fixed(z, t, r=lambda x: x):
    """The paper's fix: leave the target out of the sum, never add 1 to e^-m."""
    n = np.arange(len(t))
    d = r(z - z[n, t][:, None]); d[n, t] = -np.inf               # z_j - z_t, target excluded
    dm = d.max(-1, keepdims=True)
    lse = r(dm[:, 0] + r(np.log(r(np.exp(r(d - dm)).sum(-1)))))   # logsumexp_{j != t}(z_j - z_t) = -m
    loss = r(np.logaddexp(0, lse))                                 # softplus(-m) = log(1 + e^-m)
    g = r(np.exp(r(d - loss[:, None])))                            # q_j = e^(z_j - z_t - L), j != t
    g[n, t] = 0
    g[n, t] = -g.sum(-1)                                           # the target gets minus the rest
    return loss, g

def example():
    z = np.array([[9.0, -9.0, -9.0]], np.float32); t = np.array([0])
    np.set_printoptions(precision=4)
    for name, f in [("standard", standard), ("fixed   ", fixed)]:
        loss, g = f(z, t, lambda x: np.asarray(x, np.float32))
        print(f"{name}  loss {loss[0]:.4e}   grad {g[0]}   sum {g.sum():+.3e}")
    print("\ntrue (fp64): loss 3.0460e-08, grad [-3.0460e-08  1.5230e-08  1.5230e-08], sum 0")

def cliff():
    print("format  bits p   measured cliff   (p+1)*ln2   q_t at the cliff")
    for name, (dt, r, p) in DTYPES.items():
        found = None
        for m in np.arange(0, 45, 0.01):
            z = np.array([[m, 0.0]], dt); t = np.array([0])
            _, g = standard(z, t, r)
            if g[0, 0] == 0:
                found = m; break
        print(f"{name:6}  {p:6d}   {found:14.2f}   {(p + 1) * np.log(2):9.2f}   1 - {np.exp(-found):.1e}")

def train(steps=8000, eps=1e-8, wd=0.1, lr=1e-2, seed=0):
    """Linear softmax classifier on separable data, full batch AdamW, everything in fp32."""
    rng = np.random.default_rng(seed)
    n, d, k = 32, 64, 8
    X = rng.standard_normal((n, d)).astype(np.float32)
    t = rng.integers(0, k, n)
    W0 = (rng.standard_normal((d, k)) * 0.1).astype(np.float32)
    f32 = lambda x: np.asarray(x, np.float32)
    print(f"32 examples, 64 features, 8 classes, AdamW lr={lr} wd={wd} eps={eps:g}, fp32")
    print("step   | standard: margin  loss       |grad|     | fixed: margin  loss       |grad|")
    res = {}
    for name, f in [("standard", standard), ("fixed", fixed)]:
        W = W0.copy(); m1 = np.zeros_like(W); v = np.zeros_like(W); log = []
        for s in range(1, steps + 1):
            z = f32(X @ W)
            loss, g = f(z, t, f32)
            gW = f32(X.T @ g / n)
            m1 = f32(0.9 * m1 + 0.1 * gW); v = f32(0.98 * v + 0.02 * gW * gW)
            mh = m1 / (1 - 0.9 ** s); vh = v / (1 - 0.98 ** s)
            W = f32(W - lr * (mh / (np.sqrt(vh) + eps) + wd * W))
            zz = z.astype(np.float64); zt = zz[np.arange(n), t]; zz[np.arange(n), t] = -np.inf
            marg = zt - np.log(np.exp(zz - zt[:, None]).sum(-1)) - zt
            log.append((float(np.median(marg)), float(loss.mean()), float(np.abs(gW).max()), float(np.abs(g.sum(-1)).max())))
        res[name] = log
    for s in list(range(0, steps, steps // 16)) + [steps - 1]:
        a, b = res["standard"][s], res["fixed"][s]
        print(f"{s + 1:6d} | {a[0]:6.2f}  {a[1]:.3e}  {a[2]:.2e}  | {b[0]:6.2f}  {b[1]:.3e}  {b[2]:.2e}")
    for name in res:
        lg = res[name]
        jumps = sum(1 for i in range(1, len(lg)) if lg[i][1] > 10 * lg[i - 1][1] + 1e-12)
        zero = sum(1 for x in lg if x[1] == 0.0)
        late = [x[1] for x in lg[steps // 2:]]
        print(f"{name:8}: loss exactly 0 on {zero} steps, jumps >10x in one step {jumps}, "
              f"second-half loss min {min(late):.1e} max {max(late):.1e}, final median margin {lg[-1][0]:.2f}")
    print(f"log(1/eps) = {np.log(1 / eps):.2f}, the fp32 cliff is 24*ln2 = {24 * np.log(2):.2f}")

def distill():
    zT = np.array([[2.0, 1.0, 0.0, -1.5, 3.3]], np.float32)
    for name, (dt, r, _) in DTYPES.items():
        z = r(zT.astype(dt))
        p = r(np.exp(r(z - z.max())) / r(np.exp(r(z - z.max())).sum()))          # forward: softmax(zT)
        lq = r(r(z - z.max()) - r(np.log(r(np.exp(r(z - z.max())).sum()))))      # backward: exp(log_softmax(zS))
        q = r(np.exp(lq))
        g = r(q - p)
        print(f"{name}: standard grad at zS == zT  {np.array2string(g[0], precision=2)}   max |g| {np.abs(g).max():.1e}")
    print("fixed: computes q - p from zS - zT = 0 with expm1/log1p, so every entry is exactly 0")

if __name__ == "__main__":
    a = sys.argv[1:]
    if "--cliff" in a: cliff()
    elif "--train" in a: train()
    elif "--distill" in a: distill()
    else: example()
