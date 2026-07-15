#!/usr/bin/env bash
#
# ft-edit-save 일일 실행 러너.
# launchd(맥) 또는 cron이 이 스크립트를 매일 호출한다.
# 로컬에서 이미 작동하는 "ft edit 저장" 명령을 headless(-p) 모드로 1회 실행하고
# 결과를 날짜별 로그에 남긴다.
#
# 수동 테스트:  bash scripts/automation/run.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# ── 설정 로드 (없으면 예시값 폴백) ──────────────────────────────
if [ -f "$SCRIPT_DIR/config.sh" ]; then
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/config.sh"
elif [ -f "$SCRIPT_DIR/config.example.sh" ]; then
  echo "warn: config.sh 없음 — config.example.sh 기본값 사용" >&2
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/config.example.sh"
fi

FT_EDIT_COMMAND="${FT_EDIT_COMMAND:-/ft-edit}"
CLAUDE_BIN="${CLAUDE_BIN:-claude}"
CLAUDE_FLAGS="${CLAUDE_FLAGS:---permission-mode acceptEdits}"
FT_EDIT_LOG_DIR="${FT_EDIT_LOG_DIR:-$HOME/Library/Logs/ft-edit-save}"
FT_EDIT_GIT_PULL="${FT_EDIT_GIT_PULL:-0}"

mkdir -p "$FT_EDIT_LOG_DIR"
DATE="$(date +%Y-%m-%d)"
LOG="$FT_EDIT_LOG_DIR/$DATE.log"

log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG" >&2; }

# ── 중복 실행 방지 (flock 있으면 사용) ──────────────────────────
LOCK="$FT_EDIT_LOG_DIR/.run.lock"
if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK"
  if ! flock -n 9; then
    log "이미 실행 중 — 이번 회차 건너뜀"
    exit 0
  fi
fi

{
  echo "════════════════════════════════════════════════════"
  echo "ft-edit-save 시작: $(date '+%Y-%m-%d %H:%M:%S %z')"
  echo "repo    : $REPO_ROOT"
  echo "command : $FT_EDIT_COMMAND"
  echo "flags   : $CLAUDE_FLAGS"
  echo "════════════════════════════════════════════════════"
} >>"$LOG"

cd "$REPO_ROOT"

# ── claude CLI 확인 ─────────────────────────────────────────────
if ! command -v "$CLAUDE_BIN" >/dev/null 2>&1 && [ ! -x "$CLAUDE_BIN" ]; then
  log "ERROR: claude CLI를 찾을 수 없음 ($CLAUDE_BIN). config.sh의 CLAUDE_BIN을 절대경로로 설정할 것."
  exit 127
fi

# ── 선택: 최신 코드로 갱신 ──────────────────────────────────────
if [ "$FT_EDIT_GIT_PULL" = "1" ] && [ -d "$REPO_ROOT/.git" ]; then
  log "git pull ..."
  git -C "$REPO_ROOT" pull --ff-only >>"$LOG" 2>&1 || log "git pull 실패 — 계속 진행"
fi

# ── 본 실행 ─────────────────────────────────────────────────────
log "claude 실행 중 ..."
set +e
# shellcheck disable=SC2086
"$CLAUDE_BIN" -p "$FT_EDIT_COMMAND" $CLAUDE_FLAGS >>"$LOG" 2>&1
status=$?
set -e

if [ "$status" -eq 0 ]; then
  log "완료 (exit 0)"
else
  log "실패 (exit $status) — 로그 확인: $LOG"
fi

echo "" >>"$LOG"
exit "$status"
