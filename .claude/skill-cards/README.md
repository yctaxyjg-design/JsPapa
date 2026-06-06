# Skill Cards & 보안 점검 (NVIDIA Verified Agent Skills 방식)

이 폴더는 이 저장소의 Claude Code 스킬들을 **NVIDIA Verified Agent Skills** 거버넌스
방법론으로 문서화·점검한 산출물을 담는다. 목표는 스킬을 *신뢰·재사용·안전 배포* 가능한
형태로 유지하는 것.

> 배경 기사: [NVIDIA-Verified Agent Skills Provide Capability Governance for AI Agents](https://developer.nvidia.com/blog/nvidia-verified-agent-skills-provide-capability-governance-for-ai-agents/)
> 오픈 스펙: [agentskills.io](https://agentskills.io) — 같은 `SKILL.md`가 Claude Code / Codex / Cursor 호환.
> 카탈로그: [github.com/NVIDIA/skills](https://github.com/nvidia/skills/)

## 구성요소

NVIDIA의 publishing flow를 개인 저장소 규모로 축소 적용한 것:

| NVIDIA 구성요소 | 이 저장소의 대응물 |
|---|---|
| **Skill Card** (소유·의존성·한계·검증상태 머신 리더블 문서) | `<skill>.card.yaml` |
| **SkillSpector** (16개 카테고리 위험 스캔) | `<skill>.security-review.md` (수동 체크리스트) |
| 암호화 서명 | 미적용(개인 저장소) — `verification.signed: false`로 명시 |
| 데일리 카탈로그 동기화 | 해당 없음 |

## 현재 등록된 스킬

- `economist-weekly` — [Skill Card](economist-weekly.card.yaml) · [보안 점검](economist-weekly.security-review.md)
  - 종합 판정: **PASS** (주의 2건, 후속조치 반영됨)

## 새 스킬 추가 절차

1. `<skill>.card.yaml` 작성 — `economist-weekly.card.yaml`을 템플릿으로 복사.
   - 핵심 필드: `ownership`, `dependencies`(특히 `third_party_packages`), `permissions`,
     `limitations`, `guardrails`, `verification`.
2. `<skill>.security-review.md` 작성 — 아래 16개 카테고리로 점검.
3. 이 README의 "현재 등록된 스킬" 표 갱신.

### SkillSpector 16개 점검 카테고리

**통상 SW 위험 (8)**
1. 취약한 의존성 2. 의심스러운 스크립트 3. 위험한 코드 패턴 4. 자격증명 노출
5. 데이터 유출 경로 6. 파일시스템 영향 범위 7. 네트워크 정책 8. 입력 검증

**에이전트 고유 위험 (8)**
1. 숨은 지시문 2. 프롬프트 인젝션 3. 툴 포이즈닝 4. 과도한 권한
5. 권한 상승/범위 이탈 6. 의도-동작 불일치 7. 데이터 거버넌스 8. 출처·재현성

> `verification.status`는 정직하게 표기할 것: 자가 점검은 `self-verified`, 외부 도구로
> 자동 스캔하기 전엔 `signed: false`. NVIDIA-verified가 아닌 것을 verified로 표기 금지.
