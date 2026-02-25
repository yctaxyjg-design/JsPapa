# Mail → Hazel → FineReader OCR 자동화 가이드

korea.kr 메일 첨부파일을 자동으로 OCR 처리하는 파이프라인 설정 가이드입니다.

## 워크플로우 개요

```
Apple Mail (korea.kr 수신)
    ↓  AppleScript로 첨부파일 저장
iCloud Drive/작업파일/_incoming
    ↓  Hazel rule → shell script 실행
작업파일/_to_ocr  +  Parallels VM 시작
    ↓  FineReader 16 Hot Folder
검색 가능 PDF → 작업파일/
```

## 파일 구조

```
iCloud Drive/작업파일/
├── _incoming/          ← Mail 첨부파일 저장 위치
├── _to_ocr/            ← OCR 대기열 (Hazel → FineReader)
├── .hazel_ocr.log      ← 자동화 로그
└── (OCR 완료 PDF 출력)
```

---

## 1단계: Apple Mail 규칙 설정

### 규칙 생성
1. **Mail.app** > 환경설정 > 규칙
2. **규칙 추가** 클릭
3. 설정:
   - **이름**: `korea.kr 첨부파일 자동 저장`
   - **조건**: "보낸 사람"이 `yctaxyjg@korea.kr` 포함
   - **동작**: "AppleScript 실행" 선택

### AppleScript 연결
1. `scripts/mail_rule_save_korea_attachments.applescript` 파일을
   `~/Library/Application Scripts/com.apple.mail/` 에 복사
2. Mail 규칙의 AppleScript 동작에서 해당 스크립트 선택

```bash
cp scripts/mail_rule_save_korea_attachments.applescript \
   ~/Library/Application\ Scripts/com.apple.mail/
```

---

## 2단계: Hazel 규칙 설정

### 감시 폴더 추가
1. **Hazel** 환경설정 열기
2. 왼쪽 폴더 목록에 추가:
   ```
   ~/Library/Mobile Documents/com~apple~CloudDocs/작업파일/_incoming
   ```

### 규칙 생성
1. **이름**: `OCR 대기열로 이동`
2. **조건**:
   - Kind is not Folder
3. **동작**:
   - Run shell script: `scripts/hazel_enqueue_to_ocr.sh`
   - ✅ "Pass matched file as argument" 체크

### 스크립트 경로 설정
Hazel에서 스크립트를 찾을 수 있도록 절대 경로를 사용하거나,
프로젝트를 클론한 위치를 기준으로 설정합니다:

```bash
# 스크립트에 실행 권한 부여
chmod +x scripts/hazel_enqueue_to_ocr.sh
```

---

## 3단계: Parallels + FineReader Hot Folder 설정

### Parallels 공유 폴더
1. **Parallels Desktop** > Windows 11 VM 설정
2. **옵션** > **공유** > **Mac 폴더 공유** 활성화
3. iCloud Drive 경로가 Windows에서 접근 가능한지 확인:
   ```
   \\Mac\Home\Library\Mobile Documents\com~apple~CloudDocs\작업파일\_to_ocr
   ```

### FineReader 16 Hot Folder
1. Windows에서 **ABBYY FineReader 16** 실행
2. **Hot Folder** 메뉴 열기
3. 새 작업 생성:
   - **입력 폴더**: `\\Mac\Home\Library\Mobile Documents\com~apple~CloudDocs\작업파일\_to_ocr`
   - **출력 형식**: 검색 가능한 PDF (Searchable PDF)
   - **출력 폴더**: `\\Mac\Home\Library\Mobile Documents\com~apple~CloudDocs\작업파일`
   - **파일 이름**: 원본 이름 + `_OCR` 접미사
   - **처리 후 원본**: 삭제 또는 별도 폴더로 이동
4. **스케줄**: 폴더 감시 (자동 실행)

---

## 검증 체크리스트

- [ ] `_incoming` 폴더에 테스트 파일 복사 후 `_to_ocr`로 이동되는지 확인
- [ ] Parallels VM이 자동 시작되는지 확인
- [ ] Windows Explorer에서 공유 폴더가 열리는지 확인
- [ ] FineReader Hot Folder가 파일을 감지하고 OCR 처리하는지 확인
- [ ] OCR 결과 PDF가 `작업파일/` 폴더에 생성되는지 확인
- [ ] korea.kr에서 테스트 메일 발송 후 전체 파이프라인 동작 확인

## 로그 확인

```bash
# 자동화 로그 확인
cat ~/Library/Mobile\ Documents/com~apple~CloudDocs/작업파일/.hazel_ocr.log

# 실시간 모니터링
tail -f ~/Library/Mobile\ Documents/com~apple~CloudDocs/작업파일/.hazel_ocr.log
```

## 트러블슈팅

| 문제 | 해결 방법 |
|------|-----------|
| Mail 첨부파일 저장 안 됨 | Mail 규칙 활성화 여부, AppleScript 경로 확인 |
| Hazel 규칙 동작 안 함 | Hazel 앱 실행 상태, 폴더 경로, 스크립트 실행 권한 확인 |
| VM 시작 실패 | `prlctl list -a`로 VM 이름 확인, Parallels 라이선스 상태 점검 |
| FineReader 미감지 | Hot Folder 설정의 입력 경로, 스케줄 상태 확인 |
| 한글 OCR 품질 낮음 | FineReader 인식 언어에 "한국어" 추가 |
