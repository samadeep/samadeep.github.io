#!/bin/sh
# Agent sandbox: assume the box is already owned.
#
# Models the rule every serious agent platform now follows: the sandbox holds
# no credentials, and it has no network card. The only way out is a single
# point-to-point channel to a broker that runs OUTSIDE the box, holds the real
# token in its own memory, checks policy, and injects the credential on the
# wire. A fully compromised sandbox finds nothing to steal and can reach nothing
# directly.
#
#   sandbox netns (lo only)            host netns
#   +---------------------+            +-------------------------------+
#   |  agent code         |  unix sock |  broker (holds REAL token)    |
#   |  no token, no NIC   |===========>|  check policy, inject token   |--> backend :9443
#   +---------------------+  broker.sock+-------------------------------+
#
# Needs root, ip (iproute2) and socat. Subcommands:
#   up legit exfil escape replay down   (or: all)
set -eu

RT=/tmp/agent-lab
SOCK="$RT/broker.sock"
NS=sandbox
REAL_TOKEN="acme-drive-oauth-9f2c7a1b40e81"      # lives only in the broker's memory
WORKLOAD_ID="spiffe://agents/pod-14/sandbox/7f3a" # public id, not a credential
BACKEND_PORT=9443

log()  { printf '%s\n' "$*"; }
rule() { printf '\n== %s ==\n' "$*"; }

write_helpers() {
  mkdir -p "$RT/workspace"
  # The sandbox's whole writable world. Note what is NOT here: any token.
  printf 'notes for monday: finish the migration\n' > "$RT/workspace/todo.txt"

  # backend.sh: the resource server. Accepts ONLY the real token. Speaks one
  # line in, one line out. "GET <path>" then "AUTH <token>".
  cat > "$RT/backend.sh" <<'EOF'
#!/bin/sh
read -r verb path   || exit 0
read -r akey atok   || exit 0
if [ "$akey" != "AUTH" ]; then printf '400 bad request\n'; exit 0; fi
if [ "$atok" = "acme-drive-oauth-9f2c7a1b40e81" ] && [ "${path#drive/}" != "$path" ]; then
  printf '200 %s = "Q3 revenue model, do not share"\n' "$path"
else
  printf '403 forbidden (token not accepted)\n'
fi
EOF

  # broker.sh: runs OUTSIDE the box. Reads one request line from the sandbox,
  # enforces an egress allowlist, injects the real token toward the backend,
  # and relays the body back. The token never travels toward the sandbox.
  cat > "$RT/broker.sh" <<'EOF'
#!/bin/sh
REAL_TOKEN="acme-drive-oauth-9f2c7a1b40e81"
# The caller's identity is attested by the channel, not sent by the box. A box
# cannot claim to be someone else, because it never gets to name itself.
ATTESTED_ID="spiffe://agents/pod-14/sandbox/7f3a"
read -r op path || exit 0
if [ "$op" != "OPEN" ] || [ "${path#drive/}" = "$path" ]; then
  printf 'broker: DENY %s (off policy)\n' "$path"; exit 0
fi
printf 'broker: %s asked for %s -> inject Authorization: Bearer %s... (%s chars)\n' \
  "$ATTESTED_ID" "$path" "$(printf %s "$REAL_TOKEN" | cut -c1-6)" "$(printf %s "$REAL_TOKEN" | wc -c)" >&2
printf 'GET %s\nAUTH %s\n' "$path" "$REAL_TOKEN" | socat - TCP:127.0.0.1:9443
EOF
  chmod +x "$RT/backend.sh" "$RT/broker.sh"
}

in_box() { ip netns exec "$NS" env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin HOME="$RT/workspace" "$@"; }

