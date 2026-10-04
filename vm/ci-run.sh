#!/usr/bin/env bash
# Run a CI step and surface its output as an annotation (readable through the checks API):
# a notice with the tail on success, an error with the tail on failure.
#   vm/ci-run.sh <label> <command...>
label=$1; shift
log=$(mktemp)
"$@" 2>&1 | tee "$log"; rc=${PIPESTATUS[0]}
tail_txt=$(tail -n 60 "$log" | sed 's/\x1b\[[0-9;]*[A-Za-z]//g' | cut -c1-200)
enc=$(printf '%s' "$tail_txt" | sed ':a;N;$!ba;s/%/%25/g;s/\r/%0D/g;s/\n/%0A/g')
if [ "$rc" -eq 0 ]; then echo "::notice title=$label::$enc"; else echo "::error title=$label (exit $rc)::$enc"; fi
exit "$rc"
