---
title: 'Physics Nobel 2026: How IceCube Turned Ice into a Telescope'
description: 'Francis Halzen''s Nobel, explained: how a cubic kilometre of Antarctic ice catches neutrinos from deep space. Reconstruct one yourself in your browser.'
hook:
  stat: '100,000 → ~100'
  caption: 'neutrinos IceCube records a year → from the distant universe'
date: '2026-10-06'
topic: science
series: papers-rebuilt
tags: [nobel-prize, neutrinos, icecube, astrophysics, signal-processing, reconstruction]
---

Every year about **100,000 neutrinos** leave a flash of light in a cubic kilometre of Antarctic ice. Roughly **100** of them come from the distant universe. Everything else (including about 3,000 muons a second raining down from our own atmosphere) is noise. Today's Physics Nobel goes to the person who built the filter that tells them apart.

**Short answer:** the 2026 Nobel Prize in Physics goes to **Francis Halzen** (University of Wisconsin–Madison) "for decisive contributions to the IceCube Neutrino Observatory and the discovery of high-energy neutrinos of astrophysical origin." In 1988 he proposed turning the South Pole's ice into a neutrino detector. As IceCube's Principal Investigator from the beginning, he led it from that idea to 5,160 light sensors buried 1.5 to 2.5 km deep, and to the 2013 detection of neutrinos from outside our solar system.

