#!/usr/bin/env bash
#
# ft-edit-save 일일 실행 러너.
# launchd(맥)가 두 경로로 이 스크립트를 부른다:
#   ① 매일 예정 시각 (StartCalendarInterval)
#   ② 부팅/로그인 직후 (RunAtLoad) — 전원이 꺼져 있어 놓친 회차를 따라잡기(catch-up) 위함
# "하루 1회" 보장을 위해 성공 날짜 스탬프로 중복 실행과 예정 시각 이전 실행을 막는다.
#
# 수동 즉시 테스트(가드 우회):  bash scripts/automation/run.sh --force
set -euo pipefail

FORCE=0
case "${1:-}" in
  -f | --force) FORCE=1 ;;
esac

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

FT_EDIT_COMMAND="${FT_EDIT_COMMAND:-/ftedit-crosscheck}"
CLAUDE_BIN="${CLAUDE_BIN:-claude}"
CLAUDE_FLAGS="${CLAUDE_FLAGS:---permission-mode acceptEdits}"
FT_EDIT_LOG_DIR="${FT_EDIT_LOG_DIR:-$HOME/Library/Logs/ft-edit-save}"
FT_EDIT_GIT_PULL="${FT_EDIT_GIT_PULL:-0}"
FT_EDIT_HOUR="${FT_EDIT_HOUR:-7}"
FT_EDIT_MINUTE="${FT_EDIT_MINUTE:-30}"

mkdir -p "$FT_EDIT_LOG_DIR"
DATE="$(date +%Y-%m-%d)"
LOG="$FT_EDIT_LOG_DIR/$DATE.log"
STAMP="$FT_EDIT_LOG_DIR/.last-success-date"

log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG" >&2; }

# ── 하루 1회 / 예정 시각 이후 가드 (--force는 우회) ─────────────
# RunAtLoad와 StartCalendarInterval 두 경로가 같은 날 겹쳐 부르거나,
# 예정 시각 이전 로그인에서 RunAtLoad가 조기 발화하는 것을 막는다.
if [ "$FORCE" -ne 1 ]; then
  if [ -f "$STAMP" ] && [ "$(cat "$STAMP" 2>/dev/null)" = "$DATE" ]; then
    log "오늘 이미 성공적으로 실행됨 — 건너뜀"
    exit 0
  fi
  now_hm=$((10#$(date +%H%M)))
  sched_hm=$((10#$FT_EDIT_HOUR * 100 + 10#$FT_EDIT_MINUTE))
  if [ "$now_hm" -lt "$sched_hm" ]; then
    log "예정 시각($(printf '%02d:%02d' "$FT_EDIT_HOUR" "$FT_EDIT_MINUTE")) 이전 — 캐치업 조건 아님, 건너뜀"
    exit 0
  fi
fi

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
  echo "$DATE" >"$STAMP" # 성공한 날만 스탬프 → 실패 시 다음 트리거(캐치업)에서 재시도
  log "완료 (exit 0)"
else
  log "실패 (exit $status) — 로그 확인: $LOG"
fi

echo "" >>"$LOG"
exit "$status"
