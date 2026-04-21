# JsPapa

크롬 브라우저에서 **HWP / HWPX** 한글 문서를 바로 열어보는 확장 프로그램.
순수 JavaScript 로만 동작하며, 문서를 외부 서버로 전송하지 않습니다.
모든 파싱·렌더링은 브라우저 내부에서만 일어납니다.

> `rhwp` (Rust + WebAssembly 구현) 에서 영감을 받았지만, JsPapa 는
> **WebAssembly 의존성 없이** 브라우저 표준 API 만으로 문서를 읽습니다.

## 주요 기능

- **HWPX (.hwpx)** — OWPML (ZIP + XML) 기반 문서 파싱 및 HTML 렌더링
  - 섹션/단락/런, 기본 문자 속성 (굵게, 기울임, 밑줄, 색상, 크기)
  - 표 (colspan / rowspan 포함)
  - `BinData/` 에 포함된 이미지 인라인 표시 (PNG · JPG · GIF · BMP · SVG · WebP)
- **HWP 5.x (.hwp)** — CFB/OLE 컨테이너에서 본문 텍스트 추출 및 단락 단위 표시
  - `FileHeader` · `BodyText/Section*` 스트림 직접 파싱
  - DEFLATE 자동 압축 해제 (브라우저 `DecompressionStream` 사용)
  - 암호화 / 배포(DRM) 문서는 명시적으로 거부
- 드래그 앤 드롭, 파일 선택, URL 파라미터, 컨텍스트 메뉴 연동
- 확대/축소, 원문 텍스트 보기 토글

## 설치 방법 (개발자 모드)

1. 크롬 에서 `chrome://extensions` 열기
2. 오른쪽 위 **개발자 모드** 토글을 켜기
3. **압축해제된 확장 프로그램을 로드합니다** 클릭
4. 이 저장소의 `extension/` 폴더 선택

## 사용 방법

- 확장 아이콘을 눌러 팝업에서 **파일 선택해서 바로 열기**
- 뷰어 페이지에 `.hwp` 또는 `.hwpx` 파일을 드래그하여 놓기
- 웹에 공개된 `.hwp` / `.hwpx` 링크를 **우클릭 → JsPapa 뷰어로 열기**
- 직접 URL 로 열려면 `chrome-extension://<id>/viewer.html?url=<인코딩된_URL>`

## 폴더 구조

```
extension/
├── manifest.json      Manifest V3 매니페스트
├── background.js      서비스 워커 (컨텍스트 메뉴, 메시지 라우팅)
├── popup.{html,css,js}  확장 아이콘 팝업
├── viewer.{html,css,js} 전체 화면 뷰어
├── icons/             확장 아이콘 (16 / 48 / 128)
└── lib/
    ├── zip.js         ZIP 리더 (DecompressionStream 기반)
    ├── cfb.js         CFB / OLE2 컨테이너 리더
    ├── hwpx.js        HWPX (OWPML) 파서 & HTML 렌더러
    └── hwp.js         HWP 5.x 텍스트 추출기
```

## 의존성

**없음.** 외부 라이브러리도, 빌드 단계도 없습니다.
크롬에서 바로 로드해서 사용하면 됩니다.

- ZIP 압축 해제: 브라우저 기본 `DecompressionStream('deflate-raw')`
- XML 파싱: 브라우저 기본 `DOMParser`
- CFB 컨테이너: 순수 JavaScript 로 구현 (`lib/cfb.js`)

## 제한 사항

- HWP 바이너리 본문은 현재 텍스트 위주로 추출합니다. 표·그림·문자 서식은
  HWPX 로 저장하면 온전히 보입니다. (HWP 바이너리는 레코드 기반의 복잡한
  포맷이라, 서식 완전 지원은 추후 과제입니다.)
- 암호/DRM 보호 문서는 지원하지 않습니다.
- HWP 2007 이전 버전(3.0 등)은 컨테이너부터 달라 지원하지 않습니다.

## 라이선스

MIT (`LICENSE` 참조)
