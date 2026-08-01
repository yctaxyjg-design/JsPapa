#!/usr/bin/env bash
#
# ft-edit-save 를 macOS launchd LaunchAgent 로 등록해 매일 자동 실행되게 한다.
# config.sh 의 시각/명령을 읽어 plist를 생성하고 로드한다.
#
# 사용:  bash scripts/automation/install.sh
# 제거:  bash scripts/automation/uninstall.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LABEL="com.jspapa.ft-edit-save"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

if [ "$(uname)" != "Darwin" ]; then
  echo "이 스크립트는 macOS(launchd) 전용이다. 리눅스는 README의 cron 방식을 사용할 것." >&2
  exit 1
fi

# ── 설정 로드 ───────────────────────────────────────────────────
if [ ! -f "$SCRIPT_DIR/config.sh" ]; then
  echo "config.sh 가 없다. 먼저 만들어라:" >&2
  echo "  cp scripts/automation/config.example.sh scripts/automation/config.sh" >&2
  echo "  # 그 뒤 FT_EDIT_COMMAND / 시각 / CLAUDE_BIN 을 채운다" >&2
  exit 1
fi
# shellcheck disable=SC1091
source "$SCRIPT_DIR/config.sh"

HOUR="${FT_EDIT_HOUR:-7}"
MINUTE="${FT_EDIT_MINUTE:-30}"
LOG_DIR="${FT_EDIT_LOG_DIR:-$HOME/Library/Logs/ft-edit-save}"
mkdir -p "$LOG_DIR" "$HOME/Library/LaunchAgents"

# launchd가 claude/git/node를 찾을 수 있도록 PATH를 넉넉히 구성
PATH_LINE="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.local/bin:$HOME/.npm-global/bin"

# plist의 <string> 값에 들어갈 동적 경로를 XML 이스케이프한다.
# (경로/홈디렉터리에 &, <, > 가 있으면 plist가 깨져 launchctl bootstrap이 거부됨)
xml_escape() {
  # & 를 가장 먼저 (뒤 규칙이 만든 &amp;/&lt;/&gt; 를 다시 안 건드리게).
  # sed 치환에서 리터럴 & 는 \& 로 이스케이프한다.
  printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'
}

E_RUN="$(xml_escape "$SCRIPT_DIR/run.sh")"
E_REPO="$(xml_escape "$REPO_ROOT")"
E_PATH="$(xml_escape "$PATH_LINE")"
E_HOME="$(xml_escape "$HOME")"
E_OUT="$(xml_escape "$LOG_DIR/launchd.out.log")"
E_ERR="$(xml_escape "$LOG_DIR/launchd.err.log")"

cat >"$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$LABEL</string>

    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$E_RUN</string>
    </array>

    <key>WorkingDirectory</key>
    <string>$E_REPO</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>$E_PATH</string>
        <key>HOME</key>
        <string>$E_HOME</string>
    </dict>

    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>$HOUR</integer>
        <key>Minute</key>
        <integer>$MINUTE</integer>
    </dict>

    <key>StandardOutPath</key>
    <string>$E_OUT</string>
    <key>StandardErrorPath</key>
    <string>$E_ERR</string>

    <key>ProcessType</key>
    <string>Background</string>

    <!-- 로드 시(부팅/로그인 직후) 실행 → 전원이 꺼져 예정 시각을 놓친 날을 따라잡는다(catch-up).
         run.sh의 "하루 1회·예정 시각 이후" 가드가 중복/조기 실행을 막는다. -->
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
PLIST_EOF

echo "plist 생성: $PLIST"

# 설치 시각이 오늘 예정 시각을 이미 지났다면, 방금 켠 RunAtLoad가 지금 즉시 한 번
# 실행하는 것을 막기 위해 오늘 날짜 스탬프를 심는다("오늘 몫은 처리됨" 표시).
# → 캐치업은 내일 예정 시각부터 정상 동작. (즉시 테스트는 run.sh --force 사용)
STAMP="$LOG_DIR/.last-success-date"
now_hm=$((10#$(date +%H%M)))
sched_hm=$((10#$HOUR * 100 + 10#$MINUTE))
if [ "$now_hm" -ge "$sched_hm" ] && [ ! -f "$STAMP" ]; then
  date +%Y-%m-%d >"$STAMP"
  echo "ℹ️  설치 시각이 오늘 예정 시각을 지남 — 오늘 회차는 건너뛰고 내일부터 실행."
fi

# 기존 로드 해제 후 재로드 (idempotent)
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/$LABEL" 2>/dev/null || true

echo "✅ 등록 완료 — 매일 $(printf '%02d:%02d' "$HOUR" "$MINUTE")에 실행된다."
echo ""
echo "지금 바로 한 번 테스트(가드 우회):"
echo "  bash \"$SCRIPT_DIR/run.sh\" --force"
echo "로그:"
echo "  tail -f \"$LOG_DIR/$(date +%Y-%m-%d).log\""
echo "상태 확인:"
echo "  launchctl print gui/$(id -u)/$LABEL | grep -E 'state|last exit'"
