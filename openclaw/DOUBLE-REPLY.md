# 텔레그램 봇이 같은 답을 2번씩 보낼 때 (이중 답장)

증상: Jarvis(OpenClaw) 봇이 모든 메시지에 **똑같은 답을 정확히 2번, 같은 시각에** 보냄.

```
나:   안녕
봇:   안녕하세요, 주인님.  08:48
봇:   안녕하세요, 주인님.  08:48   ← 중복
```

이 패턴(매번 정확히 ×2, 동시각, 토씨 하나 안 틀림)은 로컬 모델이 말을 반복하는 게 아니라
**게이트웨이가 같은 메시지를 두 번 처리**하고 있다는 신호입니다.

## 빠른 해결

맥미니 터미널에서:

```bash
./openclaw/fix-double-reply.sh          # 진단만
./openclaw/fix-double-reply.sh --fix    # 중복 프로세스 정리 + 게이트웨이 1개로 재시작
```

## 원인 (흔한 순서대로)

### 1. 게이트웨이 프로세스가 2개 떠 있음 — 대부분 이것

launchd 상주 서비스가 이미 돌고 있는데 터미널에서 `openclaw gateway`를 또 실행했거나,
`switch-brain.sh` 후 재시작 과정에서 이전 프로세스가 안 죽고 남은 경우입니다.
두 프로세스가 같은 봇 토큰으로 텔레그램을 폴링하며 같은 메시지에 각자 답합니다.

```bash
pgrep -fl 'openclaw.*gateway'    # 2줄 이상 나오면 이것이 원인
```

### 2. 다른 기기에서도 게이트웨이가 돌고 있음

예전에 노트북·다른 맥에서 설정해 둔 게이트웨이가 같은 봇 토큰으로 켜져 있는 경우.
이때는 중복·유실이 무작위로 섞여 나타나고, 로그에 텔레그램 폴링 충돌이 찍힙니다:

```bash
grep -riE 'conflict|terminated by other' ~/.openclaw/logs | tail   # 나오면 다른 기기 존재
```

그 기기에서 게이트웨이를 끄세요.

### 3. 구버전 + 신버전 서비스가 동시 등록

clawdbot 시절 launchd 서비스와 openclaw 서비스가 둘 다 등록된 경우.
`launchctl list | grep -iE 'openclaw|clawdbot'`로 확인하고 **gateway** 라벨이
2개면 하나만 남기세요. `com.openclaw.ocrrefine` 같은 보조 서비스는 게이트웨이가
아니므로 중복이 아닙니다.

### 4. 모델이 스스로 반복 (위가 전부 아니라면)

`openclaw logs`에서 게이트웨이가 답장을 **1번** 보냈는지 확인하세요.
로그에도 2번 보냈다면 모델 출력 문제입니다:

- **Ollama를 `/v1`(OpenAI 호환)로 연결한 경우** → baseUrl을 네이티브
  `http://127.0.0.1:11434`로 바꾸세요 (README의 알려진 문제).
- **리즈닝 모델(GPT-OSS 등)** → `openclaw.json` 모델 항목에 `reasoning: true`가
  빠지면 사고 과정과 최종 답이 둘 다 전송돼 2번 온 것처럼 보일 수 있습니다.
- 그 외 모델 반복은 온도를 낮추거나(repeat penalty) 다른 프리셋으로 교체
  (`./openclaw/switch-brain.sh qwen-moe`).
