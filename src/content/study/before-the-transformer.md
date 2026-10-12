---
title: 'Why Did It Take 66 Years to Get From Shannon to Attention?'
description: 'The history of language models before transformers, from n-grams and RNNs to LSTM, seq2seq and attention, with each paper''s real numbers and derivations.'
module: M1
date: '2026-10-12'
hook:
  stat: '1.0 → 0.005'
  caption: 'the learning signal left after 50 steps back through a recurrent network'
pdf: /study/pdf/ch1-before-the-transformer.pdf
tags: [language-models, rnn, lstm, attention, history-of-ai]
---

<aside class="tldr">

**TL;DR** Every language model ever built plays one guessing game: what comes next? For 66 years the hard part wasn't the game, it was the plumbing. Each model in this chapter fixed the leak in the one before it, and the leak always had the same shape: information had to travel too far, one step at a time. Attention made the trip one step long. That's the whole story. The details are where it gets good.

</aside>

In 1951 Claude Shannon ran an experiment with no computer in it. He showed people the start of a sentence and asked them to guess the next letter, again and again, and counted how often they were wrong[^shannon51]. From those guesses he estimated that printed English carries roughly 0.6 to 1.3 bits per letter when the reader can see a long stretch of text before it.

That experiment is a language model. A person is the model, the next letter is the prediction, and the wrong guesses are the loss. GPT plays exactly the same game, on tokens instead of letters.

So why did it take until 2014 for attention, and 2017 for the transformer? Poke this first. It's the one mechanism the whole chapter is about.

<div data-lab="vanish"></div>

Leave it on **RNN, tanh** and press **+** on distance. The signal reaching the early token fades to nothing. Switch to **LSTM cell** and it survives much longer. Switch to **Attention** and the distance stops mattering: the trip is one hop, however far back the token is. Hold onto that picture; every section below is one rung on the way to it.

```fig title="Each model fixed the break in the one before it, and the last break was 'one step at a time'" alt="A vertical ladder of seven boxes, top to bottom: n-gram counting (Shannon 1948, Kneser-Ney 1995); neural language model (Bengio 2003); recurrent network (Elman 1990, Mikolov 2010); LSTM and GRU (1997, 2000, 2014); sequence to sequence (2014); attention (Bahdanau 2014, Luong 2015); the transformer (2017). Each arrow down is labelled with what broke: no notion of similar words; a fixed window of a few words; gradients vanish over long spans; still one step at a time; the whole input squeezed into one vector; still riding on a recurrent network."
panel the ladder, 1948 to 2017
row
ng: box "n-gram counting\n1948, Kneser-Ney 1995" span 3
row
nn: worker "neural language model\nBengio 2003" span 3
row
rnn: worker "recurrent network\nElman 1990, Mikolov 2010" span 3
row
lstm: worker "LSTM and GRU\n1997, 2000, 2014" span 3
row
s2s: worker "sequence to sequence\n2014" span 3
row
att: main "attention\nBahdanau 2014, Luong 2015" span 3
row
tf: allow "the transformer, 2017\n(next chapter)" span 3
ng -> nn "no notion of similar words" lost
nn -> rnn "fixed window of n-1 words" lost
rnn -> lstm "gradients vanish over long spans" lost
lstm -> s2s "still one step at a time" lost
s2s -> att "whole input in one vector" lost
att -> tf "still riding on an RNN" lost
```

<details class="step" data-kind="hint">
<summary>Before you start: what to know, and the notation</summary>

