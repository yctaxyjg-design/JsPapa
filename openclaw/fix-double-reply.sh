#!/usr/bin/env bash
# OpenClaw 텔레그램 이중 답장(같은 답이 2번씩 옴) 진단·수리 스크립트 — macOS용
#
# 증상: 텔레그램에서 봇이 모든 메시지에 똑같은 답을 정확히 2번씩 보냄.
# 원인 1순위: 게이트웨이 프로세스가 2개 떠 있음 (launchd 서비스 + 수동 실행 중복 등)
#             → 두 프로세스가 같은 봇 토큰으로 폴링하면서 같은 메시지를 각자 처리.
#
# 사용법:
#   ./fix-double-reply.sh          # 진단만 (아무것도 죽이지 않음)
#   ./fix-double-reply.sh --fix    # 중복 프로세스 정리 후 게이트웨이 1개로 재시작
set -uo pipefail

FIX=false
[ "${1:-}" = "--fix" ] && FIX=true

CONFIG="${OPENCLAW_CONFIG:-$HOME/.openclaw/openclaw.json}"
ISSUES=0

echo "── 1. 게이트웨이 프로세스 개수 확인 ──────────────────────"
# 이 스크립트 자신과 grep은 제외
PIDS=$(pgrep -f '[o]penclaw.*gateway|[c]lawdbot.*gateway' || true)
COUNT=$(echo "$PIDS" | grep -c . || true)
if [ "$COUNT" -eq 0 ]; then
  echo "  게이트웨이 프로세스가 없습니다. (봇이 응답한다면 다른 기기에서 돌고 있다는 뜻 — 4번 항목 참고)"
elif [ "$COUNT" -eq 1 ]; then
  echo "  ✔ 게이트웨이 1개 — 정상: PID $PIDS"
else
  ISSUES=$((ISSUES+1))
  echo "  ✖ 게이트웨이가 ${COUNT}개 떠 있습니다! ← 이중 답장의 주범"
  ps -o pid,lstart,command -p $(echo "$PIDS" | tr '\n' ' ') 2>/dev/null || true
fi

echo
echo "── 2. launchd 서비스 확인 ────────────────────────────────"
LAUNCHD=$(launchctl list 2>/dev/null | grep -iE 'openclaw|clawdbot|moltbot' || true)
if [ -n "$LAUNCHD" ]; then
  echo "$LAUNCHD" | sed 's/^/  /'
  N_SVC=$(echo "$LAUNCHD" | grep -c . || true)
  if [ "$N_SVC" -gt 1 ]; then
    ISSUES=$((ISSUES+1))
    echo "  ✖ launchd 서비스가 ${N_SVC}개 등록돼 있습니다 (예: 구버전 clawdbot + 신버전 openclaw 동시 등록)."
    echo "    → ~/Library/LaunchAgents/ 에서 안 쓰는 plist를 지우고 launchctl bootout 하세요."
  else
    echo "  ✔ launchd 서비스 1개 — 정상"
  fi
else
  echo "  launchd에 등록된 서비스 없음 (수동 실행 중이거나 다른 방식으로 상주)"
fi

echo
echo "── 3. Docker 컨테이너 확인 ───────────────────────────────"
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  DOCKED=$(docker ps --format '{{.Names}}  {{.Image}}' | grep -iE 'openclaw|clawdbot' || true)
  if [ -n "$DOCKED" ]; then
    ISSUES=$((ISSUES+1))
    echo "  ✖ Docker에서도 게이트웨이가 돌고 있습니다 (네이티브 프로세스와 중복!):"
    echo "$DOCKED" | sed 's/^/    /'
  else
    echo "  ✔ 관련 컨테이너 없음"
  fi
else
  echo "  Docker 미사용 — 통과"
fi

echo
echo "── 4. 같은 봇 토큰을 쓰는 다른 기기 ──────────────────────"
echo "  (자동 감지 불가) 예전 노트북·다른 맥에서 게이트웨이를 켜둔 적이 있다면 그쪽도 확인하세요."
echo "  두 기기가 같은 텔레그램 봇 토큰으로 폴링하면 이중 답장·유실이 무작위로 발생합니다."

