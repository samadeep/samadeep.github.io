---
title: 'Three Bit Flips, and ECC Memory Fixes the Wrong One'
description: 'How ECC memory works, from parity to Hamming codes and SECDED: why one flip is fixed, two crash, and three get "fixed" wrong. Runs in your browser.'
hook:
  stat: '3 → 4'
  caption: 'Flip 3 bits in memory and, more often than not, ECC "fixes" a 4th. Your data is now wrong, and nothing warns you.'
date: '2026-10-17'
topic: systems
series: algorithm-deep-dives
tags: [ecc-memory, hamming-code, secded, silent-data-corruption, error-correcting-codes]
---

<aside class="tldr">

**TL;DR** Server memory stores 8 extra bits next to every 64, and those 8 bits can find and fix any single flipped bit. Flip two and it notices and stops the machine. Flip three and it notices nothing wrong at all: it confidently "repairs" a fourth bit that was fine, logs a routine correction, and hands your program the damage. The safety net has a hole shaped exactly like itself.

</aside>

A word of memory in a server is 72 bits: 64 bits of your data and 8 bits of insurance. A particle from space, a weak cell, a hammered neighbouring row: something flips three of those bits at once.

The memory controller reads the word, checks it, and reports: *one error, corrected.* It flips a bit back and sends the word on.

That bit was fine. Now four bits are wrong, the log says everything was handled, and your program computes with the result.

