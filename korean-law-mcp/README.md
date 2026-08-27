# korean-law-mcp

법제처 OpenAPI(`law.go.kr/DRF`)를 감싼 MCP 서버. Streamable HTTP 트랜스포트로 `/mcp`에서 응답한다.

## 툴

| 툴 | 법제처 target | 대상 |
|---|---|---|
| `search_law` / `get_law` | `law` | 법령 |
| `search_precedent` | `prec` | 판례 |
| `search_interpretation` / `get_interpretation` | `expc` | 법제처 법령해석례 |
| `search_admin_rule` / `get_admin_rule` | `admrul` | 행정규칙 (훈령·예규·고시·공고) |
| `search_ordinance` | `ordin` | 자치법규 (조례·규칙) |

## 검색이 0건으로 나올 때

**법제처 검색은 기본이 제목 매칭이다.** 본문 검색이 아니라서 여러 낱말을 이어 붙이면 거의 항상 0건이 나온다. 0건은 "DB에 없다"가 아니라 "제목이 안 맞았다"는 뜻이다.

```
search_interpretations("개인지방소득세")                       → 0건
search_interpretations("지방소득세")                           → 2건
search_tax_tribunal("양도소득 개인지방소득세 무신고가산세")     → 0건
search_tax_tribunal("개인지방소득세")                          → 26건
```

대응 순서:

1. 핵심어 **하나**로 줄인다 (`개인지방소득세` → `지방소득세`)
2. 그래도 안 나오면 `search=2`(본문검색)로 다시 조회한다
3. 그래도 0건일 때만 범위 밖으로 판단한다

## 범위 경계 — 지방세 실무 기준

조회되는 것:

- 행안부 「지방세관계법 운영 예규」 — `search_admin_rule(query="지방세", knd="2")` → 행정규칙ID `67686`
- 행안부 「지방세 소송사무처리규정」 — 같은 방식
- 법제처 법령해석례 (지방세 관련 143건 등)

조회되지 **않는** 것:

- **행안부 지방세운영과 개별 질의회신** (예: `지방세운영과-1885`). 행정규칙이 아니라 개별 회신이라 법제처 DB에 실리지 않는다. 위택스 지방세정보시스템이나 행안부 지방세 예규집을 직접 봐야 한다.

## 실행

```sh
OC=<법제처_인증키> npm start      # 기본 포트 8080
curl localhost:8080/health
```

`OC`(또는 `LAW_OC`) 환경변수가 없으면 모든 툴 호출이 에러를 낸다. 키는 코드에 넣지 말고 환경변수/시크릿으로만 넘긴다.

## 배포

`fly.toml` 기준 Fly.io(`nrt`)에 배포한다.

```sh
fly secrets set OC=<법제처_인증키>
fly deploy
```
