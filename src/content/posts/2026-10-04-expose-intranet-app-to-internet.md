---
title: 'How to Expose an Intranet Application to the Internet Safely'
description: 'Moving an internal app from intranet to internet: the safe pattern, and five silent ways a port forward breaks. Every command runs in your browser.'
date: '2026-10-04'
topic: systems
vm:
  setup: 'cd /root && cp site/labs/intranet-to-internet/lab.sh . && (ip netns list | grep -q lab-fw || ./lab.sh up)'
tags: [intranet, networking, security, reverse-proxy, nat, port-forwarding, firewall, conntrack]
---

**Short answer:** don't publish the app. Put an identity-aware proxy in front, forward only 443, allow only traffic that came through that forward, and replace "trusted because it's on our network" with SSO. Then test from *outside*.

This post started with an incident I kept coming back to: an internal service that had been exposed to the outside, and an external attack that came for it. The road there is usually ordinary. Someone needs outside access, a port gets opened, and a service built for "only our people" now answers everyone.

A port forward is one line. The ways it goes wrong are silent. **Every command below has a ▶ Run button**: it runs on a real Linux machine inside your browser, with a client, a firewall and an app wired together.

```d2 title="The whole path, and the five places it breaks"
direction: down
client: "Client\n198.51.100.23" {class: peer}
fw: "Firewall\nDNAT + conntrack" {class: main}
app: "App\n10.0.1.5:8080" {class: worker}
client -> fw: "1 forward · 4 idle · 5 MTU"
fw -> app: "2 side door"
app -> client: "3 reply path" {class: lost}
```

## The one idea: the firewall decides once

```d2 title="You picture rules judging every packet. Linux judges the first, then remembers."
grid-columns: 2
grid-gap: 28
picture: "What you picture" {
  class: panel
  direction: down
  p: "every packet" {class: peer}
  r: rules {class: main}
  v: verdict {class: result}
  p -> r: judged
  r -> v
}
linux: "What Linux does" {
  class: panel
  direction: down
  p1: "first packet" {class: peer}
  r: rules {class: main}
  t: "conntrack entry" {class: shared}
  rest: "every later packet" {class: peer}
  p1 -> r: "judged once"
  r -> t: remembered
  rest -> t: "just matched"
}
```

**Rules run once per connection.** The verdict and the address rewrite are saved in a table entry, and every later packet, both ways, just matches it. All five breaks below come from that.

See one entry being born, used and retired:

```bash
sudo ./lab.sh entry
```

```text
hello from 10.0.1.5
    [NEW] tcp 6 120 SYN_SENT    src=198.51.100.23 dst=203.0.113.10 dport=80 ... src=10.0.1.5 sport=8080 ...
 [UPDATE] tcp 6 432000 ESTABLISHED  ...                                                        [ASSURED]
 [UPDATE] tcp 6 120 TIME_WAIT   ...
```

The entry holds what the client sent (`dst=203.0.113.10:80`) and what the reply must look like (`src=10.0.1.5:8080`). **That second pair *is* the port forward.** `432000` is the countdown: 5 days.

> **Insight:** A firewall rule is checked per connection, not per packet. So most firewall bugs aren't about a wrong rule; they're about which packets never get checked at all.

## Pick the pattern first

| Pattern | Open to the internet | Use for |
|---|---|---|
| **Identity-aware access proxy** | only the proxy | internal tools used from home |
| **Reverse proxy in a DMZ** + port forward | the proxy on :443 | partners, customers, public traffic |
| **Outbound tunnel** | nothing inbound | no public IP, "can't open ports" |

**If the audience is still "our people", don't make the app public at all.** An access proxy gives you SSO without a port forward. The five breaks below are what you meet when you do forward a port.

> **Insight:** Exposing an app isn't a port setting, it's a change in what the app trusts. If identity doesn't move to the proxy, opening a port only moves the attack surface.

## 1. The port forward that never forwards

```d2 title="Translation happens before filtering. A rule for the public IP can never match."
direction: right
pkt: "to\n203.0.113.10:80" {class: peer}
dnat: "DNAT\nto 10.0.1.5:8080" {class: main}
bad: "FORWARD\n-d 203.0.113.10" {class: deny}
ok: "FORWARD\n-d 10.0.1.5" {class: allow}
pkt -> dnat
dnat -> bad: "never matches" {class: lost}
dnat -> ok: matches {class: good}
```

