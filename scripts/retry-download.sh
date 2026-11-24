#!/usr/bin/env bash
# Runs a download or install command up to 3 times. Each try stops after 120 seconds.
# A stuck mirror then fails fast and the next try starts a fresh connection.
# The script fails only when every try fails.
set -u

for try in 1 2 3; do
  if timeout 120 "$@"; then
    exit 0
  fi
  echo "retry-download: try ${try} of 3 failed: $*" >&2
done

exit 1
