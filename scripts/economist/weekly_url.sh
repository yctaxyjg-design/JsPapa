#!/usr/bin/env bash
# Print The Economist weekly edition URL for a given date, or today if omitted.
# The weekly edition slug is the Saturday of the publication week.
# Usage: weekly_url.sh [YYYY-MM-DD]
set -euo pipefail
d="${1:-$(date -u +%Y-%m-%d)}"
dow=$(date -d "$d" '+%u')   # 1=Mon ... 7=Sun
offset=$(( 6 - dow ))
if [ "$offset" -lt 0 ]; then offset=$(( offset + 7 )); fi
sat=$(date -d "$d + $offset days" '+%Y-%m-%d')
echo "https://www.economist.com/weeklyedition/$sat"
