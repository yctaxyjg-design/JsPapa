#!/usr/bin/env bash
# 유료 기사 URL → 본문 추출(본인 세션) → 로컬 LLM으로 한국어 번역/요약.
#
# 사용법:
#   ./translate.sh ft https://www.ft.com/content/....
#   ./translate.sh economist https://www.economist.com/....  --summary
#
# 오픈클로 크론에 등록하면 매주/매일 자동 실행할 수 있다(아래 README 참고).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SITE="${1:?사용법: ./translate.sh <ft|economist> <URL> [--summary]}"
URL="${2:?기사 URL 필요}"
MODE="${3:-}"

# 로컬 LLM 엔드포인트 (LM Studio 기본; Ollama면 OLLAMA 로 override)
LLM_URL="${LLM_URL:-http://127.0.0.1:1234/v1/chat/completions}"
LLM_MODEL="${LLM_MODEL:-qwen3.6-35b-a3b}"

# 1) 본문 추출
ARTICLE="$(node "$SCRIPT_DIR/fetch.mjs" "$SITE" "$URL" --text)"

# 2) 프롬프트 구성
if [ "$MODE" = "--summary" ]; then
  INSTRUCTION="다음 영문 기사를 한국어로 번역하되, 핵심 논지와 근거를 3~5개 불릿으로 요약해줘. 고유명사는 원어 병기."
else
  INSTRUCTION="다음 영문 기사를 자연스러운 한국어로 전문 번역해줘. 문단 구조를 유지하고, 고유명사는 처음 등장 시 원어를 괄호로 병기."
fi

# 3) 로컬 LLM 호출 (OpenAI 호환 API)
PAYLOAD="$(INSTRUCTION="$INSTRUCTION" ARTICLE="$ARTICLE" LLM_MODEL="$LLM_MODEL" node -e '
const body = {
  model: process.env.LLM_MODEL,
  messages: [
    { role: "system", content: "당신은 경제·시사 전문 번역가입니다." },
    { role: "user", content: process.env.INSTRUCTION + "\n\n---\n" + process.env.ARTICLE },
  ],
  temperature: 0.3,
  stream: false,
};
process.stdout.write(JSON.stringify(body));
')"

curl -fsS "$LLM_URL" -H 'Content-Type: application/json' -d "$PAYLOAD" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).choices[0].message.content)}catch(e){console.error("LLM 응답 파싱 실패:",s.slice(0,300))}})'