```bash
sudo ./lab.sh dnat-bug
```

```text
curl: timed out
FORWARD:  0 pkts  ACCEPT ... 203.0.113.10 tcp dpt:80
DNAT:     3 pkts  DNAT   ... 203.0.113.10 tcp dpt:80 to:10.0.1.5:8080
hello from 10.0.1.5                                   # rule fixed to match 10.0.1.5
```

**3 packets translated, 0 let through.** The climbing DNAT counter looks like progress; the FORWARD counter tells the truth.

> **Insight:** Debug from the counter of the rule that *should* have matched. Counters on the rules before it always look healthy.

## 2. The fix opened a side door

The rule that fixed #1 allows anything headed to `10.0.1.5:8080`, including someone who skips the front door and routes straight to the internal address.

```d2 title="Allow the front door, not the destination"
grid-columns: 2
grid-gap: 28
a: "-d 10.0.1.5" {
  class: panel
  direction: down
  x: attacker {class: peer}
  front: "front door\n203.0.113.10:80" {class: main}
  direct: "direct\n10.0.1.5:8080" {class: worker}
  app: "App" {class: deny}
  x -> front
  x -> direct: "skips proxy"
  front -> app
  direct -> app: "allowed" {class: lost}
}
b: "--ctstate DNAT" {
  class: panel
  direction: down
  x: attacker {class: peer}
  front: "front door\n203.0.113.10:80" {class: main}
  direct: "direct\n10.0.1.5:8080" {class: worker}
  app: "App" {class: allow}
  drop: dropped {class: result}
  x -> front
  x -> direct: "skips proxy"
  front -> app: allowed {class: good}
  direct -> drop: "no DNAT"
}
```

```bash
sudo ./lab.sh harden
```

```text
                                                203.0.113.10:80   10.0.1.5:8080
A  -d 10.0.1.5                    (fix from #1)  open              open    <- bypasses the proxy
B  -m conntrack --ctstate DNAT                   open              dropped
C  --ctorigdst 203.0.113.10 --ctorigdstport 80   open              dropped
D  A + drop 10.0.0.0/8 arriving on the WAN       open              dropped
```

**Use B and D together:** allow only forwarded flows, and drop private destinations at the edge. "Internal IPs aren't routable" isn't true for your upstream network, and scans of only the public IP will never see this.

> **Insight:** A rule written against a destination can't know how a packet got there. Only conntrack remembers the front door, so match on how the flow started (`--ctstate DNAT`), not where it's going.

## 3. Replies take a different way home

```d2 title="The reply skips the firewall that holds the entry, so it's never translated back"
shape: sequence_diagram
c: client {class: peer}
f: firewall {class: main}
s: app {class: worker}
f2: fw2 {class: deny}
c -> f: "to 203.0.113.10:80"
f -> s: "to 10.0.1.5:8080"
s -> f2: reply
f2 -> c: "from 10.0.1.5: wrong sender, ignored" {class: lost}
```

```bash
sudo ./lab.sh asym
```

```text
c-wan Out 198.51.100.23.33322 > 203.0.113.10.80: Flags [S]
c-alt In  10.0.1.5.8080 > 198.51.100.23.33322:   Flags [S.]   <- other interface, untranslated
```

**Fix:** symmetric routing, or have the proxy open its own connection to the app (SNAT) and pass the client IP in `X-Forwarded-For`.

> **Insight:** NAT is stateful, so it's also *located*: the reply has to come back through the box that holds the entry, or there's nothing to translate it.

## 4. Quiet connections die, and nobody is told

```d2 title="The idle entry is evicted; the late push is lost and the reset comes from the firewall"
shape: sequence_diagram
c: client {class: peer}
f: firewall {class: main}
s: app {class: worker}
c -> f: "connect, say hi"
f -> s
f -> f: "idle 5 s: entry evicted" {class: lost}
s -> f: "push at 8 s: dropped" {class: lost}
c -> f: FIN
f -> c: "RST from the firewall" {class: lost}
```

```bash
sudo ./lab.sh idle
```

