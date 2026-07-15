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

cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$LABEL</string>

    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$SCRIPT_DIR/run.sh</string>
    </array>

    <key>WorkingDirectory</key>
    <string>$REPO_ROOT</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>$PATH_LINE</string>
        <key>HOME</key>
        <string>$HOME</string>
    </dict>

    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>$HOUR</integer>
        <key>Minute</key>
        <integer>$MINUTE</integer>
    </dict>

    <key>StandardOutPath</key>
    <string>$LOG_DIR/launchd.out.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/launchd.err.log</string>

    <key>ProcessType</key>
    <string>Background</string>
    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
PLIST_EOF

echo "plist 생성: $PLIST"

# 기존 로드 해제 후 재로드 (idempotent)
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/$LABEL" 2>/dev/null || true

echo "✅ 등록 완료 — 매일 $(printf '%02d:%02d' "$HOUR" "$MINUTE")에 실행된다."
echo ""
echo "지금 바로 한 번 테스트:"
echo "  launchctl kickstart -k gui/$(id -u)/$LABEL"
echo "로그:"
echo "  tail -f \"$LOG_DIR/$(date +%Y-%m-%d).log\""
echo "상태 확인:"
echo "  launchctl print gui/$(id -u)/$LABEL | grep -E 'state|last exit'"
