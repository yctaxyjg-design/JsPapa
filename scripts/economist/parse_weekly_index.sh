#!/usr/bin/env bash
# Thin wrapper: parse_weekly_index.sh <html_file> -> JSON on stdout
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
exec python3 "$here/economist_parser.py" weekly "$1"
