#!/usr/bin/env bash
# Thin wrapper: parse_article.sh <html_file> -> JSON on stdout
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
exec python3 "$here/ft_edit_parser.py" article "$1"