How does a code built to fix errors make one worse? To see it, you have to build the code yourself, from one bit up. Start by breaking it. Tap a few cells, or press **Storm** with three bits per hit and watch the "made worse" counter climb ([Fig. 1](#fig-1) shows the three outcomes side by side).

<div data-lab="ecc"></div>

```fig title="One flip is fixed and two are caught, but three look exactly like one, so the decoder fixes the wrong bit" alt="Three panels. One flip: a hit flips bit 5, the decoder's syndrome points at bit 5, it flips it back, data correct. Two flips: bits 5 and 40 flip, overall parity is even but the syndrome is not zero, the decoder raises an uncorrectable error and the machine stops, nothing silently wrong. Three flips: bits 5, 40 and 61 flip, overall parity is odd so it looks like one flip, the syndrome points at bit 16, the decoder flips bit 16 and four bits are now wrong, logged as corrected."
panel 1 flip
row
a1: deny "bit 5 flips"
row
a2: worker "syndrome points\nat bit 5"
row
a3: allow "flip it back\ndata correct"
a1 -> a2
a2 -> a3
panel 2 flips
row
b1: deny "bits 5, 40 flip"
row
b2: worker "parity even,\nsyndrome not 0"
row
b3: ask "machine-check\nnothing silent"
b1 -> b2
b2 -> b3
panel 3 flips
row
c1: deny "bits 5, 40, 61 flip"
row
c2: worker "parity odd:\nlooks like 1 flip"
row
c3: deny "-X- flips bit 16\n4 bits wrong"
c1 -> c2
c2 -> c3 "syndrome = 16" lost
```

<details>
<summary>Before you start</summary>

You need binary numbers and XOR (`1 ⊕ 1 = 0`, `1 ⊕ 0 = 1`). Hamming's own 1950 paper is short and readable[^hamming], and Wikipedia's Hamming code page has good tables[^wiki]. Notation:

| symbol | meaning |
|---|---|
| flip | a stored bit that reads back as its opposite |
| E | the set of positions that flipped |
| syndrome s | the check bits that disagree, read as a number |
| p | overall parity: 1 if an odd number of bits flipped |
| SECDED | single error correction, double error detection |

</details>

## One extra bit: parity

The cheapest insurance is one bit that makes the count of 1s even. Read the word back; if the count is odd, something flipped.

```zsh
$ python3 ecc.py parity
data 10110010  parity bit 0  (makes the count of 1s even)
  flip 1 bit(s) at [2]: 10010010  -> error detected
  flip 2 bit(s) at [2, 5]: 10010110  -> looks fine  -X-
  flip 3 bit(s) at [0, 2, 5]: 00010110  -> error detected
  flip 4 bit(s) at [0, 1, 2, 5]: 01010110  -> looks fine  -X-
```

Parity sees an odd number of flips and is blind to an even number. It also can't say *which* bit flipped, so all it can do is refuse the data. Remember that blind spot: it comes back at the worst moment.

## Hamming's trick: make the error spell its own address

In 1950 Richard Hamming, at Bell Labs, asked for more: not just "something flipped" but "bit 5 flipped"[^hamming]. Number the positions 1 to 7 and put check bits at the powers of two: 1, 2 and 4. Check bit 1 covers every position whose binary address has the 1s bit set (1, 3, 5, 7); check bit 2 covers those with the 2s bit (2, 3, 6, 7); check bit 4 covers 4 to 7.

Now flip position 5, which is `101` in binary. It sits under check 1 and check 4, so exactly those two fail. Write the failing checks as a binary number and you get `101`. The error spells its own address ([Fig. 2](#fig-2)).

```fig title="Each check bit watches the positions with its bit set, so the failing checks spell the flipped position in binary" alt="Top row, seven positions: 1 check 001, 2 check 010, 3 data 011, 4 check 100, 5 data 101 flipped, 6 data 110, 7 data 111. Bottom bar: position 5 is covered by checks 4 and 1, those two fail, syndrome 101 equals 5, flip position 5 back."
row
p1: ask "1\ncheck 001"
p2: ask "2\ncheck 010"
p3: box "3\ndata 011"
p4: ask "4\ncheck 100"
p5: deny "5 flipped\ndata 101"
p6: box "6\ndata 110"
p7: box "7\ndata 111"
row
s: worker "checks 4 and 1 fail -> syndrome 101 = 5 -> flip position 5 back" span 7
p5 -> s
```

Every position works the same way:

```zsh
$ python3 ecc.py hamming7
data 1011 -> codeword 0110011  (positions 1..7, checks at 1, 2, 4)
  flip position 1 (001) -> syndrome 001 = 1  points straight at it
  ...
  flip position 7 (111) -> syndrome 111 = 7  points straight at it
  flip positions 2 and 6 -> syndrome 100 = 4: blames position 4, now 3 bits are wrong  -X-
```

The general rule: the syndrome is the XOR of the flipped positions.

$$
s = \bigoplus_{i \in E} i
$$

With one flip, $s$ is that position. With two, it's the XOR of two positions, which is some *other* position, and the decoder can't know it's been lied to. The last line above is the first dead end: a code that corrects one error can't tell one error from two.

## One more bit: SECDED

Add parity back, over the whole word. Now the decoder knows whether an odd or even number of bits flipped, and it has a table ([Fig. 3](#fig-3)).

```fig title="Overall parity decides which branch the decoder takes; only an odd count is allowed to correct" alt="Three columns. Parity even and syndrome 0: clean, pass the data through. Parity odd: assume one flip, flip bit s back (s = 0 means the parity bit itself). Parity even and syndrome not 0: two flips, uncorrectable, raise a machine-check."
row
d1: allow "p even, s = 0\nclean"
d2: worker "p odd\nassume 1 flip, fix bit s"
d3: ask "p even, s ≠ 0\n2 flips: stop the machine"
```

This is SECDED: single error correction, double error detection. Real memory uses it on 64-bit words. Positions 1 to 71 need 7 check bits (64 data bits plus 7 checks fit in 71 addresses, and 7 bits can count to 127), plus 1 for overall parity: 64 + 8 = 72. That's why ECC DIMMs are 72 bits wide, and why they carry one extra chip for every eight.

<details>
<summary>Why 7 check bits for 64 data bits</summary>

With $r$ check bits the syndrome has $2^r$ values. It must name every one of the $64 + r$ positions, plus "no error":

$$
2^r \ge 64 + r + 1
$$

$r = 6$ gives $64 \ge 71$, false. $r = 7$ gives $128 \ge 72$, true. So 7 checks, and positions 72 to 127 are addresses that don't exist. Keep that in mind for the next section.

</details>

## Three flips look exactly like one

Here is where the opening happens. Three flips is an odd number, so parity says "one flip". The decoder takes the middle branch of [Fig. 3](#fig-3) and flips bit $s = i \oplus j \oplus k$, which is never one of the three that broke (if it were, two of them would be the same bit). So it flips a fourth.

```zsh
$ python3 ecc.py flip 5 40 61
hamming SECDED, flipped bits [5, 40, 61], syndrome 10010000
decoder: corrected bit 16.  -X- It was fine. Now 4 bits are wrong: [5, 16, 40, 61]
```

How often? There are 59,640 ways to flip 3 of 72 bits. The lab tries every one, for the textbook code and for M. Y. Hsiao's 1970 variant[^hsiao], where every bit's check pattern has an odd number of 1s:

```zsh
$ python3 ecc.py --exhaust
code     k   patterns  corrected  detected  MISCORRECTED  silent
hamming  1         72         72         0             0       0
hamming  2      2,556          0     2,556             0       0
hamming  3     59,640          0    14,336        45,304       0   (76.0% made worse)
hamming  4  1,028,790          0 1,017,464             0  11,326

hsiao    1         72         72         0             0       0
hsiao    2      2,556          0     2,556             0       0
hsiao    3     59,640          0    25,476        34,164       0   (57.3% made worse)
hsiao    4  1,028,790          0 1,020,249             0   8,541
```

Three flips get "fixed" into four 76% of the time with the textbook code and 57% with Hsiao's. The textbook code escapes only when the XOR lands on an address past 71, one that doesn't exist (the fold-out above). Hsiao's escapes more because only 72 of its 128 odd-weight syndromes belong to a bit. And four flips? About 1% of them turn the word into a *different valid word*: the decoder says "clean" and the error is invisible.

Count the guards that should have caught three flips, and why each one waved them through:

- **Overall parity**: three is odd, the same answer one flip gives.
- **The syndrome**: it points at a real bit, exactly as a single error would.
- **The error log**: it records a correctable error, the most routine event in a server's life. Nobody pages anyone for one.

Most explanations stop at "three or more flips may go undetected". That undersells it. The code doesn't just miss the error; it adds one and reports success.

> **Insight:** A decoder never finds the error. It finds the nearest valid word and assumes that's what you stored. Past what the code was built for, the nearest valid word is usually the wrong one.

<details>
<summary>Why distance 4 means exactly this</summary>

Any two valid 72-bit words differ in at least 4 positions (SECDED's minimum distance is 4). A word with 1 flip is 1 step from yours and at least 3 from any other, so the nearest is yours: correct. A word with 2 flips can be 2 steps from yours and 2 from another: a tie, so detect. A word with 3 flips is 3 from yours but can be only 1 from another valid word, and that one is now the nearest. The decoder walks to it. That last step is the fourth flipped bit.

</details>

## Real errors don't flip random bits

The lab flips bits uniformly at random. Real memory doesn't fail that politely. In Google's fleet, more than 8% of DIMMs saw at least one error a year, and most errors came from hard faults, not one-off hits[^schroeder]. A failing chip doesn't flip one bit of a word; it can take out every bit it holds.

So big systems spread each word across chips. IBM's Chipkill places each word's bits on different chips, so a whole dead chip costs each word at most one bit, which SECDED can fix[^chipkill]. A 2015 study of two supercomputers put the gap in numbers: chipkill-class ECC cut uncorrected errors about 40x compared with SECDED, and SECDED alone was estimated to let an undetected error through every 0.8 to 85 days on a large machine, depending on the DRAM vendor[^sridharan].

```fig title="Each layer covers more failures, and the last row is what no memory code can see" alt="Top panel, protects less to protects more: parity detects 1 flip; SECDED fixes 1 and stops on 2; Chipkill survives a whole dead chip. Bottom row, outside memory ECC: a CPU core computing the wrong answer, and a software bug writing wrong data with valid check bits."
panel protects less  →  protects more
row
l1: box "parity\ndetect 1 flip"
l2: worker "SECDED\nfix 1, stop on 2"
l3: allow "Chipkill\nsurvive a dead chip"
row
x1: deny "CPU core math\nwrong, never stored" span 2
x2: deny "software bug\nwrong data, valid ECC"
```

Two newer twists on the same blind spot:

- **DDR5's "built-in ECC" isn't the ECC you think.** Every DDR5 chip corrects single errors inside itself on 128-bit chunks with 8 check bits, and never tells the memory controller it did. With 2 or more flips inside a chunk it can miscorrect, adding a flip on its way out[^criss]. It's the same three-for-four trade, one level down. Desktop DDR5 without the extra ECC chip is not ECC memory.
- **Attackers can aim the flips.** Rowhammer flips bits by hammering neighbouring rows. A 2019 attack timed memory reads to find the slow ones (a correction costs time), mapped which cells flip, and then hammered enough at once to slip past ECC, which the authors concluded is not an adequate defence on its own[^eccploit].

## What ECC never sees

ECC guards bits while they sit in memory and travel to the CPU. It knows nothing about what the CPU does with them. Google reported "a few mercurial cores per several thousand machines", cores that sometimes compute wrong answers[^cores]. Meta tested hundreds of thousands of machines and found hundreds of CPUs producing silent data corruption, wrong results that no hardware check reports[^meta]. A multiply that's wrong is stored with perfect check bits.

The same goes for software. A buffer overflow writes the wrong bytes through the front door, and the memory controller dutifully computes valid ECC for them. Memory corruption from bugs and bit flips from physics share a name and nothing else.

## Back to the three bits

Three bits flipped, and the decoder did exactly what it was designed to do: find the nearest valid word. The word it found was one flip away from the damage, not three away from your data, and the log called it a routine correction. Nothing broke. Everything worked. That's what makes it silent.

Your machine counts those routine corrections. On Linux with ECC memory and the EDAC driver loaded, two numbers per memory controller tell you how it's going[^edac]:

```zsh
grep . /sys/devices/system/edac/mc/mc*/ce_count /sys/devices/system/edac/mc/mc*/ue_count
```

`ce_count` is corrected errors, `ue_count` uncorrectable ones. A DIMM whose `ce_count` keeps climbing is the one most likely to deliver the multi-bit day, so replace it before it does.

## Try it

Every number above comes from one file. Run it here:

<div data-lab="py" data-src="/labs/ecc-memory/ecc.py" data-args="flip 5 40 61" data-presets="parity|hamming7|flip 5 40 61|flip 5 40 61 --hsiao|--exhaust|--storm 4"></div>

Or on your own machine:

```zsh
python3 ecc.py --exhaust        # every 1 to 4-bit pattern, both codes, about 2 s
python3 ecc.py flip 1 2 3       # three flips whose XOR is 0: it blames the parity bit
python3 ecc.py --storm 5        # random 5-bit hits
```

The file is at [`/labs/ecc-memory/ecc.py`](/labs/ecc-memory/ecc.py). Try `flip 1 2 3` first and work out by hand why the decoder blames bit 0.

<details>
<summary>Method, limits and what wasn't verified</summary>

- **What was run:** `ecc.py` builds both (72,64) codes from their definitions and classifies every 1, 2, 3 and 4-bit error pattern; all outputs above are pasted from runs. The simulator uses the same columns and decode rules, and its decoder was checked against the Python lab on every 1, 2 and 3-bit pattern (identical counts).
- **The Hsiao code here** is one valid odd-weight-column (72,64) code (all 8 weight-1 columns, all 56 weight-3 columns, the first 8 weight-5 columns). Hsiao's paper picks columns to balance the hardware; a different valid choice changes the 57.3% somewhat. Real controllers' exact matrices are vendor details not published in the sources here.
- **Uniform random flips are not how DRAM fails.** Real multi-bit errors cluster in one chip, row or column, which is why Chipkill exists. The percentages describe the codes, not field error rates.
- **Not verified directly:** Hsiao's paper (the scanned PDF had no readable text; the citation is confirmed from a Berkeley CS252 reading list), and IBM's Chipkill white paper (the archive copy could not be fetched; the description follows Wikipedia, which cites it). The EDAC paths come from the kernel's sysfs ABI documentation and were not run here (the workspace has no ECC memory).

</details>

[^hamming]: R. W. Hamming, [Error Detecting and Error Correcting Codes](https://archive.org/details/bstj29-2-147), Bell System Technical Journal 29(2), 1950.
[^wiki]: Wikipedia, [Hamming code](https://en.wikipedia.org/wiki/Hamming_code).
[^hsiao]: M. Y. Hsiao, [A Class of Optimal Minimum Odd-weight-column SEC-DED Codes](https://people.eecs.berkeley.edu/~kubitron/cs252/handouts/papers/hsiao70.pdf), IBM Journal of Research and Development 14(4), 1970.
[^schroeder]: Bianca Schroeder, Eduardo Pinheiro, Wolf-Dietrich Weber, [DRAM Errors in the Wild: A Large-Scale Field Study](https://research.google/pubs/dram-errors-in-the-wild-a-large-scale-field-study/), SIGMETRICS, 2009.
[^chipkill]: Wikipedia, [Chipkill](https://en.wikipedia.org/wiki/Chipkill), citing Timothy J. Dell, "A White Paper on the Benefits of Chipkill-Correct ECC for PC Server Main Memory", IBM, 1997.
[^sridharan]: Vilas Sridharan et al., [Memory Errors in Modern Systems: The Good, The Bad, and The Ugly](https://pages.cs.wisc.edu/~remzi/Classes/739/Web/Papers/memoryerrors-asplos15.pdf), ASPLOS, 2015.
[^criss]: Kjersten Criss et al., [Improving Memory Reliability by Bounding DRAM Faults: DDR5 improved reliability features](https://www.memsys.io/wp-content/uploads/2020/10/p337-criss.pdf), MEMSYS, 2020.
[^eccploit]: Lucian Cojocar, Kaveh Razavi, Cristiano Giuffrida, Herbert Bos, [Exploiting Correcting Codes: On the Effectiveness of ECC Memory Against Rowhammer Attacks](https://download.vusec.net/papers/eccploit_sp19.pdf), IEEE Symposium on Security and Privacy, 2019.
[^cores]: Peter H. Hochschild et al., [Cores that don't count](https://sigops.org/s/conferences/hotos/2021/papers/hotos21-s01-hochschild.pdf), HotOS, 2021.
[^meta]: Harish Dattatraya Dixit et al., [Silent Data Corruptions at Scale](https://arxiv.org/abs/2102.11245), arXiv, 2021.
[^edac]: Linux kernel, [sysfs ABI for EDAC memory controllers](https://lkml.iu.edu/1204.2/00984.html) (patch moving the documentation to `ABI/testing/sysfs-devices-edac`), 2012.
