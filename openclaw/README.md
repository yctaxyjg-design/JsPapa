# OpenClaw 로컬 LLM 두뇌 교체 가이드 — 맥미니 M4 Pro 48GB (12CPU / 16GPU)

맥미니 M4 Pro(48GB 통합메모리, 메모리 대역폭 273GB/s)에서 OpenClaw의 로컬 두뇌로 쓸 수 있는
모델을 성능(속도 × 품질 × 툴콜링 신뢰도) 기준으로 선별한 가이드입니다.

## 전제 조건 (OpenClaw 로컬 모델 요구사항)

- **컨텍스트 창 최소 64K** — OpenClaw 시스템 프롬프트만 약 17K 토큰이고, KV 캐시가 4–8GB를 추가로 사용합니다.
- **툴콜링 신뢰도가 최우선** — OpenClaw의 에이전트 루프는 함수 호출이 깨지면 동작하지 않습니다.
- **백엔드는 LM Studio(MLX) 권장** — Ollama의 OpenAI 호환(`/v1`) 엔드포인트는 스트리밍 시
  `tool_calls` 델타가 제대로 안 나오는 문제가 있습니다. Ollama를 쓸 경우 `/v1`을 뺀
  네이티브 URL(`http://127.0.0.1:11434`)을 사용하세요.
- 48GB 중 GPU가 쓸 수 있는 메모리는 기본 약 36GB(75%) — 모델 가중치 + 64K KV 캐시가 이 안에 들어가야 합니다.

## 추천 모델 (우선순위 순)

| 순위 | 모델 | 방식 | 용량(디스크) | 예상 속도(M4 Pro) | 특징 |
|---|---|---|---|---|---|
| 🥇 | **Qwen3.6-35B-A3B** (MLX 4~6bit) | MoE, 활성 3B | ~20–28GB | **50–90 tok/s** | 2026년 32–48GB 맥의 기본값. 262K 컨텍스트, 툴콜링 안정적, 속도·품질 균형 최고 |
| 🥈 | **Qwen3.6-27B** (dense, 4bit) | Dense 27B | ~15GB | 15–25 tok/s | SWE-bench Verified 77.2%, Terminal-Bench 59.3% — 품질 최우선일 때. 느리지만 가장 똑똑함 |
| 🥉 | **GPT-OSS-20B** (MXFP4) | MoE 리즈닝 | ~13GB | 40–60 tok/s | OpenAI 오픈웨이트. 에이전트/툴 사용에 강하고 가벼움. 리즈닝 강도 조절 가능 |
| 4 | **Gemma 4 27B / 26B-A4B** | Dense/MoE | ~16GB | 20–60 tok/s | 다국어(한국어) 강점, 256K 컨텍스트, Apache 2.0 |
| 5 | **Devstral-Small-2-24B** (Q4_K_M) | Dense 24B | ~14GB | ~13–20 tok/s | OpenClaw 실사용자 프로덕션 검증 사례. 툴콜링 안정성 좋음 |

### 결론 — 무엇으로 교체할까?

- **일상 어시스턴트 + 빠른 응답**: `Qwen3.6-35B-A3B` (기본 추천). MoE라 활성 파라미터가 3B뿐이어서
  273GB/s 대역폭의 M4 Pro에서도 체감 속도가 클라우드급입니다. 48GB면 6bit 양자화 + 128K 컨텍스트 여유.
- **코딩·복잡한 작업 위주**: `Qwen3.6-27B` dense. 속도를 양보하고 품질을 얻습니다.
- **가볍게 + 다른 앱과 메모리 공유**: `GPT-OSS-20B`. 13GB라 여유 메모리가 크게 남습니다.
- **한국어 대화 비중이 높다면**: Qwen 계열이 201개 언어를 지원해 한국어도 좋지만,
  `Gemma 4 27B`도 한국어 자연스러움에서 강력한 대안입니다.

## 교체 방법

### 1) 원클릭 스크립트 (이 레포 제공)

맥미니 터미널에서 레포 체크아웃 없이 바로 실행 (🥇 Qwen3.6-35B-A3B로 교체):

```bash
curl -fsSL https://raw.githubusercontent.com/yctaxyjg-design/JsPapa/main/openclaw/switch-brain.sh | bash -s qwen-moe
```

또는 레포를 받아서:

```bash
git pull
./openclaw/switch-brain.sh qwen-moe     # 🥇 Qwen3.6-35B-A3B (기본 추천)
./openclaw/switch-brain.sh qwen-dense   # 🥈 Qwen3.6-27B
./openclaw/switch-brain.sh gpt-oss      # 🥉 GPT-OSS-20B
./openclaw/switch-brain.sh gemma        # Gemma 4 27B
```