```text
[DESTROY] tcp 6 ESTABLISHED src=198.51.100.23 dst=203.0.113.10 dport=9000 ... [ASSURED]
client received: nothing; when it finally sent, the connection was reset
client received: pushed after 8s idle                         # with a 2 s TCP keepalive
```

WebSockets, long polls, database pools and Kafka consumers stall exactly like this behind cloud load balancers and NAT gateways. **The reset comes from a box that never ran the app, which is why the app's logs are empty.** Fix: heartbeats shorter than the shortest idle timeout on the path (Linux's default TCP keepalive is 2 hours).

> **Insight:** Every stateful box on the path has its own idle timeout, and a connection lives only as long as the shortest one. Tune keepalives to the path, not to the two endpoints.

## 5. Small pages load, large ones hang

```d2 title="Drop the RELATED 'too big' ICMP and the large response never gets through"
shape: sequence_diagram
s: app {class: worker}
f: firewall {class: main}
h: "1200-byte hop" {class: ask}
s -> f: "1500-byte packet"
f -> h
h -> f: "ICMP: need 1200"
f -> s: "dropped: not ESTABLISHED" {class: lost}
```

```bash
sudo ./lab.sh mtu
```

```text
ESTABLISHED only:      /      200 20 bytes
                       /big   200 0 bytes   (headers arrived, body hung)
ESTABLISHED,RELATED:   /big   200 200000 bytes
```

**`200 0 bytes` is what an MTU problem looks like from outside:** the server said yes and the body vanished. Health checks fetch small pages, so they pass. Fix: accept `ESTABLISHED,RELATED`, and don't "block ICMP for security".

> **Insight:** When failures scale with response size, suspect MTU first. Dropping "unneeded" ICMP cuts the feedback loop TCP depends on.

## The ruleset that survives all five

```bash
iptables -P FORWARD DROP
iptables -A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -A FORWARD -m conntrack --ctstate INVALID -j DROP
iptables -t nat -A PREROUTING -i f-wan -d 203.0.113.10 -p tcp --dport 80 \
         -j DNAT --to-destination 10.0.1.5:8080
iptables -A FORWARD -i f-wan -o f-dmz -d 10.0.1.5 -p tcp --dport 8080 \
         -m conntrack --ctstate DNAT -j ACCEPT
iptables -t raw -A PREROUTING -i f-wan -d 10.0.0.0/8 -j DROP
```

## Checklist before you flip it on

| Intranet assumption | Change |
|---|---|
| "If you can reach me, you're an employee" | SSO with MFA on every route, APIs included |
| the internal IP is unreachable | allow only forwarded flows; drop private destinations on the WAN |
| the source IP is the user | trust `X-Forwarded-For` **only from your proxy** |
| plain HTTP is fine | TLS at the edge, HSTS |
| cookies without flags | `Secure`, `HttpOnly`, explicit `SameSite` |
| hidden admin pages | block admin routes at the proxy |

Roll out in steps (internal users through the proxy, then a few outside IPs, then everyone), and at every step **scan from outside: the public address *and* the internal one.**

## Takeaways

1. **A stateful firewall decides once per flow.** Every break follows from it.
2. **Location stops being a credential.** Identity at the proxy comes first.
3. **Allow the front door, not the destination** (`--ctstate DNAT`).
4. **Failures are silent.** Watch rule counters and `conntrack -E`, not app logs.
5. **Test from where attackers and users are.**

The incident came down to a door that was open when everyone assumed it was closed. Been bitten by a sixth way this breaks? The reply link below goes straight to my inbox.

<details>
<summary>Limits and references</summary>

- The machine in your browser is real Linux (kernel 6.12) with separate network namespaces, but no real latency or loss, and a 5-second idle timeout standing in for the minutes real middleboxes use.
- The [lab script](/labs/intranet-to-internet/lab.sh) runs the same steps on any Linux box with root.
- [Netfilter conntrack sysctl defaults](https://docs.kernel.org/networking/nf_conntrack-sysctl.html)
- [iptables-extensions: conntrack match (`--ctstate DNAT`, `--ctorigdst`)](https://ipset.netfilter.org/iptables-extensions.man.html)
- [Azure Load Balancer TCP reset and idle timeout](https://learn.microsoft.com/azure/load-balancer/load-balancer-tcp-reset)
- [RFC 1191: Path MTU Discovery](https://www.rfc-editor.org/rfc/rfc1191)

</details>
