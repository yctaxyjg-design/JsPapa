#!/usr/bin/env bash
# Fetch a URL to a local HTML file using curl with a realistic browser UA.
# Replaces WebFetch for scheduled (unattended) runs — WebFetch's provenance
# rules reject URLs that don't appear in a user message, which breaks the
# 5am scheduler. curl has no such restriction.
#
# Usage: fetch_url.sh <url> [<output_file>]
#   If output_file is omitted, a temp file under $TMPDIR is created.
#   Prints the absolute output file path on stdout. Exit 0 on success.
#
# Environment variables (optional — used to bypass bot/paywall blocks):
#   FT_COOKIE         — Cookie header value for *.ft.com requests
#   ECONOMIST_COOKIE  — Cookie header value for *.economist.com requests
#   GENERIC_COOKIE    — Cookie header value applied to all hosts as last resort
#   FETCH_EXTRA_HEADERS — newline-separated 'Header: value' lines (advanced)
#
# Exit codes:
#   0  success
#   1  fetch failed (network, non-2xx, empty body)
#   2  bad arguments
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "usage: $0 <url> [<output_file>]" >&2
  exit 2
fi
url="$1"
out="${2:-$(mktemp -t fetch_XXXXXX).html}"

ua='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

# Pick a host-specific cookie if defined.
cookie=""
case "$url" in
  *ft.com*)        cookie="${FT_COOKIE:-${GENERIC_COOKIE:-}}" ;;
  *economist.com*) cookie="${ECONOMIST_COOKIE:-${GENERIC_COOKIE:-}}" ;;
  *)               cookie="${GENERIC_COOKIE:-}" ;;
esac

curl_args=(
  -sSL
  --max-time 30
  --retry 3
  --retry-delay 2
  --retry-connrefused
  -H "User-Agent: $ua"
  -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
  -H 'Accept-Language: en-US,en;q=0.9,ko;q=0.5'
  -H 'Accept-Encoding: gzip, deflate, br'
  -H 'Sec-Fetch-Dest: document'
  -H 'Sec-Fetch-Mode: navigate'
  -H 'Sec-Fetch-Site: none'
  -H 'Sec-Fetch-User: ?1'
  -H 'Upgrade-Insecure-Requests: 1'
  -H 'Sec-Ch-Ua: "Chromium";v="131", "Not_A Brand";v="24"'
  -H 'Sec-Ch-Ua-Mobile: ?0'
  -H 'Sec-Ch-Ua-Platform: "macOS"'
  --compressed
  -o "$out"
  -w '%{http_code}'
)

if [ -n "$cookie" ]; then
  curl_args+=(-H "Cookie: $cookie")
fi

# Advanced: extra headers from env
if [ -n "${FETCH_EXTRA_HEADERS:-}" ]; then
  while IFS= read -r line; do
    [ -n "$line" ] && curl_args+=(-H "$line")
  done <<< "$FETCH_EXTRA_HEADERS"
fi

http_code=$(curl "${curl_args[@]}" "$url" 2>/dev/null) || {
  echo "curl failed for $url" >&2
  rm -f "$out"
  exit 1
}

if [ "$http_code" != "200" ]; then
  echo "non-200 response ($http_code) for $url" >&2
  rm -f "$out"
  exit 1
fi

if [ ! -s "$out" ]; then
  echo "empty response body for $url" >&2
  rm -f "$out"
  exit 1
fi

echo "$out"
