# Every number in "Before the Transformer" that is computed rather than quoted, recomputed here.
# Inputs come from the papers (table or section in the comments). Run with one flag, or none for all.
#   --bengio   where Bengio et al. (2003) spend their FLOPs
#   --lstm     Sutskever et al. (2014): 384M parameters, rebuilt from the config
#   --vanish   how much gradient survives k steps back (Pascanu et al. 2013 bounds)
#   --bpe      the BPE paper's own toy example (Sennrich et al. 2016, Algorithm 1)
#   --kn       Kneser-Ney on a three-sentence corpus
#   --cache    Bahdanau's precomputed U_a h_j: the first key cache
import re, sys, collections, math

def bengio():
    # Brown MLP10, paper Table 1: n=5 (4 context words), h=100, m=30, |V|=16,383, no direct connections
    V, n, h, m = 16_383, 5, 100, 30
    C = V * m
    H = h * (n - 1) * m + h
    U = V * h + V
    print(f"Bengio 2003, Brown corpus config: |V|={V:,} n={n} h={h} m={m}")
    print(f"  embedding table C   {C:>12,}")
    print(f"  hidden layer H, d   {H:>12,}")
    print(f"  output layer U, b   {U:>12,}")
    print(f"  total               {C + H + U:>12,}  (~{(C + H + U) / 1e6:.2f}M)")
    hid, out = h * (n - 1) * m, V * h
    print(f"  per word: hidden {hid:,} MACs, output {out:,} MACs -> output = {100 * out / (hid + out):.1f}% of the arithmetic")

def lstm():
    # Sutskever et al. 2014, section 3.4: 4 layers x 1000 cells, 1000-d embeddings, 160k in, 80k out
    n = d = 1000
    layer = 4 * (n * d + n * n + n)
    parts = {
        "source embeddings 160,000 x 1000": 160_000 * d,
        "target embeddings  80,000 x 1000": 80_000 * d,
        "encoder LSTM, 4 layers": 4 * layer,
        "decoder LSTM, 4 layers": 4 * layer,
        "softmax 80,000 x 1000 + bias": 80_000 * n + 80_000,
    }
    print("Sutskever et al. 2014, rebuilt from the config")
    for k, v in parts.items():
        print(f"  {k:<34}{v / 1e6:>8.1f}M")
    total = sum(parts.values())
    vocab = parts["source embeddings 160,000 x 1000"] + parts["target embeddings  80,000 x 1000"] + parts["softmax 80,000 x 1000 + bias"]
    print(f"  {'total':<34}{total / 1e6:>8.1f}M   (paper: 384M, 64M recurrent)")
    print(f"  vocabulary-sized tables: {100 * vocab / total:.0f}% of all parameters")
    print(f"  per generated token: LSTM layers {4 * 4 * n * (n + d) / 1e6:.0f}M MACs, softmax {80_000 * n / 1e6:.0f}M MACs")

def vanish():
    print("signal left after k steps back = eta^k   (Pascanu et al. 2013: eta <= ||W|| x gamma)")
    for label, eta in [("tanh,    ||W||=0.95", 0.95), ("tanh,    ||W||=0.9 ", 0.9), ("sigmoid, ||W||=1   ", 0.25), ("sigmoid, ||W||=2   ", 0.5), ("tanh,    ||W||=1.1 ", 1.1), ("LSTM, forget f=0.99", 0.99)]:
        row = "  ".join(f"k={k}: {eta ** k:.2e}" for k in (10, 50, 100))
        print(f"  {label}  {row}")
    print(f"  steps until a tanh RNN with eta=0.95 drops below 1e-3: {math.ceil(math.log(1e-3) / math.log(0.95))}")
    print("  attention: one hop to any token, so the path factor is applied once, whatever the distance")

def bpe():
    # Sennrich et al. 2016, Algorithm 1, verbatim apart from printing
    def get_stats(vocab):
        pairs = collections.defaultdict(int)
        for word, freq in vocab.items():
            sy = word.split()
            for i in range(len(sy) - 1):
                pairs[sy[i], sy[i + 1]] += freq
        return pairs
    def merge_vocab(pair, v_in):
        bigram = re.escape(" ".join(pair))
        p = re.compile(r"(?<!\S)" + bigram + r"(?!\S)")
        return {p.sub("".join(pair), w): f for w, f in v_in.items()}
    vocab = {"l o w </w>": 5, "l o w e r </w>": 2, "n e w e s t </w>": 6, "w i d e s t </w>": 3}
    print("BPE on the paper's toy dictionary: low x5, lower x2, newest x6, widest x3")
    for i in range(10):
        pairs = get_stats(vocab)
        best = max(pairs, key=pairs.get)
        print(f"  merge {i + 1:>2}: {best[0]} + {best[1]}  (count {pairs[best]})")
        vocab = merge_vocab(best, vocab)
    print(f"  final: {vocab}")

def kn():
    corpus = "the cat sat . the dog sat . the cat ran .".split()
    bigrams = list(zip(corpus, corpus[1:]))
    types = set(bigrams)
    D = 0.75
    def p_kn(w, v):
        c_v = sum(1 for a, _ in bigrams if a == v)
        c_vw = sum(1 for b in bigrams if b == (v, w))
        followers = len({b for a, b in types if a == v})
        cont = len({a for a, b in types if b == w}) / len(types)
        return max(c_vw - D, 0) / c_v + (D * followers / c_v) * cont
    print(f"Kneser-Ney, D={D}, corpus: {' '.join(corpus)}")
    print(f"  distinct bigram types: {len(types)}")
    for w in ("ran", "sat"):
        print(f"  P(dog -> {w}) = {p_kn(w, 'dog'):.5f}")
    print(f"  sum over vocabulary for 'dog': {sum(p_kn(w, 'dog') for w in set(corpus)):.5f}")

def cache():
    # Bahdanau et al. 2014, Appendix A.1.2: n = n' = 1000, U_a is n' x 2n
    proj = 1000 * 2000
    Tx = Ty = 30
    print("Bahdanau attention, 30-word sentence into 30 words")
    print(f"  recompute U_a h_j every step: {Tx * Ty * proj / 1e9:.2f} G MACs")
    print(f"  compute once and keep it:     {Tx * proj / 1e6:.0f} M MACs   ({Ty}x less)")

ALL = {"--bengio": bengio, "--lstm": lstm, "--vanish": vanish, "--bpe": bpe, "--kn": kn, "--cache": cache}
picked = [a for a in sys.argv[1:] if a in ALL] or list(ALL)
for i, flag in enumerate(picked):
    if i: print()
    ALL[flag]()
