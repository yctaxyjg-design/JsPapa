#!/usr/bin/env bash
# Resolve the most recent PUBLISHED weekly edition URL by probing.
# Starts from the nominal Saturday for the given date, walks back week by
# week until HTTP 200 is found. Useful when today's edition hasn't dropped
# yet (the 5am scheduler can hit "this Saturday" before publish time).
#
# Usage: latest_weekly_url.sh [YYYY-MM-DD] [max_weeks_back]
#   max_weeks_back defaults to 3 (today + 3 prior weeks = 4 attempts)
# Prints the resolved URL on stdout. Exit 0 on success, 1 if nothing found.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
date_arg="${1:-$(date -u +%Y-%m-%d)}"
max_back="${2:-3}"

ua='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

for offset in $(seq 0 "$max_back"); do
  test_date=$(date -d "$date_arg - $((offset * 7)) days" '+%Y-%m-%d')
  url=$(bash "$here/weekly_url.sh" "$test_date")
  code=$(curl -sSL -o /dev/null --max-time 10 \
    -H "User-Agent: $ua" \
    -w '%{http_code}' "$url" 2>/dev/null || echo "000")
  if [ "$code" = "200" ]; then
    echo "$url"
    exit 0
  fi
done

echo "no published weekly edition found within last $((max_back + 1)) weeks from $date_arg" >&2
exit 1
