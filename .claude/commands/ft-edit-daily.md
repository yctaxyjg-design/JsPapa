---
description: FT Edit(에디터 큐레이션) 매일 분석 — 한글 번역 + 3+1단계 심층 분석 → iCloud 저장
argument-hint: "[YYYY-MM-DD] (선택, 미입력시 오늘)"
---

# FT Edit Daily Analysis

## 개요

매일 새벽 5시 자동 실행 전제. FT Edit(https://www.ft.com/ft-edit)에서 에디터 큐레이션 기사(4~10개)를 수집하고, 한글 번역 및 3+1단계 분석을 수행하여 iCloud Drive에 저장한다.

## 사전 설치된 도구 (매 실행마다 새로 짜지 말 것)

이 저장소에 미리 준비된 헬퍼를 그대로 사용한다.

- `scripts/ft-edit/resolve_icloud.sh` — `/sessions/*/mnt/com~apple~CloudDocs` 등 iCloud 마운트 루트를 찾아 출력
- `scripts/ft-edit/ensure_dirs.sh` — `FT-Edit-Daily/`, `FT-Edit-Daily/_config/`, `_index_cache.json` 부트스트랩
- `scripts/ft-edit/index_io.py read` — 인덱스 읽기 (캐시 우선, iCloud 폴백, 둘 다 없으면 `{}`)
- `scripts/ft-edit/index_io.py write --date YYYY-MM-DD --payload entry.json` — 인덱스 이중 쓰기 (캐시 + iCloud, iCloud 실패 시 캐시만)
- `scripts/ft-edit/save_analysis.sh YYYY-MM-DD <md>` — 분석 .md를 iCloud에 저장 (실패 시 `ft-edit/out/`)
- `scripts/ft-edit/bootstrap.sh` — SessionStart에서 한 번 실행됨; 디렉터리/캐시 생성 + 인덱스 카운트 로그
- `ft-edit/templates/daily_template.md`, `stage1_block.md`, `full_analysis_block.md` — 출력 양식

## 실행 절차

### 0단계: Chrome 연결 확인

1. `tabs_context_mcp` (또는 `mcp__chrome__*`, 환경에 노출된 Chrome MCP 툴 중 하나)로 활성 탭 컨텍스트 호출.
2. 응답 없거나 에러 → 사용자에게 다음 메시지 보내고 **중단**:
   > "Chrome 확장 연결이 안 돼. 확장 켜고 다시 트리거해줘."

### 1단계: FT Edit 접속 및 로그인 상태 확인

1. `navigate("https://www.ft.com/ft-edit")`
2. JavaScript로 기사 목록 스크래핑 (URL 잘림 방지를 위해 기사별 개별 추출):

   ```javascript
   const cards = document.querySelectorAll('.o-teaser');
   const count = cards.length;
   const idx = 0;
   const card = cards[idx];
   const link = card.querySelector('.o-teaser__heading a');
   JSON.stringify({ t: link.textContent.trim(), u: link.href });
   ```

3. **로그인 풀림 감지**: 첫 번째 기사로 `navigate` → `get_page_text` 후
   - 본문에 "free 30-day trial", "Subscribe", "Restart your subscription", "Start your free trial" 등 구독 안내가 본문 대부분을 차지하거나
   - 본문이 2~3문장 미리보기로 잘리면
   → **로그인 풀린 것으로 판단**. 사용자에게:
   > "FT 로그인이 풀렸어. 다시 로그인해주면 오늘자 분석 바로 진행할게."
   → **중단하고 대기**.

### 2단계: 기사 본문 수집

- 각 기사 URL에 순차 접근(`navigate` → `get_page_text`)
- 모든 기사 본문 수집. JSON 메타데이터(`script[type="application/ld+json"]` 등) 부분은 분석 대상에서 제외해 토큰 절약.

### 3단계: 인덱스 파일 로드 (시계열 비교 준비)

```bash
python3 scripts/ft-edit/index_io.py read
```

stdout = 인덱스 JSON (없으면 `{}`), stderr = `# source=cache|icloud|empty entries=N ...`. iCloud 읽기 실패는 자동 재시도(0.5s × 3회) 후 폴백. **이전 분석 .md 파일은 읽지 않는다** (iCloud 동기 지연 → EDEADLK 가능).

### 4단계: 3+1단계 분석 수행

#### 1단계 분석: 전체 기사 초단 요약

기사당 `ft-edit/templates/stage1_block.md` 양식:

- 1~2문장 핵심 요약 (한글)
- 핵심 포인트 ≤3개
- **오늘의 관통 프레임**: 전체 기사를 꿰뚫는 하나의 주제/프레임 도출

#### 2단계 분석: 상위 3~4개 풀분석

선정 기준: 정책 변화 임박도 / 한국 파급 가능성 / 세무 실무 연관도.
각 기사에 대해 `ft-edit/templates/full_analysis_block.md` 양식:

- 한글 전문 번역 요약
- 에디터가 이 기사를 선택한 목적
- 숨겨진 배경지식 (기사가 전제하는 독자의 사전지식)
- 생략된 맥락과 그 이유
- 맥락 이해를 위한 배경지식
- 나와의 접점 — **질문형으로 작성**: 경산시청 세무과 지방소득세(양도소득분·법인소득분) 담당 공무원 + 세무사 시험 준비생 관점에서, 이 기사가 촉발하는 사고의 실마리를 **답이 아니라 질문 1~2개**로 던진다. 접점이 약하면 솔직히 "직접 접점 없음"으로 끝내고 억지 질문을 만들지 않는다.

#### 3단계 분석: 메타 분석

- 전체 관통 맥락과 에디터의 편집 의도
- 시계열 비교: 인덱스의 이전 엔트리들을 참조하여 반복 주제, 변화, 추세 분석. **최근 5회차**의 `key_topics`, `through_frame` 비교로 트렌드 도출
- 프롬프트 개선 포인트

#### 4단계 분석: 오늘 하나만 씹어볼 질문

- 분석 파일 맨 끝에 배치
- 오늘 기사를 관통하는, 또는 가장 인상적인 기사에서 뽑은 **단 하나의 질문**
- 조건:
  - 구글링으로 답이 나오지 않는 질문
  - 사용자의 실무·공부·세계관과 마찰을 일으키는 질문
  - 5분이면 씹을 수 있지만 하루 종일 남는 질문
  - 정답이 없거나, 정답이 불편한 질문이 최상
- 형식: `## 오늘 하나만` + 질문 1개 + 왜 이 질문을 던지는지 2~3문장 배경

### 5단계: 파일 저장 및 인덱스 업데이트 (이중 쓰기)

1. **분석 .md 저장**:

   ```bash
   tmp="$(mktemp /tmp/ft_edit_XXXX.md)"
   # ...최종 마크다운을 $tmp에 작성...
   bash scripts/ft-edit/save_analysis.sh "YYYY-MM-DD" "$tmp"
   ```

   `save_analysis.sh`는 iCloud 마운트가 있으면 `FT-Edit-Daily/YYYY-MM-DD_ft-edit.md`로, 없으면 `ft-edit/out/`로 저장한다.

2. **인덱스 이중 쓰기**: 페이로드 JSON 임시 파일 생성 후 헬퍼 호출.

   ```bash
   payload="$(mktemp /tmp/ft_edit_idx_XXXX.json)"
   cat > "$payload" <<'EOF'
   {
     "article_count": 8,
     "through_frame": "오늘의 관통 프레임 한 줄",
     "key_topics": ["주요 키워드 10~15개"],
     "full_analysis_targets": ["풀분석 대상 기사 제목"],
     "editor_intent": "에디터 편집 의도 한 줄",
     "recurring_from_prev": ["이전 회차에서 반복된 주제"],
     "new_this_session": ["이번에 새로 등장한 주제"]
   }
   EOF
   python3 scripts/ft-edit/index_io.py write --date "YYYY-MM-DD" --payload "$payload"
   ```

3. 마지막에 사용자에게 `computer://` 링크로 파일 공유.

## 주의사항

- 토큰 효율: 기사 본문 수집 시 JSON 메타데이터(`<script type="application/ld+json">` 등) 부분은 분석에서 제외
- "나와의 접점"은 질문만 던지고 답하지 않는다
- "오늘 하나만" 질문에서 억지 연결 금지
- 시계열 비교 시 인덱스가 비어있으면 "첫 회차"로 표기
- 논어 등 고전 인용 환영
- 반말, 직설적 톤 유지
- 본 결과물은 **사용자 본인 1인 학습용**. 외부 공유·게시 금지를 전제로 작성.
