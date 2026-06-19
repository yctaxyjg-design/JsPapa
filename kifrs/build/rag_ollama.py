#!/usr/bin/env python3
"""
KIFRS RAG 브리지 — 로컬 Ollama(bge-m3 임베딩 + qwen3 LLM) 연동

목적
  corpus.json(기준서 색인) 또는 corpus.full.json(전문 청크)을 bge-m3로 임베딩해
  로컬 벡터 검색을 수행하고, 검색된 근거를 qwen3 LLM에 주입해 한국어로 답한다.
  실무(세무조정)·수험(회계학) 맥락에 맞춘 시스템 프롬프트를 사용한다.

설계 원칙
  - 외부 의존성 없음: 표준 라이브러리(urllib)만 사용 → pip 설치 불필요.
    잠긴 회사 PC에서도 `python rag_ollama.py` 만으로 동작.
  - 전부 로컬·오프라인: Ollama( http://localhost:11434 )에만 접속, 외부 전송 없음.
  - 임베딩 캐시: 같은 텍스트는 재임베딩하지 않도록 사이드카 파일에 저장.
  - 경로 하드코딩 금지: --corpus 인자(기본값은 스크립트 옆 ../corpus.json).

사용 예
  # 색인 빌드(최초 1회 또는 corpus 변경 시)
  python rag_ollama.py --build

  # 단발 질의
  python rag_ollama.py --ask "리스 사용권자산 최초측정은 어떻게 하나?"

  # 대화형
  python rag_ollama.py

  # 검색만(LLM 없이 근거만 보기)
  python rag_ollama.py --retrieve-only --ask "이연법인세 일시적차이"

Ollama API 참고
  - 임베딩: POST /api/embed   {"model","input"}    → {"embeddings":[[...]]}
            (구버전 폴백) /api/embeddings {"model","prompt"} → {"embedding":[...]}
  - 채팅:   POST /api/chat    {"model","messages","stream":false}
"""

import argparse
import hashlib
import json
import math
import os
import sys
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_CORPUS = os.path.join(HERE, "..", "corpus.json")
DEFAULT_INDEX = os.path.join(HERE, ".kifrs_index.json")        # 임베딩 색인
DEFAULT_CACHE = os.path.join(HERE, ".kifrs_embed_cache.json")  # 텍스트→벡터 캐시

DEFAULT_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
DEFAULT_EMBED_MODEL = os.environ.get("KIFRS_EMBED_MODEL", "bge-m3:latest")
DEFAULT_LLM_MODEL = os.environ.get("KIFRS_LLM_MODEL", "qwen3.6:35b-a3b")

SYSTEM_PROMPT = (
    "당신은 한국채택국제회계기준(K-IFRS) 전문 보좌역이다. "
    "아래 [근거]로 제공된 기준서 발췌만을 사실 출처로 삼아 한국어로 답하라. "
    "실무(세무조정)와 수험(회계학) 양쪽 관점에서 유용하게 정리하되, "
    "근거에 없는 내용은 추측하지 말고 '근거 부족'이라고 밝혀라. "
    "답변 끝에 사용한 기준서 번호(예: 제1116호)를 출처로 표기하라."
)


# --- HTTP (stdlib) ----------------------------------------------------------
def _post_json(url, payload, timeout=120):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def embed_texts(texts, host, model):
    """텍스트 리스트 → 임베딩 리스트. /api/embed 우선, 실패 시 /api/embeddings 폴백."""
    # 1) 신형 일괄 엔드포인트
    try:
        out = _post_json(f"{host}/api/embed", {"model": model, "input": texts})
        if "embeddings" in out:
            return out["embeddings"]
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
    except urllib.error.URLError:
        raise
    # 2) 구형 단건 엔드포인트
    vecs = []
    for t in texts:
        out = _post_json(f"{host}/api/embeddings", {"model": model, "prompt": t})
        vecs.append(out["embedding"])
    return vecs


def chat(messages, host, model, timeout=600):
    out = _post_json(
        f"{host}/api/chat",
        {"model": model, "messages": messages, "stream": False},
        timeout=timeout,
    )
    return out["message"]["content"]


# --- 벡터 연산 (pure python) -------------------------------------------------
def cosine(a, b):
    dot = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        na += x * x
        nb += y * y
    if na == 0 or nb == 0:
        return 0.0
    return dot / (math.sqrt(na) * math.sqrt(nb))


