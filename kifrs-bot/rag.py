"""K-IFRS 로컬 검색 (search_kifrs).

외부 API/키 없이 로컬 JSON 코퍼스에 대해 한국어 친화적인 키워드 점수 검색을 수행한다.
원래 사용하던 호출 형태를 그대로 유지한다:

    search_kifrs("재고자산 비정상적으로 낭비된 부분 ...", k=6, section="본문")
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

CORPUS_DIR = Path(__file__).parent / "corpus"

_TOKEN_RE = re.compile(r"[0-9A-Za-z가-힣]+")


@dataclass
class Chunk:
    id: str
    standard: str
    paragraph: str
    section: str
    title: str
    text: str
    tags: list[str]

    @property
    def citation(self) -> str:
        return f"{self.standard} 문단 {self.paragraph}"


def _tokenize(text: str) -> list[str]:
    """공백/구두점으로 1차 분리 후, 한글 토큰은 2-gram 글자조합도 추가해 부분일치를 살린다."""
    tokens: list[str] = []
    for word in _TOKEN_RE.findall(text.lower()):
        tokens.append(word)
        if re.fullmatch(r"[가-힣]+", word) and len(word) >= 3:
            for i in range(len(word) - 1):
                tokens.append(word[i : i + 2])
    return tokens


def load_corpus(corpus_dir: Path = CORPUS_DIR) -> list[Chunk]:
    chunks: list[Chunk] = []
    for path in sorted(corpus_dir.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        standard = data.get("standard", path.stem)
        for c in data.get("chunks", []):
            chunks.append(
                Chunk(
                    id=c["id"],
                    standard=standard,
                    paragraph=str(c.get("paragraph", "")),
                    section=c.get("section", ""),
                    title=c.get("title", ""),
                    text=c.get("text", ""),
                    tags=list(c.get("tags", [])),
                )
            )
    return chunks


_CORPUS_CACHE: list[Chunk] | None = None


def _corpus() -> list[Chunk]:
    global _CORPUS_CACHE
    if _CORPUS_CACHE is None:
        _CORPUS_CACHE = load_corpus()
    return _CORPUS_CACHE


def _score(query_tokens: list[str], chunk: Chunk) -> float:
    """질의 토큰이 청크(제목·태그·본문)에 등장하는 빈도 기반 점수. 제목/태그에 가중치."""
    title_tokens = _tokenize(chunk.title)
    tag_tokens = _tokenize(" ".join(chunk.tags))
    body_tokens = _tokenize(chunk.text)
    score = 0.0
    for qt in query_tokens:
        score += 3.0 * title_tokens.count(qt)
        score += 2.0 * tag_tokens.count(qt)
        score += 1.0 * body_tokens.count(qt)
    # 본문 길이로 약하게 정규화해 긴 청크의 우연한 가산점을 완화
    return score / (1.0 + len(body_tokens) / 100.0)


def search_kifrs(
    query: str,
    k: int = 6,
    section: str | None = None,
) -> list[dict]:
    """K-IFRS 코퍼스에서 query와 가장 관련 높은 청크 상위 k개를 반환한다.

    Args:
        query: 자연어 질의.
        k: 반환할 청크 수.
        section: 지정 시 해당 섹션(예: "본문")만 검색.

    Returns:
        점수 내림차순 dict 리스트. 각 항목: id, standard, paragraph, section,
        title, text, tags, citation, score.
    """
    query_tokens = _tokenize(query)
    candidates = _corpus()
    if section:
        candidates = [c for c in candidates if c.section == section]

    scored = []
    for chunk in candidates:
        s = _score(query_tokens, chunk)
        if s > 0:
            scored.append((s, chunk))
    scored.sort(key=lambda x: x[0], reverse=True)

    results = []
    for s, c in scored[:k]:
        results.append(
            {
                "id": c.id,
                "standard": c.standard,
                "paragraph": c.paragraph,
                "section": c.section,
                "title": c.title,
                "text": c.text,
                "tags": c.tags,
                "citation": c.citation,
                "score": round(s, 3),
            }
        )
    return results


if __name__ == "__main__":
    import sys

    q = " ".join(sys.argv[1:]) or "재고자산 비정상적으로 낭비된 부분 감모손실 비용 인식"
    for r in search_kifrs(q, k=6, section="본문"):
        print(f"[{r['score']:>5}] {r['citation']} — {r['title']}")
        print(f"        {r['text'][:80]}...")
