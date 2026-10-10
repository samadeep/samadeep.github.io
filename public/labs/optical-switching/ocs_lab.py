"""How fast must an optical circuit switch be? Arithmetic you can check (standard library only).

  python ocs_lab.py                 the bandwidth ladder from a GPU's memory down to the network
  python ocs_lab.py --alltoall      all-to-all over circuits: how much of the time is the light dark?
  python ocs_lab.py --ring          ring all-reduce: why slow mirrors were good enough for Google
  python ocs_lab.py --dipole        what "10,000 GPUs behave like 12,500" asks of the network
  python ocs_lab.py --alltoall --relock 0.000002   the receiver needs 2 us to re-lock after each switch

Model, stated plainly: one optical port per GPU, so a GPU talks to exactly one peer per circuit.
All-to-all among N GPUs then takes N-1 rounds, and every round needs the switch to move.
"""
import argparse

p = argparse.ArgumentParser()
p.add_argument("--alltoall", action="store_true")
p.add_argument("--ring", action="store_true")
p.add_argument("--dipole", action="store_true")
p.add_argument("--gpus", type=int, default=64, help="GPUs in the group (default 64)")
p.add_argument("--link", type=float, default=400, help="port speed in Gb/s (default 400)")
p.add_argument("--relock", type=float, default=0.0, help="seconds for the receiver to lock after a switch")
a = p.parse_args()

GB = 1e9
B = a.link * 1e9 / 8                       # bytes per second, one direction
N = a.gpus

SWITCHES = [                               # seconds; where each number comes from is in the post
    ("MEMS, commercial (10 ms)", 10e-3),
    ("all-optical module (300 us)", 300e-6),
    ("Dipole's target (1 us)", 1e-6),
]

def t(sec):                                # human time
    for unit, f in (("s", 1), ("ms", 1e-3), ("us", 1e-6), ("ns", 1e-9)):
        if sec >= f: return f"{sec / f:,.3g} {unit}"
    return f"{sec / 1e-9:.2g} ns"

def size(b):
    for unit, f in (("GB", 1e9), ("MB", 1e6), ("KB", 1e3)):
        if b >= f: return f"{b / f:,.3g} {unit}"
    return f"{b:.0f} B"

if a.alltoall:
    print(f"all-to-all among {N} GPUs, one {a.link:g} Gb/s port each: {N - 1} rounds, the switch moves before each")
    if a.relock: print(f"receiver re-lock after every switch: {t(a.relock)}")
    print()
    msgs = [64e3, 1e6, 16e6, 256e6]
    print(f"{'per-pair message':>28}" + "".join(f"{size(m):>10}" for m in msgs))
    print(f"{'(light on, per round)':>28}" + "".join(f"{t(m / B):>10}" for m in msgs))
    for name, sw in SWITCHES:
        dark = sw + a.relock
        row = "".join(f"{100 * (m / B) / (m / B + dark):>9.1f}%" for m in msgs)
        print(f"{name:>28}{row}")
    print()
    print("half the time dark when one round's message takes as long as the switch:")
    for name, sw in SWITCHES:
        print(f"  {name:<28} break-even message {size(B * (sw + a.relock)):>9}   (all-to-all spends {t((N - 1) * (sw + a.relock))} switching)")

elif a.ring:
    S = 2 * GB                             # gradients of a 1B-parameter model in bf16
    step = 2 * (N - 1) / N * S / B         # ring all-reduce: 2(N-1) steps of S/N bytes, same neighbour every step
    print(f"ring all-reduce of {size(S)} over {N} GPUs at {a.link:g} Gb/s: {t(step)} of light per step")
    print("every GPU talks to the same neighbour for the whole job, so the ring needs one set of circuits\n")
    for name, sw in SWITCHES:
        per_step = step / (step + sw)
        per_job = 10_000 * step / (10_000 * step + sw)
        print(f"  {name:<28} rewire every step: {100 * per_step:5.1f}% lit    rewire once per 10,000-step job: {100 * per_job:.4f}% lit")

elif a.dipole:
    gpus, busy, claim = 10_000, 0.5, 12_500
    useful = gpus * busy
    need = claim * busy / gpus
    print(f"{gpus:,} GPUs busy {busy:.0%} of the time do {useful:,.0f} GPUs' worth of work")
    print(f"to match {claim:,} GPUs at {busy:.0%} they must be busy {need:.1%} of the time  (+{claim / gpus - 1:.0%} useful compute)")
    c = 1.0                                # compute per step, fixed
    old, new = c / busy, c / need
    print(f"per training step: compute {c:.1f}, waiting {old - c:.1f} -> {new - c:.1f}  (step {old:.2f} -> {new:.2f}, the network must hide {1 - (new - c) / (old - c):.0%} of the waiting)")

else:
    print("bandwidth one H100 GPU sees at each layer (per direction):\n")
    ladder = [("HBM3 memory", 3350 * GB / 1, "on the package"),
              ("NVLink", 450 * GB, "to GPUs in the same server"),
              (f"network port", B, f"{a.link:g} Gb/s, to every other server")]
    top = ladder[0][1]
    for name, bw, where in ladder:
        bar = "#" * max(1, round(40 * bw / top))
        print(f"  {name:<14} {bw / GB:>7,.0f} GB/s  {bar:<40} {(f'{top / bw:.0f}x slower' if bw < top else 'baseline'):>11}   {where}")
    print("\nthe last rung is where the switches live, and where a GPU waits")
