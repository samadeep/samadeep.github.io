"""Dust in ~150 lines: train a tiny next-character model with no backward pass.

The idea, from Q Labs' "Dust: Pretraining Transformers Without Backpropagation" (Oct 2026):
  1. add Gaussian noise to a layer's OUTPUT, independently at every token
  2. reward each token's noise by how much the loss at that token went down
  3. averaged over K draws, the reward-weighted noise estimates the error at the layer's output
  4. outer product with the layer's input = the weight gradient (the same product backprop forms)

The model: context of 3 characters -> embedding -> tanh MLP -> next character.
The text: the Zen of Python (it ships with Python, so this runs anywhere).

  python dust.py                      cosine to the backprop gradient as the population grows
  python dust.py --train dust --pop 64
  python dust.py --train es --pop 64  weight-space ES with the same number of forward passes
  python dust.py --train backprop
"""
import argparse, codecs, contextlib, io
import numpy as np
with contextlib.redirect_stdout(io.StringIO()): import this  # importing it prints the poem

p = argparse.ArgumentParser()
p.add_argument("--train", choices=["dust", "es", "backprop"], help="train with this method (default: cosine ladder)")
p.add_argument("--pop", type=int, default=64, help="draws per layer per update")
p.add_argument("--steps", type=int, default=150)
p.add_argument("--sigma", type=float, default=0.05, help="noise scale")
p.add_argument("--lr", type=float, help="learning rate (default: the tuned value for the method)")
p.add_argument("--seed", type=int, default=0)
a = p.parse_args()
rng = np.random.default_rng(a.seed)

# ---- data: every 3-character window of the Zen of Python predicts the next character
text = codecs.decode(this.s, "rot13").lower()
chars = sorted(set(text)); V = len(chars); idx = {c: i for i, c in enumerate(chars)}
ids = np.array([idx[c] for c in text])
X = np.stack([ids[i:len(ids) - 3 + i] for i in range(3)], 1)  # (T, 3) contexts
Y = ids[3:]                                                    # (T,)   next characters
T, C, D, H = len(Y), 3, 16, 64

# ---- model: three linear layers (the embedding is a linear layer with a one-hot input)
P = {"emb": rng.normal(0, 0.5, (V, D)),
     "W1": rng.normal(0, 1 / np.sqrt(C * D), (C * D, H)), "b1": np.zeros(H),
     "W2": rng.normal(0, 1 / np.sqrt(H), (H, V)), "b2": np.zeros(V)}
P = {k: v.astype(np.float32) for k, v in P.items()}

def token_loss(logits):  # cross-entropy at every token, logits (..., T, V) -> (..., T)
    m = logits.max(-1, keepdims=True)
    lse = np.log(np.exp(logits - m).sum(-1)) + m[..., 0]
    return lse - np.take_along_axis(logits, np.broadcast_to(Y[:, None], logits.shape[:-1] + (1,)), -1)[..., 0]

def forward(P, noise={}):
    """Clean forward if noise is empty; noise[layer] has shape (K, T, out) and is added to that layer's output."""
    e = P["emb"][X] + noise.get("emb", 0)                     # (T, C, D), or (K, T, C, D) with noise
    e = e.reshape(*e.shape[:-2], C * D)
    z1 = e @ P["W1"] + P["b1"] + noise.get("W1", 0)
    h = np.tanh(z1)
    logits = h @ P["W2"] + P["b2"] + noise.get("W2", 0)
    return e, h, logits

def backprop(P):
    e, h, logits = forward(P)
    pr = np.exp(logits - logits.max(1, keepdims=True)); pr /= pr.sum(1, keepdims=True)
    g2 = pr; g2[np.arange(T), Y] -= 1; g2 /= T                 # error at the logits
    g1 = (g2 @ P["W2"].T) * (1 - h ** 2)                       # error at z1 (chain rule)
    ge = (g1 @ P["W1"].T).reshape(T, C, D)                     # error at the embedding output
    G = {"W2": h.T @ g2, "b2": g2.sum(0), "W1": e.T @ g1, "b1": g1.sum(0), "emb": np.zeros_like(P["emb"])}
    np.add.at(G["emb"], X, ge)                                 # one-hot input: scatter-add into rows
    return G

