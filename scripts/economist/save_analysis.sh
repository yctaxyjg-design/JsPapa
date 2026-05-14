#!/usr/bin/env bash
# Save the assembled weekly markdown to the iCloud Drive folder when available;
# fall back to ./economist/out/ inside the repo otherwise.
#
# Usage: save_analysis.sh <iso_week_label> <source_md_file>
#   iso_week_label : e.g. 2026-20
#   source_md_file : path to the markdown file to copy
set -euo pipefail

iso_week="${1:?ISO week label required (e.g. 2026-20)}"
src="${2:?source markdown path required}"

if [ ! -f "$src" ]; then
  echo "source file not found: $src" >&2
  exit 1
fi

icloud_dir="/Users/yangjaegwon/Library/Mobile Documents/com~apple~CloudDocs/Economist_Weekly_Analysis"
repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
local_dir="$repo_root/economist/out"

if [ -d "$icloud_dir" ] && [ -w "$icloud_dir" ]; then
  dest_dir="$icloud_dir"
  destination="icloud"
else
  mkdir -p "$local_dir"
  dest_dir="$local_dir"
  destination="local"
fi

dest="$dest_dir/${iso_week}_week.md"
cp "$src" "$dest"
echo "destination=$destination"
echo "path=$dest"
