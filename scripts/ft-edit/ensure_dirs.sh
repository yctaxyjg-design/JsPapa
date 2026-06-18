#!/usr/bin/env bash
# Ensure the FT Edit daily output directory structure exists on iCloud (when
# mounted) and seed an empty index cache if none is present.
#
# Outputs (stdout, one per line, key=value):
#   icloud=<absolute path to FT-Edit-Daily root, or "">
#   config=<absolute path to _config sub-dir, or "">
#   cache=<absolute path to _index_cache.json, or "">
#   created=<"yes" if any directory or cache file was newly created, else "no">
#
# Exits 0 even when iCloud isn't mounted (the caller decides what to do).
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
created="no"

icloud_root=""
if icloud_root="$(bash "$here/resolve_icloud.sh" 2>/dev/null)"; then
  base="$icloud_root/FT-Edit-Daily"
  config="$base/_config"
  cache="$config/_index_cache.json"

  for d in "$base" "$config"; do
    if [ ! -d "$d" ]; then
      mkdir -p "$d"
      created="yes"
    fi
  done

  # Note: deliberately NOT seeding an empty _index_cache.json — a pre-existing
  # empty cache would block iCloud fallback on a fresh container and lose
  # history. The cache is lazily created on first successful write.

  printf 'icloud=%s\n' "$base"
  printf 'config=%s\n' "$config"
  printf 'cache=%s\n' "$cache"
else
  printf 'icloud=\n'
  printf 'config=\n'
  printf 'cache=\n'
fi
printf 'created=%s\n' "$created"
