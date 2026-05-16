#!/usr/bin/env bash
# Thin wrapper: parse_index.sh <html_file> -> JSON on stdout
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
exec python3 "$here/ft_edit_parser.py" index "$1"
