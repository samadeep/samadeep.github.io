#!/usr/bin/env bash
# Intranet-to-internet lab: reproduce each failure from the post on one Linux machine.
#
#   sudo ./lab.sh up              build client / firewall / app network namespaces
#   sudo ./lab.sh dnat-bug        FORWARD rule written against the public IP (broken), then fixed
#   sudo ./lab.sh scan            what an outsider can reach: only the forwarded port answers
#   sudo ./lab.sh harden          the internal IP is reachable directly; three ways to close it
#   sudo ./lab.sh entry           show the conntrack entry for one request
#   sudo ./lab.sh asym            reply leaves through a second gateway with no conntrack entry
#   sudo ./lab.sh idle            middlebox idle timeout kills a quiet connection; keepalive saves it
#   sudo ./lab.sh mtu             a small-MTU hop + dropped ICMP hangs large responses; RELATED fixes it
#   sudo ./lab.sh down            remove everything
#
# Needs: root, iproute2, iptables, conntrack (conntrack-tools), socat, curl, python3, tcpdump.
# Touches only the namespaces it creates (lab-client, lab-fw, lab-app, lab-hop, lab-fw2).
set -euo pipefail

C=lab-client; F=lab-fw; A=lab-app; H=lab-hop; F2=lab-fw2
CLIENT=198.51.100.23; PUBLIC=203.0.113.10; APP=10.0.1.5; PORT=8080
nsx() { local ns=$1; shift; ip netns exec "$ns" "$@"; }
say() { printf '\n\033[1m$ %s\033[0m\n' "$*"; }
run() { say "$*"; eval "$*" || true; }

down() {
  for ns in $C $F $A $H $F2; do ip netns del "$ns" 2>/dev/null || true; done
}

up() {
  down
  for ns in $C $F $A; do ip netns add "$ns"; nsx "$ns" ip link set lo up; done
  # client <-> firewall (the "internet" side)
  ip link add c-wan netns $C type veth peer name f-wan netns $F
  nsx $C ip addr add $CLIENT/24 dev c-wan; nsx $C ip link set c-wan up
  nsx $F ip addr add 198.51.100.1/24 dev f-wan; nsx $F ip addr add $PUBLIC/32 dev f-wan; nsx $F ip link set f-wan up
  nsx $C ip route add $PUBLIC/32 via 198.51.100.1
  # firewall <-> app (the DMZ)
  ip link add f-dmz netns $F type veth peer name a-dmz netns $A
  nsx $F ip addr add 10.0.1.1/24 dev f-dmz; nsx $F ip link set f-dmz up
  nsx $A ip addr add $APP/24 dev a-dmz; nsx $A ip link set a-dmz up
  nsx $A ip route add default via 10.0.1.1
  nsx $F sysctl -qw net.ipv4.ip_forward=1
  rules_good
  start_app
  echo "lab up: client $CLIENT -> firewall $PUBLIC -> app $APP:$PORT"
}

start_app() {
  # the app: a tiny HTTP server; /big returns 200 KB so large responses can be tested
  nsx $A python3 - <<'PY' >/dev/null 2>&1 &
import http.server, socketserver, threading
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        body = b"x" * 200_000 if self.path == "/big" else b"hello from 10.0.1.5\n"
        self.send_response(200); self.send_header("Content-Length", str(len(body))); self.end_headers()
        self.wfile.write(body)
    def log_message(self, *a): pass
socketserver.ThreadingTCPServer.allow_reuse_address = True
socketserver.ThreadingTCPServer(("0.0.0.0", 8080), H).serve_forever()
PY
  sleep 0.5
}