cmd_up() {
  rule "up: build the box with no NIC, start the backend and the broker"
  mkdir -p "$RT"; write_helpers
  ip netns add "$NS" 2>/dev/null || true
  ip netns exec "$NS" ip link set lo up
  log "sandbox interfaces (loopback only, no route to anywhere):"
  ip netns exec "$NS" ip -br addr
  # backend on the HOST loopback only. The sandbox's loopback is a different one.
  socat TCP-LISTEN:$BACKEND_PORT,bind=127.0.0.1,fork,reuseaddr SYSTEM:"$RT/backend.sh" &
  echo $! > "$RT/backend.pid"
  # broker: unix socket the box can see, token held in this process's memory.
  socat UNIX-LISTEN:"$SOCK",fork,reuseaddr SYSTEM:"$RT/broker.sh" &
  echo $! > "$RT/broker.pid"
  sleep 0.4
  log "backend pid $(cat "$RT/backend.pid"), broker pid $(cat "$RT/broker.pid"), socket $SOCK"
}

cmd_legit() {
  rule "legit: agent opens a Drive doc through the broker"
  log "the box sends only this line, and holds no token:"
  log "  OPEN drive/doc/42"
  out=$(in_box sh -c "printf 'OPEN drive/doc/42\n' | socat - UNIX-CONNECT:$SOCK")
  log "box receives: $out"
  log "the credential was added by the broker, on the far side. The box never saw it."
}

cmd_exfil() {
  rule "exfil: attacker has full root in the box. Steal the keys."
  log "env inside the box:"
  in_box sh -c 'cd "$HOME"; unset OLDPWD; env | sort | sed "s/^/  /"'
  log "search the box's whole writable filesystem for the token:"
  rc=0
  in_box sh -c "grep -rI 'acme-drive-oauth' \"\$HOME\"" 2>/dev/null || rc=$?
  if [ "$rc" -ne 0 ]; then log "  (nothing. the box holds no secret to steal.)"; fi
}

cmd_escape() {
  rule "escape: skip the broker, reach the backend and the internet directly"
  log "try the resource backend straight (127.0.0.1:$BACKEND_PORT, inside the box):"
  rc=0
  in_box sh -c "printf 'GET drive/doc/42\nAUTH x\n' | socat -T2 - TCP:127.0.0.1:$BACKEND_PORT" || rc=$?
  log "  -X- connection refused: the box's loopback is its own, backend isn't on it (rc=$rc)"
  log "try the cloud metadata server (169.254.169.254:80):"
  rc=0
  in_box socat -T2 - TCP:169.254.169.254:80 </dev/null || rc=$?
  log "  -X- no route: the box has no NIC and no default gateway (rc=$rc)"
}

cmd_replay() {
  rule "replay: say the box's identity leaked. Use it from the attacker's own machine."
  log "attacker has the box's workload id: $WORKLOAD_ID"
  log "they present it straight to the backend as the token (from a host with a real NIC):"
  out=$(printf 'GET drive/doc/42\nAUTH %s\n' "$WORKLOAD_ID" | socat - TCP:127.0.0.1:$BACKEND_PORT)
  log "backend says: $out"
  log "the workload id names the box; it is not a key. Only the broker can mint the real one."
}

cmd_down() {
  rule "down: tear it all down"
  [ -f "$RT/backend.pid" ] && kill "$(cat "$RT/backend.pid")" 2>/dev/null || true
  [ -f "$RT/broker.pid" ]  && kill "$(cat "$RT/broker.pid")"  2>/dev/null || true
  ip netns del "$NS" 2>/dev/null || true
  rm -rf "$RT"
  log "clean."
}

case "${1:-all}" in
  up) cmd_up ;; legit) cmd_legit ;; exfil) cmd_exfil ;;
  escape) cmd_escape ;; replay) cmd_replay ;; down) cmd_down ;;
  all) cmd_up; cmd_legit; cmd_exfil; cmd_escape; cmd_replay; cmd_down ;;
  *) echo "usage: $0 {up|legit|exfil|escape|replay|down|all}" >&2; exit 2 ;;
esac
