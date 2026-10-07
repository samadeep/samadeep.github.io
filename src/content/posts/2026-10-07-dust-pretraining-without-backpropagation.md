---
title: 'Dust: Can We Really Do Away With Backpropagation?'
description: 'Q Labs'' Dust pretrains transformers with forward passes and noise, no backward pass. The math, the trick, what it costs, and a version you can run.'
hook:
  stat: '0.95 vs 0.17'
  caption: 'cosine to the true gradient, same 192 forward passes → Dust vs weight-space ES'
date: '2026-10-07'
topic: ai
tags: [backpropagation, evolution-strategies, zeroth-order-optimization, transformers, pretraining, node-perturbation]
vm:
  setup: 'cd /root'
---

Every neural network that matters has learned the same way since 1986: run forward, then run the chain rule backward. This month Q Labs pretrained GPT-style transformers with **no backward pass at all**, only forward passes with noise added, and at a 1M-token budget it finished **below backprop**: a test loss of 5.934 against 5.959.

**Short answer:** not yet, and the authors say so themselves. Dust matches or beats backprop at small token budgets and closes the gap at larger ones, but only by spending thousands of forward passes per update. What it does show is that a learning rule based on search can pretrain a transformer from scratch competitively, which the authors say no zeroth-order method had done before, and that the folklore "search can't scale to big networks" is wrong in a very specific, explainable way.

This post builds Dust from nothing: the one quantity backprop really computes, a five-line proof that noise can estimate it, the formula that says how much noise you need (and why the old methods needed impossibly much), the per-token trick that makes it cheap, how credit flows through attention, the scoreboard, and the bill. Every equation is checked by code you can run on this page.

<details>
<summary>Before you start: what this post assumes, and where to get it</summary>

You need three ideas. If any is shaky, these are the best short introductions:

