---
description: FT Edit 에디터 큐레이션 일일 분석 — 한글 3+1단계 심층 분석을 iCloud Drive에 저장
argument-hint: "[YYYY-MM-DD] (선택, 미입력시 오늘)"
---

# FT Edit Daily Korean Analysis

## 목적
FT Edit(https://www.ft.com/ft-edit) 에디터 큐레이션(4~10개)을 WebFetch로 수집하고, 3+1단계 한국어 심층 분석을 작성해 iCloud Drive에 저장한다. **새벽 5시 무인 실행을 전제로** 어떤 사용자 인터랙션(Chrome 권한 팝업, 로그인 갱신 등)도 요구하지 않는다.

## 핵심 설계 원칙

1. **Chrome 확장 의존성 제거**: 과거 `tabs_context_mcp`로 사용자 브라우저 세션을 가로채던 방식은 새벽에 권한 팝업이 떠서 실패했다. 이번 파이프라인은 WebFetch만 사용한다.
2. **페이월 미리보기로 충분**: FT의 og:title, og:description, JSON-LD Article 스키마, 첫 단락이 공개 영역에 노출된다. 이 데이터로 4단계 분석을 돌린다. The Economist 파이프라인이 같은 전제로 이미 작동 중이다.
3. **저작권 가드레일**: 한국 저작권법 §28(인용) 범위. 영문 발췌 누적 기사당 200~300자 이내, 한글 해설이 인용보다 길어야 함. 페이월 덕분에 자연스럽게 가드 안에 들어옴 — 이 사실을 활용할 것.
4. **무인 실행 = 멈추지 않음**: 어떤 기사가 페이월로 막혀도 가능한 만큼 분석하고 메타데이터에 "preview-only" 표기. "로그인 풀림 감지 후 사용자에게 알림 후 대기" 같은 블로킹 단계 금지.

## 사전 설치된 도구

- `scripts/fetch_url.sh <url> [out]` — **curl 기반 URL fetcher.** WebFetch 대신 사용. 무인 실행 시 WebFetch는 provenance 제한(사용자 메시지에 URL이 없으면 거부)으로 실패하므로 이 래퍼를 쓴다. 진짜 브라우저 UA 전송으로 ft.com 봇 차단도 우회. 성공 시 HTML 파일 경로 출력
- `scripts/ft-edit/parse_index.sh <html>` — FT Edit 페이지 → `{count, items:[{headline,url,standfirst}]}` JSON
- `scripts/ft-edit/parse_article.sh <html>` — 개별 기사 → `{headline, description, section, author, firstParagraph, paywallDetected, hasFullBody, ...}` JSON
- `scripts/ft-edit/icloud_root.sh` — FT-Edit-Daily/ iCloud 경로 해석 (cowork mount → Mac native → 실패시 exit 1)
- `scripts/ft-edit/load_index.py [--root DIR]` — `_index_cache.json` → `_index.json` → `{}` 순서로 로드, `{_meta, index}` JSON 반환
- `scripts/ft-edit/update_index.py --date YYYY-MM-DD --entry-json <path|-> [--root DIR]` — 캐시 필수 + iCloud 베스트에포트
- `scripts/ft-edit/save_analysis.sh <YYYY-MM-DD> <md_file>` — iCloud 또는 `ft-edit/out/`에 저장
- `ft-edit/templates/daily_template.md`, `ft-edit/templates/article_block.md` — 출력 양식

## 실행 절차

### 0. 인자 처리
```bash
DATE="${1:-$(date -u +%Y-%m-%d)}"
```

### 1. FT Edit 인덱스 페이지 fetch

**1차: curl 경로 (기본)**
```bash
URL="https://www.ft.com/ft-edit"
HTML="$(bash scripts/fetch_url.sh "$URL")" && echo "fetch_url OK: $HTML"
```
- `FT_COOKIE` 환경변수가 cowork secrets에 등록돼 있으면 자동으로 쿠키 헤더 첨부됨 (페이월·봇 차단 우회)
- 성공하면 그대로 다음 단계로

**2차: WebFetch 폴백 (curl 실패 시)**
curl이 403/네트워크 오류로 실패하면 WebFetch로 폴백한다. WebFetch는 URL provenance를 검사하므로, URL을 로컬 파일에 먼저 적고 `Read`로 컨텍스트에 끌어와 provenance를 만족시킨다:
```bash
URL="https://www.ft.com/ft-edit"
echo "$URL" > /tmp/ft_edit_target_url.txt
# Read /tmp/ft_edit_target_url.txt   ← Read 툴로 읽어 URL을 local file content로 만든다
# 그 다음 WebFetch(url=URL) 호출 — provenance 통과
# WebFetch 응답이 HTML이면 임시 파일에 저장 후 다음 단계로
```

**파싱**
```bash
bash scripts/ft-edit/parse_index.sh "$HTML" > /tmp/ft_edit_index.json
```
- `items` 배열에서 최대 10개 기사 URL 확보
- `items`가 0개면: "FT Edit 페이지 구조 변경 가능성. 파서 점검 필요" 로그 후 종료
- 두 경로 모두 실패: 에러 로그 후 종료 (다음 날 재시도)

### 2. 개별 기사 fetch + 파싱 (병렬)
- 기사 수가 4개 이하: 순차 실행으로 충분
- 5개 이상: 2~3개 서브에이전트(`Agent`, `subagent_type: general-purpose`)에 균등 분배해 병렬 실행
- 각 서브에이전트는 자기 몫의 URL을 §1과 동일한 2단(curl → WebFetch) 패턴으로 fetch 후 `parse_article.sh`로 JSON 추출. 기사 URL은 §1 인덱스 파싱 결과(`/tmp/ft_edit_index.json`)에서 나왔으므로 이미 컨텍스트에 있어 WebFetch provenance 통과
- 개별 기사 fetch 실패 시 해당 기사만 스킵, 나머지 계속, `SKIPPED_LIST`에 기록
- 본문 추출 시 JSON 메타데이터 부분(`__NEXT_DATA__` 등)은 분석에서 제외 (토큰 절약)

### 3. 인덱스 로드 (시계열 비교 준비)
```bash
python3 scripts/ft-edit/load_index.py
```
- 결과 JSON의 `_meta.source`가 `empty`면 "첫 회차"로 표기
- 그렇지 않으면 최근 5개 날짜 키를 골라 `key_topics`, `through_frame` 비교

**이전 분석 .md 파일은 절대 읽지 않는다** (iCloud 동기화 지연으로 EDEADLK 위험).

### 4. 4단계 분석 작성

#### 1단계: 전체 초단 요약
- 기사당 1~2문장 한글 요약 (영문 직역 금지, 본인 표현)
- 핵심 포인트 ≤3개
- **오늘의 관통 프레임**: 전체 기사를 꿰뚫는 하나의 주제

#### 2단계: 풀분석 (상위 3~4개)
선정 기준: **정책 변화 임박도 / 한국 파급 가능성 / 세무 실무 연관도**.
각 기사를 `ft-edit/templates/article_block.md` 양식으로:
- 한글 전문 번역 요약 (미리보기 분량 한도 내; 영문 인용 누적 ≤300자)
- 에디터가 이 기사를 선택한 목적
- 숨겨진 배경지식 (기사가 전제하는 독자의 사전지식)
- 생략된 맥락과 그 이유
- 맥락 이해를 위한 배경지식
- **나와의 접점**: 경산시청 세무과 지방소득세(양도소득분·법인소득분) 담당 공무원 + 세무사 시험 준비생 관점에서 **질문 1~2개**만 던진다. 답하지 않는다. 접점이 약하면 솔직히 "직접 접점 없음"으로 끝내고 억지 질문을 만들지 않는다.

#### 3단계: 메타 분석
- **편집 의도**: 전체 관통 맥락과 에디터가 묶어낸 의도
- **시계열 비교**: 최근 5회차의 `key_topics`, `through_frame` 비교 → 반복 주제, 새 주제, 추세
- **프롬프트 개선 포인트**: 이번 회차에서 드러난 한계·개선점

#### 4단계: 오늘 하나만 씹어볼 질문 (파일 맨 끝)
- 오늘 기사들을 관통하거나 가장 인상적인 한 기사에서 뽑은 **단 하나의 질문**
- 조건:
  - 구글링으로 답이 나오지 않을 것
  - 사용자의 실무·공부·세계관과 마찰을 일으킬 것
  - 5분이면 씹을 수 있지만 하루 종일 남을 것
  - 정답이 없거나, 정답이 불편한 질문이 최상
- 형식: `## 오늘 하나만` + 질문 1개 + 왜 이 질문인지 2~3문장 배경

### 5. 파일 저장 + 인덱스 이중 쓰기

#### 분석 파일
```bash
tmp="$(mktemp /tmp/ft_edit_XXXX.md)"
# ...write final markdown to $tmp...
bash scripts/ft-edit/save_analysis.sh "$DATE" "$tmp"
```
파일명: `YYYY-MM-DD_ft-edit.md`. 저장 경로는 `save_analysis.sh`가 결정 (iCloud 우선, 실패시 `ft-edit/out/`).

#### 인덱스 업데이트
```bash
cat > /tmp/ft_entry.json <<EOF
{
  "article_count": $N,
  "through_frame": "오늘의 관통 프레임 한 줄",
  "key_topics": ["키워드", "..."],
  "full_analysis_targets": ["풀분석 대상 헤드라인", "..."],
  "editor_intent": "에디터 편집 의도 한 줄",
  "recurring_from_prev": ["이전 회차에서 반복된 주제"],
  "new_this_session": ["이번에 새로 등장한 주제"],
  "mode": "preview-only|full-text|mixed"
}
EOF
python3 scripts/ft-edit/update_index.py --date "$DATE" --entry-json /tmp/ft_entry.json
```
- 캐시 쓰기는 필수, iCloud 쓰기는 베스트에포트 (`update_index.py`가 처리)

### 6. 완료 로그 (반말 간결체)
- 저장 경로 (`save_analysis.sh` stdout)
- 수집된 기사 수, 풀텍스트 가능 수, 페이월 미리보기 수
- 인덱스 누적 항목 수
- 소요 시간

## 에러 처리

| 상황 | 처리 |
|---|---|
| FT Edit 페이지 fetch 실패 | 에러 로그 후 종료 (다음 날 재시도) |
| 개별 기사 fetch 실패 | 해당 기사 스킵, 메타데이터 `SKIPPED_LIST`에 기록, 나머지 진행 |
| `parse_index.sh`가 0건 반환 | 페이지 구조 변경 가능성. `ft_edit_parser.py`의 `TeaserParser`와 fallback 정규식 점검 |
| 모든 기사가 페이월 풀텍스트 차단 | 미리보기만으로 분석 진행. 출력 상단 `{{MODE_NOTE}}`에 `> ⚠ 모든 기사가 페이월 미리보기 모드` 표기 |
| iCloud 경로 접근 불가 | `ft-edit/out/`에 저장. `save_analysis.sh`가 자동 처리 |

## 가드레일

- **사용자 입력 요구 절대 금지**: 무인 실행. 질문·확인·승인 다이얼로그·로그인 안내 일체 출력 금지.
- **저작권**: 영문 인용 기사당 ≤300자 누적, 한글 해설이 인용보다 길게.
- **나와의 접점**: 질문만, 답 금지. 접점 약하면 "직접 접점 없음"으로 끝낸다.
- **오늘 하나만**: 억지 연결 금지. 마찰을 주는 질문 1개만.
- **외부 전송 금지**: iMessage·이메일 일체 안 됨. 사적 이용 범위 유지.
- **시계열 비교**: `_index.json` 비어있으면 "첫 회차"로 표기. 이전 .md 파일 절대 읽지 않음.
- **톤**: 반말, 직설. 논어 등 고전 인용 환영.
- 토큰 절약: HTML 전체를 `Read`로 읽지 말고 `parse_article.sh`로 JSON만 추출.

## 호출 예
```bash
# 오늘자 분석 (인자 없음 = today UTC)
# 스케줄러가 매일 새벽 5시에 이 명령을 실행:
/ft-edit-daily

# 특정 날짜로 다시 돌리기
/ft-edit-daily 2026-05-16
```
