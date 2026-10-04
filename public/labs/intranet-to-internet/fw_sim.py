#!/usr/bin/env python3
"""A teaching model of the lab's firewall: netfilter's path for a forwarded TCP flow, with conntrack.

It is NOT the kernel. It models the parts the post's findings depend on:
  raw PREROUTING -> conntrack lookup -> nat PREROUTING (DNAT) -> routing -> filter FORWARD -> reverse NAT
Rules are written in iptables syntax (a subset). Edit RULESETS below, or pass --rules custom and edit CUSTOM.

  python fw_sim.py --rules bug                     Finding 1: FORWARD rule written against the public IP
  python fw_sim.py --rules good --test direct      Finding 2: the internal IP answers directly (side door)
  python fw_sim.py --compare A B C D               Finding 2: four ways to write the rule, side by side
  python fw_sim.py --rules est-only --test big     Finding 5: ESTABLISHED-only drops the MTU ICMP
  python fw_sim.py --rules good --test idle        Finding 4: idle timeout, then a late push
"""
import argparse, shlex

CLIENT, ATTACKER, PUBLIC, APP, PORT = '198.51.100.23', '198.51.100.66', '203.0.113.10', '10.0.1.5', 8080

BASE = """
-P FORWARD DROP
-A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
-A FORWARD -m conntrack --ctstate INVALID -j DROP
-t nat -A PREROUTING -i f-wan -d 203.0.113.10 -p tcp --dport 80 -j DNAT --to-destination 10.0.1.5:8080
"""
RULESETS = {
    'bug':  BASE + "-A FORWARD -i f-wan -o f-dmz -d 203.0.113.10 -p tcp --dport 80 -m conntrack --ctstate NEW -j ACCEPT",
    'good': BASE + "-A FORWARD -i f-wan -o f-dmz -d 10.0.1.5 -p tcp --dport 8080 -m conntrack --ctstate NEW -j ACCEPT",
    'A':    BASE + "-A FORWARD -i f-wan -o f-dmz -d 10.0.1.5 -p tcp --dport 8080 -j ACCEPT",
    'B':    BASE + "-A FORWARD -i f-wan -o f-dmz -d 10.0.1.5 -p tcp --dport 8080 -m conntrack --ctstate DNAT -j ACCEPT",
    'C':    BASE + "-A FORWARD -i f-wan -o f-dmz -d 10.0.1.5 -p tcp --dport 8080 -m conntrack --ctstate NEW --ctorigdst 203.0.113.10 --ctorigdstport 80 -j ACCEPT",
    'D':    BASE + "-A FORWARD -i f-wan -o f-dmz -d 10.0.1.5 -p tcp --dport 8080 -j ACCEPT\n-t raw -A PREROUTING -i f-wan -d 10.0.0.0/8 -j DROP",
    'est-only': BASE.replace('ESTABLISHED,RELATED', 'ESTABLISHED') + "-A FORWARD -i f-wan -o f-dmz -d 10.0.1.5 -p tcp --dport 8080 -m conntrack --ctstate NEW -j ACCEPT",
}
CUSTOM = RULESETS['good']   # edit me, then run with --rules custom


class Rule:
    def __init__(self, line):
        t = shlex.split(line)
        self.text, self.table, self.pkts, self.m = line.strip(), 'filter', 0, {}
        i = 0
        while i < len(t):
            k = t[i]
            if k == '-t': self.table = t[i + 1]; i += 2; continue
            if k in ('-A', '-P'): self.chain = t[i + 1]; self.policy = t[i + 2] if k == '-P' else None; i += 3 if k == '-P' else 2; continue
            if k == '-m': i += 2; continue
            if k == '-j': self.target = t[i + 1]; i += 2; continue
            self.m[k] = t[i + 1]; i += 2

    def match(self, p, ct_state):
        m = self.m
        if '-i' in m and p['in'] != m['-i']: return False
        if '-o' in m and p['out'] != m['-o']: return False
        if '-p' in m and m['-p'] != 'tcp': return False
        if '-d' in m and not in_net(p['dst'], m['-d']): return False
        if '--dport' in m and p['dport'] != int(m['--dport']): return False
        if '--ctstate' in m and not (set(m['--ctstate'].split(',')) & ct_state): return False
        if '--ctorigdst' in m and p['ct'].get('orig_dst') != m['--ctorigdst']: return False
        if '--ctorigdstport' in m and p['ct'].get('orig_dport') != int(m['--ctorigdstport']): return False
        return True


