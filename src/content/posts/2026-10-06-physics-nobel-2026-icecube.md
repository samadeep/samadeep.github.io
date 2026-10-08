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

Up to two and a half kilometres under the South Pole, in ice so clear that light travels 200 metres through it before fading, 5,160 glass spheres sit in the dark, waiting.

Every year about **100,000 neutrinos** leave a faint flash of light somewhere in that cubic kilometre. About **100** of them come from the distant universe: messengers from some of its most violent places. Everything else is noise, including roughly 3,000 muons *a second* raining down from our own atmosphere.

Finding those 100 is why **Francis Halzen** (University of Wisconsin–Madison) won the 2026 Nobel Prize in Physics, "for decisive contributions to the IceCube Neutrino Observatory and the discovery of high-energy neutrinos of astrophysical origin." He proposed the idea in 1988 and led IceCube from it to its 2013 discovery. Here's how a block of ice became a telescope, and you can reconstruct a neutrino yourself on the way.

## The only messenger that arrives straight

The universe runs particle accelerators that make ours look like toys: cosmic rays reach about 10²⁰ eV, against 7 × 10¹² eV at the LHC. *Where* they're accelerated has been one of astronomy's oldest mysteries, because almost every messenger gets scrambled on the way to us.

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

A proton is charged, so magnetic fields bend its path until it points nowhere useful. A gamma ray can be swallowed by dust or background light. But when protons smash into gas near their source, they make pions, and charged pions decay into **neutrinos**: no charge, almost no interactions. A neutrino flies dead straight from where it was born, straight through anything in its way.

Which is also the problem. Something that ignores everything ignores your detector too.

## How big does a detector need to be?

At petaelectronvolt energies, a neutrino's chance of hitting a nucleon is tiny: a cross-section of about 10⁻³³ cm². Run the arithmetic yourself:

<div data-lab="py" data-src="/labs/icecube/why_km3.py" data-presets="--km 1|--km 0.1|--cross 50"></div>

A PeV neutrino crossing a full kilometre of ice interacts **about once in 18,000 tries**. Try `--km 0.1` and the odds get ten times worse. Only a gigatonne of target gives you a usable number of catches, so the size of IceCube wasn't a design choice. It was the answer to a calculation.

Getting there took two decades of steps. In 1991, sensors lowered into Greenland boreholes showed glacier ice was clear enough. From 1993 to 2000, the AMANDA prototype at the Pole showed the idea worked. IceCube itself was built from 2004 and finished in 2011.

## The ice is the instrument

IceCube is 86 strings, each carrying 60 sensors spaced 17 m apart between 1,450 m and 2,450 m deep, standing 125 m apart on a triangular grid. The holes were melted with a hot-water drill, essentially a very serious shower head. Each sensor is, in Halzen's phrase, a lightbulb in reverse.

When a neutrino does hit a nucleus, the charged particles it makes travel *faster than light moves through ice* (whose refractive index is about 1.31). They shed **Cherenkov light** in a cone at about 40°, an optical sonic boom.

AMANDA's first strings hit a snag nobody had planned for. At 800 to 1,000 m, air bubbles scattered light within half a metre and smeared every image into fog. Go deeper and the pressure squeezes the bubbles out: below about 2,100 m, light travels ~200 m before it's absorbed and ~50 m before it scatters. The experiment ended up having to map its own ice, layer by layer, because the ice is as much a part of the instrument as the glass spheres.

## Reconstruct one yourself

A muon from a neutrino crosses the detector faster than light can follow it through ice. Sensors near the start of its path flash first and those downstream later, so **the arrival times draw the direction**. Below is a slice of the real geometry: 8 strings, 125 m apart, 60 sensors each. Make an event, then reconstruct it from timing alone.

<div data-lab="icecube"></div>

The fit is a miniature of IceCube's own pipeline, in two stages. **LineFit** is the fast first guess: treat the hits as points moving at constant speed and solve position against time by least squares. It takes milliseconds and lands within about a degree. Then a **full timing fit** uses the real Cherenkov geometry, and punishes early hits harshly but late ones gently, because scattering can only ever *delay* a photon, never speed it up. In this 2D toy that gets the median error to about 0.3° in realistic ice. With every sensor in 3D, IceCube reaches 0.3° at 100 TeV.

Now switch to **Cascade**. An electron or tau neutrino, or any neutrino that just shatters a nucleus, makes a ball of light under ~10 m across. Its timing is nearly symmetric, so LineFit points almost anywhere.

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

A track writes its direction across hundreds of metres of sensors. A cascade writes its energy into one compact ball. Neither gives you both, so IceCube uses both.

## Finding 100 needles in a haystack of millions

Here's the real engineering problem. Cosmic rays hitting the atmosphere above the Pole send about **3,000 muons a second** into the detector, and they make neutrinos of their own, which dominate the ~100,000 IceCube records each year. How do you find the cosmic ones?

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

1. **Use the whole planet as a shield.** Atmospheric muons can't cross the Earth; neutrinos can. Keep only tracks coming *up* through the planet, and the muon background drops from 3 kHz to the microhertz level.
2. **Use the detector's own skin.** For events from any direction, the outer layer of sensors acts as a veto: an event that *starts inside*, with nothing coming in, wasn't a muon from outside. This "starting event" trick found the first two PeV neutrinos in 2013, while the team was searching for something else entirely.
3. **Use energy.** The atmospheric neutrino spectrum falls as ~E⁻³·⁷ and the cosmic one as ~E⁻²·⁵, so above a few tens of TeV the cosmos wins. Section 3 of the calculator above prints the ratio: about 67 to 1 at 1 PeV, under its default crossover.

> **Insight:** None of these cuts is a statistical threshold the noise could sneak under. Each one uses something the noise physically can't fake: it can't cross the Earth, it can't start inside, and it doesn't reach that energy.

## What the ice saw

| When | What | Evidence |
|---|---|---|
| 1988 | Halzen and Learned propose a neutrino detector in polar ice | preprint, June 1988 |
| 2013 | first two PeV neutrinos (1.04 and 1.14 PeV), then 28 events from 30 TeV to 1.14 PeV | PRL 111, Science 342 |
| 2014 | a purely atmospheric explanation rejected | 5.7σ |
| 2017 | a ~290 TeV neutrino within 0.06° of the flaring blazar TXS 0506+056; alert sent within a minute | Science 361 |
| 2022 | 79 neutrinos from the direction of the galaxy NGC 1068 | 4.2σ |
| 2024 | seven astrophysical tau neutrinos | 5σ |
| 2026 | the Milky Way established as a source of high-energy neutrinos | 5.7σ, 12 years of data |

And the mystery isn't solved. Most of the flux still has **no identified source**, and NGC 1068 isn't conclusive yet. That's why the next generation is already being built: IceCube-Gen2 at the Pole, KM3NeT in the Mediterranean, P-ONE, TRIDENT and Baikal-GVD.

> **Insight:** The prize is for opening a window, not for naming what's on the other side. A new kind of telescope's first result is usually "there's something there", and working out what takes the next decade.

Those 5,160 spheres are still down there in the dark, waiting for the next flash.

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
