"""Why IceCube is a cubic kilometre, and why an energy cut finds the cosmic neutrinos.

Numbers are from the Royal Swedish Academy's scientific background to the 2026 Physics Nobel:
  cross-section at 1 PeV        ~1e-33 cm^2 per nucleon
  ice density                   0.92 g/cm^3 (~6e23 nucleons per gram)
  atmospheric muons             ~3 kHz reaching the detector
  neutrinos recorded            ~100,000 a year above ~0.1 TeV, ~100 of them astrophysical
  spectra                       astrophysical ~E^-2.5, atmospheric ~E^-3.7, crossing at a few tens of TeV
"""
import argparse

p = argparse.ArgumentParser()
p.add_argument("--km", type=float, default=1.0, help="ice the neutrino crosses, in km")
p.add_argument("--sigma", type=float, default=1e-33, help="cross-section in cm^2 (1e-33 at ~1 PeV)")
p.add_argument("--cross", type=float, default=30.0, help="TeV where cosmic and atmospheric rates are equal")
a = p.parse_args()

nucleons_per_cm3 = 0.92 * 6.022e23
prob = nucleons_per_cm3 * a.sigma * a.km * 1e5
print(f"1. A PeV neutrino crossing {a.km:g} km of ice interacts with probability {prob:.1e}")
print(f"   so about 1 in {1/prob:,.0f} of them leaves any light at all.\n")

muons_per_year = 3000 * 3600 * 24 * 365
print("2. What the detector has to sift through each year:")
for label, n in [("atmospheric muons (from above)", muons_per_year), ("neutrinos of any origin", 100_000), ("astrophysical neutrinos", 100)]:
    print(f"   {label:32} {n:>16,.0f}")
print(f"   needle-to-haystack: 1 in {muons_per_year / 100:,.0e}\n")

print("3. Why an energy cut works: the background falls faster than the signal.")
print(f"   cosmic / atmospheric ~ (E / {a.cross:g} TeV)^(3.7 - 2.5)")
for e in (1, 10, 30, 100, 1000):
    r = (e / a.cross) ** 1.2
    bar = "#" * max(1, min(40, round(10 + 8 * __import__('math').log10(r))))
    print(f"   {e:>6} TeV   ratio {r:8.2f}   {bar}")
