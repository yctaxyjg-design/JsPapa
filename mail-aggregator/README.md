# 통합 메일함 (Mail Aggregator)

여러 메일 서비스(Gmail, 네이버, 다음, Outlook 등)의 받은편지함을 **IMAP**으로 모아서
한 화면에 통합 타임라인으로 보여주고, 설정한 주기(기본 5분)마다 자동으로 새로 동기화하는
로컬 웹앱입니다.

- 계정별 색상 뱃지로 어느 메일함에서 온 메일인지 한눈에 구분
- 읽지 않은 메일 강조 + 계정별 안 읽음 개수 표시
- "전체 / 계정별" 탭 필터, 수동 새로고침 버튼
- 계정 정보(`accounts.json`)는 내 컴퓨터에만 저장되고 git에 커밋되지 않음

## 설치 및 실행

```sh
cd mail-aggregator
npm install

# 1) 계정 설정 파일 만들기
cp accounts.example.json accounts.json
# accounts.json을 열어 실제 계정 정보로 수정

# 2) 실행
npm start
# → http://localhost:3300
```

실제 계정 없이 UI만 먼저 보고 싶다면:

```sh
npm run demo
```

## 계정 설정 (`accounts.json`)

```json
{
  "pollMinutes": 5,
  "messagesPerAccount": 30,
  "accounts": [
    {
      "id": "gmail",
      "label": "Gmail",
      "color": "#ea4335",
      "host": "imap.gmail.com",
      "port": 993,
      "secure": true,
      "user": "you@gmail.com",
      "pass": "앱 비밀번호"
    }
  ]
}
```

| 필드 | 설명 |
| --- | --- |
| `pollMinutes` | 자동 동기화 주기(분). 최소 1 |
| `messagesPerAccount` | 계정마다 가져올 최근 메일 수 |
| `id` | 계정 구분용 고유 문자열 |
| `label` / `color` | 화면에 표시될 이름과 뱃지 색 |
| `host` / `port` / `secure` | IMAP 서버 주소 (보통 993 / true) |
| `user` / `pass` | 로그인 정보 — 아래 "앱 비밀번호" 참고 |

### 서비스별 준비 사항

| 서비스 | IMAP 호스트 | 준비 |
| --- | --- | --- |
| Gmail | `imap.gmail.com` | 2단계 인증 켜고 [앱 비밀번호](https://myaccount.google.com/apppasswords) 발급 |
| 네이버 | `imap.naver.com` | 메일 → 환경설정 → POP3/IMAP 설정에서 IMAP 사용 켜기 |
| 다음 | `imap.daum.net` | 메일 → 환경설정 → IMAP/POP3에서 IMAP 사용 켜기 |
| Outlook | `outlook.office365.com` | Microsoft 계정 → 보안 → 앱 비밀번호 |

> 일반 로그인 비밀번호 대신 반드시 **앱 비밀번호**(서비스가 지원하는 경우)를 쓰세요.
> 유출되어도 해당 앱 비밀번호만 폐기하면 됩니다.

## 보안 주의

- `accounts.json`은 저장소 최상위 `.gitignore`에 등록되어 있어 **커밋되지 않습니다.**
- 서버는 메일을 읽기만 하며(읽음 표시도 바꾸지 않음) 어떤 외부 서버로도 전송하지 않습니다.
- 이 앱은 본인 컴퓨터/집 서버 같은 신뢰할 수 있는 환경에서 돌리는 용도입니다.
  외부에 공개된 서버에 올릴 경우 반드시 인증(리버스 프록시 등)을 앞에 두세요.

## 동작 방식

```
accounts.json ──▶ server.js ──(IMAP, pollMinutes마다)──▶ 각 메일 서버
                     │
                     └─ /api/messages, /api/status, /api/refresh
                                │
                          public/ (웹 UI, 1분마다 화면 갱신)
```

서버가 각 계정의 INBOX에서 최근 메일의 봉투 정보(제목·발신자·날짜·읽음 여부)만
가져와 메모리에 캐시하고, 웹 UI는 이를 합쳐 시간순으로 보여줍니다.
메일 본문은 가져오지 않습니다.