The rest of this post covers why neutrinos are worth that trouble, why the detector has to be a cubic kilometre, how a direction comes out of a few dozen flashes (you'll do it yourself below), and how about 100 needles a year are pulled out of the haystack.

## Neutrinos are the only messenger that arrives straight

The universe has particle accelerators far stronger than ours: cosmic rays reach about 10²⁰ eV, against 7 × 10¹² eV at the LHC. Where they're accelerated has been one of astronomy's best-kept secrets, because the messengers get scrambled on the way.

```fig title="Only the neutrino arrives straight and intact"
row
s1: main "Cosmic accelerator"
p1: deny "proton\n(charged)"
e1: peer "Earth"
row
s2: main "Cosmic accelerator"
p2: deny "gamma ray"
e2: peer "Earth"
row
s3: main "Cosmic accelerator"
p3: allow "neutrino\n(no charge)"
e3: peer "Earth"
s1 -> p1
p1 -> e1 "bent by magnetic fields" lost
s2 -> p2
p2 -> e2 "absorbed by dust and light" lost
s3 -> p3
p3 -> e3 "straight, untouched" good
```

When protons crash into gas or light near a source, they make pions. Neutral pions decay into gamma rays and charged pions into neutrinos, so **wherever cosmic rays are made, neutrinos should be too.** A proton's path is bent by magnetic fields, and a gamma ray can be absorbed by dust or background light. A neutrino has no charge and almost never interacts, so it points straight back to where it was born.

> **Insight:** The property that makes neutrinos useful is the same one that makes them nearly impossible to catch: they ignore almost everything, including the detector.

## Why the detector is a cubic kilometre

How rare is a catch? At petaelectronvolt energies a neutrino's cross-section with a nucleon is about 10⁻³³ cm², and the expected cosmic spectrum falls steeply with energy. Here's the arithmetic, running in your browser:

<div data-lab="py" data-src="/labs/icecube/why_km3.py" data-presets="--km 1|--km 0.1|--cross 50"></div>

A PeV neutrino crossing a full kilometre of ice interacts **about once in 18,000 tries**. Only a gigatonne of target gives a useful rate. Shrink the ice tenfold (`--km 0.1`) and the odds get ten times worse.

The design came in steps:

- **1991:** sensors lowered into Greenland boreholes showed that glacier ice is clear enough.
- **1993 to 2000:** the AMANDA prototype at the Pole showed the approach works.
- **2004 to 2010:** IceCube was built, finishing in 2011.

> **Insight:** When the event is rare, detector size isn't a design choice, it's a calculation: probability per neutrino times flux sets the volume, and everything else follows from that.

## Ice is the detector, not just the place

IceCube's 86 strings each carry 60 sensors, spaced every 17 m between 1450 m and 2450 m deep. The strings stand 125 m apart on a triangular grid. The holes were melted with a hot-water drill, essentially a sophisticated shower head. A sensor is, in Halzen's phrase, a lightbulb in reverse.

When a neutrino hits a nucleus, the charged particles it makes outrun light in ice (refractive index ~1.31). They give off **Cherenkov light** in a cone at about 40°, much like the sonic boom of a supersonic jet.

AMANDA's first strings, at 800 to 1000 m, found a problem: air bubbles scattered the light within half a metre and smeared every image. Deeper down, the bubbles are squeezed out. Below about 2100 m, light travels ~200 m before it's absorbed and ~50 m before it scatters. The experiment had to measure its own ice, layer by layer, and taught researchers a great deal about how ice behaves at depth.

> **Insight:** In big physics, the medium is part of the instrument. IceCube's precision depends as much on mapping the ice as on building the sensors.

## A direction from a few dozen flashes

A muon from a neutrino crosses the detector at nearly the speed of light, faster than light itself moves through ice. Sensors near the start of its path flash first, those downstream later, so **the arrival times draw the direction.** Below is a slice of the real geometry: 8 strings, 125 m apart, with 60 sensors each. Make an event, then reconstruct it from the timing alone.

<div data-lab="icecube"></div>

The fit runs in two stages, a miniature of IceCube's own pipeline:

1. **LineFit**, the fast first guess, treats the hits as points moving at constant speed and solves position against time by least squares. It takes milliseconds and lands within about a degree.
2. **A full timing fit** uses the actual Cherenkov geometry. It scores early hits harshly and late ones gently, because scattering can only ever *delay* a photon, never speed it up. In this 2D toy that gets the median error down to about 0.3° in realistic ice. In 3D with every sensor, IceCube reaches 0.3° at 100 TeV.

Now switch to **Cascade**. An electron or tau neutrino, or any neutrino that just knocks a nucleus apart, makes a ball of light under ~10 m across. Its timing is nearly symmetric, so LineFit points almost anywhere.

```fig title="The same detector, two trade-offs: tracks point well, cascades weigh well"
panel Muon track
row
n1: peer "muon neutrino" span 2
row
t1: main "a muon: a line of light\nup to kilometres long" span 2
row
r1: allow "direction\n0.3° at 100 TeV"
e1: deny "energy\nwithin a factor of ~2"
n1 -> t1
t1 -> r1 "timing"
t1 -> e1 "light seen"
panel Cascade
row
n2: peer "any flavour" span 2
row
t2: worker "a ball of light\nunder ~10 m across" span 2
row
r2: deny "direction\n~5° above 50 TeV"
e2: allow "energy\n~8% at 100 TeV"
n2 -> t2
t2 -> r2 "timing"
t2 -> e2 "light seen"
```

> **Insight:** The information sits in the timing differences. A track writes its direction across hundreds of metres of sensors, while a cascade writes its energy into one compact ball. Neither event type gives both, so IceCube uses both.

## Finding about 100 needles a year

The real engineering problem is background. Cosmic rays hitting the atmosphere above the Pole send about **3,000 muons a second** into the detector. They also make neutrinos of their own, and those dominate the ~100,000 neutrinos IceCube records each year.

```fig title="Three cuts take you from the atmosphere's noise to the cosmos"
row
a: deny "Everything that makes light in the ice\n~3,000 atmospheric muons a second" span 3
row
b: worker "Neutrinos: ~100,000 a year\nmostly made in our own atmosphere" span 3
row
c: allow "~100 a year from the distant universe" span 3
a -> b "look up through the Earth, or veto the outer shell"
b -> c "keep energies above a few tens of TeV"
```

Three cuts do the work:

1. **Use the Earth as a shield.** Atmospheric muons can't cross the planet, but neutrinos can. Keeping only tracks that come *up* through the Earth cuts the muon background from 3 kHz to the microhertz level.
2. **Use the detector's own skin.** For events from any direction, the outer layer of sensors acts as a veto. An event that starts inside, with nothing coming in, wasn't a muon from outside. This "starting event" trick found the first two PeV neutrinos in 2013, while the team was searching for something else.
3. **Use energy.** The atmospheric neutrino spectrum falls as ~E⁻³·⁷ and the cosmic one as ~E⁻²·⁵, so above a few tens of TeV the cosmic flux wins. Section 3 of the calculator above prints the ratio: at 1 PeV, about 67 to 1 under its default crossover.

> **Insight:** This is a classic false-positive problem. Each cut uses a physical asymmetry the noise can't fake (it can't cross the Earth, it can't start inside, it doesn't reach that energy), rather than a statistical threshold it could slip under.

