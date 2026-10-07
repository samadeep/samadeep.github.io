"""Final training loss after 150 updates, per method and population (about half an hour on a laptop).

Each population gets its own learning rate: every rate is scored by its mean over seeds 0, 1 and 2, and
the grid keeps widening until the best rate sits strictly inside it. Each population's grid starts
around the previous population's best. ES gets the same forward passes as
Dust (3 per draw, one per layer). Usage: python ladder.py [backprop|dust|es ...]
"""
import re, subprocess, sys

START = {"dust": [0.25, 0.5, 1.0], "es": [0.01, 0.03, 0.1], "backprop": [1.0, 2.0, 4.0]}
STEP = {"dust": 2.0, "es": 3.0, "backprop": 2.0}      # how far to widen the grid each time
POPS = {"dust": [4, 16, 64, 256], "es": [4, 16, 64, 256], "backprop": [0]}

def loss(method, pop, lr, seed):
    out = subprocess.run([sys.executable, "dust.py", "--train", method, "--pop", str(pop), "--lr", f"{lr:g}",
                          "--seed", str(seed)], capture_output=True, text=True).stdout
    v = float(re.findall(r"step  150  loss (\S+)", out)[0])
    return v if v == v else float("inf")  # nan counts as diverged

for method in sys.argv[1:] or ["backprop", "dust", "es"]:
    start = START[method]
    for pop in POPS[method]:
        runs = {}
        def score(lr):
            runs[lr] = [loss(method, pop, lr, seed) for seed in (0, 1, 2)]
            return sum(runs[lr]) / 3
        tries = {lr: score(lr) for lr in start}
        while True:
            grid = sorted(tries); best = min(tries, key=tries.get)
            if best == grid[0]: lr = grid[0] / STEP[method]
            elif best == grid[-1]: lr = grid[-1] * STEP[method]
            else: break
            tries[lr] = score(lr)
        start = [best / STEP[method], best, best * STEP[method]]  # next population starts around this best
        grid = " ".join(f"{k:g}" for k in sorted(tries))
        print(f"{method:8} pop {pop:>4}  lr {best:<6g} loss {tries[best]:.3f}  seeds "
              f"{' '.join(f'{r:.3f}' for r in runs[best])}  (grid {grid})", flush=True)