def dust(P, K, sigma):
    """Dust's estimate. Each layer gets its own K draws (separate passes, as in the paper)."""
    e, h, logits = forward(P)
    clean = token_loss(logits) / T
    shapes = {"emb": (K, T, C, D), "W1": (K, T, H), "W2": (K, T, V)}
    G = {}
    for layer, shape in shapes.items():
        a_ = rng.standard_normal(shape, dtype=np.float32)
        l = token_loss(forward(P, {layer: sigma * a_})[2]) / T  # (K, T): every token is a population member
        c = (l.mean(0) if K > 1 else clean) - l                 # loss reduction per token, centered across draws
        c = c.reshape(c.shape + (1,) * (a_.ndim - 2))
        g = -(c * a_).mean(0) / sigma                           # estimated error at the layer output
        if layer == "emb": G["emb"] = np.zeros_like(P["emb"]); np.add.at(G["emb"], X, g)
        if layer == "W1": G["W1"], G["b1"] = e.T @ g, g.sum(0)
        if layer == "W2": G["W2"], G["b2"] = h.T @ g, g.sum(0)
    return G, 3 * K                                             # forward passes used

def es(P, passes, sigma, chunk=64):
    """Weight-space ES: each population member is a whole perturbed copy of the weights,
    scored by ONE number, its mean loss. Members run in batches of `chunk` (same math, faster)."""
    eps, L = {k: [] for k in P}, []
    for start in range(0, passes, chunk):
        m = min(chunk, passes - start)
        ep = {k: rng.standard_normal((m,) + v.shape, dtype=np.float32) for k, v in P.items()}
        Q = {k: P[k] + sigma * ep[k] for k in P}                            # m perturbed models
        e = Q["emb"][np.arange(m)[:, None, None], X].reshape(m, T, C * D)
        h = np.tanh(e @ Q["W1"] + Q["b1"][:, None])
        L.append(token_loss(h @ Q["W2"] + Q["b2"][:, None]).mean(1))      # one scalar per member
        for k in P: eps[k].append(ep[k])
    L = np.concatenate(L); L -= L.mean()
    return {k: np.tensordot(L, np.concatenate(eps[k]), 1) / (passes * sigma) for k in P}

def cos(A, B):
    a_ = np.concatenate([A[k].ravel() for k in P]); b_ = np.concatenate([B[k].ravel() for k in P])
    return a_ @ b_ / np.linalg.norm(a_) / np.linalg.norm(b_)

print(f"text: {T} next-character predictions, vocab {V}, model {sum(v.size for v in P.values()):,} parameters\n")

if not a.train:
    ref = backprop(P)
    print(f"{'draws K':>8} {'passes':>7} {'Dust cos':>9} {'ES cos':>8}   (cosine to the backprop gradient)")
    Ks, cs = [1, 4, 16, 64, 256], []
    for K in Ks:
        gd, passes = dust(P, K, a.sigma)
        cs.append(cos(gd, ref))
        print(f"{K:>8} {passes:>7} {cs[-1]:>9.3f} {cos(es(P, passes, a.sigma), ref):>8.3f}")
    # the paper's law, cos(K) = c_max / sqrt(1 + c / K): grid over c, least squares for c_max
    K_, y_ = np.array(Ks), np.array(cs)
    fits = [((f @ y_) / (f @ f), c) for c in np.geomspace(0.5, 500, 400) for f in [1 / np.sqrt(1 + c / K_)]]
    m, c = min(fits, key=lambda mc: ((mc[0] / np.sqrt(1 + mc[1] / K_) - y_) ** 2).sum())
    m = min(m, 1.0)  # a cosine can't exceed 1
    print(f"\nfit: cos(K) = {m:.2f} / sqrt(1 + {c:.1f} / K)   half-way point (cos = c_max / sqrt 2) at K = {c:.1f}")
else:
    lr = a.lr or {"backprop": 2.0, "dust": 1.0, "es": 0.1}[a.train]  # each tuned on a small grid
    mom = {k: np.zeros_like(v) for k, v in P.items()}
    for step in range(a.steps + 1):
        if step % (a.steps // 5) == 0:
            print(f"step {step:>4}  loss {token_loss(forward(P)[2]).mean():.3f}")
        if a.train == "backprop": G = backprop(P)
        elif a.train == "dust": G, _ = dust(P, a.pop, a.sigma)
        else: G = es(P, 3 * a.pop, a.sigma)
        for k in P:
            mom[k] = 0.9 * mom[k] + G[k]; P[k] -= lr * mom[k]
    from collections import Counter
    ctx, pair = Counter(map(tuple, X)), Counter(zip(map(tuple, X), Y))
    floor = -sum(n * np.log(n / ctx[x]) for (x, _), n in pair.items()) / T
    print(f"\nfloor {floor:.3f} (the text's own uncertainty given 3 characters), uniform guessing {np.log(V):.3f}")