rules_base() {
  nsx $F iptables -F; nsx $F iptables -t nat -F; nsx $F iptables -P FORWARD DROP
  nsx $F iptables -A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  nsx $F iptables -A FORWARD -m conntrack --ctstate INVALID -j DROP
  nsx $F iptables -t nat -A PREROUTING -i f-wan -d $PUBLIC -p tcp --dport 80 -j DNAT --to-destination $APP:$PORT
}
rules_good() { rules_base; nsx $F iptables -A FORWARD -i f-wan -o f-dmz -d $APP -p tcp --dport $PORT -m conntrack --ctstate NEW -j ACCEPT; }
rules_bug()  { rules_base; nsx $F iptables -A FORWARD -i f-wan -o f-dmz -d $PUBLIC -p tcp --dport 80 -m conntrack --ctstate NEW -j ACCEPT; }
flush_ct() { nsx $F conntrack -F >/dev/null 2>&1 || true; }

dnat_bug() {
  rules_bug; flush_ct
  echo "# broken: FORWARD rule matches the public IP"
  run "nsx $C curl -s -m 3 http://$PUBLIC/ || echo 'curl: timed out'"
  run "nsx $F iptables -L FORWARD -n -v | tail -1"
  run "nsx $F iptables -t nat -L PREROUTING -n -v | tail -1"
  rules_good; flush_ct
  echo; echo "# fixed: FORWARD rule matches the internal IP"
  run "nsx $C curl -s -m 3 http://$PUBLIC/"
  run "nsx $F iptables -L FORWARD -n -v | tail -1"
}

scan() {
  rules_good; flush_ct
  nsx $A socat TCP-LISTEN:22,reuseaddr,fork SYSTEM:'echo ssh' >/dev/null 2>&1 &   # a service nobody meant to publish
  local s=$!; sleep 0.3
  # an attacker who guesses the internal range and routes it at the firewall
  nsx $C ip route add 10.0.1.0/24 via 198.51.100.1 2>/dev/null || true
  echo "# the app box also listens on :22; only 203.0.113.10:80 is forwarded"
  for target in "$PUBLIC 80" "$PUBLIC 22" "$PUBLIC 8080" "$APP 22" "$APP 8080"; do
    set -- $target
    rc=0; nsx $C timeout 2 bash -c "exec 3<>/dev/tcp/$1/$2" 2>/dev/null || rc=$?
    case $rc in 0) r="open";; 124) r="no answer (dropped)";; *) r="refused";; esac
    printf '  %-15s port %-5s %s\n' "$1" "$2" "$r"
  done
  say "nsx $F iptables -L FORWARD -n -v | head -1"; nsx $F iptables -L FORWARD -n -v | head -1
  nsx $C ip route del 10.0.1.0/24 2>/dev/null || true
  kill $s 2>/dev/null || true
}

probe() {   # try the public port and the internal port from an attacker who routes 10.0.1.0/24 at the firewall
  nsx $C ip route add 10.0.1.0/24 via 198.51.100.1 2>/dev/null || true
  for target in "$PUBLIC 80" "$APP $PORT"; do
    set -- $target
    rc=0; nsx $C timeout 2 bash -c "exec 3<>/dev/tcp/$1/$2" 2>/dev/null || rc=$?
    case $rc in 0) r="open";; 124) r="no answer (dropped)";; *) r="refused";; esac
    printf '  %-15s port %-5s %s\n' "$1" "$2" "$r"
  done
  nsx $C ip route del 10.0.1.0/24 2>/dev/null || true
}

harden() {
  rules_good; flush_ct
  echo "# A: FORWARD allows -d $APP (the Finding 1 fix)"; probe
  nsx $F iptables -R FORWARD 3 -i f-wan -o f-dmz -d $APP -p tcp --dport $PORT -m conntrack --ctstate DNAT -j ACCEPT; flush_ct
  echo; echo "# B: only flows the firewall itself DNAT'd:  -m conntrack --ctstate DNAT"; probe
  nsx $F iptables -R FORWARD 3 -i f-wan -o f-dmz -d $APP -p tcp --dport $PORT -m conntrack --ctstate NEW --ctorigdst $PUBLIC --ctorigdstport 80 -j ACCEPT; flush_ct
  echo; echo "# C: original destination must be the public address:  --ctorigdst $PUBLIC --ctorigdstport 80"; probe
  rules_good; nsx $F iptables -t raw -A PREROUTING -i f-wan -d 10.0.0.0/8 -j DROP; flush_ct
  echo; echo "# D: A's rule, plus drop private destinations arriving on the WAN (raw PREROUTING)"; probe
  nsx $F iptables -t raw -F PREROUTING; rules_good
}