You need matrix multiplication, the chain rule for derivatives, and what a probability distribution is. If any of those is shaky, chapters 2, 5 and 6 of *Mathematics for Machine Learning* cover them, free at [mml-book.github.io](https://mml-book.github.io/).

| Symbol | Meaning |
|---|---|
| $$\mathcal V$$, $$\lvert\mathcal V\rvert$$ | the vocabulary and its size |
| $$w_{1:T}$$ | a token sequence $$w_1,\dots,w_T$$ |
| $$x_t$$, $$h_t$$ | input vector and hidden state at step $$t$$ |
| $$W, U, V$$ | weight matrices (shapes given where they appear) |
| $$\sigma(z) = 1/(1+e^{-z})$$ | the sigmoid; its slope is at most $$1/4$$ |
| $$\odot$$ | elementwise product |
| $$\log$$ | natural log unless written $$\log_2$$ |

</details>

## The game is the chain rule

A language model gives a probability to every sequence of tokens. That sounds impossible, since there are infinitely many sequences, until you notice the chain rule of probability, which is exact:

$$
P(w_{1:T}) = \prod_{t=1}^{T} P(w_t \mid w_{1:t-1})
$$

So "model all of language" is the same problem as "predict the next token from the past". Every model in this chapter, and every LLM since, computes the right-hand side. They differ only in **how they squeeze the past into something a function can read**. Keep that sentence; it's the axis of the whole chapter.

How good is a model? Score it on text it hasn't seen. The average negative log-probability it gave the true next tokens is its **cross-entropy**, and $$e$$ raised to that is its **perplexity**:

$$
\mathcal L = -\frac{1}{N}\sum_{t=1}^{N}\log q(w_t\mid w_{1:t-1}),\qquad \mathrm{PPL} = e^{\mathcal L}
$$

Perplexity has a friendly meaning: a model with perplexity 109 is as unsure, on average, as if it were picking uniformly among 109 words. Bengio's 2003 model scored 109 on AP News[^bengio]. That's $$\log_2 109 \approx 6.8$$ bits per word. A model that knows nothing scores the vocabulary size.

> **Insight:** Cross-entropy splits as $$H(p,q) = H(p) + D_{\mathrm{KL}}(p\,\|\,q)$$. The first term is how unpredictable language itself is, and no model can beat it; the second is how far your model is from the truth. Training only ever shrinks the second term.

<details class="step" data-kind="proof">
<summary>The one gradient you need: softmax plus cross-entropy</summary>

Every model here ends with logits $$z\in\mathbb R^{\lvert\mathcal V\rvert}$$, a softmax $$p=\mathrm{softmax}(z)$$, and the loss $$\ell = -\log p_y$$ for the true token $$y$$. Write the loss out:

$$
\ell = -z_y + \log\sum_j e^{z_j}
$$

and differentiate:

$$
\frac{\partial \ell}{\partial z_i} = -\mathbb 1[i=y] + \frac{e^{z_i}}{\sum_j e^{z_j}} = p_i - \mathbb 1[i=y]
$$

"What you predicted minus what was true." Every entry lies in $$[-1,1]$$ and they sum to zero, which is part of why this loss trains so stably. If the output layer is $$z = W_o h$$, the weight gradient is $$(p - e_y)\,h^\top$$: a rank-one update that touches **every row** of $$W_o$$, one per word in the vocabulary.

</details>

That last fact matters more than it looks. Producing $$p$$ needs all $$\lvert\mathcal V\rvert$$ logits: $$\lvert\mathcal V\rvert \times n$$ multiply-adds per token. With 80,000 words and $$n = 1000$$ that's 80 million per predicted token. Until about 2016, **the vocabulary was the expensive part of language modelling**, and you'll see that number come back in every section.

## Counting got to 67.6, then stopped

The oldest way to predict the next word: forget most of the past. Keep only the last $$n-1$$ words and count.

$$
P(w_t\mid w_{1:t-1}) \approx P(w_t\mid w_{t-n+1:t-1}) \approx \frac{c(w_{t-n+1:t-1},\,w_t)}{c(w_{t-n+1:t-1})}
$$

Try it on a corpus of three sentences: *the cat sat. the dog sat. the cat ran.* The bigram *dog ran* never appears, so the perfectly sensible sentence *the dog ran* gets probability $$\tfrac13 \times 0 = 0$$. Its log-probability is $$-\infty$$ and the test perplexity is infinite. One unseen pair breaks the whole evaluation.

Smoothing patches the zeros. The patch that won was **Kneser-Ney** (1995): subtract a small discount from every seen count, and give the freed probability to words in proportion to **how many different contexts they finish**, not how often they occur[^kn]. The classic example is *Francisco*: frequent, but almost always after *San*, so it shouldn't be a good guess after anything else.

<details class="step" data-kind="proof">
<summary>Kneser-Ney on the three-sentence corpus, by hand</summary>

Interpolated Kneser-Ney for bigrams, with discount $$D\in(0,1)$$:

$$
P_{\mathrm{KN}}(w\mid v) = \frac{\max(c(v,w)-D,\,0)}{c(v)} + \lambda(v)\,P_{\mathrm{cont}}(w),\quad
\lambda(v) = \frac{D\cdot N_{1+}(v\,\bullet)}{c(v)},\quad
P_{\mathrm{cont}}(w) = \frac{N_{1+}(\bullet\,w)}{N_{1+}(\bullet\,\bullet)}
$$

$$N_{1+}(v\,\bullet)$$ counts distinct words seen after $$v$$; $$N_{1+}(\bullet\,w)$$ counts distinct words seen before $$w$$. With $$D = 0.75$$ and the period as a token, the corpus has 8 distinct bigrams. *dog* is followed once, by one distinct word, so $$\lambda(\text{dog}) = 0.75$$. *ran* follows one distinct word, *sat* follows two:

$$
P(\text{ran}\mid\text{dog}) = 0 + 0.75\cdot\tfrac18 = 0.09375,\qquad
P(\text{sat}\mid\text{dog}) = \tfrac{1-0.75}{1} + 0.75\cdot\tfrac28 = 0.4375
$$

No more zero, and the whole distribution still sums to 1 (the lab below checks it).

</details>

Counting scales in data almost for free: by 2013 it was possible to train n-grams on "virtually all available data (trillions of words)", as Mikolov et al. put it, citing Brants et al.'s work on machine translation[^w2v][^brants]. On the One Billion Word benchmark, a Kneser-Ney 5-gram with **1.1 billion n-grams** reaches perplexity **67.6**[^joz]. What it can't do is generalise. To an n-gram, *cat* and *dog* are two unrelated integers. Seeing *the cat sat* a thousand times tells it nothing about *the dog sat*.

Bengio et al. put the size of the problem in one line: the joint distribution of 10 consecutive words from a 100,000-word vocabulary has potentially $$100{,}000^{10} - 1 = 10^{50} - 1$$ free parameters[^bengio]. No corpus will ever fill that table. Any model that wants to generalise has to share strength between similar contexts, which means it needs a notion of *similar*.

## 2003: words become points

Bengio, Ducharme, Vincent and Jauvin made the move everything since depends on[^bengio]. Give every word a learned vector. Feed the vectors of the last few words into a small neural network. Predict the next word with a softmax. Learn the vectors and the network together.

```fig title="Bengio 2003: four word vectors in, one probability per word out, and the output layer does almost all the work" alt="Four boxes in a row at the top: the previous four words, each looked up in a shared table C to give a 30-number vector. They are concatenated into one 120-number vector x, which feeds a hidden layer tanh(d + Hx) of 100 units. That feeds the output layer y = b + Wx + U a with one score per vocabulary word, 16,383 of them, marked as 99 percent of the arithmetic. A softmax turns the scores into probabilities."
panel Bengio et al. 2003, Brown corpus setup
row
w1: peer "t-4"
w2: peer "t-3"
w3: peer "t-2"
w4: peer "t-1"
row
x: shared "look up in C\n4 x 30 = 120" span 4
row
hd: worker "100 hidden units\ntanh(d + Hx)" span 4
row
out: deny "16,383 scores\n99.3% of the work" span 4
row
p: box "softmax: P(next)" span 4
w1 -> x
w2 -> x
w3 -> x
w4 -> x
x -> hd
hd -> out
out -> p
```

$$
y = b + Wx + U\tanh(d + Hx),\qquad P(w_t = i\mid\cdot) = \mathrm{softmax}(y)_i
$$

Why does this generalise? If *cat* and *dog* end up with nearby vectors, because they show up in similar contexts, then *the dog ran* produces nearly the same input as *the cat ran*, and a smooth network gives nearly the same output. The n-gram had to see each exact string. The neural model only has to see each **region** of vector space.

It beat the best n-grams: test perplexity **252 vs 312** on the Brown corpus (24% lower) and **109 vs 117** on AP News (8% lower), against modified Kneser-Ney and class-based models[^bengio].

Now count where the work goes. In the Brown setup (4 context words, 30 numbers each, 100 hidden units, 16,383 words) the hidden layer costs 12,000 multiply-adds per word. The output layer costs 1,638,300. **The output layer is 99.3% of the arithmetic.** The "neural" part is tiny; the vocabulary is the model.

<div data-lab="py" data-src="/labs/first-principles/ch1_numbers.py" data-presets="--bengio|--lstm|--vanish|--bpe|--kn|--cache"></div>

### The first vocabulary-sharded softmax ran on 40 CPUs

Training on AP News took about three weeks for five passes over the data, on a cluster of 32 dual-CPU 1.2 GHz Athlon machines linked by Myrinet[^bengio]. Since the output layer was the cost, they split **the vocabulary** across CPUs: each owned a slice of the output words, every CPU redundantly computed the cheap hidden layer, and an MPI all-reduce combined the per-CPU partial sums of $$e^{y_j}$$ so the softmax could be normalised. Communication took about 1/15 of each epoch.

Sixteen years later Megatron-LM did the same thing on GPUs: split the output embedding along the vocabulary, and fuse the logits with the loss so only per-token numbers cross between GPUs, never the full $$\lvert\mathcal V\rvert$$-wide logit vector[^megatron]. Same bottleneck, same cut.

> **Insight:** Whenever one layer dwarfs the rest, parallelise along that layer's widest dimension and communicate the reduction, not the tensor. Bengio did it to a 16,383-word softmax in 2003.

One break remains: the window. Word $$t-n$$ can't affect the prediction at all, however relevant it is.

## A memory with no end, in theory

A **recurrent network** keeps one hidden state and updates it once per token:

$$
h_t = \phi(W_{hx}\,x_t + W_{hh}\,h_{t-1} + b),\qquad P(w_{t+1}\mid w_{1:t}) = \mathrm{softmax}(W_o h_t)
$$

The same weights run at every step, and $$h_t$$ depends, in principle, on every token since the start. Elman used this shape in 1990 to find structure in sequences[^elman]. Mikolov's 2010 RNN language model made it beat the counters: on Wall Street Journal text a single RNN reached perplexity **173 against 221** for a Kneser-Ney 5-gram trained on the same 6.4M words, and a mixture of RNNs that kept learning as it read the test text reached **128**, or **121** combined with the 5-gram[^mikolov10]. Speech recognition error on that task fell about 18%.

```fig title="Forward, information flows right one step at a time; backward, the error flows left through the same steps" alt="Three hidden states h1, h2, h3 in a row, linked by arrows labelled W_hh. Below h3, the loss at step 3. A red dashed loop-back line runs from the loss to h1, labelled 'back to step 1: 2 Jacobians'."
panel an RNN unrolled over three tokens
row
h1: worker "h1"
h2: worker "h2"
h3: worker "h3"
row
_ 2
l3: deny "loss at step 3"
h1 -> h2 "W_hh"
h2 -> h3 "W_hh"
h3 -> l3
l3 -> h1 "back to step 1: 2 Jacobians" lost via below
```

That loop-back arrow is the problem. To learn that token 1 mattered for the loss at token 3, or token 300, the error has to travel back through every step in between, and each step **multiplies** it by a Jacobian:

$$
\frac{\partial h_t}{\partial h_k} = \prod_{i=k+1}^{t} W_{rec}^\top\,\mathrm{diag}\big(\sigma'(h_{i-1})\big)
$$

If each factor has norm at most $$\eta < 1$$, the signal after $$t-k$$ steps is at most $$\eta^{\,t-k}$$: it vanishes exponentially. With $$\eta = 0.9$$, 50 steps leave $$0.9^{50} \approx 0.005$$. If the factors are bigger than 1, it explodes instead: $$1.1^{50} \approx 117$$. That's exactly what the simulator at the top draws.

<details class="step" data-kind="proof">
<summary>Why: the bound from Pascanu, Mikolov and Bengio (2013)</summary>

Take $$h_t = W_{rec}\,\sigma(h_{t-1}) + W_{in}x_t + b$$ and loss $$E = \sum_t E_t$$. By the chain rule,

$$
\frac{\partial E_t}{\partial \theta} = \sum_{k\le t}\frac{\partial E_t}{\partial h_t}\,\frac{\partial h_t}{\partial h_k}\,\frac{\partial^+ h_k}{\partial\theta}
$$

and $$\partial h_t/\partial h_k$$ is the product of $$t-k$$ Jacobians above. Suppose $$\lvert\sigma'\rvert \le \gamma$$: $$\gamma = 1$$ for $$\tanh$$, $$\gamma = 1/4$$ for the sigmoid. If the largest singular value of $$W_{rec}$$ is $$\lambda_1 < 1/\gamma$$, every factor has norm at most $$\eta = \lambda_1\gamma < 1$$, so

$$
\left\lVert \frac{\partial E_t}{\partial h_t}\frac{\partial h_t}{\partial h_k}\right\rVert \le \eta^{\,t-k}\left\lVert\frac{\partial E_t}{\partial h_t}\right\rVert \to 0
$$

exponentially in $$t-k$$. Reverse the argument and $$\lambda_1 > 1/\gamma$$ is **necessary** for explosion[^pascanu]. Note the sigmoid: even $$\lambda_1$$ just under 4 guarantees vanishing.

(The paper states the condition with the largest eigenvalue; the norm bound in its proof really needs the spectral norm. They coincide for symmetric matrices, and the eigenvalue form is exact in its linear analysis.)

</details>

The fix for explosion is blunt and still used everywhere: if the gradient's norm passes a threshold, scale it down to the threshold[^pascanu]. Sutskever et al. clipped at 5 in 2014; Megatron-LM clips global gradient norm at 1.0[^megatron]. Clipping does nothing for vanishing, though. For that, the architecture itself had to change.

## The LSTM's trick is a plus sign

Hochreiter and Schmidhuber's LSTM (1997) adds a memory cell whose self-connection has weight exactly 1, the "constant error carousel", with small gates deciding what to write and read[^lstm]. The forget gate that lets the cell reset came three years later[^gers], and that version is what everyone now means by "LSTM":

$$
\begin{aligned}
i_t &= \sigma(W_i x_t + U_i h_{t-1} + b_i), \quad f_t = \sigma(W_f x_t + U_f h_{t-1} + b_f), \quad o_t = \sigma(W_o x_t + U_o h_{t-1} + b_o)\\
g_t &= \tanh(W_g x_t + U_g h_{t-1} + b_g)\\
c_t &= f_t \odot c_{t-1} + i_t \odot g_t\\
h_t &= o_t \odot \tanh(c_t)
\end{aligned}
$$

Look at the cell line: $$c_t = f_t\odot c_{t-1} + \dots$$. Backwards along it,

$$
\frac{\partial c_t}{\partial c_k} = \prod_{i=k+1}^{t}\mathrm{diag}(f_i)
$$

No weight matrix, no squashing slope. When the network sets $$f\approx 1$$, the factor is about 1 and the signal survives. In the simulator, **LSTM cell** with $$f = 0.99$$ keeps 0.61 of the signal after 50 steps, where a tanh RNN with $$\eta = 0.9$$ keeps 0.005. And the network *chooses* that per unit, per step.

> **Insight:** The LSTM didn't make memory longer by making it smarter. It made the update additive, so the backward pass multiplies gate values instead of weight matrices. Residual connections, $$x + F(x)$$, are the same trick, and every transformer block has two.

<details class="step" data-kind="idea">
<summary>The GRU: the same idea with two gates</summary>

Cho et al. (2014) folded the cell into the state[^cho]. Per unit $$j$$:

$$
r_j = \sigma([W_r x]_j + [U_r h_{t-1}]_j),\quad z_j = \sigma([W_z x]_j + [U_z h_{t-1}]_j)
$$

$$
\tilde h_j = \tanh([Wx]_j + [U(r\odot h_{t-1})]_j),\qquad h_{t,j} = z_j h_{t-1,j} + (1-z_j)\tilde h_j
$$

When $$z_j\approx 1$$ the unit copies its old value: the same additive escape route. It has three weight blocks instead of four, so $$3(nd + n^2 + n)$$ parameters, exactly 3/4 of an LSTM layer. Careful when reading papers: Bahdanau et al. write the same unit with $$z$$ and $$1-z$$ swapped.

</details>

Gating fixed learning. It didn't fix scheduling. Step $$t$$ still waits for step $$t-1$$, so a sequence is $$T$$ dependent small matrix products, each reading all of the recurrent weights from memory to do very little arithmetic. Appleyard, Kočiský and Blunsom measured a naive LSTM forward pass (hidden size 512, batch 64) on an NVIDIA M40 at about **0.4 TFLOPS against a peak of about 5.8**: under 10%[^appleyard]. Six tricks, from fusing the four gate matrices into one to running the layers as a diagonal wavefront, bought an 11.1x speedup, and shipped in cuDNN. Every one of those tricks is about finding parallelism the recurrence hides.

There's also a practical limit on how far back an LSTM really looks. Khandelwal et al. measured LSTM language models using about **200 tokens** of context, with word order mattering only in the last 50 or so[^khandelwal].

## word2vec: drop the network, add a billion words

By 2013 everyone agreed word vectors were useful, and training them meant training a whole language model. Mikolov, Chen, Corrado and Dean asked the opposite question: what's the **cheapest** model that still learns good vectors[^w2v]? Their answer removed the hidden layer entirely. CBOW predicts a word from the average of its neighbours' vectors; Skip-gram predicts the neighbours from the word. A Huffman-coded binary tree replaced the softmax, so each prediction costs about $$\log_2\lvert\mathcal V\rvert$$ decisions instead of $$\lvert\mathcal V\rvert$$.

The payoff was scale. On an analogy test ("*big* is to *biggest* as *small* is to ?", answered by the vector nearest to $$v_{\text{biggest}} - v_{\text{big}} + v_{\text{small}}$$), a 1000-dimensional Skip-gram trained on 6B words of Google News scored **65.6%** in 2.5 days on 125 CPU cores, while a 100-dimensional neural LM took 14 days on 180 cores to reach **50.8%**[^w2v]. The follow-up replaced the tree with **negative sampling**: score the true (word, context) pair high and $$k$$ random pairs low, with noise drawn from word frequency raised to the $$3/4$$ power[^w2v2].

<details class="step" data-kind="idea">
<summary>What word2vec is secretly computing</summary>

Levy and Goldberg showed that Skip-gram with negative sampling implicitly factorises a word-by-context matrix whose entries are the pointwise mutual information $$\mathrm{PMI}(w,c) = \log\frac{P(w,c)}{P(w)P(c)}$$, shifted by $$\log k$$[^levy]. So it's a very fast low-rank factorisation of co-occurrence counts: the bridge between the counting of the n-gram section and the neural models after it.

</details>

The break: one vector per word. *bank* gets the same vector next to *river* and next to *loan*. The fix is to compute a word's representation from its sentence every time, which is what encoders do next.

## Sequence to sequence: a whole sentence in 8,000 numbers

Translation needs $$P(y\mid x)$$, a language model over the target sentence that also sees the source. In 2014 two groups built it from two RNNs: an **encoder** reads the source into a vector, and a **decoder**, an RNN language model, writes the translation from that vector[^cho][^sutskever]. Kalchbrenner and Blunsom had mapped a sentence to a vector and back a year earlier with a convolutional encoder[^kalch].

```fig title="Everything the decoder knows about the source passes through one fixed-size vector" alt="Three rows. Top: the encoder reads the source words C, B, A (the source reversed). Middle: a red box, v, 8,000 numbers, the only bridge. Bottom: the decoder starts from v and writes W, X, Y, each step feeding the next."
panel encoder, then one vector, then decoder
row
c: peer "C"
b: peer "B"
a: peer "A"
row
v: deny "v: 8,000 numbers\nthe only bridge" span 3
row
d1: worker "W"
d2: worker "X"
d3: worker "Y"
c -> b
b -> a
a -> v
v -> d1 "start from v"
d1 -> d2
d2 -> d3
```

Sutskever, Vinyals and Le used two 4-layer LSTMs with 1000 cells per layer, a 160,000-word source vocabulary and an 80,000-word target vocabulary, and report **384M parameters, 64M of them recurrent**[^sutskever]. Rebuild that from the config and it matches to the decimal, which also shows where the parameters sit:

| Part | Parameters |
|---|---|
| source embeddings, 160,000 x 1000 | 160.0M |
| target embeddings, 80,000 x 1000 | 80.0M |
| encoder LSTM, 4 layers x 4(1000·1000 + 1000² + 1000) | 32.0M |
| decoder LSTM, same | 32.0M |
| output softmax, 80,000 x 1000 + bias | 80.1M |
| **total** | **384.1M** |

**83% of the model is vocabulary-sized tables.** The sentence itself is held in 4 layers x ($$h$$ and $$c$$) x 1000 = **8,000 numbers**, a figure the paper states too. An ensemble of five reached **34.81 BLEU** on WMT'14 English to French against **33.30** for the phrase-based baseline: the first time a pure neural system beat statistical MT on a large task.

Their strangest trick: **read the source backwards**. Test perplexity fell from 5.8 to 4.7 and BLEU rose from 25.9 to 30.6, from reversing the input and nothing else. The average distance between a word and its translation doesn't change, but the *first* words of each sentence end up next to each other, so the gradient finds a short path for them and learning bootstraps from there. In the simulator's terms: reversal shortened the trip for a few tokens. Attention would shorten it for all of them.

<details class="step" data-kind="check">
<summary>How they trained it: the first big model-parallel LSTM</summary>

One GPU ran at about 1,700 words per second, too slow. So they used an 8-GPU machine[^sutskever]:

- **4 GPUs, one LSTM layer each.** Each passed its activations to the next as soon as they were ready, so layer 2 worked on step $$t$$ while layer 1 worked on step $$t+1$$. That's pipeline parallelism, years before GPipe.
- **4 GPUs for the softmax,** each multiplying by a 1000 x 20,000 slice of the 80,000-word output matrix. Vocabulary sharding again, as in Bengio's cluster.

Result: 6,300 words per second at batch 128, about ten days per model. Bucketing sentences by length, so a batch isn't mostly padding, gave another 2x. Per generated token the four LSTM layers cost 32M multiply-adds and the softmax 80M, which is why the softmax got half the GPUs.

</details>

The break is in the picture: every source sentence, 5 words or 80, squeezed into the same 8,000 numbers, read by the decoder at every step no matter which word it's translating. Cho et al. found their encoder-decoder's quality fell quickly as sentences got longer[^cho2]. What the decoder needs, when it writes word $$i$$, is the **part** of the source that word is about. So let it look.

## Attention: let the decoder look back

Bahdanau, Cho and Bengio kept one vector per source word instead of one per sentence[^bahdanau]. A bidirectional RNN produces an annotation $$h_j$$ for each source word $$j$$, summarising the sentence with a focus around $$j$$. Then, for each target word $$i$$, the decoder scores every annotation, turns the scores into weights, and takes the weighted average:

$$
e_{ij} = v_a^\top\tanh(W_a s_{i-1} + U_a h_j),\qquad
\alpha_{ij} = \frac{e^{e_{ij}}}{\sum_k e^{e_{ik}}},\qquad
c_i = \sum_j \alpha_{ij}\,h_j
$$

$$\alpha_{ij}$$ reads as "the probability that target word $$i$$ is a translation of source word $$j$$", and $$c_i$$ is the expected annotation. Everything is differentiable, so the alignment isn't a hidden variable to infer, as in statistical MT; it learns from the translation loss directly.

```fig title="Writing 'zone', the decoder puts most of its weight on 'Area', two words to the right" alt="Top row: the decoder state s(i-1), the context vector c(i), and the new state s(i) that writes the French word zone. Bottom row: the source annotations for European, Economic and Area, each with an arrow up to the context labelled with its attention weight: 0.08, 0.06 and 0.86. The weights are illustrative."
panel one decoding step (weights illustrative)
row
s: main "s(i-1)"
ci: shared "c(i)"
si: main "s(i): 'zone'"
row
h2: peer "European"
h3: peer "Economic"
h4: peer "Area"
h2 -> ci "0.08" muted
h3 -> ci "0.06" muted
h4 -> ci "0.86" good
s -> ci "score each" dashed
ci -> si
```

The paper's own example: *European Economic Area* becomes *zone économique européenne*. The model aligned *zone* with *Area*, jumping over two words, then stepped back one word at a time[^bahdanau]. Word order flipped and nothing broke.

| Model (WMT'14 En→Fr) | BLEU, all sentences | BLEU, no unknown words |
|---|---|---|
| encoder-decoder, trained on ≤50 words | 17.82 | 26.71 |
| attention, trained on ≤50 words | 26.75 | 34.16 |
| attention, trained longer | **28.45** | **36.15** |
| Moses, phrase-based (plus 418M extra words) | 33.30 | 35.63 |

On sentences with no unknown words, attention beat the phrase-based system that had extra data[^bahdanau]. And in the paper's length plot, the encoder-decoder falls apart on long sentences while the attention model trained on 50-word sentences shows no drop past 50 words.

### The first KV cache is a footnote in this paper

The alignment network must run for every (source, target) pair, $$T_x \times T_y$$ times per sentence. Appendix A notes that $$U_a h_j$$ doesn't depend on $$i$$, so it can be computed once and kept[^bahdanau]. For a 30-word sentence translated into 30 words with $$n' = 1000$$, that's **60M multiply-adds instead of 1.8G**, 30x less. Compute each position's projection once, store it, and only project the new query at each step: replace "source position" with "every previous token" and that's the KV cache that dominates GPU memory in LLM serving today. The paper also flags the cost it can't remove: attention costs $$O(T_x)$$ per output word, so $$O(T_x T_y)$$ per sentence, fine for 15 to 40 words and a possible problem beyond.

### Luong: simpler, and the dot product

Luong, Pham and Manning simplified the recipe a year later[^luong]: use the decoder's current top-layer state $$h_t$$ as the query, try three scores, and feed the attention output into the next step.

$$
\mathrm{score}(h_t,\bar h_s) = h_t^\top\bar h_s \;\;(\textit{dot}),\qquad h_t^\top W_a\bar h_s\;\;(\textit{general}),\qquad v_a^\top\tanh(W_a[h_t;\bar h_s])\;\;(\textit{concat})
$$

Attention plus input feeding plus a local window added **5.0 BLEU** over a non-attention model that already used reversal and dropout, and an ensemble set a new record of **25.9 BLEU** on WMT'15 English to German[^luong].

Now factor the *general* score: $$W_a = W_Q^\top W_K$$, so

$$
h_t^\top W_a\,\bar h_s = (W_Q h_t)^\top(W_K \bar h_s) = q_t^\top k_s
$$

That's a **query** (what this step is looking for) against a **key** (what each source position offers), weighting **values** (what gets averaged). One more detail the next chapter needs: if $$q$$ and $$k$$ have $$d$$ independent coordinates of variance 1, then $$\mathrm{Var}(q^\top k) = d$$. At $$d = 512$$ typical scores are about $$\pm 22$$, the softmax collapses onto one position, and gradients to the others vanish. Divide by $$\sqrt d$$ and the variance is 1 again: the $$\sqrt{d_k}$$ in "scaled dot-product attention" is exactly this footnote of the transformer paper[^vaswani].

## Why the transformer won

Attention fixed the bridge: every target word now had a one-step path to every source word. But inside the encoder, two words $$k$$ apart were still $$k$$ recurrent steps apart, and training still walked the sequence one step at a time. Vaswani et al. asked the obvious next question: if attention gives a path of length 1 across the bridge, why not use it *within* each sequence too, and delete the recurrence[^vaswani]?

| Layer | Work per layer | Sequential steps | Longest path between two tokens |
|---|---|---|---|
| Recurrent | $$O(n\cdot d^2)$$ | $$O(n)$$ | $$O(n)$$ |
| Convolutional, kernel $$k$$ | $$O(k\cdot n\cdot d^2)$$ | $$O(1)$$ | $$O(\log_k n)$$ |
| Self-attention | $$O(n^2\cdot d)$$ | $$O(1)$$ | $$O(1)$$ |

That table is Table 1 of the transformer paper[^vaswani], and it holds the two quantities this whole chapter has been tracking. **Path length** decides how far a learning signal must travel (the simulator). **Sequential steps** decide whether a GPU can work on every token at once (the 0.4 of 5.8 TFLOPS). Self-attention makes both constant and pays with $$n^2$$ pairwise scores. When $$n < d$$, as in 30-word sentences with 1000-wide vectors, it's even cheaper per layer than recurrence. The $$n^2$$ only bites at long contexts, which is a problem for later chapters.

> **Insight:** The transformer didn't win because recurrent networks modelled language badly. It won because it turned the same job into big independent matrix multiplies that fill a GPU, and gave every pair of tokens a one-hop path. The hardware and the gradients both wanted it.

### Two loose ends

**The vocabulary itself.** Every model above cut its vocabulary at 16k to 160k words and mapped the rest to *unknown*. Sennrich, Haddow and Birch borrowed **byte pair encoding**, a 1994 compression trick, to build words from frequent pieces[^bpe][^gage]. Start from characters, repeatedly merge the most frequent adjacent pair. Running the paper's own code on its toy dictionary (*low* x5, *lower* x2, *newest* x6, *widest* x3), the first merges are *e+s*, *es+t* and *est+&lt;/w&gt;*, so an unseen word like *lowest* splits into *low* + *est*. On their German data, BPE needed only 12% more tokens than whole words, with a vocabulary 28x smaller and zero unknown words. Your LLM's tokenizer is this, with more merges and bytes as the starting alphabet.

**The peak of recurrence.** In 2016 Jozefowicz et al. pushed LSTM language models to their limit on the One Billion Word benchmark: perplexity **30.0** for a single model against **51.3** before, and **23.7** for an ensemble[^joz]. Of the best model's 1.04B parameters, **820M were the softmax**. The best results took three weeks on 32 GPUs, and the paper's conclusion fits on a sticker: size matters. One of its authors, Noam Shazeer, is also an author of the transformer paper and of the 2017 mixture-of-experts layer this path reaches in Module 6.

## What carries into the next chapter

| From this chapter | Becomes, in the transformer |
|---|---|
| chain rule, cross-entropy, perplexity | the training objective, unchanged |
| embedding table | token embeddings, often tied to the output layer |
| vocabulary-sharded softmax | vocab-parallel `lm_head` and loss |
| the LSTM's additive cell | residual connections $$x + F(x)$$ |
| encoder-decoder | the original transformer; LLMs keep only the decoder |
| $$q^\top k$$, softmax, weighted sum of values | scaled dot-product, multi-head self-attention |
| precomputed $$U_a h_j$$ | the KV cache |
| BPE | the tokenizer |
| layer pipeline, vocab-sharded GPUs | pipeline and tensor parallelism |

## Check yourself

Answer from memory first. Each answer is one click away, and every number in them comes out of the lab above.

<details class="step" data-kind="check">
<summary>1. A model gives probabilities 1/2, 1/4 and 1/8 to three correct tokens. Perplexity?</summary>

Average NLL $$= (\ln 2 + \ln 4 + \ln 8)/3 = 2\ln 2 \approx 1.386$$ nats, which is 2 bits. Perplexity $$= e^{2\ln 2} = 4$$.

</details>

<details class="step" data-kind="check">
<summary>2. A tanh RNN has per-step factor 0.95. How many steps until the signal falls below 1/1000?</summary>

Need $$0.95^L < 10^{-3}$$, so $$L > \ln 10^{-3}/\ln 0.95 \approx 134.7$$: **135 steps**. After 100 steps it's already $$0.0059$$.

</details>

<details class="step" data-kind="check">
<summary>3. Per generated token in Sutskever's decoder: LSTM layers vs softmax?</summary>

LSTM: $$4 \times 4 \times 1000 \times (1000 + 1000) = 32$$M multiply-adds. Softmax: $$80{,}000 \times 1000 = 80$$M. The softmax is 2.5x all four layers together.

</details>

<details class="step" data-kind="check">
<summary>4. Why does dividing attention scores by the square root of d fix training?</summary>

$$q^\top k = \sum_{i=1}^{d} q_i k_i$$ is a sum of $$d$$ independent terms of variance 1, so its variance is $$d$$. Large scores push the softmax onto a single position, where gradients to all other positions are nearly zero. Dividing by $$\sqrt d$$ brings the variance back to 1.

</details>

<details class="step" data-kind="check">
<summary>5. In a bidirectional RNN encoder, what's the longest path between two words?</summary>

$$\lvert i-j\rvert$$ recurrent steps, up to $$T-1$$. The backward direction gives a second route, not a shorter one. One self-attention layer: 1 step for every pair.

</details>

<details class="step" data-kind="check">
<summary>6. An LSTM step with hidden 512, input 512 and batch 64 took 777 µs on an M40. Utilisation?</summary>

FLOPs $$= 2 \times 64 \times (4\cdot 512) \times (512 + 512) \approx 268$$M. In 777 µs that's about 0.35 TFLOPS, roughly **6%** of the M40's 5.8. The time went to kernel launches, small GEMMs that can't fill the chip, and pointwise results round-tripping to memory[^appleyard].

</details>

## Try it

Every computed number in this chapter comes from one file. Run it in the lab above, or on your own machine:

```zsh
curl -O https://samadeep.github.io/labs/first-principles/ch1_numbers.py
python3 ch1_numbers.py --lstm      # rebuild Sutskever's 384M parameters
python3 ch1_numbers.py --vanish    # how much signal survives k steps back
python3 ch1_numbers.py --bpe       # the BPE paper's own merges
```

The typeset edition, with all thirteen exercises, the full derivations and the paper-by-paper worked numbers, is the [PDF of this chapter](/study/pdf/ch1-before-the-transformer.pdf).

<details>
<summary>Limits of this chapter</summary>

- The simulator draws the **bounds** from Pascanu et al., one constant factor per step. Real Jacobians change from step to step, so real networks decay unevenly; the exponent is the point, not the exact curve.
- The attention weights in the *zone* figure are illustrative, chosen to match the alignment the paper describes, not read from the paper's heat map.
- BLEU numbers are only comparable within a table: different scripts give different BLEU for the same output (Sutskever et al. note the best WMT'14 system scores 37.0 with theirs and 35.8 as officially reported).
- Perplexities are only comparable with the same tokenisation; per-word and per-subword perplexities differ.
- Shannon's 0.6 to 1.3 bits per letter is a human-guessing estimate from 1951, not a measurement of any model.

</details>

[^shannon51]: Claude E. Shannon, *Prediction and Entropy of Printed English*, Bell System Technical Journal, 1951.
[^bengio]: Yoshua Bengio, Réjean Ducharme, Pascal Vincent, Christian Jauvin, [A Neural Probabilistic Language Model](https://www.jmlr.org/papers/volume3/bengio03a/bengio03a.pdf), JMLR, 2003 (Tables 1 and 2, sections 1, 3 and 4).
[^kn]: Reinhard Kneser, Hermann Ney, *Improved Backing-off for m-gram Language Modeling*, ICASSP, 1995; and Stanley Chen, Joshua Goodman, *An Empirical Study of Smoothing Techniques for Language Modeling*, Harvard TR-10-98, 1998.
[^brants]: Thorsten Brants, Ashok Popat, Peng Xu, Franz Och, Jeffrey Dean, *Large Language Models in Machine Translation*, EMNLP-CoNLL, 2007.
[^joz]: Rafal Jozefowicz, Oriol Vinyals, Mike Schuster, Noam Shazeer, Yonghui Wu, [Exploring the Limits of Language Modeling](https://arxiv.org/abs/1602.02410), 2016 (Tables 1 and 2, sections 4 and 5).
[^megatron]: Mohammad Shoeybi et al., [Megatron-LM: Training Multi-Billion Parameter Language Models Using Model Parallelism](https://arxiv.org/abs/1909.08053), NVIDIA, 2019 (section 3 and 4.2).
[^elman]: Jeffrey Elman, *Finding Structure in Time*, Cognitive Science, 1990.
[^mikolov10]: Tomáš Mikolov, Martin Karafiát, Lukáš Burget, Jan Černocký, Sanjeev Khudanpur, [Recurrent Neural Network Based Language Model](https://www.fit.vut.cz/research/group/speech/public/publi/2010/mikolov_interspeech2010_IS100722.pdf), Interspeech, 2010 (Table 2).
[^pascanu]: Razvan Pascanu, Tomas Mikolov, Yoshua Bengio, [On the Difficulty of Training Recurrent Neural Networks](https://arxiv.org/abs/1211.5063), ICML, 2013 (section 2.1, Algorithm 1).
[^lstm]: Sepp Hochreiter, Jürgen Schmidhuber, *Long Short-Term Memory*, Neural Computation, 1997.
[^gers]: Felix Gers, Jürgen Schmidhuber, Fred Cummins, *Learning to Forget: Continual Prediction with LSTM*, Neural Computation, 2000.
[^cho]: Kyunghyun Cho et al., [Learning Phrase Representations using RNN Encoder-Decoder for Statistical Machine Translation](https://arxiv.org/abs/1406.1078), EMNLP, 2014.
[^cho2]: Kyunghyun Cho, Bart van Merriënboer, Dzmitry Bahdanau, Yoshua Bengio, *On the Properties of Neural Machine Translation: Encoder-Decoder Approaches*, SSST-8, 2014.
[^appleyard]: Jeremy Appleyard, Tomáš Kočiský, Phil Blunsom, [Optimizing Performance of Recurrent Neural Networks on GPUs](https://arxiv.org/abs/1604.01946), 2016 (section 2 and Table 1).
[^khandelwal]: Urvashi Khandelwal, He He, Peng Qi, Dan Jurafsky, [Sharp Nearby, Fuzzy Far Away: How Neural Language Models Use Context](https://arxiv.org/abs/1805.04623), ACL, 2018.
[^w2v]: Tomas Mikolov, Kai Chen, Greg Corrado, Jeffrey Dean, [Efficient Estimation of Word Representations in Vector Space](https://arxiv.org/abs/1301.3781), 2013 (Tables 3 and 6).
[^w2v2]: Tomas Mikolov, Ilya Sutskever, Kai Chen, Greg Corrado, Jeffrey Dean, [Distributed Representations of Words and Phrases and their Compositionality](https://arxiv.org/abs/1310.4546), NIPS, 2013 (section 2.2).
[^levy]: Omer Levy, Yoav Goldberg, *Neural Word Embedding as Implicit Matrix Factorization*, NIPS, 2014.
[^sutskever]: Ilya Sutskever, Oriol Vinyals, Quoc Le, [Sequence to Sequence Learning with Neural Networks](https://arxiv.org/abs/1409.3215), NIPS, 2014 (sections 3.3 to 3.6, Tables 1 and 2).
[^kalch]: Nal Kalchbrenner, Phil Blunsom, *Recurrent Continuous Translation Models*, EMNLP, 2013.
[^bahdanau]: Dzmitry Bahdanau, Kyunghyun Cho, Yoshua Bengio, [Neural Machine Translation by Jointly Learning to Align and Translate](https://arxiv.org/abs/1409.0473), ICLR, 2015 (sections 3 to 5, Table 1, Appendix A).
[^luong]: Minh-Thang Luong, Hieu Pham, Christopher Manning, [Effective Approaches to Attention-based Neural Machine Translation](https://arxiv.org/abs/1508.04025), EMNLP, 2015 (section 3, Tables 1 and 2).
[^vaswani]: Ashish Vaswani et al., [Attention Is All You Need](https://arxiv.org/abs/1706.03762), NIPS, 2017 (section 3.2.1 and Table 1).
[^bpe]: Rico Sennrich, Barry Haddow, Alexandra Birch, [Neural Machine Translation of Rare Words with Subword Units](https://arxiv.org/abs/1508.07909), ACL, 2016 (Algorithm 1, Table 1).
[^gage]: Philip Gage, *A New Algorithm for Data Compression*, C Users Journal, 1994.
