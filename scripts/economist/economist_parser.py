#!/usr/bin/env python3
"""Parser for The Economist Next.js pages.

Extracts the embedded ``__NEXT_DATA__`` JSON from saved HTML and emits the
fields needed by the weekly analysis pipeline. Designed for the paywalled
preview shape (first paragraph + metadata + aiSummary only).

Subcommands
-----------
extract <html>        : print raw __NEXT_DATA__ JSON
article <html>        : print article fields as JSON
weekly  <html>        : print weekly edition section/article map as JSON

All output is UTF-8 JSON on stdout. Errors go to stderr with exit code 1.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any


NEXT_DATA_RE = re.compile(
    r'<script id="__NEXT_DATA__" type="application/json"[^>]*>(.*?)</script>',
    re.DOTALL,
)


def load_next_data(html_path: str) -> dict[str, Any]:
    html = Path(html_path).read_text(encoding="utf-8", errors="replace")
    m = NEXT_DATA_RE.search(html)
    if not m:
        raise SystemExit(f"__NEXT_DATA__ script tag not found in {html_path}")
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError as e:
        raise SystemExit(f"failed to parse __NEXT_DATA__ JSON in {html_path}: {e}")


def _collect_text(node: Any) -> str:
    """Flatten a portable-text-ish tree into plain text."""
    if node is None:
        return ""
    if isinstance(node, str):
        return node
    if isinstance(node, list):
        return "".join(_collect_text(c) for c in node)
    if isinstance(node, dict):
        if "text" in node and isinstance(node["text"], str):
            return node["text"]
        for key in ("children", "content", "value"):
            if key in node:
                return _collect_text(node[key])
    return ""


def _abs_url(url: str | None) -> str | None:
    if not url:
        return None
    if url.startswith("http"):
        return url
    return "https://www.economist.com" + (url if url.startswith("/") else "/" + url)


def parse_article(html_path: str) -> dict[str, Any]:
    data = load_next_data(html_path)
    content = (
        data.get("props", {}).get("pageProps", {}).get("content", {}) or {}
    )

    first_paragraph: str | None = None
    first_subhead: str | None = None
    body = content.get("body") or []
    if isinstance(body, list):
        for block in body:
            if not isinstance(block, dict):
                continue
            btype = (block.get("type") or "").upper()
            if btype in ("PARAGRAPH", "P") and first_paragraph is None:
                txt = _collect_text(block).strip()
                if txt:
                    first_paragraph = txt
            elif btype in ("SUBHEAD", "CROSSHEAD", "H2", "H3") and first_subhead is None:
                txt = _collect_text(block).strip()
                if txt:
                    first_subhead = txt
            if first_paragraph and first_subhead:
                break

    print_block = content.get("print") or {}
    out = {
        "url": _abs_url(content.get("url") or content.get("canonicalUrl")),
        "headline": content.get("headline"),
        "flyTitle": content.get("flyTitle"),
        "rubric": content.get("rubric") or content.get("subheadline"),
        "description": content.get("description"),
        "datePublished": content.get("datePublished") or content.get("dateModified"),
        "dateline": content.get("dateline"),
        "estimatedReadingTime": content.get("estimatedReadingTime"),
        "tags": content.get("tags") or content.get("topics"),
        "aiSummary": content.get("aiSummary") or content.get("aiSummaries"),
        "print": {
            "headline": print_block.get("headline") if isinstance(print_block, dict) else None,
            "rubric": print_block.get("rubric") if isinstance(print_block, dict) else None,
            "flyTitle": print_block.get("flyTitle") if isinstance(print_block, dict) else None,
            "section": print_block.get("section") if isinstance(print_block, dict) else None,
        },
        "firstParagraph": first_paragraph,
        "firstSubhead": first_subhead,
        "isAccessibleForFree": content.get("isAccessibleForFree"),
    }
    return out


def _iter_section_items(section: dict) -> list[dict]:
    """Return article entries under a weekly-edition section, handling shape drift."""
    candidates = []
    hp = section.get("hasPart")
    if isinstance(hp, dict):
        candidates = hp.get("parts") or hp.get("items") or []
    elif isinstance(hp, list):
        candidates = hp
    if not candidates:
        candidates = section.get("articles") or section.get("items") or section.get("parts") or []
    out = []
    for it in candidates or []:
        if not isinstance(it, dict):
            continue
        out.append({
            "headline": it.get("headline") or it.get("name") or it.get("title"),
            "rubric": it.get("rubric") or it.get("flyTitle") or it.get("subheadline"),
            "description": it.get("description"),
            "url": _abs_url(it.get("url") or it.get("canonicalUrl") or it.get("link")),
        })
    return out


_SECTION_ALIASES = {
    "business": {"business"},
    "finance": {"finance & economics", "finance and economics", "finance"},
    "science": {"science & technology", "science and technology", "science"},
    "culture": {"culture", "books and arts", "books & arts"},
}


def _normalize_section_name(name: str) -> str | None:
    s = (name or "").strip().lower()
    for key, aliases in _SECTION_ALIASES.items():
        if s in aliases or any(s.startswith(a) for a in aliases):
            return key
    return None


def parse_weekly(html_path: str) -> dict[str, Any]:
    data = load_next_data(html_path)
    page = data.get("props", {}).get("pageProps", {}) or {}
    content = page.get("content") or page.get("edition") or {}

    # Sections live in a few possible shapes; try them in order.
    sections: list[dict] = []
    hp = content.get("hasPart")
    if isinstance(hp, dict):
        sections = hp.get("parts") or hp.get("items") or []
    elif isinstance(hp, list):
        sections = hp
    if not sections:
        sections = content.get("sections") or page.get("sections") or []

    result: dict[str, list[dict]] = {k: [] for k in _SECTION_ALIASES}
    raw: dict[str, list[dict]] = {}
    for sec in sections:
        if not isinstance(sec, dict):
            continue
        name = sec.get("name") or sec.get("section") or sec.get("headline") or ""
        items = _iter_section_items(sec)
        if name:
            raw[name] = items
        key = _normalize_section_name(name)
        if key:
            result[key].extend(items)

    return {
        "editionDate": content.get("datePublished") or content.get("dateModified") or page.get("editionDate"),
        "sections": result,
        "rawSections": list(raw.keys()),
    }


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        print(__doc__, file=sys.stderr)
        return 2
    cmd, path = argv[1], argv[2]
    if cmd == "extract":
        data = load_next_data(path)
        json.dump(data, sys.stdout, ensure_ascii=False, indent=2)
    elif cmd == "article":
        json.dump(parse_article(path), sys.stdout, ensure_ascii=False, indent=2)
    elif cmd == "weekly":
        json.dump(parse_weekly(path), sys.stdout, ensure_ascii=False, indent=2)
    else:
        print(f"unknown subcommand: {cmd}", file=sys.stderr)
        return 2
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
