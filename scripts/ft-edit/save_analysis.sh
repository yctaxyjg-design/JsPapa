#!/usr/bin/env bash
# Save the assembled FT Edit daily markdown to the iCloud Drive folder when
# available; fall back to ./ft-edit/out/ inside the repo otherwise.
#
# Usage: save_analysis.sh <YYYY-MM-DD> <source_md_file>
set -euo pipefail

date_key="${1:?date label required (YYYY-MM-DD)}"
src="${2:?source markdown path required}"

if [ ! -f "$src" ]; then
  echo "source file not found: $src" >&2
  exit 1
fi

here="$(cd "$(dirname "$0")" && pwd)"
icloud_root=""
if icloud_root="$(bash "$here/icloud_root.sh" 2>/dev/null)" && [ -n "$icloud_root" ]; then
  dest_dir="$icloud_root"
  destination="icloud"
else
  repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
  dest_dir="$repo_root/ft-edit/out"
  mkdir -p "$dest_dir"
  destination="local"
fi

dest="$dest_dir/${date_key}_ft-edit.md"
cp "$src" "$dest"
echo "destination=$destination"
echo "path=$dest"
