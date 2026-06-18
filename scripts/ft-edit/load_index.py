#!/usr/bin/env python3
"""Load FT-Edit-Daily _index with cache-first strategy.

Tries: 1) local cache (_index_cache.json), 2) iCloud canonical (_index.json),
       3) empty {} on failure (treated as first session).

Usage: load_index.py [--root <FT-Edit-Daily dir>]
       If --root is omitted, runs scripts/ft-edit/icloud_root.sh; if that fails,
       falls back to <repo>/ft-edit/out/.

Output: JSON dict on stdout. Always exit 0 unless arguments are bad.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
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


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", help="FT-Edit-Daily root dir")
    args = ap.parse_args()
    root = Path(args.root) if args.root else resolve_root()
    cfg = root / "_config"
    cache = cfg / "_index_cache.json"
    canon = cfg / "_index.json"

    data: dict | None = None
    source = "none"

    if cache.exists():
        try:
            data = json.loads(cache.read_text(encoding="utf-8"))
            source = "cache"
        except Exception as e:
            print(f"cache parse failed: {e}", file=sys.stderr)

    if data is None and canon.exists():
        for attempt in range(3):
            try:
                data = json.loads(canon.read_text(encoding="utf-8"))
                source = "icloud"
                break
            except Exception as e:
                if attempt == 2:
                    print(f"icloud parse failed after 3 tries: {e}", file=sys.stderr)
                time.sleep(0.5)

    if data is None:
        data = {}
        source = "empty"

    out = {"_meta": {"source": source, "root": str(root), "entries": len(data)}, "index": data}
    json.dump(out, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