entry() {
  rules_good; flush_ct
  nsx $F timeout 3 conntrack -E -p tcp 2>/dev/null > /tmp/lab-entry.txt &
  sleep 0.3
  say "nsx $C curl -s http://$PUBLIC/   (while conntrack -E runs on the firewall)"
  nsx $C curl -s -m 3 http://$PUBLIC/
  wait || true
  cat /tmp/lab-entry.txt
}

asym() {
  rules_good; flush_ct
  # a second router, fw2, with no NAT and no conntrack history, becomes the app's default gateway
  ip netns add $F2; nsx $F2 ip link set lo up
  ip link add a-alt netns $A type veth peer name f2-dmz netns $F2
  nsx $A ip addr add 10.0.2.5/24 dev a-alt; nsx $A ip link set a-alt up
  nsx $F2 ip addr add 10.0.2.1/24 dev f2-dmz; nsx $F2 ip link set f2-dmz up
  ip link add f2-wan netns $F2 type veth peer name c-alt netns $C
  nsx $F2 ip addr add 198.51.101.1/24 dev f2-wan; nsx $F2 ip link set f2-wan up
  nsx $C ip addr add 198.51.101.23/24 dev c-alt; nsx $C ip link set c-alt up
  nsx $F2 sysctl -qw net.ipv4.ip_forward=1; nsx $F2 ip route add $CLIENT/32 via 198.51.101.23
  nsx $A ip route replace default via 10.0.2.1
  echo "# app's default route now points at fw2; the SYN still arrives through fw"
  nsx $C timeout 4 tcpdump -lni any -c 4 'tcp port 80 or tcp port 8080' 2>/dev/null > /tmp/lab-asym.txt &
  sleep 0.5
  run "nsx $C curl -s -m 3 http://$PUBLIC/ || echo 'curl: timed out'"
  wait || true
  say "tcpdump on the client"; cat /tmp/lab-asym.txt
  nsx $A ip route replace default via 10.0.1.1
  ip netns del $F2
}

idle() {
  rules_good; flush_ct
  local old; old=$(nsx $F sysctl -n net.netfilter.nf_conntrack_tcp_timeout_established)
  nsx $F sysctl -qw net.netfilter.nf_conntrack_tcp_timeout_established=5
  echo "# firewall idle timeout set to 5 s (stands in for a cloud LB's 4 minutes)"
  nsx $A socat TCP-LISTEN:9000,reuseaddr,fork SYSTEM:'read line; sleep 8; echo "pushed after 8s idle"' >/dev/null 2>&1 &
  local srv=$!
  nsx $F iptables -t nat -A PREROUTING -i f-wan -d $PUBLIC -p tcp --dport 9000 -j DNAT --to-destination $APP:9000
  nsx $F iptables -A FORWARD -i f-wan -o f-dmz -d $APP -p tcp --dport 9000 -m conntrack --ctstate NEW -j ACCEPT
  sleep 0.3
  nsx $F timeout 12 conntrack -E -p tcp --dport 9000 2>/dev/null > /tmp/lab-idle-ct.txt &
  say "client sends one line, then waits quietly (no keepalive)"
  ( echo hi; sleep 11 ) | nsx $C timeout 12 socat - TCP:$PUBLIC:9000 > /tmp/lab-idle-out.txt 2>&1 || true
  wait %?conntrack 2>/dev/null || true
  if grep -q "reset" /tmp/lab-idle-out.txt; then echo "client received: nothing; when it finally sent, the connection was reset"
  else echo "client received: $(tr -d '\n' < /tmp/lab-idle-out.txt)"; fi
  say "conntrack events on the firewall"; cat /tmp/lab-idle-ct.txt
  flush_ct
  say "same again, client sends a TCP keepalive every 2 s"
  nsx $F timeout 12 conntrack -E -p tcp --dport 9000 2>/dev/null > /tmp/lab-idle-ct2.txt &
  ( echo hi; sleep 11 ) | nsx $C timeout 12 socat - TCP:$PUBLIC:9000,keepalive,keepidle=2,keepintvl=2,keepcnt=3 > /tmp/lab-idle-out2.txt 2>&1 || true
  echo "client received: $(cat /tmp/lab-idle-out2.txt | tr -d '\n')"
  kill $srv 2>/dev/null || true
  nsx $F sysctl -qw net.netfilter.nf_conntrack_tcp_timeout_established="$old"
  rules_good
}

