"""Error-correcting memory, from one parity bit to the 72-bit words in a server DIMM.

Presets:
  parity        one parity bit: catches any odd number of flips, misses every even number
  hamming7      Hamming(7,4): the syndrome is the binary address of the flipped bit
  flip 5 40 61  flip those bits of a 72-bit SECDED word and watch the decoder's verdict
  --exhaust     every 1, 2, 3 and 4-bit error pattern of a 72-bit word, for two real codes
  --storm 4     random 4-bit errors, 20,000 trials per code

Two (72,64) SECDED codes are built here:
  hamming  textbook extended Hamming: check bits at positions 1, 2, 4 ... 64, plus one overall parity bit
  hsiao    Hsiao's 1970 odd-weight-column code (every check pattern has an odd number of 1s)
"""
import random, sys
from itertools import combinations

# ---------- the smallest codes ----------
def parity_demo():
    word = [1, 0, 1, 1, 0, 0, 1, 0]
    p = sum(word) % 2
    print(f"data {''.join(map(str, word))}  parity bit {p}  (makes the count of 1s even)")
    for flips in ([2], [2, 5], [0, 2, 5], [0, 1, 2, 5]):
        w = word[:]
        for i in flips: w[i] ^= 1
        ok = (sum(w) + p) % 2 == 0
        print(f"  flip {len(flips)} bit(s) at {flips}: {''.join(map(str, w))}  -> {'looks fine  -X-' if ok else 'error detected'}")

def hamming7_demo():
    data = [1, 0, 1, 1]
    c = [0] * 8                      # positions 1..7; 1,2,4 are check bits
    for pos, b in zip((3, 5, 6, 7), data): c[pos] = b
    for p in (1, 2, 4):
        c[p] = sum(c[i] for i in range(1, 8) if i & p and i != p) % 2
    word = c[1:]
    print(f"data 1011 -> codeword {''.join(map(str, word))}  (positions 1..7, checks at 1, 2, 4)")
    for bad in range(1, 8):
        r = c[:]; r[bad] ^= 1
        s = 0
        for i in range(1, 8):
            if r[i]: s ^= i
        print(f"  flip position {bad} ({bad:03b}) -> syndrome {s:03b} = {s}  {'points straight at it' if s == bad else 'WRONG'}")
    r = c[:]; r[2] ^= 1; r[6] ^= 1
    s = 0
    for i in range(1, 8):
        if r[i]: s ^= i
    print(f"  flip positions 2 and 6 -> syndrome {s:03b} = {s}: blames position {s}, now 3 bits are wrong  -X-")

# ---------- (72,64) SECDED codes as 72 syndrome columns ----------
# A code is a list of 72 nonzero 8-bit columns. Syndrome of an error = XOR of the columns of the flipped bits.
def hamming_cols():
    # bit 0: overall parity (column 0b1000_0000 plus nothing else is fine: it only sets the parity flag)
    # bits 1..71: Hamming position i -> low 7 bits = i, top bit = 1 (every bit is in the overall parity)
    return [0x80] + [0x80 | i for i in range(1, 72)]

def hsiao_cols():
    w = lambda x: bin(x).count("1")
    ones = [1 << k for k in range(8)]
    threes = [x for x in range(256) if w(x) == 3]           # all 56
    fives = [x for x in range(256) if w(x) == 5][:8]        # 8 of the 56 weight-5 columns
    return ones + threes + fives

def decode_hamming(s):
    """Return (verdict, bit it flips or None). Syndrome: top bit = overall parity, low 7 = Hamming syndrome."""
    par, h = s >> 7, s & 0x7F
    if s == 0: return "clean", None
    if par == 0: return "detected", None                     # even number of flips, nonzero syndrome
    if h == 0: return "corrected", 0                         # blame the overall parity bit
    if h <= 71: return "corrected", h
    return "detected", None                                  # points past the end of the word

