#!/usr/bin/env python3
"""Append/overwrite a date entry in FT-Edit-Daily _index, dual-write.

Writes cache first (fast, local), then attempts iCloud canonical (best-effort).
The cache write is fatal; the iCloud write is non-fatal.

Usage: update_index.py --date YYYY-MM-DD --entry-json '<path or - for stdin>' [--root DIR]

Entry JSON shape (per user spec):
{
  "article_count": int,
  "through_frame": str,
  "key_topics": [str, ...],
  "full_analysis_targets": [str, ...],
  "editor_intent": str,
  "recurring_from_prev": [str, ...],
  "new_this_session": [str, ...]
}
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path


def resolve_root() -> Path:
    here = Path(__file__).resolve().parent
    icloud_sh = here / "icloud_root.sh"
    try:
        res = subprocess.run(
            ["bash", str(icloud_sh)],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if res.returncode == 0 and res.stdout.strip():
            return Path(res.stdout.strip())
    except Exception:
        pass
    repo_root = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        capture_output=True,
        text=True,
    ).stdout.strip() or str(here.parent.parent)
    return Path(repo_root) / "ft-edit" / "out"


def load(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", required=True, help="YYYY-MM-DD key")
    ap.add_argument("--entry-json", required=True, help="path to JSON file, or '-' for stdin")
    ap.add_argument("--root", help="FT-Edit-Daily root dir")
    args = ap.parse_args()

    root = Path(args.root) if args.root else resolve_root()
    cfg = root / "_config"
    cfg.mkdir(parents=True, exist_ok=True)
    cache = cfg / "_index_cache.json"
    canon = cfg / "_index.json"

    if args.entry_json == "-":
        entry = json.load(sys.stdin)
    else:
        entry = json.loads(Path(args.entry_json).read_text(encoding="utf-8"))

    # Load whichever index has more data (prefer canon if both exist).
    base = {}
    if canon.exists():
        base = load(canon)
    elif cache.exists():
        base = load(cache)
    base[args.date] = entry

    # Cache write is mandatory.
    cache.write_text(json.dumps(base, ensure_ascii=False, indent=2), encoding="utf-8")
    cache_ok = True

    # iCloud canonical write is best-effort.
    canon_ok = False
    canon_err = ""
    try:
        canon.write_text(json.dumps(base, ensure_ascii=False, indent=2), encoding="utf-8")
        canon_ok = True
    except Exception as e:
        canon_err = str(e)

    report = {
        "date": args.date,
        "entries_total": len(base),
        "cache_path": str(cache),
        "canon_path": str(canon),
        "cache_ok": cache_ok,
        "canon_ok": canon_ok,
        "canon_err": canon_err,
    }
    json.dump(report, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