# --- corpus → 문서(document) -------------------------------------------------
def load_documents(corpus_path):
    """corpus.json/corpus.full.json 을 검색 단위 문서 리스트로 변환.

    각 기준서에 chunks(전문 청크)가 있으면 청크마다 문서를 만들고,
    없으면 색인 요약(제목+요약+키워드)을 한 문서로 만든다.
    """
    with open(corpus_path, encoding="utf-8") as f:
        data = json.load(f)
    docs = []
    for s in data.get("standards", []):
        head = f"제{s['no']}호 {s['title']} ({s.get('ifrs','')})"
        chunks = s.get("chunks")
        if chunks:
            for i, ch in enumerate(chunks):
                docs.append({
                    "id": f"{s['no']}#chunk{i}",
                    "no": s["no"],
                    "title": s["title"],
                    "ifrs": s.get("ifrs", ""),
                    "text": f"{head}\n{ch}",
                })
        else:
            kws = " ".join(s.get("keywords", []))
            body = f"{head}\n분류: {s.get('category','')}\n{s.get('summary','')}\n핵심어: {kws}"
            docs.append({
                "id": s["no"],
                "no": s["no"],
                "title": s["title"],
                "ifrs": s.get("ifrs", ""),
                "text": body,
            })
    return data, docs


# --- 임베딩 캐시 -------------------------------------------------------------
def _load_json(path, default):
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return default


def _save_json(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False)


def _key(model, text):
    return hashlib.sha256(f"{model}\n{text}".encode("utf-8")).hexdigest()


def build_index(corpus_path, index_path, cache_path, host, embed_model, verbose=True):
    data, docs = load_documents(corpus_path)
    cache = _load_json(cache_path, {})
    to_embed, to_embed_idx = [], []
    for i, d in enumerate(docs):
        k = _key(embed_model, d["text"])
        if k in cache:
            d["vec"] = cache[k]
        else:
            to_embed.append(d["text"])
            to_embed_idx.append(i)

    if to_embed:
        if verbose:
            print(f"임베딩 {len(to_embed)}건 요청 (모델 {embed_model})…", file=sys.stderr)
        vecs = embed_texts(to_embed, host, embed_model)
        for i, v in zip(to_embed_idx, vecs):
            docs[i]["vec"] = v
            cache[_key(embed_model, docs[i]["text"])] = v
        _save_json(cache_path, cache)

    index = {
        "embed_model": embed_model,
        "corpus_version": data.get("version", ""),
        "docs": [{k: d[k] for k in ("id", "no", "title", "ifrs", "text", "vec")} for d in docs],
    }
    _save_json(index_path, index)
    if verbose:
        print(f"색인 완료: {len(docs)}개 문서 → {index_path}", file=sys.stderr)
    return index


def load_or_build_index(args):
    if os.path.exists(args.index) and not args.build:
        idx = _load_json(args.index, None)
        if idx and idx.get("embed_model") == args.embed_model:
            return idx
    return build_index(
        args.corpus, args.index, args.cache, args.host, args.embed_model
    )


# --- 검색 + 생성 -------------------------------------------------------------
def retrieve(index, query, host, embed_model, top_k):
    qvec = embed_texts([query], host, embed_model)[0]
    scored = [(cosine(qvec, d["vec"]), d) for d in index["docs"]]
    scored.sort(key=lambda x: x[0], reverse=True)
    return scored[:top_k]


def build_context(hits):
    blocks = []
    for score, d in hits:
        blocks.append(f"[근거 | 제{d['no']}호 {d['title']} | 유사도 {score:.3f}]\n{d['text']}")
    return "\n\n".join(blocks)


def format_result(query, reply, hits, retrieve_only):
    """다른 프로그램/로컬 AI가 그대로 파싱할 수 있는 구조화 출력."""
    result = {
        "query": query,
        "retrieve_only": bool(retrieve_only),
        "sources": [f"제{d['no']}호" for _, d in hits],
        "hits": [
            {
                "id": d["id"],
                "no": d["no"],
                "title": d["title"],
                "ifrs": d["ifrs"],
                "score": round(score, 4),
                "text": d["text"],
            }
            for score, d in hits
        ],
    }
    # 검색 전용이면 reply 는 context 문자열이므로 answer 키를 비운다.
    result["answer"] = None if retrieve_only else reply
    return result