mtu() {
  # fresh chain: client -- hop (1200-byte link, e.g. a VPN) -- firewall -- app
  down
  for ns in $C $H $F $A; do ip netns add "$ns"; nsx "$ns" ip link set lo up; done
  ip link add c-wan netns $C type veth peer name h-in netns $H
  ip link add h-out netns $H type veth peer name f-wan netns $F
  ip link add f-dmz netns $F type veth peer name a-dmz netns $A
  nsx $C ip addr add $CLIENT/24 dev c-wan;       nsx $C ip link set c-wan up
  nsx $H ip addr add 198.51.100.254/24 dev h-in; nsx $H ip link set h-in up mtu 1200
  nsx $H ip addr add 192.0.2.2/24 dev h-out;     nsx $H ip link set h-out up
  nsx $F ip addr add 192.0.2.1/24 dev f-wan; nsx $F ip addr add $PUBLIC/32 dev f-wan; nsx $F ip link set f-wan up
  nsx $F ip addr add 10.0.1.1/24 dev f-dmz;      nsx $F ip link set f-dmz up
  nsx $A ip addr add $APP/24 dev a-dmz;          nsx $A ip link set a-dmz up
  nsx $C ip route add default via 198.51.100.254
  nsx $H ip route add default via 192.0.2.1
  nsx $F ip route add $CLIENT/32 via 192.0.2.2
  nsx $A ip route add default via 10.0.1.1
  nsx $H sysctl -qw net.ipv4.ip_forward=1; nsx $F sysctl -qw net.ipv4.ip_forward=1
  rules_good
  start_app
  echo "# the hop's link toward the client is 1200 bytes; the app sends 1500-byte packets with Don't Fragment set"
  echo; echo "# firewall forwards ESTABLISHED only, so ICMP 'fragmentation needed' (RELATED) is dropped"
  nsx $F iptables -R FORWARD 1 -m conntrack --ctstate ESTABLISHED -j ACCEPT
  run "nsx $C timeout 6 curl -s -m 4 -o /dev/null -w '%{http_code} %{size_download} bytes\n' http://$PUBLIC/ || echo 'small page: failed'"
  run "nsx $C timeout 8 curl -s -m 6 -o /dev/null -w '%{http_code} %{size_download} bytes\n' http://$PUBLIC/big || echo 'large page: timed out'"
  nsx $A ip route flush cache 2>/dev/null || true; flush_ct
  echo; echo "# firewall forwards ESTABLISHED,RELATED"
  nsx $F iptables -R FORWARD 1 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  run "nsx $C timeout 8 curl -s -m 6 -o /dev/null -w '%{http_code} %{size_download} bytes\n' http://$PUBLIC/big"
  say "nsx $A ip route get $CLIENT"; nsx $A ip route get $CLIENT | head -2
}

case "${1:-}" in
  up) up ;; down) down ;; dnat-bug) dnat_bug ;; scan) scan ;; harden) harden ;; entry) entry ;; asym) asym ;; idle) idle ;; mtu) mtu ;;
  *) sed -n '2,15p' "$0"; exit 1 ;;
esac
