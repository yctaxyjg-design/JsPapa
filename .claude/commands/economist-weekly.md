---
description: The Economist 주간판 4개 섹션을 한국어 심층 분석으로 정리해 iCloud Drive에 저장
argument-hint: "[YYYY-MM-DD] (선택, 미입력시 오늘 기준 이번 주 토요일)"
---

# Economist Weekly Korean Analysis

## 목적
The Economist 주간판(Weekly Edition)에서 Business, Finance & Economics, Science & Technology, Culture 4개 섹션 기사를 web_fetch로 수집해 **저작권 안전 범위 내 심층 한국어 분석**을 작성하고 iCloud Drive에 저장한다.

## 저작권 가드레일 (반드시 준수)

The Economist는 유료 보도자산. 사용자는 개인 구독자이지만 구독은 "personal, non-commercial use" 즉 본인 열람권만 부여하며, 기사 전체 또는 상당 부분의 reproduction·translation·redistribution은 금지된다. 한국 저작권법 §28(인용) 범위 내에서만 영문 발췌 인용 허용. §22 2차적저작물(번역) 작성권 침범 금지.

**금지**
- 기사 본문 전체 또는 50% 이상 한국어 번역
- 영문 본문 단락의 직역 후 약간의 표현만 바꾼 풀어쓰기
- 페이월 우회·전체 본문 추출 시도

**허용**
- 영문 핵심 문장·단락 인용 (한 기사당 누적 200~300자 이내)
- 인용 + 한국어 해설·논평 (해설이 인용보다 길어야 함)
- 데이터·통계·고유명사 한국어 변환
- 사용자의 분석·시사점 도출

페이월 덕분에 전문이 안 가져와지므로 자연스럽게 가드 안에 들어옴. 이 사실을 활용할 것.

## 알려진 제약사항

1. **페이월**: web_fetch 시 기사당 첫 1문단만 제공. `walled-regwall`, `isAccessibleForFree: false`.
2. **추출 가능 데이터**: Next.js `__NEXT_DATA__` JSON에서 첫 문단 본문, AI summary bullets, meta description, 제목, 소제목(rubric/fly title), 인쇄판 제목, 태그, 읽기 시간 추출.
3. **Gmail MCP 끊김** (2026-04-18~): 이메일 기반 접근 불가.
4. **economist.com Chrome 차단**: Claude in Chrome MCP에서 safety restriction.
5. **click.e.economist.com 절대 금지**: Cloudflare 차단. (`.claude/settings.json`의 deny 리스트로도 차단됨)

## 사전 설치된 도구

이 저장소에는 다음이 준비되어 있다 — 매 실행마다 새로 짜지 말 것.

- `scripts/economist/weekly_url.sh [YYYY-MM-DD]` — 주어진 날짜 기준 주간판 URL 계산 (그 주 토요일)
- `scripts/economist/iso_week.sh [YYYY-MM-DD]` — ISO 주차 라벨 (예: `2026-20`)
- `scripts/economist/extract_next_data.sh <html>` — `__NEXT_DATA__` JSON 원문 추출
- `scripts/economist/parse_article.sh <html>` — 기사 페이지 → `{headline, flyTitle, rubric, description, datePublished, dateline, estimatedReadingTime, tags, aiSummary, print:{headline,rubric,flyTitle,section}, firstParagraph, firstSubhead, isAccessibleForFree, url}` JSON
- `scripts/economist/parse_weekly_index.sh <html>` — 주간판 인덱스 → `{editionDate, sections:{business,finance,science,culture:[{headline,rubric,description,url}]}, rawSections}` JSON
- `scripts/economist/save_analysis.sh <iso_week> <md_file>` — iCloud 경로가 있으면 그쪽, 없으면 `./economist/out/`에 저장
- `economist/templates/week_template.md`, `economist/templates/article_block.md` — 출력 양식

## 실행 절차

### 0. 인자 처리
- 명령 인자 `$ARGUMENTS`가 비어 있으면 오늘(`date -u +%Y-%m-%d`) 기준.
- `bash scripts/economist/weekly_url.sh $ARG` 결과를 `WEEKLY_URL`로 저장.
- `bash scripts/economist/iso_week.sh $ARG` 결과를 `ISO_WEEK`로 저장.

### 1. Weekly Edition 페이지 가져오기
- `WebFetch`(또는 환경에 노출된 `mcp__workspace__web_fetch`) 호출, URL은 위 `WEEKLY_URL`.
- 응답이 너무 크면 파일로 저장된다 (~390K chars). 그 경우 파일 경로를 받아 그대로 다음 단계로.
- `bash scripts/economist/parse_weekly_index.sh <html_path>` 호출 → 섹션·기사 목록 확보.
- `sections.business`, `sections.finance`, `sections.science`, `sections.culture` 4개만 사용. 나머지 섹션은 무시.

