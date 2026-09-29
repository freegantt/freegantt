#!/usr/bin/env bash
# Watches the context usage of every agent transcript in this project — from any session,
# not only the one that started the watcher. With several sessions on one repo it will
# alert on an agent that is not yours. The printed line names it; read the name.
# Exits — which wakes the coordinator — when an agent passes its next mark,
# or when every agent it watched has stopped.
#
# Is an agent still running? `agent-state.mjs` reads its transcript and answers:
#   done     its last reply ended its turn, and every background task it started reported.
#   waiting  its turn ended, but a background task it started has not reported yet.
#   working  a tool runs, or a reply streams.
# Only when that answer cannot be trusted does growth decide. A working agent whose
# transcript has not grown for IDLE is stuck; a waiting one gets WAIT_IDLE, since a
# gate it waits on can run for 15 minutes without a line.
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
# Env: WIND_DOWN (200000) LAND (250000) POLL (30s) IDLE (900s) WAIT_IDLE (1800s) MAX (7200s)
#      STATE (a file in TMPDIR, one per transcript dir)
#
# Exit 1 is the alert, not a failure. There is no error path here. 1 means an agent
# crossed a mark and the coordinator must act; 0 means every agent stopped,
# or the watcher timed out. The harness renders 1 as "failed with exit code 1" — that
# wording is the harness's. Read the printed line, not the code.
#
# Blind spot: a transcript gets a usage line only when a reply ends. While an agent
# streams one long reply (a planner writing its plan), the count stays at the last
# finished reply. The next alert fires when that reply lands, not before.

set -uo pipefail

WIND_DOWN=${WIND_DOWN:-200000}
LAND=${LAND:-250000}
POLL=${POLL:-30}
IDLE=${IDLE:-900}
WAIT_IDLE=${WAIT_IDLE:-1800}
MAX=${MAX:-7200}

root=${1:-"$HOME/.claude/projects/$(pwd | sed 's#[/._]#-#g')"}
[ -d "$root" ] || root="$HOME/.claude/projects"

STATE=${STATE:-"${TMPDIR:-/tmp}/context-watcher-$(printf '%s' "$root" | md5sum | cut -c1-12).alerted"}
touch "$STATE"

started=$(date +%s)
here=$(dirname "$(readlink -f "$0")")

# Per transcript: its size at the last poll, and when it last grew.
declare -A last_size last_growth

# The context the agent's next request sends: the last reply's input plus its output,
# which joins the context on the next turn.
# The usage object nests other objects, in no fixed key order, so read each key's first
# match after the last "usage" instead of cutting the object at its first brace.
context_tokens() {
  local usage key sum=0 n
  usage=$(grep '"usage":{' "$1" 2>/dev/null | tail -1 | sed 's/.*"usage":{//')
  for key in input_tokens cache_creation_input_tokens cache_read_input_tokens output_tokens; do
    n=$(printf '%s' "$usage" | grep -oE "\"$key\":[0-9]+" | head -1 | cut -d: -f2)
    sum=$((sum + ${n:-0}))
  done
  echo "$sum"
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

# Does this agent still run? Its transcript state first; growth only as the fallback.
is_running() {
  local file=$1 now=$2 size quiet
  size=$(stat -c %s "$file")
  if [ "${last_size[$file]:-}" != "$size" ]; then
    last_size[$file]=$size
    last_growth[$file]=$now
  fi
  quiet=$((now - last_growth[$file]))
  case $(node "$here/agent-state.mjs" "$file" 2>/dev/null) in
    done) return 1 ;;
    waiting) [ "$quiet" -lt "$WAIT_IDLE" ] ;;
    *) [ "$quiet" -lt "$IDLE" ] ;;
  esac
}

seen_any=0

while :; do
  now=$(date +%s)
  [ $((now - started)) -ge "$MAX" ] && { echo "context watcher: stopped after ${MAX}s"; exit 0; }

  live=0
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    seen_any=1
    is_running "$file" "$now" && live=$((live + 1))

    mark=$(next_mark "$(alerted_mark "$file")")
    [ -n "$mark" ] || continue

    tokens=$(context_tokens "$file")
    # An agent that jumps past both marks between polls gets the later alert only.
    [ "$tokens" -ge "$LAND" ] && [ "$mark" -lt "$LAND" ] && mark=$LAND
    [ "$tokens" -ge "$mark" ] && alert "$file" "$tokens" "$mark"
  done < <(find "$root" -path '*/subagents/agent-*.jsonl' -newermt "@$started" 2>/dev/null)

  if [ "$seen_any" = 1 ] && [ "$live" = 0 ]; then
    echo "context watcher: every agent it watched has stopped."
    exit 0
  fi

  sleep "$POLL"
done