## What it found

| When | What | Evidence |
|---|---|---|
| 1988 | Halzen and Learned propose a neutrino detector in polar ice | preprint, June 1988 |
| 2013 | first two PeV neutrinos (1.04 and 1.14 PeV), then 28 events from 30 TeV to 1.14 PeV | PRL 111, Science 342 |
| 2014 | a purely atmospheric explanation rejected | 5.7σ |
| 2017 | a ~290 TeV neutrino within 0.06° of the flaring blazar TXS 0506+056; alert sent within a minute | Science 361 |
| 2022 | 79 neutrinos from the direction of the galaxy NGC 1068 | 4.2σ |
| 2024 | seven astrophysical tau neutrinos | 5σ |
| 2026 | the Milky Way established as a source of high-energy neutrinos | 5.7σ, 12 years of data |

Two things are still open. Most of the flux has **no identified individual source**, and NGC 1068 isn't yet conclusive. The next generation (IceCube-Gen2 at the Pole, KM3NeT in the Mediterranean, P-ONE, TRIDENT, Baikal-GVD) aims to build bigger telescopes to find out.

> **Insight:** The prize is for opening a window, not for one source. The first result of a new kind of telescope is usually "there is something there", and naming what it is takes the next decade.

## Try it

The reconstruction and the calculator both run above, in your browser. To run the calculator on your own machine:

```zsh
curl -O https://samadeep.github.io/labs/icecube/why_km3.py
python3 why_km3.py --km 0.1
```

<details>
<summary>Limits and sources</summary>

- **The reconstruction is a 2D teaching model.** It uses the real string and sensor spacing, the Cherenkov angle in ice, positive-only scattering delays, and an out-of-plane miss distance for each track. Real IceCube fits in 3D with a likelihood built on measured ice properties. The 0.3° from the toy and the 0.3° IceCube quotes come from different setups, so they shouldn't be read as one number confirming the other.
- **The calculator's counts** are the Academy's figures (3 kHz of muons, ~100,000 neutrinos a year, ~100 astrophysical). The crossover energy is a parameter, because the source only says "a few tens of TeV".
- Sources:
  - [Press release](https://www.nobelprize.org/prizes/physics/2026/press-release/), [popular science background](https://www.nobelprize.org/prizes/physics/2026/popular-information/) and [scientific background](https://www.nobelprize.org/uploads/2026/10/advanced-physicsprize2026.pdf) (The Royal Swedish Academy of Sciences, 6 October 2026).
  - IceCube Collaboration: [detector, JINST 12 (2017) P03012](https://arxiv.org/abs/1612.05093); [evidence for astrophysical neutrinos, Science 342 (2013)](https://arxiv.org/abs/1311.5238); [TXS 0506+056, Science 361 (2018)](https://arxiv.org/abs/1807.08816); [NGC 1068, Science 378 (2022)](https://arxiv.org/abs/2211.09972); [Galactic plane, Science 380 (2023)](https://arxiv.org/abs/2307.04427).

</details>