def in_net(ip, net):
    if '/' not in net: return ip == net
    base, bits = net.split('/')
    to_i = lambda s: sum(int(o) << (24 - 8 * k) for k, o in enumerate(s.split('.')))
    mask = (0xFFFFFFFF << (32 - int(bits))) & 0xFFFFFFFF
    return to_i(ip) & mask == to_i(base) & mask


class Firewall:
    def __init__(self, text):
        self.rules = [Rule(l) for l in text.strip().splitlines() if l.strip() and not l.strip().startswith('#')]
        self.policy = {r.chain: r.policy for r in self.rules if r.policy}
        self.conntrack = []

    def chain(self, table, chain):
        return [r for r in self.rules if r.table == table and getattr(r, 'chain', '') == chain and not r.policy]

    def forward(self, p, ct_state):
        for r in self.chain('filter', 'FORWARD'):
            if r.match(p, ct_state):
                r.pkts += 1
                return r.target, r
        return self.policy.get('FORWARD', 'ACCEPT'), None

    def inbound(self, src, dst, dport):
        """A SYN arriving on the WAN. Returns (verdict, reason)."""
        p = {'in': 'f-wan', 'src': src, 'dst': dst, 'dport': dport, 'ct': {}}
        for r in self.chain('raw', 'PREROUTING'):
            if r.match(p, {'NEW'}): r.pkts += 1; return 'DROP', f'raw PREROUTING: {r.text}'
        state = {'NEW'}
        for r in self.chain('nat', 'PREROUTING'):
            if r.match(p, state) and r.target == 'DNAT':
                r.pkts += 1
                to = r.m['--to-destination']; host, port = to.split(':')
                p['ct'] = {'orig_dst': dst, 'orig_dport': dport}
                p['dst'], p['dport'] = host, int(port)
                state = {'NEW', 'DNAT'}
                break
        p['out'] = 'f-dmz' if in_net(p['dst'], '10.0.1.0/24') else ('local' if p['dst'] == PUBLIC else 'f-wan')
        if p['out'] == 'local':
            return 'REFUSED', 'no DNAT matched: the packet is for the firewall itself, nothing listens there'
        verdict, rule = self.forward(p, state)
        if verdict != 'ACCEPT':
            return 'DROP', 'FORWARD: no rule matched, policy DROP' if rule is None else f'FORWARD: {rule.text}'
        entry = dict(src=src, dst=dst, dport=dport, rsrc=p['dst'], rsport=p['dport'], state='ESTABLISHED')
        self.conntrack.append(entry)
        # the SYN-ACK comes back from the app: ESTABLISHED in conntrack, then reverse NAT
        back = {'in': 'f-dmz', 'out': 'f-wan', 'src': p['dst'], 'dst': src, 'dport': 0, 'ct': p['ct']}
        v2, _ = self.forward(back, {'ESTABLISHED'})
        if v2 != 'ACCEPT':
            return 'DROP', 'the reply was dropped: nothing accepts ESTABLISHED traffic'
        if p['ct']:
            return 'ACCEPT', f'reply source rewritten {p["dst"]}:{p["dport"]} -> {dst}:{dport} by conntrack'
        return 'ACCEPT', 'no DNAT involved: the app answered from its internal address, skipping the front door'

    def related_icmp(self):
        """'Fragmentation needed' from the 1200-byte hop, travelling back to the app."""
        p = {'in': 'f-wan', 'out': 'f-dmz', 'src': '198.51.100.2', 'dst': APP, 'dport': 0, 'ct': {}}
        return self.forward(p, {'RELATED'})

    def counters(self):
        out, seen = [], []
        for r in self.rules:
            key = (r.table, r.chain)
            if r.policy or key in seen: continue
            seen.append(key)
            pol = self.policy.get(r.chain, 'ACCEPT') if r.table == 'filter' else 'ACCEPT'
            out.append(f'  Chain {r.chain} ({r.table}, policy {pol})')
            for x in self.chain(*key):
                out.append(f'  {x.pkts:>4} pkts  {x.text}')
        return '\n'.join(out)


