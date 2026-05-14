#!/usr/bin/env bash
# Print ISO week label (YYYY-WW) for a given date, or today if omitted.
# Usage: iso_week.sh [YYYY-MM-DD]
set -euo pipefail
d="${1:-$(date -u +%Y-%m-%d)}"
date -d "$d" '+%G-%V'
