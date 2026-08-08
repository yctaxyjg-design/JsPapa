#!/usr/bin/env python3
"""Parser for FT.com pages (FT Edit index + individual articles).

Designed for paywalled-preview shape: extract whatever public metadata exists
(headline, standfirst, first paragraph, AI summary, og:* meta, JSON-LD) so the
daily analysis can run on previews when full body is paywalled.

Subcommands
-----------
index   <html>   : FT Edit index → list of {headline, url, standfirst}
article <html>   : single article → {headline, standfirst, firstParagraph, ...}

Output is UTF-8 JSON on stdout. Errors → stderr, exit 1.
"""
from __future__ import annotations

import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from typing import Any


JSON_LD_RE = re.compile(
    r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>',
    re.DOTALL | re.IGNORECASE,
)
NEXT_DATA_RE = re.compile(
    r'<script id="__NEXT_DATA__" type="application/json"[^>]*>(.*?)</script>',
    re.DOTALL,
)
META_RE = re.compile(
    r'<meta[^>]+(?:property|name)=["\']([^"\']+)["\'][^>]+content=["\']([^"\']*)["\'][^>]*/?>',
    re.IGNORECASE,
)
META_RE_ALT = re.compile(
    r'<meta[^>]+content=["\']([^"\']*)["\'][^>]+(?:property|name)=["\']([^"\']+)["\'][^>]*/?>',
    re.IGNORECASE,
)


def read_html(path: str) -> str:
    return Path(path).read_text(encoding="utf-8", errors="replace")


