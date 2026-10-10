---
title: 'How Optical Circuit Switches Work in AI Clusters'
description: 'Why AI GPUs wait on the network, how optical circuit switches keep data as light, and why Dipole Labs bets on sub-microsecond switching.'
hook:
  stat: '500 MB → 50 KB'
  caption: 'what one circuit must carry to stay lit half the time: a 10 ms mirror → a 1 µs one'
date: '2026-10-10'
topic: ai
series: under-the-hood
tags: [optical-circuit-switching, ai-infrastructure, datacenter-networking, mixture-of-experts, photonics]
---

<aside class="tldr">

**TL;DR** Google already runs its datacenters on mirrors that steer light, and those mirrors take milliseconds to move. That was fine, because Google barely moves them. A new startup wants mirrors a thousand times faster, for the traffic that can't sit still. The whole bet fits in one ratio: how long the light is on, divided by how long it's off.

</aside>

In August, Y Combinator's Jared Friedman introduced a startup called Dipole Labs with a surprising line: GPUs in a datacenter spend about half their time idle, waiting for data[^tweet]. Dipole's own launch page says the same thing about "the most expensive computers ever built"[^yc].

Half. On machines that cost tens of thousands of dollars each.

So where, exactly, does a GPU wait? And why would a mirror fix it? Play with this first. Pick **All-to-all**, leave the switch at 10 ms, and watch the meter. Then press **+** on the switch a few times.

<div data-lab="ocs"></div>

## Follow one byte out of a GPU

Start inside the package. An H100's memory moves **3,350 GB/s**[^h100]. Step out to the other GPUs in the same server and NVLink gives you **900 GB/s**, counting both directions[^h100]. Step out of the server and you're on a network port: **400 Gb/s**, which is 50 GB/s each way[^cx7].

<div data-lab="py" data-src="/labs/optical-switching/ocs_lab.py" data-presets="--ring|--alltoall|--dipole|--alltoall --relock 0.000002"></div>

```text
bandwidth one H100 GPU sees at each layer (per direction):

  HBM3 memory      3,350 GB/s  ########################################    baseline   on the package
  NVLink             450 GB/s  #####                                      7x slower   to GPUs in the same server
  network port        50 GB/s  #                                         67x slower   400 Gb/s, to every other server
```

```fig title="Each step away from the GPU is a narrower pipe, and the switches sit on the narrowest one" alt="One panel, three rows. Top row: HBM3 memory, 3,350 GB/s. An arrow labelled 7x narrower leads to the middle row: NVLink to GPUs in the same server, 450 GB/s each way. An arrow labelled 9x narrower leads to the bottom row, which has three boxes: the network port at 50 GB/s each way, then a switch (packet or optical), then any other server."
panel one GPU's way out
row
hbm: main "HBM3 memory\n3,350 GB/s" span 3
row
nv: worker "NVLink, same server\n450 GB/s each way" span 3
row
nic: peer "network port\n50 GB/s each way"
sw: ask "switch\npacket or optical"
far: peer "any other server"
hbm -> nv "7x narrower"
nv -> nic "9x narrower"
nic -> sw
sw -> far
```

