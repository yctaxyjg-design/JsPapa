# KIFRS 검색 (RAG)

한국채택국제회계기준(K-IFRS) 기업회계기준서를 **브라우저에서 검색**하는 정적 웹앱입니다.
빌드 도구·서버 없이 `index.html`만 열면 동작합니다.

## 무엇을 검색하나

기준서 **색인**을 검색합니다.

- 기준서 번호(예: 제1116호)와 대응 IFRS(예: IFRS 16)
- 국문 제목 / 분류
- 핵심 요약과 키워드

전체 K-IFRS 기업회계기준서 체계(제1001호 재무제표 표시 ~ 제1117호 보험계약)를 담은
`corpus.json`을 색인 데이터로 사용합니다.

> 기준서 **전문(全文)** 은 한국회계기준원(KASB)에 저작권이 있어 이 저장소에 포함하지
> 않았습니다. 전문 검색이 필요하면 아래 "전문 RAG로 확장"을 참고하세요.

## 동작 방식 (RAG의 retrieval 단계)

`search.js`가 순수 클라이언트에서 처리합니다.

1. **토크나이저** — 한국어는 음절 유니그램 + 바이그램, 영문/숫자는 단어 토큰.
   형태소 분석기 없이도 "리스", "사용권자산", "1116", "fvoci" 등이 매칭됩니다.
2. **BM25 랭킹** — 질의 토큰별 TF 포화·문서 길이 정규화·IDF로 관련도 점수 계산.
   제목·키워드 필드에 가중치를 줍니다.
3. **하이라이트** — 일치 부분을 결과 스니펫에 `<mark>`로 강조.

생성(LLM) 단계가 필요하면, 검색 상위 결과의 요약·키워드를 그대로 LLM 프롬프트의
근거(context)로 붙이면 됩니다.

## 실행

`fetch`로 `corpus.json`을 불러오므로 `file://` 직접 열기는 브라우저가 막을 수 있습니다.
정적 서버로 띄우세요.

```sh
cd kifrs
python3 -m http.server 8000
# → http://localhost:8000
```

## 로컬 Ollama RAG 브리지 (bge-m3 + qwen3)

`build/rag_ollama.py`는 corpus를 **bge-m3로 임베딩**해 로컬 벡터 검색을 하고,
검색 근거를 **qwen3 LLM**에 주입해 한국어로 답합니다. 실무(세무조정)·수험(회계학)
맥락에 맞춘 시스템 프롬프트를 씁니다.

- **의존성 없음**: 표준 라이브러리(urllib)만 사용 → `pip install` 불필요.
- **전부 로컬·오프라인**: Ollama(`localhost:11434`)에만 접속, 외부 전송 없음.
- **임베딩 캐시**: 같은 텍스트는 재임베딩하지 않음.
- **경로 하드코딩 없음**: `--corpus` 인자로 받고, 기본값은 스크립트 옆 `../corpus.json`.

```sh
cd kifrs
# 0) 연결/모델 점검
python build/rag_ollama.py --selftest
# 1) 색인 빌드(최초 1회, corpus 변경 시 --build)
python build/rag_ollama.py --build
# 2) 질의
python build/rag_ollama.py --ask "리스 사용권자산 최초측정은?"
# 대화형
python build/rag_ollama.py
# 검색 근거만(LLM 없이)
python build/rag_ollama.py --retrieve-only --ask "이연법인세 일시적차이"
# 다른 프로그램/로컬 AI 연동용 JSON 출력
python build/rag_ollama.py --json --ask "리스 사용권자산 최초측정은?"
python build/rag_ollama.py --json --retrieve-only --ask "이연법인세 일시적차이"
```

`--json` 출력 스키마: `{ query, retrieve_only, answer, sources:[...], hits:[{id,no,title,ifrs,score,text}] }`
(`--retrieve-only`면 `answer`는 `null`, `hits`만 채워짐).

모델 태그가 다르면 환경변수나 인자로 바꿉니다:

```sh
python build/rag_ollama.py --embed-model bge-m3:latest --llm-model qwen3.6:35b-a3b
# 또는: export KIFRS_EMBED_MODEL=... KIFRS_LLM_MODEL=... OLLAMA_HOST=http://localhost:11434
```

> 색인 품질은 corpus 내용에 비례합니다. 지금은 색인(요약)만 임베딩하므로,
> 전문(全文) 답변이 필요하면 위 "전문 RAG로 확장"으로 `corpus.full.json`을 만든 뒤
> `--corpus corpus.full.json --build` 하면 청크 단위로 임베딩·검색합니다.

## 다른 PC(회사 윈도우 등)에서 나 혼자 쓰기 — 설치·서버 없이

`kifrs-standalone.html` **한 파일**에 데이터·검색엔진·스타일이 모두 들어 있습니다.
인터넷·파이썬·노드·서버가 필요 없고, **더블클릭하면 브라우저에서 바로** 열립니다.
잠긴 회사 PC에서 개인용으로 쓰기에 적합합니다(배포 아님).

가져가는 방법(아무거나):

1. **GitHub에서 내려받기** — 저장소의 `kifrs/kifrs-standalone.html`을 열고 `Download raw file`.
   회사 PC에서 GitHub 접근이 막혀 있으면 아래 방법을 쓰세요.
2. **나에게 메일/메신저로 첨부** 또는 **USB 복사** — 파일 하나만 옮기면 됩니다.
3. 옮긴 뒤 파일을 **더블클릭** → 기본 브라우저(Chrome/Edge 등)에서 검색 동작.

> 오프라인으로 동작합니다. 즐겨찾기에 추가하면 바로 열 수 있습니다.

### 직접 다시 만들기

내용(corpus)이나 UI를 바꾼 뒤 단일 파일을 새로 만들려면 (Node 필요):

```sh
cd kifrs
node build/bundle.js     # → kifrs-standalone.html 재생성
```

## 전문 RAG로 확장

배포 환경(Claude Code on the web)은 아웃바운드 네트워크가 차단되어 세션 안에서
공개 출처를 실시간 수집할 수 없습니다. 전문은 네트워크가 열린 로컬에서 보강합니다.

1. 적법하게 확보한 기준서 원문을 `kifrs/raw/<기준서번호>.txt`로 저장 (예: `raw/1116.txt`).
2. 청크 분할 + 색인 병합:

   ```sh
   cd kifrs
   python3 build/fetch_kifrs.py --input ./raw --catalog ./corpus.json --out ./corpus.full.json
   ```

3. `search.js`의 `KIFRS.load()` 인자를 `corpus.full.json`으로 바꾸고,
   `chunks` 필드를 검색 텍스트에 포함하도록 확장하면 전문 검색이 됩니다.

> 저작권 주의: KIFRS 기준서 전문의 권리는 한국회계기준원에 있습니다.
> 권리가 없는 텍스트를 공개 저장소에 커밋하지 마세요. `raw/`와 `corpus.full.json`은
> `.gitignore` 처리하는 것을 권장합니다.

## 파일

| 파일 | 설명 |
| --- | --- |
| `index.html` | 검색 UI |
| `search.js` | 토크나이저 + BM25 검색 엔진 + UI 연결 |
| `kifrs.css` | 전용 스타일 (공통 `../styles.css` 변수 재사용) |
| `corpus.json` | 기준서 색인 카탈로그 |
| `build/fetch_kifrs.py` | 전문 보강(청크 분할) 스크립트 (로컬용) |
