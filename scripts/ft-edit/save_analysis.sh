#!/usr/bin/env bash
# Save the assembled FT Edit daily markdown to iCloud when available; fall
# back to ./ft-edit/out/ inside the repo otherwise.
#
# Usage: save_analysis.sh <YYYY-MM-DD> <source_md_file>
set -euo pipefail

date_str="${1:?date label required (YYYY-MM-DD)}"
src="${2:?source markdown path required}"

if [ ! -f "$src" ]; then
  echo "source file not found: $src" >&2
  exit 1
fi

here="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(git -C "$here" rev-parse --show-toplevel 2>/dev/null || pwd)"

dest_dir=""
destination=""
if icloud_root="$(bash "$here/resolve_icloud.sh" 2>/dev/null)"; then
  dest_dir="$icloud_root/FT-Edit-Daily"
  destination="icloud"
fi

if [ -z "$dest_dir" ] || ! [ -w "$dest_dir" 2>/dev/null ] && ! mkdir -p "$dest_dir" 2>/dev/null; then
  dest_dir="$repo_root/ft-edit/out"
  destination="local"
fi

mkdir -p "$dest_dir"
dest="$dest_dir/${date_str}_ft-edit.md"
cp "$src" "$dest"
echo "destination=$destination"
echo "path=$dest"
