#!/usr/bin/env bash
# KIFRS 실전 질의 — 한 줄 실행기
#
# 사용법:
#   ./ask.sh "재고 저가법 평가손실 세무조정 설명"
#   TOPK=10 KIFRS_LLM_MODEL=qwq:32b ./ask.sh "질문"
#   ./ask.sh --refresh "질문"      # 먼저 git pull + 색인 재빌드 후 질의
#
# 동작: AGENT_PROMPT.md(확정 앵커) + RAG 검색 근거 + 질문을 합쳐 로컬 LLM에 넣고
#       답변을 출력한다. 사고과정(<think>/Thinking…)은 스크립트가 자동 제거한다.
set -euo pipefail
cd "$(dirname "$0")"

MODEL="${KIFRS_LLM_MODEL:-qwen3:30b}"
TOPK="${TOPK:-8}"

if [ "${1:-}" = "--refresh" ]; then
  shift
  git pull --ff-only || true
  python3 build/rag_ollama.py --build
fi

if [ -z "${1:-}" ]; then
  echo "사용법: ./ask.sh \"질문\"   (옵션: --refresh, 환경변수 TOPK, KIFRS_LLM_MODEL)" >&2
  exit 1
fi

{ cat AGENT_PROMPT.md; echo; \
  python3 build/rag_ollama.py --make-prompt --top-k "$TOPK" 2>/dev/null --ask "$1"; \
} | ollama run "$MODEL"
