# ft-edit-save 일일 자동화

로컬에서 이미 작동하는 **"ft edit 저장"** 명령(예: `/ft-edit`, `/economist-weekly`)을
매일 정해진 시각에 **자동으로 1회 실행**한다. 실행 엔진은 `claude` CLI의 headless 모드
(`claude -p "<명령>"`)이고, 스케줄러는 macOS `launchd`다.

빠져 있던 조각은 "매일 반복(스케줄)"뿐이라, 명령 자체는 그대로 두고 스케줄만 얹는다.

## 구성 파일

| 파일 | 역할 |
|------|------|
| `config.example.sh` | 설정 템플릿 (커밋됨) |
| `config.sh`         | 실제 설정 — 명령/시각/CLI 경로 (커밋 안 됨, `.gitignore`) |
| `run.sh`            | 매일 호출되는 러너. claude를 headless로 실행 + 로그 |
| `install.sh`        | `config.sh`를 읽어 launchd plist 생성·등록 |
| `uninstall.sh`      | 자동 실행 해제 |

## 설치 (맥에서 3단계)

```bash
# 1) 설정 파일 만들기
cp scripts/automation/config.example.sh scripts/automation/config.sh
#    편집: FT_EDIT_COMMAND(매일 돌릴 명령), 시각(HOUR/MINUTE),
#          CLAUDE_BIN(= `which claude` 절대경로) 를 채운다.

# 2) launchd 등록 (매일 자동 실행)
bash scripts/automation/install.sh

# 3) 즉시 한 번 테스트 (하루 1회 가드 우회)
bash scripts/automation/run.sh --force
tail -f "$HOME/Library/Logs/ft-edit-save/$(date +%Y-%m-%d).log"
```

## 동작 방식

- `install.sh`가 `~/Library/LaunchAgents/com.jspapa.ft-edit-save.plist`를 만들고
  `StartCalendarInterval`로 매일 `HOUR:MINUTE`에 `run.sh`를 실행하도록 등록한다.
- **잠자기 캐치업:** 맥이 그 시각에 잠자기였다면 launchd가 깨어난 직후 놓친 회차를 실행한다
  (`StartCalendarInterval` 기본 동작).
- **전원 OFF 캐치업:** 맥이 예정 시각에 **완전히 꺼져 있었다면** `StartCalendarInterval`은
  그 회차를 큐잉하지 못한다. 이를 위해 plist에 `RunAtLoad=true`를 두어 **다음 부팅/로그인 직후**
  `run.sh`를 실행하고, 그날치를 따라잡는다.
- **하루 1회 보장:** `run.sh`는 성공한 날짜를 `~/Library/Logs/ft-edit-save/.last-success-date`에
  기록한다. 이미 오늘 성공했으면 건너뛰고(중복 방지), **예정 시각 이전**의 로그인에서는 실행하지
  않는다(조기 실행 방지). 실패한 날은 스탬프를 남기지 않아 다음 트리거에서 재시도한다.
- `run.sh`는 `claude -p "$FT_EDIT_COMMAND" $CLAUDE_FLAGS`를 실행하고
  같은 로그 파일에 전 과정을 남긴다. `flock`으로 동시 실행도 막는다.
- 즉시 테스트는 위 가드를 우회하는 `run.sh --force`를 쓴다.
  (`launchctl kickstart`는 실제 launchd 경로로 트리거하지만 "하루 1회" 가드의 영향을 받는다.)

## 무인 실행 시 권한(중요)

`claude -p`는 대화형 권한 프롬프트가 뜨면 무인 실행에서 멈춘다. 두 가지 방법:

1. **권장(안전):** `CLAUDE_FLAGS="--permission-mode acceptEdits"` + 필요한 도구를
   `.claude/settings.json`의 `allow`에 미리 등록. (이 저장소는 economist용 WebFetch·bash가
   이미 등록돼 있다. FT 등 새 도메인을 쓰면 그 도메인도 allow에 추가할 것.)
2. **완전 무인(주의):** `CLAUDE_FLAGS="--dangerously-skip-permissions"`.
   개인 로컬 머신 + 신뢰하는 명령에만 사용.

## 시각·명령 바꾸기

`config.sh`를 고친 뒤 `install.sh`를 다시 실행하면 plist가 갱신된다.

```bash
bash scripts/automation/install.sh   # 재등록(idempotent)
```

## 상태 확인 / 중지

```bash
# 등록 상태·마지막 종료코드
launchctl print gui/$(id -u)/com.jspapa.ft-edit-save | grep -E 'state|last exit'

# 자동 실행 중지 + 제거
bash scripts/automation/uninstall.sh
```

## 리눅스(cron) 대안

launchd가 없는 환경이면 `run.sh`를 cron에 걸면 된다:

```cron
# 매일 07:30 실행 (경로는 실제 저장소 위치로)
30 7 * * * /bin/bash /path/to/JsPapa/scripts/automation/run.sh >/dev/null 2>&1
```

`config.sh`의 `FT_EDIT_LOG_DIR`를 리눅스 경로(예: `$HOME/.local/log/ft-edit-save`)로
바꾸는 것을 잊지 말 것.
