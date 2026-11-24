#!/usr/bin/env bash
# Runs a download or install command up to 3 times. Each try stops after 120 seconds.
# A stuck mirror then fails fast and the next try starts a fresh connection.
# The script fails only when every try fails.
set -u

# `timeout` stops the Playwright wrapper but not the root `apt-get` it started. That orphan keeps
# the dpkg lock, so the next try would fail on the lock at once. CI runners are throwaway machines,
# so stopping the orphan and repairing dpkg is safe there. Anywhere else this does nothing.
release_apt_lock() {
  [ "${CI:-}" = "true" ] || return 0
  command -v apt-get >/dev/null || return 0
  sudo -n pkill -TERM -x apt-get || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    pgrep -x apt-get >/dev/null || break
    sleep 1
  done
  sudo -n dpkg --configure -a || true
}

for try in 1 2 3; do
  if timeout 120 "$@"; then
    exit 0
  fi
  echo "retry-download: try ${try} of 3 failed: $*" >&2
  release_apt_lock
done

exit 1
