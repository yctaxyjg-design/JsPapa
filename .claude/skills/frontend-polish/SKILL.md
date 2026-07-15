---
name: frontend-polish
description: >-
  JsPapa 저장소(math-play·hangul·iPad 스케줄러 등)의 정적 웹앱 UI/UX를 다듬을 때
  따르는 프론트엔드 규칙 모음. HTML·CSS·JS 화면, 버튼·레이아웃·색·폰트·애니메이션,
  아이패드/애플펜슬 터치, 6세용 접근성, 반응형/PWA를 손볼 때 트리거한다.
  "UI 다듬어", "버튼 예쁘게", "레이아웃 손봐", "터치 안 먹혀", "아이패드에서 이상해",
  "반응형 깨져", "색/폰트 바꿔", "접근성", "홈화면 앱처럼" 같은 요청에 사용.
---

# 프론트엔드 다듬기 (JsPapa)

이 저장소는 **빌드 도구·외부 의존성이 전혀 없는 정적 웹앱** 모음이다.
6세 아이가 아이패드 사파리에서 애플펜슬로 쓰는 교육용 앱(`math-play`, `hangul`)과
정적 유틸(`index.html` iPad 스케줄러)이 대상이다. 화면을 손볼 때 아래 원칙을 지킨다.

## 0. 먼저 확인
- 어느 앱인지 파악: 루트 `index.html`(스케줄러) / `math-play/` / `hangul/` / `economist` 등.
- 그 앱의 `styles.css`·`app.js`를 먼저 읽고 **기존 패턴을 따른다**. 새 스타일을 발명하지 말 것.
- 손대기 전과 후를 실제로 확인한다. 이 환경엔 Chromium이 깔려 있으니 Playwright로 띄워
  스크린샷/클릭을 검증할 수 있다(`/verify`, `/run`과 겹치면 그쪽을 우선).

## 1. 빌드리스 원칙 (절대 규칙)
- **npm·번들러·프레임워크(React/Vue 등) 도입 금지.** 순수 HTML/CSS/바닐라 JS 유지.
- **외부 CDN·폰트·아이콘 링크 금지.** `recognizer.js`처럼 의존성 없이 자체 구현한다.
  자산이 필요하면 인라인 SVG나 저장소 내 파일로 넣는다.
- 실행은 정적 서버뿐: `python3 -m http.server 8000`. 이 전제를 깨는 변경은 하지 않는다.

## 2. 디자인 토큰 (애플 HIG)
- 색·반경·그림자·폰트는 **`styles.css`의 `:root` CSS 변수를 재사용**한다. 색을 하드코딩하지 말 것.
  기존 토큰: `--bg --surface --text --muted --accent(#007aff) --accent-hover --danger --radius --shadow`.
- 폰트 스택은 `-apple-system … "Apple SD Gothic Neo" "Noto Sans KR"` 유지(한글 우선).
- 새 색이 꼭 필요하면 하드코딩 대신 `:root`에 변수로 추가하고 그걸 참조한다.
- 다크모드를 건드릴 땐 `prefers-color-scheme`로 토큰 값만 바꾸고, 규칙을 중복 작성하지 않는다.

## 3. 아이패드 · 애플펜슬 · 터치
- **터치 타겟 최소 44×44pt**(아이용은 더 크게). 간격도 넉넉히.
- 포인터는 `PointerEvent`로 통일해서 펜/손가락을 함께 처리한다. `pointerType === 'pen'`으로
  애플펜슬을 구분하고, 펜 입력 중엔 **손바닥 터치를 무시(팜 리젝션)** 하는 기존 로직을 유지·확장한다.
- 필기/드래그 캔버스에는 `touch-action: none`, 스크롤 영역엔 명시적 `touch-action`을 준다.
- iOS 확대·튐 방지: 입력 폰트 ≥16px, `user-scalable` 남용 금지(접근성 해침),
  더블탭 확대가 필요없는 곳은 `touch-action: manipulation`.
- 전체화면 PWA를 고려해 `env(safe-area-inset-*)`로 노치/홈 인디케이터 여백을 준다.

## 4. 6세용 접근성·UX
- **글 대신 그림·색·소리.** 텍스트는 최소화하고, 문제/피드백은 한국어 TTS로 읽어 준다(기존 패턴).
- 색만으로 정보를 전달하지 않는다(모양·아이콘·소리 병행). 대비는 WCAG AA 이상.
- **실패에 관대하게.** 오답/미인식은 벌 없이 "다시 해보자"로. `recognizer.js`의
  "잘 모르겠어요" 처리처럼 애매하면 재시도를 유도한다.
- 조작에 즉각적이고 분명한 피드백(애니메이션·소리·햅틱 대체 시각효과)을 준다.
- 애니메이션은 짧고 부드럽게, `prefers-reduced-motion`을 존중한다.

## 5. 반응형 / PWA
- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` 유지.
- 세로/가로 both 대응. 고정 px 레이아웃 대신 flex/grid + `min()/max()/clamp()`.
- 홈 화면 추가(standalone)를 전제로: `manifest.webmanifest`·아이콘·`display: standalone`이
  있는 앱(math-play)은 변경 시 매니페스트도 함께 맞춘다.

## 6. 코드 스타일
- 주석·UI 문구는 **한국어**. 기존 파일의 톤(간결한 반말/설명체)을 따른다.
- CSS는 `* { box-sizing: border-box }` 전제, 클래스명은 기존 케밥/의미 기반을 따른다.
- JS는 모듈 없이 파일 단위. 전역 오염 최소화(IIFE/블록 스코프), 외부 라이브러리 도입 금지.

## 검증 체크리스트
- [ ] 빌드 없이 정적 서버로 그대로 열림
- [ ] 외부 네트워크 요청 0개(폰트·CDN 포함)
- [ ] 아이패드 세로/가로에서 안 깨짐, 터치 타겟 충분
- [ ] 펜/손가락 both 동작, 팜 리젝션 유지
- [ ] 색 하드코딩 없이 토큰 사용
- [ ] `prefers-reduced-motion`·대비 확인
