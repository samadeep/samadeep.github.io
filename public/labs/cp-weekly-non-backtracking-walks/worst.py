# Worst case for the naive scan: one hub value shared by N-2 cards in twin pairs (1,x),(1,x).
# Every twin pair re-enters the hub, so a full rescan per entry costs about N^2/2 steps.
# Card 2 sits on its own values, so BFS must explore everything and answer -1.
import sys
n = int(sys.argv[1])
print(1); print(n)
print(1, 2)                    # card 1: walked from B1=2 into the hub A1=1
print(2 * n - 1, 2 * n)        # card 2: isolated
x = 3
for i in range(n - 2):
    print(1, x)
    if i % 2 == 1: x += 1
