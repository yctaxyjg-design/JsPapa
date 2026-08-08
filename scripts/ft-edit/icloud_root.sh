#!/usr/bin/env bash
# Resolve the FT-Edit-Daily iCloud root, preferring the cowork mount,
# then the Mac-native path. Exits non-zero if neither is writable.
#
# Usage: icloud_root.sh
#   On success: prints absolute path to FT-Edit-Daily/.
#   On failure: prints nothing, exits 1.
set -euo pipefail

candidates=()
# cowork-style mounts: /sessions/<id>/mnt/com~apple~CloudDocs/...
while IFS= read -r d; do
  candidates+=("$d")
done < <(compgen -G "/sessions/*/mnt/com~apple~CloudDocs/FT-Edit-Daily" || true)

# Mac-native iCloud Drive path
candidates+=("/Users/yangjaegwon/Library/Mobile Documents/com~apple~CloudDocs/FT-Edit-Daily")

# Generic fallbacks under HOME (in case the user moved iCloud somewhere)
candidates+=("$HOME/Library/Mobile Documents/com~apple~CloudDocs/FT-Edit-Daily")

for c in "${candidates[@]}"; do
  parent="$(dirname "$c")"
  if [ -d "$parent" ] && [ -w "$parent" ]; then
    mkdir -p "$c/_config" 2>/dev/null || true
    if [ -d "$c" ] && [ -w "$c" ]; then
      echo "$c"
      exit 0
    fi
  fi
done

exit 1