def answer(index, query, args):
    hits = retrieve(index, query, args.host, args.embed_model, args.top_k)
    context = build_context(hits)
    if args.retrieve_only:
        return context, hits
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"[근거]\n{context}\n\n[질문]\n{query}"},
    ]
    reply = chat(messages, args.host, args.llm_model)
    return reply, hits


# --- CLI --------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description="KIFRS RAG 브리지 (Ollama bge-m3 + qwen3)")
    ap.add_argument("--corpus", default=DEFAULT_CORPUS, help="corpus.json 경로(기본: 스크립트 옆 ../corpus.json)")
    ap.add_argument("--index", default=DEFAULT_INDEX, help="임베딩 색인 파일 경로")
    ap.add_argument("--cache", default=DEFAULT_CACHE, help="임베딩 캐시 파일 경로")
    ap.add_argument("--host", default=DEFAULT_HOST, help="Ollama 호스트")
    ap.add_argument("--embed-model", default=DEFAULT_EMBED_MODEL)
    ap.add_argument("--llm-model", default=DEFAULT_LLM_MODEL)
    ap.add_argument("--top-k", type=int, default=5)
    ap.add_argument("--build", action="store_true", help="색인을 강제로 다시 빌드")
    ap.add_argument("--ask", help="단발 질의")
    ap.add_argument("--retrieve-only", action="store_true", help="LLM 없이 검색 근거만 출력")
    ap.add_argument("--json", action="store_true", help="결과를 JSON으로 출력(다른 프로그램/AI 연동용)")
    ap.add_argument("--batch", help="질문이 줄단위로 든 파일 경로('-'면 표준입력). JSON 배열로 일괄 출력")
    ap.add_argument("--selftest", action="store_true", help="Ollama 연결/모델 점검")
    args = ap.parse_args()
    args.corpus = os.path.abspath(args.corpus)

    if args.selftest:
        return selftest(args)

    try:
        index = load_or_build_index(args)
    except urllib.error.URLError as e:
        print(f"[오류] Ollama 접속 실패({args.host}): {e}\n  → 'ollama serve' 실행 여부와 --host 를 확인하세요.", file=sys.stderr)
        return 2

    if args.batch:
        src = sys.stdin if args.batch == "-" else open(args.batch, encoding="utf-8")
        questions = [ln.strip() for ln in src if ln.strip()]
        if src is not sys.stdin:
            src.close()
        results = []
        for q in questions:
            reply, hits = answer(index, q, args)
            results.append(format_result(q, reply, hits, args.retrieve_only))
        print(json.dumps(results, ensure_ascii=False, indent=2))
        return 0

    if args.build and not args.ask:
        return 0

    if args.ask:
        reply, hits = answer(index, args.ask, args)
        if args.json:
            print(json.dumps(format_result(args.ask, reply, hits, args.retrieve_only), ensure_ascii=False, indent=2))
        else:
            print(reply)
            print("\n— 사용 근거:", ", ".join(f"제{d['no']}호" for _, d in hits), file=sys.stderr)
        return 0

    # 대화형
    print("KIFRS RAG (Ollama). 질문을 입력하세요. 종료: 빈 줄 또는 Ctrl-C", file=sys.stderr)
    while True:
        try:
            q = input("\n질문> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not q:
            break
        try:
            reply, hits = answer(index, q, args)
        except urllib.error.URLError as e:
            print(f"[오류] Ollama 접속 실패: {e}", file=sys.stderr)
            continue
        print("\n" + reply)
        print("— 근거:", ", ".join(f"제{d['no']}호" for _, d in hits), file=sys.stderr)
    return 0


def selftest(args):
    print(f"Ollama 호스트: {args.host}")
    try:
        v = embed_texts(["테스트"], args.host, args.embed_model)[0]
        print(f"  임베딩 OK — {args.embed_model}, 차원 {len(v)}")
    except Exception as e:  # noqa: BLE001
        print(f"  임베딩 실패 — {args.embed_model}: {e}")
        return 2
    try:
        r = chat([{"role": "user", "content": "한 단어로 답해: 안녕?"}], args.host, args.llm_model, timeout=120)
        print(f"  LLM OK — {args.llm_model}: {r[:40].strip()}…")
    except Exception as e:  # noqa: BLE001
        print(f"  LLM 실패 — {args.llm_model}: {e}")
        return 2
    print("자가점검 통과.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