def extract_meta(html: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for m in META_RE.finditer(html):
        out.setdefault(m.group(1).lower(), m.group(2))
    for m in META_RE_ALT.finditer(html):
        out.setdefault(m.group(2).lower(), m.group(1))
    return out


def extract_json_ld(html: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for m in JSON_LD_RE.finditer(html):
        raw = m.group(1).strip()
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if isinstance(data, list):
            for d in data:
                if isinstance(d, dict):
                    out.append(d)
        elif isinstance(data, dict):
            graph = data.get("@graph")
            if isinstance(graph, list):
                for d in graph:
                    if isinstance(d, dict):
                        out.append(d)
            out.append(data)
    return out


def find_article_schema(jsonld: list[dict[str, Any]]) -> dict[str, Any] | None:
    article_types = {"NewsArticle", "Article", "ReportageNewsArticle", "OpinionNewsArticle"}
    for d in jsonld:
        t = d.get("@type")
        if isinstance(t, list):
            if any(x in article_types for x in t):
                return d
        elif isinstance(t, str) and t in article_types:
            return d
    return None


def abs_url(href: str | None) -> str | None:
    if not href:
        return None
    if href.startswith("http"):
        return href
    return "https://www.ft.com" + (href if href.startswith("/") else "/" + href)


class TeaserParser(HTMLParser):
    """Extract o-teaser blocks (FT Origami) into {headline, url, standfirst}."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.items: list[dict[str, str]] = []
        self._teaser_depth = 0
        self._cur: dict[str, str] | None = None
        # capture text inside an <a> currently being recorded
        self._in_heading_a = False
        self._heading_text: list[str] = []
        self._in_standfirst = False
        self._standfirst_text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrd = {k: (v or "") for k, v in attrs}
        cls = attrd.get("class", "")
        cls_tokens = set(cls.split())
        is_teaser_root = (
            "o-teaser" in cls_tokens
            or any(t.startswith("o-teaser--") for t in cls_tokens)
        )
        if self._teaser_depth == 0:
            if tag in ("article", "div", "li") and is_teaser_root:
                self._teaser_depth = 1
                self._cur = {"headline": "", "url": "", "standfirst": ""}
            return
        # inside a teaser
        self._teaser_depth += 1
        if tag == "a" and self._cur is not None:
            href = attrd.get("href", "")
            data_trackable = attrd.get("data-trackable", "")
            is_heading = (
                "o-teaser__heading" in cls
                or "heading-link" in data_trackable
                or "headline" in data_trackable
            )
            if is_heading or (not self._cur["url"] and href.startswith(("/content/", "/", "https://www.ft.com/"))):
                if not self._cur["url"]:
                    self._cur["url"] = abs_url(href) or ""
                if not self._cur["headline"]:
                    self._in_heading_a = True
                    self._heading_text = []
        if "o-teaser__standfirst" in cls or "o-teaser__standfirst--" in cls:
            self._in_standfirst = True
            self._standfirst_text = []

    def handle_endtag(self, tag: str) -> None:
        if self._teaser_depth == 0:
            return
        if self._in_heading_a and tag == "a":
            self._in_heading_a = False
            if self._cur is not None and not self._cur["headline"]:
                self._cur["headline"] = " ".join("".join(self._heading_text).split())
        if self._in_standfirst and tag in ("p", "div", "span"):
            txt = " ".join("".join(self._standfirst_text).split())
            if self._cur is not None and txt and not self._cur["standfirst"]:
                self._cur["standfirst"] = txt
            self._in_standfirst = False
        self._teaser_depth -= 1
        if self._teaser_depth == 0 and self._cur is not None:
            if self._cur["headline"] and self._cur["url"]:
                # dedupe by url
                if not any(x["url"] == self._cur["url"] for x in self.items):
                    self.items.append(self._cur)
            self._cur = None

    def handle_data(self, data: str) -> None:
        if self._in_heading_a:
            self._heading_text.append(data)
        if self._in_standfirst:
            self._standfirst_text.append(data)


def parse_index(html_path: str) -> dict[str, Any]:
    html = read_html(html_path)
    p = TeaserParser()
    p.feed(html)
    items = p.items

    # Fallback: if teaser parsing yielded nothing, try a permissive anchor scan
    # for /content/... article URLs anywhere in the page.
    if not items:
        seen: set[str] = set()
        for m in re.finditer(
            r'<a[^>]+href=["\'](/content/[a-f0-9\-]+)["\'][^>]*>(.*?)</a>',
            html,
            re.DOTALL | re.IGNORECASE,
        ):
            href, inner = m.group(1), m.group(2)
            text = re.sub(r"<[^>]+>", "", inner)
            text = " ".join(text.split())
            url = abs_url(href) or ""
            if not text or len(text) < 8:
                continue
            if url in seen:
                continue
            seen.add(url)
            items.append({"headline": text, "url": url, "standfirst": ""})

    return {
        "url": "https://www.ft.com/ft-edit",
        "count": len(items),
        "items": items,
    }


def parse_article(html_path: str) -> dict[str, Any]:
    html = read_html(html_path)
    meta = extract_meta(html)
    jsonld = extract_json_ld(html)
    art = find_article_schema(jsonld) or {}

    headline = art.get("headline") or meta.get("og:title") or meta.get("twitter:title")
    description = art.get("description") or meta.get("og:description") or meta.get("description")
    url = art.get("url") or art.get("mainEntityOfPage") or meta.get("og:url")
    if isinstance(url, dict):
        url = url.get("@id") or url.get("url")
    date_pub = art.get("datePublished") or meta.get("article:published_time")
    date_mod = art.get("dateModified") or meta.get("article:modified_time")
    author = art.get("author")
    if isinstance(author, list) and author:
        author = author[0]
    if isinstance(author, dict):
        author = author.get("name")
    section = art.get("articleSection") or meta.get("article:section")
    if isinstance(section, list):
        section = ", ".join(str(s) for s in section)

    article_body = art.get("articleBody")
    first_paragraph: str | None = None
    if isinstance(article_body, str) and article_body.strip():
        # First non-trivial paragraph from JSON-LD body if present
        for chunk in re.split(r"\n\s*\n", article_body):
            chunk = chunk.strip()
            if len(chunk) >= 40:
                first_paragraph = chunk
                break

    # HTML body fallback for first paragraph
    if not first_paragraph:
        m = re.search(
            r'<article[^>]*>(.*?)</article>',
            html,
            re.DOTALL | re.IGNORECASE,
        )
        scope = m.group(1) if m else html
        for pm in re.finditer(r'<p[^>]*>(.*?)</p>', scope, re.DOTALL | re.IGNORECASE):
            text = re.sub(r"<[^>]+>", "", pm.group(1))
            text = " ".join(text.split())
            if len(text) >= 60 and not text.lower().startswith(("subscribe", "sign in", "register")):
                first_paragraph = text
                break

    # Detect paywall / login-degraded shape
    paywall_markers = (
        "free 30-day trial",
        "subscribe to read",
        "subscribe now",
        "start your free trial",
        "restart your subscription",
        "for full access to ft.com",
    )
    lower_html = html.lower()
    is_paywalled = any(mk in lower_html for mk in paywall_markers)

    is_accessible_for_free = art.get("isAccessibleForFree")
    if isinstance(is_accessible_for_free, str):
        is_accessible_for_free = is_accessible_for_free.lower() in ("true", "1", "yes")

    return {
        "url": url,
        "headline": headline,
        "description": description,
        "section": section,
        "author": author,
        "datePublished": date_pub,
        "dateModified": date_mod,
        "firstParagraph": first_paragraph,
        "isAccessibleForFree": is_accessible_for_free,
        "paywallDetected": is_paywalled,
        "hasFullBody": bool(article_body and isinstance(article_body, str) and len(article_body) > 800),
    }


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        print(__doc__, file=sys.stderr)
        return 2
    cmd, path = argv[1], argv[2]
    if cmd == "index":
        json.dump(parse_index(path), sys.stdout, ensure_ascii=False, indent=2)
    elif cmd == "article":
        json.dump(parse_article(path), sys.stdout, ensure_ascii=False, indent=2)
    else:
        print(f"unknown subcommand: {cmd}", file=sys.stderr)
        return 2
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
