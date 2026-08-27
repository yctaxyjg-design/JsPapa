# ft-edit-save 자동화 설정 예시
#
# 이 파일을 config.sh 로 복사한 뒤 값을 채워라. config.sh 는 git에 커밋되지 않는다.
#   cp scripts/automation/config.example.sh scripts/automation/config.sh
#
# install.sh 가 이 값들을 읽어 launchd(맥) 스케줄을 생성한다.

# ── 매일 실행할 명령 ─────────────────────────────────────────────
# 로컬에서 이미 작동하는 "ft edit 저장" 슬래시 명령/프롬프트.
# claude CLI에 그대로 `claude -p "<이 값>"` 으로 전달된다.
# 예: "/ft-edit", "/economist-weekly", 또는 자유 프롬프트 문장.
FT_EDIT_COMMAND="/ft-edit"

# ── 실행 시각 (로컬 타임존, 24시간제) ────────────────────────────
FT_EDIT_HOUR=7
FT_EDIT_MINUTE=30

# ── claude CLI 경로 ──────────────────────────────────────────────
# `which claude` 결과. launchd는 로그인 셸 PATH를 못 읽으므로 절대경로 권장.
CLAUDE_BIN="claude"

# ── claude 실행 플래그 ───────────────────────────────────────────
# 무인 실행이라 권한 프롬프트가 뜨면 안 된다. 선택지:
#   1) 아래처럼 필요한 도구만 허용 (권장, 안전):
#        --permission-mode acceptEdits
#      단, settings.json allow 목록에 없는 도구(WebFetch 신규 도메인 등)는
#      여전히 막힐 수 있으니 .claude/settings.json 을 미리 채워둘 것.
#   2) 완전 무인 (주의): --dangerously-skip-permissions
#      로컬 개인 머신 + 신뢰하는 명령에만 사용.
CLAUDE_FLAGS="--permission-mode acceptEdits"

# ── 로그 디렉터리 ────────────────────────────────────────────────
FT_EDIT_LOG_DIR="$HOME/Library/Logs/ft-edit-save"

# ── 실행 전 최신 코드로 갱신할지 (0=끔, 1=git pull) ──────────────
FT_EDIT_GIT_PULL=0
