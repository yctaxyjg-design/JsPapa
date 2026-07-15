#!/usr/bin/env bash
#
# ft-edit-save launchd LaunchAgent 제거.
set -euo pipefail

LABEL="com.jspapa.ft-edit-save"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

if [ "$(uname)" != "Darwin" ]; then
  echo "macOS 전용. cron으로 등록했다면 'crontab -e'에서 직접 제거할 것." >&2
  exit 1
fi

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$PLIST"
echo "🧹 제거 완료 — 자동 실행이 중지됐다. (로그는 남아있음)"
