---
title: 'The Bug in the Last Line of Every Neural Network'
description: 'Softmax cross-entropy rounds the target gradient to exactly 0 once a model is confident: margin 5.55 in bf16, 16.64 in fp32. Why, and the fix.'
hook:
  stat: 'm > 16.64 → g = 0'
  caption: 'past this logit margin, fp32 cross-entropy throws away its own gradient'
date: '2026-10-25'
topic: ai
series: papers-rebuilt
tags: [softmax, cross-entropy, floating-point, adam, grokking, numerical-stability]
---

<aside class="tldr">

**TL;DR** Your model gets very sure it's right. Cross-entropy adds a tiny number to 1.0, float32 shrugs and keeps 1.0, and the gradient that should say "a bit more, please" becomes exactly zero. The other gradients don't get the memo. The fix is to stop adding 1 to tiny numbers, which is advice from a numerics textbook older than most GPUs.

</aside>

Feed three logits into the cross-entropy that ships with JAX and Optax: the right class at `9`, the two wrong ones at `-9`, everything in float32.

```python
z = [9.0, -9.0, -9.0]          # target is class 0
loss  ->  0.0
grad  ->  [0.0, 1.523e-08, 1.523e-08]
```

A loss of zero means "nothing left to learn". But the gradient disagrees with itself. The two wrong classes still get pushed down by `1.5e-8` each, while the right class gets no push at all. A softmax gradient must always sum to zero (probabilities sum to one, so whatever one logit gains, the others lose). This one sums to `+3.05e-8`.

That's not a quirk of one library. In October 2026 Jonathan Barron, Dan Gnanapragasam and Michael Tschannen showed that the standard recipe for softmax, log-softmax and cross-entropy, the one in every framework and textbook, has two numerical bugs[^paper]. Softmax plus cross-entropy is the last line of nearly every classifier and language model. So let's see exactly where it breaks.

<details>
<summary>Before you start: what this post leans on</summary>

