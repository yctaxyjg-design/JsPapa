#!/usr/bin/env python3
"""Read/write FT Edit Daily index files with cache-first strategy.

Two files are involved:

  _config/_index_cache.json   -- local cache, always read first / always written
  _config/_index.json         -- iCloud-synced source of truth, best-effort

Subcommands:

  read     Print the merged index JSON to stdout. Tries cache, then iCloud,
           then returns "{}". Always exits 0; an empty object means no prior
           sessions.

  write    Append/replace one date entry. Reads the existing index, merges
           the new entry, then writes both cache and iCloud (iCloud failures
           are non-fatal and reported on stderr). The new entry is read from
           a JSON payload file passed as --payload, keyed by --date.

Usage:
  index_io.py read  [--icloud-root <FT-Edit-Daily path>]
  index_io.py write --date YYYY-MM-DD --payload entry.json \
                    [--icloud-root <FT-Edit-Daily path>]

If --icloud-root is omitted the resolver script is invoked and the result is
used; if iCloud isn't mounted, the cache lives under
`<repo>/ft-edit/out/_config/_index_cache.json` as a local fallback.
"""

from __future__ import annotations

import argparse
import json
import os
import shlex
import subprocess
import sys
import time
from pathlib import Path


def _repo_root() -> Path:
    try:
        out = subprocess.check_output(
            ["git", "rev-parse", "--show-toplevel"], stderr=subprocess.DEVNULL
        )
        return Path(out.decode().strip())
    except Exception:
        return Path(__file__).resolve().parent.parent.parent


def _resolve_icloud_root(explicit: str | None) -> Path | None:
    if explicit:
        return Path(explicit)
    here = Path(__file__).resolve().parent
    resolver = here / "resolve_icloud.sh"
    try:
        out = subprocess.check_output(
            ["bash", str(resolver)], stderr=subprocess.DEVNULL
        )
        root = out.decode().strip()
        if root:
            return Path(root) / "FT-Edit-Daily"
    except subprocess.CalledProcessError:
        pass
    return None


def _config_paths(icloud_root: Path | None) -> tuple[Path, Path]:
    """Return (cache_path, icloud_path). cache_path is always usable."""
    if icloud_root is not None:
        config = icloud_root / "_config"
        config.mkdir(parents=True, exist_ok=True)
        return config / "_index_cache.json", config / "_index.json"
    # Local fallback when iCloud not mounted
    fallback = _repo_root() / "ft-edit" / "out" / "_config"
    fallback.mkdir(parents=True, exist_ok=True)
    return fallback / "_index_cache.json", fallback / "_index.json"


def _safe_read(path: Path, retries: int = 1) -> dict | None:
    for attempt in range(retries):
        try:
            with path.open("r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict):
                return data
            return None
        except FileNotFoundError:
            return None
        except (OSError, json.JSONDecodeError):
            if attempt + 1 < retries:
                time.sleep(0.5)
            else:
                return None
    return None


def cmd_read(args: argparse.Namespace) -> int:
    icloud_root = _resolve_icloud_root(args.icloud_root)
    cache_path, icloud_path = _config_paths(icloud_root)

    data = _safe_read(cache_path, retries=1)
    source = "cache" if data is not None else None

    if data is None and icloud_root is not None:
        data = _safe_read(icloud_path, retries=3)
        if data is not None:
            source = "icloud"

    if data is None:
        data = {}
        source = "empty"

    print(json.dumps(data, ensure_ascii=False))
    print(
        f"# source={source} entries={len(data)} "
        f"cache={cache_path} icloud={icloud_path}",
        file=sys.stderr,
    )
    return 0


def cmd_write(args: argparse.Namespace) -> int:
    icloud_root = _resolve_icloud_root(args.icloud_root)
    cache_path, icloud_path = _config_paths(icloud_root)

    with open(args.payload, "r", encoding="utf-8") as f:
        entry = json.load(f)
    if not isinstance(entry, dict):
        print("payload must be a JSON object", file=sys.stderr)
        return 2

    data = _safe_read(cache_path) or {}
    if not data and icloud_root is not None:
        data = _safe_read(icloud_path, retries=3) or {}

    data[args.date] = entry

    cache_path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"cache_written={cache_path}", file=sys.stderr)

    if icloud_root is not None:
        try:
            icloud_path.write_text(
                json.dumps(data, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            print(f"icloud_written={icloud_path}", file=sys.stderr)
        except OSError as exc:
            print(f"icloud_write_failed={exc}", file=sys.stderr)
    else:
        print("icloud_skipped=not_mounted", file=sys.stderr)

    print(json.dumps({"date": args.date, "entries": len(data)}, ensure_ascii=False))
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="index_io.py")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_read = sub.add_parser("read", help="print merged index JSON")
    p_read.add_argument("--icloud-root", default=None)
    p_read.set_defaults(func=cmd_read)

    p_write = sub.add_parser("write", help="append or replace one date entry")
    p_write.add_argument("--date", required=True, help="YYYY-MM-DD")
    p_write.add_argument("--payload", required=True, help="path to entry JSON")
    p_write.add_argument("--icloud-root", default=None)
    p_write.set_defaults(func=cmd_write)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