def curl(fw, src, dst, dport):
    for _ in range(3):                      # a dropped SYN is retransmitted; curl gives up after ~3 s
        v, why = fw.inbound(src, dst, dport)
        if v != 'DROP': break
    if v == 'ACCEPT': return f'hello from {APP}', why
    if v == 'REFUSED': return 'curl: connection refused', why
    return 'curl: timed out (3 SYNs, no answer)', why


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--rules', default='good', choices=[*RULESETS, 'custom'])
    ap.add_argument('--test', default='front', choices=['front', 'direct', 'big', 'idle'])
    ap.add_argument('--compare', nargs='*', help='rulesets to compare for front door vs direct')
    ap.add_argument('--idle-timeout', type=float, default=5, help='seconds a middlebox keeps an idle entry')
    ap.add_argument('--push-after', type=float, default=8, help='app pushes after this many idle seconds')
    ap.add_argument('--keepalive', type=float, default=0, help='TCP keepalive interval, 0 = off (Linux default is 7200)')
    a = ap.parse_args()

    if a.compare:
        print(f"{'':6}{'203.0.113.10:80 (front door)':32}{'10.0.1.5:8080 (direct)'}")
        for name in a.compare:
            res = []
            for (src, dst, port) in [(CLIENT, PUBLIC, 80), (ATTACKER, APP, PORT)]:
                v, _ = Firewall(RULESETS[name]).inbound(src, dst, port)
                res.append('open' if v == 'ACCEPT' else 'dropped')
            flag = '  <- bypasses the proxy' if res[1] == 'open' else ''
            print(f'{name:6}{res[0]:32}{res[1]}{flag}')
        return

    fw = Firewall(CUSTOM if a.rules == 'custom' else RULESETS[a.rules])
    if a.test in ('front', 'direct'):
        src, dst, port = (CLIENT, PUBLIC, 80) if a.test == 'front' else (ATTACKER, APP, PORT)
        print(f'$ curl -s -m 3 http://{dst}:{port}/      # from {src}')
        body, why = curl(fw, src, dst, port)
        print(body)
        print(f'  why: {why}')
    elif a.test == 'big':
        print('$ curl http://203.0.113.10/big      # 200,000-byte body over a 1200-byte link, DF set')
        body, why = curl(fw, CLIENT, PUBLIC, 80)
        if 'hello' not in body:
            print(body); print(f'  why: {why}')
        else:
            v, rule = fw.related_icmp()
            if v == 'ACCEPT':
                print('200 200000 bytes')
                print("  why: ICMP 'need MTU 1200' matched RELATED, the app lowered its MTU and resent")
            else:
                print('200 0 bytes   (headers arrived, body hung)')
                print("  why: ICMP 'need MTU 1200' is RELATED, not ESTABLISHED; " + ('policy DROP' if rule is None else rule.text))
    else:
        body, why = curl(fw, CLIENT, PUBLIC, 80)
        if 'hello' not in body:
            print(body); return
        print(f'$ open a connection, say hi, then wait. Middlebox idle timeout: {a.idle_timeout:g}s')
        t, alive = 0.0, True
        step = a.keepalive if a.keepalive else None
        while t < a.push_after:
            nxt = min(a.push_after, t + step) if step else a.push_after
            if nxt - t > a.idle_timeout:
                print(f'  [DESTROY] t={t + a.idle_timeout:g}s  tcp ESTABLISHED src={CLIENT} dst={PUBLIC} dport=80 ... [ASSURED]')
                alive = False
                fw.conntrack.clear()
                break
            t = nxt
            if step and t < a.push_after:
                print(f'  t={t:g}s  keepalive probe, entry refreshed')
        if alive:
            print(f'  t={a.push_after:g}s  app pushes -> client received: pushed after {a.push_after:g}s idle')
        else:
            print(f'  t={a.push_after:g}s  app pushes -> no entry, INVALID on the way out, dropped (retransmitted, still dropped)')
            print(f'  client sends FIN -> no entry, the packet is for the firewall itself -> RST from the firewall')
            print('  client received: nothing; when it finally sent, the connection was reset')
    print('\n$ iptables -L -n -v   (counters)')
    print(fw.counters())
    if fw.conntrack:
        e = fw.conntrack[0]
        print('\n$ conntrack -L')
        print(f"  tcp 6 432000 ESTABLISHED src={e['src']} dst={e['dst']} dport={e['dport']} "
              f"src={e['rsrc']} sport={e['rsport']} [ASSURED]")


if __name__ == '__main__':
    main()
