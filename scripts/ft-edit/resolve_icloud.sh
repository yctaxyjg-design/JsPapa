#!/usr/bin/env bash
# Resolve the iCloud Drive mount path for the FT Edit daily output.
# The cowork session mounts iCloud at /sessions/<session_id>/mnt/com~apple~CloudDocs/
# at runtime; in local/dev containers it may not exist.
#
# Prints the resolved mount root to stdout (the directory that contains the
# `FT-Edit-Daily` sub-folder, **not** including `FT-Edit-Daily` itself).
# Exits 0 if found, 1 otherwise.
#
# Usage:
#   icloud_root="$(bash scripts/ft-edit/resolve_icloud.sh)" || icloud_root=""
set -euo pipefail

# Standard cowork mount pattern (one session id under /sessions)
for cand in /sessions/*/mnt/com~apple~CloudDocs; do
  [ -d "$cand" ] || continue
  echo "$cand"
  exit 0
done

# macOS local pattern (when running from a developer's laptop)
mac_cand="$HOME/Library/Mobile Documents/com~apple~CloudDocs"
if [ -d "$mac_cand" ]; then
  echo "$mac_cand"
  exit 0
fi

# Generic last-resort search (capped depth so it stays cheap)
fallback="$(find /sessions /mnt /Volumes 2>/dev/null -maxdepth 4 -type d -name 'com~apple~CloudDocs' -print -quit || true)"
if [ -n "$fallback" ]; then
  echo "$fallback"
  exit 0
fi

exit 1