| You need | In one line | Best short introduction |
|---|---|---|
| Softmax and cross-entropy | turn scores into probabilities, then score the right answer | [Karpathy, The Unreasonable Effectiveness of RNNs](https://karpathy.github.io/2015/05/21/rnn-effectiveness/) (the `hello` example) |
| Floating point | numbers are stored on a grid that gets coarser as they grow | [Goldberg, What Every Computer Scientist Should Know About Floating-Point Arithmetic](https://docs.oracle.com/cd/E19957-01/816-2464/ncg_goldberg.html) |
| Adam | each weight's step is its gradient divided by a running size of that gradient | [Kingma and Ba, Adam](https://arxiv.org/abs/1412.6980) |

| Symbol | Meaning |
|---|---|
| $$z_k$$, $$t$$ | logit of class $$k$$, and the target class |
| $$q_k = e^{z_k} / \sum_j e^{z_j}$$ | softmax probability |
| $$m = z_t - \log\sum_{j\ne t} e^{z_j}$$ | the **margin**: how far the right logit sits above all the others combined |
| $$g_k = q_k - p_k$$ | gradient of cross-entropy with respect to $$z_k$$ ($$p$$ is the target distribution) |
| $$b$$ | fraction bits of a float format: 7 for bf16, 23 for fp32, 52 for fp64 |

</details>

## Where the push goes missing

Every framework first subtracts the biggest logit, so $$e^{z}$$ never overflows. When the right class is the biggest, its shifted logit is exactly 0 and its exponential is exactly 1. All the wrong classes together add up to $$e^{-m}$$, a small positive number. So the denominator is

$$
1 + e^{-m}
$$

and that sum is the whole bug. Floats near 0 are incredibly fine (fp32 goes down to about $$10^{-38}$$), but floats near 1.0 sit on a grid with steps of $$2^{-23} \approx 1.2\times10^{-7}$$. Add something smaller than half a step and it rounds away.

```fig title="Standard cross-entropy adds the gradient's only signal to 1.0, and float32 rounds it off" alt="Two panels for logits 9, -9, -9 in float32 (margin 17.3). Left panel, standard: e to the minus m is 3.05e-8, added to 1.0 gives exactly 1.0, a lost arrow; dividing gives q_t equals 1.0, and g_t equals q_t minus 1 equals 0, marked denied; the wrong classes keep q_j equal to 1.5e-8 so the gradients sum to plus 3.05e-8. Right panel, fixed: e to the minus m is 3.05e-8, fed to softplus with no one-plus anywhere; g_t equals minus e to the minus m over one plus e to the minus m equals minus 3.05e-8, allowed, and the gradients sum to 0."
panel Standard (fp32, z = [9, -9, -9])
row
e: worker "e^-m\n= 3.05e-8"
s: deny "1 + e^-m\n= 1.0 exactly"
g: deny "g_t = 1/1.0 - 1\n= 0"
row
o: worker "q_j, each\n= 1.5e-8"
_
x: deny "sum of g\n= +3.05e-8"
e -> s "add to 1.0" lost
s -> g "divide, subtract 1"
o -> x "kept"
panel Fixed
row
e2: worker "e^-m\n= 3.05e-8"
l: main "softplus(-m)\nno 1 + tiny"
g2: allow "g_t = -e^-m/(1+e^-m)\n= -3.05e-8"
row
o2: worker "q_j\n= 1.5e-8"
_
x2: allow "sum of g\n= 0"
e2 -> l "keep it small"
l -> g2 "stays in numerator"
o2 -> x2 "kept"
```

The target's gradient is $$q_t - 1$$, and $$q_t = 1/(1+e^{-m})$$. Once the sum rounds to 1.0, $$q_t$$ is 1.0 and the gradient is exactly zero. The wrong classes never touch 1.0: their numerators $$e^{z_j - z_t}$$ live down near zero, where floats are precise, so they survive all the way to $$m \approx 88$$. The paper calls this **Softmax Collapse**.

Play with it. Pick a format, press Train, and watch the moment $$e^{-m}$$ crosses the red line.

<div data-lab="cliff"></div>

## The cliff has an exact address

"Half a step of 1.0" is $$2^{-(b+1)}$$, where $$b$$ is the number of fraction bits. So the gradient dies exactly when $$e^{-m} < 2^{-(b+1)}$$, which is

$$
m > (b+1)\ln 2
$$

Running the lab's sweep (standard cross-entropy, two logits, each format) finds the first margin where the target gradient is exactly 0:

```text
format  bits b   measured cliff   (b+1)*ln2   q_t at the cliff
bf16         7             5.55        5.55   1 - 3.9e-03
fp32        23            16.64       16.64   1 - 5.9e-08
fp64        52            36.74       36.74   1 - 1.1e-16
```

The paper reports 5.5, 16.6 and 36.7; the closed form matches to the hundredth. Look at the bf16 row: the gradient vanishes when the model is only **99.6%** confident. That's not an exotic regime.

> **Insight:** never add 1 to a small number and then subtract 1 back out. The small number is the answer, and 1.0 is the worst place on the float line to keep it.

<details>
<summary>The math: why the fixed gradient is exact</summary>

Write the loss for the target class as a function of the differences $$z_j - z_t$$ only:

$$
-m = \log\sum_{j\ne t} e^{z_j - z_t}, \qquad \mathcal L = \log(1 + e^{-m}) = \operatorname{softplus}(-m)
$$

`softplus` is computed stably (it never forms $$1 + e^{-m}$$ when $$e^{-m}$$ is tiny; for small inputs it returns $$e^{-m}$$ itself). Differentiating:

$$
g_j = \frac{e^{z_j - z_t}}{1+e^{-m}} \ (j\ne t), \qquad g_t = -\sum_{j\ne t} g_j = -\frac{e^{-m}}{1+e^{-m}}
$$

Why does autodiff produce exactly that? The target's slot in `others` is overwritten with the constant `-inf`, so $$z_t$$ reaches the loss only through the $$K-1$$ differences $$z_j - z_t$$. Each carries a $$-1$$ for $$z_t$$, so reverse mode hands the target exactly minus the sum of the rest. Leave the slot as $$z_t - z_t = 0$$ instead and its $$e^0 = 1$$ lands back in the sum, bug included. The sum is zero by construction, and $$e^{-m}$$ stays in a numerator where it's never rounded against 1.0. For $$z = [9,-9,-9]$$ that gives loss `3.046e-08` and gradient `[-3.046e-08, 1.523e-08, 1.523e-08]`, matching fp64 to four digits.

</details>

## The fix is six lines

Leave the target out of the sum, then put the 1 back with `softplus`, which knows how to add 1 to a tiny number:

```python
import jax, jax.numpy as jnp

def cross_entropy(z, t):
    z_t = jnp.take_along_axis(z, t[..., None], axis=-1)          # target logit
    is_t = jax.nn.one_hot(t, z.shape[-1], dtype=bool)
    others = jnp.where(is_t, -jnp.inf, z - z_t)                   # z_j - z_t, target excluded
    return jax.nn.softplus(jax.nn.logsumexp(others, axis=-1))    # log(1 + e^-m)
```

On `[9, -9, -9]` in float32 this returns loss `3.046e-08` and gradient `[-3.046e-08, 1.523e-08, 1.523e-08]`, summing to exactly `0.0`. The paper gives the matching `log_softmax` and `softmax` (same idea, shifting by the argmax instead of the target)[^paper].

What about fused GPU kernels? Many compute the loss in one pass with an **online softmax**[^online]: a running max $$M$$ and a running sum $$d \leftarrow d\,e^{M_{old}-M} + e^{x-M}$$. The largest logit still adds $$e^0 = 1$$ to $$d$$, so the same rounding happens. A one-pass version of `[9, -9, -9]` in fp32:

```text
online, standard:  running sum d = np.float32(1.0)   loss 0.0000e+00   g_t 0.0000e+00
online, fixed:     others only, lse = -17.3069   loss 3.0460e-08   g_t -3.0460e-08
```

The fix streams just as well: in cross-entropy the target is known up front, so stream only the other logits relative to $$z_t$$ and finish with `softplus`. Whether a given fused kernel does this is something to check in its source; none were read for this post.

## So who cares about a 1e-8 gradient?

Adam does. Adam divides each step by a running average of that weight's gradient size, $$\sqrt{\hat v}$$. A gradient of `1e-8` is small, but Adam scales it up to a normal-sized step. A gradient of exactly `0` is a different animal.

```fig title="Softmax Collapse turns Adam's normalisation into a slingshot" alt="A row of four stages. One: the model memorises and margins grow. Two: the margin crosses the fp32 cliff at 16.64 and the target gradient becomes exactly 0. Three: Adam's running gradient size v decays toward zero while weight decay shrinks the weights. Four: an example drops back under the cliff, its gradient returns and is divided by a tiny square root of v, producing a huge step, marked denied as a loss spike. A loop arrow from stage four returns to stage one, labelled repeat."
row
a: worker "margins grow\n(memorising)"
b: deny "m > 16.64\ng_t = 0 exactly"
c: shared "Adam's v decays\nweight decay shrinks"
d: deny "g_t returns\n÷ tiny sqrt(v)\n= loss spike"
a -> b "train"
b -> c "silence"
c -> d "back under cliff"
d -> a "repeat" muted via below
```

The paper traces the **Slingshot** effect, the mysterious recurring loss spikes seen while models grok modular arithmetic[^slingshot], to exactly this loop. With the fix, the spikes disappear: on $$a^2+b^2 \bmod 97$$ without weight decay, standard fp32 cross-entropy drops from 61% to 23% test accuracy when it hits the cliff, while the fixed loss keeps going to 85%[^paper]. Earlier work papered over the same symptom with fp64 casts or a replacement for softmax called StableMax[^stablemax].

A small model is enough to see the stall. The lab trains a linear softmax classifier (32 examples, 64 features, 8 classes, full-batch AdamW in fp32) with each loss:

```text
step   | standard: margin  loss       | fixed: margin  loss
  1001 |  13.16  1.933e-06            |  13.15  1.941e-06
  1501 |  16.12  1.490e-08            |  17.33  3.060e-08
  3001 |  16.13  0.000e+00            |  18.05  1.434e-08
  8000 |  16.12  1.490e-08            |  18.05  1.434e-08
standard: loss exactly 0 on 879 steps, jumps >10x in one step 736
fixed   : loss exactly 0 on 0 steps,   jumps >10x in one step 0
```

The expectation going in was a big spike. A linear model doesn't give one; it gives something quieter. Standard cross-entropy **parks** the median margin at 16.12, pressed against the fp32 cliff at 16.64, and flickers between "loss is exactly 0" and "loss is back" 736 times. The fixed version glides past and settles at 18.05. The dramatic spikes need the shared, layered weights of the paper's transformers and MLPs.

## The twist: Adam's ε was hiding the whole time

Why does the fixed loss stop at 18.05 and not climb forever? Once a gradient is much smaller than Adam's $$\epsilon$$, the step becomes $$g/\epsilon$$ instead of $$g/|g|$$, and it shrinks with $$e^{-m}$$. Weight decay balances it where $$|g| \approx \epsilon$$, so the margin settles near

$$
m^\star \approx \log(1/\epsilon)
$$

```fig title="Default Adam ε puts the margin's resting point just past the fp32 cliff" alt="One row of boxes along the logit margin axis from 0 to 40: bf16 cliff at 5.55, denied; fp32 cliff at 16.64, denied; Adam's equilibrium log of one over epsilon at 18.42 for epsilon 1e-8, the main box; fp64 cliff at 36.74. The equilibrium sits 1.8 to the right of the fp32 cliff, so a model heading for it must cross the cliff."
panel logit margin m:  0  →  40
row
bf: deny "bf16 cliff\n5.55"
f32: deny "fp32 cliff\n16.64"
eq: main "Adam rest point\nlog(1/1e-8) = 18.42"
f64: box "fp64 cliff\n36.74"
f32 -> eq "must cross"
```

With the default $$\epsilon = 10^{-8}$$ that's 18.42, just 1.8 past the fp32 cliff. Every memorising model trained with defaults is aimed straight across the cliff. The paper checks the other side too: with $$\epsilon \ge 10^{-7}$$ the rest point falls below 16.6 and standard cross-entropy settles without spiking[^paper].

## A twin bug in distillation

The second bug, **Softmax Cancellation**, shows up when a student copies a teacher's soft probabilities. The gradient is $$q - p$$, student minus teacher, and frameworks compute the two softmaxes separately and subtract. When the student equals the teacher the answer must be exactly 0. It isn't, because the forward pass computes $$p$$ with `softmax` and the backward pass computes $$q$$ as `exp(log_softmax)`, two slightly different routes to the same number. With logits `[2, 1, 0, -1.5, 3.3]` and student = teacher:

```text
bf16: standard grad at zS == zT  [ 0.00e+00 -4.88e-04 -1.22e-04  6.10e-05  0.00e+00]   max |g| 4.9e-04
fp32: standard grad at zS == zT  [ 0.00e+00  0.00e+00 -5.59e-09  0.00e+00  0.00e+00]   max |g| 5.6e-09
fp64: standard grad at zS == zT  [2.78e-17 0.00e+00 0.00e+00 0.00e+00 0.00e+00]   max |g| 2.8e-17
```

Adam again treats any gradient above $$\epsilon$$ as a real signal, so in bf16 a student initialised as a perfect copy of its teacher drifts away from it[^paper]. The fix computes $$q - p$$ directly from $$z_S - z_T$$ in log space with `expm1` and `log1p`, which returns exactly 0 when the logits match. Running the paper's version on the same logits gives `[0, 0, 0, 0, 0]` in bf16, fp32 and fp64.

<details>
<summary>Why expm1 and log1p fix it</summary>

Let $$\delta = z_S - z_T$$ and centre it under the teacher: $$d_k = \delta_k - \sum_i p_i \delta_i$$. Then

$$
s_k = \log\frac{q_k}{p_k} = d_k - \operatorname{log1p}\Big(\sum_i p_i\,\operatorname{expm1}(d_i)\Big), \qquad q_k - p_k = p_k\,\operatorname{expm1}(s_k)
$$

`expm1(x)` returns $$e^x - 1$$ without ever forming $$e^x$$ near 1, and `log1p(x)` returns $$\log(1+x)$$ the same way, so a tiny $$\delta$$ stays tiny instead of being rounded against 1.0. Because $$\sum_i p_i d_i = 0$$ and $$\operatorname{expm1}(x) \ge x$$, the argument to `log1p` is never negative, so it never gets near the $$-1$$ where `log1p` blows up. When $$\delta = 0$$ every term is exactly 0. On the paper's own test (student = teacher + `[-1e-7, 1e-7, 0]` in fp32) it returns `[-4.5955044e-08, 4.1441904e-08, 4.5131423e-09]`, the fp64 answer to every printed digit[^paper].

</details>

## Run it

The lab reproduces every number on this page in pure numpy (bf16 is emulated by rounding float32 to 8 significant bits).

<div data-lab="py" data-src="/labs/softmax-bug/softmax_lab.py" data-presets="--cliff|--train|--distill|--online"></div>

```zsh
curl -O https://samadeep.github.io/labs/softmax-bug/softmax_lab.py
python3 softmax_lab.py            # the [9, -9, -9] example
python3 softmax_lab.py --cliff    # measured cliff vs (b+1) ln 2
python3 softmax_lab.py --train    # standard vs fixed under AdamW, fp32
python3 softmax_lab.py --distill  # student == teacher
python3 softmax_lab.py --online   # one-pass softmax, same bug
```

Back to those three logits. The loss said `0.0` and meant "done". It was really saying "I can no longer see how much you have left". Next time a training curve goes perfectly flat at zero, check which side of 16.64 your margins are on.

<details>
<summary>What this doesn't show</summary>

- **Frameworks tested here:** JAX and Optax on CPU (the `[9,-9,-9]` output above) and a numpy re-implementation of the standard recipe. PyTorch's `F.cross_entropy` was not run for this post; the paper's authors say it's affected, and it uses the same max-shift recipe, but that's their claim, not a measurement here.
- **Large models:** the paper itself says such extreme margins and near-identical students are uncommon in standard large-scale training. Whether easy tokens in LLM training hit the cliff (bf16 needs only 99.6% confidence, but most fused kernels compute the loss in fp32) is not measured here.
- **Slingshot spikes** are the paper's result on grokking transformers and MLPs. The linear model in the lab shows the stall and the flicker at the cliff, not big spikes.
- **bf16** in the lab is emulated in numpy; real bf16 kernels may round intermediate sums differently.
- **The fixed `log_softmax`/`softmax`** are the paper's code and were not re-run here; the hard-target `cross_entropy` and the distillation fix were.
- **Fused kernels:** the online-softmax result is a numpy re-implementation of the algorithm, not any shipped kernel. Many kernels upcast to fp32 first, which moves the cliff to 16.64 but doesn't remove it.

</details>

[^paper]: Jonathan T. Barron, Dan Gnanapragasam, Michael Tschannen, [A Fix for Softmax and Cross-Entropy](https://arxiv.org/abs/2610.31642), arXiv:2610.31642, 2026.
[^slingshot]: Vimal Thilak et al., [The Slingshot Mechanism: An Empirical Study of Adaptive Optimizers and the Grokking Phenomenon](https://arxiv.org/abs/2206.04817), arXiv:2206.04817, 2022.
[^online]: Maxim Milakov, Natalia Gimelshein, [Online normalizer calculation for softmax](https://arxiv.org/abs/1805.02867), arXiv:1805.02867, 2018.
[^stablemax]: Lucas Prieto, Melih Barsbey, Pedro A. M. Mediano, Tolga Birdal, [Grokking at the Edge of Numerical Stability](https://arxiv.org/abs/2501.04697), ICLR, 2025.
