#!/usr/bin/env bash
# Watches the context usage of every agent transcript in this project — from any session,
# not only the one that started the watcher. With several sessions on one repo it will
# alert on an agent that is not yours. The printed line names it; read the name.
# Exits — which wakes the coordinator — when an agent passes its next mark,
# or when every agent it watched has stopped writing.
#
# Each agent has two marks: wind-down (WIND_DOWN) and landing-window end (LAND). The
# watcher alerts once per agent per mark. It writes each alert to a state file, so a
# restarted watcher does not repeat an alert, and watches that agent for its next mark.
# Restart the same command after every alert. There is no mark to choose.
#
# It reads transcripts and nothing else. It never stops an agent: the coordinator
# does that, by message, so the agent lands on a clean point and writes a handoff.
#
#   watch-agent-context.sh [project-transcript-dir]
#
# Env: WIND_DOWN (200000) LAND (250000) POLL (30s) IDLE (180s) MAX (7200s)
#      STATE (a file in TMPDIR, one per transcript dir)
#
# Exit 1 is the alert, not a failure. There is no error path here. 1 means an agent
# crossed a mark and the coordinator must act; 0 means every agent stopped writing,
# or the watcher timed out. The harness renders 1 as "failed with exit code 1" — that
# wording is the harness's. Read the printed line, not the code.

set -uo pipefail

WIND_DOWN=${WIND_DOWN:-200000}
LAND=${LAND:-250000}
POLL=${POLL:-30}
IDLE=${IDLE:-180}
MAX=${MAX:-7200}

root=${1:-"$HOME/.claude/projects/$(pwd | sed 's#[/._]#-#g')"}
[ -d "$root" ] || root="$HOME/.claude/projects"

STATE=${STATE:-"${TMPDIR:-/tmp}/context-watcher-$(printf '%s' "$root" | md5sum | cut -c1-12).alerted"}
touch "$STATE"

started=$(date +%s)

context_tokens() {
  grep -o '"usage":{[^}]*}' "$1" 2>/dev/null | tail -1 \
    | grep -oE '"(input_tokens|cache_creation_input_tokens|cache_read_input_tokens)":[0-9]+' \
    | awk -F: '{ sum += $2 } END { print sum + 0 }'
}

label() {
  sed -n 's/.*"description":"\([^"]*\)".*/\1/p' "${1%.jsonl}.meta.json" 2>/dev/null
}

# The highest mark this agent was already alerted at, or 0.
alerted_mark() {
  awk -v f="$1" '$2 == f && $1 > max { max = $1 } END { print max + 0 }' "$STATE"
}

# The first mark above the last alert, or nothing when both marks are spent.
next_mark() {
  local last=$1
  if [ "$last" -lt "$WIND_DOWN" ]; then echo "$WIND_DOWN"
  elif [ "$last" -lt "$LAND" ]; then echo "$LAND"
  fi
}

alert() {
  local file=$1 tokens=$2 mark=$3
  printf '%s %s\n' "$mark" "$file" >> "$STATE"
  printf 'context watcher: %s is at %s tokens (mark %s).\n' "$(label "$file")" "$tokens" "$mark"
  if [ "$mark" -ge "$LAND" ]; then
    echo "Its landing window is over. Tell it to write the handoff now and report."
  else
    echo "Send it a message: stop at the next clean point and write a handoff."
    echo "It has room to land. Do not stop it — let it finish the handoff."
  fi
  echo "Restart this watcher. It will not repeat this alert."
  exit 1
}

seen_any=0

while :; do
  now=$(date +%s)
  [ $((now - started)) -ge "$MAX" ] && { echo "context watcher: stopped after ${MAX}s"; exit 0; }

  live=0
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    seen_any=1
    touched=$(stat -c %Y "$file")
    [ $((now - touched)) -lt "$IDLE" ] && live=$((live + 1))

    mark=$(next_mark "$(alerted_mark "$file")")
    [ -n "$mark" ] || continue

    tokens=$(context_tokens "$file")
    # An agent that jumps past both marks between polls gets the later alert only.
    [ "$tokens" -ge "$LAND" ] && [ "$mark" -lt "$LAND" ] && mark=$LAND
    [ "$tokens" -ge "$mark" ] && alert "$file" "$tokens" "$mark"
  done < <(find "$root" -path '*/subagents/agent-*.jsonl' -newermt "@$started" 2>/dev/null)

  if [ "$seen_any" = 1 ] && [ "$live" = 0 ]; then
    echo "context watcher: every agent it watched has stopped writing."
    exit 0
  fi

  sleep "$POLL"
done