| You need | In one line | Read first |
|---|---|---|
| The chain rule / backprop | the gradient of a loss through a stack of layers, computed layer by layer from the output back | [3Blue1Brown, Backpropagation calculus](https://www.3blue1brown.com/lessons/backpropagation-calculus) (video), [Nielsen, chapter 2](http://neuralnetworksanddeeplearning.com/chap2.html) (text), [Karpathy's micrograd](https://github.com/karpathy/micrograd) (100 lines of code) |
| Evolution strategies | estimate a gradient by trying random perturbations and keeping score | [OpenAI, Evolution strategies as a scalable alternative to RL](https://openai.com/index/evolution-strategies/), [Lilian Weng, Evolution Strategies](https://lilianweng.github.io/posts/2019-09-05-evolution-strategies/) |
| Attention | each token reads earlier tokens through keys and values | [Jay Alammar, The Illustrated Transformer](https://jalammar.github.io/illustrated-transformer/) |

Notation used throughout:

| Symbol | Meaning |
|---|---|
| $$x_t,\ y_t = W x_t$$ | a linear layer's input and output at token $$t$$ |
| $$\ell_t$$ | the loss at token $$t$$ (cross-entropy of the next-token prediction); the total loss is $$L = \sum_t \ell_t$$ |
| $$g_t = \partial L / \partial y_t$$ | the **error at the layer's output**: how the loss changes if $$y_t$$ moves |
| $$a_t \sim \mathcal N(0, I)$$, $$\sigma$$ | Gaussian noise added to $$y_t$$, and its scale |
| $$K$$, $$d$$ | number of noise **draws** per update, and the number of dimensions being perturbed |
| $$\cos(u, v) = \dfrac{u \cdot v}{\lVert u \rVert \lVert v \rVert}$$ | how well an estimate points the same way as the truth (1 = perfectly) |

</details>

## 1. Backprop only ever computes one thing per layer

Take one linear layer, $$y_t = W x_t$$. Entry $$W_{ij}$$ touches the output only through $$y_{t,i} = \sum_j W_{ij} x_{t,j}$$, so $$\partial y_{t,i} / \partial W_{ij} = x_{t,j}$$, and by the chain rule

$$
\frac{\partial L}{\partial W} \;=\; \sum_t g_t\, x_t^{\top}, \qquad g_t = \frac{\partial L}{\partial y_t}.
$$

The input $$x_t$$ is free: the forward pass already computed it. **The only hard part of training is $$g_t$$**, one vector per layer per token. Everything else is bookkeeping.

Backprop gets $$g_t$$ exactly. At the output, for softmax cross-entropy, the error at the logits is simply $$p_t - e_{y_t}$$ (predicted probabilities minus the one-hot answer). Every earlier layer's error comes from the one after it: through $$y = W x$$ it is $$W^{\top} g$$, and through an elementwise $$h = \tanh(z)$$ it is $$g \odot (1 - h^2)$$. That backward sweep costs about two forward passes and needs every operation to be differentiable.

Dust gets $$g_t$$ by experiment instead, and then forms **the same outer product with the same input**.

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

> **Insight:** A learning rule is really an answer to one question per layer: what is the error at this layer's output? Anything that estimates that vector well enough can feed the same optimizer, and Dust buys it with compute instead of calculus.

## 2. Five lines of math: noise points downhill on average

Add noise to the output, $$y \to y + \sigma a$$, and look at what happens to the loss. A Taylor expansion around $$y$$, with $$H$$ the Hessian:

$$
\ell(y + \sigma a) \;=\; \ell(y) + \sigma\, a^{\top} g + \tfrac{\sigma^2}{2}\, a^{\top} H a + O(\sigma^3).
$$

Define the **reward** as how much the loss dropped, $$r = \ell(y) - \ell(y + \sigma a)$$, and weight the noise by it:

$$
\begin{aligned}
-\frac{1}{\sigma}\,\mathbb E\,[\, r\, a \,] &= \mathbb E\,[\, a a^{\top} ]\, g \;+\; \tfrac{\sigma}{2}\,\mathbb E\,[\,(a^{\top} H a)\, a\,] \;+\; O(\sigma^2) \\
&= g + O(\sigma^2).
\end{aligned}
$$

The first expectation is the identity matrix, because $$a \sim \mathcal N(0, I)$$. The second vanishes, because it is an odd moment of a symmetric distribution. So **reward-weighted noise is an unbiased estimate of the gradient**, up to a bias of order $$\sigma^2$$. Intuitively: a jitter that happened to lower the loss pointed downhill, so you step along it; a jitter that raised it pointed uphill, so you step against it.

Two practical details. Subtracting any baseline from the reward leaves the expectation unchanged (because $$\mathbb E[a] = 0$$) and cuts variance a lot; Dust uses the mean loss over the $$K$$ draws, which, since it includes each draw itself, scales the estimate by $$(K-1)/K$$, a constant the learning rate absorbs. And the averaged estimate over $$K$$ draws is

$$
\hat g = -\frac{1}{K\sigma} \sum_{i=1}^{K} r^{(i)} a^{(i)}.
$$

This idea, perturbing a layer's outputs ("nodes") rather than its weights, is called **node perturbation**, and it is decades old ([Widrow and Lehr's 1990 review](https://doi.org/10.1109/5.58323) covers it). Unbiased was never the problem. Variance was.

> **Insight:** Noise gives you the gradient for free in expectation. The entire cost of a search-based learner lives in the variance, so the question is never "is it correct?" but "how many draws until it's useful?".

## 3. How many draws? The 1/√(1 + d/K) law

Look at a single draw, ignoring the $$\sigma^2$$ bias: the estimate is $$a a^{\top} g$$, the true gradient projected onto a random direction and stretched back out. How far is it from $$g$$? Rotate coordinates so that $$g = \lVert g \rVert e_1$$; then

$$
\begin{aligned}
\mathbb E\,\lVert a a^{\top} g \rVert^2 &= \lVert g \rVert^2\, \mathbb E\big[a_1^2 \textstyle\sum_j a_j^2\big] \\
&= \lVert g \rVert^2 \big(3 + (d - 1)\big) = (d+2)\,\lVert g \rVert^2,
\end{aligned}
$$

using $$\mathbb E[a_1^4] = 3$$. Subtract the signal $$\lVert g \rVert^2$$ and one draw carries **noise of $$(d+1)\lVert g \rVert^2$$**: it grows with every dimension you perturb, because a single scalar reward has to be shared across all $$d$$ of them. Averaging $$K$$ independent draws divides the noise by $$K$$ and leaves the signal alone, so

$$
\begin{aligned}
\cos(\hat g, g) &\approx \frac{\lVert g \rVert^2}{\lVert g \rVert \sqrt{\lVert g \rVert^2 + (d+1)\lVert g \rVert^2 / K}} \\
&= \frac{1}{\sqrt{1 + (d+1)/K}}.
\end{aligned}
$$

That is exactly the form the Dust paper fits to its measurements, $$\cos(K) = c_{\max} / \sqrt{1 + c/K}$$, with $$c$$ playing the role of the **effective number of dimensions per reward**. Here it is checked with nothing but Python's `random` module (8 dimensions, 200 trials per row):

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

(The measured values sit a little above the prediction because the formula divides averages, while the code averages ratios.)

Now the law explains why **weight-space evolution strategies** struggle. ES perturbs every weight at once and scores the result with one number, the loss. So $$d$$ is the parameter count: millions for a real model. To reach a cosine of 0.5 you need $$K = (d+1)/3$$ forward passes per update. For the 37.7M-parameter model in the paper that is about 12.6 million passes per step.

> **Insight:** The cost of gradient-free learning is set by one ratio: dimensions perturbed per scalar reward. Every trick in Dust is a way of making that ratio small.

## 4. Every token is its own experiment

Dust's central idea is to stop scoring with one scalar per forward pass. A language model already computes a separate loss $$\ell_t$$ at every token. So Dust adds **independent** noise $$a_t$$ to the layer output at every token and rewards each token's noise with **that token's** loss drop:

$$
\hat g_t = -\frac{1}{K\sigma}\sum_{i=1}^{K} r_t^{(i)}\, a_t^{(i)}, \qquad \widehat{\partial L / \partial W} = \sum_t \hat g_t\, x_t^{\top}.
$$

Two things change at once:

- **$$d$$ shrinks** from "all the weights" to "one layer's output width": 512 or 2048 in the paper's transformer, not 37.7 million.
- **The population multiplies.** A 2,048-token sequence runs 2,048 separate experiments in one forward pass. At each token, adding $$\sigma a_t$$ to $$y_t = W x_t$$ is the same as perturbing the weights by $$\sigma a_t x_t^{\top} / \lVert x_t \rVert^2$$ for that token alone, so the paper calls this a **virtual population**: a population of weight perturbations that is never materialised.

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

You can watch the law play out on a real (tiny) network. The script below builds a next-character model with 5,728 parameters (an embedding, one tanh layer and an output layer; the text is the Zen of Python because it ships with Python), computes the exact backprop gradient, and measures each method's cosine to it as the population grows. ES gets exactly as many forward passes as Dust (three per draw, one per layer). It runs in your browser with NumPy; the presets also train the model three ways.

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

Two things to read off it. First, **ES lands right on the law's prediction**, using nothing but the parameter count, $$d = 5{,}728$$:

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

Second, **Dust's fitted $$c$$ is about 8**, even though each layer's output has 32 to 64 dimensions. That's the token axis at work: the weight gradient sums $$\hat g_t x_t^{\top}$$ over all 853 tokens, the per-token noise is independent and partly cancels in the sum, while the signal from tokens that agree adds up. The token axis divides the effective $$d$$ instead of multiplying the cost.

> **Insight:** Zeroth-order methods were never limited by forward passes; they were limited by how many independent scalars each pass returns. A per-token loss turns one pass into thousands of scalars, each responsible for only a few hundred dimensions.

## 5. Keeping credit local, especially through attention

The section 3 law has a catch for real transformers: $$d$$ counts **every perturbation that can move a given reward**, not just the one being credited. If you jitter every layer at every token in one pass, the loss at token $$t$$ also moves because of jitters in other layers and, through attention, at earlier tokens. Each of those adds a term $$\sigma\, a'^{\top} g'$$ to the reward: zero on average, but pure variance. The paper calls it **interference**, and most of Dust's engineering exists to keep $$d$$ per reward small:

- **One layer type, one block per pass.** Different layer types are jittered in separate passes with their own $$\sigma$$. The passes are cheaper than full forwards: the clean forward is cached, and a draw for block $$l$$ only reruns blocks $$l$$ onward.
- **Own token only, where that's all a layer can affect directly.** MLP and projection outputs are rewarded with their own token's loss drop.
- **Keys, values and gates are read later, so they are credited later.** A key at token $$t$$ influences every later token that attends to it, so its reward sums the centered loss drops $$c_s$$ after it, discounted per token of lag:

$$
r_t = \sum_{s \ge t} \gamma^{\,s-t}\, c_s .
$$

- **Attention internals get a local target.** Token losses barely register a single query or key jitter, so instead of the loss, Dust scores the change it makes in the attention output, $$\Delta o_s$$, against that output's own estimated error: $$c_s = -\langle \hat g_s, \Delta o_s \rangle$$. That is a one-layer-deep, chain-rule-style step, with the error itself coming from noise.

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

The tuning search lands where attention says it should: no layer needs credit from future tokens except the keys, values, gates and value embeddings, which want $$\gamma$$ close to one. The paper also offers a tuning shortcut that follows from section 3: pick noise scales and decays that **maximise the cosine to the backprop gradient on a single batch**, which needs no training at all, then confirm the best candidates with short training runs.

> **Insight:** Backprop gets locality for free: the chain rule only ever passes error to what actually caused it. A search-based learner has to engineer that locality, and its quality is mostly a measure of how few perturbations share each reward.

## 6. The scoreboard: training with no backward pass

The paper's setup is a real, if small, pretraining run: an 8-layer, width-512 transformer (37.7M parameters) on FineWeb, 16k tokens per batch, plain SGD with momentum, every method tuned at every budget, three seeds per cell. Test loss at the best validation checkpoint (lower is better):

| Tokens | Backprop | Dust, 1k draws | Dust, 16k draws | EGGROLL (weight-space ES), 16k |
|---|---|---|---|---|
| 100k | 7.216 | **7.151** | 7.170 | 7.263 |
| 1M | 5.959 | **5.934** | **5.916** | 6.708 |
| 10M | **4.989** | 5.111 | 5.049 | 6.033 |
| 20M | **4.633** | 4.960 | 4.802 | 5.865 |

- **Small budgets: Dust wins.** From a few hundred draws at 100k tokens and a thousand at 1M, it ends below backprop.
- **Larger budgets: the gap closes with population.** At 20M tokens Dust is still improving at 16k draws. A power-law fit puts its limit at 4.431, below backprop, but the authors read that as "the gap keeps closing", not as a measured result, because the curve hasn't flattened.
- **Weight-space ES isn't close.** EGGROLL (a fast, low-rank ES from 2025) at 16k doesn't reach Dust at 64 draws. Extrapolating, it would need thousands to tens of thousands of times more population to match Dust's smallest one: section 3's variance problem, at scale.

The toy from section 4 reproduces the shape: final training loss after 150 updates, learning rate tuned per method and population, mean of three seeds. Backprop sits essentially on the floor (0.291: the text's own uncertainty about the next character given three, which no model can beat).

| Draws per layer $$K$$ | Forward passes per update | Dust | Weight-space ES (same passes) | Best learning rate, Dust / ES |
|---|---|---|---|---|
| 4 | 12 | **0.754** | 2.260 | 0.25 / 0.03 |
| 16 | 48 | **0.386** | 1.542 | 0.5 / 0.09 |
| 64 | 192 | **0.333** | 0.861 | 1 / 0.27 |
| 256 | 768 | **0.310** | 0.396 | 1 / 0.27 |
| Backprop | about 3 | 0.293 | | 2 |

Loss starts at 3.533 for every method. Dust at 64 draws gets within 0.04 of backprop; ES needs 768 passes per update just to approach what Dust reaches with 48, about **16 times the compute**. That's a much smaller gap than the cosines suggest: plugging both fitted $$c$$ values into section 3's law (5,729 for ES, about 8 for Dust), equal cosines would need roughly 700 times the draws, or about 236 times the passes. The likely reason is that training forgives noise the cosine counts: momentum averages each update with roughly the last ten, which divides the noise again, so a poor single-step estimate can still make steady progress.

Two dead ends on the way to that table say something about the method. The first run gave every method the same learning rate, and **ES blew up** (its loss climbed into the thousands), because section 3's noise makes its estimate far larger than the true gradient, not just less accurate. Then a learning rate tuned at 64 draws made **Dust diverge at 4 draws**, for the same reason one level down. And the reverse: a grid that stopped at 0.1 made ES look **worse** at 256 draws than at 64, until a larger rate was tried. The law predicts all three. The estimate's length is about $$\sqrt{1 + (d+1)/K}$$ times the true gradient's, so a safe step shrinks as the noise grows and grows as $$K$$ does. That's why the paper re-tunes at every population: the learning rate and the population can't be chosen separately.

The most surprising result is about size. If section 3's law were the whole story, bigger models would be hopeless, because $$d$$ grows. At a fixed 10M tokens the paper finds the opposite, up to a point:

| Population | 2.0M params | 7.3M | 38M | 243M |
|---|---|---|---|---|
| 64 | 5.705 | **5.556** | 5.558 | 5.719 |
| 1k | 5.265 | 5.161 | **5.158** | 5.214 |
| 16k | 5.171 | 5.065 | **5.036** | 5.086 |
| Backprop | 5.180 | 5.066 | **5.015** | 5.048 |

A model 120 times larger does about as well at 64 draws and better at every larger population, and the large models keep improving with population after the small ones flatten. Per-token perturbation explains part of it: $$d$$ per reward grows with layer **width**, not with parameter count. The authors' wider reading is that a bigger model is a bigger, better-shaped search space. Their gradient cosines also hold steady on checkpoints from 10M to 1B tokens, which is the evidence they lean on for scaling.

> **Insight:** "Search doesn't scale with dimensions" silently assumes the search is over weights. Over activations, with a reward per token, what matters is the width of one layer, so a deeper or larger model costs far less extra noise than its parameter count suggests.

## 7. The bill: populations cost forward passes

A backprop update costs one forward and one backward pass, roughly three forward passes of compute (a common rule of thumb; the paper doesn't give one). A Dust update at 16k draws costs about 16k slightly cheaper forward passes:

```python
backprop = 1 + 2          # forward + backward, in forward-pass units (rule of thumb)
dust = 16_384             # draws per update, each slightly cheaper than a forward pass
print(f"Dust at 16k draws ~ {dust / backprop:,.0f}x backprop's compute per update (an upper bound)")
```

```text
Dust at 16k draws ~ 5,461x backprop's compute per update (an upper bound)
```

That's thousands of times more compute per update for a loss that, at 20M tokens, is still above backprop's. The authors are explicit that compute efficiency wasn't the goal, and that Dust needs orders of magnitude more of it before it is a practical replacement. Their bet is [the bitter lesson](http://www.incompleteideas.net/IncIdeas/BitterLesson.html): as compute gets cheaper, general methods that turn compute into progress tend to win, the way self-play AlphaGo Zero overtook the version bootstrapped on human games.

What would make the bet pay off is the work backprop can't do:

- **No differentiability required.** A network with an external program in the loop, or a hard, discrete step, has no chain rule to run. Section 2's proof only needs the loss to be **evaluated**, not differentiated.
- **Looped computation.** A transformer run for many steps is trained by backprop through time, which struggles; a forward-only rule doesn't care how long the loop is.
- **A different path through the loss landscape.** Dust's gradient points near backprop's but not exactly at it, and at large populations that trajectory sometimes ends lower. Why is an open question; the authors suspect it implicitly picks up curvature that pulls toward flatter regions.

> **Insight:** Dust is not a cheaper backprop, it's a more general one that is currently far more expensive. The real question isn't "will it replace backprop?", it's "which networks can it train that backprop can't?".

## So, can we do away with backpropagation?

For the models trained today, no. Backprop computes the exact error vector for about three forward passes; Dust spends thousands to estimate it, and section 3's law says there is no free lunch on that variance. But the question used to be whether a forward-only rule could pretrain a transformer at all, and the answer is now yes: it matches backprop at small budgets, closes in with population at larger ones, and gets better, not worse, as models grow, because per-token rewards make the cost scale with a layer's width rather than the model's size. Backprop is no longer the only rule shown to pretrain a transformer from scratch. It is still, by a wide margin, the cheapest.

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

The real thing, the authors' PyTorch implementation of the paper's estimator with its tuned defaults, is at [github.com/qlabs-eng/dust](https://github.com/qlabs-eng/dust) and needs an NVIDIA GPU.

<details>
<summary>Limits and sources</summary>

- **The toy is not the paper.** It is a 5,728-parameter MLP on 853 characters with no attention, so section 5's credit decay never comes into play. Its losses are training losses on the whole text, not held-out test losses. It reproduces the estimator, the per-token population and the cosine law, nothing more.
- **Toy learning rates** were tuned per method and per population on seed 0, widening the grid until the best rate was strictly inside it, then rerun with two more seeds. The grids are printed by `ladder.py`.
- **Section 3's law** treats draws as independent and the estimate's norm as its average, which is why the measured cosines run slightly above it. Dust's per-token version (section 4) wasn't derived exactly here; the fitted $$c \approx 8$$ is measured, and the explanation for it (per-token noise partly cancelling across tokens) is the mechanism, not a proof.
- **The compute ratio in section 7** uses the "backward ≈ two forwards" rule of thumb and counts a draw as a full forward pass, so it overstates Dust's cost a little.
- **Not reproduced here:** the paper's GPU results. Its numbers above are quoted from the main text, Table 1 in the appendix and the model-size table.
- The estimator in `dust.py` was checked against the authors' code: reward is clean minus perturbed loss per token, centered across draws (except with a single draw), divided by $$\sigma$$.
- Sources:
  - Samip Dahal, Bishwas Mandal, Serdar Gülbahar, Akshay Vegesna. [Dust: Pretraining Transformers Without Backpropagation](https://qlabs.sh/research/dust) ([appendix](https://qlabs.sh/research/dust/appendix.html), [code](https://github.com/qlabs-eng/dust)). Q Labs, October 2026.
  - Rumelhart, Hinton, Williams. Learning representations by back-propagating errors. Nature 323, 1986.
  - Widrow and Lehr. [30 years of adaptive neural networks: Perceptron, Madaline, and backpropagation](https://doi.org/10.1109/5.58323). Proc. IEEE, 1990.
  - Salimans et al. [Evolution strategies as a scalable alternative to reinforcement learning](https://arxiv.org/abs/1703.03864), 2017.
  - Sarkar et al. [Evolution strategies at the hyperscale (EGGROLL)](https://arxiv.org/abs/2511.16652), 2025.
  - Sutton. [The bitter lesson](http://www.incompleteideas.net/IncIdeas/BitterLesson.html), 2019.

</details>