Training a big model means thousands of GPUs swapping gradients and activations every step, and almost all of that crosses the bottom rung of [Fig. 1](#fig-1). That's where a GPU sits idle: it finished its math and is waiting for bytes from a server down the row. Everything else in this post happens on that rung.

## What a switch does to light

Between racks, data already travels as light in optical fiber. The surprise is what happens at each switch. A normal **electrical packet switch** turns the light back into electrons with a photodetector, decodes each packet's header, decides where it goes, and turns it back into light with a laser[^semi].

```fig title="A packet switch reads every packet; a circuit switch just points the light" alt="Two panels side by side. Packet switch: light in, then photodetector turns it into electrons, then the chip decodes the header, buffers and routes, then a laser turns it back into light out. Circuit switch: light in, then a mirror steers the beam with no decoding, then light out."
panel packet switch
row
pin: peer "light in"
row
oe: deny "photodetector\nlight → electrons"
row
asic: worker "decode header\nbuffer, route"
row
eo: deny "laser\nelectrons → light"
pin -> oe
oe -> asic
asic -> eo
panel circuit switch
row
cin: peer "light in"
row
mir: allow "mirror steers the beam\nnothing is decoded"
row
cout: peer "light out"
cin -> mir
mir -> cout
```

An **optical circuit switch** skips all of that. Google's version uses arrays of tiny MEMS mirrors that tilt to bounce a beam from any input fiber to any output fiber[^apollo]. No decoding means almost no added delay: light in fiber costs about 5 ns per metre, while an equivalent packet switch adds tens to hundreds of nanoseconds per hop[^apollo]. It also means almost no power. Google's Palomar switch, with 136 ports, draws at most **108 W**[^apollo].

And it doesn't care how fast the data is. The same mirrors carried 40, 100, 200 and then 400 Gb/s links across four generations of optics[^apollo]. You upgrade the transceivers and leave the switch alone.

So why isn't every switch a mirror?

## The catch: a mirror is a railroad switch

SemiAnalysis puts it well: an optical circuit switch is like a railroad switch[^semi]. A train can take only the track that's set. If the next train needs a different track, someone has to throw the lever, and nothing moves while they do.

For mirrors, throwing the lever is slow. Google's paper says commercial switches typically take **10 to 20 ms** to reconfigure, and describes its own as millisecond-scale[^apollo].

Search around and you'll find a much faster number. One long guide to Google's TPUs says the OCS reconfigures in "sub-10-nanosecond windows"[^introl]. That would be remarkable. It's also off by about a million: Google's own paper says milliseconds. The guide confused two numbers. Light crosses a switch that's already set in nanoseconds, but *changing* where it goes takes milliseconds. Keep those two numbers apart and the rest of this post falls into place.

## How Google got away with slow mirrors

Google didn't make switching fast. It made switching *rare*.

Its datacenter fabric, Jupiter, uses the mirrors to rewire which blocks connect to which as traffic shifts and as new hardware arrives. Google reported **5x** higher speed and capacity, **30%** less capital cost and **41%** less power than the fabric it replaced[^jupiter]. Its TPU v4 supercomputer uses the same switches to stitch 4,096 chips into the shape a job wants, and the optics are less than 5% of the system's cost and under 3% of its power[^tpuv4].

The trick is in the traffic. A classic training job averages gradients with a **ring all-reduce**: every GPU sends to the same neighbour, step after step, for the whole job. You set the circuits once and leave them.

```text
ring all-reduce of 2 GB over 64 GPUs at 400 Gb/s: 78.8 ms of light per step
every GPU talks to the same neighbour for the whole job, so the ring needs one set of circuits

  MEMS, commercial (10 ms)     rewire every step:  88.7% lit    rewire once per 10,000-step job: 99.9987% lit
  all-optical module (300 us)  rewire every step:  99.6% lit    rewire once per 10,000-step job: 100.0000% lit
  Dipole's target (1 us)       rewire every step: 100.0% lit    rewire once per 10,000-step job: 100.0000% lit
```

Switch once per job and a 10 ms mirror is dark for a rounding error. Try **Ring all-reduce** in the simulator: the mirrors move once, the meter creeps up with every round, and the counter tells you how many rounds it takes to bury that one switch. A real job runs thousands of steps, each one far longer than the simulator's 20 µs.

> **Insight:** A circuit switch is judged by one ratio: how long the light stays on between moves, divided by how long the move takes. Google won by making the numerator huge. Dipole wants to win by making the denominator tiny.

## The traffic that won't sit still

Not all traffic is a ring. **Mixture-of-experts** models send each token to a few "expert" sub-networks spread across GPUs, so every GPU needs to send to every other one, every layer. That's an **all-to-all**, and it's hard enough that DeepSeek built a whole library, DeepEP, just for those dispatch and combine steps[^deepep].

With one optical port per GPU, a GPU can reach only one peer per circuit. So an all-to-all among 64 GPUs becomes **63 rounds**, and the mirrors must move before every one:

```text
all-to-all among 64 GPUs, one 400 Gb/s port each: 63 rounds, the switch moves before each

            per-pair message     64 KB      1 MB     16 MB    256 MB
       (light on, per round)   1.28 us     20 us    320 us   5.12 ms
    MEMS, commercial (10 ms)      0.0%      0.2%      3.1%     33.9%
 all-optical module (300 us)      0.4%      6.3%     51.6%     94.5%
      Dipole's target (1 us)     56.1%     95.2%     99.7%    100.0%
```

Look at the 1 MB column. A 10 ms mirror keeps the light on **0.2%** of the time. A 1 µs switch keeps it on **95%**. The break-even point, where the light is on half the time, is the message size that takes as long to send as the switch takes to move:

```fig title="The faster the switch, the smaller the message that keeps a circuit busy" alt="A row of three boxes ordered from slower to faster switching. MEMS today, 10 ms, needs 500 MB per circuit to stay lit half the time. An all-optical module, 300 microseconds, needs 15 MB. Dipole's target, 1 microsecond, needs 50 KB. Below, a full-width box: a ring all-reduce switches once per job, so a long job hides even a 10 ms switch."
panel slower  →  faster switching
row
mems: deny "MEMS today\n10 ms\nbreak-even 500 MB"
mod: ask "all-optical module\n300 µs\nbreak-even 15 MB"
dip: allow "Dipole's target\n1 µs\nbreak-even 50 KB"
row
ring: box "a ring all-reduce switches once per job: a long job hides even 10 ms" span 3
mems -> mod
mod -> dip
```

That 300 µs middle box isn't hypothetical. Salience Labs publishes a 32-port all-optical switch module with under 300 µs reconfiguration[^salience]. Dipole is aiming three orders of magnitude lower: "sub-microsecond reconfiguration at large port counts"[^yc], plus a control layer that learns a job's communication pattern and moves the mirrors in step with it.

## What "10,000 GPUs behave like 12,500" asks for

Dipole's headline: a 10,000-GPU cluster could perform like a 12,500-GPU one[^yc]. Take their own premise, GPUs busy half the time, and do the arithmetic:

```text
10,000 GPUs busy 50% of the time do 5,000 GPUs' worth of work
to match 12,500 GPUs at 50% they must be busy 62.5% of the time  (+25% useful compute)
per training step: compute 1.0, waiting 1.0 -> 0.6  (step 2.00 -> 1.60, the network must hide 40% of the waiting)
```

So the claim needs the network to remove **40% of the waiting**. That's a lot, but not absurd if a big slice of the waiting is all-to-all traffic on circuits that are dark most of the time. Whether real clusters look like that depends on workload mix, which Dipole hasn't published. Its numbers are projections, not measurements[^rw].

## The same mirrors, holding atoms

Here's the clever part of the business. Friedman's post says Dipole isn't waiting for datacenters to qualify its hardware[^tweet]. Neutral-atom quantum computers hold individual atoms in beams of light, called optical tweezers, and move them around to run a computation[^lukin]. That takes fast, programmable steering of laser light: the same device. The post says Dipole already has over $1M in letters of intent from those customers[^tweet].

It's a smaller market, but a patient one, and it pays for the device while the datacenter version earns its way into a rack.

## What's still unproven

Moving a mirror is only half of switching. The receiver on the other end has to lock onto the new signal, and Google's paper names receiver initialization as one of the limits on faster switching[^apollo]. Add a 2 µs re-lock to every round and a 1 µs switch is really a 3 µs one:

```text
      Dipole's target (1 us)     29.9%     87.0%     99.1%     99.9%
```

What re-lock time Dipole's design will see isn't public; the 2 µs above is just a knob. Dipole also hasn't published port count, insertion loss, power or the switching mechanism[^rw]. Friedman's post describes "software-programmable mirrors" with no moving parts[^tweet], which would be a different device from Google's tilting MEMS mirrors, but there's no paper to check yet. Meanwhile nEye and Salience are building in the same space, and the Open Compute Project started an optical-switching effort in 2025 with Google, Microsoft and Nvidia in it[^rw].

## Back to the waiting GPU

A GPU waits because its fastest connection to the rest of the cluster is 67 times narrower than its memory, and every packet on that connection gets read, buffered and re-lit at each switch. Mirrors stop the re-lighting. Google proved they work, as long as the traffic sits still. Dipole's bet is that the traffic that matters most now doesn't, and that a mirror fast enough to keep up turns dark time back into compute.

Go back to the simulator, set the message to 1 MB, and step the switch from 10 ms down to 100 ns. That climb from 0.2% to 99% is the whole company.

## Try it

The simulator and the lab both run above, in your browser. On your own machine (standard library only):

```zsh
curl -O https://samadeep.github.io/labs/optical-switching/ocs_lab.py
python3 ocs_lab.py --alltoall               # 63 rounds, three switch speeds
python3 ocs_lab.py --alltoall --gpus 8      # a smaller group
python3 ocs_lab.py --dipole                 # the 12,500-GPU arithmetic
```

<details>
<summary>Limits of this post</summary>

- **One port per GPU** is a simplification. Real servers have several network ports per GPU and real clusters mix packet and circuit switches, so a real all-to-all can run several pairings at once or route around a dark circuit. The ratio of light-on to switch time still sets how useful each circuit is.
- The 10 ms figure is the low end of Google's 10 to 20 ms range for commercial switches; Google describes its own only as millisecond-scale. The 300 µs is a vendor's published spec, not an independent measurement. Dipole's 1 µs is a target.
- "Half their time idle" is Dipole's premise, not a measured number here. The `--dipole` run only shows what the 25% claim would require if that premise holds.
- Message sizes in the table are a sweep, not measurements from a specific model.
- The simulator slows each round to about 1.6 s so you can see it, but the split between dark and lit is the real ratio.

</details>

[^tweet]: Jared Friedman, [launch post for Dipole Labs](https://x.com/snowmaker), X, 14 August 2026.
[^yc]: Dipole Labs, [Shooting lasers to solve the billion-dollar bottleneck inside AI datacenters](https://www.ycombinator.com/launches/SiE-dipole-labs-shooting-lasers-to-solve-the-billion-dollar-bottleneck-inside-ai-datacenters), Y Combinator Launches, 2026.
[^h100]: [NVIDIA H100 Tensor Core GPU](https://www.nvidia.com/en-us/data-center/h100/), specifications for H100 SXM, NVIDIA.
[^cx7]: [ConnectX-7 firmware compatible products](https://networking-docs.nvidia.com/connectx7fwrn/28354030lts/firmware-compatible-products), NVIDIA (ConnectX-7, 400Gb/s NDR, single-port OSFP).
[^semi]: Dylan Patel, [Google OCS Apollo: The >$3 Billion Game-Changer in Datacenter Networking](https://newsletter.semianalysis.com/p/google-apollo-the-3-billion-game), SemiAnalysis, 2023.
[^apollo]: Ryohei Urata et al., [Mission Apollo: Landing Optical Circuit Switching at Datacenter Scale](https://arxiv.org/abs/2208.10041), Google, 2022.
[^introl]: Blake Crosley, [Google TPU architecture: complete guide to 7 generations](https://introl.com/blog/google-tpu-architecture-complete-guide-7-generations), Introl, 2025.
[^jupiter]: Leon Poutievski et al., [Jupiter Evolving: Transforming Google's Datacenter Network via Optical Circuit Switches and Software-Defined Networking](https://research.google/pubs/jupiter-evolving-transforming-googles-datacenter-network-via-optical-circuit-switches-and-software-defined-networking/), ACM SIGCOMM, 2022.
[^tpuv4]: Norman P. Jouppi et al., [TPU v4: An Optically Reconfigurable Supercomputer for Machine Learning with Hardware Support for Embeddings](https://arxiv.org/abs/2304.01433), ISCA, 2023.
[^deepep]: DeepSeek, [DeepEP: an efficient expert-parallel communication library](https://github.com/deepseek-ai/DeepEP), GitHub.
[^salience]: Salience Labs, [All-optical switches](https://www.saliencelabs.ai/product/), product page.
[^lukin]: Dolev Bluvstein et al., [A quantum processor based on coherent transport of entangled atom arrays](https://arxiv.org/abs/2112.03923), Nature, 2022.
[^rw]: RuntimeWire, [Startup Spotlight: Dipole Labs builds optical switches to keep AI cluster traffic in light](https://runtimewire.com/article/startup-spotlight-dipole-labs-optical-switches-ai-clusters), 2026.