def make_hsiao_decoder(cols):
    where = {c: i for i, c in enumerate(cols)}
    def decode(s):
        if s == 0: return "clean", None
        if bin(s).count("1") % 2 == 0: return "detected", None
        if s in where: return "corrected", where[s]
        return "detected", None
    return decode

CODES = {
    "hamming": (hamming_cols(), decode_hamming),
    "hsiao": (hsiao_cols(), make_hsiao_decoder(hsiao_cols())),
}
for name, (cols, _) in CODES.items():
    assert len(cols) == 72 and len(set(cols)) == 72 and 0 not in cols, name

def outcome(code, flips):
    cols, decode = CODES[code]
    s = 0
    for b in flips: s ^= cols[b]
    verdict, fix = decode(s)
    wrong = set(flips)
    if fix is not None: wrong ^= {fix}
    if verdict == "clean": return "silent" if wrong else "clean", wrong
    if verdict == "detected": return "detected", wrong
    return ("corrected" if not wrong else "miscorrected"), wrong

def exhaust():
    print("every k-bit error pattern in a 72-bit word (64 data + 8 check bits)\n")
    print(f"{'code':<8}{'k':>2}{'patterns':>11}{'corrected':>11}{'detected':>10}{'MISCORRECTED':>14}{'silent':>8}")
    for code in CODES:
        for k in (1, 2, 3, 4):
            tally = {"corrected": 0, "detected": 0, "miscorrected": 0, "silent": 0}
            n = 0
            for flips in combinations(range(72), k):
                tally[outcome(code, flips)[0]] += 1; n += 1
            print(f"{code:<8}{k:>2}{n:>11,}{tally['corrected']:>11,}{tally['detected']:>10,}"
                  f"{tally['miscorrected']:>14,}{tally['silent']:>8,}"
                  + (f"   ({100 * tally['miscorrected'] / n:.1f}% made worse)" if tally['miscorrected'] else ""))
        print()
    print("corrected = data right again; detected = machine-check, nothing silently wrong;")
    print("MISCORRECTED = decoder says 'fixed' and flips a good bit; silent = decoder says 'clean'")

def storm(k, trials=20000, seed=1):
    rng = random.Random(seed)
    print(f"{trials:,} random {k}-bit errors per code\n")
    for code in CODES:
        tally = {"clean": 0, "corrected": 0, "detected": 0, "miscorrected": 0, "silent": 0}
        for _ in range(trials):
            tally[outcome(code, rng.sample(range(72), k))[0]] += 1
        print(f"  {code:<8} " + "  ".join(f"{v}: {tally[v]:,}" for v in ("corrected", "detected", "miscorrected", "silent")))

def flip(bits, code="hamming"):
    v, wrong = outcome(code, bits)
    cols, decode = CODES[code]
    s = 0
    for b in bits: s ^= cols[b]
    _, fix = decode(s)
    print(f"{code} SECDED, flipped bits {bits}, syndrome {s:08b}")
    msg = {
        "clean": "decoder: clean. Data is right.",
        "corrected": f"decoder: corrected bit {fix}. Data is right again.",
        "detected": "decoder: uncorrectable, raise a machine-check. Nothing is silently wrong.",
        "miscorrected": f"decoder: corrected bit {fix}.  -X- It was fine. Now {len(wrong)} bits are wrong: {sorted(wrong)}",
        "silent": f"decoder: clean.  -X- {len(wrong)} bits are wrong and nobody knows.",
    }[v]
    print(msg)

if __name__ == "__main__":
    a = sys.argv[1:] or ["parity"]
    if a[0] == "parity": parity_demo()
    elif a[0] == "hamming7": hamming7_demo()
    elif a[0] == "--exhaust": exhaust()
    elif a[0] == "--storm": storm(int(a[1]) if len(a) > 1 else 4)
    elif a[0] == "flip":
        code = "hamming"
        nums = [x for x in a[1:] if x.isdigit()]
        if "--hsiao" in a: code = "hsiao"
        flip([int(x) % 72 for x in nums] or [5], code)
    else: print(__doc__)
