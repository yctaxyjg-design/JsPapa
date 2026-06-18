#!/usr/bin/env bash
# SessionStart bootstrap: resolve iCloud, create FT-Edit-Daily structure if
# missing, and report whether the index cache is ready. Runs quietly enough
# to be invoked from a SessionStart hook; never exits non-zero (the scheduled
# session must continue regardless so it can warn the user properly).
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"

echo "# ft-edit bootstrap @ $(date -u +%Y-%m-%dT%H:%M:%SZ)"
bash "$here/ensure_dirs.sh" 2>/dev/null | sed 's/^/# /' || true

# Probe index size so the log records prior session count
if command -v python3 >/dev/null 2>&1; then
  count="$(python3 "$here/index_io.py" read 2>/dev/null | python3 -c 'import json,sys
try:
    print(len(json.loads(sys.stdin.read().splitlines()[0])))
except Exception:
    print(0)' 2>/dev/null || echo 0)"
  echo "# index_entries=${count}"
fi

exit 0
