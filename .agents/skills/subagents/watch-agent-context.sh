#!/usr/bin/env bash
# Watches the context usage of subagents this session spawns.
# Exits — which wakes the coordinator — when an agent passes the wind-down mark,
# or when every agent it watched has stopped writing.
#
# It reads transcripts and nothing else. It never stops an agent: the coordinator
# does that, by message, so the agent lands on a clean point and writes a handoff.
#
#   watch-agent-context.sh [project-transcript-dir]
#
# Env: WIND_DOWN (200000) POLL (30s) IDLE (180s) MAX (7200s)

set -uo pipefail

WIND_DOWN=${WIND_DOWN:-200000}
POLL=${POLL:-30}
IDLE=${IDLE:-180}
MAX=${MAX:-7200}

root=${1:-"$HOME/.claude/projects/$(pwd | sed 's#[/._]#-#g')"}
[ -d "$root" ] || root="$HOME/.claude/projects"

started=$(date +%s)

context_tokens() {
  grep -o '"usage":{[^}]*}' "$1" 2>/dev/null | tail -1 \
    | grep -oE '"(input_tokens|cache_creation_input_tokens|cache_read_input_tokens)":[0-9]+' \
    | awk -F: '{ sum += $2 } END { print sum + 0 }'
}

label() {
  sed -n 's/.*"description":"\([^"]*\)".*/\1/p' "${1%.jsonl}.meta.json" 2>/dev/null
}

seen_any=0

while :; do
  now=$(date +%s)
  [ $((now - started)) -ge "$MAX" ] && { echo "context watcher: stopped after ${MAX}s"; exit 0; }

  live=0
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    seen_any=1
    tokens=$(context_tokens "$file")
    touched=$(stat -c %Y "$file")

    if [ "$tokens" -ge "$WIND_DOWN" ]; then
      printf 'context watcher: %s is at %s tokens (wind-down %s).\n' \
        "$(label "$file")" "$tokens" "$WIND_DOWN"
      echo "Send it a message: stop at the next clean point and write a handoff."
      echo "It has room to land. Do not stop it — let it finish the handoff."
      exit 1
    fi

    [ $((now - touched)) -lt "$IDLE" ] && live=$((live + 1))
  done < <(find "$root" -path '*/subagents/agent-*.jsonl' -newermt "@$started" 2>/dev/null)

  if [ "$seen_any" = 1 ] && [ "$live" = 0 ]; then
    echo "context watcher: every agent it watched finished under ${WIND_DOWN} tokens."
    exit 0
  fi

  sleep "$POLL"
done
