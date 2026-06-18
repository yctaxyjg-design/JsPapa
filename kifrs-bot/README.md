# K-IFRS 텔레그램 봇 (로컬 AI)

한국채택국제회계기준(K-IFRS)을 자연어로 질문하면, **로컬 LLM**이 코퍼스에서 검색한
근거 문단을 바탕으로 답변하고 문단 번호까지 인용해 주는 텔레그램 봇입니다.

외부 유료 API 없이 동작합니다. LLM은 OpenAI 호환 엔드포인트면 무엇이든 사용할 수
있어 **Ollama / LM Studio / llama.cpp / vLLM** 모두 호환됩니다.

```
사용자 질문 ──▶ search_kifrs() ──▶ 근거 문단 top-k
                                        │
                                        ▼
                              로컬 LLM (RAG 프롬프트)
                                        │
                                        ▼
                        근거 인용이 포함된 한국어 답변
```

## 구성

| 파일 | 역할 |
|------|------|
| `rag.py` | `search_kifrs(query, k, section)` — 로컬 키워드 검색 |
| `llm.py` | OpenAI 호환 로컬 LLM 클라이언트 |
| `answer.py` | 검색 + LLM 결합(RAG) 답변 생성 |
| `bot.py` | 텔레그램 봇 (polling) |
| `corpus/*.json` | K-IFRS 문단 코퍼스 (시드: 제1002호 재고자산) |

## 1. 사전 준비

### 로컬 LLM (Ollama 예시)
```sh
# https://ollama.com 설치 후
ollama pull qwen2.5:7b-instruct   # 또는 gemma2:9b, llama3.1:8b 등
ollama serve                      # http://localhost:11434
```

### 텔레그램 봇 토큰
1. 텔레그램에서 [@BotFather](https://t.me/BotFather) 와 대화
2. `/newbot` → 이름/유저네임 입력 → 토큰 발급

## 2. 설치 & 실행

```sh
cd kifrs-bot
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env   # 토큰/모델 값 채우기
export $(grep -v '^#' .env | xargs)   # 또는 직접 export

python bot.py
```

이제 텔레그램에서 봇에게 질문하면 됩니다.

## 3. LLM 없이 검색만 테스트

```sh
python rag.py "재고자산 비정상적으로 낭비된 부분 감모손실 비용 인식"
python answer.py "비정상적으로 낭비된 재료원가는 어떻게 처리하나요?"
```
LLM 서버가 없으면 `answer.py`는 검색 결과만 반환합니다(폴백).

## 4. 코퍼스 확장

`corpus/` 에 아래 형식의 JSON을 추가하면 자동으로 검색 대상에 포함됩니다.

```json
{
  "standard": "K-IFRS 제1115호 고객과의 계약에서 생기는 수익",
  "chunks": [
    {
      "id": "1115-31",
      "paragraph": "31",
      "section": "본문",
      "title": "수행의무의 이행에 따른 수익 인식",
      "tags": ["수익", "수행의무", "통제 이전"],
      "text": "..."
    }
  ]
}
```

## 주의

- 코퍼스는 학습/검색 편의를 위한 **요약 시드 데이터**입니다. 실제 업무 판단 시에는
  한국회계기준원(KASB)이 공표한 공식 기준서 원문을 확인하세요.
- 봇 답변은 참고용이며 회계·세무 자문을 대체하지 않습니다.