### 2. 개별 기사 fetch + 분석 (섹션별 병렬)
- 4개 서브에이전트 동시 실행 (`Agent` 도구, `subagent_type: general-purpose` 또는 `Explore`). 섹션당 1개 에이전트.
- 각 서브에이전트는 해당 섹션 모든 기사 URL을 `WebFetch`로 가져오고, 응답 HTML을 `scripts/economist/parse_article.sh`로 파싱.
- 서브에이전트가 돌려줘야 할 것: 섹션 이름, 기사별 파싱된 JSON, 그리고 아래 §3 양식으로 작성한 **한국어 분석 마크다운 블록 리스트**.
- 서브에이전트에 인용 가드(기사당 영문 누적 200~300자, 해설>인용)를 명시할 것.

### 3. 한국어 심층 분석 작성 (Option A 양식, `economist/templates/article_block.md` 준수)

기사당 출력 구조:

```
### [번호]. [한국어 제목]
**원문**: [English headline]
**소제목**: [rubric / fly title]
**URL**: [absolute url]
**읽기 시간**: N분 · **발행**: YYYY-MM-DD

**핵심 요약** (4~6문장)
기사의 주요 논점·핵심 결론·근거 데이터를 한국어로 압축. 영문 인용 없이 사용자 본인의 표현으로 작성. aiSummary bullet과 firstParagraph를 참고하되 직역 금지.

**핵심 인용 + 해설**

> "Original English sentence from the article." (1~2문장, 50~150자, 한 기사 누적 300자 이내)

**해설**: 위 문장의 함의·맥락·역사적 비교·반론까지 한국어로 풀어 설명. 인용보다 3~4배 분량. (해설 분량 > 인용 분량은 §28 인용 적법성의 핵심 요건)

**상세 분석** (8~12문장)
배경 맥락, 등장 인물·기관, 주요 데이터·인용 통계, 인과관계 논리 전개를 한국어로 구성. 원문 단락 직역이 아니라 사용자 본인의 분석으로 재구성. 이코노미스트가 "왜 이 시점에 이 주제를 다루는가", "주장의 강점·약점", "이코노미스트 특유의 자유주의적 시각이 어떻게 드러나는가"까지 포함.

**한국 연결점** (3~5문장)
한국 경제·세법·정책·기업·산업과의 연관성. 추상적 연결 금지, 구체적 기업명·법령·통계 인용.

**투자/정책 시사점** (2~3문장)
실행 가능한 인사이트. 추상적 결론 금지.
```

### 4. 마크다운 조립 및 저장

`economist/templates/week_template.md`를 베이스로 4개 섹션 블록을 채우고, 맨 아래 **주간 테마 종합**(4섹션 관통 흐름 1~2문단 + 관점 4불릿: 투자/시장, 정책/규제, 세정/재정, 사회/문화)을 작성.

임시 파일로 저장 후 헬퍼로 최종 경로에 복사:

```bash
tmp="$(mktemp /tmp/economist_weekly_XXXX.md)"
# ...write final markdown to $tmp...
bash scripts/economist/save_analysis.sh "$ISO_WEEK" "$tmp"
```

`save_analysis.sh`는 `/Users/yangjaegwon/Library/Mobile Documents/com~apple~CloudDocs/Economist_Weekly_Analysis/`가 접근 가능하면 그곳에, 아니면 `./economist/out/`에 `<ISO_WEEK>_week.md`로 저장한다.

### 5. 완료 로그 (반말 간결체)
- 저장 파일 경로 (`save_analysis.sh` stdout 그대로)
- 파싱된 기사 개수 (섹션별)
- 총 영문 인용 누적 글자수 (저작권 자기점검용)
- 소요 시간

## 에러 처리
- Weekly Edition 페이지 fetch 실패 → 에러 로그 후 종료
- 개별 기사 fetch 실패 → 해당 기사 건너뛰고 나머지 계속, 메타데이터 푸터에 `SKIPPED_LIST`로 기록
- 파서가 `__NEXT_DATA__`를 찾지 못함 → 해당 기사 스킵 (페이지 셰이프 변경 가능성 — `scripts/economist/economist_parser.py`의 `_SECTION_ALIASES`나 `_iter_section_items`를 재점검)

## 추가 제약
- click.e.economist.com 절대 금지 (Cloudflare 차단 + settings deny)
- 토큰 절약: HTML 전체를 Read로 읽지 말고 `parse_article.sh`로 JSON만 추출
- 파일 내용은 존댓말 허용. 로그는 반말 간결체
- 기존 파이썬 스크래퍼 호출 금지 (차단됨)
- **iMessage·이메일 등 외부 전송 일체 금지** (사적 이용 범위 유지)
- 본 작업은 사용자 본인 1인 학습용. 결과물 외부 공유·게시 금지를 전제로 작성.
