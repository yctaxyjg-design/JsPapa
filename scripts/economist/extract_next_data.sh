#!/usr/bin/env bash
# Thin wrapper: extract_next_data.sh <html_file> -> full __NEXT_DATA__ JSON on stdout
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
exec python3 "$here/economist_parser.py" extract "$1"
