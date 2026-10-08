---
title: 'Dust: Can We Really Do Away With Backpropagation?'
description: 'Q Labs'' Dust pretrains transformers with forward passes and noise, no backward pass. The math, the trick, what it costs, and a version you can run.'
hook:
  stat: '0.95 vs 0.17'
  caption: 'cosine to the true gradient, same 192 forward passes → Dust vs weight-space ES'
date: '2026-10-07'
topic: ai
series: papers-rebuilt
tags: [backpropagation, evolution-strategies, zeroth-order-optimization, transformers, pretraining, node-perturbation]
vm:
  setup: 'cd /root'
---

Every neural network you've ever trained learned the same way. Run it forward, measure the loss, then run the chain rule backward through every layer. That backward pass is so baked in that GPUs, optimizers and whole architectures are designed around it.

In October 2026, Q Labs trained GPT-style transformers **without it**. No backward pass at all: only forward passes, with a little noise sprinkled in. And at a 1M-token budget, the noisy version finished *ahead*: a test loss of **5.934** against backprop's **5.959**.

So can we finally do away with backpropagation? Not yet, and the authors say so themselves. But *why* not, and the trick that got them this close, fit in one formula you can check on this page.

<details>
<summary>Before you start: three ideas this post leans on</summary>

| You need | In one line | Best short introduction |
|---|---|---|
| The chain rule / backprop | the gradient of a loss, computed layer by layer from the output back | [3Blue1Brown, Backpropagation calculus](https://www.3blue1brown.com/lessons/backpropagation-calculus), [Nielsen, chapter 2](http://neuralnetworksanddeeplearning.com/chap2.html), [Karpathy's micrograd](https://github.com/karpathy/micrograd) |
| Evolution strategies | estimate a gradient by trying random perturbations and keeping score | [OpenAI, Evolution strategies](https://openai.com/index/evolution-strategies/), [Lilian Weng, Evolution Strategies](https://lilianweng.github.io/posts/2019-09-05-evolution-strategies/) |
| Attention | each token reads earlier tokens through keys and values | [Jay Alammar, The Illustrated Transformer](https://jalammar.github.io/illustrated-transformer/) |

| Symbol | Meaning |
|---|---|
| $$x_t,\ y_t = W x_t$$ | a linear layer's input and output at token $$t$$ |
| $$\ell_t$$, $$L = \sum_t \ell_t$$ | the loss at token $$t$$, and the total |
| $$g_t = \partial L / \partial y_t$$ | the error at the layer's output |
| $$a \sim \mathcal N(0, I)$$, $$\sigma$$ | Gaussian noise and its scale |
| $$K$$, $$d$$ | noise draws per update, and dimensions being perturbed |
| $$\cos(u, v)$$ | how well an estimate points the same way as the truth (1 = perfectly) |

</details>

## What backprop is actually after

Take one linear layer, $$y_t = W x_t$$. Whatever training rule you use, the update for $$W$$ comes out as

$$
\frac{\partial L}{\partial W} \;=\; \sum_t g_t\, x_t^{\top}.
$$

Look at the two pieces. $$x_t$$ is the layer's input, and the forward pass already computed it. So the whole expensive backward sweep exists to produce **one vector per layer**: $$g_t$$, the error at the layer's output. Everything else is bookkeeping.

Backprop gets $$g_t$$ exactly, with calculus. Dust gets it by experiment, then forms *the same* product with *the same* input.

```fig title="Same weight update, two ways to get the error g"
panel Backprop
row
b1: main "forward pass\ncache inputs x"
row
b2: box "backward pass\n(chain rule)"
row
b3: shared "error g at\nlayer output"
row
b4: result "ΔW = Σ g · xᵀ"
b1 -> b2 "loss"
b2 -> b3 "exact"
b3 -> b4
panel Dust
row
d1: main "forward pass\ncache inputs x"
row
d2: worker "K noisy forwards\nreward per token"
row
d3: shared "error g at\nlayer output"
row
d4: result "ΔW = Σ g · xᵀ"
d1 -> d2 "noise σ·a"
d2 -> d3 "estimated"
d3 -> d4
```

## Wiggle it and watch the loss

Here's the experiment. Nudge the layer's output by a little random noise, $$y \to y + \sigma a$$, and run the network again. Did the loss go down? Then that nudge pointed downhill, so step that way. Did it go up? Step the other way. Do it $$K$$ times and average, weighting each nudge by how much it helped:

$$
\hat g = -\frac{1}{K\sigma} \sum_{i=1}^{K} r^{(i)} a^{(i)}, \qquad r = \text{how much the loss dropped}.
$$

That's it. No derivatives anywhere, and yet on average this lands **exactly** on the true gradient (up to a tiny bias that shrinks with $$\sigma^2$$). Perturbing a layer's outputs rather than its weights is called **node perturbation**, and it's decades old: [Widrow and Lehr's 1990 review](https://doi.org/10.1109/5.58323) covers it.

<details>
<summary>The math: why noise averages out to the gradient</summary>

Expand the loss around $$y$$, with $$H$$ the Hessian:

$$
\ell(y + \sigma a) = \ell(y) + \sigma\, a^{\top} g + \tfrac{\sigma^2}{2}\, a^{\top} H a + O(\sigma^3).
$$

With reward $$r = \ell(y) - \ell(y + \sigma a)$$:

$$
\begin{aligned}
-\frac{1}{\sigma}\,\mathbb E\,[\, r\, a \,] &= \mathbb E\,[\, a a^{\top} ]\, g \;+\; \tfrac{\sigma}{2}\,\mathbb E\,[\,(a^{\top} H a)\, a\,] \;+\; O(\sigma^2) \\
&= g + O(\sigma^2).
\end{aligned}
$$

$$\mathbb E[aa^\top] = I$$ because the noise is standard Gaussian, and the middle term vanishes because it's an odd moment of a symmetric distribution. Subtracting a baseline from the reward (Dust uses the mean over the $$K$$ draws) leaves the expectation alone, since $$\mathbb E[a] = 0$$, and cuts the variance a lot.

</details>

So it's correct. Correct was never the problem. **Noise** was.

## How many wiggles? One law decides

A single reward is one number, and it has to tell you about every dimension you wiggled at once. Wiggle 8 dimensions and each one gets a fair share of that number. Wiggle a million and each gets almost nothing. Averaging more draws helps, and the trade-off has a clean form:

$$
\cos(\hat g, g) \;\approx\; \frac{1}{\sqrt{1 + (d+1)/K}}
$$

$$d$$ is how many dimensions share one reward, $$K$$ is how many draws you average. You don't have to trust it. Here it is against a simulation using only Python's `random` module (8 dimensions, 200 trials per row):

```python
import math, random
random.seed(1)
d, trials = 8, 200                       # 8 output dimensions, true error g = (1, 1, ..., 1)
for K in [2, 8, 32]:
    total = 0.0
    for _ in range(trials):
        est = [0.0] * d
        for _ in range(K):               # one draw: noise a, reward = a . g
            a = [random.gauss(0, 1) for _ in range(d)]
            r = sum(a)
            est = [e + r * x / K for e, x in zip(est, a)]
        total += sum(est) / math.sqrt(d * sum(e * e for e in est))   # cosine to g
    predicted = 1 / math.sqrt(1 + (d + 1) / K)
    print(f"K = {K:>2}   measured cos {total / trials:.3f}   predicted {predicted:.3f}")
```

```text
K =  2   measured cos 0.436   predicted 0.426
K =  8   measured cos 0.709   predicted 0.686
K = 32   measured cos 0.902   predicted 0.883
```

<details>
<summary>The math: where 1/√(1 + (d+1)/K) comes from</summary>

One draw estimates $$a a^\top g$$. Rotate coordinates so $$g = \lVert g\rVert e_1$$; then, using $$\mathbb E[a_1^4] = 3$$,

$$
\begin{aligned}
\mathbb E\,\lVert a a^{\top} g \rVert^2 &= \lVert g \rVert^2\, \mathbb E\big[a_1^2 \textstyle\sum_j a_j^2\big] \\
&= \lVert g \rVert^2 \big(3 + (d - 1)\big) = (d+2)\,\lVert g \rVert^2.
\end{aligned}
$$

Take away the signal $$\lVert g\rVert^2$$ and one draw carries noise $$(d+1)\lVert g\rVert^2$$. Averaging $$K$$ independent draws divides the noise by $$K$$ and leaves the signal alone, so

$$
\cos(\hat g, g) \approx \frac{\lVert g \rVert^2}{\lVert g \rVert \sqrt{\lVert g \rVert^2 + (d+1)\lVert g \rVert^2 / K}} = \frac{1}{\sqrt{1 + (d+1)/K}}.
$$

The simulation runs slightly above the prediction because the formula divides averages, while the code averages ratios. This is exactly the form the Dust paper fits to its own measurements, $$\cos(K) = c_{\max}/\sqrt{1 + c/K}$$.

</details>

Now you can see why gradient-free training never scaled. **Evolution strategies** wiggle *every weight at once* and score the result with one number, the loss. So $$d$$ is the parameter count. To get even a cosine of 0.5 you need $$K = (d+1)/3$$ forward passes per step. For the 37.7M-parameter model in the paper, that's about **12.6 million forward passes per update**.

> **Insight:** The cost of learning without gradients comes down to one ratio: how many dimensions share each scalar reward. Every trick in Dust is a way to shrink it.

## The trick: every token is its own experiment

A language model doesn't produce one loss. It produces a loss at **every token**. Dust uses that.

It adds independent noise at every token and rewards each token's noise with *that token's own* loss change. Two things happen at once:

- **$$d$$ collapses** from "every weight in the model" to "one layer's output width": 512 or 2048 in the paper's transformer, not 37.7 million.
- **The population explodes.** A 2,048-token sequence is 2,048 separate experiments, run in one forward pass. The paper calls it a **virtual population**: at each token, the network behaves as if that layer's weights had been perturbed, without a perturbed copy ever existing.

```fig title="Weight-space ES gets one member per pass; Dust gets one per token"
panel Weight-space ES
row
w1: worker "weights + ε₁"
w2: worker "weights + ε₂"
w3: worker "weights + ε₃"
row
p1: box "pass 1"
p2: box "pass 2"
p3: box "pass 3"
row
s1: deny "3 passes → 3 scalars → 3 members" span 3
w1 -> p1
w2 -> p2
w3 -> p3
p1 -> s1
p2 -> s1
p3 -> s1
panel Dust
row
t1: worker "token 1 + a₁"
t2: worker "token 2 + a₂"
t3: worker "token 3 + a₃"
row
q1: box "one pass, all tokens" span 3
row
s2: allow "1 pass → 2048 losses → 2048 members" span 3
t1 -> q1
t2 -> q1
t3 -> q1
q1 -> s2 "per-token loss"
```

Watch it happen on a real (tiny) network. This script builds a next-character model with 5,728 parameters, trained on the Zen of Python because it ships with Python. It computes the exact backprop gradient, then measures how well each method's guess points the same way. ES gets exactly as many forward passes as Dust. Press Run: it runs in your browser, NumPy and all, in a few seconds.

<div data-lab="py" data-src="/labs/dust/dust.py" data-presets="--sigma 0.2|--train dust --pop 16 --lr 0.5 --steps 40|--train es --pop 16 --lr 0.09 --steps 40|--train backprop --steps 40"></div>

```text
text: 853 next-character predictions, vocab 32, model 5,728 parameters

 draws K  passes  Dust cos   ES cos   (cosine to the backprop gradient)
       1       3     0.372    0.011
       4      12     0.537    0.044
      16      48     0.841    0.077
      64     192     0.951    0.174
     256     768     0.988    0.328

fit: cos(K) = 1.00 / sqrt(1 + 8.1 / K)   half-way point (cos = c_max / sqrt 2) at K = 8.1
```

Same 192 forward passes: **0.95** for Dust, **0.17** for ES. And ES isn't just bad, it's *predictably* bad. Plug its parameter count into the law and you get its column almost exactly:

```python
import math
d = 5728                                  # parameters: ES perturbs all of them per scalar
measured = {3: 0.011, 12: 0.044, 48: 0.077, 192: 0.174, 768: 0.328}   # from the run above
for passes, m in measured.items():
    print(f"{passes:>4} passes   predicted {1 / math.sqrt(1 + (d + 1) / passes):.3f}   measured {m:.3f}")
```

```text
   3 passes   predicted 0.023   measured 0.011
  12 passes   predicted 0.046   measured 0.044
  48 passes   predicted 0.091   measured 0.077
 192 passes   predicted 0.180   measured 0.174
 768 passes   predicted 0.344   measured 0.328
```

Dust's own fit gives $$c \approx 8$$, even though each layer here has 32 to 64 output dimensions. That's the token axis paying off twice: the weight update sums over all 853 tokens, so independent per-token noise partly cancels while the signal adds up.

## Attention makes credit messy

Real transformers have a catch. If every layer is jittered at every token in the same pass, the loss at token $$t$$ also moves because of jitters elsewhere, and through attention, at earlier tokens. None of that is signal. It's just more dimensions sharing one reward. The paper calls it **interference**, and most of Dust's engineering is about keeping each reward close to what caused it:

- **One layer type and one block per pass.** These passes are cheaper than full forwards: the clean forward is cached, and a draw for block $$l$$ only reruns blocks $$l$$ onward.
- **MLPs and projections get their own token's loss**, because that's all they touch directly.
- **Keys, values and gates get the future.** A key at token $$t$$ is read by every later token that attends to it, so its reward sums the loss drops after it, decayed per token of lag: $$r_t = \sum_{s \ge t} \gamma^{s-t} c_s$$.
- **Attention internals get a local target.** A single query jitter barely moves any token's loss, so Dust scores it by how its change to the attention output, $$\Delta o_s$$, lines up with that output's own estimated error.

```fig title="A key's jitter is credited for the tokens that read it later"
panel MLP, output projection
row
m1: worker "jitter at token t"
_
_
row
ml0: allow "loss at t\n× 1"
ml1: box "loss at t+1\nignored"
ml2: box "loss at t+2\nignored"
m1 -> ml0 "γ = 0"
panel Keys, values, gates
row
k1: worker "jitter at token t"
_
_
row
kl0: allow "loss at t\n× 1"
kl1: allow "loss at t+1\n× γ"
kl2: allow "loss at t+2\n× γ²"
k1 -> kl0
k1 -> kl1
k1 -> kl2
```

The tuning search lands right where attention says it should: nothing needs credit from future tokens except keys, values, gates and value embeddings, which want $$\gamma$$ close to one.

## So, does it actually train?

Yes. The paper's setup is a real pretraining run, if a small one: an 8-layer, width-512 transformer (37.7M parameters) on FineWeb, plain SGD with momentum, every method tuned at every budget, three seeds per cell. Test loss, lower is better:

| Tokens | Backprop | Dust, 1k draws | Dust, 16k draws | EGGROLL (weight-space ES), 16k |
|---|---|---|---|---|
| 100k | 7.216 | **7.151** | 7.170 | 7.263 |
| 1M | 5.959 | **5.934** | **5.916** | 6.708 |
| 10M | **4.989** | 5.111 | 5.049 | 6.033 |
| 20M | **4.633** | 4.960 | 4.802 | 5.865 |

At small budgets Dust beats backprop outright. At larger ones it's behind but closing as the population grows: at 20M tokens it's still improving at 16k draws. EGGROLL, a fast modern ES, doesn't even reach Dust's *smallest* population. That's the variance law again, at scale.

The toy from above tells the same story: training loss after 150 updates, each method tuned at each population, averaged over three seeds. Backprop sits right on the floor (0.291, the text's own uncertainty about the next character).

| Draws per layer $$K$$ | Forward passes per update | Dust | Weight-space ES (same passes) | Best learning rate, Dust / ES |
|---|---|---|---|---|
| 4 | 12 | **0.754** | 2.260 | 0.25 / 0.03 |
| 16 | 48 | **0.386** | 1.542 | 0.5 / 0.09 |
| 64 | 192 | **0.333** | 0.861 | 1 / 0.27 |
| 256 | 768 | **0.310** | 0.396 | 1 / 0.27 |
| Backprop | about 3 | 0.293 | | 2 |

Getting this table right took two wrong turns, and both teach something. The first run gave every method the same learning rate, and **ES exploded** into losses in the thousands. A noisy estimate isn't just less accurate, it's *longer*: about $$\sqrt{1 + (d+1)/K}$$ times the true gradient. Then a rate tuned at 64 draws made **Dust diverge at 4**, for the same reason one level down. The fix is what the paper does: re-tune the learning rate at every population, because the two can't be chosen separately.

One more surprise. If the variance law were the whole story, bigger models would be hopeless. The paper found the opposite, up to a point:

| Population | 2.0M params | 7.3M | 38M | 243M |
|---|---|---|---|---|
| 64 | 5.705 | **5.556** | 5.558 | 5.719 |
| 1k | 5.265 | 5.161 | **5.158** | 5.214 |
| 16k | 5.171 | 5.065 | **5.036** | 5.086 |
| Backprop | 5.180 | 5.066 | **5.015** | 5.048 |

A model 120 times larger does as well at 64 draws and better at every bigger population. Per-token noise explains part of it: the noise grows with a layer's **width**, not the model's parameter count. The authors' wider reading is that a bigger model is simply a bigger, better-shaped space to search.

## The bill

Here's why nobody is switching tomorrow:

```python
backprop = 1 + 2          # forward + backward, in forward-pass units (rule of thumb)
dust = 16_384             # draws per update, each slightly cheaper than a forward pass
print(f"Dust at 16k draws ~ {dust / backprop:,.0f}x backprop's compute per update (an upper bound)")
```

```text
Dust at 16k draws ~ 5,461x backprop's compute per update (an upper bound)
```

Thousands of times the compute, for a loss that's still behind at 20M tokens. The authors say plainly that efficiency wasn't the goal. Their bet is [the bitter lesson](http://www.incompleteideas.net/IncIdeas/BitterLesson.html): general methods that turn compute into progress tend to win as compute gets cheap.

And Dust can do things backprop can't. It only ever *evaluates* the loss, never differentiates it, so it can train networks with a hard, discrete step or an external program in the loop. A model that loops for many steps doesn't need backprop through time. And because its gradient points near backprop's but not exactly at it, it walks a different path through the loss landscape, which sometimes ends lower. Nobody knows why yet.

> **Insight:** Dust isn't a cheaper backprop. It's a more general one that's currently far more expensive, so the real question is which networks it can train that backprop can't.

## So, can we do away with it?

For the models we train today, no. Backprop computes that one error vector exactly for about three forward passes; Dust spends thousands to estimate it, and the variance law says there's no shortcut. But until this month, nobody had shown a forward-only rule could pretrain a transformer at all. Now one does: it matches backprop at small budgets, closes in with more compute, and gets *better* as models grow. Backprop is still the cheapest way to train a network. It's no longer the only one.

## Try it

Everything above runs on this page. On your own machine (needs NumPy):

```zsh
curl -O https://samadeep.github.io/labs/dust/dust.py
python3 dust.py                          # cosine to backprop as the population grows
python3 dust.py --train dust --pop 64    # train with no backward pass
python3 dust.py --train es --pop 64      # same forward passes, weight-space ES
curl -O https://samadeep.github.io/labs/dust/ladder.py
python3 ladder.py                        # the toy scoreboard, about half an hour
```

The authors' own PyTorch implementation is at [github.com/qlabs-eng/dust](https://github.com/qlabs-eng/dust) and needs an NVIDIA GPU.

<details>
<summary>Limits and sources</summary>

- **The toy is not the paper.** It's a 5,728-parameter MLP on 853 characters with no attention, so the credit decay never comes into play, and its losses are training losses, not held-out test losses. It reproduces the estimator, the per-token population and the variance law, nothing more.
- **Toy learning rates** were tuned per method and population, each rate scored by its mean over three seeds, widening the grid until the best rate sat inside it (`ladder.py` prints the grids).
- **The variance law** assumes independent draws and divides averages, which is why measured cosines run slightly above it. Dust's per-token $$c \approx 8$$ is measured, not derived.
- **The compute ratio** uses the "backward ≈ two forwards" rule of thumb and counts a draw as a full forward pass, so it overstates Dust's cost a little.
- **Not reproduced here:** the paper's GPU results, which are quoted from its main text, Table 1 in the appendix and the model-size table. The estimator in `dust.py` was checked against the authors' code.
- Sources:
  - Samip Dahal, Bishwas Mandal, Serdar Gülbahar, Akshay Vegesna. [Dust: Pretraining Transformers Without Backpropagation](https://qlabs.sh/research/dust) ([appendix](https://qlabs.sh/research/dust/appendix.html), [code](https://github.com/qlabs-eng/dust)). Q Labs, October 2026.
  - Rumelhart, Hinton, Williams. Learning representations by back-propagating errors. Nature 323, 1986.
  - Widrow and Lehr. [30 years of adaptive neural networks](https://doi.org/10.1109/5.58323). Proc. IEEE, 1990.
  - Salimans et al. [Evolution strategies as a scalable alternative to reinforcement learning](https://arxiv.org/abs/1703.03864), 2017.
  - Sarkar et al. [Evolution strategies at the hyperscale (EGGROLL)](https://arxiv.org/abs/2511.16652), 2025.
  - Sutton. [The bitter lesson](http://www.incompleteideas.net/IncIdeas/BitterLesson.html), 2019.

</details>
