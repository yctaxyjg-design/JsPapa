#!/bin/bash
# hazel_enqueue_to_ocr.sh
# Hazel rule action: _incoming 폴더의 파일을 _to_ocr로 이동하고
# Parallels Windows 11 VM을 시작하여 FineReader OCR 처리 준비
#
# Hazel 설정:
#   1. 감시 폴더: ~/Library/Mobile Documents/com~apple~CloudDocs/작업파일/_incoming
#   2. 조건: 파일이 추가됨 (Any file)
#   3. 동작: "Run shell script" → 이 스크립트, "Pass as argument" 체크

set -euo pipefail

# ──────────────────────────────────────────────
# 경로 설정
# ──────────────────────────────────────────────
ICLOUD_BASE="$HOME/Library/Mobile Documents/com~apple~CloudDocs/작업파일"
INCOMING_DIR="$ICLOUD_BASE/_incoming"
TO_OCR_DIR="$ICLOUD_BASE/_to_ocr"
LOG_FILE="$ICLOUD_BASE/.hazel_ocr.log"

# Parallels VM 이름
VM_NAME="Windows 11"

# ──────────────────────────────────────────────
# 로깅 함수
# ──────────────────────────────────────────────
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
}

# ──────────────────────────────────────────────
# _to_ocr 폴더 생성 (없으면)
# ──────────────────────────────────────────────
if [ ! -d "$TO_OCR_DIR" ]; then
    mkdir -p "$TO_OCR_DIR"
    log "Created directory: $TO_OCR_DIR"
fi

# ──────────────────────────────────────────────
# 파일 이동 (Hazel이 전달한 파일 또는 _incoming 전체)
# ──────────────────────────────────────────────
if [ $# -ge 1 ] && [ -f "$1" ]; then
    # Hazel이 개별 파일을 인자로 전달한 경우
    FILENAME=$(basename "$1")
    mv "$1" "$TO_OCR_DIR/$FILENAME"
    log "Moved file: $FILENAME -> _to_ocr"
else
    # 인자 없이 실행된 경우: _incoming 내 모든 파일 이동
    FILE_COUNT=0
    for f in "$INCOMING_DIR"/*; do
        [ -f "$f" ] || continue
        FILENAME=$(basename "$f")
        mv "$f" "$TO_OCR_DIR/$FILENAME"
        log "Moved file: $FILENAME -> _to_ocr"
        FILE_COUNT=$((FILE_COUNT + 1))
    done

    if [ "$FILE_COUNT" -eq 0 ]; then
        log "No files found in _incoming. Skipping."
        exit 0
    fi

    log "Moved $FILE_COUNT file(s) to _to_ocr"
fi

# ──────────────────────────────────────────────
# Parallels VM 시작 (이미 실행 중이면 스킵)
# ──────────────────────────────────────────────
if command -v prlctl &> /dev/null; then
    VM_STATUS=$(prlctl status "$VM_NAME" 2>/dev/null | awk '{print $NF}' || echo "unknown")

    if [ "$VM_STATUS" != "running" ]; then
        log "Starting VM: $VM_NAME"
        prlctl start "$VM_NAME"

        # VM이 완전히 부팅될 때까지 대기 (최대 120초)
        WAIT_SEC=0
        MAX_WAIT=120
        while [ "$WAIT_SEC" -lt "$MAX_WAIT" ]; do
            TOOLS_STATE=$(prlctl status "$VM_NAME" 2>/dev/null | grep -c "running" || true)
            if [ "$TOOLS_STATE" -ge 1 ]; then
                log "VM started successfully after ${WAIT_SEC}s"
                break
            fi
            sleep 5
            WAIT_SEC=$((WAIT_SEC + 5))
        done

        if [ "$WAIT_SEC" -ge "$MAX_WAIT" ]; then
            log "WARNING: VM did not start within ${MAX_WAIT}s"
        fi
    else
        log "VM already running: $VM_NAME"
    fi

    # Windows 공유 폴더 열기 (Parallels 공유 폴더 기능 활용)
    # _to_ocr 폴더가 Windows에서 접근 가능하도록 공유됨
    prlctl exec "$VM_NAME" cmd /c "explorer \\\\Mac\\Home\\Library\\Mobile Documents\\com~apple~CloudDocs\\작업파일\\_to_ocr" 2>/dev/null || true
    log "Opened shared folder in Windows Explorer"
else
    log "ERROR: prlctl not found. Parallels Desktop is not installed."
    exit 1
fi

log "Enqueue complete. Waiting for FineReader Hot Folder to process."
