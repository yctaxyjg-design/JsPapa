"""검색(search_kifrs) + 로컬 LLM 을 묶어 근거 있는 답변을 생성한다 (RAG)."""

from __future__ import annotations

from llm import LLMError, chat
from rag import search_kifrs

SYSTEM_PROMPT = (
    "당신은 한국채택국제회계기준(K-IFRS) 전문 어시스턴트입니다. "
    "아래에 제공된 '근거 문단'에만 기반하여 한국어로 정확하게 답변하세요. "
    "근거에 없는 내용은 추측하지 말고 '제공된 근거로는 확인할 수 없습니다'라고 말하세요. "
    "답변에는 반드시 사용한 문단 번호를 (예: 제1002호 문단 16) 형태로 인용하세요. "
    "간결하되 핵심 결론을 먼저 제시하세요."
)


def _format_context(results: list[dict]) -> str:
    blocks = []
    for r in results:
        blocks.append(f"[{r['citation']}] {r['title']}\n{r['text']}")
    return "\n\n".join(blocks)


def answer_question(query: str, k: int = 6, section: str | None = "본문") -> dict:
    """질의에 대한 답변 텍스트와 사용된 근거를 반환한다.

    Returns: {"answer": str, "sources": list[dict]}
    """
    results = search_kifrs(query, k=k, section=section)
    if not results:
        return {
            "answer": "관련 근거를 코퍼스에서 찾지 못했습니다. 질문을 더 구체적으로 바꿔보세요.",
            "sources": [],
        }

    context = _format_context(results)
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": f"질문: {query}\n\n근거 문단:\n{context}\n\n위 근거만 사용해 답변하세요.",
        },
    ]
    try:
        text = chat(messages)
    except LLMError as e:
        # LLM이 없을 때도 검색 결과만으로 최소한의 답을 제공
        fallback = "\n\n".join(f"• [{r['citation']}] {r['text']}" for r in results)
        text = (
            f"⚠️ 로컬 LLM에 연결하지 못해 검색 결과만 제공합니다.\n({e})\n\n{fallback}"
        )
    return {"answer": text, "sources": results}


if __name__ == "__main__":
    import sys

    q = " ".join(sys.argv[1:]) or "재고자산 중 비정상적으로 낭비된 부분은 어떻게 회계처리하나요?"
    out = answer_question(q)
    print(out["answer"])
    print("\n--- 근거 ---")
    for s in out["sources"]:
        print(f"  {s['citation']} — {s['title']} (score {s['score']})")