스크립트는 LM Studio CLI(`lms`)가 있으면 MLX 모델을, 없으면 Ollama로 GGUF 모델을 받은 뒤
`~/.openclaw/openclaw.json`의 provider/기본 모델을 교체하고 게이트웨이 재시작을 안내합니다.
기존 설정은 `openclaw.json.bak-<timestamp>`로 백업됩니다.

### 2) 수동 설정

`~/.openclaw/openclaw.json` 예시는 [`openclaw.local.sample.json`](./openclaw.local.sample.json) 참고.
핵심:

- LM Studio: `baseUrl: "http://127.0.0.1:1234/v1"`, `api: "openai-completions"`
- Ollama: `baseUrl: "http://127.0.0.1:11434"` (**`/v1` 붙이면 툴콜링 깨짐**)
- 모델별 `contextWindow`는 최소 65536, 여유 되면 131072
- Ollama 사용 시 `OLLAMA_CONTEXT_LENGTH=65536` 이상으로 로드해야 실제 컨텍스트가 늘어납니다

## 성능 팁

- **MLX ≫ llama.cpp**: 애플 실리콘에서 MLX가 통상 10–30% 빠릅니다. LM Studio에서 모델 받을 때 MLX 포맷 선택.
- **GPU 메모리 한도 상향** (48GB 중 기본 ~36GB → 40GB):
  `sudo sysctl iogpu.wired_limit_mb=40960`
- **KV 캐시 양자화**(LM Studio 설정에서 8bit)로 긴 컨텍스트 메모리 절약.
- MoE 모델은 대역폭 병목이 작아 M4 Pro(273GB/s)에서 dense 대비 3–5배 빠릅니다. 속도가 답답하면 무조건 MoE.

## 이미지 생성 붙이기 (ComfyUI + Civitai 모델)

OpenClaw의 공식 ComfyUI 연동(comfy 스킬)을 쓰면 오픈클로가 자연어로 로컬 이미지 생성을 합니다.
Civitai는 설치하는 프로그램이 아니라 모델 공유 사이트로, 받은 체크포인트/LoRA를
`~/ComfyUI/models/checkpoints/`(또는 `loras/`)에 넣으면 사용 가능합니다.

```bash
./openclaw/setup-image-gen.sh                     # ComfyUI 설치 + SDXL 기본 모델 + OpenClaw 연동
./openclaw/setup-image-gen.sh --no-model --civitai <버전ID>   # Civitai 모델로 시작
```

완료 후 `~/ComfyUI/start.sh`로 서버를 켜고 `openclaw gateway restart` 하면
"~그림 그려줘"에 오픈클로가 ComfyUI API(`http://127.0.0.1:8188`)를 호출합니다.
기본 워크플로는 [`comfyui-workflow-t2i.json`](./comfyui-workflow-t2i.json)
(프롬프트 노드 `6`, 출력 노드 `9`)이며 Civitai 모델을 쓰려면 `ckpt_name`만 바꾸면 됩니다.

- 48GB에서 LLM(Qwen3.6-35B-A3B ~20GB) + SDXL(~7GB) 동시 상주 가능. Flux Dev(~16GB)는 이미지 생성 시에만 로드 권장.
- 손으로 빠르게 뽑을 땐 앱스토어의 **Draw Things**(무료, 애플 실리콘 최적화로 ComfyUI보다 20%~3배 빠름)가 편하지만, 오픈클로 연동은 ComfyUI가 공식 지원이라 매끄럽습니다.

## 참고 자료

- [OpenClaw 공식: Local models](https://docs.openclaw.ai/gateway/local-models) · [Ollama provider](https://docs.openclaw.ai/providers/ollama) · [LM Studio provider](https://docs.openclaw.ai/providers/lmstudio)
- [Best Local LLM for OpenClaw 2026 (haimaker.ai)](https://haimaker.ai/blog/best-local-models-for-openclaw/)
- [Best Local LLMs for OpenClaw — rentamac.io](https://rentamac.io/best-local-llms-openclaw/)
- [Qwen3.6-35B-A3B 공식 블로그](https://qwen.ai/blog?id=qwen3.6-35b-a3b) · [Hugging Face](https://huggingface.co/Qwen/Qwen3.6-35B-A3B)
- [Best Local LLMs for Mac 2026 (InsiderLLM)](https://insiderllm.com/guides/best-local-llms-mac-2026/)
- [Mac mini LLM performance 2026 (popularai.org)](https://www.popularai.org/p/mac-mini-llm-performance-in-2026)