echo
echo "── 5. 설정 파일 내 텔레그램 중복 연결 확인 ───────────────"
if [ -f "$CONFIG" ] && command -v node >/dev/null 2>&1; then
  CONFIG="$CONFIG" node <<'EOF'
const fs = require('fs');
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(process.env.CONFIG, 'utf8')); } catch (e) {
  console.log('  설정 파일 파싱 실패 — 건너뜀'); process.exit(0);
}
// 설정 전체에서 botToken이 몇 군데 등장하는지 센다 (같은 토큰이 두 채널/에이전트에 물리면 이중 답장)
const tokens = [];
(function walk(o, path) {
  if (o && typeof o === 'object')
    for (const [k, v] of Object.entries(o))
      if (/botToken|bot_token/i.test(k) && typeof v === 'string') tokens.push(path + '.' + k);
      else walk(v, path + '.' + k);
})(cfg, 'openclaw.json');
if (tokens.length > 1) {
  console.log('  ✖ 봇 토큰이 ' + tokens.length + '군데 설정돼 있습니다:');
  tokens.forEach(t => console.log('    - ' + t));
  console.log('    같은 토큰이 두 곳에 물려 있으면 한 곳만 남기세요.');
} else {
  console.log('  ✔ 텔레그램 연결 설정 중복 없음');
}
EOF
else
  echo "  설정 파일($CONFIG) 없음 또는 node 없음 — 건너뜀"
fi

echo
echo "══════════════════════════════════════════════════════════"
if [ "$ISSUES" -eq 0 ]; then
  echo "프로세스 중복은 발견되지 않았습니다."
  echo "그래도 답이 2번씩 온다면 모델이 스스로 반복하는 경우입니다. 이때는:"
  echo "  1) openclaw logs 로 게이트웨이가 답장을 1번 보냈는지 2번 보냈는지 확인"
  echo "     - 로그에 send가 1번뿐인데 텔레그램엔 2개 → 프로세스/기기 중복 (4번 항목 재확인)"
  echo "     - 로그에도 2번 → 모델 출력 문제 (아래 2·3번)"
  echo "  2) Ollama 사용 시 baseUrl에서 /v1 제거 (네이티브 http://127.0.0.1:11434 사용)"
  echo "     — OpenAI 호환 모드는 스트리밍 시 중복/깨짐이 알려져 있습니다"
  echo "  3) 리즈닝 모델(GPT-OSS 등)은 openclaw.json 모델 항목에 reasoning: true가 맞는지 확인"
  echo "     — 리즈닝 파싱이 어긋나면 사고 과정과 최종 답이 둘 다 전송돼 2번 온 것처럼 보입니다"
  exit 0
fi

if ! $FIX; then
  echo "문제 ${ISSUES}건 발견. 자동으로 정리하려면:  ./fix-double-reply.sh --fix"
  exit 1
fi

echo "--fix: 게이트웨이를 전부 내리고 1개만 다시 올립니다..."
# launchd 서비스가 있으면 launchd가 되살리지 않도록 먼저 내림
if [ -n "$LAUNCHD" ]; then
  echo "$LAUNCHD" | awk '{print $3}' | while read -r label; do
    [ -n "$label" ] && launchctl bootout "gui/$(id -u)/$label" 2>/dev/null && echo "  launchd 서비스 내림: $label"
  done
fi
# 남은 프로세스 정리
pkill -f '[o]penclaw.*gateway|[c]lawdbot.*gateway' 2>/dev/null && sleep 2
pkill -9 -f '[o]penclaw.*gateway|[c]lawdbot.*gateway' 2>/dev/null
echo "  프로세스 정리 완료. 게이트웨이를 1개만 다시 시작합니다..."
if command -v openclaw >/dev/null 2>&1; then
  openclaw gateway restart 2>/dev/null || openclaw gateway start
  echo "✔ 완료. 텔레그램에서 아무 메시지나 보내 답이 1번만 오는지 확인하세요."
else
  echo "openclaw CLI를 찾지 못했습니다. 수동으로 게이트웨이를 시작하세요."
fi
