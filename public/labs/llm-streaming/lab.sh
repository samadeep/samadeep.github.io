#!/usr/bin/env bash
# LLM streaming lab: a fake model behind SSE and WebSockets, an nginx in front, and a GPU routing simulator.
# Needs: node 18+, python3, nginx (apt-get install nginx). Run from this folder.
#   ./lab.sh setup      npm install (ws)
#   ./lab.sh conns [N]  N concurrent chats over SSE and WS, one write per token vs coalesced (default 10000)
#   ./lab.sh proxy      the same chat direct, through nginx, and through nginx with gzip
#   ./lab.sh resume     drop a chat after 20 tokens and resume it with Last-Event-ID
#   ./lab.sh route      round-robin vs prefix hashing vs cache+load routing on a simulated GPU fleet
#   ./lab.sh down       stop everything
set -euo pipefail
cd "$(dirname "$0")"
ulimit -n 65536 2>/dev/null || true

stop_server() { for p in $(ps -eo pid,args | awk '/node server.mjs/ && !/awk/ {print $1}'); do kill "$p"; done; sleep 1; }
start_server() { stop_server; env "$@" node server.mjs >/tmp/llm-lab-server.log 2>&1 & sleep 1; head -1 /tmp/llm-lab-server.log; }
stop_nginx() { for f in /tmp/llm-lab-nginx.pid /tmp/llm-lab-nginx-gz.pid; do [ -f "$f" ] && kill "$(cat "$f")" 2>/dev/null; rm -f "$f"; done; true; }

case "${1:-}" in
  setup) npm install --no-audit --no-fund ;;
  conns)
    N="${2:-10000}"
    for flush in 0 50; do for mode in sse ws; do
      start_server FLUSH_MS=$flush
      echo "== $mode, FLUSH_MS=$flush"; node load.mjs "$mode" "$N"
    done; done
    stop_server ;;
  proxy)
    stop_nginx; nginx -c "$PWD/nginx.conf"; nginx -c "$PWD/nginx-gzip.conf"
    start_server NO_BUFFER_HEADER=1
    echo "== direct";                                         node probe.mjs "http://127.0.0.1:8080/sse?id=p1"
    echo "== nginx defaults (proxy_buffering on)";            node probe.mjs "http://127.0.0.1:8081/sse?id=p2"
    echo "== nginx + gzip on text/event-stream";              node probe-gzip.mjs "http://127.0.0.1:8082/sse?id=p3"
    start_server
    echo "== nginx + gzip, upstream sends X-Accel-Buffering: no"; node probe-gzip.mjs "http://127.0.0.1:8082/sse?id=p4"
    stop_server; stop_nginx ;;
  resume)
    start_server
    node probe.mjs "http://127.0.0.1:8080/sse?id=r$RANDOM" resume 20
    stop_server ;;
  route)
    python3 route_sim.py --users 4000
    echo; echo "== double the traffic, same fleet"
    python3 route_sim.py --users 8000 | tail -6 ;;
  down) stop_server; stop_nginx ;;
  *) sed -n '2,10p' "$0"; exit 1 ;;
esac
